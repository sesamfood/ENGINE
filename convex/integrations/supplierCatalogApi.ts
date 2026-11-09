import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { hasPermission } from "../../lib/auth-permissions";
import { recordAudit } from "../lib/audit";
import { requireLocationAccess, requirePermission } from "../lib/auth";
import { getProductCategoryIds } from "../lib/productCategories";
import { createProductWithAuth } from "../catalog";
import {
  catalogProviders,
  getCatalogLink,
  getCatalogSupplierId,
  getProductUnitFactor,
  getProductUnitFactors,
  linkForNumber,
  listCatalogLinks,
  MAX_LINKS,
  requireCatalogManager,
  type CatalogProvider,
} from "./supplierCatalog";

const MAX_PRODUCTS = 500;
const MAX_UNITS = 1000;

const unitOptionValidator = v.object({
  id: v.id("units"),
  name: v.string(),
  factorToDefault: v.number(),
});

const linkValidator = v.object({
  productNumber: v.string(),
  productName: v.string(),
  unitId: v.id("units"),
});

function unitOptions(
  factors: Map<Id<"units">, number>,
  names: Map<Id<"units">, string>,
) {
  return [...factors]
    .flatMap(([id, factorToDefault]) => {
      const name = names.get(id);
      return name === undefined ? [] : [{ id, name, factorToDefault }];
    })
    .sort((a, b) => a.factorToDefault - b.factorToDefault);
}

async function unitNames(ctx: QueryCtx, organizationId: string) {
  const units = await ctx.db
    .query("units")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q.eq("organizationId", organizationId),
    )
    .take(MAX_UNITS);
  return new Map(units.map((unit) => [unit._id, unit.name]));
}

function publicLink(
  link: { productNumber: string; productName: string; unitId: Id<"units"> } | null,
) {
  return link
    ? {
        productNumber: link.productNumber,
        productName: link.productName,
        unitId: link.unitId,
      }
    : null;
}

async function requireProduct(
  ctx: MutationCtx,
  organizationId: string,
  productId: Id<"products">,
) {
  const product = await ctx.db.get("products", productId);
  if (!product || product.organizationId !== organizationId) {
    throw new ConvexError("Produktet blev ikke fundet");
  }
  return product;
}

const referenceValidator = <T extends "categories" | "units">(table: T) =>
  v.union(
    v.object({ kind: v.literal("existing"), id: v.id(table) }),
    v.object({ kind: v.literal("new"), name: v.string() }),
  );

/** Link setup and ordering functions, registered by each catalog provider's api module. */
export function catalogLinkFunctions(provider: CatalogProvider) {
  const { name: providerName, links: table, productNumber: productNumberPattern } =
    catalogProviders[provider];

  async function validateLink(
    ctx: MutationCtx,
    product: Doc<"products">,
    link: { productNumber: string; productName: string; unitId: Id<"units"> },
  ) {
    const productNumber = link.productNumber.trim();
    const productName = link.productName.trim().slice(0, 300);
    if (!productNumberPattern.test(productNumber) || !productName) {
      throw new ConvexError(`${providerName}-produktet er ugyldigt`);
    }
    if ((await getProductUnitFactor(ctx, product, link.unitId)) === null) {
      throw new ConvexError("Vælg en af produktets enheder");
    }
    return { productNumber, productName, unitId: link.unitId };
  }

  async function requireLinkCapacity(ctx: MutationCtx, organizationId: string) {
    const links = await listCatalogLinks(ctx, provider, organizationId);
    if (links.length >= MAX_LINKS) {
      throw new ConvexError(
        `Der kan højst være ${MAX_LINKS} ${providerName}-koblinger`,
      );
    }
  }

  const listLinks = query({
    args: {},
    returns: v.object({
      products: v.array(
        v.object({
          id: v.id("products"),
          name: v.string(),
          categoryIds: v.array(v.id("categories")),
          units: v.array(unitOptionValidator),
          link: v.union(linkValidator, v.null()),
        }),
      ),
      limitReached: v.boolean(),
    }),
    handler: async (ctx) => {
      const { organizationId } = await requireCatalogManager(ctx, provider);
      const [products, links, names] = await Promise.all([
        ctx.db
          .query("products")
          .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
            q.eq("organizationId", organizationId).eq("status", "active"),
          )
          .take(MAX_PRODUCTS + 1),
        listCatalogLinks(ctx, provider, organizationId),
        unitNames(ctx, organizationId),
      ]);
      const byProductId = new Map(links.map((link) => [link.productId, link]));
      return {
        products: await Promise.all(
          products.slice(0, MAX_PRODUCTS).map(async (product) => ({
            id: product._id,
            name: product.name,
            categoryIds: await getProductCategoryIds(ctx, product),
            units: unitOptions(
              await getProductUnitFactors(ctx, product),
              names,
            ),
            link: publicLink(byProductId.get(product._id) ?? null),
          })),
        ),
        limitReached: products.length > MAX_PRODUCTS,
      };
    },
  });

  const getProductLink = query({
    args: { productId: v.id("products") },
    returns: v.union(
      v.object({
        units: v.array(unitOptionValidator),
        link: v.union(linkValidator, v.null()),
      }),
      v.null(),
    ),
    handler: async (ctx, args) => {
      const { organizationId } = await requireCatalogManager(ctx, provider);
      const product = await ctx.db.get("products", args.productId);
      if (!product || product.organizationId !== organizationId) return null;
      return {
        units: unitOptions(
          await getProductUnitFactors(ctx, product),
          await unitNames(ctx, organizationId),
        ),
        link: publicLink(
          await getCatalogLink(ctx, provider, organizationId, product._id),
        ),
      };
    },
  });

  /** Links from the product's side: replaces the product's link. */
  const setProductLink = mutation({
    args: {
      productId: v.id("products"),
      link: v.union(linkValidator, v.null()),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
      const auth = await requireCatalogManager(ctx, provider);
      const { organizationId } = auth;
      const product = await requireProduct(ctx, organizationId, args.productId);
      const current = await getCatalogLink(
        ctx,
        provider,
        organizationId,
        product._id,
      );
      if (!args.link) {
        if (current) await ctx.db.delete(table, current._id);
      } else {
        const next = await validateLink(ctx, product, args.link);
        const taken = await linkForNumber(
          ctx,
          provider,
          organizationId,
          next.productNumber,
        );
        if (taken && taken.productId !== product._id) {
          const other = await ctx.db.get("products", taken.productId);
          throw new ConvexError(
            `${providerName}-produktet er allerede koblet til ${other?.name ?? "et andet produkt"}`,
          );
        }
        if (current) {
          await ctx.db.patch(table, current._id, next);
        } else {
          await requireLinkCapacity(ctx, organizationId);
          await ctx.db.insert(table, {
            organizationId,
            productId: product._id,
            ...next,
          });
        }
      }
      await recordAudit(ctx, auth, {
        action: `${provider}.productLinkChanged`,
        entityTable: "products",
        entityId: product._id,
        summary: args.link
          ? `${product.name} er koblet til ${providerName}-varenummer ${args.link.productNumber.trim()}`
          : `${providerName}-koblingen for ${product.name} er fjernet`,
      });
      return null;
    },
  });

  /** Links from the catalog item's side: moves the item to another product or removes it. */
  const setCatalogLink = mutation({
    args: {
      productNumber: v.string(),
      productName: v.string(),
      target: v.union(
        v.object({ productId: v.id("products"), unitId: v.id("units") }),
        v.null(),
      ),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
      const auth = await requireCatalogManager(ctx, provider);
      const { organizationId } = auth;
      const current = await linkForNumber(
        ctx,
        provider,
        organizationId,
        args.productNumber.trim(),
      );
      if (!args.target) {
        if (!current) return null;
        await ctx.db.delete(table, current._id);
        await recordAudit(ctx, auth, {
          action: `${provider}.productLinkChanged`,
          entityTable: "products",
          entityId: current.productId,
          summary: `${providerName}-varenummer ${current.productNumber} er ikke længere koblet`,
        });
        return null;
      }
      const product = await requireProduct(
        ctx,
        organizationId,
        args.target.productId,
      );
      const next = await validateLink(ctx, product, {
        productNumber: args.productNumber,
        productName: args.productName,
        unitId: args.target.unitId,
      });
      const productLink = await getCatalogLink(
        ctx,
        provider,
        organizationId,
        product._id,
      );
      if (productLink && productLink.productNumber !== next.productNumber) {
        throw new ConvexError(
          `${product.name} er allerede koblet til ${providerName}-varenummer ${productLink.productNumber}`,
        );
      }
      if (current && current.productId !== product._id) {
        await ctx.db.delete(table, current._id);
      }
      if (productLink) {
        await ctx.db.patch(table, productLink._id, next);
      } else {
        if (!current) await requireLinkCapacity(ctx, organizationId);
        await ctx.db.insert(table, {
          organizationId,
          productId: product._id,
          ...next,
        });
      }
      await recordAudit(ctx, auth, {
        action: `${provider}.productLinkChanged`,
        entityTable: "products",
        entityId: product._id,
        summary: `${product.name} er koblet til ${providerName}-varenummer ${next.productNumber}`,
      });
      return null;
    },
  });

  /** Creates a product from a catalog item and links the item to it in one step. */
  const createProductFromCatalog = mutation({
    args: {
      productNumber: v.string(),
      productName: v.string(),
      name: v.string(),
      category: referenceValidator("categories"),
      defaultUnit: referenceValidator("units"),
      // The unit for one pack, when a pack holds more than one default unit.
      packUnit: v.union(
        v.object({
          unit: referenceValidator("units"),
          factorToDefault: v.number(),
        }),
        v.null(),
      ),
    },
    returns: v.id("products"),
    handler: async (ctx, args) => {
      const auth = await requireCatalogManager(ctx, provider);
      if (!hasPermission(auth.role, auth.permissions, "catalog.manage")) {
        throw new ConvexError("Du har ikke adgang til at oprette Produkter");
      }
      const { organizationId } = auth;
      if (
        await linkForNumber(
          ctx,
          provider,
          organizationId,
          args.productNumber.trim(),
        )
      ) {
        throw new ConvexError(`${providerName}-produktet er allerede koblet`);
      }
      await requireLinkCapacity(ctx, organizationId);
      const productId = await createProductWithAuth(ctx, auth, {
        name: args.name,
        categories: [args.category],
        units: [
          { unit: args.defaultUnit, factorToDefault: 1, isDefault: true },
          ...(args.packUnit
            ? [
                {
                  unit: args.packUnit.unit,
                  factorToDefault: args.packUnit.factorToDefault,
                  isDefault: false,
                },
              ]
            : []),
        ],
        ingredients: [],
        addableIngredients: [],
      });
      const product = (await ctx.db.get("products", productId))!;
      const packUnit = args.packUnit
        ? (
            await ctx.db
              .query("productUnits")
              .withIndex("by_organizationId_and_productId", (q) =>
                q.eq("organizationId", organizationId).eq("productId", productId),
              )
              .take(10)
          ).find((row) => row.unitId !== product.defaultUnitId)
        : undefined;
      if (args.packUnit && !packUnit) {
        throw new ConvexError(
          "Pakkeenheden skal være forskellig fra standardenheden",
        );
      }
      const next = await validateLink(ctx, product, {
        productNumber: args.productNumber,
        productName: args.productName,
        unitId: packUnit?.unitId ?? product.defaultUnitId,
      });
      await ctx.db.insert(table, { organizationId, productId, ...next });
      await recordAudit(ctx, auth, {
        action: `${provider}.productLinkChanged`,
        entityTable: "products",
        entityId: productId,
        summary: `${product.name} er oprettet fra ${providerName}-varenummer ${next.productNumber}`,
      });
      return productId;
    },
  });

  /** Links for the supplier that orders through the catalog, in the units products are ordered in. */
  const listOrderingLinks = query({
    args: { locationId: v.id("locations") },
    returns: v.union(
      v.object({
        supplierId: v.id("suppliers"),
        links: v.array(
          v.object({
            productId: v.id("products"),
            productNumber: v.string(),
            unitId: v.id("units"),
            unitName: v.string(),
            factorToDefault: v.number(),
          }),
        ),
      }),
      v.null(),
    ),
    handler: async (ctx, args) => {
      const auth = await requirePermission(ctx, "ordering.plan");
      if (auth.kioskModeEnabled) {
        throw new ConvexError("Du har ikke adgang til bestilling");
      }
      requireLocationAccess(auth, args.locationId);
      const supplierId = await getCatalogSupplierId(
        ctx,
        provider,
        auth.organizationId,
      );
      if (!supplierId) return null;
      const links = await listCatalogLinks(ctx, provider, auth.organizationId);
      const rows = await Promise.all(
        links.map(async (link) => {
          const [product, unit] = await Promise.all([
            ctx.db.get("products", link.productId),
            ctx.db.get("units", link.unitId),
          ]);
          if (!product || product.status !== "active" || !unit) return null;
          const factorToDefault = await getProductUnitFactor(
            ctx,
            product,
            link.unitId,
          );
          if (factorToDefault === null) return null;
          return {
            productId: link.productId,
            productNumber: link.productNumber,
            unitId: link.unitId,
            unitName: unit.name,
            factorToDefault,
          };
        }),
      );
      return { supplierId, links: rows.filter((row) => row !== null) };
    },
  });

  return {
    listLinks,
    getProductLink,
    setProductLink,
    setCatalogLink,
    createProductFromCatalog,
    listOrderingLinks,
  };
}
