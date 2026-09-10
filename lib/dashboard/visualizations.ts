import dynamic from "next/dynamic";
import { createElement, type ComponentType } from "react";
import { GaugeVisualization } from "@/components/dashboard/visualizations/gauge";
import { KpiVisualization } from "@/components/dashboard/visualizations/kpi";
import { ListVisualization } from "@/components/dashboard/visualizations/list";
import { TableVisualization } from "@/components/dashboard/visualizations/table";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { MetricResult, VisualizationId } from "./types";

export type VisualizationProps = {
  result: MetricResult;
  compact?: boolean;
  tooltipLabel?: string;
  yAxisMin?: number;
  yAxisMax?: number;
};

const visualizationLoading = () =>
  createElement(Skeleton, { className: "h-full min-h-24 w-full" });

const LineVisualization = dynamic<VisualizationProps>(
  () =>
    import("@/components/dashboard/visualizations/line").then(
      (module) => module.LineVisualization,
    ),
  { loading: visualizationLoading },
);
const BarVisualization = dynamic<VisualizationProps>(
  () =>
    import("@/components/dashboard/visualizations/bar").then(
      (module) => module.BarVisualization,
    ),
  { loading: visualizationLoading },
);
const AreaVisualization = dynamic<VisualizationProps>(
  () =>
    import("@/components/dashboard/visualizations/area").then(
      (module) => module.AreaVisualization,
    ),
  { loading: visualizationLoading },
);
const DonutVisualization = dynamic<VisualizationProps>(
  () =>
    import("@/components/dashboard/visualizations/donut").then(
      (module) => module.DonutVisualization,
    ),
  { loading: visualizationLoading },
);

function withEmptyState(Visualization: ComponentType<VisualizationProps>) {
  return function VisualizationWithEmptyState(props: VisualizationProps) {
    if (props.result.emptyMessage !== undefined) {
      return createElement(
        Empty,
        {
          role: "status",
          tabIndex: 0,
          className: "h-full min-h-0 justify-start overflow-y-auto p-0",
        },
        createElement(
          EmptyDescription,
          { className: "my-auto w-full shrink-0 wrap-anywhere" },
          props.result.emptyMessage,
        ),
      );
    }
    if (props.result.partialMessage !== undefined) {
      return createElement(
        "div",
        { className: "flex h-full min-h-0 min-w-0 flex-col gap-1" },
        createElement(
          "div",
          { className: "min-h-0 min-w-0 flex-1" },
          createElement(Visualization, props),
        ),
        createElement(
          "p",
          {
            role: "status",
            className: "shrink-0 text-xs leading-tight text-muted-foreground wrap-anywhere",
          },
          props.result.partialMessage,
        ),
      );
    }
    return createElement(Visualization, props);
  };
}

export const visualizationRegistry: Record<
  VisualizationId,
  ComponentType<VisualizationProps>
> = {
  kpi: withEmptyState(KpiVisualization),
  line: withEmptyState(LineVisualization),
  bar: withEmptyState(BarVisualization),
  area: withEmptyState(AreaVisualization),
  donut: withEmptyState(DonutVisualization),
  gauge: withEmptyState(GaugeVisualization),
  list: withEmptyState(ListVisualization),
  table: withEmptyState(TableVisualization),
};
