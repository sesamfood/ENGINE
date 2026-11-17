import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { metricFeaturesAvailable } from "../integrations/dashboard";
import { metricRegistry } from "../lib/dashboard/registry";
import { locationTargetKindLabels, targetPeriodLabels, targetPeriodDays, targetUsesPeriod, targetVisualizations } from "../lib/dashboard/target";
import type { MetricId, MetricResult, SalesSource, TargetPeriod } from "../lib/dashboard/types";
import { addDays, dateKey, daysBetween, zonedStart } from "../lib/date";
import { hasPermission } from "../lib/auth-permissions";
import { recordAudit } from "./lib/audit";
import {
  requireDashboardManager,
  requireDashboardViewer,
  requireHumanPrincipal,
  requireLocationAccess,
  requirePermission,
} from "./lib/auth";
import {
  locationTargetKindValidator,
  metricIdValidator,
  rangeValidator,
  salesSourceValidator,
  scopeValidator,
  targetPeriodValidator,
  visualizationValidator,
  widgetSizeValidator,
} from "./lib/dashboardValidators";
import { queryMetricComputer, resolveBuiltinSalesSource, resolveMetricParams } from "./lib/dashboardMetrics";
import { requireOrganizationLocation } from "./lib/locations";
import { canViewBuiltinMetric, canViewDetailedSales } from "./dashboard";
import { enabledTargetMetrics, syncTargetDashboard } from "./lib/targetDashboards";

type MetricParams = Awaited<ReturnType<typeof resolveMetricParams>>;

export const getSettings = query({
  args: {},
  returns: v.object({ targetMetricIds: v.array(metricIdValidator) }),
  handler: async (ctx) => {
    const auth = await requireDashboardViewer(ctx);
    return { targetMetricIds: [...await enabledTargetMetrics(ctx, auth.organizationId)] };
  },
});

export const saveSettings = mutation({
  args: { targetMetricIds: v.array(metricIdValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = requireHumanPrincipal(await requireDashboardManager(ctx));
    const targetMetricIds = [...new Set(args.targetMetricIds)];
    if (targetMetricIds.some((id) => !metricRegistry[id].targetable)) {
      throw new ConvexError("Målingen understøtter ikke lokationsmål");
    }
    const fields = { targetMetricIds, updatedAt: Date.now(), updatedBy: auth.userId };
    const existing = await ctx.db.query("managerSettings")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", auth.organizationId))
      .unique();
    const settingsId = existing
      ? existing._id
      : await ctx.db.insert("managerSettings", { organizationId: auth.organizationId, ...fields });
    if (existing) await ctx.db.patch("managerSettings", existing._id, fields);
    const locations = await ctx.db.query("locations")
      .withIndex("by_organizationId_and_normalizedName", (q) => q.eq("organizationId", auth.organizationId))
      .take(200);
    for (const location of locations) {
      await syncTargetDashboard(ctx, auth.organizationId, location._id, auth.userId);
    }
    await recordAudit(ctx, auth, {
      action: "managerSettings.updated",
      entityTable: "managerSettings",
      entityId: settingsId,
      summary: targetMetricIds.length
        ? `Managere kan sætte mål for ${targetMetricIds.map((id) => metricRegistry[id].label).join(", ")}`
        : "Managere kan ikke sætte mål for nogen målinger",
    });
    return null;
  },
});

async function viewerParams(ctx: QueryCtx, metricId: MetricId, scope: Parameters<typeof resolveMetricParams>[2],
  range: Parameters<typeof resolveMetricParams>[3], now: number) {
  const auth = await requireDashboardViewer(ctx);
  const human = requireHumanPrincipal(auth);
  const definition = metricRegistry[metricId];
  if (!definition.targetable || !canViewBuiltinMetric(auth, metricId)
    || !metricFeaturesAvailable(definition.features, [...auth.disabledFeatures])
    || !(await enabledTargetMetrics(ctx, auth.organizationId)).has(metricId)) return null;
  const params = await resolveMetricParams(ctx, auth.organizationId, scope, range, now, auth.locationScope, {
    granularity: auth.granularity,
    anonymousSeed: human.sessionId,
    salesDetailAllowed: canViewDetailedSales(auth),
  });
  return { auth, params };
}

/** Computes the metric for whole days from `fromKey` through `toKey`. */
async function computeRange(ctx: QueryCtx, params: MetricParams, metricId: MetricId,
  salesSource: SalesSource | undefined, fromKey: string, toKey: string) {
  const from = zonedStart(fromKey, params.timeZone);
  const to = zonedStart(addDays(toKey, 1), params.timeZone);
  return queryMetricComputer(metricId)(ctx, {
    ...params,
    ...(salesSource ? { salesSource } : {}),
    from,
    to,
    previousFrom: from,
    previousTo: from,
    cache: new Map(),
  });
}

function headline(result: MetricResult) {
  if (result.emptyMessage !== undefined || (result.unit === "currency" && result.mixedCurrency)) return null;
  return result.headlineTotal ?? result.series.reduce((sum, series) => sum + series.total, 0);
}

const targetValidator = v.object({
  metricId: metricIdValidator,
  kind: locationTargetKindValidator,
  value: v.number(),
  period: targetPeriodValidator,
  updatedAt: v.number(),
});

export const list = query({
  args: { locationId: v.id("locations") },
  returns: v.object({ canManage: v.boolean(), targets: v.array(targetValidator) }),
  handler: async (ctx, args) => {
    const auth = await requireDashboardViewer(ctx);
    requireLocationAccess(auth, args.locationId);
    await requireOrganizationLocation(ctx, auth.organizationId, args.locationId);
    const rows = await ctx.db.query("locationTargets")
      .withIndex("by_organizationId_and_locationId_and_metricId", (q) =>
        q.eq("organizationId", auth.organizationId).eq("locationId", args.locationId))
      .take(100);
    const enabled = await enabledTargetMetrics(ctx, auth.organizationId);
    return {
      canManage: auth.principalKind !== "apiKey" && !auth.kioskModeEnabled
        && hasPermission(auth.role, auth.permissions, "dashboard.manageTargets"),
      targets: rows
        .filter((row) => enabled.has(row.metricId) && metricRegistry[row.metricId]?.targetable
          && canViewBuiltinMetric(auth, row.metricId))
        .map(({ metricId, kind, value, period, updatedAt }) => ({ metricId, kind, value, period, updatedAt })),
    };
  },
});

const valueOrNull = v.union(v.number(), v.null());

/** Figures a manager can lean on when setting a target for the current day, week or month. */
export const getOverview = query({
  args: { locationId: v.id("locations"), metricId: metricIdValidator, period: targetPeriodValidator, now: v.number() },
  returns: v.union(v.null(), v.object({
    currency: v.union(v.string(), v.null()),
    current: valueOrNull,
    previous: valueOrNull,
    lastYear: valueOrNull,
    lastYearToDate: valueOrNull,
    average: valueOrNull,
    averageCount: v.number(),
  })),
  handler: async (ctx, args) => {
    const resolved = await viewerParams(ctx, args.metricId,
      { mode: "aggregate", locationIds: [args.locationId] }, { preset: "today" }, args.now);
    if (!resolved) return null;
    const { params } = resolved;
    const salesSource = resolveBuiltinSalesSource(args.metricId);
    const additive = targetUsesPeriod({ kind: "builtin", id: args.metricId });
    const period: TargetPeriod = additive ? args.period : "month";
    const today = dateKey(args.now, params.timeZone);
    let start: string;
    let previous: [string, string];
    let lastYear: [string, string];
    let averageRange: [string, string];
    let averageCount: number;
    if (period === "day") {
      start = today;
      previous = [addDays(today, -1), addDays(today, -1)];
      lastYear = [addDays(today, -364), addDays(today, -364)];
      averageRange = [addDays(today, -28), addDays(today, -1)];
      averageCount = 28;
    } else if (period === "week") {
      start = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7));
      previous = [addDays(start, -7), addDays(start, -1)];
      lastYear = [addDays(start, -364), addDays(start, -358)];
      averageRange = [addDays(start, -28), addDays(start, -1)];
      averageCount = 4;
    } else {
      start = `${today.slice(0, 8)}01`;
      const monthsBack = (months: number) => {
        const date = new Date(`${start}T12:00:00Z`);
        date.setUTCMonth(date.getUTCMonth() - months);
        return date.toISOString().slice(0, 10);
      };
      previous = [monthsBack(1), addDays(start, -1)];
      const lastYearStart = monthsBack(12);
      lastYear = [lastYearStart, addDays(monthsBack(11), -1)];
      averageRange = [monthsBack(3), addDays(start, -1)];
      averageCount = 3;
    }
    const lastYearToDate: [string, string] = [lastYear[0], addDays(lastYear[0], daysBetween(start, today))];
    const compute = ([from, to]: [string, string]) => computeRange(ctx, params, args.metricId, salesSource, from, to);
    const [current, previousResult, lastYearResult, lastYearToDateResult, averageResult] = await Promise.all([
      compute([start, today]), compute(previous), compute(lastYear), compute(lastYearToDate), compute(averageRange),
    ]);
    const average = headline(averageResult);
    return {
      currency: current.currency ?? null,
      current: headline(current),
      previous: headline(previousResult),
      lastYear: headline(lastYearResult),
      lastYearToDate: headline(lastYearToDateResult),
      average: average === null ? null : additive ? average / averageCount : average,
      averageCount,
    };
  },
});

/** The location targets for a dashboard selection, combined into one. */
export const getForScope = query({
  args: {
    metricId: metricIdValidator,
    scope: scopeValidator,
    range: rangeValidator,
    now: v.number(),
    salesSource: v.optional(salesSourceValidator),
  },
  returns: v.union(v.null(), v.object({
    kind: locationTargetKindValidator,
    value: v.number(),
    period: targetPeriodValidator,
    currency: v.union(v.string(), v.null()),
    reference: v.union(v.null(), v.object({
      total: v.number(),
      points: v.array(v.object({ t: v.number(), value: v.number() })),
    })),
  })),
  handler: async (ctx, args) => {
    const resolved = await viewerParams(ctx, args.metricId, args.scope, args.range, args.now);
    if (!resolved) return null;
    const { auth, params } = resolved;
    if (params.scopeTruncated || params.locations.length === 0) return null;
    const rows = await Promise.all(params.locations.map((location) =>
      ctx.db.query("locationTargets")
        .withIndex("by_organizationId_and_locationId_and_metricId", (q) =>
          q.eq("organizationId", auth.organizationId).eq("locationId", location.id).eq("metricId", args.metricId))
        .unique()));
    // Every selected location needs a target of the same kind, otherwise they cannot be combined.
    if (rows.some((row) => row === null)) return null;
    const targets = rows.map((row) => row!);
    const [first] = targets;
    if (targets.some((target) => target.kind !== first.kind)) return null;
    const samePeriod = targets.every((target) => target.period === first.period);
    const currencies = new Set(params.locations.map((location) => location.currency));
    const currency = currencies.size === 1 ? [...currencies][0] : null;

    if (first.kind === "amount") {
      if (metricRegistry[args.metricId].unit === "currency" && currency === null) return null;
      if (targets.length === 1) return { kind: first.kind, value: first.value, period: first.period, currency, reference: null };
      // Averages and percentages cannot be added up across locations.
      if (!targetUsesPeriod({ kind: "builtin", id: args.metricId })) return null;
      return samePeriod
        ? { kind: first.kind, value: targets.reduce((sum, target) => sum + target.value, 0), period: first.period, currency, reference: null }
        : {
            kind: first.kind,
            value: targets.reduce((sum, target) => sum + target.value / targetPeriodDays[target.period], 0),
            period: "day" as const,
            currency,
            reference: null,
          };
    }

    // A shared percentage applies to the selection as a whole.
    if (targets.some((target) => target.value !== first.value)) return null;
    const timeZone = params.timeZone;
    const fromKey = dateKey(params.from, timeZone);
    const toKey = addDays(dateKey(params.to, timeZone), -1);
    const shift = first.kind === "lastYear" ? 364 : daysBetween(fromKey, toKey) + 1;
    const result = await computeRange(ctx, params, args.metricId, resolveBuiltinSalesSource(args.metricId, args.salesSource),
      addDays(fromKey, -shift), addDays(toKey, -shift));
    const total = headline(result);
    return {
      kind: first.kind,
      value: first.value,
      period: samePeriod ? first.period : "day",
      currency,
      reference: total === null ? null : {
        total,
        points: result.series.length === 1
          ? result.series[0].points.map((point) => ({
              t: zonedStart(addDays(dateKey(point.t, timeZone), shift), timeZone),
              value: point.value,
            }))
          : [],
      },
    };
  },
});

async function requireTargetManager(ctx: MutationCtx, locationId: Id<"locations">, metricId: MetricId) {
  const auth = requireHumanPrincipal(await requirePermission(ctx, "dashboard.manageTargets"));
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  requireLocationAccess(auth, locationId);
  const location = await requireOrganizationLocation(ctx, auth.organizationId, locationId);
  const definition = metricRegistry[metricId];
  if (!definition.targetable || !(await enabledTargetMetrics(ctx, auth.organizationId)).has(metricId)) {
    throw new ConvexError("Målingen understøtter ikke lokationsmål");
  }
  if (!canViewBuiltinMetric(auth, metricId)) throw new ConvexError("Du har ikke adgang til denne måling");
  const existing = await ctx.db.query("locationTargets")
    .withIndex("by_organizationId_and_locationId_and_metricId", (q) =>
      q.eq("organizationId", auth.organizationId).eq("locationId", locationId).eq("metricId", metricId))
    .unique();
  return { auth, location, definition, existing };
}

export const upsert = mutation({
  args: {
    locationId: v.id("locations"),
    metricId: metricIdValidator,
    kind: locationTargetKindValidator,
    value: v.number(),
    period: targetPeriodValidator,
    visualization: v.optional(visualizationValidator),
    size: v.optional(widgetSizeValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { auth, location, definition, existing } = await requireTargetManager(ctx, args.locationId, args.metricId);
    if (args.visualization && !(definition.visualizations.includes(args.visualization) && targetVisualizations.includes(args.visualization))) {
      throw new ConvexError("Diagramtypen kan ikke vise et mål");
    }
    if (!Number.isFinite(args.value) || args.value < 0) throw new ConvexError("Angiv et mål på 0 eller mere");
    if (args.kind !== "amount" && args.value > 1000) throw new ConvexError("Angiv en procent på højst 1.000");
    if (args.kind === "amount" && definition.unit === "percent" && args.value > 100) {
      throw new ConvexError("Angiv en procent på højst 100");
    }
    const usesPeriod = targetUsesPeriod({ kind: "builtin", id: args.metricId });
    // Levels such as averages have no period of their own.
    const period = usesPeriod ? args.period : "day";
    const fields = { kind: args.kind, value: args.value, period, updatedAt: Date.now(), updatedBy: auth.userId };
    const targetId = existing
      ? existing._id
      : await ctx.db.insert("locationTargets", {
          organizationId: auth.organizationId,
          locationId: args.locationId,
          metricId: args.metricId,
          ...fields,
        });
    if (existing) await ctx.db.patch("locationTargets", existing._id, fields);
    await syncTargetDashboard(ctx, auth.organizationId, args.locationId, auth.userId, args.visualization && args.size
      ? { metricId: args.metricId, visualization: args.visualization, size: args.size }
      : undefined);
    const valueText = args.kind === "amount" ? String(args.value) : `${args.value} %`;
    await recordAudit(ctx, auth, {
      action: "locationTargets.updated",
      entityTable: "locationTargets",
      entityId: targetId,
      summary: `Målet for ${definition.label} på ${location.name} blev sat til ${valueText} (${locationTargetKindLabels[args.kind].toLowerCase()}${
        usesPeriod ? `, pr. ${targetPeriodLabels[period].toLowerCase()}` : ""})`,
      locationId: args.locationId,
    });
    return null;
  },
});

export const remove = mutation({
  args: { locationId: v.id("locations"), metricId: metricIdValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { auth, location, definition, existing } = await requireTargetManager(ctx, args.locationId, args.metricId);
    if (!existing) return null;
    await ctx.db.delete("locationTargets", existing._id);
    await syncTargetDashboard(ctx, auth.organizationId, args.locationId, auth.userId);
    await recordAudit(ctx, auth, {
      action: "locationTargets.removed",
      entityTable: "locationTargets",
      entityId: existing._id,
      summary: `Målet for ${definition.label} på ${location.name} blev fjernet`,
      locationId: args.locationId,
    });
    return null;
  },
});
