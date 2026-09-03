import { ConvexError, v } from "convex/values";
import { dashboardDatasets } from "../lib/dashboard/datasets";
import { hasPermission } from "../lib/auth-permissions";
import type { CustomMetricSpec, VisualizationId } from "../lib/dashboard/types";
import { mutation, query } from "./_generated/server";
import {
  requireDashboardManager,
  requireDashboardViewer,
  requireHumanPrincipal,
} from "./lib/auth";
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
  listCustomMetricProductOptions,
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
  usageCount: v.number(),
  updatedAt: v.number(),
});

const productOptionValidator = v.object({
  value: v.string(),
  label: v.string(),
  categoryIds: v.array(v.id("categories")),
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

function visualizationAllowed(
  spec: CustomMetricSpec,
  visualization: VisualizationId,
) {
  if (visualization === "donut") {
    return spec.kind === "single" && Boolean(spec.dimension);
  }
  if (visualization === "list" || visualization === "table") {
    return Boolean(spec.dimension);
  }
  return true;
}

export const list = query({
  args: {},
  returns: v.array(customMetricValidator),
  handler: async (ctx) => {
    const auth = await requireDashboardViewer(ctx);
    const dashboards = await ctx.db
      .query("dashboards")
      .withIndex("by_organizationId_and_sortOrder", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .take(8);
    const usageCounts = new Map<string, number>();
    for (const dashboard of dashboards) {
      for (const widget of dashboard.widgets) {
        if (widget.metric.kind !== "custom") continue;
        const key = String(widget.metric.id);
        usageCounts.set(key, (usageCounts.get(key) ?? 0) + 1);
      }
    }
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
        return [
          {
            id: metric._id,
            name: metric.name,
            description: metric.description ?? null,
            spec: metric.spec,
            sensitive: customMetricIsSensitive(metric.spec),
            usageCount: usageCounts.get(String(metric._id)) ?? 0,
            updatedAt: metric.updatedAt,
          },
        ];
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
    const dashboards = await ctx.db
      .query("dashboards")
      .withIndex("by_organizationId_and_sortOrder", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .take(8);
    const hasIncompatibleWidget = dashboards.some((dashboard) =>
      dashboard.widgets.some(
        (widget) =>
          widget.metric.kind === "custom" &&
          widget.metric.id === metric._id &&
          !visualizationAllowed(args.spec, widget.visualization),
      ),
    );
    if (hasIncompatibleWidget) {
      throw new ConvexError(
        "Skift først visualiseringen for de widgets, der bruger målingen",
      );
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
    const inUse = dashboards.some((dashboard) =>
      dashboard.widgets.some(
        (widget) =>
          widget.metric.kind === "custom" && widget.metric.id === metric._id,
      ),
    );
    if (inUse) {
      throw new ConvexError(
        "Målingen kan ikke slettes, mens den bruges af en widget",
      );
    }
    await ctx.db.delete(metric._id);
    return 0;
  },
});

export const listProductOptions = query({
  args: {
    spec: customMetricSpecValidator,
    scope: scopeValidator,
    range: rangeValidator,
    now: v.number(),
  },
  returns: v.object({
    products: v.array(productOptionValidator),
    topProductValues: v.array(v.string()),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const auth = await requireDashboardManager(ctx);
    if (args.spec.dimension !== "product") {
      throw new ConvexError("Målingen er ikke grupperet efter produkt");
    }
    validateCustomMetricSpec(args.spec, auth.granularity);
    requireDatasetPermissions(auth, args.spec);
    const human = requireHumanPrincipal(auth);
    const params = await resolveMetricParams(
      ctx,
      auth.organizationId,
      args.scope,
      args.range,
      args.now,
      auth.locationScope,
      {
        granularity: auth.granularity,
        anonymousSeed: human.sessionId,
        salesDetailAllowed:
          hasPermission(auth.role, auth.permissions, "dashboard.viewSales") ||
          hasPermission(auth.role, auth.permissions, "sales.viewDetail"),
      },
    );
    return await listCustomMetricProductOptions(ctx, args.spec, params);
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
    const human = requireHumanPrincipal(auth);
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
        anonymousSeed: human.sessionId,
        salesDetailAllowed:
          hasPermission(auth.role, auth.permissions, "dashboard.viewSales") ||
          hasPermission(auth.role, auth.permissions, "sales.viewDetail"),
      },
    );
    return await executeCustomMetric(ctx, args.spec, params);
  },
});
