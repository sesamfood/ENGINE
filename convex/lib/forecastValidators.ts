import { v, type Infer } from "convex/values";

export const FORECAST_WEATHER_PROVIDER = "openWeather";

export const forecastProfileValidator = v.object({
  latitude: v.number(),
  longitude: v.number(),
  countryCode: v.string(),
  subdivisionCode: v.optional(v.string()),
  addressLabel: v.optional(v.string()),
});

export const forecastConfigurationValidator = v.union(
  forecastProfileValidator,
  v.object({
    source: v.literal("google"),
    countryCode: v.optional(v.string()),
    subdivisionCode: v.optional(v.string()),
  }),
);

export function usesGoogleForecastLocation(profile: Infer<typeof forecastConfigurationValidator>) {
  return "source" in profile && profile.countryCode === undefined && profile.subdivisionCode === undefined;
}

export const forecastRegionValidator = v.object({
  googlePlaceId: v.string(),
  latitude: v.number(),
  longitude: v.number(),
  countryCode: v.string(),
  subdivisionCode: v.union(v.string(), v.null()),
  updatedAt: v.number(),
});

export const forecastConditionValidator = v.object({
  date: v.string(),
  temperature: v.union(v.number(), v.null()),
  precipitation: v.union(v.number(), v.null()),
  holiday: v.union(v.boolean(), v.null()),
});

export const forecastPointValidator = v.object({
  date: v.string(),
  value: v.number(),
  multiplier: v.number(),
  weatherApplied: v.boolean(),
  holidayApplied: v.boolean(),
  openMinutes: v.optional(v.union(v.number(), v.null())),
});

export const forecastOpeningDayValidator = v.object({
  date: v.string(),
  openMinutes: v.number(),
});

export const forecastSnapshotValidator = v.object({
  modelVersion: v.optional(v.number()),
  openingHoursKey: v.optional(v.string()),
  productCount: v.optional(v.number()),
  productMixApplied: v.optional(v.boolean()),
  points: v.array(forecastPointValidator),
  historyDays: v.number(),
  weatherDays: v.number(),
  holidayDays: v.number(),
  weatherLearned: v.boolean(),
  holidaysLearned: v.boolean(),
});

export const locationForecastValidator = v.object({
  organizationId: v.string(),
  locationId: v.id("locations"),
  profile: forecastConfigurationValidator,
  region: v.optional(forecastRegionValidator),
  timeZone: v.string(),
  revision: v.number(),
  conditions: v.array(forecastConditionValidator),
  weatherProvider: v.optional(v.literal(FORECAST_WEATHER_PROVIDER)),
  weatherUpdatedAt: v.optional(v.number()),
  weatherWarning: v.optional(v.string()),
  archiveThrough: v.optional(v.string()),
  snapshot: v.optional(forecastSnapshotValidator),
  updatedAt: v.optional(v.number()),
  runStartedAt: v.optional(v.number()),
  warning: v.optional(v.string()),
});
