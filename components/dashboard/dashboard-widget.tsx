"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { ComparisonPeriod, DashboardRange, MetricResult, SalesSource, WidgetInstance, WidgetRangePreset, WidgetSize, VisualizationId } from "@/lib/dashboard/types";
import type { YAxisValues } from "./y-axis-settings";
import { visualizationRegistry } from "@/lib/dashboard/visualizations";
import { widgetSizeSpans } from "@/lib/dashboard/layout";
import { WidgetCard } from "./widget-card";
import { comparisonPeriodText } from "./visualizations/utils";
import { LiveMetricContent } from "./live-metric-content";
import type { LiveMetricState } from "./use-live-metrics";

export function DashboardWidget({
  widget,
  result,
  live,
  error,
  metricLabel,
  tooltipLabel,
  range,
  editable,
  resizing,
  onVisualizationChange,
  visualizations,
  onRangeChange,
  onComparisonChange,
  onSalesSourceChange,
  onYAxisChange,
  onGoalPercentChange,
  onEditCustomMetric,
  onResize,
  onRemove,
}: {
  widget: WidgetInstance;
  result?: MetricResult;
  live?: LiveMetricState;
  error?: string;
  metricLabel?: string;
  tooltipLabel?: string;
  range?: DashboardRange;
  editable: boolean;
  resizing?: boolean;
  onVisualizationChange?: (visualization: VisualizationId) => void;
  visualizations?: readonly VisualizationId[];
  onRangeChange?: (range: WidgetRangePreset | undefined) => void;
  onComparisonChange?: (comparison: ComparisonPeriod | undefined) => void;
  onSalesSourceChange?: (salesSource: SalesSource) => void;
  onYAxisChange?: (axis: YAxisValues) => void;
  onGoalPercentChange?: (goalPercent: number) => void;
  onEditCustomMetric?: () => void;
  onResize?: (size: WidgetSize, complete: boolean) => void;
  onRemove?: () => void;
}) {
  const Visualization = visualizationRegistry[widget.visualization];
  const compact = widgetSizeSpans[widget.size].rows === 1;

  return (
    <WidgetCard
      widget={widget}
      result={live?.kind === "ready" ? live.data.result : result}
      live={live}
      metricLabel={metricLabel}
      range={range}
      editable={editable}
      resizing={resizing}
      onVisualizationChange={onVisualizationChange}
      visualizations={visualizations}
      onRangeChange={onRangeChange}
      onComparisonChange={onComparisonChange}
      onSalesSourceChange={onSalesSourceChange}
      onYAxisChange={onYAxisChange}
      onGoalPercentChange={onGoalPercentChange}
      onEditCustomMetric={onEditCustomMetric}
      onResize={onResize}
      onRemove={onRemove}
    >
      {live ? <LiveMetricContent widget={widget} state={live} compact={compact} /> : error ? (
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
      ) : result == null ? (
        <div className="flex h-full flex-col gap-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="min-h-24 flex-1" />
        </div>
      ) : (
        <Visualization result={result} compact={compact} tooltipLabel={tooltipLabel} yAxisMin={widget.options?.yAxisMin} yAxisMax={widget.options?.yAxisMax} goalPercent={widget.options?.goalPercent} comparisonLabel={comparisonPeriodText(result, widget.range ? { preset: widget.range } : range)} />
      )}
    </WidgetCard>
  );
}
