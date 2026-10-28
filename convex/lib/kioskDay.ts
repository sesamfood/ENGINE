import type { Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { closedPeriodAround } from "../../lib/count-window";
import { kioskDayTaskValidator } from "./kioskDayValidators";
import { getLocationOpeningHours } from "./countWindow";
import { requireOrganizationLocation } from "./locations";

type KioskDayContext = QueryCtx | MutationCtx;
export type KioskDayPhase = "endOfDay" | "startOfDay";

type KioskDayTask = Infer<typeof kioskDayTaskValidator>;

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

async function latestRun(
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

// Start of day is due from a completed end of day until a later start of day.
async function startOfDayDue(
  ctx: KioskDayContext,
  organizationId: string,
  locationId: Id<"locations">,
  startOfDayTasks: KioskDayTask[],
) {
  if (!startOfDayTasks.length) return { due: false, lastEnd: null };
  const [lastEnd, lastStart] = await Promise.all([
    latestRun(ctx, organizationId, locationId, "endOfDay"),
    latestRun(ctx, organizationId, locationId, "startOfDay"),
  ]);
  return {
    due: Boolean(lastEnd && (!lastStart || lastStart.completedAt < lastEnd.completedAt)),
    lastEnd,
  };
}

// Pages the kiosk may still write to while start of day is due, or null when not due.
export async function startOfDayAllowedPages(
  ctx: KioskDayContext,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const tasks = await getKioskDayTasks(ctx, organizationId, locationId);
  const { due } = await startOfDayDue(ctx, organizationId, locationId, tasks.startOfDay);
  return due ? tasks.startOfDay.flatMap((task) => (task.link ? [task.link] : [])) : null;
}

export async function kioskDayState(
  ctx: KioskDayContext,
  organizationId: string,
  locationId: Id<"locations">,
  now: number,
) {
  const none = { phase: null, tasks: [], scheduledAt: null, timeZone: null };
  const tasks = await getKioskDayTasks(ctx, organizationId, locationId);
  const startOfDay = await startOfDayDue(ctx, organizationId, locationId, tasks.startOfDay);
  if (!startOfDay.due && !tasks.endOfDay.length) {
    return { ...none, nextTransitionAt: null };
  }

  const location = await requireOrganizationLocation(ctx, organizationId, locationId);
  const { weekly, specials, timeZone } = await getLocationOpeningHours(
    ctx,
    organizationId,
    location,
  );
  const { closedAt, reopensAt } = closedPeriodAround(now, weekly, specials, timeZone);
  if (startOfDay.due) {
    return {
      phase: "startOfDay" as const,
      tasks: tasks.startOfDay,
      // The coming opening, or none once the location has opened.
      scheduledAt: now >= closedAt ? reopensAt : null,
      timeZone,
      nextTransitionAt: null,
    };
  }
  const endOfDay = {
    phase: "endOfDay" as const,
    tasks: tasks.endOfDay,
    scheduledAt: closedAt,
    timeZone,
  };
  if (now < closedAt) return { ...none, nextTransitionAt: closedAt };
  const lastEnd =
    startOfDay.lastEnd ?? (await latestRun(ctx, organizationId, locationId, "endOfDay"));
  if (lastEnd && lastEnd.completedAt >= closedAt) {
    return { ...none, nextTransitionAt: reopensAt };
  }
  return { ...endOfDay, nextTransitionAt: reopensAt };
}
