import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const MAX_PRODUCT_CATEGORIES = 20;

type CategorizedProduct = Pick<
  Doc<"products">,
  "_id" | "organizationId" | "categoryId"
>;

export async function getProductCategoryIds(
  ctx: QueryCtx | MutationCtx,
  product: CategorizedProduct,
): Promise<Id<"categories">[]> {
  const memberships = await ctx.db
    .query("productCategories")
    .withIndex("by_organizationId_and_productId", (q) =>
      q
        .eq("organizationId", product.organizationId)
        .eq("productId", product._id),
    )
    .take(MAX_PRODUCT_CATEGORIES + 1);
  if (memberships.length > MAX_PRODUCT_CATEGORIES) {
    throw new ConvexError("Produktet har for mange kategorier");
  }

  const membershipCategoryIds = [
    ...new Set(memberships.map((membership) => membership.categoryId)),
  ];
  const categoryIds = [
    product.categoryId,
    ...membershipCategoryIds.filter(
      (categoryId) => categoryId !== product.categoryId,
    ),
  ];
  if (categoryIds.length > MAX_PRODUCT_CATEGORIES) {
    throw new ConvexError("Produktet har for mange kategorier");
  }
  return categoryIds;
}

export async function replaceProductCategories(
  ctx: MutationCtx,
  product: CategorizedProduct,
  categoryIds: Id<"categories">[],
) {
  if (
    categoryIds.length === 0 ||
    categoryIds.length > MAX_PRODUCT_CATEGORIES ||
    new Set(categoryIds).size !== categoryIds.length ||
    categoryIds[0] !== product.categoryId
  ) {
    throw new ConvexError("Produktets kategorier er ugyldige");
  }

  const memberships = await ctx.db
    .query("productCategories")
    .withIndex("by_organizationId_and_productId", (q) =>
      q
        .eq("organizationId", product.organizationId)
        .eq("productId", product._id),
    )
    .take(MAX_PRODUCT_CATEGORIES + 1);
  if (memberships.length > MAX_PRODUCT_CATEGORIES) {
    throw new ConvexError("Produktet har for mange kategorier");
  }
  for (const membership of memberships) {
    await ctx.db.delete("productCategories", membership._id);
  }
  for (const categoryId of categoryIds) {
    await ctx.db.insert("productCategories", {
      organizationId: product.organizationId,
      productId: product._id,
      categoryId,
    });
  }
}
