import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const MAX_PRODUCTS = 500;
const MAX_INGREDIENTS_PER_PRODUCT = 500;

type LocationProductCtx = QueryCtx | MutationCtx;

export type LocationProductAccess =
  | { kind: "all" }
  | {
      kind: "selected";
      selectedProductIds: ReadonlySet<Id<"products">>;
      effectiveProductIds: ReadonlySet<Id<"products">>;
    };

async function selectedProductIds(
  ctx: LocationProductCtx,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const rows = await ctx.db
    .query("locationProducts")
    .withIndex("by_organizationId_and_locationId_and_productId", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", locationId),
    )
    .take(MAX_PRODUCTS + 1);
  if (rows.length > MAX_PRODUCTS) {
    throw new ConvexError("Lokationen har for mange valgte Produkter");
  }
  return rows.map((row) => row.productId);
}

export async function getLocationProductAccess(
  ctx: LocationProductCtx,
  organizationId: string,
  locationId: Id<"locations">,
): Promise<LocationProductAccess> {
  const selectedIds = await selectedProductIds(ctx, organizationId, locationId);
  if (selectedIds.length === 0) return { kind: "all" };

  const selected = new Set(selectedIds);
  const effective = new Set(selectedIds);
  const queue = [...selectedIds];

  for (let index = 0; index < queue.length; index += 1) {
    const productId = queue[index];
    const ingredients = await ctx.db
      .query("productIngredients")
      .withIndex("by_organizationId_and_productId", (q) =>
        q.eq("organizationId", organizationId).eq("productId", productId),
      )
      .take(MAX_INGREDIENTS_PER_PRODUCT + 1);
    if (ingredients.length > MAX_INGREDIENTS_PER_PRODUCT) {
      throw new ConvexError("Produktet har for mange ingredienser");
    }
    for (const ingredient of ingredients) {
      if (effective.has(ingredient.ingredientProductId)) continue;
      effective.add(ingredient.ingredientProductId);
      queue.push(ingredient.ingredientProductId);
      if (effective.size > MAX_PRODUCTS) {
        throw new ConvexError("Lokationens Produktliste er for stor");
      }
    }
  }

  return {
    kind: "selected",
    selectedProductIds: selected,
    effectiveProductIds: effective,
  };
}

export async function requireLocationProduct(
  ctx: LocationProductCtx,
  organizationId: string,
  locationId: Id<"locations">,
  productId: Id<"products">,
) {
  const selectedIds = await selectedProductIds(ctx, organizationId, locationId);
  if (selectedIds.length === 0) return;
  const selected = new Set(selectedIds);
  if (selected.has(productId)) return;

  const visited = new Set<Id<"products">>([productId]);
  const queue = [productId];
  for (let index = 0; index < queue.length; index += 1) {
    const ingredientProductId = queue[index];
    const references = await ctx.db
      .query("productIngredients")
      .withIndex("by_organizationId_and_ingredientProductId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("ingredientProductId", ingredientProductId),
      )
      .take(MAX_PRODUCTS + 1);
    if (references.length > MAX_PRODUCTS) {
      throw new ConvexError("Produktet bruges i for mange opskrifter");
    }
    for (const reference of references) {
      if (selected.has(reference.productId)) return;
      if (visited.has(reference.productId)) continue;
      visited.add(reference.productId);
      queue.push(reference.productId);
      if (visited.size > MAX_PRODUCTS) {
        throw new ConvexError("Produktets opskriftsgraf er for stor");
      }
    }
  }
  throw new ConvexError("Produktet bruges ikke på den valgte lokation");
}
