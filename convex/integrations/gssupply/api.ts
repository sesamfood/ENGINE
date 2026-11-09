import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import { action, internalMutation, mutation, query } from "../../_generated/server";
import { hasPermission } from "../../../lib/auth-permissions";
import { recordAudit } from "../../lib/audit";
import {
  requireAllLocationAccess,
  requireHumanPrincipal,
  requireIntegrationManager,
  requireOrganization,
} from "../../lib/auth";
import {
  decryptCredential,
  encryptCredential,
  ensureOrganizationCredentialKey,
} from "../credentials";
import { requireIntegrationEnabled } from "../state";
import {
  catalogItemValidator,
  ensureCatalogSupplier,
  getCatalogConnection,
  requireCatalogManager,
  requireCatalogReader,
  type CatalogItem,
} from "../supplierCatalog";
import { catalogLinkFunctions } from "../supplierCatalogApi";
import {
  catalogUrlPreview,
  fetchGsSupplyCatalog,
  fetchGsSupplyImage,
  parseCatalogUrl,
} from "./lib/api";

export const {
  listLinks,
  getProductLink,
  setProductLink,
  setCatalogLink,
  createProductFromCatalog,
  listOrderingLinks,
} = catalogLinkFunctions("gssupply");

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
    const auth = await requireCatalogManager(ctx, "gssupply");
    const connection = await getCatalogConnection(ctx, "gssupply", auth.organizationId);
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
    const auth = await requireCatalogManager(ctx, "gssupply");
    if (auth.organizationId !== args.organizationId) {
      throw new ConvexError("Organisationen er ændret. Prøv igen");
    }
    const current = await getCatalogConnection(ctx, "gssupply", auth.organizationId);
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
    await ensureCatalogSupplier(ctx, auth, "gssupply", auth.organizationId);
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
    const auth = await requireCatalogManager(ctx, "gssupply");
    const connection = await getCatalogConnection(ctx, "gssupply", auth.organizationId);
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
    const connection = await getCatalogConnection(ctx, "gssupply", organizationId);
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
  returns: v.array(catalogItemValidator),
  handler: async (ctx): Promise<CatalogItem[]> => {
    const auth = await requireCatalogReader(ctx, "gssupply");
    const catalogUrl: string | null = await ctx.runMutation(
      internal.integrations.gssupply.api.getCatalogUrl,
      { organizationId: auth.organizationId },
    );
    if (!catalogUrl) throw new ConvexError("GS Supply er ikke forbundet");
    return fetchGsSupplyCatalog(parseCatalogUrl(catalogUrl));
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
