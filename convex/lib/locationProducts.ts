import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getLocationCountWindow } from "./countWindow";

const MAX_PRODUCTS = 500;
const MAX_INGREDIENTS_PER_PRODUCT = 500;

type LocationProductCtx = QueryCtx | MutationCtx;

export type LocationProductAccess =
  | { kind: "all"; unusedProductIds: ReadonlySet<Id<"products">> }
  | {
      kind: "selected";
      selectedProductIds: ReadonlySet<Id<"products">>;
      effectiveProductIds: ReadonlySet<Id<"products">>;
    };

type ProductListTable = "locationProducts" | "locationUnusedProducts";

async function listRows(
  ctx: LocationProductCtx,
  table: ProductListTable,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const rows = await ctx.db
    .query(table)
    .withIndex("by_organizationId_and_locationId_and_productId", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", locationId),
    )
    .take(MAX_PRODUCTS + 1);
  if (rows.length > MAX_PRODUCTS) {
    throw new ConvexError("Lokationen har for mange valgte Produkter");
  }
  return rows;
}

async function selectedProductIds(
  ctx: LocationProductCtx,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const rows = await listRows(
    ctx,
    "locationProducts",
    organizationId,
    locationId,
  );
  return rows.map((row) => row.productId);
}

export function locationHasProduct(
  access: LocationProductAccess,
  productId: Id<"products">,
) {
  return access.kind === "all"
    ? !access.unusedProductIds.has(productId)
    : access.effectiveProductIds.has(productId);
}

export async function getLocationProductAccess(
  ctx: LocationProductCtx,
  organizationId: string,
  locationId: Id<"locations">,
): Promise<LocationProductAccess> {
  const selectedIds = await selectedProductIds(ctx, organizationId, locationId);
  if (selectedIds.length === 0) {
    const unusedRows = await listRows(
      ctx,
      "locationUnusedProducts",
      organizationId,
      locationId,
    );
    return {
      kind: "all",
      unusedProductIds: new Set(unusedRows.map((row) => row.productId)),
    };
  }

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
  if (selectedIds.length === 0) {
    const unused = await ctx.db
      .query("locationUnusedProducts")
      .withIndex("by_organizationId_and_locationId_and_productId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", locationId)
          .eq("productId", productId),
      )
      .first();
    if (unused) {
      throw new ConvexError("Produktet bruges ikke på den valgte lokation");
    }
    return;
  }
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

// Without productIds every active Produkt is available except unusedProductIds.
// Returns whether anything changed.
export async function setLocationProducts(
  ctx: MutationCtx,
  organizationId: string,
  location: Doc<"locations">,
  {
    productIds,
    unusedProductIds,
  }: { productIds: Id<"products">[]; unusedProductIds: Id<"products">[] },
) {
  if (
    productIds.length > MAX_PRODUCTS ||
    unusedProductIds.length > MAX_PRODUCTS ||
    new Set(productIds).size !== productIds.length ||
    new Set(unusedProductIds).size !== unusedProductIds.length ||
    (productIds.length > 0 && unusedProductIds.length > 0)
  ) {
    throw new ConvexError("Produktvalget er ugyldigt");
  }

  const lists = [
    { table: "locationProducts" as const, productIds },
    { table: "locationUnusedProducts" as const, productIds: unusedProductIds },
  ];
  const changes = await Promise.all(
    lists.map(async (list) => {
      const current = await listRows(
        ctx,
        list.table,
        organizationId,
        location._id,
      );
      const currentIds = new Set(current.map((row) => row.productId));
      const nextIds = new Set(list.productIds);
      return {
        table: list.table,
        removed: current.filter((row) => !nextIds.has(row.productId)),
        added: list.productIds.filter((id) => !currentIds.has(id)),
      };
    }),
  );
  if (changes.every((change) => !change.removed.length && !change.added.length)) {
    return false;
  }

  const added = changes.flatMap((change) => change.added);
  const products = await Promise.all(
    added.map((productId) => ctx.db.get("products", productId)),
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
  for (const change of changes) {
    for (const row of change.removed) {
      await ctx.db.delete(change.table, row._id);
    }
    for (const productId of change.added) {
      await ctx.db.insert(change.table, {
        organizationId,
        locationId: location._id,
        productId,
      });
    }
  }
  return true;
}
