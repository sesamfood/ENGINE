import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  buildCategoryHierarchy,
  MAX_CATEGORIES_PER_ORGANIZATION,
} from "./categoryHierarchy";
import { productSearchScore } from "../../lib/product-search";
import { getLocationProductAccess } from "./locationProducts";
import { getProductCategoryIds } from "./productCategories";

const MAX_PRODUCTS = 500;
const MAX_PRODUCT_UNITS = 200;
const MAX_PRODUCT_OPTIONS = 50;

export const activeProductSearchOptionValidator = v.object({
  id: v.id("products"),
  name: v.string(),
  categoryPath: v.string(),
});

const activeProductCategoryValidator = v.object({
  id: v.id("categories"),
  name: v.string(),
  path: v.string(),
  parentCategoryId: v.union(v.id("categories"), v.null()),
});

export const activeProductCatalogValidator = v.object({
  id: v.id("products"),
  name: v.string(),
  category: activeProductCategoryValidator,
  categories: v.array(activeProductCategoryValidator),
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
  categories: Array<{
    id: Id<"categories">;
    name: string;
    path: string;
    parentCategoryId: Id<"categories"> | null;
  }>;
  imageUrl: string | null;
  defaultUnitId: Id<"units">;
  units: Array<{
    id: Id<"units">;
    name: string;
    factorToDefault: number;
  }>;
};

export async function searchActiveProductOptions(
  ctx: QueryCtx,
  organizationId: string,
  search: string,
): Promise<Array<{ id: Id<"products">; name: string }>> {
  return (await listActiveProductSearchOptions(ctx, organizationId))
    .filter(
      (product) =>
        productSearchScore(product.name, product.categoryPath, search) !== null,
    )
    .slice(0, MAX_PRODUCT_OPTIONS)
    .map((product) => ({ id: product.id, name: product.name }));
}

export async function listActiveProductSearchOptions(
  ctx: QueryCtx,
  organizationId: string,
): Promise<
  Array<{ id: Id<"products">; name: string; categoryPath: string }>
> {
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
      if (!category) {
        throw new ConvexError("Produktets kategori blev ikke fundet");
      }
      const categoryIds = await getProductCategoryIds(ctx, product);
      return {
        id: product._id,
        name: product.name,
        categoryPath: categoryIds
          .flatMap((categoryId) => {
            const item = categoriesById.get(categoryId);
            return item ? [item.path] : [];
          })
          .join(" · "),
      };
    }),
  );
}

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

  const [productUnits, productCategoryIds] = await Promise.all([
    Promise.all(
      products.map((product) =>
        ctx.db
          .query("productUnits")
          .withIndex("by_organizationId_and_productId", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("productId", product._id),
          )
          .take(MAX_PRODUCT_UNITS + 1),
      ),
    ),
    Promise.all(
      products.map((product) => getProductCategoryIds(ctx, product)),
    ),
  ]);
  if (productUnits.some((rows) => rows.length > MAX_PRODUCT_UNITS)) {
    throw new ConvexError("Produktet har for mange enheder");
  }

  const unitIds = [
    ...new Set(productUnits.flatMap((rows) => rows.map((row) => row.unitId))),
  ];
  const [units, imageUrls] = await Promise.all([
    Promise.all(unitIds.map((unitId) => ctx.db.get("units", unitId))),
    Promise.all(
      products.map((product) =>
        product.imageStorageId
          ? ctx.storage.getUrl(product.imageStorageId)
          : null,
      ),
    ),
  ]);
  const unitsById = new Map(
    units.flatMap((unit) =>
      unit?.organizationId === organizationId
        ? [[unit._id, unit] as const]
        : [],
    ),
  );

  return products.map((product, index) => {
    const category = categoriesById.get(product.categoryId);
    if (!category) {
      throw new ConvexError("Produktets kategori blev ikke fundet");
    }
    const productCategories = productCategoryIds[index].flatMap(
      (categoryId) => {
        const item = categoriesById.get(categoryId);
        return item ? [item] : [];
      },
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
      categories: productCategories.map((item) => ({
        id: item.id,
        name: item.name,
        path: item.path,
        parentCategoryId: item.parentCategoryId,
      })),
      imageUrl: imageUrls[index],
      defaultUnitId: product.defaultUnitId,
      units: productUnits[index].flatMap((row) => {
        const unit = unitsById.get(row.unitId);
        return unit
          ? [
              {
                id: unit._id,
                name: unit.name,
                factorToDefault: row.factorToDefault,
              },
            ]
          : [];
      }),
    };
  });
}

export async function listLocationActiveProductCatalog(
  ctx: QueryCtx,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const [catalog, access] = await Promise.all([
    listActiveProductCatalog(ctx, organizationId),
    getLocationProductAccess(ctx, organizationId, locationId),
  ]);
  if (access.kind === "all") return catalog;
  return catalog.filter((product) =>
    access.effectiveProductIds.has(product.id),
  );
}
