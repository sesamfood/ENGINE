import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { hasPermission } from "../../lib/auth-permissions";
import { recordAudit, type AuditActor } from "../lib/audit";
import {
  requireAllLocationAccess,
  requireHumanPrincipal,
  requireIntegrationManager,
  requireOrganization,
} from "../lib/auth";
import { normalizeMasterDataName } from "../lib/masterData";
import { isIntegrationEnabled, requireIntegrationEnabled } from "./state";

// Supplier integrations whose catalog products are linked to Produkter and ordered in whole packs.
export const catalogProviders = {
  gssupply: {
    name: "GS Supply",
    connections: "gsSupplyConnections",
    links: "gsSupplyProductLinks",
    productNumber: /^[\w.-]{1,50}$/,
  },
  abcatering: {
    name: "AB Catering",
    connections: "abCateringConnections",
    links: "abCateringProductLinks",
    // AB product id and order unit, e.g. "309807 KRT".
    productNumber: /^\d{1,20} [\p{L}\d]{1,20}$/u,
  },
} as const;

export type CatalogProvider = keyof typeof catalogProviders;
type CatalogProviderConfig = (typeof catalogProviders)[CatalogProvider];
export const catalogProviderIds = Object.keys(
  catalogProviders,
) as CatalogProvider[];
export const catalogProviderValidator = v.union(
  v.literal("gssupply"),
  v.literal("abcatering"),
);

export const MAX_LINKS = 500;
const MAX_PRODUCT_UNITS = 200;

export const catalogItemValidator = v.object({
  productNumber: v.string(),
  name: v.string(),
  category: v.string(),
  // Default units in one pack, used to suggest a unit.
  unitAmount: v.number(),
  minOrder: v.number(),
  price: v.number(),
  pictureUrl: v.union(v.string(), v.null()),
  // Null when the supplier does not report stock.
  availableQuantity: v.union(v.number(), v.null()),
  leadTimeDays: v.number(),
});

export type CatalogItem = Infer<typeof catalogItemValidator>;

export async function getCatalogConnection<P extends CatalogProvider>(
  ctx: QueryCtx,
  provider: P,
  organizationId: string,
) {
  const table: CatalogProviderConfig["connections"] =
    catalogProviders[provider].connections;
  // The query can't narrow the generic table, so the result is cast to the provider's table.
  return (await ctx.db
    .query(table)
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .unique()) as Doc<(typeof catalogProviders)[P]["connections"]> | null;
}

/** The supplier whose orders use the provider's catalog, when the integration is usable. */
export async function getCatalogSupplierId(
  ctx: QueryCtx,
  provider: CatalogProvider,
  organizationId: string,
) {
  if (!(await isIntegrationEnabled(ctx, organizationId, provider))) {
    return null;
  }
  return (
    (await getCatalogConnection(ctx, provider, organizationId))?.supplierId ??
    null
  );
}

/** The catalog provider that a supplier orders through, if any. */
export async function getCatalogProvider(
  ctx: QueryCtx,
  organizationId: string,
  supplierId: Id<"suppliers">,
) {
  for (const provider of catalogProviderIds) {
    if (
      (await getCatalogSupplierId(ctx, provider, organizationId)) === supplierId
    ) {
      return provider;
    }
  }
  return null;
}

export async function getCatalogLink(
  ctx: QueryCtx,
  provider: CatalogProvider,
  organizationId: string,
  productId: Id<"products">,
) {
  return ctx.db
    .query(catalogProviders[provider].links)
    .withIndex("by_organizationId_and_productId", (q) =>
      q.eq("organizationId", organizationId).eq("productId", productId),
    )
    .unique();
}

export async function linkForNumber(
  ctx: QueryCtx,
  provider: CatalogProvider,
  organizationId: string,
  productNumber: string,
) {
  return ctx.db
    .query(catalogProviders[provider].links)
    .withIndex("by_organizationId_and_productNumber", (q) =>
      q.eq("organizationId", organizationId).eq("productNumber", productNumber),
    )
    .first();
}

export async function listCatalogLinks(
  ctx: QueryCtx,
  provider: CatalogProvider,
  organizationId: string,
) {
  return ctx.db
    .query(catalogProviders[provider].links)
    .withIndex("by_organizationId_and_productId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .take(MAX_LINKS);
}

/** Removes every provider's link to a deleted Produkt. */
export async function deleteCatalogLinks(
  ctx: MutationCtx,
  organizationId: string,
  productId: Id<"products">,
) {
  for (const provider of catalogProviderIds) {
    const link = await getCatalogLink(ctx, provider, organizationId, productId);
    if (link) await ctx.db.delete(catalogProviders[provider].links, link._id);
  }
}

/** Moves links to a merged unit, or deletes them when `targetUnitId` is null. */
export async function replaceCatalogLinkUnit(
  ctx: MutationCtx,
  organizationId: string,
  unitId: Id<"units">,
  targetUnitId: Id<"units"> | null,
  limit: number,
) {
  for (const provider of catalogProviderIds) {
    const table = catalogProviders[provider].links;
    const links = await ctx.db
      .query(table)
      .withIndex("by_organizationId_and_unitId", (q) =>
        q.eq("organizationId", organizationId).eq("unitId", unitId),
      )
      .take(limit);
    for (const link of links) {
      if (targetUnitId) {
        await ctx.db.patch(table, link._id, { unitId: targetUnitId });
      } else {
        await ctx.db.delete(table, link._id);
      }
    }
  }
}

/** Units a product can be ordered in, with their factor to the default unit. */
export async function getProductUnitFactors(
  ctx: QueryCtx,
  product: Doc<"products">,
) {
  const rows = await ctx.db
    .query("productUnits")
    .withIndex("by_organizationId_and_productId", (q) =>
      q.eq("organizationId", product.organizationId).eq("productId", product._id),
    )
    .take(MAX_PRODUCT_UNITS);
  const factors = new Map<Id<"units">, number>(
    rows.map((row) => [row.unitId, row.factorToDefault]),
  );
  factors.set(product.defaultUnitId, 1);
  return factors;
}

/** Factor from a unit to the product's default unit, or null if the product no longer has the unit. */
export async function getProductUnitFactor(
  ctx: QueryCtx,
  product: Doc<"products">,
  unitId: Id<"units">,
) {
  if (unitId === product.defaultUnitId) return 1;
  const row = await ctx.db
    .query("productUnits")
    .withIndex("by_organizationId_and_productId_and_unitId", (q) =>
      q
        .eq("organizationId", product.organizationId)
        .eq("productId", product._id)
        .eq("unitId", unitId),
    )
    .unique();
  return row?.factorToDefault ?? null;
}

/** Orders through a catalog need a supplier, so a connected catalog gets one automatically. */
export async function ensureCatalogSupplier(
  ctx: MutationCtx,
  actor: AuditActor,
  provider: CatalogProvider,
  organizationId: string,
) {
  const connection = await getCatalogConnection(ctx, provider, organizationId);
  if (!connection) return;
  if (
    connection.supplierId &&
    (await ctx.db.get("suppliers", connection.supplierId))
  ) {
    return;
  }
  const { name, normalizedName } = normalizeMasterDataName(
    catalogProviders[provider].name,
    "Navnet",
  );
  const existing = await ctx.db
    .query("suppliers")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q.eq("organizationId", organizationId).eq("normalizedName", normalizedName),
    )
    .first();
  const supplierId =
    existing?._id ??
    (await ctx.db.insert("suppliers", {
      organizationId,
      name,
      normalizedName,
      updatedAt: Date.now(),
    }));
  if (!existing) {
    await recordAudit(ctx, actor, {
      action: "supplier.created",
      entityTable: "suppliers",
      entityId: supplierId,
      summary: `Leverandøren ${name} er oprettet`,
    });
  }
  await ctx.db.patch(catalogProviders[provider].connections, connection._id, {
    supplierId,
    updatedAt: Date.now(),
  });
}

/** Catalog reads are allowed for ordering and for link setup. */
export async function requireCatalogReader(
  ctx: ActionCtx,
  provider: CatalogProvider,
) {
  const auth = await requireOrganization(ctx);
  const canOrder =
    !auth.kioskModeEnabled &&
    !auth.disabledFeatures.has("ordering") &&
    hasPermission(auth.role, auth.permissions, "ordering.plan");
  const canManage =
    !auth.kioskModeEnabled &&
    hasPermission(auth.role, auth.permissions, "integrations.manage");
  if (!canOrder && !canManage) {
    throw new ConvexError(
      `Du har ikke adgang til ${catalogProviders[provider].name}-kataloget`,
    );
  }
  return auth;
}

export async function requireCatalogManager(
  ctx: QueryCtx | MutationCtx,
  provider: CatalogProvider,
) {
  const auth = requireHumanPrincipal(await requireIntegrationManager(ctx));
  requireAllLocationAccess(auth);
  await requireIntegrationEnabled(ctx, auth.organizationId, provider);
  return auth;
}
