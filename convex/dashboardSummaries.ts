import { ConvexError, v } from "convex/values";
import { dashboardSummarySourcesFor } from "../lib/dashboard/summary-sources";
import type { MetricId } from "../lib/dashboard/types";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { requireDashboardViewer } from "./lib/auth";
import {
  dashboardSummarySourceValidator,
  metricIdValidator,
} from "./lib/dashboardValidators";
import {
  applyDashboardSummaryDeltas,
  DASHBOARD_SUMMARY_VERSION,
  dashboardSummaryTimeZone,
  reconcileDashboardSummary,
  type SummarySource,
} from "./lib/dashboardSummaries";
import { transferAggregates } from "./lib/transferAggregates";

const MAX_METRIC_IDS = 24;
const REBUILD_PAGE_SIZE = 100;
const TRANSFER_REBUILD_PAGE_SIZE = 40;
const MAX_SUMMARY_DELTAS_PER_FLUSH = 100;
const BUILD_TIMEOUT_MS = 10 * 60 * 1_000;

function newRunToken() {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

export const requestRebuild = mutation({
  args: { metricIds: v.array(metricIdValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireDashboardViewer(ctx);
    await requestDashboardSummaryRebuild(
      ctx,
      auth.organizationId,
      args.metricIds,
    );
    return null;
  },
});

async function scheduleSourceBuild(
  ctx: MutationCtx,
  args: {
    organizationId: string;
    source: SummarySource;
    timeZone: string;
    runToken: string;
  },
) {
  await Promise.all([
    ctx.scheduler.runAfter(0, internal.dashboardSummaries.rebuildSource, {
      ...args,
      cursor: null,
    }),
    ctx.scheduler.runAfter(
      BUILD_TIMEOUT_MS,
      internal.dashboardSummaries.retryStuckSource,
      args,
    ),
  ]);
}

async function startSourceBuild(
  ctx: MutationCtx,
  status: Doc<"dashboardSummaryStatuses"> | null,
  organizationId: string,
  source: SummarySource,
  timeZone: string,
) {
  const runToken = newRunToken();
  const updatedAt = Date.now();
  if (status) {
    await ctx.db.patch(status._id, {
      timeZone,
      version: DASHBOARD_SUMMARY_VERSION,
      state: "building",
      runToken,
      updatedAt,
    });
  } else {
    await ctx.db.insert("dashboardSummaryStatuses", {
      organizationId,
      source,
      timeZone,
      version: DASHBOARD_SUMMARY_VERSION,
      state: "building",
      runToken,
      updatedAt,
    });
  }
  await scheduleSourceBuild(ctx, {
    organizationId,
    source,
    timeZone,
    runToken,
  });
}

export async function requestDashboardSummaryRebuild(
  ctx: MutationCtx,
  organizationId: string,
  metricIds: readonly MetricId[],
) {
  if (metricIds.length > MAX_METRIC_IDS) {
    throw new ConvexError("For mange dashboardmålinger");
  }
  const sources = dashboardSummarySourcesFor(metricIds);
  if (!sources.length) return;
  const timeZone = await dashboardSummaryTimeZone(ctx, organizationId);
  const now = Date.now();
  for (const source of sources) {
    const status = await ctx.db
      .query("dashboardSummaryStatuses")
      .withIndex("by_organizationId_and_source", (q) =>
        q.eq("organizationId", organizationId).eq("source", source),
      )
      .unique();
    const buildingCurrent =
      status?.state === "building" &&
      status.timeZone === timeZone &&
      status.version === DASHBOARD_SUMMARY_VERSION &&
      now - status.updatedAt <= BUILD_TIMEOUT_MS;
    const ready =
      status?.state === "ready" &&
      status.timeZone === timeZone &&
      status.version === DASHBOARD_SUMMARY_VERSION;
    if (ready || buildingCurrent) continue;
    await startSourceBuild(ctx, status, organizationId, source, timeZone);
  }
}

const rebuildArgs = {
  organizationId: v.string(),
  source: dashboardSummarySourceValidator,
  timeZone: v.string(),
  runToken: v.string(),
  cursor: v.union(v.string(), v.null()),
};

export const retryStuckSource = internalMutation({
  args: {
    organizationId: v.string(),
    source: dashboardSummarySourceValidator,
    timeZone: v.string(),
    runToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await currentBuildStatus(
      ctx,
      args.organizationId,
      args.source,
      args.timeZone,
      args.runToken,
    );
    if (!status) return null;
    const elapsed = Date.now() - status.updatedAt;
    if (elapsed < BUILD_TIMEOUT_MS) {
      await ctx.scheduler.runAfter(
        BUILD_TIMEOUT_MS - elapsed,
        internal.dashboardSummaries.retryStuckSource,
        args,
      );
      return null;
    }
    const timeZone = await dashboardSummaryTimeZone(ctx, args.organizationId);
    await startSourceBuild(
      ctx,
      status,
      args.organizationId,
      args.source,
      timeZone,
    );
    return null;
  },
});

export const flushSummaryDeltas = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("dashboardSummaryDeltas")
      .take(MAX_SUMMARY_DELTAS_PER_FLUSH + 1);
    const batch: typeof rows = [];
    let deltaCount = 0;
    for (const row of rows) {
      if (
        batch.length > 0 &&
        deltaCount + row.deltas.length > MAX_SUMMARY_DELTAS_PER_FLUSH
      ) {
        break;
      }
      batch.push(row);
      deltaCount += row.deltas.length;
    }
    await applyDashboardSummaryDeltas(
      ctx,
      batch.flatMap((row) => row.deltas),
    );
    for (const row of batch) {
      await ctx.db.delete(row._id);
    }
    if (batch.length < rows.length) {
      await ctx.scheduler.runAfter(
        0,
        internal.dashboardSummaries.flushSummaryDeltas,
        {},
      );
    }
    return null;
  },
});

async function currentBuildStatus(
  ctx: MutationCtx,
  organizationId: string,
  source: SummarySource,
  timeZone: string,
  runToken: string,
) {
  const status = await ctx.db
    .query("dashboardSummaryStatuses")
    .withIndex("by_organizationId_and_source", (q) =>
      q.eq("organizationId", organizationId).eq("source", source),
    )
    .unique();
  return status &&
    status.state === "building" &&
    status.runToken === runToken &&
    status.timeZone === timeZone &&
    status.version === DASHBOARD_SUMMARY_VERSION
    ? status
    : null;
}

async function scheduleBuildPage(
  ctx: MutationCtx,
  args: {
    organizationId: string;
    source: SummarySource;
    timeZone: string;
    runToken: string;
    cursor: string | null;
  },
) {
  await ctx.scheduler.runAfter(
    0,
    internal.dashboardSummaries.rebuildSource,
    args,
  );
}

export const rebuildSource = internalMutation({
  args: rebuildArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await currentBuildStatus(
      ctx,
      args.organizationId,
      args.source,
      args.timeZone,
      args.runToken,
    );
    if (!status) return null;

    const pageSize =
      args.source === "transfers"
        ? TRANSFER_REBUILD_PAGE_SIZE
        : REBUILD_PAGE_SIZE;
    if (args.source === "waste") {
      const result = await ctx.db
        .query("wasteRegistrations")
        .withIndex("by_org_and_time", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .paginate({
          numItems: pageSize,
          cursor: args.cursor,
          maximumRowsRead: pageSize,
        });
      for (const row of result.page) {
        await rebuildWasteRow(ctx, row, args.timeZone);
      }
      await finishOrContinue(
        ctx,
        status._id,
        args,
        result.isDone,
        result.continueCursor,
      );
      return null;
    }
    if (args.source === "badDeliveries") {
      const result = await ctx.db
        .query("badDeliveries")
        .withIndex("by_organizationId_and_registeredAt", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .paginate({
          numItems: pageSize,
          cursor: args.cursor,
          maximumRowsRead: pageSize,
        });
      for (const row of result.page) {
        await rebuildBadDeliveryRow(ctx, row, args.timeZone);
      }
      await finishOrContinue(
        ctx,
        status._id,
        args,
        result.isDone,
        result.continueCursor,
      );
      return null;
    }
    if (args.source === "staffFood") {
      const result = await ctx.db
        .query("staffFoodRegistrations")
        .withIndex("by_organizationId_and_registeredAt", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .paginate({
          numItems: pageSize,
          cursor: args.cursor,
          maximumRowsRead: pageSize,
        });
      for (const row of result.page) {
        await rebuildStaffFoodRow(ctx, row, args.timeZone);
      }
      await finishOrContinue(
        ctx,
        status._id,
        args,
        result.isDone,
        result.continueCursor,
      );
      return null;
    }
    if (args.source === "transfers") {
      const result = await ctx.db
        .query("transfers")
        .withIndex("by_organizationId_and_transferredAt", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .paginate({
          numItems: pageSize,
          cursor: args.cursor,
          maximumRowsRead: pageSize,
        });
      for (const row of result.page) {
        const items = await ctx.db
          .query("transferItems")
          .withIndex("by_organizationId_and_transferId", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("transferId", row._id),
          )
          .take(201);
        if (items.length > 200) {
          throw new ConvexError("Transferen har for mange produktlinjer");
        }
        await rebuildTransferRow(ctx, row, items, args.timeZone);
      }
      await finishOrContinue(
        ctx,
        status._id,
        args,
        result.isDone,
        result.continueCursor,
      );
      return null;
    }

    const result = await ctx.db
      .query("scheduledShifts")
      .withIndex("by_organizationId_and_startsAt", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .paginate({
        numItems: pageSize,
        cursor: args.cursor,
        maximumRowsRead: pageSize,
      });
    for (const row of result.page) {
      await rebuildScheduledShiftRow(ctx, row, args.timeZone);
    }
    await finishOrContinue(
      ctx,
      status._id,
      args,
      result.isDone,
      result.continueCursor,
    );
    return null;
  },
});

async function finishOrContinue(
  ctx: MutationCtx,
  statusId: Doc<"dashboardSummaryStatuses">["_id"],
  args: {
    organizationId: string;
    source: SummarySource;
    timeZone: string;
    runToken: string;
    cursor: string | null;
  },
  isDone: boolean,
  continueCursor: string,
) {
  await ctx.db.patch(statusId, {
    state: isDone ? "ready" : "building",
    runToken: isDone ? undefined : args.runToken,
    updatedAt: Date.now(),
  });
  if (!isDone) {
    await scheduleBuildPage(ctx, {
      ...args,
      cursor: continueCursor,
    });
  }
}

async function rebuildWasteRow(
  ctx: MutationCtx,
  row: Doc<"wasteRegistrations">,
  timeZone: string,
) {
  const next = { ...row, dashboardSummaryTimeZone: timeZone };
  await reconcileDashboardSummary(
    ctx,
    "waste",
    row,
    next,
    timeZone,
    undefined,
    undefined,
    { immediate: true },
  );
  await ctx.db.patch(row._id, { dashboardSummaryTimeZone: timeZone });
}

async function rebuildBadDeliveryRow(
  ctx: MutationCtx,
  row: Doc<"badDeliveries">,
  timeZone: string,
) {
  const next = { ...row, dashboardSummaryTimeZone: timeZone };
  await reconcileDashboardSummary(
    ctx,
    "badDeliveries",
    row,
    next,
    timeZone,
    undefined,
    undefined,
    { immediate: true },
  );
  await ctx.db.patch(row._id, { dashboardSummaryTimeZone: timeZone });
}

async function rebuildStaffFoodRow(
  ctx: MutationCtx,
  row: Doc<"staffFoodRegistrations">,
  timeZone: string,
) {
  const next = { ...row, dashboardSummaryTimeZone: timeZone };
  await reconcileDashboardSummary(
    ctx,
    "staffFood",
    row,
    next,
    timeZone,
    undefined,
    undefined,
    { immediate: true },
  );
  await ctx.db.patch(row._id, { dashboardSummaryTimeZone: timeZone });
}

async function rebuildTransferRow(
  ctx: MutationCtx,
  row: Doc<"transfers">,
  items: readonly Doc<"transferItems">[],
  timeZone: string,
) {
  const aggregates = transferAggregates(items);
  const next = {
    ...row,
    ...aggregates,
    dashboardSummaryTimeZone: timeZone,
  };
  await reconcileDashboardSummary(
    ctx,
    "transfers",
    row,
    next,
    timeZone,
    items,
    items,
    { immediate: true },
  );
  await ctx.db.patch(row._id, {
    ...aggregates,
    dashboardSummaryTimeZone: timeZone,
  });
}

async function rebuildScheduledShiftRow(
  ctx: MutationCtx,
  row: Doc<"scheduledShifts">,
  timeZone: string,
) {
  const next = { ...row, dashboardSummaryTimeZone: timeZone };
  await reconcileDashboardSummary(
    ctx,
    "scheduledShifts",
    row,
    next,
    timeZone,
    undefined,
    undefined,
    { immediate: true },
  );
  await ctx.db.patch(row._id, { dashboardSummaryTimeZone: timeZone });
}
