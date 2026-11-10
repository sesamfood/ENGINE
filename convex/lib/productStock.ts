import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { normalizeStock, toDefaultUnit } from "./stock";

export function createProductStockResolver(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
) {
  const products = new Map<Id<"products">, Doc<"products">>();
  const recipes = new Map<Id<"products">, Doc<"productIngredients">[]>();

  async function product(id: Id<"products">) {
    const cached = products.get(id);
    if (cached) return cached;
    const row = await ctx.db.get("products", id);
    if (!row || row.organizationId !== organizationId)
      throw new ConvexError(
        "Et salgsprodukts lagerkobling findes ikke længere",
      );
    products.set(id, row);
    return row;
  }

  async function recipe(id: Id<"products">) {
    const cached = recipes.get(id);
    if (cached) return cached;
    const rows = await ctx.db
      .query("productIngredients")
      .withIndex("by_organizationId_and_productId", (q) =>
        q.eq("organizationId", organizationId).eq("productId", id),
      )
      .take(201);
    if (rows.length > 200)
      throw new ConvexError(
        "Opskriften har for mange ingredienser til lagersynkronisering",
      );
    recipes.set(id, rows);
    return rows;
  }

  // Default units of the product that one batch of its recipe produces.
  async function recipeYield(id: Id<"products">) {
    const row = await product(id);
    if (!row.recipeYield) return 1;
    const quantity = await toDefaultUnit(
      ctx,
      organizationId,
      id,
      row.recipeYield.unitId,
      row.recipeYield.quantity,
    );
    if (!quantity)
      throw new ConvexError("Opskriftens udbytte mangler en gyldig enhed");
    return quantity;
  }

  async function expand(
    id: Id<"products">,
    quantity: number,
    path: Set<Id<"products">> = new Set(),
  ): Promise<
    Array<{ productId: Id<"products">; unitId: Id<"units">; quantity: number }>
  > {
    if (path.has(id) || path.size >= 20)
      throw new ConvexError(
        "Opskriften er cirkulær eller for dyb til lagersynkronisering",
      );
    const row = await product(id);
    const ingredients = await recipe(id);
    if (!ingredients.length)
      return [
        {
          productId: id,
          unitId: row.defaultUnitId,
          quantity: normalizeStock(quantity),
        },
      ];
    const nextPath = new Set(path).add(id);
    const batches = quantity / (await recipeYield(id));
    const result = [];
    for (const ingredient of ingredients) {
      const converted = await toDefaultUnit(
        ctx,
        organizationId,
        ingredient.ingredientProductId,
        ingredient.unitId,
        ingredient.quantity * batches,
      );
      if (converted === null)
        throw new ConvexError(
          "En ingrediens mangler en gyldig enhedsomregning",
        );
      result.push(
        ...(await expand(ingredient.ingredientProductId, converted, nextPath)),
      );
      if (result.length > 1_000)
        throw new ConvexError("Opskriften giver for mange lagerlinjer");
    }
    return result;
  }

  return { expand, recipe, recipeYield };
}

/**
 * Stock to deduct when a product is consumed at a location. Product stock is
 * used first; a priced product with a recipe covers the rest from its
 * ingredients, minus removed ingredients. Additions are always deducted.
 */
export async function consumptionStock(
  ctx: MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
  product: Doc<"products">,
  quantity: number,
  removedIngredientIds: Id<"products">[],
  additions: Array<{ productId: Id<"products">; unitId: Id<"units">; quantity: number }>,
) {
  const { expand, recipe, recipeYield } = createProductStockResolver(
    ctx,
    organizationId,
  );
  const totals = new Map<Id<"products">, number>();
  const add = (
    entries: Array<{ productId: Id<"products">; quantity: number }>,
    sign = 1,
  ) => {
    for (const entry of entries)
      totals.set(
        entry.productId,
        (totals.get(entry.productId) ?? 0) + sign * entry.quantity,
      );
  };
  const convert = async (
    productId: Id<"products">,
    unitId: Id<"units">,
    amount: number,
  ) => {
    const converted = await toDefaultUnit(
      ctx,
      organizationId,
      productId,
      unitId,
      amount,
    );
    if (converted === null)
      throw new ConvexError("En ingrediens mangler en gyldig enhedsomregning");
    return converted;
  };

  const ingredients = await recipe(product._id);
  let fromRecipe = 0;
  if (ingredients.length && product.salesPrice !== undefined) {
    const stock = await ctx.db
      .query("locationStock")
      .withIndex("by_organizationId_and_locationId_and_productId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", locationId)
          .eq("productId", product._id),
      )
      .unique();
    fromRecipe = Math.max(0, quantity - Math.max(0, stock?.quantity ?? 0));
  }
  if (quantity > fromRecipe)
    add([{ productId: product._id, quantity: quantity - fromRecipe }]);
  if (fromRecipe > 0) {
    add(await expand(product._id, fromRecipe));
    const batches = fromRecipe / (await recipeYield(product._id));
    for (const row of ingredients) {
      if (!removedIngredientIds.includes(row.ingredientProductId)) continue;
      const amount = await convert(
        row.ingredientProductId,
        row.unitId,
        row.quantity * batches,
      );
      add(await expand(row.ingredientProductId, amount), -1);
    }
  }
  for (const addition of additions) {
    const amount = await convert(
      addition.productId,
      addition.unitId,
      addition.quantity,
    );
    add(await expand(addition.productId, amount));
  }
  return [...totals].flatMap(([productId, total]) => {
    const value = normalizeStock(total);
    return value ? [{ productId, quantity: value }] : [];
  });
}
