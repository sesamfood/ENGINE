import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { DEFAULT_CURRENCY } from "../lib/dashboard/types";
import { mutation, query } from "./_generated/server";
import {
  requireIntegrationManager,
  requireLocationAccess,
  resolveLocationFilter,
} from "./lib/auth";
import { rateLimiter } from "./lib/rateLimits";
import { resolveTimeZone } from "./lib/timeZone";

const MAX_LOCATIONS = 200;
const MAX_SALES_RANGE_MS = 31 * 24 * 60 * 60 * 1000;
// Matches staffFood/waste paginated exports; caps client page size.
const MAX_LIST_ORDERS_PAGE = 100;

// Money fields (revenue) are integer minor units (øre), same as storage. Callers divide by 100.

const syncStateValidator = v.union(
  v.literal("idle"),
  v.literal("queued"),
  v.literal("running"),
  v.literal("error"),
);

const locationContextValidator = v.object({
  id: v.id("locations"),
  name: v.string(),
  currency: v.string(),
  state: syncStateValidator,
  lastSuccessAt: v.union(v.number(), v.null()),
  lastError: v.union(v.string(), v.null()),
  syncedThroughAt: v.union(v.number(), v.null()),
  backfillThroughAt: v.union(v.number(), v.null()),
});

const orderValidator = v.object({
  id: v.id("salesOrders"),
  occurredAt: v.number(),
  locationId: v.id("locations"),
  locationName: v.string(),
  currency: v.string(),
  orderNumber: v.number(),
  revenue: v.number(),
  itemCount: v.number(),
  paymentType: v.string(),
  department: v.string(),
});

async function scheduleSettings(ctx: QueryCtx, organizationId: string) {
  return await ctx.db
    .query("organizationScheduleSettings")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .unique();
}

function requireSalesRange(from: number, to: number) {
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from >= to ||
    to - from > MAX_SALES_RANGE_MS
  ) {
    throw new ConvexError("Vælg en periode på højst 31 dage");
  }
}

function requireListOrdersPage(paginationOpts: { numItems: number }) {
  if (
    !Number.isFinite(paginationOpts.numItems) ||
    paginationOpts.numItems <= 0 ||
    paginationOpts.numItems > MAX_LIST_ORDERS_PAGE
  ) {
    throw new ConvexError("Siden er for stor");
  }
}

function mapOrder(
  order: Doc<"salesOrders">,
  locationName: string,
  currency: string,
) {
  return {
    id: order._id,
    occurredAt: order.occurredAt,
    locationId: order.locationId,
    locationName,
    currency,
    orderNumber: order.orderNumber,
    revenue: order.revenue,
    itemCount: order.itemCount,
    paymentType: order.paymentType,
    department: order.department,
  };
}

async function locationCurrency(
  ctx: QueryCtx,
  organizationId: string,
  location: Doc<"locations">,
) {
  if (location.currency) return location.currency;
  if (!location.marketId) return DEFAULT_CURRENCY;
  const market = await ctx.db.get("markets", location.marketId);
  return market?.organizationId === organizationId && market.currency
    ? market.currency
    : DEFAULT_CURRENCY;
}

export const getContext = query({
  args: {},
  returns: v.object({
    timeZone: v.string(),
    usesDefaultTimeZone: v.boolean(),
    connected: v.boolean(),
    enabled: v.boolean(),
    locations: v.array(locationContextValidator),
    limitReached: v.boolean(),
    manualSyncRetryAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx) => {
    const auth = await requireIntegrationManager(ctx);
    const { organizationId } = auth;
    const [timeZone, settings, integration, connections, statuses, manualLimit] =
      await Promise.all([
        resolveTimeZone(ctx, organizationId),
        scheduleSettings(ctx, organizationId),
        ctx.db
          .query("onlinePosIntegrations")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", organizationId),
          )
          .unique(),
        ctx.db
          .query("onlinePosLocationIntegrations")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", organizationId),
          )
          .take(MAX_LOCATIONS + 1),
        ctx.db
          .query("onlinePosSyncStatus")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", organizationId),
          )
          .take(MAX_LOCATIONS + 1),
        rateLimiter.check(ctx, "manualSalesSync", { key: organizationId }),
      ]);
    const visibleConnections = connections.filter(
      (connection) =>
        auth.locationScope.all ||
        auth.locationScope.ids.has(connection.locationId),
    );
    const visibleStatuses = statuses.filter(
      (status) =>
        auth.locationScope.all || auth.locationScope.ids.has(status.locationId),
    );
    const limitReached =
      visibleConnections.length > MAX_LOCATIONS ||
      visibleStatuses.length > MAX_LOCATIONS;
    const statusByLocation = new Map(
      visibleStatuses
        .slice(0, MAX_LOCATIONS)
        .map((status) => [status.locationId, status]),
    );
    const locations = (
      await Promise.all(
        visibleConnections.slice(0, MAX_LOCATIONS).map(async (connection) => {
          const location = await ctx.db.get("locations", connection.locationId);
          if (location?.organizationId !== organizationId) return null;
          const status = statusByLocation.get(connection.locationId);
          const currency = await locationCurrency(ctx, organizationId, location);
          return {
            id: location._id,
            name: location.name,
            currency,
            state: status?.state ?? ("idle" as const),
            lastSuccessAt: status?.lastSuccessAt ?? null,
            lastError: status?.lastError ?? null,
            syncedThroughAt: status?.syncedThroughAt ?? null,
            backfillThroughAt: status?.backfillThroughAt ?? null,
          };
        }),
      )
    ).flatMap((location) => (location ? [location] : []));
    return {
      timeZone,
      usesDefaultTimeZone: !settings,
      connected: Boolean(integration),
      enabled: Boolean(integration?.enabled),
      locations,
      limitReached,
      manualSyncRetryAt: manualLimit.ok
        ? null
        : Date.now() + (manualLimit.retryAfter ?? 0),
    };
  },
});

export const requestSync = mutation({
  args: { locationId: v.union(v.id("locations"), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireIntegrationManager(ctx);
    const { organizationId } = auth;
    const integration = await ctx.db
      .query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();
    if (!integration) {
      throw new ConvexError("OnlinePOS er ikke forbundet");
    }
    if (!integration.enabled) {
      throw new ConvexError("OnlinePOS-integrationen er ikke aktiv");
    }
    const limit = await rateLimiter.limit(ctx, "manualSalesSync", {
      key: organizationId,
    });
    if (!limit.ok) {
      throw new ConvexError(
        "Synkronisering er midlertidigt begrænset. Prøv igen om et øjeblik",
      );
    }
    if (args.locationId === null) {
      await ctx.scheduler.runAfter(
        0,
        internal.onlinePosSync.enqueueOrganizationSync,
        { organizationId },
      );
      return null;
    }
    const locationId = args.locationId;
    requireLocationAccess(auth, locationId);
    const [location, connection] = await Promise.all([
      ctx.db.get("locations", locationId),
      ctx.db
        .query("onlinePosLocationIntegrations")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", locationId),
        )
        .unique(),
    ]);
    if (location?.organizationId !== organizationId) {
      throw new ConvexError("Lokationen blev ikke fundet");
    }
    if (!connection) {
      throw new ConvexError("Lokationen er ikke forbundet til OnlinePOS");
    }
    await ctx.scheduler.runAfter(0, internal.onlinePosSync.enqueueLocationSync, {
      organizationId,
      locationId,
    });
    return null;
  },
});

export const listOrders = query({
  args: {
    locationId: v.union(v.id("locations"), v.null()),
    from: v.number(),
    to: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(orderValidator),
  handler: async (ctx, args) => {
    const auth = await requireIntegrationManager(ctx);
    const { organizationId } = auth;
    const locationFilter = resolveLocationFilter(auth);
    const locationIds =
      locationFilter === "all"
        ? null
        : "locationId" in locationFilter
          ? [locationFilter.locationId]
          : locationFilter.locationIds;
    requireSalesRange(args.from, args.to);
    requireListOrdersPage(args.paginationOpts);

    if (args.locationId !== null) {
      const locationId = args.locationId;
      requireLocationAccess(auth, locationId);
      const location = await ctx.db.get("locations", locationId);
      if (location?.organizationId !== organizationId) {
        throw new ConvexError("Lokationen blev ikke fundet");
      }
      const currency = await locationCurrency(ctx, organizationId, location);
      const result = await ctx.db
        .query("salesOrders")
        .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("locationId", locationId)
            .gte("occurredAt", args.from)
            .lt("occurredAt", args.to),
        )
        .order("desc")
        .paginate(args.paginationOpts);
      return {
        ...result,
        page: result.page.map((order) =>
          mapOrder(order, location.name, currency),
        ),
      };
    }

    // All locations: one org+occurredAt range so usePaginatedQuery stays native.
    const connections = await ctx.db
      .query("onlinePosLocationIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_LOCATIONS + 1);
    if (connections.length > MAX_LOCATIONS) {
      throw new ConvexError("Der er for mange OnlinePOS-lokationer");
    }
    const visibleConnections = connections.filter(
      (connection) =>
        locationIds === null || locationIds.includes(connection.locationId),
    );
    const locationDocs = await Promise.all(
      visibleConnections.map((row) => ctx.db.get("locations", row.locationId)),
    );
    const locationContexts = await Promise.all(
      locationDocs.map(async (location) => {
        if (location?.organizationId !== organizationId) return null;
        return {
          id: location._id,
          name: location.name,
          currency: await locationCurrency(ctx, organizationId, location),
        };
      }),
    );
    const locationById = new Map<
      Id<"locations">,
      { name: string; currency: string }
    >();
    for (const location of locationContexts) {
      if (location) {
        locationById.set(location.id, {
          name: location.name,
          currency: location.currency,
        });
      }
    }
    const result = await ctx.db
      .query("salesOrders")
      .withIndex("by_organizationId_and_occurredAt", (q) =>
        q
          .eq("organizationId", organizationId)
          .gte("occurredAt", args.from)
          .lt("occurredAt", args.to),
      )
      .filter((q) =>
        locationIds
          ? locationIds.length
            ? q.or(
                ...locationIds.map((locationId) =>
                  q.eq(q.field("locationId"), locationId),
                ),
              )
            : q.neq(q.field("organizationId"), organizationId)
          : true,
      )
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((order) => {
        const location = locationById.get(order.locationId);
        return mapOrder(
          order,
          location?.name ?? "Ukendt lokation",
          location?.currency ?? DEFAULT_CURRENCY,
        );
      }),
    };
  },
});
