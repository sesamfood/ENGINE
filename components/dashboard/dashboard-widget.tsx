"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { ComparisonPeriod, DashboardRange, MetricResult, SalesSource, WidgetInstance, WidgetRangePreset, WidgetSize, WidgetTarget, VisualizationId } from "@/lib/dashboard/types";
import { resolveTarget, type BudgetTotals } from "@/lib/dashboard/target";
import type { YAxisValues } from "./y-axis-settings";
import { visualizationRegistry } from "@/lib/dashboard/visualizations";
import { widgetSizeSpans } from "@/lib/dashboard/layout";
import { WidgetCard } from "./widget-card";
import { comparisonPeriodText, formatMetricValue, previousTotal } from "./visualizations/utils";
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
  now,
  budget,
  editable,
  resizing,
  onVisualizationChange,
  visualizations,
  onRangeChange,
  onComparisonChange,
  onSalesSourceChange,
  onYAxisChange,
  onTargetChange,
  onEditCustomMetric,
  onLiveRetry,
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
  now: number;
  budget?: BudgetTotals | null;
  editable: boolean;
  resizing?: boolean;
  onVisualizationChange?: (visualization: VisualizationId) => void;
  visualizations?: readonly VisualizationId[];
  onRangeChange?: (range: WidgetRangePreset | undefined) => void;
  onComparisonChange?: (comparison: ComparisonPeriod | undefined) => void;
  onSalesSourceChange?: (salesSource: SalesSource) => void;
  onYAxisChange?: (axis: YAxisValues) => void;
  onTargetChange?: (target: WidgetTarget | undefined) => void;
  onEditCustomMetric?: () => void;
  onLiveRetry?: () => void;
  onResize?: (size: WidgetSize, complete: boolean) => void;
  onRemove?: () => void;
}) {
  const Visualization = visualizationRegistry[widget.visualization];
  const compact = widgetSizeSpans[widget.size].rows === 1;
  const widgetRange = widget.range ? { preset: widget.range } : range;
  const target = result && widgetRange ? resolveTarget({
    widget,
    result,
    range: widgetRange,
    now,
    budget,
    previous: previousTotal(result),
    comparisonLabel: comparisonPeriodText(result, widgetRange),
    formatValue: (value) => formatMetricValue(value, result),
  }) : null;

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
      target={target}
      onTargetChange={onTargetChange}
      onEditCustomMetric={onEditCustomMetric}
      onResize={onResize}
      onRemove={onRemove}
    >
      {live ? <LiveMetricContent widget={widget} state={live} compact={compact} onRetry={onLiveRetry} /> : error ? (
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
      ) : result == null ? (
        <div className="flex h-full flex-col gap-3" aria-busy="true">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="min-h-24 flex-1" />
          <p className="text-sm text-muted-foreground" role="status">
            Indlæser data …
          </p>
        </div>
      ) : (
        <Visualization result={result} compact={compact} tooltipLabel={tooltipLabel} yAxisMin={widget.options?.yAxisMin} yAxisMax={widget.options?.yAxisMax} target={target} />
      )}
    </WidgetCard>
  );
}
