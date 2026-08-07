import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import {
  onlinePosErrorMessage,
  parseSaleLines,
  requestSales,
  type OnlinePosSaleLine,
} from "./lib/onlinePosApi";
import { dateKey, zonedStart } from "./lib/dashboardMetrics";
import {
  computeDailySalesDeltas,
  dayStartOf,
  orderKey,
  type ExistingLineState,
} from "./lib/salesRollup";

const SOURCE = "onlinePos";
const STUCK_MS = 30 * 60 * 1_000;
const OVERLAP_MS = 2 * 60 * 60 * 1_000;
const CHUNK_MS = 7 * 24 * 60 * 60 * 1_000;
const HISTORY_MS = 90 * 24 * 60 * 60 * 1_000;
const RETENTION_MS = 400 * 24 * 60 * 60 * 1_000;
const LINE_BATCH_SIZE = 250;
const DISPATCH_PAGE = 25;
const DELETE_PAGE = 40;
const LINE_DELETE_PAGE = 100;
const PRUNE_PAGE = 50;
const RECONCILE_TRAILING_DAYS = 7;
const DEFAULT_TIME_ZONE = "Europe/Copenhagen";

type SyncContext = {
  settings: { token: string; companyId: number };
  timeZone: string;
  runToken: string | null;
  syncedThroughAt: number | null;
  backfillThroughAt: number | null;
};

const settingsValidator = v.object({
  token: v.string(),
  companyId: v.number(),
});

const syncContextValidator = v.union(
  v.object({
    settings: settingsValidator,
    timeZone: v.string(),
    runToken: v.union(v.string(), v.null()),
    syncedThroughAt: v.union(v.number(), v.null()),
    backfillThroughAt: v.union(v.number(), v.null()),
  }),
  v.null(),
);

const saleLineValidator = v.object({
  externalId: v.string(),
  orderNumber: v.number(),
  occurredAt: v.number(),
  externalProductId: v.string(),
  productName: v.string(),
  quantity: v.number(),
  unitPrice: v.number(),
  revenue: v.number(),
  paymentType: v.string(),
  department: v.string(),
});

function makeRunToken(now: number) {
  return `sales:${now}`;
}

function addDateKey(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

function orderExternalId(
  locationId: Id<"locations">,
  dayStart: number,
  orderNumber: number,
) {
  return `${locationId}:${dayStart}:${orderNumber}`;
}

function lineExternalId(
  locationId: Id<"locations">,
  providerLineId: string,
) {
  return `${locationId}:${providerLineId}`;
}

function trailingReconcileDays(now: number, timeZone: string) {
  const today = dateKey(now, timeZone);
  const days: Array<{ dayStart: number; dayEnd: number }> = [];
  for (let offset = RECONCILE_TRAILING_DAYS; offset >= 1; offset -= 1) {
    const day = addDateKey(today, -offset);
    const next = addDateKey(today, -offset + 1);
    days.push({
      dayStart: zonedStart(day, timeZone),
      dayEnd: zonedStart(next, timeZone),
    });
  }
  return days;
}

async function organizationTimeZone(
  ctx: MutationCtx,
  organizationId: string,
) {
  const scheduleSettings = await ctx.db
    .query("organizationScheduleSettings")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .unique();
  return scheduleSettings?.timeZone ?? DEFAULT_TIME_ZONE;
}

async function scheduleReconcileWindow(
  ctx: MutationCtx,
  args: {
    organizationId: string;
    locationId: Id<"locations">;
    runToken: string;
    timeZone: string;
    pendingDayStart: number | null;
    now: number;
  },
) {
  const days = trailingReconcileDays(args.now, args.timeZone);
  let queue = days;
  if (args.pendingDayStart != null) {
    const pendingIndex = days.findIndex(
      (day) => day.dayStart === args.pendingDayStart,
    );
    if (pendingIndex >= 0) {
      queue = days.slice(pendingIndex);
    } else {
      const pendingDate = dateKey(args.pendingDayStart, args.timeZone);
      queue = [
        {
          dayStart: args.pendingDayStart,
          dayEnd: zonedStart(addDateKey(pendingDate, 1), args.timeZone),
        },
        ...days,
      ];
    }
  }
  const first = queue[0];
  if (!first) return;
  await ctx.scheduler.runAfter(0, internal.onlinePosSync.reconcileDayWindow, {
    organizationId: args.organizationId,
    locationId: args.locationId,
    runToken: args.runToken,
    dayStart: first.dayStart,
    dayEnd: first.dayEnd,
    remainingDayStarts: queue.slice(1).map((day) => day.dayStart),
  });
}

async function getStatus(
  ctx: MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
) {
  return await ctx.db
    .query("onlinePosSyncStatus")
    .withIndex("by_organizationId_and_locationId", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", locationId),
    )
    .unique();
}

async function isMasterEnabled(ctx: MutationCtx, organizationId: string) {
  const settings = await ctx.db
    .query("onlinePosIntegrations")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .unique();
  return settings?.enabled === true;
}

async function startSync(
  ctx: MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
  options: {
    force?: boolean;
    mode?: "incremental" | "reconcile";
  } = {},
) {
  const location = await ctx.db.get("locations", locationId);
  if (!location || location.organizationId !== organizationId) return false;
  if (!(await isMasterEnabled(ctx, organizationId))) return false;

  const connection = await ctx.db
    .query("onlinePosLocationIntegrations")
    .withIndex("by_organizationId_and_locationId", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", locationId),
    )
    .unique();
  if (!connection) return false;

  const status = await getStatus(ctx, organizationId, locationId);
  const now = Date.now();
  // Prefer finishing a mid-reconcile hole (or a deferred nightly reconcile)
  // over a normal incremental window.
  const wantsReconcile =
    options.mode === "reconcile" || status?.pendingReconcileDayStart != null;

  if (
    !options.force &&
    status &&
    (status.state === "queued" || status.state === "running") &&
    now - status.updatedAt < STUCK_MS
  ) {
    if (wantsReconcile && status.pendingReconcileDayStart == null) {
      const timeZone = await organizationTimeZone(ctx, organizationId);
      const days = trailingReconcileDays(now, timeZone);
      const first = days[0];
      if (first) {
        await ctx.db.patch("onlinePosSyncStatus", status._id, {
          pendingReconcileDayStart: first.dayStart,
          updatedAt: now,
        });
      }
    }
    return false;
  }

  const token = makeRunToken(now);
  if (status) {
    await ctx.db.patch("onlinePosSyncStatus", status._id, {
      state: "queued",
      runToken: token,
      lastAttemptAt: now,
      lastError: undefined,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("onlinePosSyncStatus", {
      organizationId,
      locationId,
      state: "queued",
      runToken: token,
      lastAttemptAt: now,
      updatedAt: now,
    });
  }

  if (wantsReconcile) {
    const timeZone = await organizationTimeZone(ctx, organizationId);
    // ponytail: trailing 7 local days only — voids older than that still slip
    // through until a manual re-sync or a void webhook.
    await scheduleReconcileWindow(ctx, {
      organizationId,
      locationId,
      runToken: token,
      timeZone,
      pendingDayStart: status?.pendingReconcileDayStart ?? null,
      now,
    });
    return true;
  }

  // Incremental window overlaps the watermark by 2h so late-arriving lines are
  // re-read cheaply (~200 lines) instead of being missed.
  const from =
    status?.syncedThroughAt != null
      ? status.syncedThroughAt - OVERLAP_MS
      : now - OVERLAP_MS;
  const to = now;
  await ctx.scheduler.runAfter(0, internal.onlinePosSync.syncLocationWindow, {
    organizationId,
    locationId,
    runToken: token,
    from,
    to,
    replaceDay: false,
  });
  return true;
}

async function scheduleBackfillIfNeeded(
  ctx: MutationCtx,
  status: Doc<"onlinePosSyncStatus">,
  runToken: string,
) {
  const now = Date.now();
  const target = now - HISTORY_MS;
  const edge =
    status.backfillThroughAt ?? status.syncedThroughAt ?? now;
  if (edge <= target) {
    await ctx.db.patch("onlinePosSyncStatus", status._id, {
      state: "idle",
      lastError: undefined,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.patch("onlinePosSyncStatus", status._id, {
    state: "running",
    updatedAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.onlinePosSync.backfillLocation, {
    organizationId: status.organizationId,
    locationId: status.locationId,
    runToken,
    throughAt: edge,
  });
}

export const getLocationSyncContext = internalQuery({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
  },
  returns: syncContextValidator,
  handler: async (ctx, args): Promise<SyncContext | null> => {
    const [location, master, connection, status, scheduleSettings] =
      await Promise.all([
        ctx.db.get("locations", args.locationId),
        ctx.db
          .query("onlinePosIntegrations")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", args.organizationId),
          )
          .unique(),
        ctx.db
          .query("onlinePosLocationIntegrations")
          .withIndex("by_organizationId_and_locationId", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("locationId", args.locationId),
          )
          .unique(),
        ctx.db
          .query("onlinePosSyncStatus")
          .withIndex("by_organizationId_and_locationId", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("locationId", args.locationId),
          )
          .unique(),
        ctx.db
          .query("organizationScheduleSettings")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", args.organizationId),
          )
          .unique(),
      ]);
    if (
      !location ||
      location.organizationId !== args.organizationId ||
      !master?.enabled ||
      !connection
    ) {
      return null;
    }
    return {
      settings: {
        token: connection.token,
        companyId: connection.companyId,
      },
      timeZone: scheduleSettings?.timeZone ?? DEFAULT_TIME_ZONE,
      runToken: status?.runToken ?? null,
      syncedThroughAt: status?.syncedThroughAt ?? null,
      backfillThroughAt: status?.backfillThroughAt ?? null,
    };
  },
});

export const enqueueOrganizationSync = internalMutation({
  args: {
    organizationId: v.string(),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await isMasterEnabled(ctx, args.organizationId))) return null;
    const result = await ctx.db
      .query("onlinePosLocationIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .paginate({ numItems: DISPATCH_PAGE, cursor: args.cursor ?? null });
    for (const connection of result.page) {
      await startSync(ctx, args.organizationId, connection.locationId);
    }
    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.onlinePosSync.enqueueOrganizationSync,
        {
          organizationId: args.organizationId,
          cursor: result.continueCursor,
        },
      );
    }
    return null;
  },
});

export const enqueueLocationSync = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await startSync(ctx, args.organizationId, args.locationId);
    return null;
  },
});

export const dispatchEnabledLocations = internalMutation({
  args: {
    kind: v.union(v.literal("incremental"), v.literal("reconcile")),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("onlinePosLocationIntegrations")
      .paginate({ numItems: DISPATCH_PAGE, cursor: args.cursor });
    const masterByOrg = new Map<string, boolean>();
    for (const connection of result.page) {
      let enabled = masterByOrg.get(connection.organizationId);
      if (enabled === undefined) {
        enabled = await isMasterEnabled(ctx, connection.organizationId);
        masterByOrg.set(connection.organizationId, enabled);
      }
      if (!enabled) continue;
      await startSync(
        ctx,
        connection.organizationId,
        connection.locationId,
        { mode: args.kind },
      );
    }
    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.onlinePosSync.dispatchEnabledLocations,
        { kind: args.kind, cursor: result.continueCursor },
      );
    }
    return null;
  },
});

export const markRunning = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    runToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await getStatus(ctx, args.organizationId, args.locationId);
    if (status?.runToken === args.runToken) {
      await ctx.db.patch("onlinePosSyncStatus", status._id, {
        state: "running",
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const completeLocationWindow = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    runToken: v.string(),
    to: v.number(),
    startBackfill: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await getStatus(ctx, args.organizationId, args.locationId);
    if (status?.runToken !== args.runToken) return null;
    const now = Date.now();
    const syncedThroughAt = Math.max(status.syncedThroughAt ?? 0, args.to);

    if (status.pendingReconcileDayStart != null) {
      const token = makeRunToken(now);
      await ctx.db.patch("onlinePosSyncStatus", status._id, {
        syncedThroughAt,
        lastSuccessAt: now,
        lastError: undefined,
        updatedAt: now,
        state: "queued",
        runToken: token,
      });
      const timeZone = await organizationTimeZone(ctx, args.organizationId);
      await scheduleReconcileWindow(ctx, {
        organizationId: args.organizationId,
        locationId: args.locationId,
        runToken: token,
        timeZone,
        pendingDayStart: status.pendingReconcileDayStart,
        now,
      });
      return null;
    }

    await ctx.db.patch("onlinePosSyncStatus", status._id, {
      syncedThroughAt,
      lastSuccessAt: now,
      lastError: undefined,
      updatedAt: now,
      state: args.startBackfill ? "running" : "idle",
    });
    if (args.startBackfill) {
      const updated = {
        ...status,
        syncedThroughAt,
      };
      await scheduleBackfillIfNeeded(ctx, updated, args.runToken);
    }
    return null;
  },
});

export const completeBackfillChunk = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    runToken: v.string(),
    backfillThroughAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await getStatus(ctx, args.organizationId, args.locationId);
    if (status?.runToken !== args.runToken) return null;
    const now = Date.now();
    await ctx.db.patch("onlinePosSyncStatus", status._id, {
      backfillThroughAt: args.backfillThroughAt,
      lastSuccessAt: now,
      lastError: undefined,
      updatedAt: now,
    });
    const updated = {
      ...status,
      backfillThroughAt: args.backfillThroughAt,
    };
    await scheduleBackfillIfNeeded(ctx, updated, args.runToken);
    return null;
  },
});

export const ingestSalesBatch = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    runToken: v.string(),
    timeZone: v.string(),
    lines: v.array(saleLineValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const location = await ctx.db.get("locations", args.locationId);
    if (!location || location.organizationId !== args.organizationId) {
      return null;
    }
    const status = await getStatus(ctx, args.organizationId, args.locationId);
    if (status?.runToken !== args.runToken) return null;

    // Compose location-scoped ids at ingest so the parser stays a pure provider map.
    const lines = args.lines.map((line) => ({
      ...line,
      externalId: lineExternalId(args.locationId, line.externalId),
    }));

    const knownOrderKeys = new Set<string>();
    const existingLines = new Map<string, ExistingLineState>();
    const existingLineDocs = new Map<string, Doc<"salesLines">>();
    const orderCache = new Map<string, Doc<"salesOrders"> | null>();

    for (const line of lines) {
      const dayStart = dayStartOf(line.occurredAt, args.timeZone);
      const key = orderKey(args.locationId, dayStart, line.orderNumber);
      if (!orderCache.has(key)) {
        const order = await ctx.db
          .query("salesOrders")
          .withIndex(
            "by_organizationId_and_locationId_and_dayStart_and_orderNumber",
            (q) =>
              q
                .eq("organizationId", args.organizationId)
                .eq("locationId", args.locationId)
                .eq("dayStart", dayStart)
                .eq("orderNumber", line.orderNumber),
          )
          .unique();
        orderCache.set(key, order);
        if (order) knownOrderKeys.add(key);
      }
      if (!existingLines.has(line.externalId)) {
        let current = await ctx.db
          .query("salesLines")
          .withIndex("by_organizationId_and_source_and_externalId", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("source", SOURCE)
              .eq("externalId", line.externalId),
          )
          .unique();
        // Migrate pre-scoped provider ids written before location composition.
        if (!current) {
          const providerId = line.externalId.slice(
            args.locationId.length + 1,
          );
          const legacy = await ctx.db
            .query("salesLines")
            .withIndex("by_organizationId_and_source_and_externalId", (q) =>
              q
                .eq("organizationId", args.organizationId)
                .eq("source", SOURCE)
                .eq("externalId", providerId),
            )
            .take(5);
          current =
            legacy.find((row) => row.locationId === args.locationId) ?? null;
        }
        if (current && current.locationId === args.locationId) {
          existingLineDocs.set(line.externalId, current);
          const currentOrder = await ctx.db.get(
            "salesOrders",
            current.orderId,
          );
          existingLines.set(line.externalId, {
            revenue: current.revenue,
            quantity: current.quantity,
            locationId: current.locationId,
            dayStart:
              currentOrder?.organizationId === args.organizationId
                ? currentOrder.dayStart
                : dayStartOf(current.occurredAt, args.timeZone),
            orderNumber:
              currentOrder?.organizationId === args.organizationId
                ? currentOrder.orderNumber
                : line.orderNumber,
          });
        }
      }
    }

    const incoming = lines.map((line) => {
      const dayStart = dayStartOf(line.occurredAt, args.timeZone);
      return {
        externalId: line.externalId,
        orderNumber: line.orderNumber,
        locationId: args.locationId as string,
        dayStart,
        revenue: line.revenue,
        quantity: line.quantity,
      };
    });
    const deltas = computeDailySalesDeltas(
      incoming,
      knownOrderKeys,
      existingLines,
    );

    const now = Date.now();
    for (const line of lines) {
      const dayStart = dayStartOf(line.occurredAt, args.timeZone);
      const key = orderKey(args.locationId, dayStart, line.orderNumber);
      let order = orderCache.get(key) ?? null;
      const existingLine = existingLineDocs.get(line.externalId);

      if (!order) {
        const orderId = await ctx.db.insert("salesOrders", {
          organizationId: args.organizationId,
          locationId: args.locationId,
          occurredAt: line.occurredAt,
          dayStart,
          orderNumber: line.orderNumber,
          revenue: line.revenue,
          itemCount: line.quantity,
          paymentType: line.paymentType,
          department: line.department,
          source: SOURCE,
          externalId: orderExternalId(
            args.locationId,
            dayStart,
            line.orderNumber,
          ),
          updatedAt: now,
        });
        order = (await ctx.db.get("salesOrders", orderId))!;
        orderCache.set(key, order);
        knownOrderKeys.add(key);
      } else {
        let revenue = order.revenue;
        let itemCount = order.itemCount;
        if (existingLine && existingLine.orderId === order._id) {
          revenue += line.revenue - existingLine.revenue;
          itemCount += line.quantity - existingLine.quantity;
        } else if (existingLine) {
          const oldOrder = await ctx.db.get(
            "salesOrders",
            existingLine.orderId,
          );
          if (
            oldOrder &&
            oldOrder.organizationId === args.organizationId &&
            oldOrder.locationId === args.locationId
          ) {
            const nextRevenue = oldOrder.revenue - existingLine.revenue;
            const nextItemCount = oldOrder.itemCount - existingLine.quantity;
            const oldKey = orderKey(
              oldOrder.locationId,
              oldOrder.dayStart,
              oldOrder.orderNumber,
            );
            if (nextItemCount <= 0) {
              await ctx.db.delete("salesOrders", oldOrder._id);
              orderCache.set(oldKey, null);
              knownOrderKeys.delete(oldKey);
            } else {
              await ctx.db.patch("salesOrders", oldOrder._id, {
                revenue: nextRevenue,
                itemCount: nextItemCount,
                updatedAt: now,
              });
              const cached = orderCache.get(oldKey);
              if (cached) {
                orderCache.set(oldKey, {
                  ...cached,
                  revenue: nextRevenue,
                  itemCount: nextItemCount,
                  updatedAt: now,
                });
              }
            }
          }
          revenue += line.revenue;
          itemCount += line.quantity;
        } else {
          revenue += line.revenue;
          itemCount += line.quantity;
        }
        await ctx.db.patch("salesOrders", order._id, {
          revenue,
          itemCount,
          occurredAt: Math.min(order.occurredAt, line.occurredAt),
          paymentType: line.paymentType,
          department: line.department,
          updatedAt: now,
        });
        order = {
          ...order,
          revenue,
          itemCount,
          occurredAt: Math.min(order.occurredAt, line.occurredAt),
          paymentType: line.paymentType,
          department: line.department,
          updatedAt: now,
        };
        orderCache.set(key, order);
      }

      if (existingLine) {
        await ctx.db.patch("salesLines", existingLine._id, {
          orderId: order._id,
          occurredAt: line.occurredAt,
          externalProductId: line.externalProductId,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          revenue: line.revenue,
          externalId: line.externalId,
        });
        existingLineDocs.set(line.externalId, {
          ...existingLine,
          orderId: order._id,
          occurredAt: line.occurredAt,
          externalProductId: line.externalProductId,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          revenue: line.revenue,
          externalId: line.externalId,
        });
      } else {
        const lineId = await ctx.db.insert("salesLines", {
          organizationId: args.organizationId,
          locationId: args.locationId,
          orderId: order._id,
          occurredAt: line.occurredAt,
          externalProductId: line.externalProductId,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          revenue: line.revenue,
          source: SOURCE,
          externalId: line.externalId,
        });
        existingLineDocs.set(
          line.externalId,
          (await ctx.db.get("salesLines", lineId))!,
        );
      }
      existingLines.set(line.externalId, {
        revenue: line.revenue,
        quantity: line.quantity,
        locationId: args.locationId,
        dayStart,
        orderNumber: line.orderNumber,
      });
    }

    for (const [bucket, delta] of deltas) {
      if (
        delta.revenue === 0 &&
        delta.orderCount === 0 &&
        delta.itemCount === 0
      ) {
        continue;
      }
      const separator = bucket.lastIndexOf(":");
      const locationId = bucket.slice(0, separator) as Id<"locations">;
      const dayStart = Number(bucket.slice(separator + 1));
      if (locationId !== args.locationId) continue;
      const daily = await ctx.db
        .query("salesDaily")
        .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("locationId", args.locationId)
            .eq("dayStart", dayStart),
        )
        .unique();
      if (daily) {
        await ctx.db.patch("salesDaily", daily._id, {
          revenue: daily.revenue + delta.revenue,
          orderCount: daily.orderCount + delta.orderCount,
          itemCount: daily.itemCount + delta.itemCount,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("salesDaily", {
          organizationId: args.organizationId,
          locationId: args.locationId,
          dayStart,
          date: dateKey(dayStart, args.timeZone),
          revenue: delta.revenue,
          orderCount: delta.orderCount,
          itemCount: delta.itemCount,
          updatedAt: now,
        });
      }
    }

    return null;
  },
});

export const syncLocationWindow = internalAction({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    runToken: v.string(),
    from: v.number(),
    to: v.number(),
    replaceDay: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.onlinePosSync.markRunning, {
      organizationId: args.organizationId,
      locationId: args.locationId,
      runToken: args.runToken,
    });
    try {
      const context: SyncContext | null = await ctx.runQuery(
        internal.onlinePosSync.getLocationSyncContext,
        {
          organizationId: args.organizationId,
          locationId: args.locationId,
        },
      );
      if (!context || context.runToken !== args.runToken) {
        throw new ConvexError("OnlinePOS-synkroniseringen er ikke aktiv");
      }
      const payload = await requestSales(context.settings, args.from, args.to);
      const lines = parseSaleLines(payload, context.timeZone);
      for (let index = 0; index < lines.length; index += LINE_BATCH_SIZE) {
        const batch: OnlinePosSaleLine[] = lines.slice(
          index,
          index + LINE_BATCH_SIZE,
        );
        await ctx.runMutation(internal.onlinePosSync.ingestSalesBatch, {
          organizationId: args.organizationId,
          locationId: args.locationId,
          runToken: args.runToken,
          timeZone: context.timeZone,
          lines: batch,
        });
      }
      await ctx.runMutation(internal.onlinePosSync.completeLocationWindow, {
        organizationId: args.organizationId,
        locationId: args.locationId,
        runToken: args.runToken,
        to: args.to,
        startBackfill: !args.replaceDay,
      });
    } catch (error) {
      await ctx.runMutation(internal.onlinePosSync.failSync, {
        organizationId: args.organizationId,
        locationId: args.locationId,
        runToken: args.runToken,
        message: onlinePosErrorMessage(error),
      });
    }
    return null;
  },
});

export const backfillLocation = internalAction({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    runToken: v.string(),
    throughAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.onlinePosSync.markRunning, {
      organizationId: args.organizationId,
      locationId: args.locationId,
      runToken: args.runToken,
    });
    try {
      const context: SyncContext | null = await ctx.runQuery(
        internal.onlinePosSync.getLocationSyncContext,
        {
          organizationId: args.organizationId,
          locationId: args.locationId,
        },
      );
      if (!context || context.runToken !== args.runToken) {
        throw new ConvexError("OnlinePOS-synkroniseringen er ikke aktiv");
      }
      const target = Date.now() - HISTORY_MS;
      if (args.throughAt <= target) {
        await ctx.runMutation(internal.onlinePosSync.completeBackfillChunk, {
          organizationId: args.organizationId,
          locationId: args.locationId,
          runToken: args.runToken,
          backfillThroughAt: args.throughAt,
        });
        return null;
      }
      const from = Math.max(args.throughAt - CHUNK_MS, target);
      const to = args.throughAt;
      const payload = await requestSales(context.settings, from, to);
      const lines = parseSaleLines(payload, context.timeZone);
      for (let index = 0; index < lines.length; index += LINE_BATCH_SIZE) {
        await ctx.runMutation(internal.onlinePosSync.ingestSalesBatch, {
          organizationId: args.organizationId,
          locationId: args.locationId,
          runToken: args.runToken,
          timeZone: context.timeZone,
          lines: lines.slice(index, index + LINE_BATCH_SIZE),
        });
      }
      await ctx.runMutation(internal.onlinePosSync.completeBackfillChunk, {
        organizationId: args.organizationId,
        locationId: args.locationId,
        runToken: args.runToken,
        backfillThroughAt: from,
      });
    } catch (error) {
      await ctx.runMutation(internal.onlinePosSync.failSync, {
        organizationId: args.organizationId,
        locationId: args.locationId,
        runToken: args.runToken,
        message: onlinePosErrorMessage(error),
      });
    }
    return null;
  },
});

export const resetDayRollup = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    dayStart: v.number(),
    timeZone: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const daily = await ctx.db
      .query("salesDaily")
      .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("locationId", args.locationId)
          .eq("dayStart", args.dayStart),
      )
      .unique();
    const now = Date.now();
    if (daily) {
      await ctx.db.patch("salesDaily", daily._id, {
        revenue: 0,
        orderCount: 0,
        itemCount: 0,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("salesDaily", {
        organizationId: args.organizationId,
        locationId: args.locationId,
        dayStart: args.dayStart,
        date: dateKey(args.dayStart, args.timeZone),
        revenue: 0,
        orderCount: 0,
        itemCount: 0,
        updatedAt: now,
      });
    }
    return null;
  },
});

export const markReconcilePending = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    runToken: v.string(),
    dayStart: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await getStatus(ctx, args.organizationId, args.locationId);
    if (status?.runToken !== args.runToken) return null;
    await ctx.db.patch("onlinePosSyncStatus", status._id, {
      pendingReconcileDayStart: args.dayStart,
      state: "running",
      updatedAt: Date.now(),
    });
    return null;
  },
});

const deleteDayPageResultValidator = v.object({
  isDone: v.boolean(),
  continueCursor: v.string(),
});

export const deleteDayOrdersPage = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    runToken: v.string(),
    dayStart: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: deleteDayPageResultValidator,
  handler: async (ctx, args) => {
    const status = await getStatus(ctx, args.organizationId, args.locationId);
    if (status?.runToken !== args.runToken) {
      return { isDone: true, continueCursor: "" };
    }

    const result = await ctx.db
      .query("salesOrders")
      .withIndex(
        "by_organizationId_and_locationId_and_dayStart_and_orderNumber",
        (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("locationId", args.locationId)
            .eq("dayStart", args.dayStart),
      )
      .paginate({ numItems: DELETE_PAGE, cursor: args.cursor });

    for (const order of result.page) {
      for (;;) {
        const lines = await ctx.db
          .query("salesLines")
          .withIndex("by_organizationId_and_orderId", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("orderId", order._id),
          )
          .take(LINE_DELETE_PAGE);
        if (lines.length === 0) break;
        for (const line of lines) {
          await ctx.db.delete("salesLines", line._id);
        }
      }
      await ctx.db.delete("salesOrders", order._id);
    }

    return {
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const completeReconcileDay = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    runToken: v.string(),
    dayStart: v.number(),
    remainingDayStarts: v.array(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await getStatus(ctx, args.organizationId, args.locationId);
    if (status?.runToken !== args.runToken) return null;
    const now = Date.now();
    const timeZone = await organizationTimeZone(ctx, args.organizationId);
    const nextDayStart = args.remainingDayStarts[0];

    if (nextDayStart !== undefined) {
      await ctx.db.patch("onlinePosSyncStatus", status._id, {
        pendingReconcileDayStart: nextDayStart,
        state: "queued",
        lastSuccessAt: now,
        lastError: undefined,
        updatedAt: now,
      });
      const nextDate = dateKey(nextDayStart, timeZone);
      await ctx.scheduler.runAfter(
        0,
        internal.onlinePosSync.reconcileDayWindow,
        {
          organizationId: args.organizationId,
          locationId: args.locationId,
          runToken: args.runToken,
          dayStart: nextDayStart,
          dayEnd: zonedStart(addDateKey(nextDate, 1), timeZone),
          remainingDayStarts: args.remainingDayStarts.slice(1),
        },
      );
      return null;
    }

    await ctx.db.patch("onlinePosSyncStatus", status._id, {
      pendingReconcileDayStart: undefined,
      state: "idle",
      lastSuccessAt: now,
      lastError: undefined,
      syncedThroughAt: Math.max(
        status.syncedThroughAt ?? 0,
        zonedStart(addDateKey(dateKey(args.dayStart, timeZone), 1), timeZone),
      ),
      updatedAt: now,
    });
    return null;
  },
});

export const reconcileDayWindow = internalAction({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    runToken: v.string(),
    dayStart: v.number(),
    dayEnd: v.number(),
    remainingDayStarts: v.array(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.onlinePosSync.markRunning, {
      organizationId: args.organizationId,
      locationId: args.locationId,
      runToken: args.runToken,
    });
    try {
      const context: SyncContext | null = await ctx.runQuery(
        internal.onlinePosSync.getLocationSyncContext,
        {
          organizationId: args.organizationId,
          locationId: args.locationId,
        },
      );
      if (!context || context.runToken !== args.runToken) {
        throw new ConvexError("OnlinePOS-synkroniseringen er ikke aktiv");
      }

      // Fetch before destroying the day so an unreachable API leaves data intact.
      const payload = await requestSales(
        context.settings,
        args.dayStart,
        args.dayEnd,
      );
      const lines = parseSaleLines(payload, context.timeZone);

      await ctx.runMutation(internal.onlinePosSync.markReconcilePending, {
        organizationId: args.organizationId,
        locationId: args.locationId,
        runToken: args.runToken,
        dayStart: args.dayStart,
      });

      let cursor: string | null = null;
      for (;;) {
        const page: { isDone: boolean; continueCursor: string } =
          await ctx.runMutation(internal.onlinePosSync.deleteDayOrdersPage, {
            organizationId: args.organizationId,
            locationId: args.locationId,
            runToken: args.runToken,
            dayStart: args.dayStart,
            cursor,
          });
        if (page.isDone) break;
        cursor = page.continueCursor;
      }

      await ctx.runMutation(internal.onlinePosSync.resetDayRollup, {
        organizationId: args.organizationId,
        locationId: args.locationId,
        dayStart: args.dayStart,
        timeZone: context.timeZone,
      });

      for (let index = 0; index < lines.length; index += LINE_BATCH_SIZE) {
        const batch: OnlinePosSaleLine[] = lines.slice(
          index,
          index + LINE_BATCH_SIZE,
        );
        await ctx.runMutation(internal.onlinePosSync.ingestSalesBatch, {
          organizationId: args.organizationId,
          locationId: args.locationId,
          runToken: args.runToken,
          timeZone: context.timeZone,
          lines: batch,
        });
      }

      await ctx.runMutation(internal.onlinePosSync.completeReconcileDay, {
        organizationId: args.organizationId,
        locationId: args.locationId,
        runToken: args.runToken,
        dayStart: args.dayStart,
        remainingDayStarts: args.remainingDayStarts,
      });
    } catch (error) {
      await ctx.runMutation(internal.onlinePosSync.failSync, {
        organizationId: args.organizationId,
        locationId: args.locationId,
        runToken: args.runToken,
        message: onlinePosErrorMessage(error),
      });
    }
    return null;
  },
});

export const failSync = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    runToken: v.string(),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await getStatus(ctx, args.organizationId, args.locationId);
    if (status?.runToken === args.runToken) {
      const now = Date.now();
      await ctx.db.patch("onlinePosSyncStatus", status._id, {
        state: "error",
        lastError: args.message.slice(0, 300),
        updatedAt: now,
      });
      // Mid-reconcile holes must not wait for the next cron — retry promptly.
      if (status.pendingReconcileDayStart != null) {
        await ctx.scheduler.runAfter(
          60_000,
          internal.onlinePosSync.enqueueLocationSync,
          {
            organizationId: args.organizationId,
            locationId: args.locationId,
          },
        );
      }
    }
    return null;
  },
});

export const pruneSales = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    // salesDaily is kept forever so dashboard history survives while line-level
    // storage stays bounded.
    const cutoff = Date.now() - RETENTION_MS;
    const result = await ctx.db
      .query("salesOrders")
      .withIndex("by_occurredAt", (q) => q.lt("occurredAt", cutoff))
      .paginate({ numItems: PRUNE_PAGE, cursor: args.cursor });

    for (const order of result.page) {
      for (;;) {
        const lines = await ctx.db
          .query("salesLines")
          .withIndex("by_organizationId_and_orderId", (q) =>
            q
              .eq("organizationId", order.organizationId)
              .eq("orderId", order._id),
          )
          .take(LINE_DELETE_PAGE);
        if (lines.length === 0) break;
        for (const line of lines) {
          await ctx.db.delete("salesLines", line._id);
        }
      }
      await ctx.db.delete("salesOrders", order._id);
    }

    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.onlinePosSync.pruneSales, {
        cursor: result.continueCursor,
      });
      return null;
    }

    // Catch orphaned lines whose orders were already removed.
    const orphanLines = await ctx.db
      .query("salesLines")
      .withIndex("by_occurredAt", (q) => q.lt("occurredAt", cutoff))
      .take(PRUNE_PAGE);
    for (const line of orphanLines) {
      await ctx.db.delete("salesLines", line._id);
    }
    if (orphanLines.length === PRUNE_PAGE) {
      await ctx.scheduler.runAfter(0, internal.onlinePosSync.pruneSales, {
        cursor: null,
      });
    }
    return null;
  },
});
