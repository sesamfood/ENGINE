import { v } from "convex/values";

const openingHoursFields = {
  closed: v.boolean(),
  openMinuteOfDay: v.number(),
  closeMinuteOfDay: v.number(),
};

export const openingHoursModeValidator = v.union(
  v.literal("sameEveryDay"),
  v.literal("byWeekday"),
);

export const weeklyOpeningHoursValidator = v.object({
  weekday: v.number(),
  ...openingHoursFields,
});

export const specialOpeningHoursValidator = v.object({
  date: v.string(),
  ...openingHoursFields,
});
