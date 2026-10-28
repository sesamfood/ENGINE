import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { closedPeriodAround } from "../../lib/count-window";
import { getLocationOpeningHours } from "./countWindow";
import { requireOrganizationLocation } from "./locations";

type KioskDayContext = QueryCtx | MutationCtx;
export type KioskDayPhase = "endOfDay" | "startOfDay";

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
  return { endOfDay: tasks?.endOfDay ?? [], startOfDay: tasks?.startOfDay ?? [] };
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
  startOfDayTasks: string[],
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

export async function startOfDayRequired(
  ctx: KioskDayContext,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const tasks = await getKioskDayTasks(ctx, organizationId, locationId);
  return (await startOfDayDue(ctx, organizationId, locationId, tasks.startOfDay)).due;
}

export async function kioskDayState(
  ctx: KioskDayContext,
  organizationId: string,
  locationId: Id<"locations">,
  now: number,
) {
  const tasks = await getKioskDayTasks(ctx, organizationId, locationId);
  const startOfDay = await startOfDayDue(ctx, organizationId, locationId, tasks.startOfDay);
  if (startOfDay.due) {
    return { phase: "startOfDay" as const, tasks: tasks.startOfDay, nextTransitionAt: null };
  }
  if (!tasks.endOfDay.length) {
    return { phase: null, tasks: [], nextTransitionAt: null };
  }

  const location = await requireOrganizationLocation(ctx, organizationId, locationId);
  const { weekly, specials, timeZone } = await getLocationOpeningHours(
    ctx,
    organizationId,
    location,
  );
  const { closedAt, reopensAt } = closedPeriodAround(now, weekly, specials, timeZone);
  if (now < closedAt) {
    return { phase: null, tasks: [], nextTransitionAt: closedAt };
  }
  const lastEnd =
    startOfDay.lastEnd ?? (await latestRun(ctx, organizationId, locationId, "endOfDay"));
  if (lastEnd && lastEnd.completedAt >= closedAt) {
    return { phase: null, tasks: [], nextTransitionAt: reopensAt };
  }
  return { phase: "endOfDay" as const, tasks: tasks.endOfDay, nextTransitionAt: reopensAt };
}
