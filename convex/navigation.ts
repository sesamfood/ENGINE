import { ConvexError, v } from "convex/values";
import {
  defaultSidebarOrder,
  normalizeSidebarOrder,
} from "../lib/sidebar-navigation";
import { mutation, query } from "./_generated/server";
import { requireOrganization, requireOrganizationAdmin } from "./lib/auth";

const sidebarItemValidator = v.union(
  v.literal("transfers"),
  v.literal("waste"),
  v.literal("staffFood"),
  v.literal("count"),
  v.literal("employees"),
  v.literal("organization"),
);
const sidebarOrderValidator = v.array(sidebarItemValidator);

function validateOrder(itemOrder: string[]) {
  if (
    itemOrder.length !== defaultSidebarOrder.length ||
    new Set(itemOrder).size !== defaultSidebarOrder.length ||
    defaultSidebarOrder.some((id) => !itemOrder.includes(id))
  ) {
    throw new ConvexError("Sidemenuen skal indeholde alle menupunkter én gang");
  }
}

export const getOrder = query({
  args: {},
  returns: sidebarOrderValidator,
  handler: async (ctx) => {
    const { organizationId } = await requireOrganization(ctx);
    const settings = await ctx.db
      .query("sidebarSettings")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();
    return normalizeSidebarOrder(settings?.itemOrder);
  },
});

export const saveOrder = mutation({
  args: { itemOrder: sidebarOrderValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    validateOrder(args.itemOrder);
    const current = await ctx.db
      .query("sidebarSettings")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();
    const data = { itemOrder: args.itemOrder, updatedAt: Date.now() };
    if (current) await ctx.db.patch("sidebarSettings", current._id, data);
    else await ctx.db.insert("sidebarSettings", { organizationId, ...data });
    return null;
  },
});
