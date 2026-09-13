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
    const result = [];
    for (const ingredient of ingredients) {
      const converted = await toDefaultUnit(
        ctx,
        organizationId,
        ingredient.ingredientProductId,
        ingredient.unitId,
        ingredient.quantity * quantity,
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

  return { expand, recipe };
}
