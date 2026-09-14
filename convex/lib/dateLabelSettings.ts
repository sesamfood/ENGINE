import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  buildCategoryHierarchy,
  categoryIdsInSubtree,
  MAX_CATEGORIES_PER_ORGANIZATION,
} from "./categoryHierarchy";

export const dateLabelSelectionFields = {
  mode: v.union(v.literal("all"), v.literal("selected")),
  categoryIds: v.array(v.id("categories")),
  productIds: v.array(v.id("products")),
  excludedProductIds: v.array(v.id("products")),
};

export function getDateLabelSettings(
  ctx: QueryCtx,
  organizationId: string,
  locationId: Id<"locations">,
) {
  return ctx.db
    .query("dateLabelSettings")
    .withIndex("by_organizationId_and_locationId", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", locationId),
    )
    .unique();
}

export async function dateLabelCategories(
  ctx: QueryCtx,
  organizationId: string,
) {
  const categories = await ctx.db
    .query("categories")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q.eq("organizationId", organizationId),
    )
    .take(MAX_CATEGORIES_PER_ORGANIZATION + 1);
  return buildCategoryHierarchy(categories, organizationId);
}

export async function selectedDateLabelCategories(
  ctx: QueryCtx,
  organizationId: string,
  selected: Id<"categories">[],
) {
  if (!selected.length) return new Set<Id<"categories">>();
  const categories = await dateLabelCategories(ctx, organizationId);
  return new Set(
    selected.flatMap((id) => [...categoryIdsInSubtree(categories, id)]),
  );
}
