import { v } from "convex/values";

export const countScheduleValidator = v.union(
  v.object({
    type: v.literal("monthly"),
    day: v.number(),
  }),
  v.object({
    type: v.literal("interval"),
    intervalDays: v.number(),
    anchorDate: v.string(),
  }),
);
