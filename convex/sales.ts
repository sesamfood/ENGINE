import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireOrganizationAdmin } from "./lib/auth";
import { rateLimiter } from "./lib/rateLimits";

const DEFAULT_TIME_ZONE = "Europe/Copenhagen";
const MAX_LOCATIONS = 200;
const MAX_SALES_RANGE_MS = 31 * 24 * 60 * 60 * 1000;

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

function mapOrder(
  order: Doc<"salesOrders">,
  locationName: string,
) {
  return {
    id: order._id,
    occurredAt: order.occurredAt,
    locationId: order.locationId,
    locationName,
    orderNumber: order.orderNumber,
    revenue: order.revenue,
    itemCount: order.itemCount,
    paymentType: order.paymentType,
    department: order.department,
  };
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
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const [settings, integration, connections, statuses, manualLimit] =
      await Promise.all([
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
    const limitReached =
      connections.length > MAX_LOCATIONS || statuses.length > MAX_LOCATIONS;
    const statusByLocation = new Map(
      statuses
        .slice(0, MAX_LOCATIONS)
        .map((status) => [status.locationId, status]),
    );
    const locations = (
      await Promise.all(
        connections.slice(0, MAX_LOCATIONS).map(async (connection) => {
          const location = await ctx.db.get("locations", connection.locationId);
          if (location?.organizationId !== organizationId) return null;
          const status = statusByLocation.get(connection.locationId);
          return {
            id: location._id,
            name: location.name,
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
      timeZone: settings?.timeZone ?? DEFAULT_TIME_ZONE,
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
    const { organizationId } = await requireOrganizationAdmin(ctx);
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
    const { organizationId } = await requireOrganizationAdmin(ctx);
    requireSalesRange(args.from, args.to);

    if (args.locationId !== null) {
      const locationId = args.locationId;
      const location = await ctx.db.get("locations", locationId);
      if (location?.organizationId !== organizationId) {
        throw new ConvexError("Lokationen blev ikke fundet");
      }
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
        page: result.page.map((order) => mapOrder(order, location.name)),
      };
    }

    // No by_organizationId_and_occurredAt: fan out per connected location and merge.
    // ponytail: offset merge caps at MAX_LOCATIONS indexed reads per page; upgrade: org+occurredAt index.
    const connections = await ctx.db
      .query("onlinePosLocationIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_LOCATIONS + 1);
    if (connections.length > MAX_LOCATIONS) {
      throw new ConvexError("Der er for mange OnlinePOS-lokationer");
    }
    const offset =
      args.paginationOpts.cursor === null || args.paginationOpts.cursor === ""
        ? 0
        : Number.parseInt(args.paginationOpts.cursor, 10);
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new ConvexError("Ugyldig side");
    }
    const need = offset + args.paginationOpts.numItems + 1;
    const locationIds = connections.map((row) => row.locationId);
    const [locationDocs, orderBatches] = await Promise.all([
      Promise.all(locationIds.map((id) => ctx.db.get("locations", id))),
      Promise.all(
        locationIds.map((locationId) =>
          ctx.db
            .query("salesOrders")
            .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("locationId", locationId)
                .gte("occurredAt", args.from)
                .lt("occurredAt", args.to),
            )
            .order("desc")
            .take(need),
        ),
      ),
    ]);
    const locationNameById = new Map<Id<"locations">, string>();
    for (const location of locationDocs) {
      if (location?.organizationId === organizationId) {
        locationNameById.set(location._id, location.name);
      }
    }
    const merged = orderBatches
      .flat()
      .filter((order) => locationNameById.has(order.locationId))
      .sort(
        (left, right) =>
          right.occurredAt - left.occurredAt ||
          right._creationTime - left._creationTime,
      );
    const pageRows = merged.slice(offset, offset + args.paginationOpts.numItems);
    const isDone = merged.length <= offset + args.paginationOpts.numItems;
    return {
      page: pageRows.map((order) =>
        mapOrder(order, locationNameById.get(order.locationId)!),
      ),
      isDone,
      continueCursor: isDone
        ? ""
        : String(offset + args.paginationOpts.numItems),
    };
  },
});
