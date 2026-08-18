import { ConvexError, v } from "convex/values";
import { dashboardDatasets } from "../lib/dashboard/datasets";
import { hasPermission } from "../lib/auth-permissions";
import type { CustomMetricSpec } from "../lib/dashboard/types";
import { mutation, query } from "./_generated/server";
import { requireDashboardManager, requireDashboardViewer } from "./lib/auth";
import {
  customMetricSpecValidator,
  metricResultValidator,
  rangeValidator,
  scopeValidator,
  visualizationValidator,
} from "./lib/dashboardValidators";
import {
  customMetricIsSensitive,
  executeCustomMetric,
  validateCustomMetricSpec,
} from "./lib/customMetricExecutor";
import { resolveMetricParams } from "./lib/dashboardMetrics";

const MAX_CUSTOM_METRICS = 50;

const customMetricValidator = v.object({
  id: v.id("customMetrics"),
  name: v.string(),
  description: v.union(v.string(), v.null()),
  spec: customMetricSpecValidator,
  sensitive: v.boolean(),
  updatedAt: v.number(),
});

function normalizedName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > 100) {
    throw new ConvexError("Navnet skal være mellem 1 og 100 tegn");
  }
  return { name, normalizedName: name.toLocaleLowerCase("da") };
}

function description(value: string | undefined) {
  const trimmed = value?.trim();
  if (trimmed && trimmed.length > 500) {
    throw new ConvexError("Beskrivelsen må højst være 500 tegn");
  }
  return trimmed || undefined;
}

function requireDatasetPermissions(
  auth: {
    role: string;
    permissions: ReadonlySet<string>;
  },
  spec: CustomMetricSpec,
) {
  const queries =
    spec.kind === "single" ? [spec.query] : [spec.numerator, spec.denominator];
  for (const querySpec of queries) {
    const permission = dashboardDatasets[querySpec.dataset].permission;
    if (!permission) continue;
    const legacy = hasPermission(
      auth.role,
      auth.permissions,
      "dashboard.viewSales",
    );
    const allowed =
      legacy ||
      hasPermission(auth.role, auth.permissions, permission) ||
      (permission === "sales.viewAggregate" &&
        hasPermission(auth.role, auth.permissions, "sales.viewDetail"));
    if (!allowed) throw new ConvexError("Du har ikke adgang til datasættet");
  }
}

export const list = query({
  args: {},
  returns: v.array(customMetricValidator),
  handler: async (ctx) => {
    const auth = await requireDashboardViewer(ctx);
    const rows = await ctx.db
      .query("customMetrics")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .take(MAX_CUSTOM_METRICS + 1);
    return rows.slice(0, MAX_CUSTOM_METRICS).flatMap((metric) => {
      try {
        requireDatasetPermissions(auth, metric.spec);
        validateCustomMetricSpec(metric.spec, auth.granularity);
        return [{
          id: metric._id,
          name: metric.name,
          description: metric.description ?? null,
          spec: metric.spec,
          sensitive: customMetricIsSensitive(metric.spec),
          updatedAt: metric.updatedAt,
        }];
      } catch {
        return [];
      }
    });
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    spec: customMetricSpecValidator,
  },
  returns: v.id("customMetrics"),
  handler: async (ctx, args) => {
    const auth = await requireDashboardManager(ctx);
    validateCustomMetricSpec(args.spec, auth.granularity);
    requireDatasetPermissions(auth, args.spec);
    const { name, normalizedName: normalized } = normalizedName(args.name);
    const rows = await ctx.db
      .query("customMetrics")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .take(MAX_CUSTOM_METRICS + 1);
    if (rows.length >= MAX_CUSTOM_METRICS) {
      throw new ConvexError(
        `Organisationen kan højst have ${MAX_CUSTOM_METRICS} tilpassede målinger`,
      );
    }
    if (rows.some((metric) => metric.normalizedName === normalized)) {
      throw new ConvexError("En måling med dette navn findes allerede");
    }
    const now = Date.now();
    return await ctx.db.insert("customMetrics", {
      organizationId: auth.organizationId,
      name,
      normalizedName: normalized,
      description: description(args.description),
      spec: args.spec,
      createdBy: auth.userIdentifier,
      updatedBy: auth.userIdentifier,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    metricId: v.id("customMetrics"),
    name: v.string(),
    description: v.optional(v.string()),
    spec: customMetricSpecValidator,
    expectedUpdatedAt: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const auth = await requireDashboardManager(ctx);
    const metric = await ctx.db.get("customMetrics", args.metricId);
    if (!metric || metric.organizationId !== auth.organizationId) {
      throw new ConvexError("Målingen blev ikke fundet");
    }
    if (metric.updatedAt !== args.expectedUpdatedAt) {
      throw new ConvexError("Målingen blev ændret i en anden fane");
    }
    validateCustomMetricSpec(args.spec, auth.granularity);
    requireDatasetPermissions(auth, args.spec);
    const { name, normalizedName: normalized } = normalizedName(args.name);
    const existing = await ctx.db
      .query("customMetrics")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("normalizedName", normalized),
      )
      .unique();
    if (existing && existing._id !== metric._id) {
      throw new ConvexError("En måling med dette navn findes allerede");
    }
    const updatedAt = Math.max(Date.now(), metric.updatedAt + 1);
    await ctx.db.patch(metric._id, {
      name,
      normalizedName: normalized,
      description: description(args.description),
      spec: args.spec,
      updatedBy: auth.userIdentifier,
      updatedAt,
    });
    return updatedAt;
  },
});

export const usages = query({
  args: { metricId: v.id("customMetrics") },
  returns: v.array(
    v.object({
      dashboardId: v.id("dashboards"),
      dashboardName: v.string(),
      widgetKey: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const auth = await requireDashboardManager(ctx);
    const metric = await ctx.db.get("customMetrics", args.metricId);
    if (!metric || metric.organizationId !== auth.organizationId) {
      throw new ConvexError("Målingen blev ikke fundet");
    }
    const dashboards = await ctx.db
      .query("dashboards")
      .withIndex("by_organizationId_and_sortOrder", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .take(8);
    return dashboards.flatMap((dashboard) =>
      dashboard.widgets.flatMap((widget) =>
        widget.metric.kind === "custom" && widget.metric.id === metric._id
          ? [{
              dashboardId: dashboard._id,
              dashboardName: dashboard.name,
              widgetKey: widget.key,
            }]
          : [],
      ),
    );
  },
});

export const remove = mutation({
  args: { metricId: v.id("customMetrics") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const auth = await requireDashboardManager(ctx);
    const metric = await ctx.db.get("customMetrics", args.metricId);
    if (!metric || metric.organizationId !== auth.organizationId) {
      throw new ConvexError("Målingen blev ikke fundet");
    }
    const dashboards = await ctx.db
      .query("dashboards")
      .withIndex("by_organizationId_and_sortOrder", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .take(8);
    let removedWidgets = 0;
    const updatedAt = Date.now();
    for (const dashboard of dashboards) {
      const widgets = dashboard.widgets.filter((widget) => {
        const remove =
          widget.metric.kind === "custom" && widget.metric.id === metric._id;
        if (remove) removedWidgets += 1;
        return !remove;
      });
      if (widgets.length !== dashboard.widgets.length) {
        await ctx.db.patch(dashboard._id, {
          widgets,
          updatedBy: auth.userIdentifier,
          updatedAt,
        });
      }
    }
    await ctx.db.delete(metric._id);
    return removedWidgets;
  },
});

export const preview = query({
  args: {
    spec: customMetricSpecValidator,
    visualization: visualizationValidator,
    scope: scopeValidator,
    range: rangeValidator,
    now: v.number(),
  },
  returns: metricResultValidator,
  handler: async (ctx, args) => {
    const auth = await requireDashboardManager(ctx);
    validateCustomMetricSpec(args.spec, auth.granularity);
    requireDatasetPermissions(auth, args.spec);
    if (
      args.visualization === "donut" &&
      (args.spec.kind === "ratio" || !args.spec.dimension)
    ) {
      throw new ConvexError("Forhold kan ikke vises som donutdiagram");
    }
    if (
      (args.visualization === "list" || args.visualization === "table") &&
      !args.spec.dimension
    ) {
      throw new ConvexError("Visualiseringen kræver en dimension");
    }
    const params = await resolveMetricParams(
      ctx,
      auth.organizationId,
      args.scope,
      args.range,
      args.now,
      auth.locationScope,
      {
        granularity: auth.granularity,
        anonymousSeed: auth.sessionId,
        salesDetailAllowed:
          hasPermission(auth.role, auth.permissions, "dashboard.viewSales") ||
          hasPermission(auth.role, auth.permissions, "sales.viewDetail"),
      },
    );
    return await executeCustomMetric(ctx, args.spec, params);
  },
});
