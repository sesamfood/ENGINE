import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  buildCategoryHierarchy,
  MAX_CATEGORIES_PER_ORGANIZATION,
} from "./categoryHierarchy";

const MAX_PRODUCTS = 500;
const MAX_PRODUCT_UNITS = 200;

export const activeProductCatalogValidator = v.object({
  id: v.id("products"),
  name: v.string(),
  category: v.object({
    id: v.id("categories"),
    name: v.string(),
    path: v.string(),
    parentCategoryId: v.union(v.id("categories"), v.null()),
  }),
  imageUrl: v.union(v.string(), v.null()),
  defaultUnitId: v.id("units"),
  units: v.array(
    v.object({
      id: v.id("units"),
      name: v.string(),
      factorToDefault: v.number(),
    }),
  ),
});

export type ActiveProductCatalogItem = {
  id: Id<"products">;
  name: string;
  category: {
    id: Id<"categories">;
    name: string;
    path: string;
    parentCategoryId: Id<"categories"> | null;
  };
  imageUrl: string | null;
  defaultUnitId: Id<"units">;
  units: Array<{
    id: Id<"units">;
    name: string;
    factorToDefault: number;
  }>;
};

export async function listActiveProductCatalog(
  ctx: QueryCtx,
  organizationId: string,
): Promise<ActiveProductCatalogItem[]> {
  const [products, categories] = await Promise.all([
    ctx.db
      .query("products")
      .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId).eq("status", "active"),
      )
      .take(MAX_PRODUCTS + 1),
    ctx.db
      .query("categories")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_CATEGORIES_PER_ORGANIZATION + 1),
  ]);
  if (products.length > MAX_PRODUCTS) {
    throw new ConvexError(
      "Der er over 500 produkter. Arkivér produkter, du ikke bruger, eller kontakt en bruger med rollen Administrator",
    );
  }
  const hierarchy = buildCategoryHierarchy(categories, organizationId);
  const categoriesById = new Map(
    hierarchy.map((category) => [category.id, category]),
  );

  return await Promise.all(
    products.map(async (product) => {
      const category = categoriesById.get(product.categoryId);
      if (!category) throw new ConvexError("Produktets kategori blev ikke fundet");
      const productUnits = await ctx.db
        .query("productUnits")
        .withIndex("by_organizationId_and_productId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("productId", product._id),
        )
        .take(MAX_PRODUCT_UNITS + 1);
      if (productUnits.length > MAX_PRODUCT_UNITS) {
        throw new ConvexError("Produktet har for mange enheder");
      }
      const units = await Promise.all(
        productUnits.map(async (row) => {
          const unit = await ctx.db.get("units", row.unitId);
          return unit?.organizationId === organizationId
            ? {
                id: unit._id,
                name: unit.name,
                factorToDefault: row.factorToDefault,
              }
            : null;
        }),
      );
      return {
        id: product._id,
        name: product.name,
        category: {
          id: category.id,
          name: category.name,
          path: category.path,
          parentCategoryId: category.parentCategoryId,
        },
        imageUrl: product.imageStorageId
          ? await ctx.storage.getUrl(product.imageStorageId)
          : null,
        defaultUnitId: product.defaultUnitId,
        units: units.filter((unit) => unit !== null),
      };
    }),
  );
}
