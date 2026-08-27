import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  defaultWidgets,
  metricRegistry,
  type MetricSource,
} from "../lib/dashboard/registry";
import { dashboardDatasets } from "../lib/dashboard/datasets";
import { dashboardColumns, widgetSizeSpans } from "../lib/dashboard/layout";
import type {
  DashboardConfig,
  DashboardScope,
  SalesSource,
  WidgetInstance,
} from "../lib/dashboard/types";
import {
  customMetricSpecValidator,
  keyedMetricResultValidator,
  metricIdValidator,
  metricRequestValidator,
  metricResultValidator,
  rangeValidator,
  salesSourceValidator,
  scopeValidator,
  visualizationValidator,
  widgetValidator,
} from "./lib/dashboardValidators";
import {
  createMetricParamsResolver,
  dashboardMetricComputers,
  resolveBuiltinSalesSource,
  resolveMetricParams,
  salesSourceProviders,
} from "./lib/dashboardMetrics";
import {
  customMetricIsSensitive,
  executeCustomMetric,
  validateCustomMetricSpec,
} from "./lib/customMetricExecutor";
import {
  hashDashboardPassword,
  randomSecret,
} from "./lib/dashboardShareCrypto";
import {
  requireDashboardSharer,
  requireDashboardManager,
  requireDashboardViewer,
  requireHumanPrincipal,
  requireIntegrationManager,
} from "./lib/auth";
import {
  hasPermission,
  systemRoleKeys,
  systemRoleNames,
} from "../lib/auth-permissions";
import type { DataGranularity } from "../lib/auth-permissions";
import { rateLimiter } from "./lib/rateLimits";
import { requestWorkfeedEmployeeSync } from "./lib/workfeedSyncRequest";

const MAX_WIDGETS = 24;
const MAX_DASHBOARDS = 8;
const MAX_SHARE_NAME = 100;
const MAX_SHARE_DAYS = 90;
const CLEANUP_PAGE = 50;
const MAX_METRIC_BATCH = 3;

const dashboardSyncStateValidator = v.union(
  v.literal("queued"),
  v.literal("alreadyQueued"),
  v.literal("rateLimited"),
  v.literal("unavailable"),
);

const dashboardSyncSourceResultValidator = v.object({
  state: dashboardSyncStateValidator,
  retryAt: v.union(v.number(), v.null()),
});

const dashboardSyncResultValidator = v.object({
  onlinePos: v.union(dashboardSyncSourceResultValidator, v.null()),
  workfeed: v.union(dashboardSyncSourceResultValidator, v.null()),
});

type ExternalMetricSource = Exclude<MetricSource, "internal">;
type DashboardSyncSourceResult = {
  state: "queued" | "alreadyQueued" | "rateLimited" | "unavailable";
  retryAt: number | null;
};

type DashboardAccess = {
  role: string;
  permissions: ReadonlySet<string>;
  granularity: DataGranularity;
};

type BuiltinMetricId = Extract<
  WidgetInstance["metric"],
  { kind: "builtin" }
>["id"];

function customMetricAllowed(
  auth: DashboardAccess,
  spec: Doc<"customMetrics">["spec"],
) {
  try {
    validateCustomMetricSpec(spec, auth.granularity);
  } catch {
    return false;
  }
  const queries =
    spec.kind === "single" ? [spec.query] : [spec.numerator, spec.denominator];
  return queries.every((querySpec) => {
    const dataset = dashboardDatasets[querySpec.dataset];
    const permission = dataset.permission;
    if (!permission) return true;
    if (dataset.source === "wolt") {
      return hasPermission(auth.role, auth.permissions, "sales.viewDetail");
    }
    return (
      hasPermission(auth.role, auth.permissions, "dashboard.viewSales") ||
      hasPermission(auth.role, auth.permissions, permission) ||
      (permission === "sales.viewAggregate" &&
        hasPermission(auth.role, auth.permissions, "sales.viewDetail"))
    );
  });
}

function canViewSales(auth: DashboardAccess) {
  return (
    hasPermission(auth.role, auth.permissions, "dashboard.viewSales") ||
    hasPermission(auth.role, auth.permissions, "sales.viewAggregate") ||
    hasPermission(auth.role, auth.permissions, "sales.viewDetail")
  );
}

function canViewWoltSales(auth: DashboardAccess) {
  return (
    hasPermission(auth.role, auth.permissions, "sales.viewAggregate") ||
    hasPermission(auth.role, auth.permissions, "sales.viewDetail")
  );
}

function canViewBuiltinMetric(
  auth: DashboardAccess,
  metricId: BuiltinMetricId,
  salesSource?: SalesSource,
) {
  const definition = metricRegistry[metricId];
  if (!definition.sensitive) return true;
  const usesWolt =
    definition.source === "wolt" ||
    (salesSource !== undefined && salesSourceProviders(salesSource).includes("wolt"));
  return usesWolt ? canViewWoltSales(auth) : canViewSales(auth);
}

function canViewDetailedSales(auth: DashboardAccess) {
  return (
    hasPermission(auth.role, auth.permissions, "dashboard.viewSales") ||
    hasPermission(auth.role, auth.permissions, "sales.viewDetail")
  );
}

const shareSummaryValidator = v.object({
  id: v.id("dashboardShares"),
  dashboardId: v.id("dashboards"),
  dashboardName: v.string(),
  name: v.string(),
  token: v.string(),
  expiresAt: v.number(),
  createdAt: v.number(),
  lastViewedAt: v.union(v.number(), v.null()),
  revokedAt: v.union(v.number(), v.null()),
  requiresPassword: v.boolean(),
});

const customMetricSnapshotValidator = v.object({
  id: v.id("customMetrics"),
  name: v.string(),
  spec: customMetricSpecValidator,
});

const shareSourceValidator = v.object({
  widgets: v.array(widgetValidator),
  scope: scopeValidator,
  range: rangeValidator,
  updatedAt: v.number(),
  roleIds: v.array(v.string()),
  customMetricSnapshots: v.array(customMetricSnapshotValidator),
});

async function validateWidgets(
  ctx: MutationCtx,
  organizationId: string,
  widgets: WidgetInstance[],
  auth: DashboardAccess,
) {
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
    if (widget.metric.kind === "builtin") {
      const definition = metricRegistry[widget.metric.id];
      const salesSource = resolveBuiltinSalesSource(
        widget.metric.id,
        widget.options?.salesSource,
      );
      if (!definition.visualizations.includes(widget.visualization)) {
        throw new ConvexError("Visualiseringen understøttes ikke af målingen");
      }
      if (!canViewBuiltinMetric(auth, widget.metric.id, salesSource)) {
        throw new ConvexError("Du har ikke adgang til denne måling");
      }
    } else {
      const metric = await ctx.db.get("customMetrics", widget.metric.id);
      if (!metric || metric.organizationId !== organizationId) {
        throw new ConvexError("Målingen blev ikke fundet");
      }
      if (!customMetricAllowed(auth, metric.spec)) {
        throw new ConvexError("Du har ikke adgang til denne måling");
      }
      if (
        widget.visualization === "donut" &&
        (metric.spec.kind === "ratio" || !metric.spec.dimension)
      ) {
        throw new ConvexError("Visualiseringen understøttes ikke af målingen");
      }
      if (
        (widget.visualization === "list" ||
          widget.visualization === "table") &&
        !metric.spec.dimension
      ) {
        throw new ConvexError("Visualiseringen kræver en dimension");
      }
      if (widget.options?.salesSource !== undefined) {
        throw new ConvexError("Salgskilden kan kun bruges på salgsmålinger");
      }
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
    throw new ConvexError("Vælg marked, operatør eller lokation igen");
  }
  if (scope.level === "organization" && scope.parentId) {
    throw new ConvexError(
      "Organisationen kan ikke kombineres med et marked, en operatør eller en lokation",
    );
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
      throw new ConvexError("Den valgte lokation matcher ikke lokationsvalget");
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
    throw new ConvexError("En valgt lokation ligger uden for markedet");
  }
  if (scope.level === "operator" && scope.parentId && locations.some((location) => location?.operatorId !== scope.parentId)) {
    throw new ConvexError("En valgt lokation ligger uden for operatøren");
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

const salesSourceAvailabilityValidator = v.object({
  onlinePos: v.boolean(),
  wolt: v.boolean(),
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

export const salesSourceAvailability = query({
  args: { scope: scopeValidator },
  returns: salesSourceAvailabilityValidator,
  handler: async (ctx, args) => {
    const auth = await requireDashboardViewer(ctx);
    const params = await resolveMetricParams(
      ctx,
      auth.organizationId,
      args.scope,
      { preset: "today" },
      Date.now(),
      auth.locationScope,
    );
    const [onlinePosIntegration, onlinePosConnections, woltIntegration, woltConnections] =
      await Promise.all([
        ctx.db
          .query("onlinePosIntegrations")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", auth.organizationId),
          )
          .unique(),
        Promise.all(
          params.locations.map((location) =>
            ctx.db
              .query("onlinePosLocationIntegrations")
              .withIndex("by_organizationId_and_locationId", (q) =>
                q
                  .eq("organizationId", auth.organizationId)
                  .eq("locationId", location.id),
              )
              .unique(),
          ),
        ),
        ctx.db
          .query("woltIntegrations")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", auth.organizationId),
          )
          .unique(),
        Promise.all(
          params.locations.map((location) =>
            ctx.db
              .query("woltVenueConnections")
              .withIndex("by_organizationId_and_locationId", (q) =>
                q
                  .eq("organizationId", auth.organizationId)
                  .eq("locationId", location.id),
              )
              .unique(),
          ),
        ),
      ]);
    return {
      onlinePos:
        onlinePosIntegration?.enabled === true &&
        onlinePosConnections.some(Boolean),
      wolt:
        canViewWoltSales(auth) &&
        woltIntegration?.enabled !== false &&
        woltConnections.some((connection) => connection?.state === "ready"),
    };
  },
});

export const listRoleOptions = query({
  args: {},
  returns: v.array(v.object({ role: v.string(), name: v.string() })),
  handler: async (ctx) => {
    const auth = await requireDashboardManager(ctx);
    const roles = await ctx.db
      .query("roles")
      .withIndex("by_organizationId_and_key", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .take(100);
    const byKey = new Map(roles.map((role) => [role.key, role.name]));
    return [
      ...systemRoleKeys.map((role) => ({
        role,
        name: byKey.get(role) ?? systemRoleNames[role],
      })),
      ...roles
        .filter((role) => !systemRoleKeys.includes(role.key as never))
        .map((role) => ({ role: role.key, name: role.name })),
    ];
  },
});

const dashboardValidator = v.object({
  id: v.id("dashboards"),
  name: v.string(),
  widgets: v.array(widgetValidator),
  defaultScope: scopeValidator,
  defaultRange: rangeValidator,
  roleIds: v.array(v.string()),
  defaultForRoleIds: v.array(v.string()),
  defaultForLocationIds: v.array(v.id("locations")),
  isOrganizationDefault: v.boolean(),
  sortOrder: v.number(),
  updatedAt: v.number(),
});

const dashboardListValidator = v.object({
  dashboards: v.array(dashboardValidator),
  role: v.string(),
  singleLocationId: v.union(v.id("locations"), v.null()),
});

function normalizeDashboardName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 100) {
    throw new ConvexError("Navnet skal være mellem 1 og 100 tegn");
  }
  return { name, normalizedName: name.toLocaleLowerCase("da") };
}

function dashboardResult(dashboard: Doc<"dashboards">) {
  return {
    id: dashboard._id,
    name: dashboard.name,
    widgets: dashboard.widgets,
    defaultScope: dashboard.defaultScope,
    defaultRange: dashboard.defaultRange,
    roleIds: dashboard.roleIds,
    defaultForRoleIds: dashboard.defaultForRoleIds,
    defaultForLocationIds: dashboard.defaultForLocationIds,
    isOrganizationDefault: dashboard.isOrganizationDefault,
    sortOrder: dashboard.sortOrder,
    updatedAt: dashboard.updatedAt,
  };
}

function roleAllowsDashboard(dashboard: Doc<"dashboards">, role: string) {
  return dashboard.roleIds.length === 0 || dashboard.roleIds.includes(role);
}

async function availableWidgets(
  ctx: QueryCtx | MutationCtx,
  auth: DashboardAccess & { organizationId: string },
  widgets: WidgetInstance[],
) {
  return (
    await Promise.all(
      widgets.map(async (widget) => {
        if (widget.metric.kind === "builtin") {
          const salesSource = resolveBuiltinSalesSource(
            widget.metric.id,
            widget.options?.salesSource,
          );
          return canViewBuiltinMetric(auth, widget.metric.id, salesSource)
            ? widget
            : null;
        }
        const metric = await ctx.db.get("customMetrics", widget.metric.id);
        return metric &&
          metric.organizationId === auth.organizationId &&
          customMetricAllowed(auth, metric.spec)
          ? widget
          : null;
      }),
    )
  ).filter((widget): widget is WidgetInstance => widget !== null);
}

async function dashboardExternalSources(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  widgets: WidgetInstance[],
) {
  const sources = new Set<ExternalMetricSource>();
  for (const widget of widgets) {
    if (widget.metric.kind === "builtin") {
      const selectedSalesSource = resolveBuiltinSalesSource(
        widget.metric.id,
        widget.options?.salesSource,
      );
      const providerSources = selectedSalesSource
        ? salesSourceProviders(selectedSalesSource)
        : [metricRegistry[widget.metric.id].source];
      for (const source of providerSources) {
        if (source !== "internal") sources.add(source);
      }
      continue;
    }

    const metric = await ctx.db.get("customMetrics", widget.metric.id);
    if (!metric || metric.organizationId !== organizationId) continue;
    const querySpecs = metric.spec.kind === "single"
      ? [metric.spec.query]
      : [metric.spec.numerator, metric.spec.denominator];
    for (const querySpec of querySpecs) {
      const source = dashboardDatasets[querySpec.dataset].source;
      if (source !== "internal") sources.add(source);
    }
  }
  return sources;
}

async function requestOnlinePosDashboardSync(
  ctx: MutationCtx,
  organizationId: string,
  locationIds: readonly Id<"locations">[],
  syncWholeOrganization: boolean,
): Promise<DashboardSyncSourceResult> {
  if (!syncWholeOrganization && locationIds.length === 0) {
    return { state: "unavailable", retryAt: null };
  }
  const integration = await ctx.db
    .query("onlinePosIntegrations")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .unique();
  if (!integration?.enabled) {
    return { state: "unavailable", retryAt: null };
  }
  const connectedLocationIds = syncWholeOrganization
    ? []
    : (
        await Promise.all(
          [...new Set(locationIds)].map(async (locationId) => {
            const connection = await ctx.db
              .query("onlinePosLocationIntegrations")
              .withIndex("by_organizationId_and_locationId", (q) =>
                q
                  .eq("organizationId", organizationId)
                  .eq("locationId", locationId),
              )
              .unique();
            return connection ? locationId : null;
          }),
        )
      ).filter((locationId): locationId is Id<"locations"> => locationId !== null);
  const hasConnection = syncWholeOrganization
    ? Boolean(
        await ctx.db
          .query("onlinePosLocationIntegrations")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", organizationId),
          )
          .first(),
      )
    : connectedLocationIds.length > 0;
  if (!hasConnection) {
    return { state: "unavailable", retryAt: null };
  }
  const limit = await rateLimiter.limit(ctx, "manualSalesSync", {
    key: organizationId,
  });
  if (!limit.ok) {
    return {
      state: "rateLimited",
      retryAt: Date.now() + (limit.retryAfter ?? 0),
    };
  }
  if (syncWholeOrganization) {
    await ctx.scheduler.runAfter(
      0,
      internal.onlinePosSync.enqueueOrganizationSync,
      { organizationId },
    );
  } else {
    for (const locationId of connectedLocationIds) {
      await ctx.scheduler.runAfter(
        0,
        internal.onlinePosSync.enqueueLocationSync,
        { organizationId, locationId },
      );
    }
  }
  return { state: "queued", retryAt: null };
}

function scopedDefault(
  scope: DashboardScope,
  allowedLocationScope: {
    all: boolean;
    ids: ReadonlySet<Doc<"locations">["_id"]>;
  },
) {
  if (scope.locationIds === null || allowedLocationScope.all) return scope;
  const locationIds = scope.locationIds.filter((id) =>
    allowedLocationScope.ids.has(id),
  );
  if (!locationIds.length) {
    return { mode: "aggregate" as const, locationIds: null };
  }
  return {
    ...scope,
    mode:
      scope.mode === "compare" && locationIds.length < 2
        ? ("aggregate" as const)
        : scope.mode,
    locationIds,
  };
}

async function organizationDashboards(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
) {
  return await ctx.db
    .query("dashboards")
    .withIndex("by_organizationId_and_sortOrder", (q) =>
      q.eq("organizationId", organizationId),
    )
    .take(MAX_DASHBOARDS + 1);
}

async function requireOrganizationDashboard(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  dashboardId: Id<"dashboards">,
) {
  const dashboard = await ctx.db.get("dashboards", dashboardId);
  if (!dashboard || dashboard.organizationId !== organizationId) {
    throw new ConvexError("Dashboardet blev ikke fundet");
  }
  return dashboard;
}

async function validateRoleKeys(
  ctx: MutationCtx,
  organizationId: string,
  roleIds: string[],
) {
  if (roleIds.length > 100) {
    throw new ConvexError("Vælg højst 100 roller");
  }
  if (new Set(roleIds).size !== roleIds.length) {
    throw new ConvexError("En rolle må kun vælges én gang");
  }
  const customRoleIds = roleIds.filter(
    (role) => !systemRoleKeys.includes(role as never),
  );
  const roles = await Promise.all(
    customRoleIds.map((role) =>
      ctx.db
        .query("roles")
        .withIndex("by_organizationId_and_key", (q) =>
          q.eq("organizationId", organizationId).eq("key", role),
        )
        .unique(),
    ),
  );
  if (roles.some((role) => !role)) {
    throw new ConvexError("Rollen blev ikke fundet");
  }
}

async function validateLocationIds(
  ctx: MutationCtx,
  organizationId: string,
  locationIds: Id<"locations">[],
) {
  if (locationIds.length > 200) {
    throw new ConvexError("Vælg højst 200 lokationer");
  }
  if (new Set(locationIds).size !== locationIds.length) {
    throw new ConvexError("En lokation må kun vælges én gang");
  }
  const locations = await Promise.all(
    locationIds.map((locationId) => ctx.db.get("locations", locationId)),
  );
  if (
    locations.some((location) => location?.organizationId !== organizationId)
  ) {
    throw new ConvexError("Lokationen blev ikke fundet");
  }
}

function markScopeTruncated<T extends { truncated?: boolean }>(
  result: T,
  scopeTruncated?: boolean,
) {
  return scopeTruncated ? { ...result, truncated: true } : result;
}

export const initialize = mutation({
  args: {},
  returns: v.id("dashboards"),
  handler: async (ctx) => {
    const auth = await requireDashboardManager(ctx);
    const dashboards = await organizationDashboards(ctx, auth.organizationId);
    if (dashboards[0]) {
      const organizationDefaults = dashboards.filter(
        (dashboard) => dashboard.isOrganizationDefault,
      );
      if (organizationDefaults.length !== 1) {
        const updatedAt = Math.max(
          Date.now(),
          ...dashboards.map((dashboard) => dashboard.updatedAt + 1),
        );
        for (const [index, dashboard] of dashboards.entries()) {
          await ctx.db.patch(dashboard._id, {
            isOrganizationDefault: index === 0,
            updatedBy: auth.userIdentifier,
            updatedAt,
          });
        }
      }
      return dashboards[0]._id;
    }
    return await ctx.db.insert("dashboards", {
      organizationId: auth.organizationId,
      name: "Dashboard",
      normalizedName: "dashboard",
      widgets: defaultWidgets,
      defaultScope: { mode: "aggregate", locationIds: null },
      defaultRange: { preset: "7days" },
      roleIds: [],
      defaultForRoleIds: [],
      defaultForLocationIds: [],
      isOrganizationDefault: true,
      sortOrder: 0,
      createdBy: auth.userIdentifier,
      updatedBy: auth.userIdentifier,
      updatedAt: Date.now(),
    });
  },
});

export const list = query({
  args: {},
  returns: dashboardListValidator,
  handler: async (ctx) => {
    const auth = await requireDashboardViewer(ctx);
    const dashboards = await organizationDashboards(ctx, auth.organizationId);
    const withWidgets = await Promise.all(
      dashboards.map(async (dashboard) => ({
        dashboard,
        widgets: await availableWidgets(ctx, auth, dashboard.widgets),
      })),
    );
    const accessible = withWidgets.filter(
      ({ dashboard, widgets }) =>
        roleAllowsDashboard(dashboard, auth.role) &&
        (dashboard.widgets.length === 0 || widgets.length > 0),
    );
    const singleLocationId = auth.kioskLocationId
      ? auth.kioskLocationId
      : !auth.locationScope.all && auth.locationScope.ids.size === 1
        ? [...auth.locationScope.ids][0]
        : null;
    return {
      dashboards: accessible.map(({ dashboard, widgets }) =>
        dashboardResult({ ...dashboard, widgets }),
      ),
      role: auth.role,
      singleLocationId,
    };
  },
});

export const get = query({
  args: { dashboardId: v.id("dashboards") },
  returns: dashboardValidator,
  handler: async (ctx, args) => {
    const auth = await requireDashboardViewer(ctx);
    const dashboard = await requireOrganizationDashboard(
      ctx,
      auth.organizationId,
      args.dashboardId,
    );
    if (!roleAllowsDashboard(dashboard, auth.role)) {
      throw new ConvexError("Du har ikke adgang til dette dashboard");
    }
    const widgets = await availableWidgets(ctx, auth, dashboard.widgets);
    if (dashboard.widgets.length > 0 && widgets.length === 0) {
      throw new ConvexError(
        "Ingen af dette dashboards widgets er tilgængelige for dig.",
      );
    }
    return dashboardResult({
      ...dashboard,
      widgets,
      defaultScope: scopedDefault(dashboard.defaultScope, auth.locationScope),
    });
  },
});

export const requestDataSync = mutation({
  args: {
    dashboardId: v.id("dashboards"),
    scope: scopeValidator,
  },
  returns: dashboardSyncResultValidator,
  handler: async (ctx, args) => {
    const auth = await requireDashboardViewer(ctx);
    await requireIntegrationManager(ctx);
    const dashboard = await requireOrganizationDashboard(
      ctx,
      auth.organizationId,
      args.dashboardId,
    );
    if (!roleAllowsDashboard(dashboard, auth.role)) {
      throw new ConvexError("Du har ikke adgang til dette dashboard");
    }
    const widgets = await availableWidgets(ctx, auth, dashboard.widgets);
    if (dashboard.widgets.length > 0 && widgets.length === 0) {
      throw new ConvexError(
        "Ingen af dette dashboards widgets er tilgængelige for dig.",
      );
    }
    const sources = await dashboardExternalSources(
      ctx,
      auth.organizationId,
      widgets,
    );
    const params = await resolveMetricParams(
      ctx,
      auth.organizationId,
      args.scope,
      { preset: "today" },
      Date.now(),
      auth.locationScope,
    );
    const syncWholeOrganization =
      args.scope.locationIds === null &&
      (!args.scope.level || args.scope.level === "organization") &&
      auth.locationScope.all;
    const onlinePos = sources.has("onlinepos")
      ? await requestOnlinePosDashboardSync(
          ctx,
          auth.organizationId,
          params.locations.map((location) => location.id),
          syncWholeOrganization,
        )
      : null;
    const workfeedResult = sources.has("workfeed")
      ? await requestWorkfeedEmployeeSync(ctx, auth.organizationId)
      : null;
    const workfeed: DashboardSyncSourceResult | null = workfeedResult
      ? { state: workfeedResult.state, retryAt: workfeedResult.retryAt }
      : null;
    return { onlinePos, workfeed };
  },
});

export const create = mutation({
  args: { name: v.string() },
  returns: v.id("dashboards"),
  handler: async (ctx, args) => {
    const auth = await requireDashboardManager(ctx);
    const dashboards = await organizationDashboards(ctx, auth.organizationId);
    if (dashboards.length >= MAX_DASHBOARDS) {
      throw new ConvexError(`Organisationen kan højst have ${MAX_DASHBOARDS} dashboards`);
    }
    const { name, normalizedName } = normalizeDashboardName(args.name);
    if (dashboards.some((dashboard) => dashboard.normalizedName === normalizedName)) {
      throw new ConvexError("Et dashboard med dette navn findes allerede");
    }
    const now = Date.now();
    return await ctx.db.insert("dashboards", {
      organizationId: auth.organizationId,
      name,
      normalizedName,
      widgets: [],
      defaultScope: { mode: "aggregate", locationIds: null },
      defaultRange: { preset: "7days" },
      roleIds: [],
      defaultForRoleIds: [],
      defaultForLocationIds: [],
      isOrganizationDefault: dashboards.length === 0,
      sortOrder: dashboards.length,
      createdBy: auth.userIdentifier,
      updatedBy: auth.userIdentifier,
      updatedAt: now,
    });
  },
});

export const duplicate = mutation({
  args: { dashboardId: v.id("dashboards"), name: v.string() },
  returns: v.id("dashboards"),
  handler: async (ctx, args) => {
    const auth = await requireDashboardManager(ctx);
    const dashboards = await organizationDashboards(ctx, auth.organizationId);
    if (dashboards.length >= MAX_DASHBOARDS) {
      throw new ConvexError(`Organisationen kan højst have ${MAX_DASHBOARDS} dashboards`);
    }
    const source = await requireOrganizationDashboard(
      ctx,
      auth.organizationId,
      args.dashboardId,
    );
    const { name, normalizedName } = normalizeDashboardName(args.name);
    if (dashboards.some((dashboard) => dashboard.normalizedName === normalizedName)) {
      throw new ConvexError("Et dashboard med dette navn findes allerede");
    }
    const now = Date.now();
    return await ctx.db.insert("dashboards", {
      organizationId: auth.organizationId,
      name,
      normalizedName,
      widgets: source.widgets,
      defaultScope: source.defaultScope,
      defaultRange: source.defaultRange,
      roleIds: source.roleIds,
      defaultForRoleIds: [],
      defaultForLocationIds: [],
      isOrganizationDefault: false,
      sortOrder: dashboards.length,
      createdBy: auth.userIdentifier,
      updatedBy: auth.userIdentifier,
      updatedAt: now,
    });
  },
});

export const saveSettings = mutation({
  args: {
    dashboardId: v.id("dashboards"),
    name: v.string(),
    roleIds: v.array(v.string()),
    defaultForRoleIds: v.array(v.string()),
    defaultForLocationIds: v.array(v.id("locations")),
    isOrganizationDefault: v.boolean(),
    expectedUpdatedAt: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const auth = await requireDashboardManager(ctx);
    const [dashboard, dashboards] = await Promise.all([
      requireOrganizationDashboard(ctx, auth.organizationId, args.dashboardId),
      organizationDashboards(ctx, auth.organizationId),
    ]);
    if (dashboard.updatedAt !== args.expectedUpdatedAt) {
      throw new ConvexError(
        "Dashboardet blev ændret i en anden fane. Dine seneste ændringer blev ikke gemt",
      );
    }
    const { name, normalizedName } = normalizeDashboardName(args.name);
    if (
      dashboards.some(
        (candidate) =>
          candidate._id !== dashboard._id &&
          candidate.normalizedName === normalizedName,
      )
    ) {
      throw new ConvexError("Et dashboard med dette navn findes allerede");
    }
    await Promise.all([
      validateRoleKeys(ctx, auth.organizationId, args.roleIds),
      validateRoleKeys(ctx, auth.organizationId, args.defaultForRoleIds),
      validateLocationIds(
        ctx,
        auth.organizationId,
        args.defaultForLocationIds,
      ),
    ]);
    if (
      args.roleIds.length > 0 &&
      args.defaultForRoleIds.some((role) => !args.roleIds.includes(role))
    ) {
      throw new ConvexError("En standardrolle skal også have adgang til dashboardet");
    }
    const updatedAt = Math.max(
      Date.now(),
      ...dashboards.map((candidate) => candidate.updatedAt + 1),
    );
    for (const candidate of dashboards) {
      if (candidate._id === dashboard._id) continue;
      const nextRoleDefaults = candidate.defaultForRoleIds.filter(
        (role) => !args.defaultForRoleIds.includes(role),
      );
      const nextLocationDefaults = candidate.defaultForLocationIds.filter(
        (locationId) => !args.defaultForLocationIds.includes(locationId),
      );
      const removeOrganizationDefault =
        args.isOrganizationDefault && candidate.isOrganizationDefault;
      if (
        nextRoleDefaults.length !== candidate.defaultForRoleIds.length ||
        nextLocationDefaults.length !== candidate.defaultForLocationIds.length ||
        removeOrganizationDefault
      ) {
        await ctx.db.patch(candidate._id, {
          defaultForRoleIds: nextRoleDefaults,
          defaultForLocationIds: nextLocationDefaults,
          isOrganizationDefault: removeOrganizationDefault
            ? false
            : candidate.isOrganizationDefault,
          updatedBy: auth.userIdentifier,
          updatedAt,
        });
      }
    }
    if (!args.isOrganizationDefault && dashboard.isOrganizationDefault) {
      throw new ConvexError("Organisationen skal have ét standarddashboard");
    }
    await ctx.db.patch(dashboard._id, {
      name,
      normalizedName,
      roleIds: args.roleIds,
      defaultForRoleIds: args.defaultForRoleIds,
      defaultForLocationIds: args.defaultForLocationIds,
      isOrganizationDefault: args.isOrganizationDefault,
      updatedBy: auth.userIdentifier,
      updatedAt,
    });
    return updatedAt;
  },
});

export const reorder = mutation({
  args: { dashboardIds: v.array(v.id("dashboards")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireDashboardManager(ctx);
    const dashboards = await organizationDashboards(ctx, auth.organizationId);
    if (
      args.dashboardIds.length !== dashboards.length ||
      new Set(args.dashboardIds).size !== args.dashboardIds.length ||
      args.dashboardIds.some(
        (dashboardId) =>
          !dashboards.some((dashboard) => dashboard._id === dashboardId),
      )
    ) {
      throw new ConvexError("Dashboardrækkefølgen er ugyldig");
    }
    const updatedAt = Math.max(
      Date.now(),
      ...dashboards.map((dashboard) => dashboard.updatedAt + 1),
    );
    await Promise.all(
      args.dashboardIds.map((dashboardId, sortOrder) =>
        ctx.db.patch(dashboardId, {
          sortOrder,
          updatedBy: auth.userIdentifier,
          updatedAt,
        }),
      ),
    );
    return null;
  },
});

export const remove = mutation({
  args: { dashboardId: v.id("dashboards") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireDashboardManager(ctx);
    const dashboards = await organizationDashboards(ctx, auth.organizationId);
    const dashboard = dashboards.find(
      (candidate) => candidate._id === args.dashboardId,
    );
    if (!dashboard) throw new ConvexError("Dashboardet blev ikke fundet");
    if (dashboards.length === 1) {
      throw new ConvexError("Organisationen skal have mindst ét dashboard");
    }
    const remaining = dashboards.filter(
      (candidate) => candidate._id !== dashboard._id,
    );
    const updatedAt = Math.max(
      Date.now(),
      ...dashboards.map((candidate) => candidate.updatedAt + 1),
    );
    for (const [sortOrder, candidate] of remaining.entries()) {
      await ctx.db.patch(candidate._id, {
        sortOrder,
        isOrganizationDefault: dashboard.isOrganizationDefault
          ? sortOrder === 0
          : candidate.isOrganizationDefault,
        updatedBy: auth.userIdentifier,
        updatedAt,
      });
    }
    await ctx.db.delete(dashboard._id);
    return null;
  },
});

export const saveConfigRevisioned = mutation({
  args: {
    dashboardId: v.id("dashboards"),
    widgets: v.array(widgetValidator),
    expectedUpdatedAt: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const auth = await requireDashboardManager(ctx);
    const dashboard = await requireOrganizationDashboard(
      ctx,
      auth.organizationId,
      args.dashboardId,
    );
    if (dashboard.updatedAt !== args.expectedUpdatedAt) {
      throw new ConvexError(
        "Dashboardet blev ændret i en anden fane. Dine seneste ændringer blev ikke gemt",
      );
    }
    await validateWidgets(
      ctx,
      auth.organizationId,
      args.widgets,
      auth,
    );
    const updatedAt = Math.max(Date.now(), dashboard.updatedAt + 1);
    await ctx.db.patch(dashboard._id, {
      widgets: args.widgets,
      updatedBy: auth.userIdentifier,
      updatedAt,
    });
    return updatedAt;
  },
});

export const saveDefaults = mutation({
  args: {
    dashboardId: v.id("dashboards"),
    defaultScope: scopeValidator,
    defaultRange: rangeValidator,
    expectedUpdatedAt: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const auth = await requireDashboardManager(ctx);
    const dashboard = await requireOrganizationDashboard(
      ctx,
      auth.organizationId,
      args.dashboardId,
    );
    if (dashboard.updatedAt !== args.expectedUpdatedAt) {
      throw new ConvexError(
        "Dashboardet blev ændret i en anden fane. Dine seneste ændringer blev ikke gemt",
      );
    }
    await validateScope(
      ctx,
      auth.organizationId,
      args.defaultScope,
      auth.locationScope,
    );
    const updatedAt = Math.max(Date.now(), dashboard.updatedAt + 1);
    await ctx.db.patch(dashboard._id, {
      defaultScope: args.defaultScope,
      defaultRange: args.defaultRange,
      updatedBy: auth.userIdentifier,
      updatedAt,
    });
    return updatedAt;
  },
});

export const getMetric = query({
  args: {
    metricId: metricIdValidator,
    visualization: visualizationValidator,
    scope: scopeValidator,
    range: rangeValidator,
    now: v.number(),
    salesSource: v.optional(salesSourceValidator),
  },
  returns: metricResultValidator,
  handler: async (ctx, args) => {
    const auth = await requireDashboardViewer(ctx);
    const human = requireHumanPrincipal(auth);
    const { organizationId } = auth;
    const definition = metricRegistry[args.metricId];
    if (!definition.visualizations.includes(args.visualization)) {
      throw new ConvexError("Visualiseringen understøttes ikke af målingen");
    }
    const salesSource = resolveBuiltinSalesSource(
      args.metricId,
      args.salesSource,
    );
    if (!canViewBuiltinMetric(auth, args.metricId, salesSource)) {
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
        anonymousSeed: human.sessionId,
        salesDetailAllowed: canViewDetailedSales(auth),
      },
    );
    return markScopeTruncated(
      await dashboardMetricComputers[args.metricId](
        ctx,
        salesSource ? { ...params, salesSource } : params,
      ),
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
    const human = requireHumanPrincipal(auth);
    const { organizationId } = auth;
    if (
      args.widgets.length > MAX_METRIC_BATCH ||
      new Set(args.widgets.map((widget) => widget.key)).size !==
        args.widgets.length
    ) {
      throw new ConvexError("Widgetgruppen er ugyldig");
    }
    const customMetrics = new Map<Id<"customMetrics">, Doc<"customMetrics">>();
    for (const widget of args.widgets) {
      if (widget.metric.kind === "builtin") {
        const definition = metricRegistry[widget.metric.id];
        if (!definition.visualizations.includes(widget.visualization)) {
          throw new ConvexError("Visualiseringen understøttes ikke af målingen");
        }
        const salesSource = resolveBuiltinSalesSource(
          widget.metric.id,
          widget.salesSource,
        );
        if (!canViewBuiltinMetric(auth, widget.metric.id, salesSource)) {
          throw new ConvexError("Du har ikke adgang til denne måling");
        }
        continue;
      }
      if (widget.salesSource !== undefined) {
        throw new ConvexError("Salgskilden kan kun bruges på salgsmålinger");
      }
      const metric = await ctx.db.get("customMetrics", widget.metric.id);
      if (
        !metric ||
        metric.organizationId !== organizationId ||
        !customMetricAllowed(auth, metric.spec)
      ) {
        throw new ConvexError("Du har ikke adgang til denne måling");
      }
      if (
        (widget.visualization === "donut" &&
          (metric.spec.kind === "ratio" || !metric.spec.dimension)) ||
        ((widget.visualization === "list" ||
          widget.visualization === "table") &&
          !metric.spec.dimension)
      ) {
        throw new ConvexError("Visualiseringen understøttes ikke af målingen");
      }
      customMetrics.set(metric._id, metric);
    }
    const resolveParams = createMetricParamsResolver(
      ctx,
      organizationId,
      args.scope,
      args.now,
      auth.locationScope,
      {
        granularity: auth.granularity,
        anonymousSeed: human.sessionId,
        salesDetailAllowed: canViewDetailedSales(auth),
      },
    );
    return await Promise.all(
      args.widgets.map(async (widget) => {
        const params = await resolveParams(
          widget.range ? { preset: widget.range } : args.range,
        );
        const salesSource =
          widget.metric.kind === "builtin"
            ? resolveBuiltinSalesSource(widget.metric.id, widget.salesSource)
            : undefined;
        return {
          key: widget.key,
          result: markScopeTruncated(
            widget.metric.kind === "builtin"
              ? await dashboardMetricComputers[widget.metric.id](
                  ctx,
                  salesSource ? { ...params, salesSource } : params,
                )
              : await executeCustomMetric(
                  ctx,
                  customMetrics.get(widget.metric.id)!.spec,
                  params,
                ),
            params.scopeTruncated,
          ),
        };
      }),
    );
  },
});

export const getShareSource = internalQuery({
  args: {
    organizationId: v.string(),
    dashboardId: v.id("dashboards"),
  },
  returns: shareSourceValidator,
  handler: async (ctx, args) => {
    const dashboard = await requireOrganizationDashboard(
      ctx,
      args.organizationId,
      args.dashboardId,
    );
    const customMetricIds = dashboard.widgets.flatMap((widget) =>
      widget.metric.kind === "custom" ? [widget.metric.id] : [],
    );
    const customMetrics = await Promise.all(
      [...new Set(customMetricIds)].map((metricId) =>
        ctx.db.get("customMetrics", metricId),
      ),
    );
    if (
      customMetrics.some(
        (metric) => !metric || metric.organizationId !== args.organizationId,
      )
    ) {
      throw new ConvexError("En tilpasset måling blev ikke fundet");
    }
    return {
      widgets: dashboard.widgets,
      scope: dashboard.defaultScope,
      range: dashboard.defaultRange,
      updatedAt: dashboard.updatedAt,
      roleIds: dashboard.roleIds,
      customMetricSnapshots: customMetrics.map((metric) => ({
        id: metric!._id,
        name: metric!.name,
        spec: metric!.spec,
      })),
    };
  },
});

export const insertShare = internalMutation({
  args: {
    organizationId: v.string(),
    dashboardId: v.id("dashboards"),
    token: v.string(),
    unlockKey: v.string(),
    passwordHash: v.optional(v.string()),
    passwordSalt: v.optional(v.string()),
    name: v.string(),
    widgets: v.array(widgetValidator),
    customMetricSnapshots: v.array(customMetricSnapshotValidator),
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
    dashboardId: v.id("dashboards"),
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
    const source: {
      widgets: WidgetInstance[];
      scope: DashboardScope;
      range: DashboardConfig["range"];
      updatedAt: number;
      roleIds: string[];
      customMetricSnapshots: Array<{
        id: Id<"customMetrics">;
        name: string;
        spec: Doc<"customMetrics">["spec"];
      }>;
    } = await ctx.runQuery(internal.dashboard.getShareSource, {
      organizationId,
      dashboardId: args.dashboardId,
    });
    if (source.roleIds.length > 0 && !source.roleIds.includes(auth.role)) {
      throw new ConvexError("Du har ikke adgang til dette dashboard");
    }
    const customSnapshotById = new Map(
      source.customMetricSnapshots.map((snapshot) => [snapshot.id, snapshot]),
    );
    const widgets = source.widgets.filter(
      (widget) => {
        if (widget.metric.kind === "custom") {
          const snapshot = customSnapshotById.get(widget.metric.id);
          return snapshot && customMetricAllowed(auth, snapshot.spec);
        }
        return (
          metricRegistry[widget.metric.id].shareable !== false &&
          canViewBuiltinMetric(
            auth,
            widget.metric.id,
            resolveBuiltinSalesSource(
              widget.metric.id,
              widget.options?.salesSource,
            ),
          )
        );
      },
    );
    const scope = auth.locationScope.all
      ? source.scope
      : (() => {
          const allowedIds = [...auth.locationScope.ids];
          const locationIds = (source.scope.locationIds ?? allowedIds).filter(
            (locationId) => auth.locationScope.ids.has(locationId),
          );
          if (!locationIds.length) {
            throw new ConvexError("Du har ikke adgang til dashboardets lokationer");
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
      widgets.some(
        (widget) =>
          widget.metric.kind === "custom"
            ? customMetricIsSensitive(
                customSnapshotById.get(widget.metric.id)!.spec,
              )
            : metricRegistry[widget.metric.id].sensitive,
      )
    ) {
      throw new ConvexError(
        "Adgangskode er påkrævet, når dashboardet indeholder følsomme målinger",
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
      dashboardId: args.dashboardId,
      token,
      unlockKey,
      passwordHash,
      passwordSalt,
      name,
      widgets,
      customMetricSnapshots: source.customMetricSnapshots.filter((snapshot) =>
        widgets.some(
          (widget) =>
            widget.metric.kind === "custom" && widget.metric.id === snapshot.id,
        ),
      ),
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
  args: { dashboardId: v.optional(v.id("dashboards")) },
  returns: v.array(shareSummaryValidator),
  handler: async (ctx, args) => {
    const { organizationId } = await requireDashboardSharer(ctx);
    const shares = await ctx.db
      .query("dashboardShares")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .order("desc")
      .take(100);
    const filtered = args.dashboardId
      ? shares.filter((share) => share.dashboardId === args.dashboardId)
      : shares;
    const dashboards = await Promise.all(
      filtered.map((share) => ctx.db.get("dashboards", share.dashboardId)),
    );
    return filtered.map((share, index) => ({
      id: share._id,
      dashboardId: share.dashboardId,
      dashboardName: dashboards[index]?.name ?? "Slettet dashboard",
      name: share.name,
      token: share.token,
      expiresAt: share.expiresAt,
      createdAt: share._creationTime,
      lastViewedAt: share.lastViewedAt ?? null,
      revokedAt: share.revokedAt ?? null,
      requiresPassword:
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
      .withIndex("by_organizationId_and_sortOrder", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .paginate({ numItems: CLEANUP_PAGE, cursor: args.cursor ?? null });
    for (const dashboard of result.page) {
      const locationIds = dashboard.defaultScope.locationIds?.filter(
        (locationId) => locationId !== args.locationId,
      );
      const defaultForLocationIds = dashboard.defaultForLocationIds.filter(
        (locationId) => locationId !== args.locationId,
      );
      if (
        locationIds?.length === dashboard.defaultScope.locationIds?.length &&
        defaultForLocationIds.length === dashboard.defaultForLocationIds.length
      ) {
        continue;
      }
      await ctx.db.patch(dashboard._id, {
        defaultScope: locationIds?.length
          ? {
              mode:
                dashboard.defaultScope.mode === "compare" &&
                locationIds.length < 2
                  ? "aggregate"
                  : dashboard.defaultScope.mode,
              locationIds,
            }
          : { mode: "aggregate", locationIds: null },
        defaultForLocationIds,
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
