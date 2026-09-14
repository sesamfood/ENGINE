import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalQuery, mutation, query } from "./_generated/server";
import { recordAudit } from "./lib/audit";
import { requireAllLocationAccess, requireHumanPrincipal, requireIntegrationManager, requireOrganization } from "./lib/auth";
import { integrationIdValidator, isIntegrationEnabled } from "./integrations/state";

export const isEnabled = internalQuery({
  args: { organizationId: v.string(), integration: integrationIdValidator },
  returns: v.boolean(),
  handler: (ctx, args) => isIntegrationEnabled(ctx, args.organizationId, args.integration),
});

export const getState = query({
  args: {},
  returns: v.object({ workfeed: v.boolean(), onlinepos: v.boolean(), economic: v.boolean(), wolt: v.boolean() }),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganization(ctx);
    const [workfeed, onlinepos, economic, wolt] = await Promise.all([
      isIntegrationEnabled(ctx, organizationId, "workfeed"),
      isIntegrationEnabled(ctx, organizationId, "onlinepos"),
      isIntegrationEnabled(ctx, organizationId, "economic"),
      isIntegrationEnabled(ctx, organizationId, "wolt"),
    ]);
    return { workfeed, onlinepos, economic, wolt };
  },
});

export const setEnabled = mutation({
  args: { integration: integrationIdValidator, enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { integration, enabled }): Promise<null> => {
    const auth = requireHumanPrincipal(await requireIntegrationManager(ctx));
    requireAllLocationAccess(auth);
    const { organizationId } = auth;
    const current = await ctx.db.query("integrationSettings")
      .withIndex("by_organizationId_and_integration", (q) =>
        q.eq("organizationId", organizationId).eq("integration", integration)).unique();
    const updatedAt = Date.now();
    const id = current?._id ?? await ctx.db.insert("integrationSettings", { organizationId, integration, enabled, updatedAt });
    if (current) await ctx.db.patch(current._id, { enabled, updatedAt });

    // Keep the old whole-provider switches in sync for existing clients and jobs.
    if (integration === "workfeed") {
      const connection = await ctx.db.query("workfeedIntegrations")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId)).unique();
      if (connection) await ctx.db.patch(connection._id, { enabled, updatedAt });
      if (enabled && connection) await ctx.scheduler.runAfter(0, internal.workfeedSync.enqueueOrganizationSync, { organizationId, kind: "employees" });
    }
    if (integration === "onlinepos") {
      const connections = await ctx.db.query("onlinePosIntegrations")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId)).take(21);
      for (const connection of connections) await ctx.db.patch(connection._id, { enabled, updatedAt });
      if (enabled && connections.length) await ctx.scheduler.runAfter(0, internal.onlinePosSync.enqueueOrganizationSync, { organizationId });
    }
    if (integration === "wolt") {
      const connection = await ctx.db.query("woltIntegrations")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId)).unique();
      if (connection) await ctx.db.patch(connection._id, { enabled, updatedAt });
    }
    await recordAudit(ctx, auth, {
      action: enabled ? "integration.enabled" : "integration.disabled",
      entityTable: "integrationSettings", entityId: id,
      summary: `${enabled ? "Aktiverede" : "Deaktiverede"} integrationen ${integration}`,
    });
    return null;
  },
});
