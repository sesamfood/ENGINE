import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";

export const integrationIdValidator = v.union(
  v.literal("workfeed"),
  v.literal("onlinepos"),
  v.literal("economic"),
  v.literal("wolt"),
);

export type IntegrationId = Infer<typeof integrationIdValidator>;

export async function isIntegrationEnabled(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  integration: IntegrationId,
): Promise<boolean> {
  const installation = await ctx.db.query("integrationSettings")
    .withIndex("by_organizationId_and_integration", (q) =>
      q.eq("organizationId", organizationId).eq("integration", integration))
    .unique();
  if (installation) return installation.enabled;

  // Existing organizations keep their provider switches until explicitly changed.
  switch (integration) {
    case "workfeed": {
      const connection = await ctx.db.query("workfeedIntegrations")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId)).unique();
      return connection?.enabled ?? false;
    }
    case "onlinepos": {
      const connection = await ctx.db.query("onlinePosIntegrations")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId)).first();
      return connection?.enabled ?? false;
    }
    case "economic": {
      const connections = await ctx.db.query("economicConnections")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId)).take(201);
      return connections.some((connection) => connection.enabled);
    }
    case "wolt": {
      const connection = await ctx.db.query("woltIntegrations")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId)).unique();
      return Boolean(connection?.enabled && connection.credentials);
    }
  }
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
