import type { PaginationOptions } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  buildCategoryHierarchy,
  MAX_CATEGORIES_PER_ORGANIZATION,
} from "./categoryHierarchy";
import { getLocationProductAccess } from "./locationProducts";
import { getProductCategoryIds } from "./productCategories";

const MAX_PRODUCTS = 500;
const MAX_PRODUCT_UNITS = 200;

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

export function catalogPaginationOptions(options: PaginationOptions) {
  if (
    !Number.isInteger(options.numItems) ||
    options.numItems < 1 ||
    options.numItems > 100
  ) {
    throw new ConvexError("Vælg mellem 1 og 100 produkter pr. side");
  }
  return {
    ...options,
    maximumRowsRead: Math.min(options.maximumRowsRead ?? 25, 25),
    maximumBytesRead: Math.min(options.maximumBytesRead ?? 128 * 1024, 128 * 1024),
  };
}

export async function paginateActiveProducts(
  ctx: QueryCtx,
  organizationId: string,
  paginationOpts: PaginationOptions,
  locationId?: Id<"locations">,
) {
  const access = locationId
    ? await getLocationProductAccess(ctx, organizationId, locationId)
    : { kind: "all" as const };
  const products = ctx.db
    .query("products")
    .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
      q.eq("organizationId", organizationId).eq("status", "active"),
    );
  const eligible = access.kind === "all"
    ? products
    : products.filter((q) =>
        q.or(
          ...[...access.effectiveProductIds].map((id) =>
            q.eq(q.field("_id"), id),
          ),
        ),
      );
  return await eligible.paginate(catalogPaginationOptions(paginationOpts));
}

export async function listActiveProductPage(
  ctx: QueryCtx,
  organizationId: string,
  paginationOpts: PaginationOptions,
  locationId?: Id<"locations">,
) {
  const result = await paginateActiveProducts(ctx, organizationId, paginationOpts, locationId);
  return {
    ...result,
    page: await hydrateActiveProductCatalog(ctx, organizationId, result.page),
  };
}

export async function listActiveProductSearchOptionsPage(
  ctx: QueryCtx,
  organizationId: string,
  paginationOpts: PaginationOptions,
) {
  const [result, categories] = await Promise.all([
    ctx.db
      .query("products")
      .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId).eq("status", "active"),
      )
      .paginate(catalogPaginationOptions(paginationOpts)),
    ctx.db
      .query("categories")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_CATEGORIES_PER_ORGANIZATION + 1),
  ]);
  const hierarchy = buildCategoryHierarchy(categories, organizationId);
  const paths = new Map(hierarchy.map((category) => [category.id, category.path]));
  return {
    ...result,
    page: await Promise.all(
      result.page.map(async (product) => ({
        id: product._id,
        name: product.name,
        categoryPath: (await getProductCategoryIds(ctx, product))
          .flatMap((id) => paths.get(id) ?? [])
          .join(" · "),
      })),
    ),
  };
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
  const products = await ctx.db
    .query("products")
    .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
      q.eq("organizationId", organizationId).eq("status", "active"),
    )
    .take(MAX_PRODUCTS + 1);
  if (products.length > MAX_PRODUCTS) {
    throw new ConvexError(
      "Der er over 500 produkter. Arkivér produkter, du ikke bruger, eller kontakt en bruger med rollen Administrator",
    );
  }
  return await hydrateActiveProductCatalog(ctx, organizationId, products);
}

async function hydrateActiveProductCatalog(
  ctx: QueryCtx,
  organizationId: string,
  products: Doc<"products">[],
): Promise<ActiveProductCatalogItem[]> {
  if (products.length === 0) return [];
  const categories = await ctx.db
    .query("categories")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q.eq("organizationId", organizationId),
    )
    .take(MAX_CATEGORIES_PER_ORGANIZATION + 1);
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
  const access = await getLocationProductAccess(ctx, organizationId, locationId);
  if (access.kind === "all") {
    return await listActiveProductCatalog(ctx, organizationId);
  }
  const products = (
    await Promise.all(
      [...access.effectiveProductIds].map((productId) =>
        ctx.db.get("products", productId),
      ),
    )
  )
    .filter(
      (product): product is Doc<"products"> =>
        product !== null &&
        product.organizationId === organizationId &&
        product.status === "active",
    )
    .sort((left, right) =>
      left.normalizedName < right.normalizedName
        ? -1
        : left.normalizedName > right.normalizedName
          ? 1
          : left._creationTime - right._creationTime,
    );
  return await hydrateActiveProductCatalog(ctx, organizationId, products);
}
