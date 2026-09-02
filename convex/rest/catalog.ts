import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import {
  archiveProductWithAuth,
  createCategoryWithAuth,
  createProductWithAuth,
  createUnitWithAuth,
  deleteCategoryWithAuth,
  deleteProductWithAuth,
  deleteUnitWithAuth,
  mergeUnitsWithAuth,
  renameUnitWithAuth,
  restoreProductWithAuth,
  updateCategoryWithAuth,
  updateProductWithAuth,
} from "../catalog";
import { requireCatalogManager, type OrganizationAuth } from "../lib/auth";
import {
  buildCategoryHierarchy,
  MAX_CATEGORIES_PER_ORGANIZATION,
} from "../lib/categoryHierarchy";
import {
  getProductCategoryIds,
  MAX_PRODUCT_CATEGORIES,
} from "../lib/productCategories";
import { runIdempotent } from "../lib/idempotency";
import { requireRestApiMutation } from "./lib";

const MAX_PAGE_SIZE = 100;
const MAX_CHILD_ROWS = 200;

const statusValidator = v.union(v.literal("active"), v.literal("archived"));

const categoryValidator = v.object({
  id: v.id("categories"),
  name: v.string(),
  parentCategoryId: v.union(v.id("categories"), v.null()),
  path: v.string(),
  depth: v.number(),
  inUse: v.boolean(),
  hasChildren: v.boolean(),
});

const unitValidator = v.object({
  id: v.id("units"),
  name: v.string(),
  inUse: v.boolean(),
});

const productValidator = v.object({
  id: v.id("products"),
  name: v.string(),
  status: statusValidator,
  maxTemperatureCelsius: v.union(v.number(), v.null()),
  category: v.union(
    v.object({ id: v.id("categories"), name: v.string() }),
    v.null(),
  ),
  categories: v.array(
    v.object({ id: v.id("categories"), name: v.string() }),
  ),
  units: v.array(
    v.object({
      id: v.id("units"),
      name: v.string(),
      factorToDefault: v.number(),
      isDefault: v.boolean(),
    }),
  ),
  ingredients: v.array(
    v.object({
      productId: v.id("products"),
      productName: v.string(),
      productStatus: statusValidator,
      quantity: v.number(),
      unitId: v.id("units"),
      unitName: v.string(),
    }),
  ),
  updatedAt: v.string(),
  version: v.string(),
});

const idempotentResponseValidator = v.object({
  status: v.number(),
  json: v.string(),
  replayed: v.boolean(),
});

const categoryCreateInputValidator = v.object({
  name: v.string(),
  parentCategoryId: v.optional(v.union(v.string(), v.null())),
});

const categoryPatchInputValidator = v.object({
  name: v.optional(v.string()),
  parentCategoryId: v.optional(v.union(v.string(), v.null())),
});

const unitCreateInputValidator = v.object({ name: v.string() });
const unitPatchInputValidator = v.object({ name: v.string() });

const mergeUnitsInputValidator = v.object({
  sourceUnitId: v.string(),
  targetUnitId: v.string(),
});

const productUnitInputValidator = v.object({
  unitId: v.string(),
  factorToDefault: v.number(),
  isDefault: v.boolean(),
});

const ingredientInputValidator = v.object({
  productId: v.string(),
  quantity: v.number(),
  unitId: v.string(),
});

const productCreateInputValidator = v.object({
  name: v.string(),
  categoryId: v.optional(v.string()),
  categoryIds: v.optional(v.array(v.string())),
  units: v.array(productUnitInputValidator),
  ingredients: v.array(ingredientInputValidator),
  maxTemperatureCelsius: v.optional(v.union(v.number(), v.null())),
});

const productPatchInputValidator = v.object({
  name: v.optional(v.string()),
  categoryId: v.optional(v.string()),
  categoryIds: v.optional(v.array(v.string())),
  units: v.optional(v.array(productUnitInputValidator)),
  ingredients: v.optional(v.array(ingredientInputValidator)),
  maxTemperatureCelsius: v.optional(v.union(v.number(), v.null())),
});

type CategoryDto = {
  id: Id<"categories">;
  name: string;
  parentCategoryId: Id<"categories"> | null;
  path: string;
  depth: number;
  inUse: boolean;
  hasChildren: boolean;
};

type UnitDto = {
  id: Id<"units">;
  name: string;
  inUse: boolean;
};

type ProductDto = {
  id: Id<"products">;
  name: string;
  status: "active" | "archived";
  maxTemperatureCelsius: number | null;
  category: { id: Id<"categories">; name: string } | null;
  categories: Array<{ id: Id<"categories">; name: string }>;
  units: Array<{
    id: Id<"units">;
    name: string;
    factorToDefault: number;
    isDefault: boolean;
  }>;
  ingredients: Array<{
    productId: Id<"products">;
    productName: string;
    productStatus: "active" | "archived";
    quantity: number;
    unitId: Id<"units">;
    unitName: string;
  }>;
  updatedAt: string;
  version: string;
};

type ProductUnitInput = {
  unit: { kind: "existing"; id: Id<"units"> };
  factorToDefault: number;
  isDefault: boolean;
};

type IngredientInput = {
  productId: Id<"products">;
  quantity: number;
  unitId: Id<"units">;
};

function restError(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

function requireApiCatalogManager(auth: OrganizationAuth) {
  if (auth.principalKind !== "apiKey" || !auth.apiKeyId) {
    restError("api_key_required", "An API key is required for this operation.");
  }
}

function requirePageSize(numItems: number) {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > MAX_PAGE_SIZE) {
    restError(
      "page_size_invalid",
      "Page size must be an integer between 1 and 100.",
    );
  }
}

function normalizeId<Table extends "categories" | "units" | "products">(
  ctx: QueryCtx | MutationCtx,
  table: Table,
  value: string,
  code: string,
  label: string,
): Id<Table> {
  const id = ctx.db.normalizeId(table, value);
  if (!id) restError(code, `${label} was not found.`);
  return id;
}

function normalizeReferenceId<
  Table extends "categories" | "units" | "products",
>(
  ctx: QueryCtx | MutationCtx,
  table: Table,
  value: string,
  label: string,
): Id<Table> {
  const id = ctx.db.normalizeId(table, value);
  if (!id) restError("invalid_reference", `${label} is not a valid reference.`);
  return id;
}

function publicName(value: string, field: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 100) {
    restError(
      "validation_error",
      `${field} is required and must be at most 100 characters.`,
    );
  }
  return name;
}

async function categoriesForOrganization(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
) {
  const categories = await ctx.db
    .query("categories")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q.eq("organizationId", organizationId),
    )
    .take(MAX_CATEGORIES_PER_ORGANIZATION + 1);
  if (categories.length > MAX_CATEGORIES_PER_ORGANIZATION) {
    restError(
      "too_many_resources",
      "The organization has too many categories to expose safely.",
    );
  }
  try {
    return buildCategoryHierarchy(categories, organizationId);
  } catch {
    restError(
      "category_hierarchy_invalid",
      "The category hierarchy is invalid and cannot be exposed.",
    );
  }
}

async function categoryDto(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  category: Doc<"categories">,
  hierarchy?: Awaited<ReturnType<typeof categoriesForOrganization>>,
): Promise<CategoryDto> {
  const categories =
    hierarchy ?? (await categoriesForOrganization(ctx, organizationId));
  const current = categories.find((item) => item.id === category._id);
  if (!current) {
    restError(
      "category_hierarchy_invalid",
      "The category hierarchy is invalid and cannot be exposed.",
    );
  }
  const [primaryProduct, productMembership, staffFoodAllowance] =
    await Promise.all([
    ctx.db
      .query("products")
      .withIndex("by_organizationId_and_categoryId", (q) =>
        q.eq("organizationId", organizationId).eq("categoryId", category._id),
      )
      .first(),
    ctx.db
      .query("productCategories")
      .withIndex("by_organizationId_and_categoryId", (q) =>
        q.eq("organizationId", organizationId).eq("categoryId", category._id),
      )
      .first(),
    ctx.db
      .query("staffFoodRuleAllowances")
      .withIndex("by_organizationId_and_categoryId", (q) =>
        q.eq("organizationId", organizationId).eq("categoryId", category._id),
      )
      .first(),
  ]);
  return {
    ...current,
    inUse: Boolean(primaryProduct || productMembership || staffFoodAllowance),
  };
}

async function findCategory(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  value: string,
) {
  const id = normalizeId(
    ctx,
    "categories",
    value,
    "category_not_found",
    "Category",
  );
  const category = await ctx.db.get("categories", id);
  if (!category || category.organizationId !== organizationId) {
    restError("category_not_found", "Category was not found.");
  }
  return category;
}

async function findUnit(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  value: string,
) {
  const id = normalizeId(ctx, "units", value, "unit_not_found", "Unit");
  const unit = await ctx.db.get("units", id);
  if (!unit || unit.organizationId !== organizationId) {
    restError("unit_not_found", "Unit was not found.");
  }
  return unit;
}

async function findProduct(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  value: string,
) {
  const id = normalizeId(
    ctx,
    "products",
    value,
    "product_not_found",
    "Product",
  );
  const product = await ctx.db.get("products", id);
  if (!product || product.organizationId !== organizationId) {
    restError("product_not_found", "Product was not found.");
  }
  return product;
}

function requireProductVersion(
  product: Doc<"products">,
  expectedVersion: string,
) {
  if (String(product.updatedAt) !== expectedVersion) {
    restError(
      "precondition_failed",
      "The product has changed since the supplied version was read.",
    );
  }
}

async function safeCatalogMutation<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "object") {
      throw error;
    }
    restError(
      "conflict",
      "The catalog operation could not be completed in the current state.",
    );
  }
}

async function unitDto(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  unit: Doc<"units">,
): Promise<UnitDto> {
  const inUse = Boolean(
    await ctx.db
      .query("productUnits")
      .withIndex("by_organizationId_and_unitId", (q) =>
        q.eq("organizationId", organizationId).eq("unitId", unit._id),
      )
      .first(),
  );
  return { id: unit._id, name: unit.name, inUse };
}

async function productDto(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  product: Doc<"products">,
): Promise<ProductDto> {
  const [categoryIds, unitRows, ingredientRows] = await Promise.all([
    getProductCategoryIds(ctx, product),
    ctx.db
      .query("productUnits")
      .withIndex("by_organizationId_and_productId", (q) =>
        q.eq("organizationId", organizationId).eq("productId", product._id),
      )
      .take(MAX_CHILD_ROWS + 1),
    ctx.db
      .query("productIngredients")
      .withIndex("by_organizationId_and_productId", (q) =>
        q.eq("organizationId", organizationId).eq("productId", product._id),
      )
      .take(MAX_CHILD_ROWS + 1),
  ]);
  const categoryRows = await Promise.all(
    categoryIds.map((categoryId) => ctx.db.get("categories", categoryId)),
  );
  const categories = categoryRows.flatMap((category) =>
    category?.organizationId === organizationId
      ? [{ id: category._id, name: category.name }]
      : [],
  );
  const category = categories.find((item) => item.id === product.categoryId);
  if (
    unitRows.length > MAX_CHILD_ROWS ||
    ingredientRows.length > MAX_CHILD_ROWS
  ) {
    restError(
      "too_many_resources",
      "The product has too many related rows to expose safely.",
    );
  }
  const units = await Promise.all(
    unitRows.map(async (row) => {
      const unit = await ctx.db.get("units", row.unitId);
      if (!unit || unit.organizationId !== organizationId) return null;
      return {
        id: unit._id,
        name: unit.name,
        factorToDefault: row.factorToDefault,
        isDefault: unit._id === product.defaultUnitId,
      };
    }),
  );
  const ingredients = await Promise.all(
    ingredientRows.map(async (row) => {
      const [ingredientProduct, unit] = await Promise.all([
        ctx.db.get("products", row.ingredientProductId),
        ctx.db.get("units", row.unitId),
      ]);
      if (
        !ingredientProduct ||
        ingredientProduct.organizationId !== organizationId ||
        !unit ||
        unit.organizationId !== organizationId
      ) {
        return null;
      }
      return {
        productId: ingredientProduct._id,
        productName: ingredientProduct.name,
        productStatus: ingredientProduct.status,
        quantity: row.quantity,
        unitId: unit._id,
        unitName: unit.name,
      };
    }),
  );
  return {
    id: product._id,
    name: product.name,
    status: product.status,
    maxTemperatureCelsius: product.maxTemperatureCelsius ?? null,
    category: category ?? null,
    categories,
    units: units.filter((row): row is NonNullable<typeof row> => row !== null),
    ingredients: ingredients.filter(
      (row): row is NonNullable<typeof row> => row !== null,
    ),
    updatedAt: new Date(product.updatedAt).toISOString(),
    version: String(product.updatedAt),
  };
}

async function resolveCategoryId(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  value: string,
) {
  const id = normalizeReferenceId(ctx, "categories", value, "Category");
  const category = await ctx.db.get("categories", id);
  if (!category || category.organizationId !== organizationId) {
    restError(
      "invalid_reference",
      "Category is not part of this organization.",
    );
  }
  return id;
}

async function resolveCategoryIds(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  values: string[],
): Promise<[Id<"categories">, ...Id<"categories">[]]> {
  const [firstValue, ...additionalValues] = values;
  if (!firstValue || values.length > MAX_PRODUCT_CATEGORIES) {
    restError(
      "validation_error",
      `A product must have between 1 and ${MAX_PRODUCT_CATEGORIES} categories.`,
    );
  }
  const categoryIds: [Id<"categories">, ...Id<"categories">[]] = [
    await resolveCategoryId(ctx, organizationId, firstValue),
  ];
  for (const value of additionalValues) {
    categoryIds.push(await resolveCategoryId(ctx, organizationId, value));
  }
  if (new Set(categoryIds).size !== categoryIds.length) {
    restError("validation_error", "Each category may only be supplied once.");
  }
  return categoryIds;
}

async function resolveUnitInputs(
  ctx: MutationCtx,
  organizationId: string,
  inputs: Array<{
    unitId: string;
    factorToDefault: number;
    isDefault: boolean;
  }>,
): Promise<ProductUnitInput[]> {
  const resolved: ProductUnitInput[] = [];
  for (const input of inputs) {
    const unitId = normalizeReferenceId(ctx, "units", input.unitId, "Unit");
    const unit = await ctx.db.get("units", unitId);
    if (!unit || unit.organizationId !== organizationId) {
      restError("invalid_reference", "Unit is not part of this organization.");
    }
    resolved.push({
      unit: { kind: "existing", id: unitId },
      factorToDefault: input.factorToDefault,
      isDefault: input.isDefault,
    });
  }
  return resolved;
}

async function resolveIngredientInputs(
  ctx: MutationCtx,
  organizationId: string,
  inputs: Array<{ productId: string; quantity: number; unitId: string }>,
): Promise<IngredientInput[]> {
  const resolved: IngredientInput[] = [];
  for (const input of inputs) {
    const productId = normalizeReferenceId(
      ctx,
      "products",
      input.productId,
      "Ingredient product",
    );
    const unitId = normalizeReferenceId(
      ctx,
      "units",
      input.unitId,
      "Ingredient unit",
    );
    const [product, unit] = await Promise.all([
      ctx.db.get("products", productId),
      ctx.db.get("units", unitId),
    ]);
    if (!product || product.organizationId !== organizationId) {
      restError(
        "invalid_reference",
        "Ingredient product is not part of this organization.",
      );
    }
    if (!unit || unit.organizationId !== organizationId) {
      restError(
        "invalid_reference",
        "Ingredient unit is not part of this organization.",
      );
    }
    const configuredUnit = await ctx.db
      .query("productUnits")
      .withIndex("by_organizationId_and_productId_and_unitId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("productId", productId)
          .eq("unitId", unitId),
      )
      .unique();
    if (!configuredUnit) {
      restError(
        "invalid_reference",
        "Ingredient unit is not configured for the ingredient product.",
      );
    }
    resolved.push({ productId, quantity: input.quantity, unitId });
  }
  return resolved;
}

async function currentProductInputs(
  ctx: MutationCtx,
  organizationId: string,
  product: Doc<"products">,
) {
  const [unitRows, ingredientRows] = await Promise.all([
    ctx.db
      .query("productUnits")
      .withIndex("by_organizationId_and_productId", (q) =>
        q.eq("organizationId", organizationId).eq("productId", product._id),
      )
      .take(MAX_CHILD_ROWS + 1),
    ctx.db
      .query("productIngredients")
      .withIndex("by_organizationId_and_productId", (q) =>
        q.eq("organizationId", organizationId).eq("productId", product._id),
      )
      .take(MAX_CHILD_ROWS + 1),
  ]);
  if (
    unitRows.length > MAX_CHILD_ROWS ||
    ingredientRows.length > MAX_CHILD_ROWS
  ) {
    restError(
      "too_many_resources",
      "The product has too many related rows to update safely.",
    );
  }
  return {
    units: unitRows.map((row) => ({
      unit: { kind: "existing" as const, id: row.unitId },
      factorToDefault: row.factorToDefault,
      isDefault: row.unitId === product.defaultUnitId,
    })),
    ingredients: ingredientRows.map((row) => ({
      productId: row.ingredientProductId,
      quantity: row.quantity,
      unitId: row.unitId,
    })),
  };
}

export const listCategories = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(categoryValidator),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    requireApiCatalogManager(auth);
    requirePageSize(args.paginationOpts.numItems);
    const [result, hierarchy] = await Promise.all([
      ctx.db
        .query("categories")
        .withIndex("by_organizationId_and_normalizedName", (q) =>
          q.eq("organizationId", auth.organizationId),
        )
        .paginate(args.paginationOpts),
      categoriesForOrganization(ctx, auth.organizationId),
    ]);
    return {
      ...result,
      page: await Promise.all(
        result.page.map((category) =>
          categoryDto(ctx, auth.organizationId, category, hierarchy),
        ),
      ),
    };
  },
});

export const getCategory = query({
  args: { id: v.string() },
  returns: v.union(categoryValidator, v.null()),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    requireApiCatalogManager(auth);
    const id = ctx.db.normalizeId("categories", args.id);
    const category = id ? await ctx.db.get("categories", id) : null;
    if (!category || category.organizationId !== auth.organizationId)
      return null;
    return await categoryDto(ctx, auth.organizationId, category);
  },
});

export const createCategory = mutation({
  args: {
    idempotencyKey: v.string(),
    requestHash: v.string(),
    input: categoryCreateInputValidator,
  },
  returns: idempotentResponseValidator,
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    requireApiCatalogManager(auth);
    await requireRestApiMutation(ctx, auth);
    return await runIdempotent(
      ctx,
      auth,
      {
        operationId: "categories.create",
        key: args.idempotencyKey,
        requestHash: args.requestHash,
      },
      async () => {
        const name = publicName(args.input.name, "Category name");
        const parentCategoryId =
          args.input.parentCategoryId === undefined ||
          args.input.parentCategoryId === null
            ? null
            : await resolveCategoryId(
                ctx,
                auth.organizationId,
                args.input.parentCategoryId,
              );
        const id = await safeCatalogMutation(() =>
          createCategoryWithAuth(ctx, auth, {
            name,
            placement: parentCategoryId
              ? { kind: "child", parentCategoryId }
              : { kind: "root" },
          }),
        );
        const category = await ctx.db.get("categories", id);
        if (!category)
          restError("category_not_found", "Category was not found.");
        const data = await categoryDto(ctx, auth.organizationId, category);
        return { status: 201, json: JSON.stringify({ data }) };
      },
    );
  },
});

export const updateCategory = mutation({
  args: { id: v.string(), input: categoryPatchInputValidator },
  returns: categoryValidator,
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    requireApiCatalogManager(auth);
    await requireRestApiMutation(ctx, auth);
    const category = await findCategory(ctx, auth.organizationId, args.id);
    const parentCategoryId =
      args.input.parentCategoryId === undefined
        ? (category.parentCategoryId ?? null)
        : args.input.parentCategoryId === null
          ? null
          : await resolveCategoryId(
              ctx,
              auth.organizationId,
              args.input.parentCategoryId,
            );
    await safeCatalogMutation(() =>
      updateCategoryWithAuth(ctx, auth, {
        categoryId: category._id,
        name: args.input.name ?? category.name,
        parentCategoryId,
      }),
    );
    const updated = await ctx.db.get("categories", category._id);
    if (!updated) restError("category_not_found", "Category was not found.");
    return await categoryDto(ctx, auth.organizationId, updated);
  },
});

export const deleteCategory = mutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    requireApiCatalogManager(auth);
    await requireRestApiMutation(ctx, auth);
    const category = await findCategory(ctx, auth.organizationId, args.id);
    await safeCatalogMutation(() =>
      deleteCategoryWithAuth(ctx, auth, category._id),
    );
    return null;
  },
});

export const listUnits = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(unitValidator),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    requireApiCatalogManager(auth);
    requirePageSize(args.paginationOpts.numItems);
    const result = await ctx.db
      .query("units")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map((unit) => unitDto(ctx, auth.organizationId, unit)),
      ),
    };
  },
});

export const getUnit = query({
  args: { id: v.string() },
  returns: v.union(unitValidator, v.null()),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    requireApiCatalogManager(auth);
    const id = ctx.db.normalizeId("units", args.id);
    const unit = id ? await ctx.db.get("units", id) : null;
    return unit && unit.organizationId === auth.organizationId
      ? await unitDto(ctx, auth.organizationId, unit)
      : null;
  },
});

export const createUnit = mutation({
  args: {
    idempotencyKey: v.string(),
    requestHash: v.string(),
    input: unitCreateInputValidator,
  },
  returns: idempotentResponseValidator,
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    requireApiCatalogManager(auth);
    await requireRestApiMutation(ctx, auth);
    return await runIdempotent(
      ctx,
      auth,
      {
        operationId: "units.create",
        key: args.idempotencyKey,
        requestHash: args.requestHash,
      },
      async () => {
        const id = await safeCatalogMutation(() =>
          createUnitWithAuth(
            ctx,
            auth,
            publicName(args.input.name, "Unit name"),
          ),
        );
        const unit = await ctx.db.get("units", id);
        if (!unit) restError("unit_not_found", "Unit was not found.");
        const data = await unitDto(ctx, auth.organizationId, unit);
        return { status: 201, json: JSON.stringify({ data }) };
      },
    );
  },
});

export const updateUnit = mutation({
  args: { id: v.string(), input: unitPatchInputValidator },
  returns: unitValidator,
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    requireApiCatalogManager(auth);
    await requireRestApiMutation(ctx, auth);
    const unit = await findUnit(ctx, auth.organizationId, args.id);
    await safeCatalogMutation(() =>
      renameUnitWithAuth(ctx, auth, {
        unitId: unit._id,
        name: publicName(args.input.name, "Unit name"),
      }),
    );
    const updated = await ctx.db.get("units", unit._id);
    if (!updated) restError("unit_not_found", "Unit was not found.");
    return await unitDto(ctx, auth.organizationId, updated);
  },
});

export const deleteUnit = mutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    requireApiCatalogManager(auth);
    await requireRestApiMutation(ctx, auth);
    const unit = await findUnit(ctx, auth.organizationId, args.id);
    await safeCatalogMutation(() => deleteUnitWithAuth(ctx, auth, unit._id));
    return null;
  },
});

export const mergeUnits = mutation({
  args: {
    idempotencyKey: v.string(),
    requestHash: v.string(),
    input: mergeUnitsInputValidator,
  },
  returns: idempotentResponseValidator,
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    requireApiCatalogManager(auth);
    await requireRestApiMutation(ctx, auth);
    return await runIdempotent(
      ctx,
      auth,
      {
        operationId: "units.merge",
        key: args.idempotencyKey,
        requestHash: args.requestHash,
      },
      async () => {
        const sourceUnitId = normalizeReferenceId(
          ctx,
          "units",
          args.input.sourceUnitId,
          "Source unit",
        );
        const targetUnitId = normalizeReferenceId(
          ctx,
          "units",
          args.input.targetUnitId,
          "Target unit",
        );
        if (sourceUnitId === targetUnitId) {
          restError(
            "validation_error",
            "Source unit and target unit must be different.",
          );
        }
        const [source, target] = await Promise.all([
          ctx.db.get("units", sourceUnitId),
          ctx.db.get("units", targetUnitId),
        ]);
        if (
          !source ||
          source.organizationId !== auth.organizationId ||
          !target ||
          target.organizationId !== auth.organizationId
        ) {
          restError(
            "invalid_reference",
            "Both units must belong to this organization.",
          );
        }
        await safeCatalogMutation(() =>
          mergeUnitsWithAuth(ctx, auth, { sourceUnitId, targetUnitId }),
        );
        return {
          status: 200,
          json: JSON.stringify({ data: { targetUnitId } }),
        };
      },
    );
  },
});

export const listProducts = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(statusValidator),
  },
  returns: paginationResultValidator(productValidator),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    requireApiCatalogManager(auth);
    requirePageSize(args.paginationOpts.numItems);
    const result = args.status
      ? await ctx.db
          .query("products")
          .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
            q
              .eq("organizationId", auth.organizationId)
              .eq("status", args.status!),
          )
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("products")
          .withIndex("by_organizationId_and_normalizedName", (q) =>
            q.eq("organizationId", auth.organizationId),
          )
          .paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map((product) =>
          productDto(ctx, auth.organizationId, product),
        ),
      ),
    };
  },
});

export const getProduct = query({
  args: { id: v.string() },
  returns: v.union(productValidator, v.null()),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    requireApiCatalogManager(auth);
    const id = ctx.db.normalizeId("products", args.id);
    const product = id ? await ctx.db.get("products", id) : null;
    return product && product.organizationId === auth.organizationId
      ? await productDto(ctx, auth.organizationId, product)
      : null;
  },
});

export const createProduct = mutation({
  args: {
    idempotencyKey: v.string(),
    requestHash: v.string(),
    input: productCreateInputValidator,
  },
  returns: idempotentResponseValidator,
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    requireApiCatalogManager(auth);
    await requireRestApiMutation(ctx, auth);
    return await runIdempotent(
      ctx,
      auth,
      {
        operationId: "products.create",
        key: args.idempotencyKey,
        requestHash: args.requestHash,
      },
      async () => {
        if (
          args.input.categoryId !== undefined &&
          args.input.categoryIds !== undefined
        ) {
          restError(
            "validation_error",
            "Supply categoryIds or categoryId, not both.",
          );
        }
        const categoryIds = await resolveCategoryIds(
          ctx,
          auth.organizationId,
          args.input.categoryIds ??
            (args.input.categoryId ? [args.input.categoryId] : []),
        );
        const units = await resolveUnitInputs(
          ctx,
          auth.organizationId,
          args.input.units,
        );
        const ingredients = await resolveIngredientInputs(
          ctx,
          auth.organizationId,
          args.input.ingredients,
        );
        const id = await safeCatalogMutation(() =>
          createProductWithAuth(ctx, auth, {
            name: publicName(args.input.name, "Product name"),
            categories: categoryIds.map((id) => ({ kind: "existing", id })),
            units,
            ingredients,
            maxTemperatureCelsius: args.input.maxTemperatureCelsius,
          }),
        );
        const product = await ctx.db.get("products", id);
        if (!product) restError("product_not_found", "Product was not found.");
        const data = await productDto(ctx, auth.organizationId, product);
        return { status: 201, json: JSON.stringify({ data }) };
      },
    );
  },
});

export const updateProduct = mutation({
  args: {
    id: v.string(),
    expectedVersion: v.string(),
    input: productPatchInputValidator,
  },
  returns: productValidator,
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    requireApiCatalogManager(auth);
    await requireRestApiMutation(ctx, auth);
    const product = await findProduct(ctx, auth.organizationId, args.id);
    requireProductVersion(product, args.expectedVersion);
    const current = await currentProductInputs(
      ctx,
      auth.organizationId,
      product,
    );
    if (
      args.input.categoryId !== undefined &&
      args.input.categoryIds !== undefined
    ) {
      restError(
        "validation_error",
        "Supply categoryIds or categoryId, not both.",
      );
    }
    const currentCategoryIds = await getProductCategoryIds(ctx, product);
    const categoryIds =
      args.input.categoryIds !== undefined
        ? await resolveCategoryIds(
            ctx,
            auth.organizationId,
            args.input.categoryIds,
          )
        : args.input.categoryId !== undefined
          ? await resolveCategoryIds(
              ctx,
              auth.organizationId,
              [args.input.categoryId],
            )
          : currentCategoryIds;
    const unitInputs =
      args.input.units === undefined
        ? current.units
        : await resolveUnitInputs(ctx, auth.organizationId, args.input.units);
    const ingredientInputs =
      args.input.ingredients === undefined
        ? current.ingredients
        : await resolveIngredientInputs(
            ctx,
            auth.organizationId,
            args.input.ingredients,
          );
    const id = await safeCatalogMutation(() =>
      updateProductWithAuth(ctx, auth, {
        productId: product._id,
        name: publicName(args.input.name ?? product.name, "Product name"),
        categories: categoryIds.map((id) => ({ kind: "existing", id })),
        units: unitInputs,
        ingredients: ingredientInputs,
        maxTemperatureCelsius:
          args.input.maxTemperatureCelsius === undefined
            ? product.maxTemperatureCelsius
            : args.input.maxTemperatureCelsius,
      }),
    );
    const updated = await ctx.db.get("products", id);
    if (!updated) restError("product_not_found", "Product was not found.");
    return await productDto(ctx, auth.organizationId, updated);
  },
});

export const archiveProduct = mutation({
  args: {
    idempotencyKey: v.string(),
    requestHash: v.string(),
    id: v.string(),
    expectedVersion: v.string(),
  },
  returns: idempotentResponseValidator,
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    requireApiCatalogManager(auth);
    await requireRestApiMutation(ctx, auth);
    return await runIdempotent(
      ctx,
      auth,
      {
        operationId: "products.archive",
        key: args.idempotencyKey,
        requestHash: args.requestHash,
      },
      async () => {
        const product = await findProduct(ctx, auth.organizationId, args.id);
        requireProductVersion(product, args.expectedVersion);
        await safeCatalogMutation(() =>
          archiveProductWithAuth(ctx, auth, product._id),
        );
        const updated = await ctx.db.get("products", product._id);
        if (!updated) restError("product_not_found", "Product was not found.");
        const data = await productDto(ctx, auth.organizationId, updated);
        return { status: 200, json: JSON.stringify({ data }) };
      },
    );
  },
});

export const restoreProduct = mutation({
  args: {
    idempotencyKey: v.string(),
    requestHash: v.string(),
    id: v.string(),
    expectedVersion: v.string(),
  },
  returns: idempotentResponseValidator,
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    requireApiCatalogManager(auth);
    await requireRestApiMutation(ctx, auth);
    return await runIdempotent(
      ctx,
      auth,
      {
        operationId: "products.restore",
        key: args.idempotencyKey,
        requestHash: args.requestHash,
      },
      async () => {
        const product = await findProduct(ctx, auth.organizationId, args.id);
        requireProductVersion(product, args.expectedVersion);
        await safeCatalogMutation(() =>
          restoreProductWithAuth(ctx, auth, product._id),
        );
        const updated = await ctx.db.get("products", product._id);
        if (!updated) restError("product_not_found", "Product was not found.");
        const data = await productDto(ctx, auth.organizationId, updated);
        return { status: 200, json: JSON.stringify({ data }) };
      },
    );
  },
});

export const deleteProduct = mutation({
  args: { id: v.string(), expectedVersion: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    requireApiCatalogManager(auth);
    await requireRestApiMutation(ctx, auth);
    const product = await findProduct(ctx, auth.organizationId, args.id);
    requireProductVersion(product, args.expectedVersion);
    await safeCatalogMutation(() =>
      deleteProductWithAuth(ctx, auth, product._id),
    );
    return null;
  },
});
