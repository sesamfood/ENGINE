import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const featureIdValidator = v.union(
  v.literal("dashboard"),
  v.literal("dateLabels"),
  v.literal("woltOrders"),
  v.literal("ordering"),
  v.literal("transfers"),
  v.literal("invoices"),
  v.literal("expenses"),
  v.literal("goodsReceipts"),
  v.literal("waste"),
  v.literal("ownChecks"),
  v.literal("staffFood"),
  v.literal("count"),
  v.literal("employees"),
);

export async function getDisabledFeatures(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
) {
  const settings = await ctx.db
    .query("featureSettings")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  return settings?.disabledFeatures ?? [];
}
