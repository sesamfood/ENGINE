import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { closedPeriodAround } from "../../lib/count-window";
import { kioskDayTaskValidator } from "./kioskDayValidators";
import { getLocationOpeningHours } from "./countWindow";
import { requireOrganizationLocation } from "./locations";

type KioskDayContext = QueryCtx | MutationCtx;
export type KioskDayPhase = "endOfDay" | "startOfDay";

type KioskDayTask = Infer<typeof kioskDayTaskValidator>;
type ClosedPeriod = ReturnType<typeof closedPeriodAround>;

function normalize(tasks: (string | KioskDayTask)[] | undefined): KioskDayTask[] {
  return (tasks ?? []).map((task) => (typeof task === "string" ? { title: task } : task));
}

export async function getKioskDayTasks(
  ctx: KioskDayContext,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const tasks = await ctx.db
    .query("kioskDayTasks")
    .withIndex("by_organizationId_and_locationId", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", locationId),
    )
    .unique();
  return { endOfDay: normalize(tasks?.endOfDay), startOfDay: normalize(tasks?.startOfDay) };
}

export async function latestRun(
  ctx: KioskDayContext,
  organizationId: string,
  locationId: Id<"locations">,
  phase: KioskDayPhase,
) {
  return await ctx.db
    .query("kioskDayRuns")
    .withIndex("by_organizationId_and_locationId_and_phase", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("locationId", locationId)
        .eq("phase", phase),
    )
    .order("desc")
    .first();
}

// Start of day is due from a completed end of day, or from opening when none was
// done since the last closing, until a later start of day.
function startOfDayDue(
  lastEnd: Doc<"kioskDayRuns"> | null,
  lastStart: Doc<"kioskDayRuns"> | null,
  now: number,
  { closedAt, lastClosedAt }: ClosedPeriod,
) {
  if (lastEnd && (!lastStart || lastStart.completedAt < lastEnd.completedAt)) return true;
  return (
    now < closedAt &&
    lastClosedAt !== null &&
    (!lastStart || lastStart.completedAt < lastClosedAt)
  );
}

async function dayContext(
  ctx: KioskDayContext,
  organizationId: string,
  locationId: Id<"locations">,
  now: number,
) {
  const location = await requireOrganizationLocation(ctx, organizationId, locationId);
  const [{ weekly, specials, timeZone }, lastEnd, lastStart] = await Promise.all([
    getLocationOpeningHours(ctx, organizationId, location),
    latestRun(ctx, organizationId, locationId, "endOfDay"),
    latestRun(ctx, organizationId, locationId, "startOfDay"),
  ]);
  const period = closedPeriodAround(now, weekly, specials, timeZone);
  return { timeZone, period, lastEnd, lastStart };
}

// Pages the kiosk may still write to while start of day is due, or null when not due.
export async function startOfDayAllowedPages(
  ctx: KioskDayContext,
  organizationId: string,
  locationId: Id<"locations">,
  now: number,
) {
  const tasks = await getKioskDayTasks(ctx, organizationId, locationId);
  if (!tasks.startOfDay.length) return null;
  const { period, lastEnd, lastStart } = await dayContext(ctx, organizationId, locationId, now);
  return startOfDayDue(lastEnd, lastStart, now, period)
    ? tasks.startOfDay.flatMap((task) => (task.link ? [task.link] : []))
    : null;
}

export async function kioskDayState(
  ctx: KioskDayContext,
  organizationId: string,
  locationId: Id<"locations">,
  now: number,
  // Treats now as closing time. Only for preview deployments.
  simulateEndOfDay = false,
) {
  const none = { phase: null, tasks: [], scheduledAt: null, timeZone: null };
  const tasks = await getKioskDayTasks(ctx, organizationId, locationId);
  if (!tasks.startOfDay.length && !tasks.endOfDay.length) {
    return { ...none, nextTransitionAt: null };
  }

  const { timeZone, period, lastEnd, lastStart } = await dayContext(
    ctx,
    organizationId,
    locationId,
    now,
  );
  const { closedAt, reopensAt } = period;
  if (tasks.startOfDay.length && startOfDayDue(lastEnd, lastStart, now, period)) {
    return {
      phase: "startOfDay" as const,
      tasks: tasks.startOfDay,
      // The coming opening, or none once the location has opened.
      scheduledAt: now >= closedAt ? reopensAt : null,
      timeZone,
      nextTransitionAt: null,
    };
  }
  // Opening may make start of day due.
  const atOpening = tasks.startOfDay.length ? reopensAt : null;
  if (!tasks.endOfDay.length) {
    return { ...none, nextTransitionAt: now < closedAt ? closedAt : atOpening };
  }
  const endOfDay = {
    phase: "endOfDay" as const,
    tasks: tasks.endOfDay,
    scheduledAt: closedAt,
    timeZone,
  };
  if (simulateEndOfDay) return { ...endOfDay, nextTransitionAt: null };
  if (now < closedAt) return { ...none, nextTransitionAt: closedAt };
  if (lastEnd && lastEnd.completedAt >= closedAt) {
    return { ...none, nextTransitionAt: reopensAt };
  }
  return { ...endOfDay, nextTransitionAt: reopensAt };
}
