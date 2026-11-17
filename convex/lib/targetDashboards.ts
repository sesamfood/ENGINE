import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { metricRegistry, targetableMetrics } from "../../lib/dashboard/registry";
import { layoutDashboardWidgets } from "../../lib/dashboard/layout";
import { isTargetWidget, targetWidget } from "../../lib/dashboard/target-dashboard";
import type { MetricId, VisualizationId, WidgetSize } from "../../lib/dashboard/types";

export type TargetWidgetDisplay = { metricId: MetricId; visualization: VisualizationId; size: WidgetSize };

export async function enabledTargetMetrics(ctx: QueryCtx, organizationId: string) {
  const settings = await ctx.db.query("managerSettings")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  return new Set<MetricId>(settings?.targetMetricIds ?? targetableMetrics.map((metric) => metric.id));
}

/** Gives the location's target dashboard one widget per target, keeping layout and added widgets. */
export async function syncTargetDashboard(
  ctx: MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
  userId: string,
  display?: TargetWidgetDisplay,
) {
  const [targets, enabled, existing] = await Promise.all([
    ctx.db.query("locationTargets")
      .withIndex("by_organizationId_and_locationId_and_metricId", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", locationId))
      .take(100),
    enabledTargetMetrics(ctx, organizationId),
    ctx.db.query("locationTargetDashboards")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", locationId))
      .unique(),
  ]);
  const wanted = new Set(targets.map((target) => target.metricId)
    .filter((metricId) => enabled.has(metricId) && metricRegistry[metricId]?.targetable));
  const current = existing?.widgets ?? [];
  const kept = current.filter((widget) =>
    !isTargetWidget(widget) || (widget.metric.kind === "builtin" && wanted.has(widget.metric.id)));
  const keptKeys = new Set(kept.map((widget) => widget.key));
  const added = [...wanted].map(targetWidget).filter((widget) => !keptKeys.has(widget.key));
  const displayKey = display && wanted.has(display.metricId) ? targetWidget(display.metricId).key : undefined;
  const next = [...kept, ...added].map((widget) => widget.key === displayKey
    ? { ...widget, visualization: display!.visualization, size: display!.size }
    : widget);
  const displayChanged = displayKey !== undefined && !current.some((widget) => widget.key === displayKey
    && widget.visualization === display!.visualization && widget.size === display!.size);
  if (!added.length && kept.length === current.length && !displayChanged) return;

  const widgets = layoutDashboardWidgets(next, displayKey);
  if (!widgets.length) {
    if (existing) await ctx.db.delete("locationTargetDashboards", existing._id);
    return;
  }
  const fields = { widgets, updatedBy: userId, updatedAt: Math.max(Date.now(), (existing?.updatedAt ?? 0) + 1) };
  if (existing) await ctx.db.patch("locationTargetDashboards", existing._id, fields);
  else await ctx.db.insert("locationTargetDashboards", { organizationId, locationId, ...fields });
}
