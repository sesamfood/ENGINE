import { ConvexError, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { forecastProfileValidator } from "./forecastValidators";
import { resolveTimeZone } from "./timeZone";

export async function invalidateLocationForecast(
  ctx: MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const forecast = await ctx.db
    .query("locationForecasts")
    .withIndex("by_organizationId_and_locationId", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", locationId),
    )
    .unique();
  if (!forecast) return;
  await ctx.db.patch("locationForecasts", forecast._id, {
    revision: forecast.revision + 1,
    snapshot: undefined,
    updatedAt: undefined,
    runStartedAt: undefined,
  });
  await ctx.scheduler.runAfter(0, internal.forecasts.refreshLocation, {
    forecastId: forecast._id,
  });
}

export async function setForecastProfile(
  ctx: MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
  profile: Infer<typeof forecastProfileValidator> | null,
) {
  const current = await ctx.db
    .query("locationForecasts")
    .withIndex("by_organizationId_and_locationId", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", locationId),
    )
    .unique();
  if (!profile) {
    if (current) await ctx.db.delete("locationForecasts", current._id);
    return;
  }
  const countryCode = profile.countryCode.trim().toUpperCase();
  const subdivisionCode =
    profile.subdivisionCode?.trim().toUpperCase() || undefined;
  if (
    !Number.isFinite(profile.latitude) ||
    Math.abs(profile.latitude) > 90 ||
    !Number.isFinite(profile.longitude) ||
    Math.abs(profile.longitude) > 180 ||
    !/^[A-Z]{2}$/.test(countryCode) ||
    (subdivisionCode &&
      (!/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(subdivisionCode) ||
        !subdivisionCode.startsWith(`${countryCode}-`)))
  ) {
    throw new ConvexError(
      "Angiv gyldige koordinater, en landekode på to bogstaver og eventuelt en ISO-regionskode",
    );
  }
  const timeZone = await resolveTimeZone(ctx, organizationId, locationId);
  const normalized = {
    latitude: profile.latitude,
    longitude: profile.longitude,
    countryCode,
    ...(subdivisionCode ? { subdivisionCode } : {}),
  };
  if (
    current &&
    current.profile.latitude === normalized.latitude &&
    current.profile.longitude === normalized.longitude &&
    current.profile.countryCode === normalized.countryCode &&
    current.profile.subdivisionCode === normalized.subdivisionCode &&
    current.timeZone === timeZone
  )
    return;
  const value = {
    organizationId,
    locationId,
    profile: normalized,
    timeZone,
    revision: (current?.revision ?? 0) + 1,
    conditions: [],
  };
  const forecastId =
    current?._id ?? (await ctx.db.insert("locationForecasts", value));
  if (current) await ctx.db.replace("locationForecasts", current._id, value);
  await ctx.scheduler.runAfter(0, internal.forecasts.refreshLocation, {
    forecastId,
  });
}
