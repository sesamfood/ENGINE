import { v, type Infer } from "convex/values";
import type { PermissionId } from "../../lib/auth-permissions";
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
// An assigned plan and its purchased add-ons supply the features and integrations.
export async function getEntitlements(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
) {
  const row = await ctx.db
    .query("organizationEntitlements")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  if (!row) return null;
  const plan = row.planId ? await ctx.db.get("plans", row.planId) : null;
  if (!plan) return { ...row, planName: null };
  const addOns = await Promise.all(
    (row.addOnIds ?? [])
      .filter((id) => plan.addOnIds?.includes(id))
      .map((id) => ctx.db.get("addOns", id)),
  );
  const sources = [plan, ...addOns.filter((addOn) => addOn !== null)];
  return {
    ...row,
    features: [...new Set(sources.flatMap((source) => source.features))],
    integrations: [...new Set(sources.flatMap((source) => source.integrations))],
    planName: plan.name,
  };
}

// How the app shows features and integrations outside the organization's entitlements.
export const unavailableDisplayValidator = v.union(
  v.literal("disabled"),
  v.literal("hidden"),
);

export type UnavailableDisplay = Infer<typeof unavailableDisplayValidator>;

export async function getDefaultUnavailableDisplay(
  ctx: QueryCtx | MutationCtx,
): Promise<UnavailableDisplay> {
  const settings = await ctx.db.query("platformSettings").first();
  return settings?.unavailableDisplay ?? "disabled";
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

// Every permission must name its feature, so new permissions force a decision here.
// Administration and settings permissions stay usable while a feature is off, so admins
// can still configure it and switch it back on.
export const permissionFeatures: Record<PermissionId, FeatureId | null> = {
  "dateLabels.print": "dateLabels",
  "ordering.plan": "ordering",
  "ordering.place": "ordering",
  "ordering.export": "ordering",
  "count.register": "count",
  "count.viewStock": "count",
  "count.export": "count",
  "waste.register": "waste",
  "waste.report": "waste",
  "waste.export": "waste",
  "ownChecks.perform": "ownChecks",
  "ownChecks.correct": "ownChecks",
  "ownChecks.view": "ownChecks",
  "ownChecks.approve": "ownChecks",
  "ownChecks.edit": "ownChecks",
  "ownChecks.export": "ownChecks",
  "transfers.view": "transfers",
  "transfers.manage": "transfers",
  "transfers.export": "transfers",
  "invoices.view": "invoices",
  "invoices.manage": "invoices",
  "expenses.create": "expenses",
  "expenses.view": "expenses",
  "expenses.exportEconomic": "expenses",
  "expenses.settings": null,
  "goodsReceipts.register": "goodsReceipts",
  "goodsReceipts.settings": null,
  "staffFood.register": "staffFood",
  "staffFood.report": "staffFood",
  "staffFood.manage": null,
  "dashboard.view": "dashboard",
  "dashboard.manage": "dashboard",
  "dashboard.share": "dashboard",
  "dashboard.viewSales": "dashboard",
  "dashboard.viewFinancials": "dashboard",
  "dashboard.manageBudgets": "dashboard",
  // Sales data also feeds Count, Waste, and Wolt orders.
  "sales.viewAggregate": null,
  "sales.viewDetail": null,
  "employees.schedule": "employees",
  "employees.directory": "employees",
  "catalog.manage": null,
  "locations.manage": null,
  "count.settings": null,
  "waste.settings": null,
  "ownChecks.manage": null,
  "kiosk.dayTasks.manage": null,
  "organization.settings": null,
  "integrations.manage": null,
  "apiKeys.manage": null,
  "members.manage": null,
  "roles.manage": null,
};
