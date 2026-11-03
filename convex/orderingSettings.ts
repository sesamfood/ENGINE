import { ConvexError, v } from "convex/values";
import { hasPermission } from "../lib/auth-permissions";
import { mutation, query } from "./_generated/server";
import {
  requireKioskDestination,
  requireOrganization,
  requireOrganizationAdmin,
} from "./lib/auth";
import {
  forecastSettings,
  forecastSettingsFields,
  requireForecastSettings,
} from "./lib/orderForecastSettings";

const settingsValidator = v.object({
  includeRecipes: v.boolean(),
  chooseSupplierFirst: v.boolean(),
  ...forecastSettingsFields,
});

export const getSettings = query({
  args: {},
  returns: settingsValidator,
  handler: async (ctx) => {
    const auth = await requireOrganization(ctx);
    if (
      !hasPermission(auth.role, auth.permissions, "ordering.plan") &&
      (auth.kioskModeEnabled ||
        !hasPermission(auth.role, auth.permissions, "organization.settings"))
    ) {
      throw new ConvexError("Du har ikke adgang");
    }
    await requireKioskDestination(ctx, auth, ["ordering.new", "ordering.history"]);
    const settings = await ctx.db
      .query("orderingSettings")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .unique();
    return {
      includeRecipes: settings?.includeRecipes ?? false,
      chooseSupplierFirst: settings?.chooseSupplierFirst ?? true,
      ...forecastSettings(settings),
    };
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
      chooseSupplierFirst: args.chooseSupplierFirst,
      ...requireForecastSettings(args),
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
