import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireOrganizationAdmin } from "./lib/auth";
import { featureIdValidator } from "./lib/features";

export const setEnabled = mutation({
  args: { feature: featureIdValidator, enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { feature, enabled }) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const current = await ctx.db
      .query("featureSettings")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    const disabledFeatures = new Set(current?.disabledFeatures ?? []);
    if (enabled) disabledFeatures.delete(feature);
    else disabledFeatures.add(feature);
    const data = { disabledFeatures: [...disabledFeatures] };
    if (current) await ctx.db.patch("featureSettings", current._id, data);
    else await ctx.db.insert("featureSettings", { organizationId, ...data });
    return null;
  },
});
