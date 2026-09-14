import { applyWorkfeedInstallation } from "./integrations/workfeed/lifecycle";
import { applyOnlinePosInstallation } from "./integrations/onlinepos/lifecycle";
import { applyWoltInstallation } from "./integrations/wolt/lifecycle";
import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { recordAudit } from "./lib/audit";
import { requireAllLocationAccess, requireHumanPrincipal, requireIntegrationManager, requireOrganization } from "./lib/auth";
import { getIntegrationState, integrationIdValidator, isIntegrationEnabled, writeInstallationState } from "./integrations/state";

export const isEnabled = internalQuery({
  args: { organizationId: v.string(), integration: integrationIdValidator },
  returns: v.boolean(),
  handler: (ctx, args) => isIntegrationEnabled(ctx, args.organizationId, args.integration),
});

export const getState = query({
  args: {},
  returns: v.object({ organizationId: v.string(), workfeed: v.boolean(), onlinepos: v.boolean(), economic: v.boolean(), wolt: v.boolean() }),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganization(ctx);
    return { organizationId, ...await getIntegrationState(ctx, organizationId) };
  },
});

export const setEnabled = mutation({
  args: { integration: integrationIdValidator, enabled: v.boolean(), expectedOrganizationId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { integration, enabled, expectedOrganizationId }): Promise<null> => {
    const auth = requireHumanPrincipal(await requireIntegrationManager(ctx));
    requireAllLocationAccess(auth);
    const { organizationId } = auth;
    if (expectedOrganizationId !== undefined && expectedOrganizationId !== organizationId) {
      throw new ConvexError("Organisationen er ændret. Prøv igen");
    }
    const updatedAt = Date.now();
    const id = await writeInstallationState(ctx, organizationId, integration, enabled, updatedAt);
    switch (integration) {
      case "workfeed": await applyWorkfeedInstallation(ctx, organizationId, enabled, updatedAt); break;
      case "onlinepos": await applyOnlinePosInstallation(ctx, organizationId, enabled, updatedAt); break;
      case "wolt": await applyWoltInstallation(ctx, organizationId, enabled, updatedAt); break;
      case "economic": break;
    }
    await recordAudit(ctx, auth, {
      action: enabled ? "integration.enabled" : "integration.disabled",
      entityTable: "integrationSettings", entityId: id,
      summary: `${enabled ? "Aktiverede" : "Deaktiverede"} integrationen ${integration}`,
    });
    return null;
  },
});
