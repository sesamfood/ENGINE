import { ConvexError, v } from "convex/values";
import { hasPermission } from "../lib/auth-permissions";
import { mutation, query } from "./_generated/server";
import { requireOrganization, requireOrganizationAdmin } from "./lib/auth";

const settingsValidator = v.object({ includeRecipes: v.boolean() });

export const getSettings = query({
  args: {},
  returns: settingsValidator,
  handler: async (ctx) => {
    const auth = await requireOrganization(ctx);
    if (
      auth.kioskModeEnabled ||
      (!hasPermission(auth.role, auth.permissions, "ordering.plan") &&
        !hasPermission(auth.role, auth.permissions, "organization.settings"))
    ) {
      throw new ConvexError("Du har ikke adgang");
    }
    const settings = await ctx.db
      .query("orderingSettings")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .unique();
    return { includeRecipes: settings?.includeRecipes ?? false };
  },
});

export const setSettings = mutation({
  args: settingsValidator.fields,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const current = await ctx.db
      .query("orderingSettings")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();
    const next = {
      includeRecipes: args.includeRecipes,
      updatedAt: Date.now(),
    };
    if (current) {
      await ctx.db.patch("orderingSettings", current._id, next);
    } else {
      await ctx.db.insert("orderingSettings", { organizationId, ...next });
    }
    return null;
  },
});
