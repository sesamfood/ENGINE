import { ConvexError, v } from "convex/values";
import { featureLabels } from "../lib/features";
import { mutation } from "./_generated/server";
import { recordAudit } from "./lib/audit";
import { requireOrganizationAdmin } from "./lib/auth";
import { featureIdValidator, getEntitlements, nonEntitledFeatures } from "./lib/features";

export const setEnabled = mutation({
  args: { feature: featureIdValidator, enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { feature, enabled }) => {
    const auth = await requireOrganizationAdmin(ctx);
    const { organizationId } = auth;
    if (
      enabled &&
      nonEntitledFeatures(await getEntitlements(ctx, organizationId)).includes(feature)
    ) {
      throw new ConvexError("Funktionen er ikke en del af jeres abonnement");
    }
    const current = await ctx.db
      .query("featureSettings")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    const disabledFeatures = new Set(current?.disabledFeatures ?? []);
    if (enabled) disabledFeatures.delete(feature);
    else disabledFeatures.add(feature);
    const data = { disabledFeatures: [...disabledFeatures] };
    const settingsId = current?._id
      ?? await ctx.db.insert("featureSettings", { organizationId, ...data });
    if (current) await ctx.db.patch("featureSettings", current._id, data);
    await recordAudit(ctx, auth, {
      action: "features.changed",
      entityTable: "featureSettings",
      entityId: settingsId,
      summary: `${enabled ? "Aktiverede" : "Deaktiverede"} funktionen ${featureLabels[feature]}`,
    });
    return null;
  },
});
