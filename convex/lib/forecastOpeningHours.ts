import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  DEFAULT_WEEKLY_OPENING_HOURS,
  MAX_SPECIAL_OPENING_DATES,
} from "../../lib/count-window";
import { forecastOpeningDays } from "../../lib/forecast-opening-hours";

export async function getForecastOpeningHours(
  ctx: QueryCtx,
  location: Doc<"locations">,
  today: string,
  from: string,
  through: string,
) {
  const [specials, legacy] = await Promise.all([
    ctx.db
      .query("locationSpecialOpeningHours")
      .withIndex("by_organizationId_and_locationId_and_date", (q) =>
        q
          .eq("organizationId", location.organizationId)
          .eq("locationId", location._id),
      )
      .take(MAX_SPECIAL_OPENING_DATES + 1),
    location.weeklyOpeningHours
      ? null
      : ctx.db
          .query("countSettings")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", location.organizationId),
          )
          .unique(),
  ]);
  if (specials.length > MAX_SPECIAL_OPENING_DATES)
    throw new ConvexError("Lokationen har for mange særlige åbningstider");
  const weekly =
    location.weeklyOpeningHours ??
    DEFAULT_WEEKLY_OPENING_HOURS.map((hours) => ({
      ...hours,
      openMinuteOfDay: legacy?.openMinuteOfDay ?? hours.openMinuteOfDay,
      closeMinuteOfDay: legacy?.closeMinuteOfDay ?? hours.closeMinuteOfDay,
    }));
  const exceptions = specials.map(
    ({ date, closed, openMinuteOfDay, closeMinuteOfDay }) => ({
      date,
      closed,
      openMinuteOfDay,
      closeMinuteOfDay,
    }),
  );
  const closed =
    location.status === "closed" ||
    location.status === "temporarilyClosed" ||
    location.status === "planned";
  return {
    key: JSON.stringify([weekly, exceptions, location.status ?? "open"]),
    days: forecastOpeningDays({
      weekly,
      specials: exceptions,
      from,
      through,
      closedFrom: closed ? today : undefined,
    }),
  };
}
