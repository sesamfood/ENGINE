import { v } from "convex/values";

export const economicCategoryValidator = v.union(
  v.literal("sales"), v.literal("cogs"), v.literal("labour"),
  v.literal("rent"), v.literal("utilities"), v.literal("other"),
);

export const economicAccountMappingValidator = v.object({
  accountNumber: v.number(), category: economicCategoryValidator,
});

export const economicLocationMappingValidator = v.object({
  locationId: v.id("locations"), dimensionKey: v.union(v.number(), v.null()),
});

export const economicMappingFields = {
  dimensionNumber: v.union(v.number(), v.null()),
  budgetSource: v.union(v.literal("manual"), v.literal("economic")),
  cogsStockAdjusted: v.boolean(),
  accountMappings: v.array(economicAccountMappingValidator),
};

export const economicApprovalItemValidator = v.object({
  category: economicCategoryValidator,
  kind: v.union(v.literal("actual"), v.literal("budget")),
  fingerprint: v.string(),
});
