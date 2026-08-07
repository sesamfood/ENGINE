"use client";

import { useQuery } from "convex/react";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { metricRegistry } from "@/lib/dashboard/registry";
import type { DashboardRange, DashboardScope, WidgetInstance, WidgetSize, VisualizationId } from "@/lib/dashboard/types";
import { visualizationRegistry } from "@/lib/dashboard/visualizations";
import { WidgetCard } from "./widget-card";

export function DashboardWidget({
  widget,
  scope,
  range,
  editable,
  resizing,
  publicAccess,
  onVisualizationChange,
  onResize,
  onRemove,
}: {
  widget: WidgetInstance;
  scope: DashboardScope;
  range: DashboardRange;
  editable: boolean;
  resizing?: boolean;
  publicAccess?: { token: string; accessKey: string };
  onVisualizationChange?: (visualization: VisualizationId) => void;
  onResize?: (size: WidgetSize, complete: boolean) => void;
  onRemove?: () => void;
}) {
  const definition = metricRegistry[widget.metricId];
  const authenticatedResult = useQuery(
    api.dashboard.getMetric,
    publicAccess
      ? "skip"
      : {
          metricId: widget.metricId,
          visualization: definition.defaultVisualization,
          scope,
          range,
        },
  );
  const sharedResult = useQuery(
    api.dashboardShare.getSharedMetric,
    publicAccess
      ? {
          token: publicAccess.token,
          accessKey: publicAccess.accessKey,
          metricId: widget.metricId,
          visualization: widget.visualization,
        }
      : "skip",
  );
  const result = publicAccess ? sharedResult : authenticatedResult;
  const Visualization = visualizationRegistry[widget.visualization];
  const compact = widget.size === "1x1" || widget.size === "2x1";

  return (
    <WidgetCard
      widget={widget}
      result={result ?? undefined}
      editable={editable}
      resizing={resizing}
      onVisualizationChange={onVisualizationChange}
      onResize={onResize}
      onRemove={onRemove}
    >
      {result == null ? (
        <div className="flex h-full flex-col gap-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="min-h-24 flex-1" />
        </div>
      ) : (
        <Visualization result={result} compact={compact} />
      )}
    </WidgetCard>
  );
}
