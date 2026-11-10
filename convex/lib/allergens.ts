import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { allergens, sortAllergens, type AllergenId } from "../../lib/allergens";

const MAX_INGREDIENT_ROWS = 200;

export const allergenValidator = v.union(
  ...allergens.map((allergen) => v.literal(allergen.id)),
);

/** Returns a product's own allergens plus every allergen in its ingredients. */
export function createAllergenResolver(ctx: QueryCtx, organizationId: string) {
  const cache = new Map<Id<"products">, Promise<Set<AllergenId>>>();

  async function load(productId: Id<"products">, path: Set<Id<"products">>) {
    const result = new Set<AllergenId>();
    const product = await ctx.db.get("products", productId);
    if (!product || product.organizationId !== organizationId) return result;
    for (const allergen of product.allergens ?? []) result.add(allergen);
    const ingredients = await ctx.db
      .query("productIngredients")
      .withIndex("by_organizationId_and_productId", (q) =>
        q.eq("organizationId", organizationId).eq("productId", productId),
      )
      .take(MAX_INGREDIENT_ROWS);
    for (const row of ingredients) {
      if (row.packaging || path.has(row.ingredientProductId)) continue;
      const inherited = await resolve(row.ingredientProductId, new Set([...path, productId]));
      for (const allergen of inherited) result.add(allergen);
    }
    return result;
  }

  function resolve(productId: Id<"products">, path: Set<Id<"products">> = new Set()) {
    let pending = cache.get(productId);
    if (!pending) {
      pending = load(productId, path);
      cache.set(productId, pending);
    }
    return pending;
  }

  return async (productId: Id<"products">) => sortAllergens(await resolve(productId));
}
