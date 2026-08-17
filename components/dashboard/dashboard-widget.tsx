"use client";

import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardRange, MetricResult, WidgetInstance, WidgetSize, VisualizationId } from "@/lib/dashboard/types";
import type { YAxisValues } from "./y-axis-settings";
import { visualizationRegistry } from "@/lib/dashboard/visualizations";
import { WidgetCard } from "./widget-card";

export function DashboardWidget({
  widget,
  result,
  range,
  editable,
  resizing,
  onVisualizationChange,
  onYAxisChange,
  onResize,
  onRemove,
}: {
  widget: WidgetInstance;
  result?: MetricResult;
  range?: DashboardRange;
  editable: boolean;
  resizing?: boolean;
  onVisualizationChange?: (visualization: VisualizationId) => void;
  onYAxisChange?: (axis: YAxisValues) => void;
  onResize?: (size: WidgetSize, complete: boolean) => void;
  onRemove?: () => void;
}) {
  const Visualization = visualizationRegistry[widget.visualization];
  const compact = widget.size === "1x1" || widget.size === "2x1";

  return (
    <WidgetCard
      widget={widget}
      result={result ?? undefined}
      range={range}
      editable={editable}
      resizing={resizing}
      onVisualizationChange={onVisualizationChange}
      onYAxisChange={onYAxisChange}
      onResize={onResize}
      onRemove={onRemove}
    >
      {result == null ? (
        <div className="flex h-full flex-col gap-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="min-h-24 flex-1" />
        </div>
      ) : (
        <Visualization result={result} compact={compact} yAxisMin={widget.options?.yAxisMin} yAxisMax={widget.options?.yAxisMax} />
      )}
    </WidgetCard>
  );
}
