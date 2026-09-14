import { applyOnlinePosInstallation } from "./lifecycle";
import { isIntegrationEnabled, requireIntegrationEnabled, writeInstallationState } from "../state";
import {
  getOnlinePosOrganizationSettings,
  getOnlinePosMaster,
  onlinePosCatalogId,
  scopeLegacyOnlinePosCatalog,
  MAX_MASTER_CONNECTIONS,
} from "./lib/connections";
import { ConvexError, v } from "convex/values";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx, MutationCtx } from "../../_generated/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../../_generated/server";
import {
  requireAllLocationAccess,
  requireHumanPrincipal,
  requireIntegrationManager,
  requireLocationAccess,
} from "../../lib/auth";
import {
  requestProducts,
  requestSales,
  type OnlinePosProduct,
} from "./lib/api";
import { getProductCategoryIds } from "../../lib/productCategories";
import { recordAudit } from "../../lib/audit";
import { invalidateSalesStockMappings } from "../../lib/salesStock";

const MAX_LOCATIONS = 200;
const MAX_PRODUCTS = 500;
const MAX_PRODUCT_INGREDIENTS = 200;
const MAX_MENUS = 100;

async function beginLocationSalesReset(
  ctx: MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const [currentReset, status] = await Promise.all([
    ctx.db
      .query("onlinePosSalesResets")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", locationId),
      )
      .unique(),
    ctx.db
      .query("onlinePosSyncStatus")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", locationId),
      )
      .unique(),
  ]);
  if (currentReset) await ctx.db.delete(currentReset._id);
  if (status) await ctx.db.delete(status._id);
  const resetId = await ctx.db.insert("onlinePosSalesResets", {
    organizationId,
    locationId,
  });
  await ctx.scheduler.runAfter(0, internal.onlinePosSync.resetLocationSales, {
    resetId,
  });
}

const privateSettingsValidator = v.union(
  v.object({
    integrationId: v.id("onlinePosIntegrations"),
    token: v.string(),
    companyId: v.number(),
    enabled: v.boolean(),
  }),
  v.null(),
);

const onlinePosProductValidator = v.object({
  id: v.number(),
  name: v.string(),
  groupName: v.string(),
});

const ingredientOnlinePosMappingValidator = v.object({
  ingredientProductId: v.id("products"),
  onlinePosProductId: v.number(),
});

function requireCompanyId(companyId: number) {
  if (!Number.isSafeInteger(companyId) || companyId <= 0) {
    throw new ConvexError("Firma-id skal være et positivt heltal");
  }
}

function requireToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed || trimmed.length > 500) {
    throw new ConvexError("Indtast et gyldigt OnlinePOS-token");
  }
  return trimmed;
}

async function requireConnectedSettings(
  ctx: ActionCtx,
  integrationId?: Id<"onlinePosIntegrations">,
): Promise<{
  organizationId: string;
  settings: {
    integrationId: Id<"onlinePosIntegrations">;
    token: string;
    companyId: number;
    enabled: boolean;
  };
}> {
  const { organizationId } = await requireIntegrationManager(ctx);
  await requireIntegrationEnabled(ctx, organizationId, "onlinepos");
  const settings: {
    integrationId: Id<"onlinePosIntegrations">;
    token: string;
    companyId: number;
    enabled: boolean;
  } | null = await ctx.runQuery(internal.onlinePos.getPrivateSettings, {
    organizationId,
    integrationId,
  });
  if (!settings) {
    throw new ConvexError("OnlinePOS er ikke forbundet");
  }
  return { organizationId, settings };
}

export const getSettings = query({
  args: {},
  returns: v.object({
    masters: v.array(
      v.object({
        id: v.id("onlinePosIntegrations"),
        name: v.string(),
        companyId: v.number(),
        connectedAt: v.number(),
      }),
    ),
    connected: v.boolean(),
    enabled: v.boolean(),
    companyId: v.union(v.number(), v.null()),
    connectedAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx) => {
    const auth = await requireIntegrationManager(ctx);
    await requireIntegrationEnabled(ctx, auth.organizationId, "onlinepos");
    const { organizationId } = auth;
    const settings = await getOnlinePosOrganizationSettings(
      ctx,
      organizationId,
    );
    const masters = await ctx.db
      .query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_MASTER_CONNECTIONS + 1);
    if (masters.length > MAX_MASTER_CONNECTIONS)
      throw new ConvexError("Der er for mange masterforbindelser");
    return {
      masters: masters.map((master) => ({
        id: master._id,
        name: master.name ?? `Firma ${master.companyId}`,
        companyId: master.companyId,
        connectedAt: master.connectedAt,
      })),
      connected: Boolean(settings),
      enabled: settings?.enabled ?? false,
      companyId: settings?.companyId ?? null,
      connectedAt: settings?.connectedAt ?? null,
    };
  },
});

export const renameConnection = mutation({
  args: {
    integrationId: v.id("onlinePosIntegrations"),
    name: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireIntegrationManager(ctx);
    await requireIntegrationEnabled(ctx, auth.organizationId, "onlinepos");
    requireAllLocationAccess(auth);
    requireHumanPrincipal(auth);
    const master = await getOnlinePosMaster(
      ctx,
      auth.organizationId,
      args.integrationId,
    );
    if (!master) throw new ConvexError("Masterforbindelsen blev ikke fundet");
    const name = args.name.trim();
    if (!name) throw new ConvexError("Indtast et navn på masterforbindelsen");
    if (name.length > 100)
      throw new ConvexError("Navnet må højst være 100 tegn");
    await ctx.db.patch(master._id, { name, updatedAt: Date.now() });
    await recordAudit(ctx, auth, {
      action: "integration.renamed",
      entityTable: "onlinePosIntegrations",
      entityId: master._id,
      summary: `OnlinePOS-masterforbindelsen blev omdøbt til ${name}`,
    });
    return null;
  },
});

export const listLocationConnections = query({
  args: {},
  returns: v.object({
    locations: v.array(
      v.object({
        id: v.id("locations"),
        name: v.string(),
        masterIntegrationId: v.union(v.id("onlinePosIntegrations"), v.null()),
        connected: v.boolean(),
        companyId: v.union(v.number(), v.null()),
        connectedAt: v.union(v.number(), v.null()),
      }),
    ),
    limitReached: v.boolean(),
  }),
  handler: async (ctx) => {
    const auth = await requireIntegrationManager(ctx);
    await requireIntegrationEnabled(ctx, auth.organizationId, "onlinepos");
    const { organizationId } = auth;
    const defaultMaster = await getOnlinePosOrganizationSettings(
      ctx,
      organizationId,
    );
    const [locations, connections] = await Promise.all([
      ctx.db
        .query("locations")
        .withIndex("by_organizationId_and_normalizedName", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_LOCATIONS + 1),
      ctx.db
        .query("onlinePosLocationIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_LOCATIONS),
    ]);
    const byLocationId = new Map(
      connections.map((connection) => [connection.locationId, connection]),
    );
    const visibleLocations = locations.filter(
      (location) =>
        auth.locationScope.all || auth.locationScope.ids.has(location._id),
    );

    return {
      locations: visibleLocations.slice(0, MAX_LOCATIONS).map((location) => {
        const connection = byLocationId.get(location._id);
        return {
          id: location._id,
          name: location.name,
          masterIntegrationId: connection
            ? (connection.masterIntegrationId ?? defaultMaster?._id ?? null)
            : null,
          connected: Boolean(connection),
          companyId: connection?.companyId ?? null,
          connectedAt: connection?.connectedAt ?? null,
        };
      }),
      limitReached: visibleLocations.length > MAX_LOCATIONS,
    };
  },
});

export const getPrivateSettings = internalQuery({
  args: {
    organizationId: v.string(),
    integrationId: v.optional(v.id("onlinePosIntegrations")),
  },
  returns: privateSettingsValidator,
  handler: async (ctx, args) => {
    if (!await isIntegrationEnabled(ctx, args.organizationId, "onlinepos")) return null;
    const settings = await getOnlinePosMaster(
      ctx,
      args.organizationId,
      args.integrationId,
    );
    return settings
      ? {
          integrationId: settings._id,
          token: settings.token,
          companyId: settings.companyId,
          enabled: settings.enabled,
        }
      : null;
  },
});

export const getLocationName = internalQuery({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const location = await ctx.db.get("locations", args.locationId);
    return location?.organizationId === args.organizationId
      ? location.name
      : null;
  },
});

export const saveConnection = internalMutation({
  args: {
    organizationId: v.string(),
    integrationId: v.optional(v.id("onlinePosIntegrations")),
    name: v.optional(v.string()),
    token: v.string(),
    companyId: v.number(),
    actorUserId: v.string(),
    actorName: v.string(),
  },
  returns: v.id("onlinePosIntegrations"),
  handler: async (ctx, args) => {
    await requireIntegrationEnabled(ctx, args.organizationId, "onlinepos");
    await scopeLegacyOnlinePosCatalog(ctx, args.organizationId);
    const masters = await ctx.db
      .query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .take(MAX_MASTER_CONNECTIONS + 1);
    const current =
      args.integrationId === undefined
        ? null
        : await getOnlinePosMaster(
            ctx,
            args.organizationId,
            args.integrationId,
          );
    if (current && current.companyId !== args.companyId) {
      throw new ConvexError(
        "Opret en ny masterforbindelse for at bruge et andet firma-id",
      );
    }
    if (!current && masters.length >= MAX_MASTER_CONNECTIONS)
      throw new ConvexError("Der kan højst oprettes 20 masterforbindelser");
    if (
      masters.some(
        (master) =>
          master.companyId === args.companyId && master._id !== current?._id,
      )
    ) {
      throw new ConvexError(
        "Der findes allerede en masterforbindelse med dette firma-id",
      );
    }
    const name =
      args.name?.trim() || current?.name || `Firma ${args.companyId}`;
    if (name.length > 100)
      throw new ConvexError("Navnet må højst være 100 tegn");
    const now = Date.now();
    const integrationId =
      current?._id ??
      (await ctx.db.insert("onlinePosIntegrations", {
        organizationId: args.organizationId,
        name,
        token: args.token,
        companyId: args.companyId,
        enabled: masters[0]?.enabled ?? true,
        catalogScoped: true,
        connectedAt: now,
        updatedAt: now,
      }));
    if (current)
      await ctx.db.patch(current._id, {
        name,
        token: args.token,
        connectedAt: now,
        updatedAt: now,
      });
    await recordAudit(
      ctx,
      {
        organizationId: args.organizationId,
        userId: args.actorUserId,
        userName: args.actorName,
      },
      {
        action: "integration.connected",
        entityTable: "onlinePosIntegrations",
        entityId: integrationId,
        summary: `OnlinePOS-masterforbindelsen ${name} blev gemt`,
      },
    );
    await ctx.scheduler.runAfter(
      0,
      internal.onlinePosSync.enqueueOrganizationSync,
      { organizationId: args.organizationId },
    );
    return integrationId;
  },
});

export const saveLocationConnection = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    masterIntegrationId: v.id("onlinePosIntegrations"),
    token: v.string(),
    companyId: v.number(),
    actorUserId: v.string(),
    actorName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireIntegrationEnabled(ctx, args.organizationId, "onlinepos");
    await scopeLegacyOnlinePosCatalog(ctx, args.organizationId);
    await getOnlinePosMaster(
      ctx,
      args.organizationId,
      args.masterIntegrationId,
    );
    const [location, current, reset] = await Promise.all([
      ctx.db.get("locations", args.locationId),
      ctx.db
        .query("onlinePosLocationIntegrations")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("locationId", args.locationId),
        )
        .unique(),
      ctx.db
        .query("onlinePosSalesResets")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("locationId", args.locationId),
        )
        .unique(),
    ]);
    if (!location || location.organizationId !== args.organizationId) {
      throw new ConvexError("Lokationen blev ikke fundet");
    }
    if (current && current.masterIntegrationId !== args.masterIntegrationId)
      await invalidateSalesStockMappings(ctx, args.organizationId);
    const now = Date.now();
    const connectionId = current
      ? current._id
      : await ctx.db.insert("onlinePosLocationIntegrations", {
          organizationId: args.organizationId,
          locationId: args.locationId,
          masterIntegrationId: args.masterIntegrationId,
          token: args.token,
          companyId: args.companyId,
          connectedAt: now,
          updatedAt: now,
        });
    if (current) {
      await ctx.db.patch(current._id, {
        masterIntegrationId: args.masterIntegrationId,
        token: args.token,
        companyId: args.companyId,
        connectedAt: now,
        updatedAt: now,
      });
    }
    await recordAudit(
      ctx,
      {
        organizationId: args.organizationId,
        userId: args.actorUserId,
        userName: args.actorName,
      },
      {
        action: "integration.locationConnected",
        entityTable: "onlinePosLocationIntegrations",
        entityId: connectionId,
        locationId: args.locationId,
        summary: "OnlinePOS blev forbundet til lokationen",
      },
    );
    if ((current && current.companyId !== args.companyId) || reset) {
      await beginLocationSalesReset(ctx, args.organizationId, args.locationId);
    } else {
      await ctx.scheduler.runAfter(
        0,
        internal.onlinePosSync.enqueueLocationSync,
        {
          organizationId: args.organizationId,
          locationId: args.locationId,
        },
      );
    }
    return null;
  },
});

export const setEnabledInternal = internalMutation({
  args: { organizationId: v.string(), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireIntegrationEnabled(ctx, args.organizationId, "onlinepos");
    const updatedAt = Date.now();
    await writeInstallationState(ctx, args.organizationId, "onlinepos", args.enabled, updatedAt);
    await applyOnlinePosInstallation(ctx, args.organizationId, args.enabled, updatedAt);
    return null;
  },
});

export const connect = action({
  args: {
    token: v.string(),
    companyId: v.number(),
    name: v.optional(v.string()),
    integrationId: v.optional(v.id("onlinePosIntegrations")),
  },
  returns: v.object({
    productCount: v.number(),
    integrationId: v.id("onlinePosIntegrations"),
  }),
  handler: async (ctx, args) => {
    const auth = await requireIntegrationManager(ctx);
    await requireIntegrationEnabled(ctx, auth.organizationId, "onlinepos");
    requireAllLocationAccess(auth);
    const human = requireHumanPrincipal(auth);
    const { organizationId, userName } = auth;
    requireCompanyId(args.companyId);
    const token = requireToken(args.token);
    const products = await requestProducts({
      token,
      companyId: args.companyId,
    });
    const integrationId: Id<"onlinePosIntegrations"> = await ctx.runMutation(
      internal.onlinePos.saveConnection,
      {
        integrationId: args.integrationId,
        name: args.name,
        organizationId,
        token,
        companyId: args.companyId,
        actorUserId: human.userId,
        actorName: userName,
      },
    );
    return { productCount: products.length, integrationId };
  },
});

export const connectLocation = action({
  args: {
    locationId: v.id("locations"),
    masterIntegrationId: v.id("onlinePosIntegrations"),
    token: v.string(),
    companyId: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireIntegrationManager(ctx);
    await requireIntegrationEnabled(ctx, auth.organizationId, "onlinepos");
    const human = requireHumanPrincipal(auth);
    const { organizationId, userName } = auth;
    requireLocationAccess(auth, args.locationId);
    requireCompanyId(args.companyId);
    const token = requireToken(args.token);
    const locationName: string | null = await ctx.runQuery(
      internal.onlinePos.getLocationName,
      { organizationId, locationId: args.locationId },
    );
    if (!locationName) throw new ConvexError("Lokationen blev ikke fundet");

    const now = Date.now();
    await requestSales(
      { token, companyId: args.companyId },
      now - 5 * 60 * 1000,
      now,
    );
    await ctx.runMutation(internal.onlinePos.saveLocationConnection, {
      organizationId,
      locationId: args.locationId,
      masterIntegrationId: args.masterIntegrationId,
      token,
      companyId: args.companyId,
      actorUserId: human.userId,
      actorName: userName,
    });
    return null;
  },
});

export const setEnabled = action({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => ctx.runMutation(api.integrations.setEnabled, { integration: "onlinepos", enabled: args.enabled }),
});

export const disconnect = mutation({
  args: { integrationId: v.id("onlinePosIntegrations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireIntegrationManager(ctx);
    await requireIntegrationEnabled(ctx, auth.organizationId, "onlinepos");
    requireAllLocationAccess(auth);
    const { organizationId } = auth;
    await scopeLegacyOnlinePosCatalog(ctx, organizationId);
    const settings = await getOnlinePosMaster(
      ctx,
      organizationId,
      args.integrationId,
    );
    if (!settings) throw new ConvexError("Masterforbindelsen blev ikke fundet");
    const [mappings, menus, connections, masters] = await Promise.all([
      ctx.db
        .query("onlinePosProductMappings")
        .withIndex("by_organizationId_and_integrationId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("integrationId", settings._id),
        )
        .take(MAX_PRODUCTS + 1),
      ctx.db
        .query("onlinePosMenus")
        .withIndex("by_organizationId_and_integrationId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("integrationId", settings._id),
        )
        .take(MAX_MENUS + 1),
      ctx.db
        .query("onlinePosLocationIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_LOCATIONS + 1),
      ctx.db
        .query("onlinePosIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_MASTER_CONNECTIONS),
    ]);
    if (
      mappings.length > MAX_PRODUCTS ||
      menus.length > MAX_MENUS ||
      connections.length > MAX_LOCATIONS
    )
      throw new ConvexError("Der er for mange OnlinePOS-koblinger");
    if (
      connections.some(
        (connection) => connection.masterIntegrationId === settings._id,
      )
    ) {
      throw new ConvexError(
        "Vælg en anden masterforbindelse for lokationerne, eller fjern deres forbindelse først",
      );
    }
    for (const row of [...mappings, ...menus]) await ctx.db.delete(row._id);
    if (masters[0]?._id === settings._id && masters[1]) {
      await ctx.db.patch(masters[1]._id, {
        stockSyncEnabled: settings.stockSyncEnabled,
        stockRefundsToWaste: settings.stockRefundsToWaste,
        stockSyncStartedAt: settings.stockSyncStartedAt,
        stockSyncHistoryStartAt: settings.stockSyncHistoryStartAt,
        stockSyncSinceLastCount: settings.stockSyncSinceLastCount,
        stockMappingRevision: settings.stockMappingRevision,
      });
    }
    await ctx.db.delete(settings._id);
    await recordAudit(ctx, auth, {
      action: "integration.disconnected",
      entityTable: "onlinePosIntegrations",
      entityId: settings._id,
      summary: `OnlinePOS-masterforbindelsen ${settings.name ?? settings.companyId} blev fjernet`,
    });
    return null;
  },
});

export const listPrivateMasters = internalQuery({
  args: { organizationId: v.string() },
  returns: v.array(v.object({ token: v.string(), companyId: v.number() })),
  handler: async (ctx, args) => {
    const masters = await ctx.db
      .query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .take(MAX_MASTER_CONNECTIONS);
    return masters.map(({ token, companyId }) => ({ token, companyId }));
  },
});

export const setLocationMaster = mutation({
  args: {
    locationId: v.id("locations"),
    integrationId: v.id("onlinePosIntegrations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireIntegrationManager(ctx);
    await requireIntegrationEnabled(ctx, auth.organizationId, "onlinepos");
    requireLocationAccess(auth, args.locationId);
    const location = await ctx.db.get("locations", args.locationId);
    if (!location || location.organizationId !== auth.organizationId)
      throw new ConvexError("Lokationen blev ikke fundet");
    await scopeLegacyOnlinePosCatalog(ctx, auth.organizationId);
    await getOnlinePosMaster(ctx, auth.organizationId, args.integrationId);
    const connection = await ctx.db
      .query("onlinePosLocationIntegrations")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("locationId", args.locationId),
      )
      .unique();
    if (!connection)
      throw new ConvexError("Forbind lokationen til OnlinePOS først");
    if (connection.masterIntegrationId === args.integrationId) return null;
    await ctx.db.patch(connection._id, {
      masterIntegrationId: args.integrationId,
      updatedAt: Date.now(),
    });
    await invalidateSalesStockMappings(ctx, auth.organizationId);
    await recordAudit(ctx, auth, {
      action: "integration.locationConnected",
      entityTable: "onlinePosLocationIntegrations",
      entityId: connection._id,
      locationId: args.locationId,
      summary: "Lokationens OnlinePOS-masterforbindelse blev ændret",
    });
    await ctx.scheduler.runAfter(
      0,
      internal.onlinePosSync.enqueueLocationSync,
      { organizationId: auth.organizationId, locationId: args.locationId },
    );
    return null;
  },
});

export const disconnectLocation = mutation({
  args: { locationId: v.id("locations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireIntegrationManager(ctx);
    await requireIntegrationEnabled(ctx, auth.organizationId, "onlinepos");
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    const [location, connection] = await Promise.all([
      ctx.db.get("locations", args.locationId),
      ctx.db
        .query("onlinePosLocationIntegrations")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("locationId", args.locationId),
        )
        .unique(),
    ]);
    if (!location || location.organizationId !== organizationId) {
      throw new ConvexError("Lokationen blev ikke fundet");
    }
    if (connection) await ctx.db.delete(connection._id);
    await beginLocationSalesReset(ctx, organizationId, args.locationId);
    await recordAudit(ctx, auth, {
      action: "integration.locationDisconnected",
      entityTable: "onlinePosLocationIntegrations",
      entityId: connection?._id ?? args.locationId,
      locationId: args.locationId,
      summary: "OnlinePOS blev afbrudt fra lokationen",
    });
    return null;
  },
});

export const listProducts = action({
  args: { integrationId: v.optional(v.id("onlinePosIntegrations")) },
  returns: v.array(onlinePosProductValidator),
  handler: async (ctx, args): Promise<OnlinePosProduct[]> => {
    const { settings } = await requireConnectedSettings(
      ctx,
      args.integrationId,
    );
    return requestProducts(settings);
  },
});

export const getProductMapping = query({
  args: {
    integrationId: v.optional(v.id("onlinePosIntegrations")),
    productId: v.id("products"),
  },
  returns: v.union(
    v.object({ onlinePosProductId: v.union(v.number(), v.null()) }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const { organizationId } = await requireIntegrationManager(ctx);
  await requireIntegrationEnabled(ctx, organizationId, "onlinepos");
    const settings = await getOnlinePosMaster(
      ctx,
      organizationId,
      args.integrationId,
    );
    const [product, mapping] = await Promise.all([
      ctx.db.get("products", args.productId),
      ctx.db
        .query("onlinePosProductMappings")
        .withIndex("by_organizationId_and_integrationId_and_productId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("integrationId", onlinePosCatalogId(settings))
            .eq("productId", args.productId),
        )
        .unique(),
    ]);
    if (!product || product.organizationId !== organizationId) {
      throw new ConvexError("Produktet blev ikke fundet");
    }
    if (!settings) return null;
    return { onlinePosProductId: mapping?.onlinePosProductId ?? null };
  },
});

export const getIngredientRemovalSettings = query({
  args: {
    integrationId: v.optional(v.id("onlinePosIntegrations")),
    productId: v.optional(v.id("products")),
  },
  returns: v.object({
    connected: v.boolean(),
    enabled: v.boolean(),
    integrationId: v.union(v.id("onlinePosIntegrations"), v.null()),
    mappings: v.array(ingredientOnlinePosMappingValidator),
  }),
  handler: async (ctx, args) => {
    const { organizationId } = await requireIntegrationManager(ctx);
  await requireIntegrationEnabled(ctx, organizationId, "onlinepos");
    const productId = args.productId;
    const [settings, product, ingredients] = await Promise.all([
      getOnlinePosMaster(ctx, organizationId, args.integrationId),
      productId === undefined
        ? Promise.resolve(null)
        : ctx.db.get("products", productId),
      productId === undefined
        ? Promise.resolve([])
        : ctx.db
            .query("productIngredients")
            .withIndex("by_organizationId_and_productId", (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("productId", productId),
            )
            .take(MAX_PRODUCT_INGREDIENTS + 1),
    ]);
    if (
      productId !== undefined &&
      (!product || product.organizationId !== organizationId)
    ) {
      throw new ConvexError("Produktet blev ikke fundet");
    }
    if (ingredients.length > MAX_PRODUCT_INGREDIENTS) {
      throw new ConvexError("Produktet har for mange ingredienser");
    }

    return {
      connected: settings !== null,
      enabled: settings?.enabled === true,
      integrationId: settings?._id ?? null,
      mappings:
        settings === null
          ? []
          : ingredients.flatMap((ingredient) => {
              const id =
                ingredient.onlinePosRemovalMappings?.find(
                  (mapping) => mapping.integrationId === settings._id,
                )?.onlinePosProductId ??
                (ingredient.onlinePosRemovalIntegrationId === settings._id &&
                ingredient.onlinePosRemovalCompanyId === settings.companyId
                  ? ingredient.onlinePosRemovalProductId
                  : undefined);
              return ingredient.removable === true && id !== undefined
                ? [
                    {
                      ingredientProductId: ingredient.ingredientProductId,
                      onlinePosProductId: id,
                    },
                  ]
                : [];
            }),
    };
  },
});

export const getIngredientAdditionSettings = query({
  args: {
    integrationId: v.optional(v.id("onlinePosIntegrations")),
    productId: v.optional(v.id("products")),
  },
  returns: v.object({
    connected: v.boolean(),
    enabled: v.boolean(),
    integrationId: v.union(v.id("onlinePosIntegrations"), v.null()),
    mappings: v.array(ingredientOnlinePosMappingValidator),
  }),
  handler: async (ctx, args) => {
    const { organizationId } = await requireIntegrationManager(ctx);
  await requireIntegrationEnabled(ctx, organizationId, "onlinepos");
    const productId = args.productId;
    const [settings, product, additions] = await Promise.all([
      getOnlinePosMaster(ctx, organizationId, args.integrationId),
      productId === undefined
        ? Promise.resolve(null)
        : ctx.db.get("products", productId),
      productId === undefined
        ? Promise.resolve([])
        : ctx.db
            .query("productIngredientAdditions")
            .withIndex("by_organizationId_and_productId", (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("productId", productId),
            )
            .take(MAX_PRODUCT_INGREDIENTS + 1),
    ]);
    if (
      productId !== undefined &&
      (!product || product.organizationId !== organizationId)
    ) {
      throw new ConvexError("Produktet blev ikke fundet");
    }
    if (additions.length > MAX_PRODUCT_INGREDIENTS) {
      throw new ConvexError(
        "Produktet har for mange ingredienser, der kan tilføjes",
      );
    }

    return {
      connected: settings !== null,
      enabled: settings?.enabled === true,
      integrationId: settings?._id ?? null,
      mappings:
        settings === null
          ? []
          : additions.flatMap((addition) => {
              const id =
                addition.onlinePosAdditionMappings?.find(
                  (mapping) => mapping.integrationId === settings._id,
                )?.onlinePosProductId ??
                (addition.onlinePosAdditionIntegrationId === settings._id &&
                addition.onlinePosAdditionCompanyId === settings.companyId
                  ? addition.onlinePosAdditionProductId
                  : undefined);
              return id !== undefined
                ? [
                    {
                      ingredientProductId: addition.ingredientProductId,
                      onlinePosProductId: id,
                    },
                  ]
                : [];
            }),
    };
  },
});

export const listMappingOptions = query({
  args: { integrationId: v.optional(v.id("onlinePosIntegrations")) },
  returns: v.union(
    v.object({
      products: v.array(
        v.object({
          id: v.id("products"),
          name: v.string(),
          categoryIds: v.array(v.id("categories")),
          onlinePosProductId: v.union(v.number(), v.null()),
        }),
      ),
      limitReached: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const { organizationId } = await requireIntegrationManager(ctx);
  await requireIntegrationEnabled(ctx, organizationId, "onlinepos");
    const settings = await getOnlinePosMaster(
      ctx,
      organizationId,
      args.integrationId,
    );
    if (!settings) return null;

    const [products, mappings] = await Promise.all([
      ctx.db
        .query("products")
        .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
          q.eq("organizationId", organizationId).eq("status", "active"),
        )
        .take(MAX_PRODUCTS + 1),
      ctx.db
        .query("onlinePosProductMappings")
        .withIndex("by_organizationId_and_integrationId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("integrationId", onlinePosCatalogId(settings)),
        )
        .take(MAX_PRODUCTS),
    ]);
    const byProductId = new Map(
      mappings.map((mapping) => [
        mapping.productId,
        mapping.onlinePosProductId,
      ]),
    );

    return {
      products: await Promise.all(
        products.slice(0, MAX_PRODUCTS).map(async (product) => ({
          id: product._id,
          name: product.name,
          categoryIds: await getProductCategoryIds(ctx, product),
          onlinePosProductId: byProductId.get(product._id) ?? null,
        })),
      ),
      limitReached: products.length > MAX_PRODUCTS,
    };
  },
});

export const saveProductMapping = internalMutation({
  args: {
    integrationId: v.optional(v.id("onlinePosIntegrations")),
    organizationId: v.string(),
    productId: v.id("products"),
    onlinePosProductId: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireIntegrationEnabled(ctx, args.organizationId, "onlinepos");
    const settings = await getOnlinePosMaster(
      ctx,
      args.organizationId,
      args.integrationId,
    );
    const [product, current, mappings] = await Promise.all([
      ctx.db.get("products", args.productId),
      ctx.db
        .query("onlinePosProductMappings")
        .withIndex("by_organizationId_and_integrationId_and_productId", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("integrationId", onlinePosCatalogId(settings))
            .eq("productId", args.productId),
        )
        .unique(),
      ctx.db
        .query("onlinePosProductMappings")
        .withIndex("by_organizationId_and_integrationId", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("integrationId", onlinePosCatalogId(settings)),
        )
        .take(MAX_PRODUCTS + 1),
    ]);
    if (!settings) {
      throw new ConvexError("OnlinePOS er ikke forbundet");
    }
    if (!product || product.organizationId !== args.organizationId) {
      throw new ConvexError("Produktet blev ikke fundet");
    }
    if (
      args.onlinePosProductId !== null &&
      (!Number.isSafeInteger(args.onlinePosProductId) ||
        args.onlinePosProductId <= 0)
    ) {
      throw new ConvexError("OnlinePOS-produktet er ugyldigt");
    }
    if (
      mappings.length > MAX_PRODUCTS ||
      (!current &&
        args.onlinePosProductId !== null &&
        mappings.length === MAX_PRODUCTS)
    ) {
      throw new ConvexError("Der er for mange produktkoblinger");
    }
    const onlinePosProductId = args.onlinePosProductId;
    const existingOwners =
      onlinePosProductId === null
        ? []
        : await ctx.db
            .query("onlinePosProductMappings")
            .withIndex(
              "by_organizationId_and_integrationId_and_onlinePosProductId",
              (q) =>
                q
                  .eq("organizationId", args.organizationId)
                  .eq("integrationId", onlinePosCatalogId(settings))
                  .eq("onlinePosProductId", onlinePosProductId),
            )
            .take(MAX_PRODUCTS + 1);
    const existingOwner = existingOwners.find(
      (mapping) => mapping.productId !== args.productId,
    );
    if (existingOwner) {
      const existingProduct = await ctx.db.get(
        "products",
        existingOwner.productId,
      );
      throw new ConvexError(
        existingProduct?.organizationId === args.organizationId
          ? `OnlinePOS-produktet er allerede knyttet til produktet "${existingProduct.name}"`
          : "OnlinePOS-produktet er allerede knyttet til et andet produkt",
      );
    }

    if (args.onlinePosProductId === null) {
      if (current) await ctx.db.delete(current._id);
    } else if (current) {
      if (current.onlinePosProductId !== args.onlinePosProductId) {
        await ctx.db.patch(current._id, {
          onlinePosProductId: args.onlinePosProductId,
        });
      }
    } else {
      await ctx.db.insert("onlinePosProductMappings", {
        organizationId: args.organizationId,
        integrationId: onlinePosCatalogId(settings),
        productId: args.productId,
        onlinePosProductId: args.onlinePosProductId,
      });
    }
    if ((current?.onlinePosProductId ?? null) !== args.onlinePosProductId) {
      await invalidateSalesStockMappings(ctx, args.organizationId);
    }
    return null;
  },
});

export const saveIngredientRemovalMappings = internalMutation({
  args: {
    organizationId: v.string(),
    integrationId: v.id("onlinePosIntegrations"),
    companyId: v.number(),
    productId: v.id("products"),
    mappings: v.array(ingredientOnlinePosMappingValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireIntegrationEnabled(ctx, args.organizationId, "onlinepos");
    if (args.mappings.length > MAX_PRODUCT_INGREDIENTS) {
      throw new ConvexError("Produktet har for mange ingredienser");
    }
    if (
      new Set(args.mappings.map((mapping) => mapping.ingredientProductId))
        .size !== args.mappings.length
    ) {
      throw new ConvexError("Hver ingrediens kan kun kobles én gang");
    }
    const [settings, product, ingredients] = await Promise.all([
      getOnlinePosMaster(ctx, args.organizationId, args.integrationId),
      ctx.db.get("products", args.productId),
      ctx.db
        .query("productIngredients")
        .withIndex("by_organizationId_and_productId", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("productId", args.productId),
        )
        .take(MAX_PRODUCT_INGREDIENTS + 1),
    ]);
    if (
      !settings ||
      !settings.enabled ||
      settings._id !== args.integrationId ||
      settings.companyId !== args.companyId
    ) {
      throw new ConvexError(
        "OnlinePOS-forbindelsen blev ændret. Opdatér produktlisten og prøv igen.",
      );
    }
    if (!product || product.organizationId !== args.organizationId) {
      throw new ConvexError("Produktet blev ikke fundet");
    }
    if (ingredients.length > MAX_PRODUCT_INGREDIENTS) {
      throw new ConvexError("Produktet har for mange ingredienser");
    }

    const ingredientsByProductId = new Map(
      ingredients.map((ingredient) => [
        ingredient.ingredientProductId,
        ingredient,
      ]),
    );
    for (const mapping of args.mappings) {
      const ingredient = ingredientsByProductId.get(
        mapping.ingredientProductId,
      );
      if (!ingredient || ingredient.removable !== true) {
        throw new ConvexError(
          "OnlinePOS kan kun kobles til en ingrediens, der kan fjernes",
        );
      }
    }

    const mappingsByIngredientProductId = new Map(
      args.mappings.map((mapping) => [
        mapping.ingredientProductId,
        mapping.onlinePosProductId,
      ]),
    );
    const activeMasters = await ctx.db.query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .take(MAX_MASTER_CONNECTIONS);
    const activeMasterIds = new Set(activeMasters.map((master) => master._id));
    let changed = false;
    for (const ingredient of ingredients) {
      const onlinePosProductId = mappingsByIngredientProductId.get(
        ingredient.ingredientProductId,
      );
      const existing =
        ingredient.onlinePosRemovalMappings ??
        (ingredient.onlinePosRemovalIntegrationId !== undefined &&
        ingredient.onlinePosRemovalProductId !== undefined
          ? [
              {
                integrationId: ingredient.onlinePosRemovalIntegrationId,
                onlinePosProductId: ingredient.onlinePosRemovalProductId,
              },
            ]
          : []);
      const previous = existing.find(
        (mapping) => mapping.integrationId === args.integrationId,
      )?.onlinePosProductId;
      if (previous === onlinePosProductId) continue;
      const next = existing.filter(
        (mapping) => mapping.integrationId !== args.integrationId && activeMasterIds.has(mapping.integrationId),
      );
      if (onlinePosProductId !== undefined)
        next.push({ integrationId: args.integrationId, onlinePosProductId });
      if (next.length > MAX_MASTER_CONNECTIONS)
        throw new ConvexError(
          "Der er for mange masterforbindelser til ingrediensen",
        );
      await ctx.db.patch(ingredient._id, {
        onlinePosRemovalMappings: next,
        onlinePosRemovalProductId: undefined,
        onlinePosRemovalIntegrationId: undefined,
        onlinePosRemovalCompanyId: undefined,
      });
      changed = true;
    }
    if (changed) await invalidateSalesStockMappings(ctx, args.organizationId);
    return null;
  },
});

export const setIngredientRemovalMappings = action({
  args: {
    productId: v.id("products"),
    expectedIntegrationId: v.optional(v.id("onlinePosIntegrations")),
    mappings: v.array(ingredientOnlinePosMappingValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.mappings.length > MAX_PRODUCT_INGREDIENTS) {
      throw new ConvexError("Produktet har for mange ingredienser");
    }
    if (
      new Set(args.mappings.map((mapping) => mapping.ingredientProductId))
        .size !== args.mappings.length
    ) {
      throw new ConvexError("Hver ingrediens kan kun kobles én gang");
    }
    for (const mapping of args.mappings) {
      if (
        !Number.isSafeInteger(mapping.onlinePosProductId) ||
        mapping.onlinePosProductId <= 0
      ) {
        throw new ConvexError("OnlinePOS-produktet er ugyldigt");
      }
    }

    const { organizationId, settings } = await requireConnectedSettings(
      ctx,
      args.expectedIntegrationId,
    );
    if (
      args.expectedIntegrationId !== undefined &&
      settings.integrationId !== args.expectedIntegrationId
    ) {
      throw new ConvexError(
        "OnlinePOS-forbindelsen blev ændret. Opdatér produktlisten og prøv igen.",
      );
    }
    if (!settings.enabled) {
      throw new ConvexError("OnlinePOS-integrationen er ikke aktiveret");
    }
    if (args.mappings.length > 0) {
      const onlinePosProducts = await requestProducts(settings);
      const onlinePosProductIds = new Set(
        onlinePosProducts.map((product) => product.id),
      );
      if (
        args.mappings.some(
          (mapping) => !onlinePosProductIds.has(mapping.onlinePosProductId),
        )
      ) {
        throw new ConvexError(
          "Et valgt produkt findes ikke længere i OnlinePOS. Opdatér produktlisten og prøv igen.",
        );
      }
    }

    await ctx.runMutation(internal.onlinePos.saveIngredientRemovalMappings, {
      organizationId,
      integrationId: settings.integrationId,
      companyId: settings.companyId,
      productId: args.productId,
      mappings: args.mappings,
    });
    return null;
  },
});

export const saveIngredientAdditionMappings = internalMutation({
  args: {
    organizationId: v.string(),
    integrationId: v.id("onlinePosIntegrations"),
    companyId: v.number(),
    productId: v.id("products"),
    mappings: v.array(ingredientOnlinePosMappingValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireIntegrationEnabled(ctx, args.organizationId, "onlinepos");
    if (args.mappings.length > MAX_PRODUCT_INGREDIENTS) {
      throw new ConvexError(
        "Produktet har for mange ingredienser, der kan tilføjes",
      );
    }
    if (
      new Set(args.mappings.map((mapping) => mapping.ingredientProductId))
        .size !== args.mappings.length
    ) {
      throw new ConvexError("Hver ingrediens kan kun kobles én gang");
    }
    const [settings, product, additions] = await Promise.all([
      getOnlinePosMaster(ctx, args.organizationId, args.integrationId),
      ctx.db.get("products", args.productId),
      ctx.db
        .query("productIngredientAdditions")
        .withIndex("by_organizationId_and_productId", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("productId", args.productId),
        )
        .take(MAX_PRODUCT_INGREDIENTS + 1),
    ]);
    if (
      !settings ||
      !settings.enabled ||
      settings._id !== args.integrationId ||
      settings.companyId !== args.companyId
    ) {
      throw new ConvexError(
        "OnlinePOS-forbindelsen blev ændret. Opdatér produktlisten og prøv igen.",
      );
    }
    if (!product || product.organizationId !== args.organizationId) {
      throw new ConvexError("Produktet blev ikke fundet");
    }
    if (additions.length > MAX_PRODUCT_INGREDIENTS) {
      throw new ConvexError(
        "Produktet har for mange ingredienser, der kan tilføjes",
      );
    }

    const additionsByProductId = new Map(
      additions.map((addition) => [
        addition.ingredientProductId,
        addition,
      ]),
    );
    for (const mapping of args.mappings) {
      if (!additionsByProductId.has(mapping.ingredientProductId)) {
        throw new ConvexError(
          "OnlinePOS kan kun kobles til en ingrediens, der kan tilføjes",
        );
      }
    }

    const mappingsByIngredientProductId = new Map(
      args.mappings.map((mapping) => [
        mapping.ingredientProductId,
        mapping.onlinePosProductId,
      ]),
    );
    const activeMasters = await ctx.db.query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .take(MAX_MASTER_CONNECTIONS);
    const activeMasterIds = new Set(activeMasters.map((master) => master._id));
    let changed = false;
    for (const addition of additions) {
      const onlinePosProductId = mappingsByIngredientProductId.get(
        addition.ingredientProductId,
      );
      const existing =
        addition.onlinePosAdditionMappings ??
        (addition.onlinePosAdditionIntegrationId !== undefined &&
        addition.onlinePosAdditionProductId !== undefined
          ? [
              {
                integrationId: addition.onlinePosAdditionIntegrationId,
                onlinePosProductId: addition.onlinePosAdditionProductId,
              },
            ]
          : []);
      const previous = existing.find(
        (mapping) => mapping.integrationId === args.integrationId,
      )?.onlinePosProductId;
      if (previous === onlinePosProductId) continue;
      const next = existing.filter(
        (mapping) => mapping.integrationId !== args.integrationId && activeMasterIds.has(mapping.integrationId),
      );
      if (onlinePosProductId !== undefined)
        next.push({ integrationId: args.integrationId, onlinePosProductId });
      if (next.length > MAX_MASTER_CONNECTIONS)
        throw new ConvexError(
          "Der er for mange masterforbindelser til ingrediensen",
        );
      await ctx.db.patch(addition._id, {
        onlinePosAdditionMappings: next,
        onlinePosAdditionProductId: undefined,
        onlinePosAdditionIntegrationId: undefined,
        onlinePosAdditionCompanyId: undefined,
      });
      changed = true;
    }
    if (changed) await invalidateSalesStockMappings(ctx, args.organizationId);
    return null;
  },
});

export const setIngredientAdditionMappings = action({
  args: {
    productId: v.id("products"),
    expectedIntegrationId: v.id("onlinePosIntegrations"),
    mappings: v.array(ingredientOnlinePosMappingValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.mappings.length > MAX_PRODUCT_INGREDIENTS) {
      throw new ConvexError(
        "Produktet har for mange ingredienser, der kan tilføjes",
      );
    }
    if (
      new Set(args.mappings.map((mapping) => mapping.ingredientProductId))
        .size !== args.mappings.length
    ) {
      throw new ConvexError("Hver ingrediens kan kun kobles én gang");
    }
    for (const mapping of args.mappings) {
      if (
        !Number.isSafeInteger(mapping.onlinePosProductId) ||
        mapping.onlinePosProductId <= 0
      ) {
        throw new ConvexError("OnlinePOS-produktet er ugyldigt");
      }
    }

    const { organizationId, settings } = await requireConnectedSettings(
      ctx,
      args.expectedIntegrationId,
    );
    if (settings.integrationId !== args.expectedIntegrationId) {
      throw new ConvexError(
        "OnlinePOS-forbindelsen blev ændret. Opdatér produktlisten og prøv igen.",
      );
    }
    if (!settings.enabled) {
      throw new ConvexError("OnlinePOS-integrationen er ikke aktiveret");
    }
    if (args.mappings.length > 0) {
      const onlinePosProducts = await requestProducts(settings);
      const onlinePosProductIds = new Set(
        onlinePosProducts.map((product) => product.id),
      );
      if (
        args.mappings.some(
          (mapping) => !onlinePosProductIds.has(mapping.onlinePosProductId),
        )
      ) {
        throw new ConvexError(
          "Et valgt produkt findes ikke længere i OnlinePOS. Opdatér produktlisten og prøv igen.",
        );
      }
    }

    await ctx.runMutation(internal.onlinePos.saveIngredientAdditionMappings, {
      organizationId,
      integrationId: settings.integrationId,
      companyId: settings.companyId,
      productId: args.productId,
      mappings: args.mappings,
    });
    return null;
  },
});

export const setProductMapping = action({
  args: {
    integrationId: v.optional(v.id("onlinePosIntegrations")),
    productId: v.id("products"),
    onlinePosProductId: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId, settings } = await requireConnectedSettings(
      ctx,
      args.integrationId,
    );

    if (args.onlinePosProductId !== null) {
      const products = await requestProducts(settings);
      if (!products.some((product) => product.id === args.onlinePosProductId)) {
        throw new ConvexError(
          "Produktet findes ikke længere i OnlinePOS. Opdatér produktlisten og prøv igen.",
        );
      }
    }

    await ctx.runMutation(internal.onlinePos.saveProductMapping, {
      organizationId,
      integrationId: settings.integrationId,
      productId: args.productId,
      onlinePosProductId: args.onlinePosProductId,
    });
    return null;
  },
});
