import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  requireCatalogManager,
  requireOrganization,
  type OrganizationAuth,
} from "./lib/auth";
import {
  buildCategoryHierarchy,
  categoryIdsInSubtree,
  MAX_CATEGORIES_PER_ORGANIZATION,
  validateCategoryParentAssignment,
} from "./lib/categoryHierarchy";
import { normalizeStock } from "./lib/stock";
import { recordAudit } from "./lib/audit";
import {
  activeProductCatalogValidator,
  activeProductSearchOptionValidator,
  listActiveProductCatalog,
  listActiveProductSearchOptions as loadActiveProductSearchOptions,
} from "./lib/productCatalog";

const statusValidator = v.union(v.literal("active"), v.literal("archived"));

const categoryReferenceValidator = v.union(
  v.object({ kind: v.literal("existing"), id: v.id("categories") }),
  v.object({ kind: v.literal("new"), name: v.string() }),
);

const categoryPlacementValidator = v.union(
  v.object({ kind: v.literal("root") }),
  v.object({
    kind: v.literal("child"),
    parentCategoryId: v.id("categories"),
  }),
  v.object({
    kind: v.literal("parent"),
    childCategoryId: v.id("categories"),
  }),
);

const categoryOptionValidator = v.object({
  id: v.id("categories"),
  name: v.string(),
  parentCategoryId: v.union(v.id("categories"), v.null()),
  path: v.string(),
  depth: v.number(),
});

const managedCategoryValidator = categoryOptionValidator.extend({
  inUse: v.boolean(),
  hasChildren: v.boolean(),
});

const catalogProductValidator = v.object({
  id: v.id("products"),
  name: v.string(),
  status: statusValidator,
  category: v.union(
    v.object({ id: v.id("categories"), name: v.string() }),
    v.null(),
  ),
  defaultUnit: v.union(
    v.object({ id: v.id("units"), name: v.string() }),
    v.null(),
  ),
  unitCount: v.number(),
  ingredientCount: v.number(),
  imageUrl: v.union(v.string(), v.null()),
  deletesAt: v.union(v.number(), v.null()),
});

const productDetailValidator = v.object({
  id: v.id("products"),
  name: v.string(),
  status: statusValidator,
  maxTemperatureCelsius: v.union(v.number(), v.null()),
  category: v.union(
    v.object({ id: v.id("categories"), name: v.string() }),
    v.null(),
  ),
  imageUrl: v.union(v.string(), v.null()),
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
});

const productFormOptionsValidator = v.object({
  categories: v.array(
    v.object({
      id: v.id("categories"),
      name: v.string(),
      path: v.string(),
    }),
  ),
  units: v.array(v.object({ id: v.id("units"), name: v.string() })),
});

const managedUnitValidator = v.object({
  id: v.id("units"),
  name: v.string(),
  inUse: v.boolean(),
});

const unitReferenceValidator = v.union(
  v.object({ kind: v.literal("existing"), id: v.id("units") }),
  v.object({ kind: v.literal("new"), name: v.string() }),
);

const productUnitInputValidator = v.object({
  unit: unitReferenceValidator,
  factorToDefault: v.number(),
  isDefault: v.boolean(),
});

const ingredientInputValidator = v.object({
  productId: v.id("products"),
  quantity: v.number(),
  unitId: v.id("units"),
});

const maxTemperatureInputValidator = v.optional(
  v.union(v.number(), v.null()),
);

const productExportValidator = v.object({
  sourceId: v.id("products"),
  name: v.string(),
  status: statusValidator,
  category: v.string(),
  maxTemperatureCelsius: v.union(v.number(), v.null()),
  units: v.array(
    v.object({
      name: v.string(),
      factorToDefault: v.number(),
      isDefault: v.boolean(),
    }),
  ),
  ingredients: v.array(
    v.object({
      sourceProductId: v.id("products"),
      quantity: v.number(),
      unit: v.string(),
    }),
  ),
  imageUrl: v.union(v.string(), v.null()),
});

const importedProductUnitValidator = v.object({
  name: v.string(),
  factorToDefault: v.number(),
  isDefault: v.boolean(),
});

const importedIngredientValidator = v.object({
  productId: v.id("products"),
  quantity: v.number(),
  unitName: v.string(),
});

const bulkProductCategoryArgs = v.object({
  productIds: v.array(v.id("products")),
  categoryId: v.id("categories"),
});

type ProductStatus = "active" | "archived";

type CategoryReference =
  { kind: "existing"; id: Id<"categories"> } | { kind: "new"; name: string };

type UnitReference =
  { kind: "existing"; id: Id<"units"> } | { kind: "new"; name: string };

type ProductUnitInput = {
  unit: UnitReference;
  factorToDefault: number;
  isDefault: boolean;
};

type IngredientInput = {
  productId: Id<"products">;
  quantity: number;
  unitId: Id<"units">;
};

type CategoryPlacement =
  | { kind: "root" }
  | { kind: "child"; parentCategoryId: Id<"categories"> }
  | { kind: "parent"; childCategoryId: Id<"categories"> };

const MAX_NAME_LENGTH = 100;
const MAX_CHILD_ROWS = 200;
const MAX_BULK_PRODUCT_SELECTION = 200;
const MAX_GRAPH_PRODUCTS = 500;
const MAX_LOCATIONS_PER_ORGANIZATION = 200;
const MAX_FUZZY_SEARCH_SCAN = 500;
const MAX_PUBLIC_PAGE_SIZE = 100;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ARCHIVE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

function requirePageSize(numItems: number, maximum: number) {
  if (
    !Number.isInteger(numItems) ||
    numItems <= 0 ||
    numItems > maximum
  ) {
    throw new ConvexError("Siden er for stor");
  }
}

function normalizeName(value: string, label: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new ConvexError(`${label} skal udfyldes`);
  if (name.length > MAX_NAME_LENGTH) {
    throw new ConvexError(`${label} må højst være ${MAX_NAME_LENGTH} tegn`);
  }
  return { name, normalizedName: name.toLocaleLowerCase("da") };
}

function normalizeSearch(value: string) {
  return value
    .toLocaleLowerCase("da")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function loadCategoryHierarchy(
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
    throw new ConvexError("Organisationen har for mange kategorier");
  }
  return {
    categories,
    hierarchy: buildCategoryHierarchy(categories, organizationId),
  };
}

function editDistance(left: string, right: string) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }

  return previous[right.length];
}

function fuzzyScore(name: string, search: string) {
  const normalizedName = normalizeSearch(name);
  const normalizedSearch = normalizeSearch(search);
  if (normalizedName.includes(normalizedSearch)) return 0;

  const words = normalizedName.split(" ");
  let score = 0;

  for (const term of normalizedSearch.split(" ")) {
    if (term.length < 3) return null;
    const tolerance = Math.max(1, Math.floor(term.length / 3));
    let best = Number.POSITIVE_INFINITY;

    for (const word of words) {
      for (
        let length = Math.max(1, term.length - tolerance);
        length <= Math.min(word.length, term.length + tolerance);
        length++
      ) {
        best = Math.min(best, editDistance(term, word.slice(0, length)));
      }
    }

    if (best > tolerance) return null;
    score += best;
  }

  return score;
}

type CategorySearchCursor = {
  searchKey: string;
  status: ProductStatus;
  categoryId: string | null;
  categoryIds: string[];
  categoryCursor: string | null;
  categoryDone: boolean;
  nameOffset: number;
};

function parseCategorySearchCursor(
  cursor: string | null,
  categoryIds: Id<"categories">[],
  searchKey: string,
  status: ProductStatus,
  categoryId: Id<"categories"> | undefined,
): CategorySearchCursor {
  const expectedCategoryIds = categoryIds as string[];
  if (!cursor) {
    return {
      searchKey,
      status,
      categoryId: categoryId ?? null,
      categoryIds: expectedCategoryIds,
      categoryCursor: null,
      categoryDone: false,
      nameOffset: 0,
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(cursor);
  } catch {
    throw new ConvexError("Sideringen er ugyldig");
  }
  if (!value || typeof value !== "object") {
    throw new ConvexError("Sideringen er ugyldig");
  }

  const parsed = value as {
    searchKey?: unknown;
    status?: unknown;
    categoryId?: unknown;
    categoryIds?: unknown;
    categoryCursor?: unknown;
    categoryDone?: unknown;
    nameOffset?: unknown;
  };
  if (
    parsed.searchKey !== searchKey ||
    parsed.status !== status ||
    parsed.categoryId !== (categoryId ?? null) ||
    !Array.isArray(parsed.categoryIds) ||
    parsed.categoryIds.some((id) => typeof id !== "string") ||
    parsed.categoryIds.length !== expectedCategoryIds.length ||
    parsed.categoryIds.some(
      (id, index) => id !== expectedCategoryIds[index],
    ) ||
    (parsed.categoryCursor !== null &&
      typeof parsed.categoryCursor !== "string") ||
    typeof parsed.categoryDone !== "boolean" ||
    typeof parsed.nameOffset !== "number" ||
    !Number.isInteger(parsed.nameOffset) ||
    parsed.nameOffset < 0
  ) {
    throw new ConvexError("Sideringen er ugyldig");
  }

  return {
    searchKey: parsed.searchKey as string,
    status: parsed.status as ProductStatus,
    categoryId: parsed.categoryId as string | null,
    categoryIds: parsed.categoryIds as string[],
    categoryCursor: parsed.categoryCursor as string | null,
    categoryDone: parsed.categoryDone as boolean,
    nameOffset: parsed.nameOffset as number,
  };
}

function requirePositiveNumber(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ConvexError(`${label} skal være større end nul`);
  }
}

function requireTemperature(value: number, label: string) {
  if (
    !Number.isFinite(value) ||
    value < -100 ||
    value > 100 ||
    !Number.isInteger(value * 10)
  ) {
    throw new ConvexError(
      `${label} skal være mellem -100 og 100 med højst én decimal`,
    );
  }
}

async function assertProductNameAvailable(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  normalizedName: string,
  excludingProductId?: Id<"products">,
) {
  const existing = await ctx.db
    .query("products")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("normalizedName", normalizedName),
    )
    .unique();

  if (existing && existing._id !== excludingProductId) {
    throw new ConvexError("Der findes allerede et produkt med dette navn");
  }
}

async function resolveCategory(
  ctx: MutationCtx,
  organizationId: string,
  reference: CategoryReference,
) {
  if (reference.kind === "existing") {
    const category = await ctx.db.get("categories", reference.id);
    if (!category || category.organizationId !== organizationId) {
      throw new ConvexError("Kategorien blev ikke fundet");
    }
    return category._id;
  }

  const { name, normalizedName } = normalizeName(
    reference.name,
    "Kategorinavnet",
  );
  const existing = await ctx.db
    .query("categories")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("normalizedName", normalizedName),
    )
    .unique();

  if (!existing) {
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_CATEGORIES_PER_ORGANIZATION);
    if (categories.length >= MAX_CATEGORIES_PER_ORGANIZATION) {
      throw new ConvexError("Der kan højst oprettes 200 kategorier");
    }
  }

  return (
    existing?._id ??
    (await ctx.db.insert("categories", {
      organizationId,
      name,
      normalizedName,
    }))
  );
}

async function resolveUnits(
  ctx: MutationCtx,
  organizationId: string,
  inputs: ProductUnitInput[],
) {
  if (inputs.length === 0) {
    throw new ConvexError("Tilføj mindst én enhed");
  }
  if (inputs.length > MAX_CHILD_ROWS) {
    throw new ConvexError("Produktet har for mange enheder");
  }

  const defaultRows = inputs.filter((input) => input.isDefault);
  if (defaultRows.length !== 1) {
    throw new ConvexError("Vælg præcis én standardenhed");
  }

  const insertedByName = new Map<string, Id<"units">>();
  const resolved: Array<{
    unitId: Id<"units">;
    factorToDefault: number;
    isDefault: boolean;
  }> = [];

  for (const input of inputs) {
    requirePositiveNumber(input.factorToDefault, "Omregningsfaktoren");
    if (input.isDefault && input.factorToDefault !== 1) {
      throw new ConvexError("Omregningen for standardenheden skal være 1");
    }

    let unitId: Id<"units">;
    if (input.unit.kind === "existing") {
      const unit = await ctx.db.get("units", input.unit.id);
      if (!unit || unit.organizationId !== organizationId) {
        throw new ConvexError("Enheden blev ikke fundet");
      }
      unitId = unit._id;
    } else {
      const { name, normalizedName } = normalizeName(
        input.unit.name,
        "Enhedsnavnet",
      );
      const inserted = insertedByName.get(normalizedName);
      if (inserted) {
        unitId = inserted;
      } else {
        const existing = await ctx.db
          .query("units")
          .withIndex("by_organizationId_and_normalizedName", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("normalizedName", normalizedName),
          )
          .unique();
        unitId =
          existing?._id ??
          (await ctx.db.insert("units", {
            organizationId,
            name,
            normalizedName,
          }));
        insertedByName.set(normalizedName, unitId);
      }
    }

    resolved.push({
      unitId,
      factorToDefault: input.factorToDefault,
      isDefault: input.isDefault,
    });
  }

  if (new Set(resolved.map((row) => row.unitId)).size !== resolved.length) {
    throw new ConvexError("Hver enhed kan kun tilføjes én gang");
  }

  return resolved;
}

async function validateIngredients(
  ctx: MutationCtx,
  organizationId: string,
  ingredients: IngredientInput[],
  productId?: Id<"products">,
  allowedArchivedProductIds = new Set<Id<"products">>(),
) {
  if (ingredients.length > MAX_CHILD_ROWS) {
    throw new ConvexError("Produktet har for mange ingredienser");
  }
  if (
    new Set(ingredients.map((row) => row.productId)).size !== ingredients.length
  ) {
    throw new ConvexError("Hver ingrediens kan kun tilføjes én gang");
  }

  for (const ingredient of ingredients) {
    requirePositiveNumber(ingredient.quantity, "Ingrediensmængden");
    if (productId && ingredient.productId === productId) {
      throw new ConvexError("Et produkt kan ikke indeholde sig selv");
    }

    const ingredientProduct = await ctx.db.get(
      "products",
      ingredient.productId,
    );
    if (
      !ingredientProduct ||
      ingredientProduct.organizationId !== organizationId ||
      (ingredientProduct.status === "archived" &&
        !allowedArchivedProductIds.has(ingredientProduct._id))
    ) {
      throw new ConvexError("Ingrediensproduktet blev ikke fundet");
    }

    const productUnit = await ctx.db
      .query("productUnits")
      .withIndex("by_organizationId_and_productId_and_unitId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("productId", ingredient.productId)
          .eq("unitId", ingredient.unitId),
      )
      .unique();
    if (!productUnit) {
      throw new ConvexError(
        "Vælg en enhed, der er konfigureret for ingrediensen",
      );
    }
  }
}

async function assertNoRecipeCycle(
  ctx: MutationCtx,
  organizationId: string,
  productId: Id<"products">,
  ingredients: IngredientInput[],
) {
  const queue = ingredients.map((ingredient) => ingredient.productId);
  const visited = new Set<Id<"products">>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === productId) {
      throw new ConvexError(
        "Opskriften ville oprette en cirkulær ingrediensreference",
      );
    }
    if (visited.has(current)) continue;
    visited.add(current);
    if (visited.size > MAX_GRAPH_PRODUCTS) {
      throw new ConvexError("Opskriftsstrukturen er for stor til at validere");
    }

    const rows = await ctx.db
      .query("productIngredients")
      .withIndex("by_organizationId_and_productId", (q) =>
        q.eq("organizationId", organizationId).eq("productId", current),
      )
      .take(MAX_CHILD_ROWS);
    queue.push(...rows.map((row) => row.ingredientProductId));
  }
}

async function replaceProductChildren(
  ctx: MutationCtx,
  organizationId: string,
  productId: Id<"products">,
  units: Awaited<ReturnType<typeof resolveUnits>>,
  ingredients: IngredientInput[],
) {
  const existingUnits = await ctx.db
    .query("productUnits")
    .withIndex("by_organizationId_and_productId", (q) =>
      q.eq("organizationId", organizationId).eq("productId", productId),
    )
    .take(MAX_CHILD_ROWS);

  const nextUnitIds = new Set(units.map((row) => row.unitId));
  for (const row of existingUnits) {
    if (nextUnitIds.has(row.unitId)) continue;
    const usedByRecipe = await ctx.db
      .query("productIngredients")
      .withIndex("by_organizationId_and_ingredientProductId_and_unitId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("ingredientProductId", productId)
          .eq("unitId", row.unitId),
      )
      .first();
    if (usedByRecipe) {
      throw new ConvexError(
        "En enhed, der bruges af en anden opskrift, kan ikke fjernes",
      );
    }
  }

  const existingIngredients = await ctx.db
    .query("productIngredients")
    .withIndex("by_organizationId_and_productId", (q) =>
      q.eq("organizationId", organizationId).eq("productId", productId),
    )
    .take(MAX_CHILD_ROWS);

  for (const row of existingUnits) await ctx.db.delete("productUnits", row._id);
  for (const row of existingIngredients) {
    await ctx.db.delete("productIngredients", row._id);
  }

  for (const row of units) {
    await ctx.db.insert("productUnits", {
      organizationId,
      productId,
      unitId: row.unitId,
      factorToDefault: row.factorToDefault,
    });
  }
  for (const row of ingredients) {
    await ctx.db.insert("productIngredients", {
      organizationId,
      productId,
      ingredientProductId: row.productId,
      quantity: row.quantity,
      unitId: row.unitId,
    });
  }
}

async function scrubProductFromCountOrder(
  ctx: MutationCtx,
  organizationId: string,
  productId: Id<"products">,
) {
  const locations = await ctx.db
    .query("locations")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q.eq("organizationId", organizationId),
    )
    .take(MAX_LOCATIONS_PER_ORGANIZATION + 1);
  if (locations.length > MAX_LOCATIONS_PER_ORGANIZATION) {
    throw new ConvexError("Organisationen har for mange lokationer");
  }
  for (const location of locations) {
    if (!location.countProductOrder?.includes(productId)) continue;
    await ctx.db.patch("locations", location._id, {
      countProductOrder: location.countProductOrder.filter(
        (orderedProductId) => orderedProductId !== productId,
      ),
    });
  }
}

async function permanentlyDeleteProduct(
  ctx: MutationCtx,
  product: Doc<"products">,
) {
  const countItem = await ctx.db
    .query("countItems")
    .withIndex("by_organizationId_and_productId", (q) =>
      q
        .eq("organizationId", product.organizationId)
        .eq("productId", product._id),
    )
    .first();
  if (countItem) {
    throw new ConvexError(
      "Produktet kan ikke slettes, fordi det indgår i Count-historik",
    );
  }
  const [
    units,
    ingredients,
    recipeReferences,
    stockRows,
    staffFoodRules,
  ] = await Promise.all([
    ctx.db
      .query("productUnits")
      .withIndex("by_organizationId_and_productId", (q) =>
        q
          .eq("organizationId", product.organizationId)
          .eq("productId", product._id),
      )
      .take(MAX_CHILD_ROWS + 1),
    ctx.db
      .query("productIngredients")
      .withIndex("by_organizationId_and_productId", (q) =>
        q
          .eq("organizationId", product.organizationId)
          .eq("productId", product._id),
      )
      .take(MAX_CHILD_ROWS + 1),
    ctx.db
      .query("productIngredients")
      .withIndex("by_organizationId_and_ingredientProductId", (q) =>
        q
          .eq("organizationId", product.organizationId)
          .eq("ingredientProductId", product._id),
      )
      .take(MAX_GRAPH_PRODUCTS + 1),
    ctx.db
      .query("locationStock")
      .withIndex("by_organizationId_and_productId", (q) =>
        q
          .eq("organizationId", product.organizationId)
          .eq("productId", product._id),
      )
      .take(MAX_CHILD_ROWS + 1),
    ctx.db
      .query("staffFoodRuleProducts")
      .withIndex("by_organizationId_and_productId", (q) =>
        q
          .eq("organizationId", product.organizationId)
          .eq("productId", product._id),
      )
      .take(MAX_CHILD_ROWS + 1),
  ]);

  if (
    units.length > MAX_CHILD_ROWS ||
    ingredients.length > MAX_CHILD_ROWS ||
    recipeReferences.length > MAX_GRAPH_PRODUCTS ||
    stockRows.length > MAX_CHILD_ROWS ||
    staffFoodRules.length > MAX_CHILD_ROWS
  ) {
    throw new ConvexError(
      "Produktet har for mange relationer til at blive slettet",
    );
  }

  for (const row of units) await ctx.db.delete("productUnits", row._id);
  for (const row of ingredients) {
    await ctx.db.delete("productIngredients", row._id);
  }
  for (const row of recipeReferences) {
    await ctx.db.delete("productIngredients", row._id);
  }
  for (const row of stockRows) await ctx.db.delete("locationStock", row._id);
  for (const row of staffFoodRules) {
    await ctx.db.delete("staffFoodRuleProducts", row._id);
  }
  await scrubProductFromCountOrder(ctx, product.organizationId, product._id);
  await ctx.scheduler.runAfter(0, internal.waste.cleanupProductData, {
    organizationId: product.organizationId,
    productId: product._id,
  });
  if (product.imageStorageId) {
    await ctx.storage.delete(product.imageStorageId);
  }
  await ctx.db.delete("products", product._id);
}

async function hydrateCatalogProduct(
  ctx: QueryCtx,
  product: Doc<"products">,
  lookups: {
    categoriesById: ReadonlyMap<
      Id<"categories">,
      { id: Id<"categories">; name: string }
    >;
    defaultUnitsById: ReadonlyMap<Id<"units">, Doc<"units">>;
  },
) {
  const [units, ingredients, imageUrl] = await Promise.all([
    ctx.db
      .query("productUnits")
      .withIndex("by_organizationId_and_productId", (q) =>
        q
          .eq("organizationId", product.organizationId)
          .eq("productId", product._id),
      )
      .take(MAX_CHILD_ROWS),
    ctx.db
      .query("productIngredients")
      .withIndex("by_organizationId_and_productId", (q) =>
        q
          .eq("organizationId", product.organizationId)
          .eq("productId", product._id),
      )
      .take(MAX_CHILD_ROWS),
    product.imageStorageId
      ? ctx.storage.getUrl(product.imageStorageId)
      : Promise.resolve(null),
  ]);
  const category = lookups.categoriesById.get(product.categoryId);
  const defaultUnit = lookups.defaultUnitsById.get(product.defaultUnitId);

  return {
    id: product._id,
    name: product.name,
    status: product.status,
    category: category ? { id: category.id, name: category.name } : null,
    defaultUnit: defaultUnit
      ? { id: defaultUnit._id, name: defaultUnit.name }
      : null,
    unitCount: units.length,
    ingredientCount: ingredients.length,
    imageUrl,
    deletesAt: product.archivedAt
      ? product.archivedAt + ARCHIVE_RETENTION_MS
      : null,
  };
}

export const listProducts = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: statusValidator,
    categoryId: v.optional(v.id("categories")),
    search: v.string(),
  },
  returns: paginationResultValidator(catalogProductValidator),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganization(ctx);
    requirePageSize(args.paginationOpts.numItems, MAX_PUBLIC_PAGE_SIZE);
    const { hierarchy: categoryHierarchy } = await loadCategoryHierarchy(
      ctx,
      organizationId,
    );
    const categoryPaths = new Map(
      categoryHierarchy.map((category) => [category.id, category.path]),
    );
    const categoriesById = new Map(
      categoryHierarchy.map((category) => [
        category.id,
        { id: category.id, name: category.name },
      ]),
    );
    const categoryIds = args.categoryId
      ? categoryIdsInSubtree(categoryHierarchy, args.categoryId)
      : null;
    if (args.categoryId && !categoriesById.has(args.categoryId)) {
      throw new ConvexError("Kategorien blev ikke fundet");
    }

    const search = args.search.trim();
    const results = search
      ? await (async () => {
          const scanned = await ctx.db
            .query("products")
            .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
              q.eq("organizationId", organizationId).eq("status", args.status),
            )
            .take(MAX_FUZZY_SEARCH_SCAN + 1);
          if (scanned.length > MAX_FUZZY_SEARCH_SCAN) {
            const matchingCategoryIds = categoryHierarchy
              .filter((category) => fuzzyScore(category.path, search) !== null)
              .filter(
                (category) =>
                  !categoryIds || categoryIds.has(category.id),
                )
                .map((category) => category.id);
            if (matchingCategoryIds.length > 0) {
              const cursor = parseCategorySearchCursor(
                args.paginationOpts.cursor,
                matchingCategoryIds,
                normalizeSearch(search),
                args.status,
                args.categoryId,
              );
              const matchingCategoryIdSet = new Set(cursor.categoryIds);
              const categoryQuery = () =>
                ctx.db
                  .query("products")
                  .withIndex(
                    "by_organizationId_and_status_and_categoryId_and_normalizedName",
                    (q) =>
                      q
                        .eq("organizationId", organizationId)
                        .eq("status", args.status),
                  )
                  .filter((q) =>
                    q.or(
                      ...matchingCategoryIds.map((categoryId) =>
                        q.eq(q.field("categoryId"), categoryId),
                      ),
                    ),
                  )
                  .order("asc");
              const nameMatches = async () =>
                await ctx.db
                  .query("products")
                  .withSearchIndex("search_name", (q) => {
                    const productSearch = q
                      .search("name", search)
                      .eq("organizationId", organizationId)
                      .eq("status", args.status);
                    return productSearch;
                  })
                  .take(MAX_FUZZY_SEARCH_SCAN);

              if (!cursor.categoryDone) {
                const categoryResults = await categoryQuery().paginate({
                  ...args.paginationOpts,
                  cursor: cursor.categoryCursor,
                });
                if (!categoryResults.isDone) {
                  return {
                    ...categoryResults,
                    continueCursor: JSON.stringify({
                      ...cursor,
                      categoryCursor: categoryResults.continueCursor,
                    }),
                  };
                }

                const matchingNames = (await nameMatches()).filter(
                  (product) =>
                    (!categoryIds || categoryIds.has(product.categoryId)) &&
                    !matchingCategoryIdSet.has(product.categoryId),
                );
                const remainingItems = Math.max(
                  args.paginationOpts.numItems - categoryResults.page.length,
                  0,
                );
                const namePage = matchingNames.slice(
                  cursor.nameOffset,
                  cursor.nameOffset + remainingItems,
                );
                const nextNameOffset = cursor.nameOffset + namePage.length;
                return {
                  page: [...categoryResults.page, ...namePage],
                  isDone: nextNameOffset >= matchingNames.length,
                  continueCursor: JSON.stringify({
                    ...cursor,
                    categoryCursor: categoryResults.continueCursor,
                    categoryDone: true,
                    nameOffset: nextNameOffset,
                  }),
                };
              }

              const matchingNames = (await nameMatches()).filter(
                (product) =>
                  (!categoryIds || categoryIds.has(product.categoryId)) &&
                  !matchingCategoryIdSet.has(product.categoryId),
              );
              const namePage = matchingNames.slice(
                cursor.nameOffset,
                cursor.nameOffset + args.paginationOpts.numItems,
              );
              return {
                page: namePage,
                isDone:
                  cursor.nameOffset + namePage.length >= matchingNames.length,
                continueCursor: JSON.stringify({
                  ...cursor,
                  nameOffset: cursor.nameOffset + namePage.length,
                }),
              };
            }
            return await ctx.db
              .query("products")
              .withSearchIndex("search_name", (q) => {
                const productSearch = q
                  .search("name", search)
                  .eq("organizationId", organizationId)
                  .eq("status", args.status);
                return productSearch;
              })
              .paginate(args.paginationOpts);
          }
          if (
            args.paginationOpts.cursor &&
            !/^\d+$/.test(args.paginationOpts.cursor)
          ) {
            throw new ConvexError("Sideringen er ugyldig");
          }
          const matches = scanned
            .map((product) => {
              const productScore = fuzzyScore(product.name, search);
              const categoryScore = fuzzyScore(
                categoryPaths.get(product.categoryId) ?? "",
                search,
              );
              return {
                product,
                score:
                  productScore === null
                    ? categoryScore
                    : categoryScore === null
                      ? productScore
                      : Math.min(productScore, categoryScore),
              };
            })
            .filter(
              (match): match is { product: Doc<"products">; score: number } =>
                match.score !== null &&
                (!categoryIds || categoryIds.has(match.product.categoryId)),
            )
            .sort((left, right) => left.score - right.score)
            .map((match) => match.product);
          const offset = Number(args.paginationOpts.cursor ?? 0);
          if (!Number.isInteger(offset) || offset < 0) {
            throw new ConvexError("Søgeresultatet kan ikke fortsættes");
          }
          const end = Math.min(
            offset + args.paginationOpts.numItems,
            matches.length,
          );
          return {
            page: matches.slice(offset, end),
            isDone: end === matches.length,
            continueCursor: String(end),
          };
        })()
      : args.categoryId
        ? await ctx.db
            .query("products")
            .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
              q.eq("organizationId", organizationId).eq("status", args.status),
            )
            .filter((q) =>
              q.or(
                ...[...(categoryIds ?? [])].map((categoryId) =>
                  q.eq(q.field("categoryId"), categoryId),
                ),
              ),
            )
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("products")
            .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
              q.eq("organizationId", organizationId).eq("status", args.status),
            )
            .paginate(args.paginationOpts);

    const defaultUnitIds = [
      ...new Set(results.page.map((product) => product.defaultUnitId)),
    ];
    const defaultUnits = await Promise.all(
      defaultUnitIds.map((unitId) => ctx.db.get("units", unitId)),
    );
    const defaultUnitsById = new Map(
      defaultUnits.flatMap((unit) =>
        unit?.organizationId === organizationId
          ? [[unit._id, unit] as const]
          : [],
      ),
    );
    const lookups = { categoriesById, defaultUnitsById };

    return {
      ...results,
      page: await Promise.all(
        results.page.map((product) =>
          hydrateCatalogProduct(ctx, product, lookups),
        ),
      ),
    };
  },
});

export const listActiveProducts = query({
  args: {},
  returns: v.array(activeProductCatalogValidator),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganization(ctx);
    return await listActiveProductCatalog(ctx, organizationId);
  },
});

export const listActiveProductSearchOptions = query({
  args: {},
  returns: v.array(activeProductSearchOptionValidator),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganization(ctx);
    return await loadActiveProductSearchOptions(ctx, organizationId);
  },
});

export const exportProducts = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(productExportValidator),
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
    requirePageSize(args.paginationOpts.numItems, 25);

    const results = await ctx.db
      .query("products")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .paginate(args.paginationOpts);

    return {
      ...results,
      page: await Promise.all(
        results.page.map(async (product) => {
          const [category, unitRows, ingredientRows, imageUrl] =
            await Promise.all([
              ctx.db.get("categories", product.categoryId),
              ctx.db
                .query("productUnits")
                .withIndex("by_organizationId_and_productId", (q) =>
                  q
                    .eq("organizationId", organizationId)
                    .eq("productId", product._id),
                )
                .take(MAX_CHILD_ROWS),
              ctx.db
                .query("productIngredients")
                .withIndex("by_organizationId_and_productId", (q) =>
                  q
                    .eq("organizationId", organizationId)
                    .eq("productId", product._id),
                )
                .take(MAX_CHILD_ROWS),
              product.imageStorageId
                ? ctx.storage.getUrl(product.imageStorageId)
                : Promise.resolve(null),
            ]);
          if (!category || category.organizationId !== organizationId) {
            throw new ConvexError(
              `Kategorien til ${product.name} blev ikke fundet`,
            );
          }

          const units = await Promise.all(
            unitRows.map(async (row) => {
              const unit = await ctx.db.get("units", row.unitId);
              if (!unit || unit.organizationId !== organizationId) {
                throw new ConvexError(
                  `En enhed til ${product.name} blev ikke fundet`,
                );
              }
              return {
                name: unit.name,
                factorToDefault: row.factorToDefault,
                isDefault: row.unitId === product.defaultUnitId,
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
                throw new ConvexError(
                  `En ingrediens til ${product.name} blev ikke fundet`,
                );
              }
              return {
                sourceProductId: ingredientProduct._id,
                quantity: row.quantity,
                unit: unit.name,
              };
            }),
          );

          return {
            sourceId: product._id,
            name: product.name,
            status: product.status,
            category: category.name,
            maxTemperatureCelsius: product.maxTemperatureCelsius ?? null,
            units,
            ingredients,
            imageUrl,
          };
        }),
      ),
    };
  },
});

export const getProduct = query({
  args: { productId: v.id("products") },
  returns: v.union(productDetailValidator, v.null()),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganization(ctx);
    const product = await ctx.db.get("products", args.productId);
    if (!product || product.organizationId !== organizationId) return null;

    const [category, unitRows, ingredientRows, imageUrl] = await Promise.all([
      ctx.db.get("categories", product.categoryId),
      ctx.db
        .query("productUnits")
        .withIndex("by_organizationId_and_productId", (q) =>
          q.eq("organizationId", organizationId).eq("productId", product._id),
        )
        .take(MAX_CHILD_ROWS),
      ctx.db
        .query("productIngredients")
        .withIndex("by_organizationId_and_productId", (q) =>
          q.eq("organizationId", organizationId).eq("productId", product._id),
        )
        .take(MAX_CHILD_ROWS),
      product.imageStorageId
        ? ctx.storage.getUrl(product.imageStorageId)
        : Promise.resolve(null),
    ]);

    const units = await Promise.all(
      unitRows.map(async (row) => {
        const unit = await ctx.db.get("units", row.unitId);
        return unit
          ? {
              id: row.unitId,
              name: unit.name,
              factorToDefault: row.factorToDefault,
              isDefault: row.unitId === product.defaultUnitId,
            }
          : null;
      }),
    );
    const ingredients = await Promise.all(
      ingredientRows.map(async (row) => {
        const [ingredientProduct, unit] = await Promise.all([
          ctx.db.get("products", row.ingredientProductId),
          ctx.db.get("units", row.unitId),
        ]);
        return ingredientProduct && unit
          ? {
              productId: ingredientProduct._id,
              productName: ingredientProduct.name,
              productStatus: ingredientProduct.status,
              quantity: row.quantity,
              unitId: unit._id,
              unitName: unit.name,
            }
          : null;
      }),
    );

    return {
      id: product._id,
      name: product.name,
      status: product.status,
      maxTemperatureCelsius: product.maxTemperatureCelsius ?? null,
      category: category ? { id: category._id, name: category.name } : null,
      imageUrl,
      units: units.filter((row) => row !== null),
      ingredients: ingredients.filter((row) => row !== null),
    };
  },
});

export const listFormOptions = query({
  args: {},
  returns: productFormOptionsValidator,
  handler: async (ctx) => {
    const { organizationId } = await requireOrganization(ctx);
    const [{ hierarchy: categories }, units] = await Promise.all([
      loadCategoryHierarchy(ctx, organizationId),
      ctx.db
        .query("units")
        .withIndex("by_organizationId_and_normalizedName", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_CHILD_ROWS),
    ]);

    return {
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        path: category.path,
      })),
      units: units.map((unit) => ({ id: unit._id, name: unit.name })),
    };
  },
});

export const listCategoryOptions = query({
  args: {},
  returns: v.array(categoryOptionValidator),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganization(ctx);
    const { hierarchy } = await loadCategoryHierarchy(ctx, organizationId);
    return hierarchy.map(({ id, name, parentCategoryId, path, depth }) => ({
      id,
      name,
      parentCategoryId,
      path,
      depth,
    }));
  },
});

export const listCategories = query({
  args: {},
  returns: v.array(managedCategoryValidator),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganization(ctx);
    const { hierarchy: categories } = await loadCategoryHierarchy(
      ctx,
      organizationId,
    );

    return await Promise.all(
      categories.map(async (category) => {
        const [product, staffFoodAllowance] = await Promise.all([
          ctx.db
            .query("products")
            .withIndex("by_organizationId_and_categoryId", (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("categoryId", category.id),
            )
            .first(),
          ctx.db
            .query("staffFoodRuleAllowances")
            .withIndex("by_organizationId_and_categoryId", (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("categoryId", category.id),
            )
            .first(),
        ]);
        return {
          id: category.id,
          name: category.name,
          parentCategoryId: category.parentCategoryId,
          path: category.path,
          depth: category.depth,
          inUse: Boolean(product || staffFoodAllowance),
          hasChildren: category.hasChildren,
        };
      }),
    );
  },
});

export const listUnits = query({
  args: {},
  returns: v.array(managedUnitValidator),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganization(ctx);
    const units = await ctx.db
      .query("units")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_CHILD_ROWS);

    return await Promise.all(
      units.map(async (unit) => ({
        id: unit._id,
        name: unit.name,
        inUse: Boolean(
          await ctx.db
            .query("productUnits")
            .withIndex("by_organizationId_and_unitId", (q) =>
              q.eq("organizationId", organizationId).eq("unitId", unit._id),
            )
            .first(),
        ),
      })),
    );
  },
});

export async function createProductWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  args: {
    name: string;
    category: CategoryReference;
    units: ProductUnitInput[];
    ingredients: IngredientInput[];
    maxTemperatureCelsius?: number | null;
  },
): Promise<Id<"products">> {
  const { organizationId, userIdentifier } = auth;
  const { name, normalizedName } = normalizeName(args.name, "Produktnavnet");
  await assertProductNameAvailable(ctx, organizationId, normalizedName);
  const categoryId = await resolveCategory(ctx, organizationId, args.category);
  const units = await resolveUnits(ctx, organizationId, args.units);
  await validateIngredients(ctx, organizationId, args.ingredients);
  if (typeof args.maxTemperatureCelsius === "number") {
    requireTemperature(args.maxTemperatureCelsius, "Maksimumtemperaturen");
  }

  const defaultUnitId = units.find((unit) => unit.isDefault)!.unitId;
  const productId = await ctx.db.insert("products", {
    organizationId,
    name,
    normalizedName,
    categoryId,
    defaultUnitId,
    ...(typeof args.maxTemperatureCelsius === "number"
      ? { maxTemperatureCelsius: args.maxTemperatureCelsius }
      : {}),
    status: "active",
    createdBy: userIdentifier,
    updatedAt: Date.now(),
  });
  await replaceProductChildren(
    ctx,
    organizationId,
    productId,
    units,
    args.ingredients,
  );
  await recordAudit(ctx, auth, {
    action: "catalog.productCreated",
    entityTable: "products",
    entityId: productId,
    summary: `Produktet ${name} blev oprettet`,
  });
  return productId;
}

export async function updateProductWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  args: {
    productId: Id<"products">;
    name: string;
    category: CategoryReference;
    units: ProductUnitInput[];
    ingredients: IngredientInput[];
    maxTemperatureCelsius?: number | null;
  },
): Promise<Id<"products">> {
  const { organizationId } = auth;
  const product = await ctx.db.get("products", args.productId);
  if (!product || product.organizationId !== organizationId) {
    throw new ConvexError("Produktet blev ikke fundet");
  }
  if (typeof args.maxTemperatureCelsius === "number") {
    requireTemperature(args.maxTemperatureCelsius, "Maksimumtemperaturen");
  }

  const { name, normalizedName } = normalizeName(args.name, "Produktnavnet");
  await assertProductNameAvailable(
    ctx,
    organizationId,
    normalizedName,
    product._id,
  );
  const categoryId = await resolveCategory(ctx, organizationId, args.category);
  const units = await resolveUnits(ctx, organizationId, args.units);
  const existingIngredients = await ctx.db
    .query("productIngredients")
    .withIndex("by_organizationId_and_productId", (q) =>
      q.eq("organizationId", organizationId).eq("productId", product._id),
    )
    .take(MAX_CHILD_ROWS);
  const allowedArchivedProductIds = new Set(
    existingIngredients.map((row) => row.ingredientProductId),
  );
  await validateIngredients(
    ctx,
    organizationId,
    args.ingredients,
    product._id,
    allowedArchivedProductIds,
  );
  await assertNoRecipeCycle(ctx, organizationId, product._id, args.ingredients);

  const defaultUnitId = units.find((unit) => unit.isDefault)!.unitId;
  if (defaultUnitId !== product.defaultUnitId) {
    const stockRows = await ctx.db
      .query("locationStock")
      .withIndex("by_organizationId_and_productId", (q) =>
        q.eq("organizationId", organizationId).eq("productId", product._id),
      )
      .take(MAX_CHILD_ROWS + 1);
    if (stockRows.length > MAX_CHILD_ROWS) {
      throw new ConvexError("Produktet har for mange lagerrelationer");
    }
    const oldDefaultUnit = units.find(
      (unit) => unit.unitId === product.defaultUnitId,
    );
    if (stockRows.length > 0 && !oldDefaultUnit) {
      throw new ConvexError(
        "Den tidligere standardenhed skal beholdes for at omregne lageret",
      );
    }
    const updatedAt = Date.now();
    for (const stock of stockRows) {
      await ctx.db.patch("locationStock", stock._id, {
        quantity: normalizeStock(
          stock.quantity * oldDefaultUnit!.factorToDefault,
        ),
        updatedAt,
      });
    }
  }
  await replaceProductChildren(
    ctx,
    organizationId,
    product._id,
    units,
    args.ingredients,
  );
  const updatedAt = Math.max(Date.now(), product.updatedAt + 1);
  await ctx.db.patch("products", product._id, {
    name,
    normalizedName,
    categoryId,
    defaultUnitId,
    ...(args.maxTemperatureCelsius !== undefined
      ? {
          maxTemperatureCelsius:
            args.maxTemperatureCelsius === null
              ? undefined
              : args.maxTemperatureCelsius,
        }
      : {}),
    updatedAt,
  });
  await recordAudit(ctx, auth, {
    action: "catalog.productUpdated",
    entityTable: "products",
    entityId: product._id,
    summary: `Produktet ${name} blev ændret`,
  });
  return product._id;
}

export async function archiveProductWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  productId: Id<"products">,
): Promise<null> {
  const { organizationId } = auth;
  const product = await ctx.db.get("products", productId);
  if (!product || product.organizationId !== organizationId) {
    throw new ConvexError("Produktet blev ikke fundet");
  }
  const retainedForCountHistory = Boolean(
    await ctx.db
      .query("countItems")
      .withIndex("by_organizationId_and_productId", (q) =>
        q.eq("organizationId", organizationId).eq("productId", product._id),
      )
      .first(),
  );
  const archivedAt = Math.max(Date.now(), product.updatedAt + 1);
  await ctx.db.patch("products", product._id, {
    status: "archived",
    archivedAt: retainedForCountHistory ? undefined : archivedAt,
    updatedAt: archivedAt,
  });
  await scrubProductFromCountOrder(ctx, organizationId, product._id);
  if (!retainedForCountHistory) {
    await ctx.scheduler.runAfter(
      ARCHIVE_RETENTION_MS,
      internal.catalog.deleteExpiredProduct,
      { productId: product._id, archivedAt },
    );
  }
  await recordAudit(ctx, auth, {
    action: "catalog.productArchived",
    entityTable: "products",
    entityId: product._id,
    summary: `Produktet ${product.name} blev arkiveret`,
  });
  return null;
}

export async function restoreProductWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  productId: Id<"products">,
): Promise<null> {
  const { organizationId } = auth;
  const product = await ctx.db.get("products", productId);
  if (!product || product.organizationId !== organizationId) {
    throw new ConvexError("Produktet blev ikke fundet");
  }
  const updatedAt = Math.max(Date.now(), product.updatedAt + 1);
  await ctx.db.patch("products", product._id, {
    status: "active",
    archivedAt: undefined,
    updatedAt,
  });
  await recordAudit(ctx, auth, {
    action: "catalog.productRestored",
    entityTable: "products",
    entityId: product._id,
    summary: `Produktet ${product.name} blev gendannet`,
  });
  return null;
}

export async function deleteProductWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  productId: Id<"products">,
): Promise<null> {
  const { organizationId } = auth;
  const product = await ctx.db.get("products", productId);
  if (!product || product.organizationId !== organizationId) {
    throw new ConvexError("Produktet blev ikke fundet");
  }
  if (product.status !== "archived") {
    throw new ConvexError("Produktet skal arkiveres, før det kan slettes");
  }
  await permanentlyDeleteProduct(ctx, product);
  await recordAudit(ctx, auth, {
    action: "catalog.productDeleted",
    entityTable: "products",
    entityId: product._id,
    summary: `Produktet ${product.name} blev slettet`,
  });
  return null;
}

export const createProduct = mutation({
  args: {
    name: v.string(),
    category: categoryReferenceValidator,
    units: v.array(productUnitInputValidator),
    ingredients: v.array(ingredientInputValidator),
    maxTemperatureCelsius: maxTemperatureInputValidator,
  },
  returns: v.id("products"),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    return await createProductWithAuth(ctx, auth, args);
  },
});

export const importProduct = mutation({
  args: {
    name: v.string(),
    category: v.string(),
    units: v.array(importedProductUnitValidator),
    overwrite: v.boolean(),
    maxTemperatureCelsius: maxTemperatureInputValidator,
  },
  returns: v.object({
    productId: v.id("products"),
    status: v.union(
      v.literal("created"),
      v.literal("skipped"),
      v.literal("overwritten"),
    ),
  }),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    const { organizationId, userIdentifier } = auth;
    const { name, normalizedName } = normalizeName(args.name, "Produktnavnet");
    if (typeof args.maxTemperatureCelsius === "number") {
      requireTemperature(
        args.maxTemperatureCelsius,
        "Maksimumtemperaturen",
      );
    }
    const existing = await ctx.db
      .query("products")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("normalizedName", normalizedName),
      )
      .unique();
    if (existing && !args.overwrite) {
      return { productId: existing._id, status: "skipped" as const };
    }

    const categoryId = await resolveCategory(ctx, organizationId, {
      kind: "new",
      name: args.category,
    });
    const units = await resolveUnits(
      ctx,
      organizationId,
      args.units.map((unit) => ({
        unit: { kind: "new" as const, name: unit.name },
        factorToDefault: unit.factorToDefault,
        isDefault: unit.isDefault,
      })),
    );
    const defaultUnitId = units.find((unit) => unit.isDefault)!.unitId;

    if (existing) {
      const [
        existingUnits,
        stockRows,
        recipeReferences,
        countItems,
        wasteConfigs,
      ] = await Promise.all([
        ctx.db
          .query("productUnits")
          .withIndex("by_organizationId_and_productId", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("productId", existing._id),
          )
          .take(MAX_CHILD_ROWS + 1),
        ctx.db
          .query("locationStock")
          .withIndex("by_organizationId_and_productId", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("productId", existing._id),
          )
          .take(MAX_CHILD_ROWS + 1),
        ctx.db
          .query("productIngredients")
          .withIndex("by_organizationId_and_ingredientProductId", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("ingredientProductId", existing._id),
          )
          .take(MAX_CHILD_ROWS + 1),
        ctx.db
          .query("countItems")
          .withIndex("by_organizationId_and_productId", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("productId", existing._id),
          )
          .take(MAX_CHILD_ROWS + 1),
        ctx.db
          .query("wasteProductConfigs")
          .withIndex("by_org_product", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("productId", existing._id),
          )
          .take(MAX_CHILD_ROWS + 1),
      ]);
      if (
        existingUnits.length > MAX_CHILD_ROWS ||
        stockRows.length > MAX_CHILD_ROWS ||
        recipeReferences.length > MAX_CHILD_ROWS ||
        countItems.length > MAX_CHILD_ROWS ||
        wasteConfigs.length > MAX_CHILD_ROWS
      ) {
        throw new ConvexError(
          `Produktet ${name} har for mange relationer til at blive overskrevet`,
        );
      }

      const oldUnits = new Map(
        existingUnits.map((unit) => [unit.unitId, unit.factorToDefault]),
      );
      const nextUnitIds = new Set(units.map((unit) => unit.unitId));
      const bridge =
        units.find(
          (unit) => unit.unitId === defaultUnitId && oldUnits.has(unit.unitId),
        ) ??
        units.find(
          (unit) =>
            unit.unitId === existing.defaultUnitId && oldUnits.has(unit.unitId),
        ) ??
        units.find((unit) => oldUnits.has(unit.unitId));
      const conversion = bridge
        ? bridge.factorToDefault / oldUnits.get(bridge.unitId)!
        : null;
      const removedUnitReferences = recipeReferences.filter(
        (row) => !nextUnitIds.has(row.unitId),
      );
      const openCountItems = (
        await Promise.all(
          countItems.map(async (item) => ({
            item,
            count: await ctx.db.get("counts", item.countId),
          })),
        )
      ).filter(
        ({ item, count }) =>
          !nextUnitIds.has(item.unitId) &&
          count?.organizationId === organizationId &&
          count.status === "open",
      );
      const configsWithRemovedUnits = wasteConfigs.filter((config) =>
        config.shortcutOverrides?.some(
          (shortcut) => !nextUnitIds.has(shortcut.unitId),
        ),
      );

      if (
        (stockRows.length > 0 ||
          removedUnitReferences.length > 0 ||
          openCountItems.length > 0 ||
          configsWithRemovedUnits.length > 0) &&
        !conversion
      ) {
        throw new ConvexError(
          `Produktet ${name} skal beholde mindst én enhed for at omregne eksisterende mængder`,
        );
      }
      if (conversion) {
        requirePositiveNumber(conversion, "Enhedsomregningen");
      }

      const updatedAt = Date.now();
      for (const stock of stockRows) {
        await ctx.db.patch("locationStock", stock._id, {
          quantity: normalizeStock(stock.quantity * conversion!),
          updatedAt,
        });
      }
      for (const reference of removedUnitReferences) {
        const oldFactor = oldUnits.get(reference.unitId);
        if (!oldFactor) {
          throw new ConvexError(
            `En opskrift for ${name} bruger en ugyldig enhed`,
          );
        }
        const quantity = reference.quantity * oldFactor * conversion!;
        requirePositiveNumber(quantity, "Den omregnede ingrediensmængde");
        await ctx.db.patch("productIngredients", reference._id, {
          quantity,
          unitId: defaultUnitId,
        });
      }
      for (const { item } of openCountItems) {
        const oldFactor = oldUnits.get(item.unitId)!;
        const quantity = item.quantity * oldFactor * conversion!;
        requirePositiveNumber(quantity, "Den omregnede Count-mængde");
        await ctx.db.patch("countItems", item._id, {
          quantity,
          unitId: defaultUnitId,
        });
      }
      for (const config of configsWithRemovedUnits) {
        await ctx.db.patch("wasteProductConfigs", config._id, {
          shortcutOverrides: config.shortcutOverrides!.map((shortcut) => {
            if (nextUnitIds.has(shortcut.unitId)) return shortcut;
            const quantity =
              shortcut.quantity * oldUnits.get(shortcut.unitId)! * conversion!;
            requirePositiveNumber(quantity, "Den omregnede genvejsmængde");
            return { unitId: defaultUnitId, quantity };
          }),
        });
      }

      await replaceProductChildren(
        ctx,
        organizationId,
        existing._id,
        units,
        [],
      );
      await ctx.db.patch("products", existing._id, {
        name,
        normalizedName,
        categoryId,
        defaultUnitId,
        ...(args.maxTemperatureCelsius !== undefined
          ? {
              maxTemperatureCelsius:
                args.maxTemperatureCelsius === null
                  ? undefined
                  : args.maxTemperatureCelsius,
            }
          : {}),
        status: "active",
        archivedAt: undefined,
        updatedAt,
      });
      await recordAudit(ctx, auth, {
        action: "catalog.productImported",
        entityTable: "products",
        entityId: existing._id,
        summary: `Produktet ${name} blev overskrevet fra import`,
      });
      return { productId: existing._id, status: "overwritten" as const };
    }

    const productId = await ctx.db.insert("products", {
      organizationId,
      name,
      normalizedName,
      categoryId,
      defaultUnitId,
      ...(typeof args.maxTemperatureCelsius === "number"
        ? { maxTemperatureCelsius: args.maxTemperatureCelsius }
        : {}),
      status: "active",
      createdBy: userIdentifier,
      updatedAt: Date.now(),
    });
    await replaceProductChildren(ctx, organizationId, productId, units, []);
    await recordAudit(ctx, auth, {
      action: "catalog.productImported",
      entityTable: "products",
      entityId: productId,
      summary: `Produktet ${name} blev importeret`,
    });
    return { productId, status: "created" as const };
  },
});

export const importProductIngredients = mutation({
  args: {
    productId: v.id("products"),
    ingredients: v.array(importedIngredientValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    const { organizationId } = auth;
    const product = await ctx.db.get("products", args.productId);
    if (!product || product.organizationId !== organizationId) {
      throw new ConvexError("Produktet blev ikke fundet");
    }

    const ingredients: IngredientInput[] = [];
    for (const input of args.ingredients) {
      const { normalizedName } = normalizeName(input.unitName, "Enhedsnavnet");
      const unit = await ctx.db
        .query("units")
        .withIndex("by_organizationId_and_normalizedName", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("normalizedName", normalizedName),
        )
        .unique();
      if (!unit) throw new ConvexError("Ingrediensenheden blev ikke fundet");
      ingredients.push({
        productId: input.productId,
        quantity: input.quantity,
        unitId: unit._id,
      });
    }

    await validateIngredients(ctx, organizationId, ingredients, product._id);
    await assertNoRecipeCycle(ctx, organizationId, product._id, ingredients);
    const existing = await ctx.db
      .query("productIngredients")
      .withIndex("by_organizationId_and_productId", (q) =>
        q.eq("organizationId", organizationId).eq("productId", product._id),
      )
      .take(MAX_CHILD_ROWS);
    for (const row of existing) {
      await ctx.db.delete("productIngredients", row._id);
    }
    for (const ingredient of ingredients) {
      await ctx.db.insert("productIngredients", {
        organizationId,
        productId: product._id,
        ingredientProductId: ingredient.productId,
        quantity: ingredient.quantity,
        unitId: ingredient.unitId,
      });
    }
    await recordAudit(ctx, auth, {
      action: "catalog.productIngredientsChanged",
      entityTable: "products",
      entityId: product._id,
      summary: `Ingredienser for ${product.name} blev ændret`,
    });
    return null;
  },
});

export const updateProduct = mutation({
  args: {
    productId: v.id("products"),
    name: v.string(),
    category: categoryReferenceValidator,
    units: v.array(productUnitInputValidator),
    ingredients: v.array(ingredientInputValidator),
    maxTemperatureCelsius: maxTemperatureInputValidator,
  },
  returns: v.id("products"),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    return await updateProductWithAuth(ctx, auth, args);
  },
});

export const bulkUpdateProductCategory = mutation({
  args: bulkProductCategoryArgs.fields,
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    const { organizationId } = auth;
    if (args.productIds.length === 0) {
      throw new ConvexError("Vælg mindst ét produkt");
    }
    if (args.productIds.length > MAX_BULK_PRODUCT_SELECTION) {
      throw new ConvexError(
        `Der kan højst ændres kategori for ${MAX_BULK_PRODUCT_SELECTION} produkter ad gangen`,
      );
    }
    if (new Set(args.productIds).size !== args.productIds.length) {
      throw new ConvexError("Et produkt må kun vælges én gang");
    }

    const category = await ctx.db.get("categories", args.categoryId);
    if (!category || category.organizationId !== organizationId) {
      throw new ConvexError("Kategorien blev ikke fundet");
    }

    const products: Doc<"products">[] = [];
    for (const productId of args.productIds) {
      const product = await ctx.db.get("products", productId);
      if (!product || product.organizationId !== organizationId) {
        throw new ConvexError("Et eller flere produkter blev ikke fundet");
      }
      products.push(product);
    }

    const updatedAt = Date.now();
    for (const product of products) {
      await ctx.db.patch("products", product._id, {
        categoryId: category._id,
        updatedAt,
      });
    }
    await recordAudit(ctx, auth, {
      action: "catalog.productsCategoryChanged",
      entityTable: "products",
      entityId: category._id,
      summary: `${products.length} produkter fik ændret kategori til ${category.name}`,
    });
    return null;
  },
});

export const archiveProduct = mutation({
  args: { productId: v.id("products") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    return await archiveProductWithAuth(ctx, auth, args.productId);
  },
});

export const restoreProduct = mutation({
  args: { productId: v.id("products") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    return await restoreProductWithAuth(ctx, auth, args.productId);
  },
});

export const deleteProduct = mutation({
  args: { productId: v.id("products") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    return await deleteProductWithAuth(ctx, auth, args.productId);
  },
});

export const deleteExpiredProduct = internalMutation({
  args: { productId: v.id("products"), archivedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const product = await ctx.db.get("products", args.productId);
    if (
      !product ||
      product.status !== "archived" ||
      product.archivedAt !== args.archivedAt
    ) {
      return null;
    }
    const countItem = await ctx.db
      .query("countItems")
      .withIndex("by_organizationId_and_productId", (q) =>
        q
          .eq("organizationId", product.organizationId)
          .eq("productId", product._id),
      )
      .first();
    if (countItem) {
      await ctx.db.patch("products", product._id, { archivedAt: undefined });
      return null;
    }
    await permanentlyDeleteProduct(ctx, product);
    return null;
  },
});

export const deleteExpiredProducts = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const product = await ctx.db
      .query("products")
      .withIndex("by_status_and_archivedAt", (q) =>
        q
          .eq("status", "archived")
          .gte("archivedAt", 0)
          .lt("archivedAt", Date.now() - ARCHIVE_RETENTION_MS),
      )
      .first();
    if (!product) return null;

    const countItem = await ctx.db
      .query("countItems")
      .withIndex("by_organizationId_and_productId", (q) =>
        q
          .eq("organizationId", product.organizationId)
          .eq("productId", product._id),
      )
      .first();
    if (countItem) {
      await ctx.db.patch("products", product._id, { archivedAt: undefined });
      await ctx.scheduler.runAfter(
        0,
        internal.catalog.deleteExpiredProducts,
        {},
      );
      return null;
    }

    await permanentlyDeleteProduct(ctx, product);
    await ctx.scheduler.runAfter(0, internal.catalog.deleteExpiredProducts, {});
    return null;
  },
});

export async function createCategoryWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  args: { name: string; placement: CategoryPlacement },
): Promise<Id<"categories">> {
  const { organizationId } = auth;
  const { name, normalizedName } = normalizeName(args.name, "Kategorinavnet");
  const [{ categories }, existing] = await Promise.all([
    loadCategoryHierarchy(ctx, organizationId),
    ctx.db
      .query("categories")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("normalizedName", normalizedName),
      )
      .unique(),
  ]);
  if (existing) throw new ConvexError("Kategorien findes allerede");
  if (categories.length >= MAX_CATEGORIES_PER_ORGANIZATION) {
    throw new ConvexError("Der kan højst oprettes 200 kategorier");
  }

  let parentCategoryId: Id<"categories"> | undefined;
  let childCategory: Doc<"categories"> | null = null;
  if (args.placement.kind === "child") {
    const parent = await ctx.db.get(
      "categories",
      args.placement.parentCategoryId,
    );
    if (!parent || parent.organizationId !== organizationId) {
      throw new ConvexError("Overkategorien blev ikke fundet");
    }
    parentCategoryId = parent._id;
  } else if (args.placement.kind === "parent") {
    childCategory = await ctx.db.get(
      "categories",
      args.placement.childCategoryId,
    );
    if (!childCategory || childCategory.organizationId !== organizationId) {
      throw new ConvexError("Kategorien blev ikke fundet");
    }
    parentCategoryId = childCategory.parentCategoryId;
  }

  const categoryId = await ctx.db.insert("categories", {
    organizationId,
    name,
    normalizedName,
    parentCategoryId,
  });
  if (childCategory) {
    await ctx.db.patch("categories", childCategory._id, {
      parentCategoryId: categoryId,
    });
  }
  await recordAudit(ctx, auth, {
    action: "catalog.categoryCreated",
    entityTable: "categories",
    entityId: categoryId,
    summary: `Kategorien ${name} blev oprettet`,
  });
  return categoryId;
}

export async function updateCategoryWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  args: {
    categoryId: Id<"categories">;
    name: string;
    parentCategoryId: Id<"categories"> | null;
  },
): Promise<null> {
  const { organizationId } = auth;
  const category = await ctx.db.get("categories", args.categoryId);
  if (!category || category.organizationId !== organizationId) {
    throw new ConvexError("Kategorien blev ikke fundet");
  }
  const { name, normalizedName } = normalizeName(args.name, "Kategorinavnet");
  const existing = await ctx.db
    .query("categories")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("normalizedName", normalizedName),
    )
    .unique();
  if (existing && existing._id !== category._id) {
    throw new ConvexError("Kategorien findes allerede");
  }
  const { categories } = await loadCategoryHierarchy(ctx, organizationId);
  validateCategoryParentAssignment(
    categories,
    organizationId,
    category._id,
    args.parentCategoryId,
  );
  if (args.parentCategoryId) {
    const parent = await ctx.db.get("categories", args.parentCategoryId);
    if (!parent || parent.organizationId !== organizationId) {
      throw new ConvexError("Overkategorien blev ikke fundet");
    }
  }
  await ctx.db.patch("categories", category._id, {
    name,
    normalizedName,
    parentCategoryId: args.parentCategoryId ?? undefined,
  });
  await recordAudit(ctx, auth, {
    action: "catalog.categoryUpdated",
    entityTable: "categories",
    entityId: category._id,
    summary: `Kategorien ${name} blev ændret`,
  });
  return null;
}

export async function deleteCategoryWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  categoryId: Id<"categories">,
): Promise<null> {
  const { organizationId } = auth;
  const category = await ctx.db.get("categories", categoryId);
  if (!category || category.organizationId !== organizationId) {
    throw new ConvexError("Kategorien blev ikke fundet");
  }
  const [child, product, staffFoodAllowance] = await Promise.all([
    ctx.db
      .query("categories")
      .withIndex("by_organizationId_and_parentCategoryId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("parentCategoryId", category._id),
      )
      .first(),
    ctx.db
      .query("products")
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
  if (child) throw new ConvexError("Kategorien har underkategorier");
  if (product) throw new ConvexError("Kategorien er stadig i brug");
  if (staffFoodAllowance) {
    throw new ConvexError("Kategorien bruges stadig i Staff food");
  }
  await ctx.db.delete("categories", category._id);
  await recordAudit(ctx, auth, {
    action: "catalog.categoryDeleted",
    entityTable: "categories",
    entityId: category._id,
    summary: `Kategorien ${category.name} blev slettet`,
  });
  return null;
}

export async function createUnitWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  nameInput: string,
): Promise<Id<"units">> {
  const { organizationId } = auth;
  const { name, normalizedName } = normalizeName(nameInput, "Enhedsnavnet");
  const existing = await ctx.db
    .query("units")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("normalizedName", normalizedName),
    )
    .unique();
  if (existing) throw new ConvexError("Enheden findes allerede");
  const unitId = await ctx.db.insert("units", {
    organizationId,
    name,
    normalizedName,
  });
  await recordAudit(ctx, auth, {
    action: "catalog.unitCreated",
    entityTable: "units",
    entityId: unitId,
    summary: `Enheden ${name} blev oprettet`,
  });
  return unitId;
}

export async function renameUnitWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  args: { unitId: Id<"units">; name: string },
): Promise<null> {
  const { organizationId } = auth;
  const unit = await ctx.db.get("units", args.unitId);
  if (!unit || unit.organizationId !== organizationId) {
    throw new ConvexError("Enheden blev ikke fundet");
  }
  const { name, normalizedName } = normalizeName(args.name, "Enhedsnavnet");
  const existing = await ctx.db
    .query("units")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("normalizedName", normalizedName),
    )
    .unique();
  if (existing && existing._id !== unit._id) {
    throw new ConvexError("Enheden findes allerede");
  }
  await ctx.db.patch("units", unit._id, { name, normalizedName });
  await recordAudit(ctx, auth, {
    action: "catalog.unitRenamed",
    entityTable: "units",
    entityId: unit._id,
    summary: `Enheden blev omdøbt til ${name}`,
  });
  return null;
}

export async function mergeUnitsWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  args: { sourceUnitId: Id<"units">; targetUnitId: Id<"units"> },
): Promise<null> {
  const { organizationId } = auth;
  if (args.sourceUnitId === args.targetUnitId) {
    throw new ConvexError("Vælg to forskellige enheder");
  }

  const [sourceUnit, targetUnit] = await Promise.all([
    ctx.db.get("units", args.sourceUnitId),
    ctx.db.get("units", args.targetUnitId),
  ]);
  if (
    !sourceUnit ||
    sourceUnit.organizationId !== organizationId ||
    !targetUnit ||
    targetUnit.organizationId !== organizationId
  ) {
    throw new ConvexError("Enheden blev ikke fundet");
  }

  const sourceProductUnits = await ctx.db
    .query("productUnits")
    .withIndex("by_organizationId_and_unitId", (q) =>
      q.eq("organizationId", organizationId).eq("unitId", sourceUnit._id),
    )
    .take(MAX_CHILD_ROWS + 1);
  if (sourceProductUnits.length > MAX_CHILD_ROWS) {
    throw new ConvexError(
      "Enheden bruges af for mange produkter til at blive sammenlagt",
    );
  }

  for (const sourceProductUnit of sourceProductUnits) {
    const [product, targetProductUnit, recipeReferences, countItems, configs] =
      await Promise.all([
        ctx.db.get("products", sourceProductUnit.productId),
        ctx.db
          .query("productUnits")
          .withIndex("by_organizationId_and_productId_and_unitId", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("productId", sourceProductUnit.productId)
              .eq("unitId", targetUnit._id),
          )
          .unique(),
        ctx.db
          .query("productIngredients")
          .withIndex(
            "by_organizationId_and_ingredientProductId_and_unitId",
            (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("ingredientProductId", sourceProductUnit.productId)
                .eq("unitId", sourceUnit._id),
          )
          .take(MAX_CHILD_ROWS + 1),
        ctx.db
          .query("countItems")
          .withIndex("by_organizationId_and_productId", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("productId", sourceProductUnit.productId),
          )
          .take(MAX_CHILD_ROWS + 1),
        ctx.db
          .query("wasteProductConfigs")
          .withIndex("by_org_product", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("productId", sourceProductUnit.productId),
          )
          .take(MAX_CHILD_ROWS + 1),
      ]);

    if (!product || product.organizationId !== organizationId) {
      throw new ConvexError("Et produkt til enheden blev ikke fundet");
    }
    if (
      recipeReferences.length > MAX_CHILD_ROWS ||
      countItems.length > MAX_CHILD_ROWS ||
      configs.length > MAX_CHILD_ROWS
    ) {
      throw new ConvexError(
        `Produktet ${product.name} har for mange relationer til at flytte enheden`,
      );
    }
    if (
      targetProductUnit &&
      targetProductUnit.factorToDefault !== sourceProductUnit.factorToDefault
    ) {
      throw new ConvexError(
        `${sourceUnit.name} og ${targetUnit.name} har forskellige omregninger på ${product.name}`,
      );
    }

    for (const reference of recipeReferences) {
      await ctx.db.patch("productIngredients", reference._id, {
        unitId: targetUnit._id,
      });
    }

    for (const item of countItems) {
      if (item.unitId !== sourceUnit._id) continue;
      const count = await ctx.db.get("counts", item.countId);
      if (count?.organizationId !== organizationId || count.status !== "open") {
        continue;
      }
      const targetItem = await ctx.db
        .query("countItems")
        .withIndex(
          "by_organizationId_and_countId_and_productId_and_unitId",
          (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("countId", item.countId)
              .eq("productId", item.productId)
              .eq("unitId", targetUnit._id),
        )
        .unique();
      if (targetItem) {
        const quantity = targetItem.quantity + item.quantity;
        requirePositiveNumber(quantity, "Den sammenlagte Count-mængde");
        await ctx.db.patch("countItems", targetItem._id, { quantity });
        await ctx.db.delete("countItems", item._id);
      } else {
        await ctx.db.patch("countItems", item._id, {
          unitId: targetUnit._id,
        });
      }
    }

    for (const config of configs) {
      if (
        !config.shortcutOverrides?.some((row) => row.unitId === sourceUnit._id)
      ) {
        continue;
      }
      const shortcutOverrides = config.shortcutOverrides.map((row) =>
        row.unitId === sourceUnit._id
          ? { ...row, unitId: targetUnit._id }
          : row,
      );
      const duplicates =
        shortcutOverrides[0]?.unitId === shortcutOverrides[1]?.unitId &&
        shortcutOverrides[0]?.quantity === shortcutOverrides[1]?.quantity;
      await ctx.db.patch("wasteProductConfigs", config._id, {
        shortcutOverrides: duplicates ? undefined : shortcutOverrides,
      });
    }

    if (targetProductUnit) {
      await ctx.db.delete("productUnits", sourceProductUnit._id);
    } else {
      await ctx.db.patch("productUnits", sourceProductUnit._id, {
        unitId: targetUnit._id,
      });
    }
    await ctx.db.patch("products", product._id, {
      defaultUnitId:
        product.defaultUnitId === sourceUnit._id
          ? targetUnit._id
          : product.defaultUnitId,
      updatedAt: Math.max(Date.now(), product.updatedAt + 1),
    });
  }

  await ctx.db.delete("units", sourceUnit._id);
  await recordAudit(ctx, auth, {
    action: "catalog.unitMerged",
    entityTable: "units",
    entityId: sourceUnit._id,
    summary: `Enheden ${sourceUnit.name} blev lagt sammen med ${targetUnit.name}`,
  });
  return null;
}

export async function deleteUnitWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  unitId: Id<"units">,
): Promise<null> {
  const { organizationId } = auth;
  const unit = await ctx.db.get("units", unitId);
  if (!unit || unit.organizationId !== organizationId) {
    throw new ConvexError("Enheden blev ikke fundet");
  }
  const productUnit = await ctx.db
    .query("productUnits")
    .withIndex("by_organizationId_and_unitId", (q) =>
      q.eq("organizationId", organizationId).eq("unitId", unit._id),
    )
    .first();
  if (productUnit) throw new ConvexError("Enheden er stadig i brug");
  await ctx.db.delete("units", unit._id);
  await recordAudit(ctx, auth, {
    action: "catalog.unitDeleted",
    entityTable: "units",
    entityId: unit._id,
    summary: `Enheden ${unit.name} blev slettet`,
  });
  return null;
}

export const createCategory = mutation({
  args: { name: v.string(), placement: categoryPlacementValidator },
  returns: v.id("categories"),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    return await createCategoryWithAuth(ctx, auth, args);
  },
});

export const updateCategory = mutation({
  args: {
    categoryId: v.id("categories"),
    name: v.string(),
    parentCategoryId: v.union(v.id("categories"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    return await updateCategoryWithAuth(ctx, auth, args);
  },
});

export const deleteCategory = mutation({
  args: { categoryId: v.id("categories") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    return await deleteCategoryWithAuth(ctx, auth, args.categoryId);
  },
});

export const createUnit = mutation({
  args: { name: v.string() },
  returns: v.id("units"),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    return await createUnitWithAuth(ctx, auth, args.name);
  },
});

export const renameUnit = mutation({
  args: { unitId: v.id("units"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    return await renameUnitWithAuth(ctx, auth, args);
  },
});

export const mergeUnits = mutation({
  args: {
    sourceUnitId: v.id("units"),
    targetUnitId: v.id("units"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    return await mergeUnitsWithAuth(ctx, auth, args);
  },
});

export const deleteUnit = mutation({
  args: { unitId: v.id("units") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    return await deleteUnitWithAuth(ctx, auth, args.unitId);
  },
});

export const generateProductImageUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireCatalogManager(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const setProductImage = mutation({
  args: {
    productId: v.id("products"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    const { organizationId } = auth;
    const product = await ctx.db.get("products", args.productId);
    if (!product || product.organizationId !== organizationId) {
      throw new ConvexError("Produktet blev ikke fundet");
    }
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) throw new ConvexError("Billeduploaden blev ikke fundet");
    const attachedProduct = await ctx.db
      .query("products")
      .withIndex("by_imageStorageId", (q) =>
        q.eq("imageStorageId", args.storageId),
      )
      .first();
    if (attachedProduct && attachedProduct._id !== product._id) {
      throw new ConvexError("Billeduploaden blev ikke fundet");
    }
    if (
      !metadata.contentType ||
      !ALLOWED_IMAGE_TYPES.has(metadata.contentType) ||
      metadata.size > MAX_IMAGE_SIZE
    ) {
      throw new ConvexError(
        "Brug et billede i JPEG-, PNG-, WebP- eller AVIF-format på højst 10 MB",
      );
    }

    if (product.imageStorageId && product.imageStorageId !== args.storageId) {
      await ctx.storage.delete(product.imageStorageId);
    }
    await ctx.db.patch("products", product._id, {
      imageStorageId: args.storageId,
      updatedAt: Date.now(),
    });
    await recordAudit(ctx, auth, {
      action: "catalog.productImageChanged",
      entityTable: "products",
      entityId: product._id,
      summary: `Billedet for ${product.name} blev ændret`,
    });
    return null;
  },
});

export const removeProductImage = mutation({
  args: { productId: v.id("products") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    const { organizationId } = auth;
    const product = await ctx.db.get("products", args.productId);
    if (!product || product.organizationId !== organizationId) {
      throw new ConvexError("Produktet blev ikke fundet");
    }
    if (product.imageStorageId) {
      await ctx.storage.delete(product.imageStorageId);
      await ctx.db.patch("products", product._id, {
        imageStorageId: undefined,
        updatedAt: Date.now(),
      });
      await recordAudit(ctx, auth, {
        action: "catalog.productImageRemoved",
        entityTable: "products",
        entityId: product._id,
        summary: `Billedet for ${product.name} blev fjernet`,
      });
    }
    return null;
  },
});
