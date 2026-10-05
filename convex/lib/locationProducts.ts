import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getLocationCountWindow } from "./countWindow";

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

// An empty list makes every active Produkt available. Returns whether anything changed.
export async function setLocationProducts(
  ctx: MutationCtx,
  organizationId: string,
  location: Doc<"locations">,
  productIds: Id<"products">[],
) {
  if (
    productIds.length > MAX_PRODUCTS ||
    new Set(productIds).size !== productIds.length
  ) {
    throw new ConvexError("Produktvalget er ugyldigt");
  }

  const products = await Promise.all(
    productIds.map((productId) => ctx.db.get("products", productId)),
  );
  if (
    products.some(
      (product) =>
        !product ||
        product.organizationId !== organizationId ||
        product.status !== "active",
    )
  ) {
    throw new ConvexError("Et Produkt blev ikke fundet");
  }

  const current = await ctx.db
    .query("locationProducts")
    .withIndex("by_organizationId_and_locationId_and_productId", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", location._id),
    )
    .take(MAX_PRODUCTS + 1);
  if (current.length > MAX_PRODUCTS) {
    throw new ConvexError("Lokationen har for mange valgte Produkter");
  }

  const nextIds = new Set(productIds);
  const currentIds = new Set(current.map((row) => row.productId));
  if (
    nextIds.size === currentIds.size &&
    productIds.every((productId) => currentIds.has(productId))
  ) {
    return false;
  }
  const countWindow = await getLocationCountWindow(
    ctx,
    organizationId,
    location,
    Date.now(),
  );
  const currentCount = await ctx.db
    .query("counts")
    .withIndex("by_organizationId_and_locationId_and_periodKey", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("locationId", location._id)
        .eq("periodKey", countWindow.periodKey),
    )
    .unique();
  if (currentCount?.status === "open") {
    const countItem = await ctx.db
      .query("countItems")
      .withIndex("by_organizationId_and_countId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("countId", currentCount._id),
      )
      .first();
    if (countItem) {
      throw new ConvexError(
        "Produktvalget kan ikke ændres, mens der er en åben Count",
      );
    }
  }
  for (const row of current) {
    if (!nextIds.has(row.productId)) {
      await ctx.db.delete("locationProducts", row._id);
    }
  }
  for (const productId of productIds) {
    if (currentIds.has(productId)) continue;
    await ctx.db.insert("locationProducts", {
      organizationId,
      locationId: location._id,
      productId,
    });
  }

  return true;
}
