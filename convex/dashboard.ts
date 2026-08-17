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
import type {
  DashboardConfig,
  DashboardScope,
  WidgetInstance,
} from "../lib/dashboard/types";
import {
  dashboardConfigValidator,
  keyedMetricResultValidator,
  metricIdValidator,
  metricRequestValidator,
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
import { hasPermission } from "../lib/auth-permissions";
import type { DataGranularity } from "../lib/auth-permissions";

const MAX_WIDGETS = 24;
const MAX_SHARE_NAME = 100;
const MAX_SHARE_DAYS = 90;
const CLEANUP_PAGE = 50;
const MAX_METRIC_BATCH = 3;

type DashboardAccess = {
  role: string;
  permissions: ReadonlySet<string>;
  granularity: DataGranularity;
};

function canViewSales(auth: DashboardAccess) {
  return (
    hasPermission(auth.role, auth.permissions, "dashboard.viewSales") ||
    hasPermission(auth.role, auth.permissions, "sales.viewAggregate") ||
    hasPermission(auth.role, auth.permissions, "sales.viewDetail")
  );
}

function canViewDetailedSales(auth: DashboardAccess) {
  return (
    hasPermission(auth.role, auth.permissions, "dashboard.viewSales") ||
    hasPermission(auth.role, auth.permissions, "sales.viewDetail")
  );
}

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

function validateWidgets(widgets: WidgetInstance[], canViewSales: boolean) {
  if (widgets.length > MAX_WIDGETS) {
    throw new ConvexError(`Overblikket kan højst have ${MAX_WIDGETS} widgets`);
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
    if (definition.sensitive && !canViewSales) {
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
    const yAxisMin = widget.options?.yAxisMin;
    const yAxisMax = widget.options?.yAxisMax;
    if (
      (yAxisMin !== undefined && !Number.isFinite(yAxisMin)) ||
      (yAxisMax !== undefined && !Number.isFinite(yAxisMax))
    ) {
      throw new ConvexError("Y-aksens grænser skal være gyldige tal");
    }
    if (yAxisMin !== undefined && yAxisMax !== undefined && yAxisMin >= yAxisMax) {
      throw new ConvexError("Y-aksens minimum skal være mindre end maksimum");
    }
  }
}

async function validateScope(
  ctx: MutationCtx,
  organizationId: string,
  scope: DashboardScope,
  allowedLocationScope?: { all: boolean; ids: ReadonlySet<Doc<"locations">["_id"]> },
) {
  if (!scope.level && scope.parentId) {
    throw new ConvexError("Scopeforælderen er ugyldig");
  }
  if (scope.level === "organization" && scope.parentId) {
    throw new ConvexError("Organisationen har ikke en scopeforælder");
  }
  if (scope.level === "market") {
    if (!scope.parentId) throw new ConvexError("Vælg et marked");
    const market = await ctx.db.get("markets", scope.parentId as Id<"markets">);
    if (!market || market.organizationId !== organizationId) {
      throw new ConvexError("Markedet blev ikke fundet");
    }
  }
  if (scope.level === "operator") {
    if (!scope.parentId) throw new ConvexError("Vælg en operatør");
    const operator = await ctx.db.get(
      "operators",
      scope.parentId as Id<"operators">,
    );
    if (!operator || operator.organizationId !== organizationId) {
      throw new ConvexError("Operatøren blev ikke fundet");
    }
  }
  if (scope.level === "location" && scope.parentId) {
    const location = await ctx.db.get(
      "locations",
      scope.parentId as Id<"locations">,
    );
    if (!location || location.organizationId !== organizationId) {
      throw new ConvexError("Lokationen blev ikke fundet");
    }
    if (scope.locationIds && !scope.locationIds.includes(location._id)) {
      throw new ConvexError("Scopeforælderen matcher ikke lokationen");
    }
  }
  if (scope.locationIds === null) return;
  if (scope.locationIds.length === 0 || scope.locationIds.length > 200) {
    throw new ConvexError("Vælg mellem 1 og 200 lokationer");
  }
  if (scope.mode === "compare" && scope.locationIds.length < 2) {
    throw new ConvexError("Vælg mindst to lokationer til sammenligning");
  }
  if (new Set(scope.locationIds).size !== scope.locationIds.length) {
    throw new ConvexError("En lokation må kun vælges én gang");
  }
  if (
    allowedLocationScope &&
    !allowedLocationScope.all &&
    scope.locationIds.some((locationId) => !allowedLocationScope.ids.has(locationId))
  ) {
    throw new ConvexError("Du har ikke adgang til en eller flere lokationer");
  }
  const locations = await Promise.all(scope.locationIds.map((id) => ctx.db.get("locations", id)));
  if (locations.some((location) => location?.organizationId !== organizationId)) {
    throw new ConvexError("Lokationen blev ikke fundet");
  }
  if (scope.level === "market" && scope.parentId && locations.some((location) => location?.marketId !== scope.parentId)) {
    throw new ConvexError("Scope indeholder en lokation uden for markedet");
  }
  if (scope.level === "operator" && scope.parentId && locations.some((location) => location?.operatorId !== scope.parentId)) {
    throw new ConvexError("Scope indeholder en lokation uden for operatøren");
  }
}

const scopeMarketOptionValidator = v.object({
  id: v.id("markets"),
  name: v.string(),
});

const scopeOperatorOptionValidator = v.object({
  id: v.id("operators"),
  name: v.string(),
});

const scopeLocationOptionValidator = v.object({
  id: v.id("locations"),
  name: v.string(),
  marketId: v.union(v.id("markets"), v.null()),
  operatorId: v.union(v.id("operators"), v.null()),
});

const scopeOptionsValidator = v.object({
  markets: v.array(scopeMarketOptionValidator),
  operators: v.array(scopeOperatorOptionValidator),
  locations: v.array(scopeLocationOptionValidator),
});

export const listScopeOptions = query({
  args: {},
  returns: scopeOptionsValidator,
  handler: async (ctx) => {
    const auth = await requireDashboardViewer(ctx);
    const rows = auth.locationScope.all
      ? await ctx.db
          .query("locations")
          .withIndex("by_organizationId_and_normalizedName", (q) =>
            q.eq("organizationId", auth.organizationId),
          )
          .take(200)
      : await Promise.all(
          [...auth.locationScope.ids]
            .slice(0, 200)
            .map((locationId) => ctx.db.get("locations", locationId)),
        );
    const locations = rows.filter(
      (location): location is NonNullable<typeof location> =>
        Boolean(location && location.organizationId === auth.organizationId),
    );
    const marketIds = [...new Set(locations.flatMap((location) => location.marketId ? [location.marketId] : []))];
    const operatorIds = [...new Set(locations.flatMap((location) => location.operatorId ? [location.operatorId] : []))];
    const [markets, operators] = await Promise.all([
      Promise.all(marketIds.map((id) => ctx.db.get("markets", id))),
      Promise.all(operatorIds.map((id) => ctx.db.get("operators", id))),
    ]);
    return {
      markets: markets
        .filter((market) => market?.organizationId === auth.organizationId)
        .map((market) => ({ id: market!._id, name: market!.name })),
      operators: operators
        .filter((operator) => operator?.organizationId === auth.organizationId)
        .map((operator) => ({ id: operator!._id, name: operator!.name })),
      locations: locations.map((location) => ({
        id: location._id,
        name: location.name,
        marketId: location.marketId ?? null,
        operatorId: location.operatorId ?? null,
      })),
    };
  },
});

function configFromDocument(
  document: Doc<"dashboards"> | null,
  canViewSales = true,
  allowedLocationScope?: { all: boolean; ids: ReadonlySet<Doc<"locations">["_id"]> },
): DashboardConfig {
  const widgets = (document?.widgets ?? defaultWidgets).filter(
    (widget) => canViewSales || !metricRegistry[widget.metricId].sensitive,
  );
  const storedScope = document?.scope ?? { mode: "aggregate" as const, locationIds: null };
  const scope =
    storedScope.locationIds === null || !allowedLocationScope
      ? storedScope
      : (() => {
          const locationIds = allowedLocationScope.all
            ? storedScope.locationIds
            : storedScope.locationIds.filter((id) => allowedLocationScope.ids.has(id));
          return locationIds.length
            ? {
                ...storedScope,
                mode:
                  storedScope.mode === "compare" && locationIds.length < 2
                    ? ("aggregate" as const)
                    : storedScope.mode,
                locationIds,
              }
            : { mode: "aggregate" as const, locationIds: null };
        })();
  return document
    ? {
        widgets,
        scope,
        range: document.range,
        updatedAt: document.updatedAt,
      }
    : {
        widgets,
        scope: { mode: "aggregate" as const, locationIds: null },
        range: { preset: "7days" as const },
        updatedAt: null,
  };
}

function markScopeTruncated<T extends { truncated?: boolean }>(
  result: T,
  scopeTruncated?: boolean,
) {
  return scopeTruncated ? { ...result, truncated: true } : result;
}

export const getConfig = query({
  args: {},
  returns: dashboardConfigValidator,
  handler: async (ctx) => {
    const auth = await requireDashboardViewer(ctx);
    const { organizationId, userIdentifier } = auth;
    const dashboard = await ctx.db
      .query("dashboards")
      .withIndex("by_organizationId_and_userIdentifier", (q) =>
        q.eq("organizationId", organizationId).eq("userIdentifier", userIdentifier),
      )
      .unique();
    return configFromDocument(
      dashboard,
      canViewSales(auth),
      auth.locationScope,
    );
  },
});

async function writeConfig(
  ctx: MutationCtx,
  args: {
    widgets: WidgetInstance[];
    scope: DashboardScope;
    range: DashboardConfig["range"];
  },
  expectedUpdatedAt?: number | null,
) {
  const auth = await requireDashboardViewer(ctx);
  const { organizationId, userIdentifier } = auth;
  validateWidgets(
    args.widgets,
    canViewSales(auth),
  );
  await validateScope(ctx, organizationId, args.scope, auth.locationScope);
  const current = await ctx.db
    .query("dashboards")
    .withIndex("by_organizationId_and_userIdentifier", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("userIdentifier", userIdentifier),
    )
    .unique();
  if (
    expectedUpdatedAt !== undefined &&
    (current?.updatedAt ?? null) !== expectedUpdatedAt
  ) {
    throw new ConvexError(
      "Overblikket blev ændret i en anden fane. Dine seneste ændringer blev ikke gemt",
    );
  }
  const updatedAt = Math.max(Date.now(), (current?.updatedAt ?? 0) + 1);
  const data = {
    widgets: args.widgets,
    scope: args.scope,
    range: args.range,
    updatedAt,
  };
  if (current) await ctx.db.patch(current._id, data);
  else {
    await ctx.db.insert("dashboards", {
      organizationId,
      userIdentifier,
      ...data,
    });
  }
  return updatedAt;
}

export const saveConfig = mutation({
  args: {
    widgets: v.array(widgetValidator),
    scope: scopeValidator,
    range: rangeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await writeConfig(ctx, args);
    return null;
  },
});

export const saveConfigRevisioned = mutation({
  args: {
    widgets: v.array(widgetValidator),
    scope: scopeValidator,
    range: rangeValidator,
    expectedUpdatedAt: v.union(v.number(), v.null()),
  },
  returns: v.number(),
  handler: async (ctx, args) =>
    await writeConfig(ctx, args, args.expectedUpdatedAt),
});

export const getMetric = query({
  args: {
    metricId: metricIdValidator,
    visualization: visualizationValidator,
    scope: scopeValidator,
    range: rangeValidator,
    now: v.number(),
  },
  returns: metricResultValidator,
  handler: async (ctx, args) => {
    const auth = await requireDashboardViewer(ctx);
    const { organizationId } = auth;
    const definition = metricRegistry[args.metricId];
    if (!definition.visualizations.includes(args.visualization)) {
      throw new ConvexError("Visualiseringen understøttes ikke af målingen");
    }
    if (
      definition.sensitive &&
      !canViewSales(auth)
    ) {
      throw new ConvexError("Du har ikke adgang til denne måling");
    }
    const params = await resolveMetricParams(
      ctx,
      organizationId,
      args.scope,
      args.range,
      args.now,
      auth.locationScope,
      {
        granularity: auth.granularity,
        anonymousSeed: auth.sessionId,
        salesDetailAllowed: canViewDetailedSales(auth),
      },
    );
    return markScopeTruncated(
      await dashboardMetricComputers[args.metricId](ctx, params),
      params.scopeTruncated,
    );
  },
});

export const getMetrics = query({
  args: {
    widgets: v.array(metricRequestValidator),
    scope: scopeValidator,
    range: rangeValidator,
    now: v.number(),
  },
  returns: v.array(keyedMetricResultValidator),
  handler: async (ctx, args) => {
    const auth = await requireDashboardViewer(ctx);
    const { organizationId } = auth;
    if (
      args.widgets.length > MAX_METRIC_BATCH ||
      new Set(args.widgets.map((widget) => widget.key)).size !==
        args.widgets.length
    ) {
      throw new ConvexError("Widgetgruppen er ugyldig");
    }
    for (const widget of args.widgets) {
      const definition = metricRegistry[widget.metricId];
      if (!definition.visualizations.includes(widget.visualization)) {
        throw new ConvexError("Visualiseringen understøttes ikke af målingen");
      }
      if (
        definition.sensitive &&
        !canViewSales(auth)
      ) {
        throw new ConvexError("Du har ikke adgang til denne måling");
      }
    }
    const params = await resolveMetricParams(
      ctx,
      organizationId,
      args.scope,
      args.range,
      args.now,
      auth.locationScope,
      {
        granularity: auth.granularity,
        anonymousSeed: auth.sessionId,
        salesDetailAllowed: canViewDetailedSales(auth),
      },
    );
    const results = new Map<
      string,
      ReturnType<(typeof dashboardMetricComputers)[keyof typeof dashboardMetricComputers]>
    >();
    for (const widget of args.widgets) {
      if (!results.has(widget.metricId)) {
        results.set(
          widget.metricId,
          dashboardMetricComputers[widget.metricId](ctx, params),
        );
      }
    }
    return await Promise.all(
      args.widgets.map(async (widget) => ({
        key: widget.key,
        result: markScopeTruncated(
          await results.get(widget.metricId)!,
          params.scopeTruncated,
        ),
      })),
    );
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
    granularity: v.optional(
      v.union(
        v.literal("detail"),
        v.literal("aggregate"),
        v.literal("anonymous"),
      ),
    ),
    salesDetailAllowed: v.optional(v.boolean()),
    expiresAt: v.number(),
  },
  returns: v.id("dashboardShares"),
  handler: async (ctx, args) => {
    const shareId = await ctx.db.insert("dashboardShares", args);
    await ctx.scheduler.runAt(args.expiresAt, internal.dashboardShare.expireShare, {
      shareId,
      expiresAt: args.expiresAt,
    });
    return shareId;
  },
});

export const createShare = action({
  args: {
    name: v.string(),
    expiresAt: v.number(),
    password: v.optional(v.string()),
  },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, args) => {
    const auth = await requireDashboardSharer(ctx);
    const { organizationId, userIdentifier } = auth;
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
    const salesAllowed = canViewSales(auth);
    const widgets = source.widgets.filter(
      (widget) =>
        metricRegistry[widget.metricId].shareable !== false &&
        (salesAllowed || !metricRegistry[widget.metricId].sensitive),
    );
    const scope = auth.locationScope.all
      ? source.scope
      : (() => {
          const allowedIds = [...auth.locationScope.ids];
          const locationIds = (source.scope.locationIds ?? allowedIds).filter(
            (locationId) => auth.locationScope.ids.has(locationId),
          );
          if (!locationIds.length) {
            throw new ConvexError("Du har ikke adgang til overblikkets lokationer");
          }
          return {
            ...source.scope,
            mode:
              source.scope.mode === "compare" && locationIds.length >= 2
                ? ("compare" as const)
                : ("aggregate" as const),
            locationIds,
          };
        })();
    // Sensitive metrics stay shareable but never on a passwordless link.
    if (
      !password &&
      widgets.some((widget) => metricRegistry[widget.metricId].sensitive)
    ) {
      throw new ConvexError(
        "Adgangskode er påkrævet, når overblikket indeholder følsomme målinger",
      );
    }
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
      scope,
      range: source.range,
      createdBy: userIdentifier,
      granularity: auth.granularity,
      salesDetailAllowed: canViewDetailedSales(auth),
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
      requiresPassword:
        Boolean(share.passwordHash) ||
        share.widgets.some(
          (widget) => metricRegistry[widget.metricId]?.sensitive,
        ),
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

export const cleanupDeletedLocationDashboards = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("dashboards")
      .withIndex("by_organizationId_and_userIdentifier", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .paginate({ numItems: CLEANUP_PAGE, cursor: args.cursor ?? null });
    for (const dashboard of result.page) {
      if (!dashboard.scope.locationIds?.includes(args.locationId)) continue;
      const locationIds = dashboard.scope.locationIds.filter(
        (locationId) => locationId !== args.locationId,
      );
      await ctx.db.patch(dashboard._id, {
        scope: locationIds.length
          ? {
              mode:
                dashboard.scope.mode === "compare" && locationIds.length < 2
                  ? "aggregate"
                  : dashboard.scope.mode,
              locationIds,
            }
          : { mode: "aggregate", locationIds: null },
        updatedAt: Date.now(),
      });
    }
    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.dashboard.cleanupDeletedLocationDashboards,
        {
          organizationId: args.organizationId,
          locationId: args.locationId,
          cursor: result.continueCursor,
        },
      );
    }
    return null;
  },
});

export const cleanupDeletedLocationShares = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("dashboardShares")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .paginate({ numItems: CLEANUP_PAGE, cursor: args.cursor ?? null });
    for (const share of result.page) {
      if (
        !share.revokedAt &&
        share.scope.locationIds?.includes(args.locationId)
      ) {
        await ctx.db.patch(share._id, { revokedAt: Date.now() });
      }
    }
    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.dashboard.cleanupDeletedLocationShares,
        {
          organizationId: args.organizationId,
          locationId: args.locationId,
          cursor: result.continueCursor,
        },
      );
    }
    return null;
  },
});
