import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { defaultWidgets, metricRegistry } from "../lib/dashboard/registry";
import { dashboardColumns, widgetSizeSpans } from "../lib/dashboard/layout";
import type { DashboardConfig, DashboardScope, MetricResult, WidgetInstance } from "../lib/dashboard/types";
import {
  dashboardConfigValidator,
  metricIdValidator,
  metricResultValidator,
  rangeValidator,
  scopeValidator,
  visualizationValidator,
  widgetValidator,
} from "./lib/dashboardValidators";
import {
  dashboardMetricComputers,
  resolveMetricParams,
} from "./lib/dashboardMetrics";
import {
  hashDashboardPassword,
  randomSecret,
} from "./lib/dashboardShareCrypto";
import {
  requireDashboardSharer,
  requireDashboardViewer,
} from "./lib/auth";
import { computeOnlinePosTurnover } from "./onlinePos";

const MAX_WIDGETS = 24;
const MAX_SHARE_NAME = 100;
const MAX_SHARE_DAYS = 90;

const shareSummaryValidator = v.object({
  id: v.id("dashboardShares"),
  name: v.string(),
  token: v.string(),
  expiresAt: v.number(),
  createdAt: v.number(),
  lastViewedAt: v.union(v.number(), v.null()),
  revokedAt: v.union(v.number(), v.null()),
  requiresPassword: v.boolean(),
});

function validateWidgets(widgets: WidgetInstance[], role: string) {
  if (widgets.length > MAX_WIDGETS) {
    throw new ConvexError(`Dashboardet kan højst have ${MAX_WIDGETS} widgets`);
  }
  if (new Set(widgets.map((widget) => widget.key)).size !== widgets.length) {
    throw new ConvexError("Hver widget skal have en unik nøgle");
  }
  const occupied = new Set<string>();
  for (const widget of widgets) {
    if (!widget.key.trim() || widget.key.length > 100) {
      throw new ConvexError("Widgetnøglen er ugyldig");
    }
    const definition = metricRegistry[widget.metricId];
    if (!definition.visualizations.includes(widget.visualization)) {
      throw new ConvexError("Visualiseringen understøttes ikke af målingen");
    }
    if (definition.adminOnly && role !== "admin") {
      throw new ConvexError("Du har ikke adgang til denne måling");
    }
    if (widget.position) {
      const { column, row } = widget.position;
      const span = widgetSizeSpans[widget.size];
      if (!Number.isInteger(column) || !Number.isInteger(row) || column < 0 || row < 0 || row > 100 || column + span.columns > dashboardColumns) {
        throw new ConvexError("Widgetens placering er ugyldig");
      }
      for (let currentRow = row; currentRow < row + span.rows; currentRow += 1) {
        for (let currentColumn = column; currentColumn < column + span.columns; currentColumn += 1) {
          const cell = `${currentColumn}:${currentRow}`;
          if (occupied.has(cell)) throw new ConvexError("Widgets må ikke overlappe hinanden");
          occupied.add(cell);
        }
      }
    }
    const limit = widget.options?.limit;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 50)) {
      throw new ConvexError("Widgetgrænsen skal være mellem 1 og 50");
    }
  }
}

async function validateScope(
  ctx: MutationCtx,
  organizationId: string,
  scope: DashboardScope,
) {
  if (scope.locationIds === null) return;
  if (scope.locationIds.length === 0 || scope.locationIds.length > 200) {
    throw new ConvexError("Vælg mellem 1 og 200 locations");
  }
  if (scope.mode === "compare" && scope.locationIds.length < 2) {
    throw new ConvexError("Vælg mindst to locations til sammenligning");
  }
  if (new Set(scope.locationIds).size !== scope.locationIds.length) {
    throw new ConvexError("En location må kun vælges én gang");
  }
  const locations = await Promise.all(scope.locationIds.map((id) => ctx.db.get("locations", id)));
  if (locations.some((location) => location?.organizationId !== organizationId)) {
    throw new ConvexError("Locationen blev ikke fundet");
  }
}

function configFromDocument(document: Doc<"dashboards"> | null) {
  return document
    ? {
        widgets: document.widgets,
        scope: document.scope,
        range: document.range,
        updatedAt: document.updatedAt,
      }
    : {
        widgets: defaultWidgets,
        scope: { mode: "aggregate" as const, locationIds: null },
        range: { preset: "7days" as const },
        updatedAt: null,
      };
}

export const getConfig = query({
  args: {},
  returns: dashboardConfigValidator,
  handler: async (ctx) => {
    const { organizationId, userIdentifier } = await requireDashboardViewer(ctx);
    const dashboard = await ctx.db
      .query("dashboards")
      .withIndex("by_organizationId_and_userIdentifier", (q) =>
        q.eq("organizationId", organizationId).eq("userIdentifier", userIdentifier),
      )
      .unique();
    return configFromDocument(dashboard);
  },
});

export const saveConfig = mutation({
  args: {
    widgets: v.array(widgetValidator),
    scope: scopeValidator,
    range: rangeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { organizationId, userIdentifier, role } = await requireDashboardViewer(ctx);
    validateWidgets(args.widgets, role);
    await validateScope(ctx, organizationId, args.scope);
    const current = await ctx.db
      .query("dashboards")
      .withIndex("by_organizationId_and_userIdentifier", (q) =>
        q.eq("organizationId", organizationId).eq("userIdentifier", userIdentifier),
      )
      .unique();
    const data = { widgets: args.widgets, scope: args.scope, range: args.range, updatedAt: Date.now() };
    if (current) await ctx.db.patch(current._id, data);
    else await ctx.db.insert("dashboards", { organizationId, userIdentifier, ...data });
    return null;
  },
});

export const getMetric = query({
  args: {
    metricId: metricIdValidator,
    visualization: visualizationValidator,
    scope: scopeValidator,
    range: rangeValidator,
  },
  returns: metricResultValidator,
  handler: async (ctx, args) => {
    const { organizationId, role } = await requireDashboardViewer(ctx);
    const definition = metricRegistry[args.metricId];
    if (!definition.visualizations.includes(args.visualization)) {
      throw new ConvexError("Visualiseringen understøttes ikke af målingen");
    }
    if (definition.adminOnly && role !== "admin") {
      throw new ConvexError("Du har ikke adgang til denne måling");
    }
    if (definition.live) {
      throw new ConvexError("Live-målingen skal opdateres manuelt");
    }
    const params = await resolveMetricParams(ctx, organizationId, args.scope, args.range);
    return await dashboardMetricComputers[args.metricId](ctx, params);
  },
});

export const getLiveMetricContext = internalQuery({
  args: {
    organizationId: v.string(),
    scope: scopeValidator,
    range: rangeValidator,
  },
  returns: v.object({
    organizationId: v.string(),
    locations: v.array(v.object({ id: v.id("locations"), name: v.string() })),
    compare: v.boolean(),
    from: v.number(),
    to: v.number(),
    previousFrom: v.number(),
    previousTo: v.number(),
    timeZone: v.string(),
  }),
  handler: async (ctx, args) => {
    const params = await resolveMetricParams(ctx, args.organizationId, args.scope, args.range);
    return {
      organizationId: params.organizationId,
      locations: params.locations,
      compare: params.compare,
      from: params.from,
      to: params.to,
      previousFrom: params.previousFrom,
      previousTo: params.previousTo,
      timeZone: params.timeZone,
    };
  },
});

export const getLiveMetric = action({
  args: {
    metricId: metricIdValidator,
    visualization: visualizationValidator,
    scope: scopeValidator,
    range: rangeValidator,
  },
  returns: metricResultValidator,
  handler: async (ctx, args): Promise<MetricResult> => {
    const { organizationId, role } = await requireDashboardViewer(ctx);
    if (args.metricId !== "onlinePosTurnover" || role !== "admin") {
      throw new ConvexError("Du har ikke adgang til live-målingen");
    }
    if (!metricRegistry.onlinePosTurnover.visualizations.includes(args.visualization)) {
      throw new ConvexError("Visualiseringen understøttes ikke af målingen");
    }
    const params: {
      organizationId: string;
      locations: Array<{ id: Id<"locations">; name: string }>;
      compare: boolean;
      from: number;
      to: number;
      previousFrom: number;
      previousTo: number;
      timeZone: string;
    } = await ctx.runQuery(internal.dashboard.getLiveMetricContext, {
      organizationId,
      scope: args.scope,
      range: args.range,
    });
    if (params.to - params.from > 31 * 24 * 60 * 60 * 1_000) {
      throw new ConvexError("OnlinePOS kan højst hente 31 dage ad gangen");
    }
    return await computeOnlinePosTurnover(ctx, params);
  },
});

export const getShareSource = internalQuery({
  args: { organizationId: v.string(), userIdentifier: v.string() },
  returns: dashboardConfigValidator,
  handler: async (ctx, args) => {
    const dashboard = await ctx.db
      .query("dashboards")
      .withIndex("by_organizationId_and_userIdentifier", (q) =>
        q.eq("organizationId", args.organizationId).eq("userIdentifier", args.userIdentifier),
      )
      .unique();
    return configFromDocument(dashboard);
  },
});

export const insertShare = internalMutation({
  args: {
    organizationId: v.string(),
    token: v.string(),
    unlockKey: v.string(),
    passwordHash: v.optional(v.string()),
    passwordSalt: v.optional(v.string()),
    name: v.string(),
    widgets: v.array(widgetValidator),
    scope: scopeValidator,
    range: rangeValidator,
    createdBy: v.string(),
    expiresAt: v.number(),
  },
  returns: v.id("dashboardShares"),
  handler: async (ctx, args) => await ctx.db.insert("dashboardShares", args),
});

export const createShare = action({
  args: {
    name: v.string(),
    expiresAt: v.number(),
    password: v.optional(v.string()),
  },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, args) => {
    const { organizationId, userIdentifier } = await requireDashboardSharer(ctx);
    const name = args.name.trim();
    if (!name || name.length > MAX_SHARE_NAME) {
      throw new ConvexError(`Navnet skal være mellem 1 og ${MAX_SHARE_NAME} tegn`);
    }
    const now = Date.now();
    if (!Number.isFinite(args.expiresAt) || args.expiresAt <= now || args.expiresAt > now + MAX_SHARE_DAYS * 24 * 60 * 60 * 1_000) {
      throw new ConvexError(`Delingen skal udløbe inden for ${MAX_SHARE_DAYS} dage`);
    }
    const password = args.password?.trim();
    if (password && (password.length < 4 || password.length > 128)) {
      throw new ConvexError("Adgangskoden skal være mellem 4 og 128 tegn");
    }
    const source: DashboardConfig = await ctx.runQuery(internal.dashboard.getShareSource, {
      organizationId,
      userIdentifier,
    });
    const widgets = source.widgets.filter((widget) => metricRegistry[widget.metricId].shareable !== false);
    const token = randomSecret();
    const unlockKey = randomSecret();
    const passwordSalt = password ? randomSecret(16) : undefined;
    const passwordHash = password && passwordSalt
      ? await hashDashboardPassword(password, passwordSalt)
      : undefined;
    await ctx.runMutation(internal.dashboard.insertShare, {
      organizationId,
      token,
      unlockKey,
      passwordHash,
      passwordSalt,
      name,
      widgets,
      scope: source.scope,
      range: source.range,
      createdBy: userIdentifier,
      expiresAt: args.expiresAt,
    });
    return { token };
  },
});

export const listShares = query({
  args: {},
  returns: v.array(shareSummaryValidator),
  handler: async (ctx) => {
    const { organizationId } = await requireDashboardSharer(ctx);
    const shares = await ctx.db
      .query("dashboardShares")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .take(100);
    return shares.map((share) => ({
      id: share._id,
      name: share.name,
      token: share.token,
      expiresAt: share.expiresAt,
      createdAt: share._creationTime,
      lastViewedAt: share.lastViewedAt ?? null,
      revokedAt: share.revokedAt ?? null,
      requiresPassword: Boolean(share.passwordHash),
    }));
  },
});

export const revokeShare = mutation({
  args: { shareId: v.id("dashboardShares") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireDashboardSharer(ctx);
    const share = await ctx.db.get("dashboardShares", args.shareId);
    if (!share || share.organizationId !== organizationId) {
      throw new ConvexError("Delingen blev ikke fundet");
    }
    if (!share.revokedAt) await ctx.db.patch(share._id, { revokedAt: Date.now() });
    return null;
  },
});
