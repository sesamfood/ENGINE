import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  requireAllLocationAccess,
  requireHumanPrincipal,
  requireIntegrationManager,
  requireLocationAccess,
} from "./lib/auth";
import {
  requestProducts,
  requestRawSalesV20,
  requestSales,
  type JsonValue,
  type OnlinePosProduct,
} from "./lib/onlinePosApi";
import { normalizeStock } from "./lib/stock";
import { recordAudit } from "./lib/audit";

const MAX_LOCATIONS = 200;
const MAX_PRODUCTS = 500;
// ponytail: waste-report salesLines capped at 5k; upgrade: paginated sum batches.
const MAX_WASTE_SALES_LINES = 5_000;

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

const wasteReportRowValidator = v.object({
  productName: v.string(),
  defaultUnitName: v.string(),
  expectedQuantity: v.number(),
  salesQuantity: v.number(),
  countedQuantity: v.number(),
  wasteQuantity: v.number(),
});

const wasteReportResultValidator = v.object({
  locationName: v.string(),
  submittedAt: v.number(),
  hasBaseline: v.boolean(),
  salesIncluded: v.boolean(),
  salesOmittedReason: v.union(v.string(), v.null()),
  rows: v.array(wasteReportRowValidator),
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

function rawSalesDayBounds(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new ConvexError("Vælg en gyldig dato");
  const normalized = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  )
    .toISOString()
    .slice(0, 10);
  if (normalized !== value) throw new ConvexError("Vælg en gyldig dato");

  const zonedStart = (dateValue: string) => {
    const [year, month, day] = dateValue.split("-").map(Number);
    const target = Date.UTC(year, month - 1, day);
    let guess = target;
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Copenhagen",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const parts = Object.fromEntries(
        formatter
          .formatToParts(guess)
          .map((part) => [part.type, part.value]),
      );
      const represented = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second),
      );
      guess += target - represented;
    }
    return guess;
  };
  const start = zonedStart(value);
  const nextDate = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1),
  )
    .toISOString()
    .slice(0, 10);
  return { start, end: zonedStart(nextDate) };
}

async function requireConnectedSettings(ctx: ActionCtx): Promise<{
  organizationId: string;
  settings: { token: string; companyId: number; enabled: boolean };
}> {
  const { organizationId } = await requireIntegrationManager(ctx);
  const settings: {
    token: string;
    companyId: number;
    enabled: boolean;
  } | null = await ctx.runQuery(internal.onlinePos.getPrivateSettings, {
    organizationId,
  });
  if (!settings) {
    throw new ConvexError("OnlinePOS er ikke forbundet");
  }
  return { organizationId, settings };
}

export const getSettings = query({
  args: {},
  returns: v.object({
    connected: v.boolean(),
    enabled: v.boolean(),
    companyId: v.union(v.number(), v.null()),
    connectedAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx) => {
    const auth = await requireIntegrationManager(ctx);
    const { organizationId } = auth;
    const settings = await ctx.db
      .query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();
    return {
      connected: Boolean(settings),
      enabled: settings?.enabled ?? false,
      companyId: settings?.companyId ?? null,
      connectedAt: settings?.connectedAt ?? null,
    };
  },
});

export const listLocationConnections = query({
  args: {},
  returns: v.object({
    locations: v.array(
      v.object({
        id: v.id("locations"),
        name: v.string(),
        connected: v.boolean(),
        companyId: v.union(v.number(), v.null()),
        connectedAt: v.union(v.number(), v.null()),
      }),
    ),
    limitReached: v.boolean(),
  }),
  handler: async (ctx) => {
    const auth = await requireIntegrationManager(ctx);
    const { organizationId } = auth;
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
  args: { organizationId: v.string() },
  returns: privateSettingsValidator,
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    return settings
      ? {
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
    token: v.string(),
    companyId: v.number(),
    actorUserId: v.string(),
    actorName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await ctx.db
      .query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    const now = Date.now();

    if (current && current.companyId !== args.companyId) {
      const mappings = await ctx.db
        .query("onlinePosProductMappings")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .take(MAX_PRODUCTS + 1);
      if (mappings.length > MAX_PRODUCTS) {
        throw new ConvexError("Der er for mange produktkoblinger");
      }
      for (const mapping of mappings) await ctx.db.delete(mapping._id);
    }

    const integrationId = current
      ? current._id
      : await ctx.db.insert("onlinePosIntegrations", {
          organizationId: args.organizationId,
          token: args.token,
          companyId: args.companyId,
          enabled: true,
          connectedAt: now,
          updatedAt: now,
        });
    if (current) {
      await ctx.db.patch(current._id, {
        token: args.token,
        companyId: args.companyId,
        enabled: true,
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
        action: "integration.connected",
        entityTable: "onlinePosIntegrations",
        entityId: integrationId,
        summary: "OnlinePOS-integrationen blev forbundet",
      },
    );
    await ctx.scheduler.runAfter(
      0,
      internal.onlinePosSync.enqueueOrganizationSync,
      { organizationId: args.organizationId },
    );
    return null;
  },
});

export const saveLocationConnection = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    token: v.string(),
    companyId: v.number(),
    actorUserId: v.string(),
    actorName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
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
    const now = Date.now();
    const connectionId = current
      ? current._id
      : await ctx.db.insert("onlinePosLocationIntegrations", {
          organizationId: args.organizationId,
          locationId: args.locationId,
          token: args.token,
          companyId: args.companyId,
          connectedAt: now,
          updatedAt: now,
        });
    if (current) {
      await ctx.db.patch(current._id, {
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
    const settings = await ctx.db
      .query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    if (!settings) throw new ConvexError("OnlinePOS er ikke forbundet");
    await ctx.db.patch(settings._id, {
      enabled: args.enabled,
      updatedAt: Date.now(),
    });
    if (args.enabled) {
      await ctx.scheduler.runAfter(
        0,
        internal.onlinePosSync.enqueueOrganizationSync,
        { organizationId: args.organizationId },
      );
    }
    return null;
  },
});

export const connect = action({
  args: { token: v.string(), companyId: v.number() },
  returns: v.object({ productCount: v.number() }),
  handler: async (ctx, args) => {
    const auth = await requireIntegrationManager(ctx);
    requireAllLocationAccess(auth);
    const human = requireHumanPrincipal(auth);
    const { organizationId, userName } = auth;
    requireCompanyId(args.companyId);
    const token = requireToken(args.token);
    const products = await requestProducts({
      token,
      companyId: args.companyId,
    });
    await ctx.runMutation(internal.onlinePos.saveConnection, {
      organizationId,
      token,
      companyId: args.companyId,
      actorUserId: human.userId,
      actorName: userName,
    });
    return { productCount: products.length };
  },
});

export const connectLocation = action({
  args: {
    locationId: v.id("locations"),
    token: v.string(),
    companyId: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireIntegrationManager(ctx);
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
  handler: async (ctx, args) => {
    const auth = await requireIntegrationManager(ctx);
    requireAllLocationAccess(auth);
    const { organizationId } = auth;
    const settings: {
      token: string;
      companyId: number;
      enabled: boolean;
    } | null = await ctx.runQuery(internal.onlinePos.getPrivateSettings, {
      organizationId,
    });
    if (!settings) throw new ConvexError("OnlinePOS er ikke forbundet");
    if (args.enabled) {
      await requestProducts(settings);
    }
    await ctx.runMutation(internal.onlinePos.setEnabledInternal, {
      organizationId,
      enabled: args.enabled,
    });
    return null;
  },
});

export const disconnect = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const auth = await requireIntegrationManager(ctx);
    requireAllLocationAccess(auth);
    const { organizationId } = auth;
    const [settings, mappings, locationConnections] = await Promise.all([
      ctx.db
        .query("onlinePosIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .unique(),
      ctx.db
        .query("onlinePosProductMappings")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_PRODUCTS + 1),
      ctx.db
        .query("onlinePosLocationIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_LOCATIONS + 1),
    ]);
    if (mappings.length > MAX_PRODUCTS) {
      throw new ConvexError("Der er for mange produktkoblinger");
    }
    if (locationConnections.length > MAX_LOCATIONS) {
      throw new ConvexError("Der er for mange OnlinePOS-lokationer");
    }
    for (const mapping of mappings) await ctx.db.delete(mapping._id);
    for (const connection of locationConnections) {
      await ctx.db.delete(connection._id);
      await beginLocationSalesReset(ctx, organizationId, connection.locationId);
    }
    if (settings) await ctx.db.delete(settings._id);
    if (settings || locationConnections.length > 0) {
      await recordAudit(ctx, auth, {
        action: "integration.disconnected",
        entityTable: "onlinePosIntegrations",
        entityId: organizationId,
        summary: "OnlinePOS-integrationen blev afbrudt",
      });
    }
    return null;
  },
});

export const disconnectLocation = mutation({
  args: { locationId: v.id("locations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireIntegrationManager(ctx);
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
  args: {},
  returns: v.array(onlinePosProductValidator),
  handler: async (ctx): Promise<OnlinePosProduct[]> => {
    const { settings } = await requireConnectedSettings(ctx);
    return requestProducts(settings);
  },
});

export const inspectRawSales = action({
  args: { date: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<JsonValue[]> => {
    const { settings } = await requireConnectedSettings(ctx);
    const { start, end } = rawSalesDayBounds(args.date);
    return requestRawSalesV20(settings, start, end);
  },
});

export const getProductMapping = query({
  args: { productId: v.id("products") },
  returns: v.union(
    v.object({ onlinePosProductId: v.union(v.number(), v.null()) }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const { organizationId } = await requireIntegrationManager(ctx);
    const [settings, product, mapping] = await Promise.all([
      ctx.db
        .query("onlinePosIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .unique(),
      ctx.db.get("products", args.productId),
      ctx.db
        .query("onlinePosProductMappings")
        .withIndex("by_organizationId_and_productId", (q) =>
          q.eq("organizationId", organizationId).eq("productId", args.productId),
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

export const listMappingOptions = query({
  args: {},
  returns: v.union(
    v.object({
      products: v.array(
        v.object({
          id: v.id("products"),
          name: v.string(),
          onlinePosProductId: v.union(v.number(), v.null()),
        }),
      ),
      limitReached: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const { organizationId } = await requireIntegrationManager(ctx);
    const settings = await ctx.db
      .query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();
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
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
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
      products: products.slice(0, MAX_PRODUCTS).map((product) => ({
        id: product._id,
        name: product.name,
        onlinePosProductId: byProductId.get(product._id) ?? null,
      })),
      limitReached: products.length > MAX_PRODUCTS,
    };
  },
});

export const saveProductMapping = internalMutation({
  args: {
    organizationId: v.string(),
    productId: v.id("products"),
    onlinePosProductId: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [settings, product, current, mappings] = await Promise.all([
      ctx.db
        .query("onlinePosIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .unique(),
      ctx.db.get("products", args.productId),
      ctx.db
        .query("onlinePosProductMappings")
        .withIndex("by_organizationId_and_productId", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("productId", args.productId),
        )
        .unique(),
      ctx.db
        .query("onlinePosProductMappings")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", args.organizationId),
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
    if (mappings.length > MAX_PRODUCTS) {
      throw new ConvexError("Der er for mange produktkoblinger");
    }
    const onlinePosProductId = args.onlinePosProductId;
    const existingOwners =
      onlinePosProductId === null
        ? []
        : await ctx.db
            .query("onlinePosProductMappings")
            .withIndex(
              "by_organizationId_and_onlinePosProductId",
              (q) =>
                q
                  .eq("organizationId", args.organizationId)
                  .eq("onlinePosProductId", onlinePosProductId),
            )
            .take(MAX_PRODUCTS + 1);
    if (
      existingOwners.some((mapping) => mapping.productId !== args.productId)
    ) {
      throw new ConvexError(
        "OnlinePOS-produktet er allerede knyttet til et andet produkt",
      );
    }

    if (args.onlinePosProductId === null) {
      if (current) await ctx.db.delete(current._id);
    } else if (current) {
      await ctx.db.patch(current._id, {
        onlinePosProductId: args.onlinePosProductId,
      });
    } else {
      await ctx.db.insert("onlinePosProductMappings", {
        organizationId: args.organizationId,
        productId: args.productId,
        onlinePosProductId: args.onlinePosProductId,
      });
    }
    return null;
  },
});

export const setProductMapping = action({
  args: {
    productId: v.id("products"),
    onlinePosProductId: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId, settings } = await requireConnectedSettings(ctx);

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
      productId: args.productId,
      onlinePosProductId: args.onlinePosProductId,
    });
    return null;
  },
});

export const buildCountWasteReport = query({
  args: { countId: v.id("counts") },
  returns: wasteReportResultValidator,
  handler: async (
    ctx,
    args,
  ): Promise<{
    locationName: string;
    submittedAt: number;
    hasBaseline: boolean;
    salesIncluded: boolean;
    salesOmittedReason: string | null;
    rows: Array<{
      productName: string;
      defaultUnitName: string;
      expectedQuantity: number;
      salesQuantity: number;
      countedQuantity: number;
      wasteQuantity: number;
    }>;
  }> => {
    const report: {
      organizationId: string;
      locationId: Id<"locations">;
      locationName: string;
      submittedAt: number;
      rows: Array<{
        productId: Id<"products">;
        productName: string;
        defaultUnitName: string;
        expectedQuantity: number;
        countedQuantity: number;
        expectedSinceAt: number;
      }>;
    } = await ctx.runQuery(internal.count.getWasteReportContext, {
      countId: args.countId,
    });
    if (report.rows.length === 0) {
      return {
        locationName: report.locationName,
        submittedAt: report.submittedAt,
        hasBaseline: false,
        salesIncluded: false,
        salesOmittedReason: null,
        rows: [],
      };
    }

    const from = Math.min(...report.rows.map((row) => row.expectedSinceAt));
    const to = report.submittedAt;
    const salesByProduct = new Map<Id<"products">, number>();
    let salesIncluded = false;
    let salesOmittedReason: string | null = null;

    const [master, connection, status, mappings] = await Promise.all([
      ctx.db
        .query("onlinePosIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", report.organizationId),
        )
        .unique(),
      ctx.db
        .query("onlinePosLocationIntegrations")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q
            .eq("organizationId", report.organizationId)
            .eq("locationId", report.locationId),
        )
        .unique(),
      ctx.db
        .query("onlinePosSyncStatus")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q
            .eq("organizationId", report.organizationId)
            .eq("locationId", report.locationId),
        )
        .unique(),
      ctx.db
        .query("onlinePosProductMappings")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", report.organizationId),
        )
        .take(MAX_PRODUCTS + 1),
    ]);

    // Coverage: syncedThroughAt is the forward watermark; backfillThroughAt (falling
    // back to syncedThroughAt, same as the sync engine) is how far history reaches.
    const historyStart =
      status?.backfillThroughAt ?? status?.syncedThroughAt ?? null;
    const duplicateMappingCount =
      mappings.length -
      new Set(mappings.map((mapping) => mapping.onlinePosProductId)).size;
    const connected = master?.enabled === true && Boolean(connection);
    const windowCovered =
      connected &&
      status?.syncedThroughAt != null &&
      status.syncedThroughAt >= to &&
      historyStart != null &&
      historyStart <= from;

    if (!connected) {
      salesOmittedReason = "lokationen er ikke forbundet til OnlinePOS";
    } else if (!windowCovered) {
      salesOmittedReason = "synkroniserede salg dækker ikke count-perioden";
    } else if (mappings.length > MAX_PRODUCTS) {
      salesOmittedReason =
        "der er for mange produktkoblinger til at beregne sikkert";
    } else if (duplicateMappingCount > 0) {
      salesOmittedReason =
        "et OnlinePOS-produkt er koblet til flere produkter";
    } else {
      // onlinePosProductId is a number; salesLines.externalProductId is a string.
      const productByExternalId = new Map(
        mappings.map((mapping) => [
          String(mapping.onlinePosProductId),
          mapping.productId,
        ]),
      );
      const rowByProduct = new Map(
        report.rows.map((row) => [row.productId, row]),
      );
      // Indexed range is inclusive on both ends, matching old
      // `timestamp < expectedSinceAt` / `timestamp > submittedAt` exclusion.
      const lines = await ctx.db
        .query("salesLines")
        .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
          q
            .eq("organizationId", report.organizationId)
            .eq("locationId", report.locationId)
            .gte("occurredAt", from)
            .lte("occurredAt", to),
        )
        .take(MAX_WASTE_SALES_LINES + 1);
      if (lines.length > MAX_WASTE_SALES_LINES) {
        salesOmittedReason =
          "der er for mange salgslinjer til at beregne sikkert";
      } else {
        salesIncluded = true;
        for (const line of lines) {
          if (line.source !== "onlinePos") continue;
          const productId = productByExternalId.get(line.externalProductId);
          const row = productId ? rowByProduct.get(productId) : null;
          if (
            !productId ||
            !row ||
            line.occurredAt < row.expectedSinceAt ||
            line.occurredAt > report.submittedAt
          ) {
            continue;
          }
          salesByProduct.set(
            productId,
            (salesByProduct.get(productId) ?? 0) + line.quantity,
          );
        }
      }
    }

    return {
      locationName: report.locationName,
      submittedAt: report.submittedAt,
      hasBaseline: true,
      salesIncluded,
      salesOmittedReason,
      rows: report.rows.flatMap((row) => {
        const salesQuantity = salesIncluded
          ? normalizeStock(salesByProduct.get(row.productId) ?? 0)
          : 0;
        const wasteQuantity = normalizeStock(
          row.expectedQuantity - salesQuantity - row.countedQuantity,
        );
        return Math.abs(wasteQuantity) < 1e-6
          ? []
          : [
              {
                productName: row.productName,
                defaultUnitName: row.defaultUnitName,
                expectedQuantity: row.expectedQuantity,
                salesQuantity,
                countedQuantity: row.countedQuantity,
                wasteQuantity,
              },
            ];
      }),
    };
  },
});
