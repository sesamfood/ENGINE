import {
  activePeriod,
  countWindow,
  DEFAULT_WEEKLY_OPENING_HOURS,
  MAX_SPECIAL_OPENING_DATES,
} from "../../lib/count-window";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type CountWindowContext = QueryCtx | MutationCtx;

export async function getLocationCountWindow(
  ctx: CountWindowContext,
  organizationId: string,
  location: Doc<"locations">,
  now: number,
) {
  const specials = await ctx.db
    .query("locationSpecialOpeningHours")
    .withIndex("by_organizationId_and_locationId_and_date", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("locationId", location._id),
    )
    .take(MAX_SPECIAL_OPENING_DATES + 1);
  if (specials.length > MAX_SPECIAL_OPENING_DATES) {
    throw new Error("Locationen har for mange særlige åbningstider");
  }

  const legacySettings = location.weeklyOpeningHours
    ? null
    : await ctx.db
        .query("countSettings")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .unique();
  const weekly =
    location.weeklyOpeningHours ??
    DEFAULT_WEEKLY_OPENING_HOURS.map((hours) => ({
      ...hours,
      openMinuteOfDay:
        legacySettings?.openMinuteOfDay ?? hours.openMinuteOfDay,
      closeMinuteOfDay:
        legacySettings?.closeMinuteOfDay ?? hours.closeMinuteOfDay,
    }));
  const periodKey = activePeriod(now, weekly, specials);
  return countWindow(periodKey, weekly, specials);
}
