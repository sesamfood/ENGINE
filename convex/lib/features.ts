import { v, type Infer } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const featureIds = [
  "dashboard",
  "dateLabels",
  "woltOrders",
  "ordering",
  "transfers",
  "invoices",
  "expenses",
  "goodsReceipts",
  "waste",
  "ownChecks",
  "staffFood",
  "count",
  "employees",
] as const;

export const featureIdValidator = v.union(
  ...featureIds.map((feature) => v.literal(feature)),
);

export type FeatureId = Infer<typeof featureIdValidator>;

// A missing row means the organization is active and entitled to everything.
export async function getEntitlements(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
) {
  return await ctx.db
    .query("organizationEntitlements")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
}

export function nonEntitledFeatures(
  entitlements: { features: readonly FeatureId[] } | null,
): FeatureId[] {
  if (!entitlements) return [];
  return featureIds.filter((feature) => !entitlements.features.includes(feature));
}

export async function getOrganizationDisabledFeatures(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
) {
  const settings = await ctx.db
    .query("featureSettings")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  return settings?.disabledFeatures ?? [];
}

// Effective availability: entitled by the platform and not switched off by the organization.
export async function getDisabledFeatures(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
): Promise<FeatureId[]> {
  const [disabled, entitlements] = await Promise.all([
    getOrganizationDisabledFeatures(ctx, organizationId),
    getEntitlements(ctx, organizationId),
  ]);
  return [...new Set([...disabled, ...nonEntitledFeatures(entitlements)])];
}
