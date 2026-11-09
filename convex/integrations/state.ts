import { legacyWorkfeedEnabled } from "./workfeed/lifecycle";
import { legacyOnlinePosEnabled } from "./onlinepos/lifecycle";
import { legacyEconomicEnabled } from "./economic/lifecycle";
import { legacyWoltEnabled } from "./wolt/lifecycle";
import { legacyGsSupplyEnabled } from "./gssupply/lifecycle";
import { legacyAbCateringEnabled } from "./abcatering/lifecycle";
import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { getEntitlements } from "../lib/features";

export const integrationIdValidator = v.union(
  v.literal("workfeed"),
  v.literal("onlinepos"),
  v.literal("economic"),
  v.literal("wolt"),
  v.literal("gssupply"),
  v.literal("abcatering"),
);

export type IntegrationId = Infer<typeof integrationIdValidator>;

export const integrationIds = ["workfeed", "onlinepos", "economic", "wolt", "gssupply", "abcatering"] as const satisfies readonly IntegrationId[];

export async function getIntegrationState(ctx: QueryCtx | MutationCtx, organizationId: string) {
  const [workfeed, onlinepos, economic, wolt, gssupply, abcatering] = await Promise.all([
    isIntegrationEnabled(ctx, organizationId, "workfeed"),
    isIntegrationEnabled(ctx, organizationId, "onlinepos"),
    isIntegrationEnabled(ctx, organizationId, "economic"),
    isIntegrationEnabled(ctx, organizationId, "wolt"),
    isIntegrationEnabled(ctx, organizationId, "gssupply"),
    isIntegrationEnabled(ctx, organizationId, "abcatering"),
  ]);
  return { workfeed, onlinepos, economic, wolt, gssupply, abcatering };
}

export async function isIntegrationEnabled(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  integration: IntegrationId,
): Promise<boolean> {
  const entitlements = await getEntitlements(ctx, organizationId);
  if (!isIntegrationEntitled(entitlements, integration)) return false;
  const installation = await ctx.db.query("integrationSettings")
    .withIndex("by_organizationId_and_integration", (q) =>
      q.eq("organizationId", organizationId).eq("integration", integration))
    .unique();
  if (installation) return installation.enabled;

  switch (integration) {
    case "workfeed": return legacyWorkfeedEnabled(ctx, organizationId);
    case "onlinepos": return legacyOnlinePosEnabled(ctx, organizationId);
    case "economic": return legacyEconomicEnabled(ctx, organizationId);
    case "wolt": return legacyWoltEnabled(ctx, organizationId);
    case "gssupply": return legacyGsSupplyEnabled();
    case "abcatering": return legacyAbCateringEnabled();
  }
}

// Suspended organizations read as having every integration off, which stops jobs and callbacks.
export function isIntegrationEntitled(
  entitlements: { status: "active" | "suspended"; fullAccess?: boolean; integrations: readonly IntegrationId[] } | null,
  integration: IntegrationId,
) {
  return !entitlements || (entitlements.status === "active" && (entitlements.fullAccess === true || entitlements.integrations.includes(integration)));
}

export async function getUnavailableIntegrations(ctx: QueryCtx | MutationCtx, organizationId: string) {
  const entitlements = await getEntitlements(ctx, organizationId);
  return integrationIds.filter((integration) => !isIntegrationEntitled(entitlements, integration));
}

export async function writeInstallationState(ctx: MutationCtx, organizationId: string, integration: IntegrationId, enabled: boolean, updatedAt: number) {
  if (enabled && !isIntegrationEntitled(await getEntitlements(ctx, organizationId), integration)) {
    throw new ConvexError("Integrationen er ikke en del af jeres abonnement");
  }
  const current = await ctx.db.query("integrationSettings")
    .withIndex("by_organizationId_and_integration", (q) =>
      q.eq("organizationId", organizationId).eq("integration", integration)).unique();
  if (current) {
    await ctx.db.patch(current._id, { enabled, updatedAt });
    return current._id;
  }
  return ctx.db.insert("integrationSettings", { organizationId, integration, enabled, updatedAt });
}

export async function requireIntegrationEnabled(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  organizationId: string,
  integration: IntegrationId,
): Promise<void> {
  const enabled = "db" in ctx
    ? await isIntegrationEnabled(ctx, organizationId, integration)
    : await ctx.runQuery(internal.integrations.isEnabled, { organizationId, integration });
  if (!enabled) {
    throw new ConvexError("Integrationen er ikke aktiveret");
  }
}
