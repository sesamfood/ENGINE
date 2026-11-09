import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireCatalogManager } from "./lib/auth";
import { recordAudit } from "./lib/audit";
import { getProductCategoryIds } from "./lib/productCategories";
import {
  invalidateSalesStockMappings,
  MAX_MODIFIER_DEFAULTS,
} from "./lib/salesStock";

const MAX_SCANNED_PRODUCTS = 2000;
const MAX_SOLD_PRODUCTS = 500;
const MAX_CHILD_ROWS = 200;
const MAX_BULK_PRODUCT_SELECTION = 200;
const MAX_REFERENCES = 500;

const amountValidator = {
  quantity: v.number(),
  unitId: v.id("units"),
};

function requirePositive(quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new ConvexError("Mængden skal være større end 0");
  }
}

async function requireIngredientUnit(
  ctx: MutationCtx,
  organizationId: string,
  ingredientProductId: Id<"products">,
  unitId: Id<"units">,
) {
  const [ingredient, unit] = await Promise.all([
    ctx.db.get("products", ingredientProductId),
    ctx.db
      .query("productUnits")
      .withIndex("by_organizationId_and_productId_and_unitId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("productId", ingredientProductId)
          .eq("unitId", unitId),
      )
      .unique(),
  ]);
  if (
    !ingredient ||
    ingredient.organizationId !== organizationId ||
    ingredient.status !== "active"
  ) {
    throw new ConvexError("Ingrediensproduktet blev ikke fundet");
  }
  if (!unit) {
    throw new ConvexError("Vælg en enhed, der er konfigureret for ingrediensen");
  }
  return ingredient;
}

export async function deleteIngredientModifierDefaults(
  ctx: MutationCtx,
  organizationId: string,
  ingredientProductId: Id<"products">,
) {
  const [defaults, mappings] = await Promise.all([
    ctx.db
      .query("ingredientAdditionDefaults")
      .withIndex("by_organizationId_and_ingredientProductId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("ingredientProductId", ingredientProductId),
      )
      .take(10),
    ctx.db
      .query("onlinePosModifierMappings")
      .withIndex("by_organizationId_and_ingredientProductId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("ingredientProductId", ingredientProductId),
      )
      .take(100),
  ]);
  for (const row of defaults) {
    await ctx.db.delete("ingredientAdditionDefaults", row._id);
  }
  for (const row of mappings) {
    await ctx.db.delete("onlinePosModifierMappings", row._id);
  }
  if (defaults.length > 0 || mappings.length > 0) {
    await invalidateSalesStockMappings(ctx, organizationId);
  }
}

export const getOverview = query({
  args: {},
  returns: v.object({
    products: v.array(
      v.object({
        id: v.id("products"),
        name: v.string(),
        categoryIds: v.array(v.id("categories")),
        imageUrl: v.union(v.string(), v.null()),
        ingredients: v.array(
          v.object({
            ingredientProductId: v.id("products"),
            ...amountValidator,
            removable: v.boolean(),
          }),
        ),
        additions: v.array(
          v.object({
            ingredientProductId: v.id("products"),
            quantity: v.optional(v.number()),
            unitId: v.optional(v.id("units")),
          }),
        ),
      }),
    ),
    limitReached: v.boolean(),
    defaults: v.array(
      v.object({
        ingredientProductId: v.id("products"),
        ...amountValidator,
      }),
    ),
  }),
  handler: async (ctx) => {
    const { organizationId } = await requireCatalogManager(ctx);
    const [scanned, defaults] = await Promise.all([
      ctx.db
        .query("products")
        .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
          q.eq("organizationId", organizationId).eq("status", "active"),
        )
        .take(MAX_SCANNED_PRODUCTS + 1),
      ctx.db
        .query("ingredientAdditionDefaults")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_MODIFIER_DEFAULTS),
    ]);
    const sold = scanned
      .slice(0, MAX_SCANNED_PRODUCTS)
      .filter((product) => product.salesPrice !== undefined);
    const products = await Promise.all(
      sold.slice(0, MAX_SOLD_PRODUCTS).map(async (product) => {
        const [categoryIds, ingredients, additions, imageUrl] =
          await Promise.all([
            getProductCategoryIds(ctx, product),
            ctx.db
              .query("productIngredients")
              .withIndex("by_organizationId_and_productId", (q) =>
                q
                  .eq("organizationId", organizationId)
                  .eq("productId", product._id),
              )
              .take(MAX_CHILD_ROWS),
            ctx.db
              .query("productIngredientAdditions")
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
        return {
          id: product._id,
          name: product.name,
          categoryIds,
          imageUrl,
          ingredients: ingredients
            .filter((row) => !row.packaging)
            .map((row) => ({
              ingredientProductId: row.ingredientProductId,
              quantity: row.quantity,
              unitId: row.unitId,
              removable: row.removable === true,
            })),
          additions: additions.map((row) => ({
            ingredientProductId: row.ingredientProductId,
            quantity: row.quantity,
            unitId: row.unitId,
          })),
        };
      }),
    );
    return {
      products,
      limitReached:
        scanned.length > MAX_SCANNED_PRODUCTS || sold.length > MAX_SOLD_PRODUCTS,
      defaults: defaults.map((row) => ({
        ingredientProductId: row.ingredientProductId,
        quantity: row.quantity,
        unitId: row.unitId,
      })),
    };
  },
});

export const saveProductModifiers = mutation({
  args: {
    productIds: v.array(v.id("products")),
    removals: v.array(
      v.object({
        ingredientProductId: v.id("products"),
        removable: v.boolean(),
      }),
    ),
    // Without an amount, an enabled addition uses the shared standard amount.
    additions: v.array(
      v.object({
        ingredientProductId: v.id("products"),
        enabled: v.boolean(),
        quantity: v.optional(v.number()),
        unitId: v.optional(v.id("units")),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    const { organizationId } = auth;
    if (args.productIds.length === 0) {
      throw new ConvexError("Vælg mindst ét produkt");
    }
    if (args.productIds.length > MAX_BULK_PRODUCT_SELECTION) {
      throw new ConvexError(
        `Der kan højst ændres ${MAX_BULK_PRODUCT_SELECTION} produkter ad gangen`,
      );
    }
    if (new Set(args.productIds).size !== args.productIds.length) {
      throw new ConvexError("Et produkt må kun vælges én gang");
    }
    if (
      args.removals.length > MAX_CHILD_ROWS ||
      args.additions.length > MAX_CHILD_ROWS
    ) {
      throw new ConvexError("Der er for mange ændringer ad gangen");
    }
    if (
      new Set(args.removals.map((row) => row.ingredientProductId)).size !==
        args.removals.length ||
      new Set(args.additions.map((row) => row.ingredientProductId)).size !==
        args.additions.length
    ) {
      throw new ConvexError("Hver ingrediens kan kun ændres én gang");
    }

    const defaultsByIngredient = new Map<
      Id<"products">,
      Doc<"ingredientAdditionDefaults">
    >();
    for (const addition of args.additions) {
      if (!addition.enabled) continue;
      if ((addition.quantity === undefined) !== (addition.unitId === undefined)) {
        throw new ConvexError("Vælg både mængde og enhed for tilvalget");
      }
      if (addition.quantity !== undefined && addition.unitId !== undefined) {
        requirePositive(addition.quantity);
        await requireIngredientUnit(
          ctx,
          organizationId,
          addition.ingredientProductId,
          addition.unitId,
        );
      } else {
        const standard = await ctx.db
          .query("ingredientAdditionDefaults")
          .withIndex("by_organizationId_and_ingredientProductId", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("ingredientProductId", addition.ingredientProductId),
          )
          .first();
        if (!standard) {
          throw new ConvexError("Tilvalget har ingen standardmængde");
        }
        defaultsByIngredient.set(addition.ingredientProductId, standard);
      }
    }

    const updatedAt = Date.now();
    let changedProducts = 0;
    for (const productId of args.productIds) {
      const product = await ctx.db.get("products", productId);
      if (!product || product.organizationId !== organizationId) {
        throw new ConvexError("Et eller flere produkter blev ikke fundet");
      }
      const [ingredients, additions] = await Promise.all([
        ctx.db
          .query("productIngredients")
          .withIndex("by_organizationId_and_productId", (q) =>
            q.eq("organizationId", organizationId).eq("productId", productId),
          )
          .take(MAX_CHILD_ROWS),
        ctx.db
          .query("productIngredientAdditions")
          .withIndex("by_organizationId_and_productId", (q) =>
            q.eq("organizationId", organizationId).eq("productId", productId),
          )
          .take(MAX_CHILD_ROWS + 1),
      ]);
      let changed = false;

      for (const removal of args.removals) {
        const row = ingredients.find(
          (ingredient) =>
            !ingredient.packaging &&
            ingredient.ingredientProductId === removal.ingredientProductId,
        );
        if (!row || (row.removable === true) === removal.removable) continue;
        await ctx.db.patch("productIngredients", row._id, {
          removable: removal.removable,
          ...(removal.removable
            ? {}
            : {
                onlinePosRemovalMappings: undefined,
                onlinePosRemovalProductId: undefined,
                onlinePosRemovalIntegrationId: undefined,
                onlinePosRemovalCompanyId: undefined,
              }),
        });
        changed = true;
      }

      let additionCount = additions.length;
      for (const addition of args.additions) {
        const row = additions.find(
          (current) =>
            current.ingredientProductId === addition.ingredientProductId,
        );
        if (!addition.enabled) {
          if (row) {
            await ctx.db.delete("productIngredientAdditions", row._id);
            additionCount -= 1;
            changed = true;
          }
          continue;
        }
        if (addition.ingredientProductId === productId) {
          throw new ConvexError("Et produkt kan ikke tilføjes til sig selv");
        }
        if (row) {
          if (
            row.quantity !== addition.quantity ||
            row.unitId !== addition.unitId
          ) {
            await ctx.db.patch("productIngredientAdditions", row._id, {
              quantity: addition.quantity,
              unitId: addition.unitId,
            });
            changed = true;
          }
          continue;
        }
        if (additionCount >= MAX_CHILD_ROWS) {
          throw new ConvexError(
            `${product.name} har for mange ingredienser, der kan tilføjes`,
          );
        }
        await ctx.db.insert("productIngredientAdditions", {
          organizationId,
          productId,
          ingredientProductId: addition.ingredientProductId,
          quantity: addition.quantity,
          unitId: addition.unitId,
        });
        additionCount += 1;
        changed = true;
      }

      if (changed) {
        await ctx.db.patch("products", productId, { updatedAt });
        changedProducts += 1;
      }
    }

    if (changedProducts > 0) {
      await invalidateSalesStockMappings(ctx, organizationId);
      await recordAudit(ctx, auth, {
        action: "catalog.productModifiersChanged",
        entityTable: "products",
        entityId: args.productIds[0],
        summary: `Tilvalg og fravalg blev ændret for ${changedProducts} produkter`,
      });
    }
    return null;
  },
});

export const saveAdditionDefault = mutation({
  args: {
    ingredientProductId: v.id("products"),
    ...amountValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    const { organizationId } = auth;
    requirePositive(args.quantity);
    const ingredient = await requireIngredientUnit(
      ctx,
      organizationId,
      args.ingredientProductId,
      args.unitId,
    );
    const current = await ctx.db
      .query("ingredientAdditionDefaults")
      .withIndex("by_organizationId_and_ingredientProductId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("ingredientProductId", args.ingredientProductId),
      )
      .first();
    if (current) {
      if (current.quantity === args.quantity && current.unitId === args.unitId) {
        return null;
      }
      await ctx.db.patch("ingredientAdditionDefaults", current._id, {
        quantity: args.quantity,
        unitId: args.unitId,
        updatedAt: Date.now(),
      });
    } else {
      const existing = await ctx.db
        .query("ingredientAdditionDefaults")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_MODIFIER_DEFAULTS);
      if (existing.length >= MAX_MODIFIER_DEFAULTS) {
        throw new ConvexError("Der er for mange tilvalg");
      }
      await ctx.db.insert("ingredientAdditionDefaults", {
        organizationId,
        ingredientProductId: args.ingredientProductId,
        quantity: args.quantity,
        unitId: args.unitId,
        updatedAt: Date.now(),
      });
    }
    await invalidateSalesStockMappings(ctx, organizationId);
    await recordAudit(ctx, auth, {
      action: "catalog.additionDefaultSaved",
      entityTable: "products",
      entityId: ingredient._id,
      summary: `Standardtilvalget ${ingredient.name} blev gemt`,
    });
    return null;
  },
});

// Removing a standard addition also removes it from every product.
export const deleteAdditionDefault = mutation({
  args: { ingredientProductId: v.id("products") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    const { organizationId } = auth;
    const [ingredient, current, references] = await Promise.all([
      ctx.db.get("products", args.ingredientProductId),
      ctx.db
        .query("ingredientAdditionDefaults")
        .withIndex("by_organizationId_and_ingredientProductId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("ingredientProductId", args.ingredientProductId),
        )
        .first(),
      ctx.db
        .query("productIngredientAdditions")
        .withIndex("by_organizationId_and_ingredientProductId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("ingredientProductId", args.ingredientProductId),
        )
        .take(MAX_REFERENCES + 1),
    ]);
    if (!ingredient || ingredient.organizationId !== organizationId || !current) {
      throw new ConvexError("Tilvalget blev ikke fundet");
    }
    if (references.length > MAX_REFERENCES) {
      throw new ConvexError("Tilvalget bruges på for mange produkter");
    }
    for (const row of references) {
      await ctx.db.delete("productIngredientAdditions", row._id);
    }
    await ctx.db.delete("ingredientAdditionDefaults", current._id);
    await invalidateSalesStockMappings(ctx, organizationId);
    await recordAudit(ctx, auth, {
      action: "catalog.additionDefaultDeleted",
      entityTable: "products",
      entityId: ingredient._id,
      summary: `Standardtilvalget ${ingredient.name} blev fjernet fra ${references.length} produkter`,
    });
    return null;
  },
});
