import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { integrationIdValidator } from "../integrations/state";
import { requireAuditReason } from "../lib/audit";
import { featureIdValidator, getEntitlements } from "../lib/features";
import { recordPlatformAudit, requirePlatformMember } from "../lib/platformAuth";
import { requirePlatformOrganization } from "./organizations";

export const setEntitlements = mutation({
  args: {
    organizationId: v.string(),
    features: v.array(featureIdValidator),
    integrations: v.array(integrationIdValidator),
    plan: v.optional(v.string()),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requirePlatformMember(ctx, "owner");
    const reason = requireAuditReason(args.reason);
    await requirePlatformOrganization(ctx, args.organizationId);
    const plan = args.plan?.trim() || undefined;
    const data = {
      features: [...new Set(args.features)],
      integrations: [...new Set(args.integrations)],
      plan,
      updatedAt: Date.now(),
    };
    const current = await getEntitlements(ctx, args.organizationId);
    if (current) {
      await ctx.db.patch("organizationEntitlements", current._id, data);
    } else {
      await ctx.db.insert("organizationEntitlements", {
        organizationId: args.organizationId,
        status: "active",
        ...data,
      });
    }
    await recordPlatformAudit(ctx, actor, {
      organizationId: args.organizationId,
      action: "entitlements.changed",
      summary: `Adgang ændret: ${data.features.length} funktioner og ${data.integrations.length} integrationer${plan ? `, plan ${plan}` : ""}`,
      reason,
    });
    return null;
  },
});
