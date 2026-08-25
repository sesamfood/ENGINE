import { ConvexError, v } from "convex/values";
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
  dashboardSummaryTimeZone,
  reconcileDashboardSummary,
  type SummarySource,
} from "./lib/dashboardSummaries";
import type { MetricId } from "../lib/dashboard/types";

const MAX_METRIC_IDS = 24;
const REBUILD_PAGE_SIZE = 100;
const TRANSFER_REBUILD_PAGE_SIZE = 40;
const BUILD_TIMEOUT_MS = 10 * 60 * 1_000;

const sourceByMetric: Partial<Record<MetricId, SummarySource>> = {
  wasteQuantity: "waste",
  wasteRegistrations: "waste",
  badDeliveries: "badDeliveries",
  transfers: "transfers",
  itemsMoved: "transfers",
  staffFoodRegistrations: "staffFood",
  scheduledHours: "scheduledShifts",
};

const sourceMetrics = {
  locationComparison: [
    "waste",
    "badDeliveries",
    "transfers",
    "staffFood",
  ] as const,
};

function requestedSources(metricIds: readonly MetricId[]) {
  const sources = new Set<SummarySource>();
  for (const metricId of metricIds) {
    const source = sourceByMetric[metricId];
    if (source) sources.add(source);
    if (metricId === "locationComparison") {
      for (const comparisonSource of sourceMetrics.locationComparison) {
        sources.add(comparisonSource);
      }
    }
  }
  return [...sources];
}

function newRunToken() {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

export const requestRebuild = mutation({
  args: { metricIds: v.array(metricIdValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireDashboardViewer(ctx);
    if (args.metricIds.length > MAX_METRIC_IDS) {
      throw new ConvexError("For mange dashboardmålinger");
    }
    const sources = requestedSources(args.metricIds);
    if (!sources.length) return null;
    const timeZone = await dashboardSummaryTimeZone(ctx, auth.organizationId);
    const now = Date.now();
    for (const source of sources) {
      const status = await ctx.db
        .query("dashboardSummaryStatuses")
        .withIndex("by_organizationId_and_source", (q) =>
          q.eq("organizationId", auth.organizationId).eq("source", source),
        )
        .unique();
      const buildingStuck =
        status?.state === "building" &&
        now - status.updatedAt > BUILD_TIMEOUT_MS;
      const ready = status?.state === "ready" && status.timeZone === timeZone;
      const buildingCurrent =
        status?.state === "building" &&
        status.timeZone === timeZone &&
        !buildingStuck;
      if (ready || buildingCurrent) {
        continue;
      }
      const runToken = newRunToken();
      if (status) {
        await ctx.db.patch(status._id, {
          timeZone,
          state: "building",
          runToken,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("dashboardSummaryStatuses", {
          organizationId: auth.organizationId,
          source,
          timeZone,
          state: "building",
          runToken,
          updatedAt: now,
        });
      }
      await ctx.scheduler.runAfter(
        0,
        internal.dashboardSummaries.rebuildSource,
        {
          organizationId: auth.organizationId,
          source,
          timeZone,
          runToken,
          cursor: null,
        },
      );
    }
    return null;
  },
});

const rebuildArgs = {
  organizationId: v.string(),
  source: dashboardSummarySourceValidator,
  timeZone: v.string(),
  runToken: v.string(),
  cursor: v.union(v.string(), v.null()),
};

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
    status.timeZone === timeZone
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
  await reconcileDashboardSummary(ctx, "waste", row, next, timeZone);
  await ctx.db.patch(row._id, { dashboardSummaryTimeZone: timeZone });
}

async function rebuildBadDeliveryRow(
  ctx: MutationCtx,
  row: Doc<"badDeliveries">,
  timeZone: string,
) {
  const next = { ...row, dashboardSummaryTimeZone: timeZone };
  await reconcileDashboardSummary(ctx, "badDeliveries", row, next, timeZone);
  await ctx.db.patch(row._id, { dashboardSummaryTimeZone: timeZone });
}

async function rebuildStaffFoodRow(
  ctx: MutationCtx,
  row: Doc<"staffFoodRegistrations">,
  timeZone: string,
) {
  const next = { ...row, dashboardSummaryTimeZone: timeZone };
  await reconcileDashboardSummary(ctx, "staffFood", row, next, timeZone);
  await ctx.db.patch(row._id, { dashboardSummaryTimeZone: timeZone });
}

async function rebuildTransferRow(
  ctx: MutationCtx,
  row: Doc<"transfers">,
  items: readonly Doc<"transferItems">[],
  timeZone: string,
) {
  const next = { ...row, dashboardSummaryTimeZone: timeZone };
  await reconcileDashboardSummary(
    ctx,
    "transfers",
    row,
    next,
    timeZone,
    items,
    items,
  );
  await ctx.db.patch(row._id, { dashboardSummaryTimeZone: timeZone });
}

async function rebuildScheduledShiftRow(
  ctx: MutationCtx,
  row: Doc<"scheduledShifts">,
  timeZone: string,
) {
  const next = { ...row, dashboardSummaryTimeZone: timeZone };
  await reconcileDashboardSummary(ctx, "scheduledShifts", row, next, timeZone);
  await ctx.db.patch(row._id, { dashboardSummaryTimeZone: timeZone });
}
