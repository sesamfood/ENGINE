import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireCatalogManager, requireOrganization } from "./lib/auth";
import { normalizeStock } from "./lib/stock";

const statusValidator = v.union(v.literal("active"), v.literal("archived"));

const categoryReferenceValidator = v.union(
  v.object({ kind: v.literal("existing"), id: v.id("categories") }),
  v.object({ kind: v.literal("new"), name: v.string() }),
);

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

const MAX_NAME_LENGTH = 100;
const MAX_CHILD_ROWS = 200;
const MAX_GRAPH_PRODUCTS = 500;
const MAX_PRODUCT_LEDGER_ROWS = 2000;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ARCHIVE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

function normalizeName(value: string, label: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new ConvexError(`${label} skal udfyldes`);
  if (name.length > MAX_NAME_LENGTH) {
    throw new ConvexError(
      `${label} må højst være ${MAX_NAME_LENGTH} tegn`,
    );
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

function requirePositiveNumber(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ConvexError(`${label} skal være større end nul`);
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

async function permanentlyDeleteProduct(
  ctx: MutationCtx,
  product: Doc<"products">,
) {
  const [
    units,
    ingredients,
    recipeReferences,
    countItems,
    stockRows,
    staffFoodRules,
  ] =
    await Promise.all([
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
        .query("countItems")
        .withIndex("by_organizationId_and_productId", (q) =>
          q
            .eq("organizationId", product.organizationId)
            .eq("productId", product._id),
        )
        .take(MAX_PRODUCT_LEDGER_ROWS + 1),
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
    countItems.length > MAX_PRODUCT_LEDGER_ROWS ||
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
  for (const row of countItems) await ctx.db.delete("countItems", row._id);
  for (const row of stockRows) await ctx.db.delete("locationStock", row._id);
  for (const row of staffFoodRules) {
    await ctx.db.delete("staffFoodRuleProducts", row._id);
  }
  await ctx.scheduler.runAfter(0, internal.waste.cleanupProductData, {
    organizationId: product.organizationId,
    productId: product._id,
  });
  if (product.imageStorageId) {
    await ctx.storage.delete(product.imageStorageId);
  }
  await ctx.db.delete("products", product._id);
}

async function hydrateCatalogProduct(ctx: QueryCtx, product: Doc<"products">) {
  const [category, defaultUnit, units, ingredients, imageUrl] =
    await Promise.all([
      ctx.db.get("categories", product.categoryId),
      ctx.db.get("units", product.defaultUnitId),
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

  return {
    id: product._id,
    name: product.name,
    status: product.status,
    category: category ? { id: category._id, name: category.name } : null,
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
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganization(ctx);
    if (args.categoryId) {
      const category = await ctx.db.get("categories", args.categoryId);
      if (!category || category.organizationId !== organizationId) {
        throw new ConvexError("Kategorien blev ikke fundet");
      }
    }

    const search = args.search.trim();
    const results = search
      ? await (async () => {
          // ponytail: scan the tenant catalog until catalog size warrants a trigram index.
          const products = await (args.categoryId
            ? ctx.db
                .query("products")
                .withIndex(
                  "by_organizationId_and_status_and_categoryId_and_normalizedName",
                  (q) =>
                    q
                      .eq("organizationId", organizationId)
                      .eq("status", args.status)
                      .eq("categoryId", args.categoryId!),
                )
            : ctx.db
                .query("products")
                .withIndex(
                  "by_organizationId_and_status_and_normalizedName",
                  (q) =>
                    q
                      .eq("organizationId", organizationId)
                      .eq("status", args.status),
                ))
            .collect();
          const categoryNames = new Map(
            await Promise.all(
              Array.from(new Set(products.map((product) => product.categoryId))).map(
                async (categoryId) => {
                  const category = await ctx.db.get("categories", categoryId);
                  return [categoryId, category?.name ?? ""] as const;
                },
              ),
            ),
          );
          const matches = products
            .map((product) => {
              const productScore = fuzzyScore(product.name, search);
              const categoryScore = fuzzyScore(
                categoryNames.get(product.categoryId) ?? "",
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
                match.score !== null,
            )
            .sort((left, right) => left.score - right.score)
            .map((match) => match.product);
          const offset = Number(args.paginationOpts.cursor ?? 0);
          const end = Math.min(offset + args.paginationOpts.numItems, matches.length);

          return {
            page: matches.slice(offset, end),
            isDone: end === matches.length,
            continueCursor: String(end),
          };
        })()
      : args.categoryId
        ? await ctx.db
            .query("products")
            .withIndex(
              "by_organizationId_and_status_and_categoryId_and_normalizedName",
              (q) =>
                q
                  .eq("organizationId", organizationId)
                  .eq("status", args.status)
                  .eq("categoryId", args.categoryId!),
            )
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("products")
            .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
              q.eq("organizationId", organizationId).eq("status", args.status),
            )
            .paginate(args.paginationOpts);

    return {
      ...results,
      page: await Promise.all(
        results.page.map((product) => hydrateCatalogProduct(ctx, product)),
      ),
    };
  },
});

export const getProduct = query({
  args: { productId: v.id("products") },
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
      category: category ? { id: category._id, name: category.name } : null,
      imageUrl,
      units: units.filter((row) => row !== null),
      ingredients: ingredients.filter((row) => row !== null),
    };
  },
});

export const listFormOptions = query({
  args: { excludeProductId: v.optional(v.id("products")) },
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganization(ctx);
    const [categories, units, products] = await Promise.all([
      ctx.db
        .query("categories")
        .withIndex("by_organizationId_and_normalizedName", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_CHILD_ROWS),
      ctx.db
        .query("units")
        .withIndex("by_organizationId_and_normalizedName", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_CHILD_ROWS),
      ctx.db
        .query("products")
        .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
          q.eq("organizationId", organizationId).eq("status", "active"),
        )
        .take(100),
    ]);

    return {
      categories: categories.map((category) => ({
        id: category._id,
        name: category.name,
      })),
      units: units.map((unit) => ({ id: unit._id, name: unit.name })),
      products: await Promise.all(
        products
          .filter((product) => product._id !== args.excludeProductId)
          .map(async (product) => {
            const productUnits = await ctx.db
              .query("productUnits")
              .withIndex("by_organizationId_and_productId", (q) =>
                q
                  .eq("organizationId", organizationId)
                  .eq("productId", product._id),
              )
              .take(MAX_CHILD_ROWS);
            const hydratedUnits = await Promise.all(
              productUnits.map(async (row) => {
                const unit = await ctx.db.get("units", row.unitId);
                return unit ? { id: unit._id, name: unit.name } : null;
              }),
            );
            return {
              id: product._id,
              name: product.name,
              defaultUnitId: product.defaultUnitId,
              imageUrl: product.imageStorageId
                ? await ctx.storage.getUrl(product.imageStorageId)
                : null,
              units: hydratedUnits.filter((unit) => unit !== null),
            };
          }),
      ),
    };
  },
});

export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    const { organizationId } = await requireOrganization(ctx);
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_CHILD_ROWS);

    return await Promise.all(
      categories.map(async (category) => ({
        id: category._id,
        name: category.name,
        inUse: Boolean(
          await ctx.db
            .query("products")
            .withIndex("by_organizationId_and_categoryId", (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("categoryId", category._id),
            )
            .first(),
        ),
      })),
    );
  },
});

export const listUnits = query({
  args: {},
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

export const createProduct = mutation({
  args: {
    name: v.string(),
    category: categoryReferenceValidator,
    units: v.array(productUnitInputValidator),
    ingredients: v.array(ingredientInputValidator),
  },
  handler: async (ctx, args) => {
    const { organizationId, userIdentifier } =
      await requireCatalogManager(ctx);
    const { name, normalizedName } = normalizeName(args.name, "Produktnavnet");
    await assertProductNameAvailable(ctx, organizationId, normalizedName);
    const categoryId = await resolveCategory(
      ctx,
      organizationId,
      args.category,
    );
    const units = await resolveUnits(ctx, organizationId, args.units);
    await validateIngredients(ctx, organizationId, args.ingredients);

    const defaultUnitId = units.find((unit) => unit.isDefault)!.unitId;
    const productId = await ctx.db.insert("products", {
      organizationId,
      name,
      normalizedName,
      categoryId,
      defaultUnitId,
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
    return productId;
  },
});

export const updateProduct = mutation({
  args: {
    productId: v.id("products"),
    name: v.string(),
    category: categoryReferenceValidator,
    units: v.array(productUnitInputValidator),
    ingredients: v.array(ingredientInputValidator),
  },
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
    const product = await ctx.db.get("products", args.productId);
    if (!product || product.organizationId !== organizationId) {
      throw new ConvexError("Produktet blev ikke fundet");
    }

    const { name, normalizedName } = normalizeName(args.name, "Produktnavnet");
    await assertProductNameAvailable(
      ctx,
      organizationId,
      normalizedName,
      product._id,
    );
    const categoryId = await resolveCategory(
      ctx,
      organizationId,
      args.category,
    );
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
    await assertNoRecipeCycle(
      ctx,
      organizationId,
      product._id,
      args.ingredients,
    );

    const defaultUnitId = units.find((unit) => unit.isDefault)!.unitId;
    if (defaultUnitId !== product.defaultUnitId) {
      const stockRows = await ctx.db
        .query("locationStock")
        .withIndex("by_organizationId_and_productId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("productId", product._id),
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
    await ctx.db.patch("products", product._id, {
      name,
      normalizedName,
      categoryId,
      defaultUnitId,
      updatedAt: Date.now(),
    });
    return product._id;
  },
});

export const archiveProduct = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
    const product = await ctx.db.get("products", args.productId);
    if (!product || product.organizationId !== organizationId) {
      throw new ConvexError("Produktet blev ikke fundet");
    }
    const archivedAt = Date.now();
    await ctx.db.patch("products", product._id, {
      status: "archived",
      archivedAt,
      updatedAt: archivedAt,
    });
    await ctx.scheduler.runAfter(
      ARCHIVE_RETENTION_MS,
      internal.catalog.deleteExpiredProduct,
      { productId: product._id, archivedAt },
    );
    return null;
  },
});

export const restoreProduct = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
    const product = await ctx.db.get("products", args.productId);
    if (!product || product.organizationId !== organizationId) {
      throw new ConvexError("Produktet blev ikke fundet");
    }
    await ctx.db.patch("products", product._id, {
      status: "active",
      archivedAt: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const deleteProduct = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
    const product = await ctx.db.get("products", args.productId);
    if (!product || product.organizationId !== organizationId) {
      throw new ConvexError("Produktet blev ikke fundet");
    }
    if (product.status !== "archived") {
      throw new ConvexError("Produktet skal arkiveres, før det kan slettes");
    }
    await permanentlyDeleteProduct(ctx, product);
    return null;
  },
});

export const deleteExpiredProduct = internalMutation({
  args: { productId: v.id("products"), archivedAt: v.number() },
  handler: async (ctx, args) => {
    const product = await ctx.db.get("products", args.productId);
    if (
      !product ||
      product.status !== "archived" ||
      product.archivedAt !== args.archivedAt
    ) {
      return null;
    }
    await permanentlyDeleteProduct(ctx, product);
    return null;
  },
});

export const deleteExpiredProducts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const product = await ctx.db
      .query("products")
      .withIndex("by_status_and_archivedAt", (q) =>
        q
          .eq("status", "archived")
          .lt("archivedAt", Date.now() - ARCHIVE_RETENTION_MS),
      )
      .first();
    if (!product) return null;

    await permanentlyDeleteProduct(ctx, product);
    await ctx.scheduler.runAfter(
      0,
      internal.catalog.deleteExpiredProducts,
      {},
    );
    return null;
  },
});

export const createCategory = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
    const { name, normalizedName } = normalizeName(args.name, "Kategorinavnet");
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("normalizedName", normalizedName),
      )
      .unique();
    if (existing) throw new ConvexError("Kategorien findes allerede");
    return await ctx.db.insert("categories", {
      organizationId,
      name,
      normalizedName,
    });
  },
});

export const renameCategory = mutation({
  args: { categoryId: v.id("categories"), name: v.string() },
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
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
    await ctx.db.patch("categories", category._id, { name, normalizedName });
    return null;
  },
});

export const deleteCategory = mutation({
  args: { categoryId: v.id("categories") },
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
    const category = await ctx.db.get("categories", args.categoryId);
    if (!category || category.organizationId !== organizationId) {
      throw new ConvexError("Kategorien blev ikke fundet");
    }
    const [product, staffFoodAllowance] = await Promise.all([
      ctx.db
        .query("products")
        .withIndex("by_organizationId_and_categoryId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("categoryId", category._id),
        )
        .first(),
      ctx.db
        .query("staffFoodRuleAllowances")
        .withIndex("by_organizationId_and_categoryId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("categoryId", category._id),
        )
        .first(),
    ]);
    if (product) throw new ConvexError("Kategorien er stadig i brug");
    if (staffFoodAllowance) {
      throw new ConvexError("Kategorien bruges stadig i Staff food");
    }
    await ctx.db.delete("categories", category._id);
    return null;
  },
});

export const createUnit = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
    const { name, normalizedName } = normalizeName(args.name, "Enhedsnavnet");
    const existing = await ctx.db
      .query("units")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("normalizedName", normalizedName),
      )
      .unique();
    if (existing) throw new ConvexError("Enheden findes allerede");
    return await ctx.db.insert("units", {
      organizationId,
      name,
      normalizedName,
    });
  },
});

export const renameUnit = mutation({
  args: { unitId: v.id("units"), name: v.string() },
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
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
    return null;
  },
});

export const deleteUnit = mutation({
  args: { unitId: v.id("units") },
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
    const unit = await ctx.db.get("units", args.unitId);
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
    return null;
  },
});

export const generateProductImageUploadUrl = mutation({
  args: {},
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
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
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
    return null;
  },
});

export const removeProductImage = mutation({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
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
    }
    return null;
  },
});
