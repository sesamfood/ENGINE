import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { metricRegistry } from "../lib/dashboard/registry";
import {
  dashboardConfigValidator,
  metricIdValidator,
  metricResultValidator,
  visualizationValidator,
} from "./lib/dashboardValidators";
import { dashboardMetricComputers, resolveMetricParams } from "./lib/dashboardMetrics";
import { equalSecrets, hashDashboardPassword } from "./lib/dashboardShareCrypto";
import { rateLimiter } from "./lib/rateLimits";

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

function active(share: Doc<"dashboardShares">) {
  return !share.revokedAt && share.expiresAt > Date.now();
}

async function requireShare(
  ctx: QueryCtx,
  token: string,
  accessKey: string,
) {
  const share = await ctx.db
    .query("dashboardShares")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
  if (!share || !active(share) || !equalSecrets(share.unlockKey, accessKey)) {
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
    if (!share || !active(share)) return null;
    const requiresPassword =
      Boolean(share.passwordHash) ||
      share.widgets.some(
        (widget) => metricRegistry[widget.metricId]?.adminOnly,
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
              (widget) => metricRegistry[widget.metricId]?.adminOnly,
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
  },
  returns: metricResultValidator,
  handler: async (ctx, args) => {
    const share = await requireShare(ctx, args.token, args.accessKey);
    const widget = share.widgets.find(
      (candidate) =>
        candidate.metricId === args.metricId &&
        candidate.visualization === args.visualization,
    );
    const definition = metricRegistry[args.metricId];
    if (!widget || definition.shareable === false) {
      throw new ConvexError("Målingen er ikke en del af delingen");
    }
    // Defense in depth: admin-only metrics never leave a passwordless share,
    // including legacy links created before the createShare password gate.
    if (definition.adminOnly && !share.passwordHash) {
      throw new ConvexError("Målingen er ikke en del af delingen");
    }
    const params = await resolveMetricParams(
      ctx,
      share.organizationId,
      share.scope,
      share.range,
    );
    return await dashboardMetricComputers[args.metricId](ctx, params);
  },
});
