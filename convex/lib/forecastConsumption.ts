import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { normalizeStock } from "./stock";

type Consumption = {
  productId: Id<"products">;
  unitId: Id<"units">;
  quantity: number;
};

export function createForecastConsumptionResolver(
  ctx: QueryCtx,
  organizationId: string,
  { expandRecipes = true } = {},
) {
  const products = new Map<Id<"products">, Doc<"products"> | null>();
  const conversions = new Map<string, number | null>();
  const recipes = new Map<Id<"products">, Doc<"productIngredients">[]>();
  let recipeRows = 0;
  async function expand(
    productId: Id<"products">,
    unitId: Id<"units">,
    quantity: number,
    path: Set<Id<"products">> = new Set(),
  ): Promise<Consumption[] | null> {
    if (path.has(productId) || path.size >= 20)
      throw new ConvexError(
        "En opskrift er cirkulær eller for dyb til prognosen",
      );
    if (!products.has(productId))
      products.set(productId, await ctx.db.get("products", productId));
    const product = products.get(productId);
    if (!product || product.organizationId !== organizationId) return null;
    const conversionKey = `${productId}:${unitId}`;
    if (unitId !== product.defaultUnitId && !conversions.has(conversionKey)) {
      const unit = await ctx.db
        .query("productUnits")
        .withIndex("by_organizationId_and_productId_and_unitId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("productId", productId)
            .eq("unitId", unitId),
        )
        .unique();
      conversions.set(conversionKey, unit?.factorToDefault ?? null);
    }
    const factor =
      unitId === product.defaultUnitId ? 1 : conversions.get(conversionKey);
    if (factor == null) return null;
    const amount = normalizeStock(quantity * factor);
    if (!expandRecipes)
      return [{ productId, unitId: product.defaultUnitId, quantity: amount }];
    let ingredients = recipes.get(productId);
    if (!ingredients) {
      ingredients = await ctx.db
        .query("productIngredients")
        .withIndex("by_organizationId_and_productId", (q) =>
          q.eq("organizationId", organizationId).eq("productId", productId),
        )
        .take(201);
      recipeRows += ingredients.length;
      if (ingredients.length > 200 || recipeRows > 1000)
        throw new ConvexError(
          "Opskrifterne har for mange ingredienser til prognosen",
        );
      recipes.set(productId, ingredients);
    }
    if (!ingredients.length)
      return [{ productId, unitId: product.defaultUnitId, quantity: amount }];
    const result: Consumption[] = [];
    const nextPath = new Set(path).add(productId);
    for (const ingredient of ingredients) {
      const children = await expand(
        ingredient.ingredientProductId,
        ingredient.unitId,
        ingredient.quantity * amount,
        nextPath,
      );
      if (!children) return null;
      result.push(...children);
      if (result.length > 1000)
        throw new ConvexError("Opskriften giver for mange forbrugslinjer");
    }
    return result;
  }
  return expand;
}
