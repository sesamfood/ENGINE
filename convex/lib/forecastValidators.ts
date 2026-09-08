import { v } from "convex/values";

export const forecastProfileValidator = v.object({
  latitude: v.number(),
  longitude: v.number(),
  countryCode: v.string(),
  subdivisionCode: v.optional(v.string()),
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
  profile: forecastProfileValidator,
  timeZone: v.string(),
  revision: v.number(),
  conditions: v.array(forecastConditionValidator),
  archiveThrough: v.optional(v.string()),
  snapshot: v.optional(forecastSnapshotValidator),
  updatedAt: v.optional(v.number()),
  runStartedAt: v.optional(v.number()),
  warning: v.optional(v.string()),
});
