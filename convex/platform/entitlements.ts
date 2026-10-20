import { ConvexError, v } from "convex/values";
import { mutation } from "../_generated/server";
import { integrationIdValidator } from "../integrations/state";
import {
  featureIdValidator,
  getEntitlements,
  unavailableDisplayValidator,
} from "../lib/features";
import { recordPlatformAudit, requirePlatformMember } from "../lib/platformAuth";
import { requirePlatformOrganization } from "./organizations";

export const setEntitlements = mutation({
  args: {
    organizationId: v.string(),
    features: v.array(featureIdValidator),
    integrations: v.array(integrationIdValidator),
    // null keeps the features and integrations above as a custom setup.
    planId: v.union(v.id("plans"), v.null()),
    // Must be offered by the plan; ignored without one.
    addOnIds: v.array(v.id("addOns")),
    // null follows the platform default.
    unavailableDisplay: v.union(unavailableDisplayValidator, v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requirePlatformMember(ctx, "owner");
    await requirePlatformOrganization(ctx, args.organizationId);
    const current = await getEntitlements(ctx, args.organizationId);
    const plan = args.planId ? await ctx.db.get("plans", args.planId) : null;
    if (args.planId && !plan) throw new ConvexError("Planen blev ikke fundet");
    if (plan?.deprecated && current?.planId !== args.planId) {
      throw new ConvexError("Planen er udfaset og kan ikke vælges");
    }
    const addOnIds = plan ? [...new Set(args.addOnIds)] : [];
    for (const id of addOnIds) {
      const addOn = await ctx.db.get("addOns", id);
      if (!addOn || !plan?.addOnIds?.includes(id)) {
        throw new ConvexError("Et tilkøb hører ikke til planen");
      }
      if (addOn.deprecated && !current?.addOnIds?.includes(id)) {
        throw new ConvexError(`${addOn.name} er udfaset og kan ikke tilføjes`);
      }
    }
    const data = {
      features: [...new Set(args.features)],
      integrations: [...new Set(args.integrations)],
      planId: args.planId ?? undefined,
      addOnIds,
      plan: undefined,
      unavailableDisplay: args.unavailableDisplay ?? undefined,
      updatedAt: Date.now(),
    };
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
      summary: plan
        ? `Adgang ændret: plan ${plan.name}${addOnIds.length ? ` med ${addOnIds.length} tilkøb` : ""}`
        : `Adgang ændret: ${data.features.length} funktioner og ${data.integrations.length} integrationer`,
    });
    return null;
  },
});
