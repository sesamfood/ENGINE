"use client";

import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardRange, MetricResult, SalesSource, WidgetInstance, WidgetRangePreset, WidgetSize, VisualizationId } from "@/lib/dashboard/types";
import type { YAxisValues } from "./y-axis-settings";
import { visualizationRegistry } from "@/lib/dashboard/visualizations";
import { WidgetCard } from "./widget-card";

export function DashboardWidget({
  widget,
  result,
  metricLabel,
  tooltipLabel,
  range,
  editable,
  resizing,
  onVisualizationChange,
  visualizations,
  onRangeChange,
  onSalesSourceChange,
  onYAxisChange,
  onEditCustomMetric,
  onResize,
  onRemove,
}: {
  widget: WidgetInstance;
  result?: MetricResult;
  metricLabel?: string;
  tooltipLabel?: string;
  range?: DashboardRange;
  editable: boolean;
  resizing?: boolean;
  onVisualizationChange?: (visualization: VisualizationId) => void;
  visualizations?: readonly VisualizationId[];
  onRangeChange?: (range: WidgetRangePreset | undefined) => void;
  onSalesSourceChange?: (salesSource: SalesSource) => void;
  onYAxisChange?: (axis: YAxisValues) => void;
  onEditCustomMetric?: () => void;
  onResize?: (size: WidgetSize, complete: boolean) => void;
  onRemove?: () => void;
}) {
  const Visualization = visualizationRegistry[widget.visualization];
  const compact = widget.size === "1x1" || widget.size === "2x1";

  return (
    <WidgetCard
      widget={widget}
      result={result ?? undefined}
      metricLabel={metricLabel}
      range={range}
      editable={editable}
      resizing={resizing}
      onVisualizationChange={onVisualizationChange}
      visualizations={visualizations}
      onRangeChange={onRangeChange}
      onSalesSourceChange={onSalesSourceChange}
      onYAxisChange={onYAxisChange}
      onEditCustomMetric={onEditCustomMetric}
      onResize={onResize}
      onRemove={onRemove}
    >
      {result == null ? (
        <div className="flex h-full flex-col gap-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="min-h-24 flex-1" />
        </div>
      ) : (
        <Visualization result={result} compact={compact} tooltipLabel={tooltipLabel} yAxisMin={widget.options?.yAxisMin} yAxisMax={widget.options?.yAxisMax} />
      )}
    </WidgetCard>
  );
}
