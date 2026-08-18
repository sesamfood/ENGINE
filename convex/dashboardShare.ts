import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { metricRegistry } from "../lib/dashboard/registry";
import {
  dashboardConfigValidator,
  keyedMetricResultValidator,
  metricIdValidator,
  metricRequestValidator,
  metricResultValidator,
  visualizationValidator,
} from "./lib/dashboardValidators";
import { dashboardMetricComputers, resolveMetricParams } from "./lib/dashboardMetrics";
import {
  customMetricIsSensitive,
  executeCustomMetric,
  validateCustomMetricSpec,
} from "./lib/customMetricExecutor";
import { equalSecrets, hashDashboardPassword } from "./lib/dashboardShareCrypto";
import { rateLimiter } from "./lib/rateLimits";

const MAX_METRIC_BATCH = 3;

const unlockShareValidator = v.union(
  v.object({
    id: v.id("dashboardShares"),
    passwordHash: v.union(v.string(), v.null()),
    passwordSalt: v.union(v.string(), v.null()),
    unlockKey: v.string(),
    expiresAt: v.number(),
    revokedAt: v.union(v.number(), v.null()),
    requiresPassword: v.boolean(),
  }),
  v.null(),
);

function active(share: Doc<"dashboardShares">, now: number) {
  return !share.revokedAt && share.expiresAt > now;
}

export const expireShare = internalMutation({
  args: {
    shareId: v.id("dashboardShares"),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const share = await ctx.db.get("dashboardShares", args.shareId);
    if (share && !share.revokedAt && share.expiresAt === args.expiresAt) {
      await ctx.db.patch(share._id, { revokedAt: args.expiresAt });
    }
    return null;
  },
});

async function requireShare(
  ctx: QueryCtx,
  token: string,
  accessKey: string,
) {
  const share = await ctx.db
    .query("dashboardShares")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (
    !share ||
    !active(share, Date.now()) ||
    !equalSecrets(share.unlockKey, accessKey)
  ) {
    throw new ConvexError("Delingen er udløbet eller ikke tilgængelig");
  }
  return share;
}

export const getPublicMeta = query({
  args: { token: v.string() },
  returns: v.union(
    v.object({
      name: v.string(),
      requiresPassword: v.boolean(),
      expiresAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args): Promise<{
    name: string;
    requiresPassword: boolean;
    expiresAt: number;
  } | null> => {
    const share = await ctx.db
      .query("dashboardShares")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!share || !active(share, Date.now())) return null;
    const requiresPassword =
      Boolean(share.passwordHash) ||
      share.widgets.some(
        (widget) =>
          widget.metric.kind === "custom"
            ? customMetricIsSensitive(
                share.customMetricSnapshots.find(
                  (snapshot) => snapshot.id === widget.metric.id,
                )!.spec,
              )
            : metricRegistry[widget.metric.id]?.sensitive,
      );
    return {
      name: share.name,
      requiresPassword,
      expiresAt: share.expiresAt,
    };
  },
});

export const getShareForUnlock = internalQuery({
  args: { token: v.string() },
  returns: unlockShareValidator,
  handler: async (ctx, args) => {
    const share = await ctx.db
      .query("dashboardShares")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    return share
      ? {
          id: share._id,
          passwordHash: share.passwordHash ?? null,
          passwordSalt: share.passwordSalt ?? null,
          unlockKey: share.unlockKey,
          expiresAt: share.expiresAt,
          revokedAt: share.revokedAt ?? null,
          requiresPassword: Boolean(share.passwordHash) ||
            share.widgets.some(
        (widget) =>
          widget.metric.kind === "custom"
            ? customMetricIsSensitive(
                share.customMetricSnapshots.find(
                  (snapshot) => snapshot.id === widget.metric.id,
                )!.spec,
              )
            : metricRegistry[widget.metric.id]?.sensitive,
            ),
        }
      : null;
  },
});

export const recordShareView = internalMutation({
  args: { shareId: v.id("dashboardShares") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const share = await ctx.db.get("dashboardShares", args.shareId);
    if (share) await ctx.db.patch(share._id, { lastViewedAt: Date.now() });
    return null;
  },
});

export const unlock = action({
  args: { token: v.string(), password: v.string() },
  returns: v.object({ unlockKey: v.string() }),
  handler: async (ctx, args): Promise<{ unlockKey: string }> => {
    const limit = await rateLimiter.limit(ctx, "dashboardShareUnlock", {
      key: args.token,
    });
    if (!limit.ok) {
      throw new ConvexError("For mange forsøg. Vent et øjeblik og prøv igen");
    }
    const share: {
      id: Id<"dashboardShares">;
      passwordHash: string | null;
      passwordSalt: string | null;
      unlockKey: string;
      expiresAt: number;
      revokedAt: number | null;
      requiresPassword: boolean;
    } | null = await ctx.runQuery(internal.dashboardShare.getShareForUnlock, {
      token: args.token,
    });
    if (!share || share.revokedAt || share.expiresAt <= Date.now()) {
      throw new ConvexError("Delingen er udløbet eller ikke tilgængelig");
    }
    if (share.requiresPassword) {
      if (!share.passwordHash || !share.passwordSalt) {
        // Legacy passwordless share that now includes admin-only metrics.
        throw new ConvexError(
          "Denne deling kræver en adgangskode. Opret et nyt delingslink",
        );
      }
      const hash = await hashDashboardPassword(args.password, share.passwordSalt);
      if (!equalSecrets(hash, share.passwordHash)) {
        throw new ConvexError("Adgangskoden er forkert");
      }
    }
    await ctx.runMutation(internal.dashboardShare.recordShareView, {
      shareId: share.id,
    });
    return { unlockKey: share.unlockKey };
  },
});

export const getSharedConfig = query({
  args: { token: v.string(), accessKey: v.string() },
  returns: dashboardConfigValidator,
  handler: async (ctx, args) => {
    const share = await requireShare(ctx, args.token, args.accessKey);
    return {
      widgets: share.widgets,
      scope: share.scope,
      range: share.range,
      updatedAt: share._creationTime,
    };
  },
});

export const getSharedMetric = query({
  args: {
    token: v.string(),
    accessKey: v.string(),
    metricId: metricIdValidator,
    visualization: visualizationValidator,
    now: v.number(),
  },
  returns: metricResultValidator,
  handler: async (ctx, args) => {
    const share = await requireShare(ctx, args.token, args.accessKey);
    const widget = share.widgets.find(
      (candidate) =>
        candidate.metric.kind === "builtin" &&
        candidate.metric.id === args.metricId &&
        candidate.visualization === args.visualization,
    );
    const definition = metricRegistry[args.metricId];
    if (!widget || definition.shareable === false) {
      throw new ConvexError("Målingen er ikke en del af delingen");
    }
    // Defense in depth: admin-only metrics never leave a passwordless share,
    // including legacy links created before the createShare password gate.
    if (definition.sensitive && !share.passwordHash) {
      throw new ConvexError("Målingen er ikke en del af delingen");
    }
    const params = await resolveMetricParams(
      ctx,
      share.organizationId,
      share.scope,
      share.range,
      args.now,
      undefined,
      {
        granularity: share.granularity ?? "detail",
        anonymousSeed: share.token,
        salesDetailAllowed: share.salesDetailAllowed ?? true,
      },
    );
    return await dashboardMetricComputers[args.metricId](ctx, params);
  },
});

export const getSharedMetrics = query({
  args: {
    token: v.string(),
    accessKey: v.string(),
    widgets: v.array(metricRequestValidator),
    now: v.number(),
  },
  returns: v.array(keyedMetricResultValidator),
  handler: async (ctx, args) => {
    const share = await requireShare(ctx, args.token, args.accessKey);
    if (
      args.widgets.length > MAX_METRIC_BATCH ||
      new Set(args.widgets.map((widget) => widget.key)).size !==
        args.widgets.length
    ) {
      throw new ConvexError("Widgetgruppen er ugyldig");
    }
    for (const requested of args.widgets) {
      const widget = share.widgets.find(
        (candidate) =>
          candidate.key === requested.key &&
          candidate.metric.kind === requested.metric.kind &&
          candidate.metric.id === requested.metric.id &&
          candidate.visualization === requested.visualization,
      );
      if (!widget) {
        throw new ConvexError("Målingen er ikke en del af delingen");
      }
      if (requested.metric.kind === "custom") {
        const snapshot = share.customMetricSnapshots.find(
          (candidate) => candidate.id === requested.metric.id,
        );
        if (
          !snapshot ||
          (customMetricIsSensitive(snapshot.spec) && !share.passwordHash) ||
          (requested.visualization === "donut" &&
            (snapshot.spec.kind === "ratio" || !snapshot.spec.dimension))
        ) {
          throw new ConvexError("Målingen er ikke en del af delingen");
        }
        validateCustomMetricSpec(snapshot.spec, share.granularity ?? "detail");
      } else {
        const definition = metricRegistry[requested.metric.id];
        if (
          definition.shareable === false ||
          (definition.sensitive && !share.passwordHash)
        ) {
          throw new ConvexError("Målingen er ikke en del af delingen");
        }
      }
    }
    return await Promise.all(
      args.widgets.map(async (widget) => {
        const params = await resolveMetricParams(
          ctx,
          share.organizationId,
          share.scope,
          widget.range ? { preset: widget.range } : share.range,
          args.now,
          undefined,
          {
            granularity: share.granularity ?? "detail",
            anonymousSeed: share.token,
            salesDetailAllowed: share.salesDetailAllowed ?? true,
          },
        );
        return {
          key: widget.key,
          result:
            widget.metric.kind === "builtin"
              ? await dashboardMetricComputers[widget.metric.id](ctx, params)
              : await executeCustomMetric(
                  ctx,
                  share.customMetricSnapshots.find(
                    (snapshot) => snapshot.id === widget.metric.id,
                  )!.spec,
                  params,
                ),
        };
      }),
    );
  },
});
