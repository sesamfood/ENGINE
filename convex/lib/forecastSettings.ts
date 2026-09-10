import { ConvexError, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { forecastConfigurationValidator, forecastRegionValidator, usesGoogleForecastLocation } from "./forecastValidators";
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
  profile: Infer<typeof forecastConfigurationValidator> | null,
  reset = false,
  region?: Infer<typeof forecastRegionValidator> | null,
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
  const location = await ctx.db.get("locations", locationId);
  if (!location || location.organizationId !== organizationId || !location.googlePlaceId) {
    throw new ConvexError("Vælg et Google-sted til prognosen");
  }
  const normalized: Infer<typeof forecastConfigurationValidator> = { source: "google" };
  const nextRegion = region === undefined ? current?.region : region ?? undefined;
  const linkedRegion = nextRegion?.googlePlaceId === location.googlePlaceId ? nextRegion : undefined;
  const changedRegion = current?.region?.googlePlaceId !== linkedRegion?.googlePlaceId ||
    current?.region?.latitude !== linkedRegion?.latitude ||
    current?.region?.longitude !== linkedRegion?.longitude ||
    current?.region?.countryCode !== linkedRegion?.countryCode ||
    current?.region?.subdivisionCode !== linkedRegion?.subdivisionCode;
  const timeZone = await resolveTimeZone(ctx, organizationId, locationId);
  if (!reset && !changedRegion && current && usesGoogleForecastLocation(current.profile) &&
    current.timeZone === timeZone) {
    await ctx.db.patch("locationForecasts", current._id, { profile: normalized, region: linkedRegion });
    return;
  }
  const value = {
    organizationId,
    locationId,
    profile: normalized,
    ...(linkedRegion ? { region: linkedRegion } : {}),
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
