import {
  countWindowForPeriod,
  DEFAULT_COUNT_SCHEDULE,
  DEFAULT_WEEKLY_OPENING_HOURS,
  MAX_SPECIAL_OPENING_DATES,
  scheduledCountWindows,
} from "../../lib/count-window";
import type { CountSchedule } from "../../lib/count-window";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type CountWindowContext = QueryCtx | MutationCtx;

export type CountConfiguration = {
  allowOutsideWindow: boolean;
  lockOtherFeaturesDuringCount: boolean;
  requireCountBeforeOpening: boolean;
  countSchedule: CountSchedule;
};

function configurationFrom(
  settings: Doc<"countSettings"> | null,
): CountConfiguration {
  return {
    allowOutsideWindow: settings?.allowOutsideWindow ?? false,
    lockOtherFeaturesDuringCount:
      settings?.lockOtherFeaturesDuringCount ?? false,
    requireCountBeforeOpening:
      settings?.requireCountBeforeOpening ?? true,
    countSchedule: settings?.countSchedule ?? DEFAULT_COUNT_SCHEDULE,
  };
}

export async function getCountConfiguration(
  ctx: CountWindowContext,
  organizationId: string,
) {
  const settings = await ctx.db
    .query("countSettings")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .unique();
  return configurationFrom(settings);
}

export async function getLocationCountWindow(
  ctx: CountWindowContext,
  organizationId: string,
  location: Doc<"locations">,
  now: number,
) {
  const [specials, settings] = await Promise.all([
    ctx.db
      .query("locationSpecialOpeningHours")
      .withIndex("by_organizationId_and_locationId_and_date", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", location._id),
      )
      .take(MAX_SPECIAL_OPENING_DATES + 1),
    ctx.db
      .query("countSettings")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique(),
  ]);
  if (specials.length > MAX_SPECIAL_OPENING_DATES) {
    throw new Error("Locationen har for mange særlige åbningstider");
  }

  const weekly =
    location.weeklyOpeningHours ??
    DEFAULT_WEEKLY_OPENING_HOURS.map((hours) => ({
      ...hours,
      openMinuteOfDay:
        settings?.openMinuteOfDay ?? hours.openMinuteOfDay,
      closeMinuteOfDay:
        settings?.closeMinuteOfDay ?? hours.closeMinuteOfDay,
    }));
  const configuration = configurationFrom(settings);
  const windows = scheduledCountWindows(
    now,
    weekly,
    specials,
    configuration.countSchedule,
  );
  let window = windows.active;
  let hasOpenCount = false;

  if (configuration.requireCountBeforeOpening) {
    const openCount = await ctx.db
      .query("counts")
      .withIndex("by_organizationId_and_locationId_and_status", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", location._id)
          .eq("status", "open"),
      )
      .order("desc")
      .first();
    if (openCount) {
      hasOpenCount = true;
      window = countWindowForPeriod(
        openCount.periodKey,
        configuration.countSchedule,
        weekly,
        specials,
      );
    }
  }

  if (
    !hasOpenCount &&
    configuration.requireCountBeforeOpening &&
    now >= windows.due.closesAt
  ) {
    const dueCount = await ctx.db
      .query("counts")
      .withIndex("by_organizationId_and_locationId_and_periodKey", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", location._id)
          .eq("periodKey", windows.due.periodKey),
      )
      .unique();
    if (dueCount?.status !== "submitted") window = windows.due;
  }

  return { ...window, ...configuration };
}
