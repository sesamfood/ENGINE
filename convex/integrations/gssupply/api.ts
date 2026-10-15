import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  action,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server";
import { hasPermission } from "../../../lib/auth-permissions";
import { recordAudit } from "../../lib/audit";
import {
  requireAllLocationAccess,
  requireHumanPrincipal,
  requireIntegrationManager,
  requireLocationAccess,
  requireOrganization,
} from "../../lib/auth";
import { getProductCategoryIds } from "../../lib/productCategories";
import { createProductWithAuth } from "../../catalog";
import {
  decryptCredential,
  encryptCredential,
  ensureOrganizationCredentialKey,
} from "../credentials";
import { requireIntegrationEnabled } from "../state";
import { ensureGsSupplySupplier } from "./lifecycle";
import {
  catalogUrlPreview,
  fetchGsSupplyCatalog,
  fetchGsSupplyImage,
  gsSupplyCatalogProductValidator,
  parseCatalogUrl,
  type GsSupplyCatalogProduct,
} from "./lib/api";
import {
  getGsSupplyConnection,
  getGsSupplyLink,
  getGsSupplySupplierId,
  getProductUnitFactor,
  getProductUnitFactors,
  MAX_LINKS,
} from "./lib/links";

const MAX_PRODUCTS = 500;
const MAX_UNITS = 1000;
const PRODUCT_NUMBER = /^[\w.-]{1,50}$/;

async function requireManager(ctx: QueryCtx | MutationCtx) {
  const auth = requireHumanPrincipal(await requireIntegrationManager(ctx));
  requireAllLocationAccess(auth);
  await requireIntegrationEnabled(ctx, auth.organizationId, "gssupply");
  return auth;
}

const unitOptionValidator = v.object({
  id: v.id("units"),
  name: v.string(),
  factorToDefault: v.number(),
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

const linkValidator = v.object({
  productNumber: v.string(),
  productName: v.string(),
  unitId: v.id("units"),
});

export const getSettings = query({
  args: {},
  returns: v.object({
    organizationId: v.string(),
    connection: v.union(
      v.object({
        catalogUrlPreview: v.string(),
        supplierName: v.union(v.string(), v.null()),
        connectedAt: v.number(),
      }),
      v.null(),
    ),
  }),
  handler: async (ctx) => {
    const auth = await requireManager(ctx);
    const connection = await getGsSupplyConnection(ctx, auth.organizationId);
    const supplier = connection?.supplierId
      ? await ctx.db.get("suppliers", connection.supplierId)
      : null;
    return {
      organizationId: auth.organizationId,
      connection: connection
        ? {
            catalogUrlPreview: connection.catalogUrlPreview,
            supplierName: supplier?.name ?? null,
            connectedAt: connection.connectedAt,
          }
        : null,
    };
  },
});

export const saveConnection = internalMutation({
  args: {
    organizationId: v.string(),
    encryptedCatalogUrl: v.string(),
    catalogUrlPreview: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireManager(ctx);
    if (auth.organizationId !== args.organizationId) {
      throw new ConvexError("Organisationen er ændret. Prøv igen");
    }
    const current = await getGsSupplyConnection(ctx, auth.organizationId);
    const now = Date.now();
    let id;
    if (current) {
      id = current._id;
      await ctx.db.patch("gsSupplyConnections", id, {
        encryptedCatalogUrl: args.encryptedCatalogUrl,
        catalogUrlPreview: args.catalogUrlPreview,
        updatedAt: now,
      });
    } else {
      id = await ctx.db.insert("gsSupplyConnections", {
        organizationId: auth.organizationId,
        encryptedCatalogUrl: args.encryptedCatalogUrl,
        catalogUrlPreview: args.catalogUrlPreview,
        connectedAt: now,
        updatedAt: now,
      });
    }
    const connection = await ctx.db.get("gsSupplyConnections", id);
    if (connection) await ensureGsSupplySupplier(ctx, auth, connection);
    await recordAudit(ctx, auth, {
      action: "gssupply.connected",
      entityTable: "gsSupplyConnections",
      entityId: id,
      summary: "GS Supply-kataloget er forbundet",
    });
    return null;
  },
});

export const connect = action({
  args: { expectedOrganizationId: v.string(), catalogUrl: v.string() },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const auth = requireHumanPrincipal(await requireIntegrationManager(ctx));
    requireAllLocationAccess(auth);
    if (auth.organizationId !== args.expectedOrganizationId) {
      throw new ConvexError("Organisationen er ændret. Prøv igen");
    }
    await requireIntegrationEnabled(ctx, auth.organizationId, "gssupply");
    const url = parseCatalogUrl(args.catalogUrl);
    const products = await fetchGsSupplyCatalog(url);
    const key = await ctx.runMutation(
      internal.integrations.credentials.ensureKey,
      { organizationId: auth.organizationId },
    );
    await ctx.runMutation(internal.integrations.gssupply.api.saveConnection, {
      organizationId: auth.organizationId,
      encryptedCatalogUrl: await encryptCredential(
        url.toString(),
        auth.organizationId,
        key,
      ),
      catalogUrlPreview: catalogUrlPreview(url),
    });
    return products.length;
  },
});

export const disconnect = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const auth = await requireManager(ctx);
    const connection = await getGsSupplyConnection(ctx, auth.organizationId);
    if (!connection) return null;
    // Product links stay so a reconnect keeps the setup.
    await ctx.db.delete("gsSupplyConnections", connection._id);
    await recordAudit(ctx, auth, {
      action: "gssupply.disconnected",
      entityTable: "gsSupplyConnections",
      entityId: connection._id,
      summary: "GS Supply-kataloget er afbrudt",
    });
    return null;
  },
});

export const getCatalogUrl = internalMutation({
  args: { organizationId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { organizationId }) => {
    await requireIntegrationEnabled(ctx, organizationId, "gssupply");
    const connection = await getGsSupplyConnection(ctx, organizationId);
    if (!connection) return null;
    const key = await ensureOrganizationCredentialKey(ctx, organizationId);
    return decryptCredential(
      connection.encryptedCatalogUrl,
      organizationId,
      key,
    );
  },
});

/** Reads the live catalog. Used by ordering and by product link setup. */
export const fetchCatalog = action({
  args: {},
  returns: v.array(gsSupplyCatalogProductValidator),
  handler: async (ctx): Promise<GsSupplyCatalogProduct[]> => {
    const auth = await requireOrganization(ctx);
    const canOrder =
      !auth.kioskModeEnabled &&
      hasPermission(auth.role, auth.permissions, "ordering.plan");
    const canManage =
      !auth.kioskModeEnabled &&
      hasPermission(auth.role, auth.permissions, "integrations.manage");
    if (!canOrder && !canManage) {
      throw new ConvexError("Du har ikke adgang til GS Supply-kataloget");
    }
    const catalogUrl: string | null = await ctx.runMutation(
      internal.integrations.gssupply.api.getCatalogUrl,
      { organizationId: auth.organizationId },
    );
    if (!catalogUrl) throw new ConvexError("GS Supply er ikke forbundet");
    return fetchGsSupplyCatalog(parseCatalogUrl(catalogUrl));
  },
});

export const listLinks = query({
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
    const { organizationId } = await requireManager(ctx);
    const [products, links, names] = await Promise.all([
      ctx.db
        .query("products")
        .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
          q.eq("organizationId", organizationId).eq("status", "active"),
        )
        .take(MAX_PRODUCTS + 1),
      ctx.db
        .query("gsSupplyProductLinks")
        .withIndex("by_organizationId_and_productId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_LINKS),
      unitNames(ctx, organizationId),
    ]);
    const byProductId = new Map(links.map((link) => [link.productId, link]));
    return {
      products: await Promise.all(
        products.slice(0, MAX_PRODUCTS).map(async (product) => {
          const link = byProductId.get(product._id);
          return {
            id: product._id,
            name: product.name,
            categoryIds: await getProductCategoryIds(ctx, product),
            units: unitOptions(
              await getProductUnitFactors(ctx, product),
              names,
            ),
            link: link
              ? {
                  productNumber: link.productNumber,
                  productName: link.productName,
                  unitId: link.unitId,
                }
              : null,
          };
        }),
      ),
      limitReached: products.length > MAX_PRODUCTS,
    };
  },
});

export const getProductLink = query({
  args: { productId: v.id("products") },
  returns: v.union(
    v.object({
      units: v.array(unitOptionValidator),
      link: v.union(linkValidator, v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const { organizationId } = await requireManager(ctx);
    const product = await ctx.db.get("products", args.productId);
    if (!product || product.organizationId !== organizationId) return null;
    const link = await getGsSupplyLink(ctx, organizationId, product._id);
    return {
      units: unitOptions(
        await getProductUnitFactors(ctx, product),
        await unitNames(ctx, organizationId),
      ),
      link: link
        ? {
            productNumber: link.productNumber,
            productName: link.productName,
            unitId: link.unitId,
          }
        : null,
    };
  },
});

async function validateLink(
  ctx: MutationCtx,
  product: Doc<"products">,
  link: { productNumber: string; productName: string; unitId: Id<"units"> },
) {
  const productNumber = link.productNumber.trim();
  const productName = link.productName.trim().slice(0, 300);
  if (!PRODUCT_NUMBER.test(productNumber) || !productName) {
    throw new ConvexError("GS Supply-produktet er ugyldigt");
  }
  if ((await getProductUnitFactor(ctx, product, link.unitId)) === null) {
    throw new ConvexError("Vælg en af produktets enheder");
  }
  return { productNumber, productName, unitId: link.unitId };
}

async function linkForNumber(
  ctx: MutationCtx,
  organizationId: string,
  productNumber: string,
) {
  return ctx.db
    .query("gsSupplyProductLinks")
    .withIndex("by_organizationId_and_productNumber", (q) =>
      q.eq("organizationId", organizationId).eq("productNumber", productNumber),
    )
    .first();
}

async function requireLinkCapacity(ctx: MutationCtx, organizationId: string) {
  const links = await ctx.db
    .query("gsSupplyProductLinks")
    .withIndex("by_organizationId_and_productId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .take(MAX_LINKS);
  if (links.length >= MAX_LINKS) {
    throw new ConvexError(
      `Der kan højst være ${MAX_LINKS} GS Supply-koblinger`,
    );
  }
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

/** Links from the product's side: replaces the product's link. */
export const setProductLink = mutation({
  args: {
    productId: v.id("products"),
    link: v.union(linkValidator, v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireManager(ctx);
    const { organizationId } = auth;
    const product = await requireProduct(ctx, organizationId, args.productId);
    const current = await getGsSupplyLink(ctx, organizationId, product._id);
    if (!args.link) {
      if (current) await ctx.db.delete("gsSupplyProductLinks", current._id);
    } else {
      const next = await validateLink(ctx, product, args.link);
      const taken = await linkForNumber(
        ctx,
        organizationId,
        next.productNumber,
      );
      if (taken && taken.productId !== product._id) {
        const other = await ctx.db.get("products", taken.productId);
        throw new ConvexError(
          `GS Supply-produktet er allerede koblet til ${other?.name ?? "et andet produkt"}`,
        );
      }
      if (current) {
        await ctx.db.patch("gsSupplyProductLinks", current._id, next);
      } else {
        await requireLinkCapacity(ctx, organizationId);
        await ctx.db.insert("gsSupplyProductLinks", {
          organizationId,
          productId: product._id,
          ...next,
        });
      }
    }
    await recordAudit(ctx, auth, {
      action: "gssupply.productLinkChanged",
      entityTable: "products",
      entityId: product._id,
      summary: args.link
        ? `${product.name} er koblet til GS Supply-varenummer ${args.link.productNumber.trim()}`
        : `GS Supply-koblingen for ${product.name} er fjernet`,
    });
    return null;
  },
});

/** Links from the catalog item's side: moves the item to another product or removes it. */
export const setCatalogLink = mutation({
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
    const auth = await requireManager(ctx);
    const { organizationId } = auth;
    const current = await linkForNumber(
      ctx,
      organizationId,
      args.productNumber.trim(),
    );
    if (!args.target) {
      if (!current) return null;
      await ctx.db.delete("gsSupplyProductLinks", current._id);
      await recordAudit(ctx, auth, {
        action: "gssupply.productLinkChanged",
        entityTable: "products",
        entityId: current.productId,
        summary: `GS Supply-varenummer ${current.productNumber} er ikke længere koblet`,
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
    const productLink = await getGsSupplyLink(ctx, organizationId, product._id);
    if (productLink && productLink.productNumber !== next.productNumber) {
      throw new ConvexError(
        `${product.name} er allerede koblet til GS Supply-varenummer ${productLink.productNumber}`,
      );
    }
    if (current && current.productId !== product._id) {
      await ctx.db.delete("gsSupplyProductLinks", current._id);
    }
    if (productLink) {
      await ctx.db.patch("gsSupplyProductLinks", productLink._id, next);
    } else {
      if (!current) await requireLinkCapacity(ctx, organizationId);
      await ctx.db.insert("gsSupplyProductLinks", {
        organizationId,
        productId: product._id,
        ...next,
      });
    }
    await recordAudit(ctx, auth, {
      action: "gssupply.productLinkChanged",
      entityTable: "products",
      entityId: product._id,
      summary: `${product.name} er koblet til GS Supply-varenummer ${next.productNumber}`,
    });
    return null;
  },
});

/** Downloads a catalog image so the browser can compress it like other product images. */
export const fetchCatalogImage = action({
  args: { url: v.string() },
  returns: v.object({ bytes: v.bytes(), contentType: v.string() }),
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (
      auth.kioskModeEnabled ||
      !hasPermission(auth.role, auth.permissions, "integrations.manage") ||
      !hasPermission(auth.role, auth.permissions, "catalog.manage")
    ) {
      throw new ConvexError("Du har ikke adgang til at hente billeder");
    }
    await requireIntegrationEnabled(ctx, auth.organizationId, "gssupply");
    return fetchGsSupplyImage(args.url);
  },
});

const referenceValidator = <T extends "categories" | "units">(table: T) =>
  v.union(
    v.object({ kind: v.literal("existing"), id: v.id(table) }),
    v.object({ kind: v.literal("new"), name: v.string() }),
  );

/** Creates a product from a catalog item and links the item to it in one step. */
export const createProductFromCatalog = mutation({
  args: {
    productNumber: v.string(),
    productName: v.string(),
    name: v.string(),
    category: referenceValidator("categories"),
    defaultUnit: referenceValidator("units"),
    // The unit for one pack, when a pack holds more than one default unit.
    packUnit: v.union(
      v.object({ unit: referenceValidator("units"), factorToDefault: v.number() }),
      v.null(),
    ),
  },
  returns: v.id("products"),
  handler: async (ctx, args) => {
    const auth = await requireManager(ctx);
    if (!hasPermission(auth.role, auth.permissions, "catalog.manage")) {
      throw new ConvexError("Du har ikke adgang til at oprette Produkter");
    }
    const { organizationId } = auth;
    if (await linkForNumber(ctx, organizationId, args.productNumber.trim())) {
      throw new ConvexError("GS Supply-produktet er allerede koblet");
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
      throw new ConvexError("Pakkeenheden skal være forskellig fra standardenheden");
    }
    const next = await validateLink(ctx, product, {
      productNumber: args.productNumber,
      productName: args.productName,
      unitId: packUnit?.unitId ?? product.defaultUnitId,
    });
    await ctx.db.insert("gsSupplyProductLinks", {
      organizationId,
      productId,
      ...next,
    });
    await recordAudit(ctx, auth, {
      action: "gssupply.productLinkChanged",
      entityTable: "products",
      entityId: productId,
      summary: `${product.name} er oprettet fra GS Supply-varenummer ${next.productNumber}`,
    });
    return productId;
  },
});

/** Links for the supplier that orders through GS Supply, in the units products are ordered in. */
export const listOrderingLinks = query({
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
    const auth = await requireOrganization(ctx);
    if (
      auth.kioskModeEnabled ||
      !hasPermission(auth.role, auth.permissions, "ordering.plan")
    ) {
      throw new ConvexError("Du har ikke adgang til bestilling");
    }
    requireLocationAccess(auth, args.locationId);
    const supplierId = await getGsSupplySupplierId(ctx, auth.organizationId);
    if (!supplierId) return null;
    const links = await ctx.db
      .query("gsSupplyProductLinks")
      .withIndex("by_organizationId_and_productId", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .take(MAX_LINKS);
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
