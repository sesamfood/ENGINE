import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireOrganizationAdmin } from "./lib/auth";
import {
  number,
  object,
  parseProducts,
  priceNumber,
  requestOnlinePos,
  requestSales,
  saleTimestamp,
  string,
  type OnlinePosProduct,
} from "./lib/onlinePosApi";
import { normalizeStock } from "./lib/stock";
import type { MetricResult } from "../lib/dashboard/types";
import { dateKey, zonedStart } from "./lib/dashboardMetrics";

const MAX_LOCATIONS = 200;
const MAX_PRODUCTS = 500;
const MAX_SALES = 500;
const MAX_SALES_RANGE_MS = 31 * 24 * 60 * 60 * 1000;

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

const saleValidator = v.object({
  locationId: v.id("locations"),
  locationName: v.string(),
  id: v.number(),
  checkNumber: v.number(),
  date: v.string(),
  time: v.string(),
  onlinePosProductId: v.number(),
  onlinePosProductName: v.string(),
  localProductName: v.union(v.string(), v.null()),
  amount: v.number(),
  price: v.string(),
  paymentType: v.string(),
  department: v.string(),
});

const wasteReportRowValidator = v.object({
  productName: v.string(),
  defaultUnitName: v.string(),
  expectedQuantity: v.number(),
  salesQuantity: v.number(),
  countedQuantity: v.number(),
  wasteQuantity: v.number(),
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

async function requireEnabledSettings(ctx: ActionCtx): Promise<{
  organizationId: string;
  settings: { token: string; companyId: number; enabled: boolean };
}> {
  const { organizationId } = await requireOrganizationAdmin(ctx);
  const settings: {
    token: string;
    companyId: number;
    enabled: boolean;
  } | null = await ctx.runQuery(internal.onlinePos.getPrivateSettings, {
    organizationId,
  });
  if (!settings?.enabled) {
    throw new ConvexError("OnlinePOS-integrationen er ikke aktiv");
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
    const { organizationId } = await requireOrganizationAdmin(ctx);
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
    const { organizationId } = await requireOrganizationAdmin(ctx);
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

    return {
      locations: locations.slice(0, MAX_LOCATIONS).map((location) => {
        const connection = byLocationId.get(location._id);
        return {
          id: location._id,
          name: location.name,
          connected: Boolean(connection),
          companyId: connection?.companyId ?? null,
          connectedAt: connection?.connectedAt ?? null,
        };
      }),
      limitReached: locations.length > MAX_LOCATIONS,
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

export const getSalesContext = internalQuery({
  args: { organizationId: v.string() },
  returns: v.object({
    masterEnabled: v.boolean(),
    locations: v.array(
      v.object({
        id: v.id("locations"),
        name: v.string(),
        token: v.string(),
        companyId: v.number(),
      }),
    ),
    mappings: v.array(
      v.object({
        productId: v.id("products"),
        onlinePosProductId: v.number(),
        productName: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    const [rows, locationSettings] = await Promise.all([
      ctx.db
        .query("onlinePosProductMappings")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .take(MAX_PRODUCTS),
      ctx.db
        .query("onlinePosLocationIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .take(MAX_LOCATIONS + 1),
    ]);
    if (locationSettings.length > MAX_LOCATIONS) {
      throw new ConvexError("Der er for mange OnlinePOS-lokationer");
    }
    const mappings = await Promise.all(
      rows.map(async (row) => {
        const product = await ctx.db.get("products", row.productId);
        return product?.organizationId === args.organizationId
          ? {
              productId: product._id,
              onlinePosProductId: row.onlinePosProductId,
              productName: product.name,
            }
          : null;
      }),
    );
    const locations = await Promise.all(
      locationSettings.map(async (locationSettings) => {
        const location = await ctx.db.get(
          "locations",
          locationSettings.locationId,
        );
        return location?.organizationId === args.organizationId
          ? {
              id: location._id,
              name: location.name,
              token: locationSettings.token,
              companyId: locationSettings.companyId,
            }
          : null;
      }),
    );

    return {
      masterEnabled: settings?.enabled ?? false,
      locations: locations.filter((location) => location !== null),
      mappings: mappings.filter((mapping) => mapping !== null),
    };
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

    if (current) {
      await ctx.db.patch(current._id, {
        token: args.token,
        companyId: args.companyId,
        enabled: true,
        connectedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("onlinePosIntegrations", {
        organizationId: args.organizationId,
        token: args.token,
        companyId: args.companyId,
        enabled: true,
        connectedAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});

export const saveLocationConnection = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    token: v.string(),
    companyId: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [location, current] = await Promise.all([
      ctx.db.get("locations", args.locationId),
      ctx.db
        .query("onlinePosLocationIntegrations")
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
    if (current) {
      await ctx.db.patch(current._id, {
        token: args.token,
        companyId: args.companyId,
        connectedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("onlinePosLocationIntegrations", {
        organizationId: args.organizationId,
        locationId: args.locationId,
        token: args.token,
        companyId: args.companyId,
        connectedAt: now,
        updatedAt: now,
      });
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
    return null;
  },
});

export const connect = action({
  args: { token: v.string(), companyId: v.number() },
  returns: v.object({ productCount: v.number() }),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    requireCompanyId(args.companyId);
    const token = requireToken(args.token);
    const products = parseProducts(
      await requestOnlinePos("/getProducts", {
        token,
        companyId: args.companyId,
      }),
    );
    await ctx.runMutation(internal.onlinePos.saveConnection, {
      organizationId,
      token,
      companyId: args.companyId,
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
    const { organizationId } = await requireOrganizationAdmin(ctx);
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
    });
    return null;
  },
});

export const setEnabled = action({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const settings: {
      token: string;
      companyId: number;
      enabled: boolean;
    } | null = await ctx.runQuery(internal.onlinePos.getPrivateSettings, {
      organizationId,
    });
    if (!settings) throw new ConvexError("OnlinePOS er ikke forbundet");
    if (args.enabled) {
      parseProducts(await requestOnlinePos("/getProducts", settings));
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
    const { organizationId } = await requireOrganizationAdmin(ctx);
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
    }
    if (settings) await ctx.db.delete(settings._id);
    return null;
  },
});

export const disconnectLocation = mutation({
  args: { locationId: v.id("locations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const connection = await ctx.db
      .query("onlinePosLocationIntegrations")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", args.locationId),
      )
      .unique();
    if (connection) await ctx.db.delete(connection._id);
    return null;
  },
});

export const listProducts = action({
  args: {},
  returns: v.array(onlinePosProductValidator),
  handler: async (ctx): Promise<OnlinePosProduct[]> => {
    const { settings } = await requireEnabledSettings(ctx);
    return parseProducts(await requestOnlinePos("/getProducts", settings));
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
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const settings = await ctx.db
      .query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();
    if (!settings?.enabled) return null;

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
    const [settings, product, current] = await Promise.all([
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
    ]);
    if (!settings?.enabled) {
      throw new ConvexError("OnlinePOS-integrationen er ikke aktiv");
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
    const { organizationId, settings } = await requireEnabledSettings(ctx);

    if (args.onlinePosProductId !== null) {
      const products = parseProducts(
        await requestOnlinePos("/getProducts", settings),
      );
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

export const listSales = action({
  args: { from: v.number(), to: v.number() },
  returns: v.object({
    sales: v.array(saleValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (
      !Number.isFinite(args.from) ||
      !Number.isFinite(args.to) ||
      args.from >= args.to ||
      args.to - args.from > MAX_SALES_RANGE_MS
    ) {
      throw new ConvexError("Vælg en periode på højst 31 dage");
    }

    const { organizationId } = await requireOrganizationAdmin(ctx);
    const context: {
      masterEnabled: boolean;
      locations: Array<{
        id: Id<"locations">;
        name: string;
        token: string;
        companyId: number;
      }>;
      mappings: Array<{
        productId: Id<"products">;
        onlinePosProductId: number;
        productName: string;
      }>;
    } = await ctx.runQuery(internal.onlinePos.getSalesContext, {
      organizationId,
    });
    if (!context.masterEnabled) {
      throw new ConvexError("OnlinePOS-masterforbindelsen er ikke aktiv");
    }
    if (context.locations.length === 0) {
      throw new ConvexError(
        "Forbind mindst én lokation til OnlinePOS for at hente salg",
      );
    }

    const names = new Map(
      context.mappings.map((mapping) => [
        mapping.onlinePosProductId,
        mapping.productName,
      ]),
    );
    const byLocation = await Promise.all(
      context.locations.map(async (location) => {
        const sales = await requestSales(location, args.from, args.to);
        return sales.flatMap((value) => {
          const line = object(object(value)?.line);
          const id = number(line?.id);
          const checkNumber = number(line?.chk);
          const productId = number(line?.product_id);
          const amount = number(line?.amount);
          if (
            id === null ||
            checkNumber === null ||
            productId === null ||
            amount === null
          ) {
            return [];
          }
          return [
            {
              locationId: location.id,
              locationName: location.name,
              id,
              checkNumber,
              date: string(line?.date),
              time: string(line?.time),
              onlinePosProductId: productId,
              onlinePosProductName: string(line?.product),
              localProductName: names.get(productId) ?? null,
              amount,
              price: string(line?.price),
              paymentType: string(line?.payment_type),
              department: string(line?.department),
            },
          ];
        });
      }),
    );
    const parsed = byLocation.flat();

    return {
      sales: parsed.slice(0, MAX_SALES),
      truncated: parsed.length > MAX_SALES,
    };
  },
});

export async function computeOnlinePosTurnover(
  ctx: ActionCtx,
  params: {
    organizationId: string;
    locations: Array<{ id: Id<"locations">; name: string }>;
    compare: boolean;
    from: number;
    to: number;
    previousFrom: number;
    previousTo: number;
    timeZone: string;
  },
): Promise<MetricResult> {
  const context: {
    masterEnabled: boolean;
    locations: Array<{
      id: Id<"locations">;
      name: string;
      token: string;
      companyId: number;
    }>;
    mappings: Array<{
      productId: Id<"products">;
      onlinePosProductId: number;
      productName: string;
    }>;
  } = await ctx.runQuery(internal.onlinePos.getSalesContext, {
    organizationId: params.organizationId,
  });
  if (!context.masterEnabled) {
    throw new ConvexError("OnlinePOS-masterforbindelsen er ikke aktiv");
  }
  const selected = new Set(params.locations.map((location) => location.id));
  const connected = context.locations.filter((location) => selected.has(location.id));
  if (connected.length === 0) {
    throw new ConvexError("Ingen af de valgte locations er forbundet til OnlinePOS");
  }

  async function rowsFor(from: number, to: number) {
    const parts = await Promise.all(
      connected.map(async (location) => {
        const sales = await requestSales(location, from, to);
        return {
          rows: sales.flatMap((value) => {
            const line = object(object(value)?.line);
            const amount = number(line?.amount);
            const price = priceNumber(line?.price);
            const timestamp = saleTimestamp(
              string(line?.date),
              string(line?.time),
              params.timeZone,
            );
            if (amount === null || price === null || timestamp === null) return [];
            return [{ locationId: location.id, timestamp, value: amount * price }];
          }),
          truncated: sales.length > MAX_SALES,
        };
      }),
    );
    return {
      rows: parts.flatMap((part) => part.rows).slice(0, MAX_SALES),
      truncated: parts.some((part) => part.truncated) || parts.flatMap((part) => part.rows).length > MAX_SALES,
    };
  }

  const [current, previous] = await Promise.all([
    rowsFor(params.from, params.to),
    rowsFor(params.previousFrom, params.previousTo),
  ]);
  const groups = params.compare
    ? params.locations.map((location) => ({ key: location.id, label: location.name }))
    : [{ key: "all" as const, label: "Alle locations" }];
  const days: number[] = [];
  let cursor = dateKey(params.from, params.timeZone);
  while (true) {
    const start = zonedStart(cursor, params.timeZone);
    if (start >= params.to) break;
    days.push(start);
    const [year, month, day] = cursor.split("-").map(Number);
    cursor = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  }
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    unit: "currency",
    series: groups.map((group) => {
      const currentRows = params.compare
        ? current.rows.filter((row) => row.locationId === group.key)
        : current.rows;
      const previousRows = params.compare
        ? previous.rows.filter((row) => row.locationId === group.key)
        : previous.rows;
      const byDay = new Map<number, number>();
      for (const row of currentRows) {
        const start = zonedStart(dateKey(row.timestamp, params.timeZone), params.timeZone);
        byDay.set(start, (byDay.get(start) ?? 0) + row.value);
      }
      return {
        key: String(group.key),
        label: group.label,
        points: days.map((t) => ({ t, value: round(byDay.get(t) ?? 0) })),
        total: round(currentRows.reduce((sum, row) => sum + row.value, 0)),
        previousTotal: round(previousRows.reduce((sum, row) => sum + row.value, 0)),
      };
    }),
    truncated: current.truncated || previous.truncated || undefined,
  };
}

export const exportCountWasteReport = action({
  args: { countId: v.id("counts") },
  returns: v.object({
    locationName: v.string(),
    submittedAt: v.number(),
    hasBaseline: v.boolean(),
    salesIncluded: v.boolean(),
    rows: v.array(wasteReportRowValidator),
  }),
  handler: async (ctx, args) => {
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
        rows: [],
      };
    }

    const context: {
      masterEnabled: boolean;
      locations: Array<{
        id: Id<"locations">;
        name: string;
        token: string;
        companyId: number;
      }>;
      mappings: Array<{
        productId: Id<"products">;
        onlinePosProductId: number;
        productName: string;
      }>;
    } = await ctx.runQuery(internal.onlinePos.getSalesContext, {
      organizationId: report.organizationId,
    });
    const location = context.locations.find(
      (candidate) => candidate.id === report.locationId,
    );
    const salesByProduct = new Map<Id<"products">, number>();
    const salesIncluded = context.masterEnabled && Boolean(location);

    if (location && context.masterEnabled) {
      const productByOnlinePosId = new Map(
        context.mappings.map((mapping) => [
          mapping.onlinePosProductId,
          mapping.productId,
        ]),
      );
      const rowByProduct = new Map(
        report.rows.map((row) => [row.productId, row]),
      );
      const from = Math.min(...report.rows.map((row) => row.expectedSinceAt));
      // ponytail: hardcodes Europe/Copenhagen; later rewrite reads salesLines instead of live POS.
      const sales = await requestSales(location, from, report.submittedAt);
      for (const value of sales) {
        const line = object(object(value)?.line);
        const onlinePosProductId = number(line?.product_id);
        const amount = number(line?.amount);
        const timestamp = saleTimestamp(
          string(line?.date),
          string(line?.time),
          "Europe/Copenhagen",
        );
        if (
          onlinePosProductId === null ||
          amount === null ||
          timestamp === null
        ) {
          continue;
        }
        const productId = productByOnlinePosId.get(onlinePosProductId);
        const row = productId ? rowByProduct.get(productId) : null;
        if (
          !productId ||
          !row ||
          timestamp < row.expectedSinceAt ||
          timestamp > report.submittedAt
        ) {
          continue;
        }
        salesByProduct.set(
          productId,
          (salesByProduct.get(productId) ?? 0) + amount,
        );
      }
    }

    return {
      locationName: report.locationName,
      submittedAt: report.submittedAt,
      hasBaseline: true,
      salesIncluded,
      rows: report.rows.flatMap((row) => {
        const salesQuantity = normalizeStock(
          salesByProduct.get(row.productId) ?? 0,
        );
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
