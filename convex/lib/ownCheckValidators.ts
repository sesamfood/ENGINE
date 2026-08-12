import { v } from "convex/values";

export const ownCheckControlTypeValidator = v.union(
  v.literal("temperature"),
  v.literal("cleaning"),
  v.literal("receiving"),
  v.literal("shelfLife"),
  v.literal("hygiene"),
  v.literal("pest"),
  v.literal("other"),
);

export const ownCheckScheduleValidator = v.union(
  v.object({ type: v.literal("daily") }),
  v.object({ type: v.literal("weekly"), weekdays: v.array(v.number()) }),
  v.object({ type: v.literal("monthly"), days: v.array(v.number()) }),
  v.object({ type: v.literal("interval"), intervalDays: v.number(), anchorDate: v.string() }),
);

export const ownCheckFieldValidator = v.union(
  v.object({
    key: v.string(),
    label: v.string(),
    type: v.literal("number"),
    required: v.boolean(),
    unit: v.optional(v.string()),
    min: v.optional(v.number()),
    max: v.optional(v.number()),
    decimals: v.optional(v.number()),
  }),
  v.object({
    key: v.string(),
    label: v.string(),
    type: v.literal("checkbox"),
    required: v.boolean(),
    mustBeChecked: v.boolean(),
  }),
  v.object({
    key: v.string(),
    label: v.string(),
    type: v.literal("choice"),
    required: v.boolean(),
    options: v.array(v.object({ value: v.string(), label: v.string(), compliant: v.boolean() })),
  }),
  v.object({
    key: v.string(),
    label: v.string(),
    type: v.literal("text"),
    required: v.boolean(),
    maxLength: v.optional(v.number()),
  }),
  v.object({
    key: v.string(),
    label: v.string(),
    type: v.literal("attachment"),
    required: v.boolean(),
    maxFiles: v.number(),
  }),
);

export const ownCheckValueValidator = v.union(
  v.object({ key: v.string(), type: v.literal("number"), number: v.number() }),
  v.object({ key: v.string(), type: v.literal("checkbox"), checked: v.boolean() }),
  v.object({ key: v.string(), type: v.literal("choice"), value: v.string() }),
  v.object({ key: v.string(), type: v.literal("text"), text: v.string() }),
  v.object({ key: v.string(), type: v.literal("attachment"), storageIds: v.array(v.id("_storage")) }),
);

export const ownCheckNoteValidator = v.object({
  description: v.string(),
  recordedAt: v.number(),
  recordedBy: v.string(),
  recordedByName: v.string(),
});
