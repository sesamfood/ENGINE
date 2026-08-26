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
  dayBucketKey,
  dayStartOf,
  orderKey,
  type ExistingLineState,
} from "./lib/salesRollup";
import { resolveTimeZone } from "./lib/timeZone";

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
const RECONCILE_TRAILING_DAYS = 1;
const RECONCILE_MAX_FAIL_RETRIES = 8;
const RECONCILE_RETRY_BASE_MS = 60_000;
const RECONCILE_RETRY_MAX_MS = 6 * 60 * 60 * 1_000;
const RESET_PAGE = 500;
const REROLL_PAGE = 250;
const MAX_ORDERS_PER_DAY = 10_000;
const rerollPhaseValidator = v.union(
  v.literal("orders"),
  v.literal("clearDaily"),
  v.literal("rebuildDaily"),
);

type SyncContext = {
  settings: { token: string; companyId: number };
  timeZone: string;
  runToken: string | null;
  syncedThroughAt: number | null;
  backfillThroughAt: number | null;
  reconcileHashes: Array<{ dayStart: number; hash: string }>;
  lineIdsScoped: boolean;
};

type SalesOrderState = Omit<
  Doc<"salesOrders">,
  "_creationTime" | "organizationId" | "source"
>;

const settingsValidator = v.object({
  token: v.string(),
  companyId: v.number(),
});

const reconcileHashValidator = v.object({
  dayStart: v.number(),
  hash: v.string(),
});

const syncContextValidator = v.union(
  v.object({
    settings: settingsValidator,
    timeZone: v.string(),
    runToken: v.union(v.string(), v.null()),
    syncedThroughAt: v.union(v.number(), v.null()),
    backfillThroughAt: v.union(v.number(), v.null()),
    reconcileHashes: v.array(reconcileHashValidator),
    lineIdsScoped: v.boolean(),
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

function backfillCoversHistory(
  status: Pick<
    Doc<"onlinePosSyncStatus">,
    "syncedThroughAt" | "backfillThroughAt"
  >,
  now = Date.now(),
) {
  return (
    status.syncedThroughAt != null &&
    status.backfillThroughAt != null &&
    status.backfillThroughAt <= now - HISTORY_MS
  );
}

function scopedLineIdsReady(
  status: Pick<
    Doc<"onlinePosSyncStatus">,
    "lineIdsScoped" | "syncedThroughAt" | "backfillThroughAt"
  >,
) {
  // Older rows may already say true; history coverage is the safe reset gate.
  return status.lineIdsScoped === true && backfillCoversHistory(status);
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
  department: string,
) {
  return `${locationId}:${dayStart}:${orderNumber}:${department}`;
}

function lineExternalId(locationId: Id<"locations">, providerLineId: string) {
  return `${locationId}:${providerLineId}`;
}

function finiteSalesNumber(value: number) {
  if (!Number.isFinite(value)) {
    throw new ConvexError("OnlinePOS-salgstallene er for store");
  }
  return value;
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

async function saleLinesHash(lines: OnlinePosSaleLine[]) {
  const serialized = lines
    .map((line) =>
      JSON.stringify([
        line.externalId,
        line.orderNumber,
        line.occurredAt,
        line.externalProductId,
        line.quantity,
        line.unitPrice,
        line.revenue,
        line.paymentType,
        line.department,
        line.productName,
      ]),
    )
    .sort();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(["v1", serialized])),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `v1:${hex}`;
}

function withReconcileHash(
  hashes: Array<{ dayStart: number; hash: string }> | undefined,
  dayStart: number,
  hash: string,
) {
  const next = [
    ...(hashes ?? []).filter((entry) => entry.dayStart !== dayStart),
    { dayStart, hash },
  ];
  next.sort((a, b) => b.dayStart - a.dayStart);
  return next.slice(0, RECONCILE_TRAILING_DAYS);
}

async function organizationTimeZone(
  ctx: MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
) {
  return await resolveTimeZone(ctx, organizationId, locationId);
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

  const reset = await ctx.db
    .query("onlinePosSalesResets")
    .withIndex("by_organizationId_and_locationId", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", locationId),
    )
    .unique();
  if (reset) return false;

  const status = await getStatus(ctx, organizationId, locationId);
  const now = Date.now();
  // Prefer finishing a mid-reconcile hole (or a deferred nightly reconcile)
  // over a normal incremental window.
  const wantsReconcile =
    options.mode === "reconcile" || status?.pendingReconcileDayStart != null;

  if (
    status &&
    (status.state === "queued" || status.state === "running") &&
    now - status.updatedAt < STUCK_MS
  ) {
    if (wantsReconcile && status.pendingReconcileDayStart == null) {
      const timeZone = await organizationTimeZone(
        ctx,
        organizationId,
        locationId,
      );
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
    const timeZone = await organizationTimeZone(
      ctx,
      organizationId,
      locationId,
    );
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
  const edge = status.backfillThroughAt ?? status.syncedThroughAt ?? now;
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
    const [location, master, connection, status, reset, timeZone] =
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
          .query("onlinePosSalesResets")
          .withIndex("by_organizationId_and_locationId", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("locationId", args.locationId),
          )
          .unique(),
        resolveTimeZone(ctx, args.organizationId, args.locationId),
      ]);
    if (
      !location ||
      location.organizationId !== args.organizationId ||
      !master?.enabled ||
      !connection ||
      reset
    ) {
      return null;
    }
    return {
      settings: {
        token: connection.token,
        companyId: connection.companyId,
      },
      timeZone,
      runToken: status?.runToken ?? null,
      syncedThroughAt: status?.syncedThroughAt ?? null,
      backfillThroughAt: status?.backfillThroughAt ?? null,
      reconcileHashes: status?.reconcileHashes ?? [],
      lineIdsScoped: status != null && scopedLineIdsReady(status),
    };
  },
});

export const rerollLocationDayStarts = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    timeZone: v.string(),
    token: v.string(),
    phase: rerollPhaseValidator,
    cursor: v.optional(v.string()),
    retryCount: v.optional(v.number()),
  },
  returns: v.object({ patched: v.number(), done: v.boolean() }),
  handler: async (ctx, args): Promise<{ patched: number; done: boolean }> => {
    const [location, status] = await Promise.all([
      ctx.db.get("locations", args.locationId),
      getStatus(ctx, args.organizationId, args.locationId),
    ]);
    if (
      !location ||
      location.organizationId !== args.organizationId ||
      status?.dayStartRerollToken !== args.token ||
      status.dayStartRerollTimeZone !== args.timeZone
    ) {
      return { patched: 0, done: true };
    }
    const currentTimeZone = await resolveTimeZone(
      ctx,
      args.organizationId,
      args.locationId,
    );
    if (currentTimeZone !== args.timeZone) {
      return { patched: 0, done: true };
    }

    try {
      if (args.phase === "clearDaily") {
        const rows = await ctx.db
          .query("salesDaily")
          .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("locationId", args.locationId),
          )
          .take(RESET_PAGE);
        for (const row of rows) await ctx.db.delete("salesDaily", row._id);
        await ctx.scheduler.runAfter(
          0,
          internal.onlinePosSync.rerollLocationDayStarts,
          {
            ...args,
            phase: rows.length === RESET_PAGE ? "clearDaily" : "rebuildDaily",
            cursor: undefined,
            retryCount: undefined,
          },
        );
        return { patched: 0, done: false };
      }

      const page = await ctx.db
        .query("salesOrders")
        .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("locationId", args.locationId),
        )
        .paginate({ numItems: REROLL_PAGE, cursor: args.cursor ?? null });

      if (args.phase === "orders") {
        let patched = 0;
        for (const order of page.page) {
          const dayStart = dayStartOf(order.occurredAt, args.timeZone);
          if (dayStart === order.dayStart) continue;
          await ctx.db.patch("salesOrders", order._id, { dayStart });
          patched++;
        }
        await ctx.scheduler.runAfter(
          0,
          internal.onlinePosSync.rerollLocationDayStarts,
          {
            ...args,
            phase: page.isDone ? "clearDaily" : "orders",
            cursor: page.isDone ? undefined : page.continueCursor,
            retryCount: undefined,
          },
        );
        return { patched, done: false };
      }

      const dayStarts = new Map<string, number>();
      for (const order of page.page) {
        dayStarts.set(
          dayBucketKey(order.locationId, order.dayStart),
          order.dayStart,
        );
      }
      for (const dayStart of dayStarts.values()) {
        const orders = await ctx.db
          .query("salesOrders")
          .withIndex("by_org_location_day_order_department", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("locationId", args.locationId)
              .eq("dayStart", dayStart),
          )
          .take(MAX_ORDERS_PER_DAY + 1);
        if (orders.length > MAX_ORDERS_PER_DAY) {
          throw new ConvexError(
            "Der er for mange salgsordrer på samme dag til at genopbygge dagsdata",
          );
        }
        const totals = orders.reduce(
          (sum, order) => ({
            revenue: sum.revenue + order.revenue,
            orderCount: sum.orderCount + 1,
            itemCount: sum.itemCount + order.itemCount,
          }),
          { revenue: 0, orderCount: 0, itemCount: 0 },
        );
        const current = await ctx.db
          .query("salesDaily")
          .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("locationId", args.locationId)
              .eq("dayStart", dayStart),
          )
          .unique();
        const values = {
          date: dateKey(dayStart, args.timeZone),
          ...totals,
          updatedAt: Date.now(),
        };
        if (current) await ctx.db.patch("salesDaily", current._id, values);
        else {
          await ctx.db.insert("salesDaily", {
            organizationId: args.organizationId,
            locationId: args.locationId,
            dayStart,
            ...values,
          });
        }
      }
      if (!page.isDone) {
        await ctx.scheduler.runAfter(
          0,
          internal.onlinePosSync.rerollLocationDayStarts,
          { ...args, cursor: page.continueCursor, retryCount: undefined },
        );
        return { patched: 0, done: false };
      }
      const rerollFailed =
        status.dayStartRerollError !== undefined &&
        status.lastError === status.dayStartRerollError;
      await ctx.db.patch("onlinePosSyncStatus", status._id, {
        ...(rerollFailed
          ? { state: "idle" as const, lastError: undefined }
          : {}),
        dayStartRerollToken: undefined,
        dayStartRerollTimeZone: undefined,
        dayStartRerollRetryCount: undefined,
        dayStartRerollError: undefined,
        updatedAt: Date.now(),
      });
      return { patched: 0, done: true };
    } catch (error) {
      const retryCount = (args.retryCount ?? 0) + 1;
      const message =
        error instanceof Error
          ? error.message
          : "Genopbygningen af salgsdata mislykkedes";
      await ctx.db.patch("onlinePosSyncStatus", status._id, {
        ...(retryCount > RECONCILE_MAX_FAIL_RETRIES
          ? { state: "error" as const, lastError: message }
          : {}),
        dayStartRerollRetryCount: retryCount,
        dayStartRerollError: message,
        updatedAt: Date.now(),
      });
      if (retryCount <= RECONCILE_MAX_FAIL_RETRIES) {
        const delay = Math.min(
          RECONCILE_RETRY_BASE_MS * 2 ** (retryCount - 1),
          RECONCILE_RETRY_MAX_MS,
        );
        await ctx.scheduler.runAfter(
          delay,
          internal.onlinePosSync.rerollLocationDayStarts,
          { ...args, retryCount },
        );
      }
      return { patched: 0, done: false };
    }
  },
});

export const resetLocationSales = internalMutation({
  args: { resetId: v.id("onlinePosSalesResets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reset = await ctx.db.get("onlinePosSalesResets", args.resetId);
    if (!reset) return null;

    const lines = await ctx.db
      .query("salesLines")
      .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
        q
          .eq("organizationId", reset.organizationId)
          .eq("locationId", reset.locationId),
      )
      .take(RESET_PAGE);
    for (const line of lines) await ctx.db.delete(line._id);
    if (lines.length === RESET_PAGE) {
      await ctx.scheduler.runAfter(
        0,
        internal.onlinePosSync.resetLocationSales,
        args,
      );
      return null;
    }

    const orders = await ctx.db
      .query("salesOrders")
      .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
        q
          .eq("organizationId", reset.organizationId)
          .eq("locationId", reset.locationId),
      )
      .take(RESET_PAGE);
    for (const order of orders) await ctx.db.delete(order._id);
    if (orders.length === RESET_PAGE) {
      await ctx.scheduler.runAfter(
        0,
        internal.onlinePosSync.resetLocationSales,
        args,
      );
      return null;
    }

    const daily = await ctx.db
      .query("salesDaily")
      .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
        q
          .eq("organizationId", reset.organizationId)
          .eq("locationId", reset.locationId),
      )
      .take(RESET_PAGE);
    for (const row of daily) await ctx.db.delete(row._id);
    if (daily.length === RESET_PAGE) {
      await ctx.scheduler.runAfter(
        0,
        internal.onlinePosSync.resetLocationSales,
        args,
      );
      return null;
    }

    await ctx.db.delete(reset._id);
    const connection = await ctx.db
      .query("onlinePosLocationIntegrations")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q
          .eq("organizationId", reset.organizationId)
          .eq("locationId", reset.locationId),
      )
      .unique();
    if (connection) {
      await ctx.scheduler.runAfter(
        0,
        internal.onlinePosSync.enqueueLocationSync,
        {
          organizationId: reset.organizationId,
          locationId: reset.locationId,
        },
      );
    }
    return null;
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
      await startSync(ctx, connection.organizationId, connection.locationId, {
        mode: args.kind,
      });
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
      if (status.state === "running") return null;
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await getStatus(ctx, args.organizationId, args.locationId);
    if (status?.runToken !== args.runToken) return null;
    const now = Date.now();
    const syncedThroughAt = Math.max(status.syncedThroughAt ?? 0, args.to);
    const updatedStatus = { ...status, syncedThroughAt };

    if (status.pendingReconcileDayStart != null) {
      const token = makeRunToken(now);
      await ctx.db.patch("onlinePosSyncStatus", status._id, {
        syncedThroughAt,
        lastSuccessAt: now,
        lastError: undefined,
        updatedAt: now,
        state: "queued",
        runToken: token,
        lineIdsScoped: scopedLineIdsReady(updatedStatus),
      });
      const timeZone = await organizationTimeZone(
        ctx,
        args.organizationId,
        args.locationId,
      );
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
      state: "running",
      lineIdsScoped: scopedLineIdsReady(updatedStatus),
    });
    await scheduleBackfillIfNeeded(ctx, updatedStatus, args.runToken);
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
    const updatedStatus = {
      ...status,
      backfillThroughAt: args.backfillThroughAt,
    };
    await ctx.db.patch("onlinePosSyncStatus", status._id, {
      backfillThroughAt: args.backfillThroughAt,
      lineIdsScoped: backfillCoversHistory(updatedStatus, now),
      lastSuccessAt: now,
      lastError: undefined,
      updatedAt: now,
    });
    await scheduleBackfillIfNeeded(ctx, updatedStatus, args.runToken);
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
    const timeZone = await resolveTimeZone(
      ctx,
      args.organizationId,
      args.locationId,
    );

    // Compose location-scoped ids at ingest so the parser stays a pure provider map.
    const lines = args.lines.map((line) => ({
      ...line,
      externalId: lineExternalId(args.locationId, line.externalId),
    }));
    for (const line of lines) {
      finiteSalesNumber(line.quantity);
      finiteSalesNumber(line.unitPrice);
      finiteSalesNumber(line.revenue);
      finiteSalesNumber(line.occurredAt);
      finiteSalesNumber(line.orderNumber);
    }

    const knownOrderKeys = new Set<string>();
    const existingLines = new Map<string, ExistingLineState>();
    const existingLineDocs = new Map<string, Doc<"salesLines">>();
    const orderCache = new Map<string, SalesOrderState | null>();

    for (const line of lines) {
      const dayStart = dayStartOf(line.occurredAt, timeZone);
      const key = orderKey(
        args.locationId,
        dayStart,
        line.orderNumber,
        line.department,
      );
      if (!orderCache.has(key)) {
        const order = await ctx.db
          .query("salesOrders")
          .withIndex("by_org_location_day_order_department", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("locationId", args.locationId)
              .eq("dayStart", dayStart)
              .eq("orderNumber", line.orderNumber)
              .eq("department", line.department),
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
        if (!current && !scopedLineIdsReady(status)) {
          const providerId = line.externalId.slice(args.locationId.length + 1);
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
          const currentOrder = await ctx.db.get("salesOrders", current.orderId);
          existingLines.set(line.externalId, {
            revenue: current.revenue,
            quantity: current.quantity,
            locationId: current.locationId,
            dayStart:
              currentOrder?.organizationId === args.organizationId
                ? currentOrder.dayStart
                : dayStartOf(current.occurredAt, timeZone),
            orderNumber:
              currentOrder?.organizationId === args.organizationId
                ? currentOrder.orderNumber
                : line.orderNumber,
            department:
              currentOrder?.organizationId === args.organizationId
                ? currentOrder.department
                : line.department,
          });
          if (currentOrder?.organizationId === args.organizationId) {
            const currentKey = orderKey(
              currentOrder.locationId,
              currentOrder.dayStart,
              currentOrder.orderNumber,
              currentOrder.department,
            );
            if (!orderCache.has(currentKey)) {
              orderCache.set(currentKey, currentOrder);
            }
            knownOrderKeys.add(currentKey);
          }
        }
      }
    }

    const incoming = lines.map((line) => {
      const dayStart = dayStartOf(line.occurredAt, timeZone);
      return {
        externalId: line.externalId,
        orderNumber: line.orderNumber,
        department: line.department,
        locationId: args.locationId as string,
        dayStart,
        revenue: line.revenue,
        quantity: line.quantity,
      };
    });
    const movingLineIdsByOrder = new Map<
      Id<"salesOrders">,
      Set<Id<"salesLines">>
    >();
    const oldOrderKeyById = new Map<Id<"salesOrders">, string>();
    for (const line of incoming) {
      const existing = existingLines.get(line.externalId);
      const existingDoc = existingLineDocs.get(line.externalId);
      if (!existing || !existingDoc) continue;
      const oldKey = orderKey(
        existing.locationId,
        existing.dayStart,
        existing.orderNumber,
        existing.department,
      );
      const nextKey = orderKey(
        line.locationId,
        line.dayStart,
        line.orderNumber,
        line.department,
      );
      if (oldKey === nextKey) continue;
      const ids = movingLineIdsByOrder.get(existingDoc.orderId) ?? new Set();
      ids.add(existingDoc._id);
      movingLineIdsByOrder.set(existingDoc.orderId, ids);
      oldOrderKeyById.set(existingDoc.orderId, oldKey);
    }
    const ordersWithOtherLines = new Set<string>();
    for (const [orderId, movingIds] of movingLineIdsByOrder) {
      const storedLines = await ctx.db
        .query("salesLines")
        .withIndex("by_organizationId_and_orderId", (q) =>
          q.eq("organizationId", args.organizationId).eq("orderId", orderId),
        )
        .take(movingIds.size + 1);
      if (storedLines.some((line) => !movingIds.has(line._id))) {
        ordersWithOtherLines.add(oldOrderKeyById.get(orderId)!);
      }
    }
    const deltas = computeDailySalesDeltas(
      incoming,
      knownOrderKeys,
      existingLines,
      ordersWithOtherLines,
    );

    const now = Date.now();
    const maybeEmptyOrders = new Map<Id<"salesOrders">, string>();
    for (const line of lines) {
      const dayStart = dayStartOf(line.occurredAt, timeZone);
      const key = orderKey(
        args.locationId,
        dayStart,
        line.orderNumber,
        line.department,
      );
      let order = orderCache.get(key) ?? null;
      const existingLine = existingLineDocs.get(line.externalId);

      if (existingLine && existingLine.orderId !== order?._id) {
        const oldOrder = await ctx.db.get("salesOrders", existingLine.orderId);
        if (
          oldOrder &&
          oldOrder.organizationId === args.organizationId &&
          oldOrder.locationId === args.locationId
        ) {
          const nextRevenue = finiteSalesNumber(
            oldOrder.revenue - existingLine.revenue,
          );
          const nextItemCount = finiteSalesNumber(
            oldOrder.itemCount - existingLine.quantity,
          );
          const oldKey = orderKey(
            oldOrder.locationId,
            oldOrder.dayStart,
            oldOrder.orderNumber,
            oldOrder.department,
          );
          await ctx.db.patch("salesOrders", oldOrder._id, {
            revenue: nextRevenue,
            itemCount: nextItemCount,
            updatedAt: now,
          });
          maybeEmptyOrders.set(oldOrder._id, oldKey);
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
            line.department,
          ),
          updatedAt: now,
        });
        order = {
          _id: orderId,
          locationId: args.locationId,
          occurredAt: line.occurredAt,
          dayStart,
          orderNumber: line.orderNumber,
          revenue: line.revenue,
          itemCount: line.quantity,
          paymentType: line.paymentType,
          department: line.department,
          externalId: orderExternalId(
            args.locationId,
            dayStart,
            line.orderNumber,
            line.department,
          ),
          updatedAt: now,
        };
        orderCache.set(key, order);
        knownOrderKeys.add(key);
      } else {
        let revenue = order.revenue;
        let itemCount = order.itemCount;
        if (existingLine && existingLine.orderId === order._id) {
          revenue = finiteSalesNumber(
            revenue + line.revenue - existingLine.revenue,
          );
          itemCount = finiteSalesNumber(
            itemCount + line.quantity - existingLine.quantity,
          );
        } else if (existingLine) {
          revenue = finiteSalesNumber(revenue + line.revenue);
          itemCount = finiteSalesNumber(itemCount + line.quantity);
        } else {
          revenue = finiteSalesNumber(revenue + line.revenue);
          itemCount = finiteSalesNumber(itemCount + line.quantity);
        }
        const nextOccurredAt = Math.min(order.occurredAt, line.occurredAt);
        const externalId = orderExternalId(
          args.locationId,
          dayStart,
          line.orderNumber,
          line.department,
        );
        if (
          order.revenue !== revenue ||
          order.itemCount !== itemCount ||
          order.occurredAt !== nextOccurredAt ||
          order.paymentType !== line.paymentType ||
          order.department !== line.department ||
          order.externalId !== externalId
        ) {
          await ctx.db.patch("salesOrders", order._id, {
            revenue,
            itemCount,
            occurredAt: nextOccurredAt,
            paymentType: line.paymentType,
            department: line.department,
            externalId,
            updatedAt: now,
          });
          order = {
            ...order,
            revenue,
            itemCount,
            occurredAt: nextOccurredAt,
            paymentType: line.paymentType,
            department: line.department,
            externalId,
            updatedAt: now,
          };
          orderCache.set(key, order);
        }
      }

      const targetOrder = order;
      if (!targetOrder) {
        throw new ConvexError("Salgsordren kunne ikke gemmes");
      }

      if (existingLine) {
        if (
          existingLine.orderId !== targetOrder._id ||
          existingLine.occurredAt !== line.occurredAt ||
          existingLine.externalProductId !== line.externalProductId ||
          existingLine.productName !== line.productName ||
          existingLine.quantity !== line.quantity ||
          existingLine.unitPrice !== line.unitPrice ||
          existingLine.revenue !== line.revenue ||
          existingLine.externalId !== line.externalId
        ) {
          await ctx.db.patch("salesLines", existingLine._id, {
            orderId: targetOrder._id,
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
            orderId: targetOrder._id,
            occurredAt: line.occurredAt,
            externalProductId: line.externalProductId,
            productName: line.productName,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            revenue: line.revenue,
            externalId: line.externalId,
          });
        }
      } else {
        await ctx.db.insert("salesLines", {
          organizationId: args.organizationId,
          locationId: args.locationId,
          orderId: targetOrder._id,
          occurredAt: line.occurredAt,
          externalProductId: line.externalProductId,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          revenue: line.revenue,
          source: SOURCE,
          externalId: line.externalId,
        });
      }
      existingLines.set(line.externalId, {
        revenue: line.revenue,
        quantity: line.quantity,
        locationId: args.locationId,
        dayStart,
        orderNumber: line.orderNumber,
        department: line.department,
      });
    }

    for (const [orderId, key] of maybeEmptyOrders) {
      const remainingLine = await ctx.db
        .query("salesLines")
        .withIndex("by_organizationId_and_orderId", (q) =>
          q.eq("organizationId", args.organizationId).eq("orderId", orderId),
        )
        .first();
      if (remainingLine) continue;
      await ctx.db.delete("salesOrders", orderId);
      orderCache.set(key, null);
      knownOrderKeys.delete(key);
    }

    for (const [bucket, delta] of deltas) {
      finiteSalesNumber(delta.revenue);
      finiteSalesNumber(delta.orderCount);
      finiteSalesNumber(delta.itemCount);
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
          revenue: finiteSalesNumber(daily.revenue + delta.revenue),
          orderCount: finiteSalesNumber(daily.orderCount + delta.orderCount),
          itemCount: finiteSalesNumber(daily.itemCount + delta.itemCount),
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("salesDaily", {
          organizationId: args.organizationId,
          locationId: args.locationId,
          dayStart,
          date: dateKey(dayStart, timeZone),
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
    runToken: v.string(),
    dayStart: v.number(),
    timeZone: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const status = await getStatus(ctx, args.organizationId, args.locationId);
    if (status?.runToken !== args.runToken) return false;
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
    return true;
  },
});

export const markReconcilePending = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    runToken: v.string(),
    dayStart: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const status = await getStatus(ctx, args.organizationId, args.locationId);
    if (status?.runToken !== args.runToken) return false;
    await ctx.db.patch("onlinePosSyncStatus", status._id, {
      pendingReconcileDayStart: args.dayStart,
      state: "running",
      updatedAt: Date.now(),
    });
    return true;
  },
});

const deleteDayPageResultValidator = v.object({
  active: v.boolean(),
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
      return { active: false, isDone: true, continueCursor: "" };
    }

    const result = await ctx.db
      .query("salesOrders")
      .withIndex("by_org_location_day_order_department", (q) =>
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
      active: true,
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
    sourceHash: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await getStatus(ctx, args.organizationId, args.locationId);
    if (status?.runToken !== args.runToken) return null;
    const now = Date.now();
    const timeZone = await organizationTimeZone(
      ctx,
      args.organizationId,
      args.locationId,
    );
    const nextDayStart = args.remainingDayStarts[0];
    const reconcileHashes =
      args.sourceHash !== undefined
        ? withReconcileHash(
            status.reconcileHashes,
            args.dayStart,
            args.sourceHash,
          )
        : status.reconcileHashes;

    if (nextDayStart !== undefined) {
      await ctx.db.patch("onlinePosSyncStatus", status._id, {
        pendingReconcileDayStart: nextDayStart,
        state: "queued",
        lastSuccessAt: now,
        lastError: undefined,
        reconcileFailCount: undefined,
        lineIdsScoped: scopedLineIdsReady(status),
        ...(reconcileHashes !== undefined ? { reconcileHashes } : {}),
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

    const syncedThroughAt = Math.max(
      status.syncedThroughAt ?? 0,
      zonedStart(addDateKey(dateKey(args.dayStart, timeZone), 1), timeZone),
    );
    const updatedStatus = { ...status, syncedThroughAt };
    await ctx.db.patch("onlinePosSyncStatus", status._id, {
      pendingReconcileDayStart: undefined,
      state: "idle",
      lastSuccessAt: now,
      lastError: undefined,
      reconcileFailCount: undefined,
      lineIdsScoped: scopedLineIdsReady(updatedStatus),
      ...(reconcileHashes !== undefined ? { reconcileHashes } : {}),
      syncedThroughAt,
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
      const sourceHash = await saleLinesHash(lines);
      const storedHash = context.reconcileHashes.find(
        (entry) => entry.dayStart === args.dayStart,
      )?.hash;
      if (storedHash === sourceHash) {
        await ctx.runMutation(internal.onlinePosSync.completeReconcileDay, {
          organizationId: args.organizationId,
          locationId: args.locationId,
          runToken: args.runToken,
          dayStart: args.dayStart,
          remainingDayStarts: args.remainingDayStarts,
          sourceHash,
        });
        return null;
      }

      const active: boolean = await ctx.runMutation(
        internal.onlinePosSync.markReconcilePending,
        {
          organizationId: args.organizationId,
          locationId: args.locationId,
          runToken: args.runToken,
          dayStart: args.dayStart,
        },
      );
      if (!active) return null;

      let cursor: string | null = null;
      for (;;) {
        const page: {
          active: boolean;
          isDone: boolean;
          continueCursor: string;
        } = await ctx.runMutation(internal.onlinePosSync.deleteDayOrdersPage, {
          organizationId: args.organizationId,
          locationId: args.locationId,
          runToken: args.runToken,
          dayStart: args.dayStart,
          cursor,
        });
        if (!page.active) return null;
        if (page.isDone) break;
        cursor = page.continueCursor;
      }

      const reset: boolean = await ctx.runMutation(
        internal.onlinePosSync.resetDayRollup,
        {
          organizationId: args.organizationId,
          locationId: args.locationId,
          runToken: args.runToken,
          dayStart: args.dayStart,
          timeZone: context.timeZone,
        },
      );
      if (!reset) return null;

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
        sourceHash,
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
      const midReconcile = status.pendingReconcileDayStart != null;
      const reconcileFailCount = midReconcile
        ? (status.reconcileFailCount ?? 0) + 1
        : status.reconcileFailCount;
      await ctx.db.patch("onlinePosSyncStatus", status._id, {
        state: "error",
        lastError: args.message.slice(0, 300),
        updatedAt: now,
        ...(midReconcile ? { reconcileFailCount } : {}),
      });
      // Mid-reconcile holes must not wait for the next cron — retry with backoff.
      if (
        midReconcile &&
        reconcileFailCount != null &&
        reconcileFailCount <= RECONCILE_MAX_FAIL_RETRIES
      ) {
        const delay = Math.min(
          RECONCILE_RETRY_BASE_MS * 2 ** (reconcileFailCount - 1),
          RECONCILE_RETRY_MAX_MS,
        );
        await ctx.scheduler.runAfter(
          delay,
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
