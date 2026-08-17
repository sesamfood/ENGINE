import dynamic from "next/dynamic";
import { createElement, type ComponentType } from "react";
import { GaugeVisualization } from "@/components/dashboard/visualizations/gauge";
import { KpiVisualization } from "@/components/dashboard/visualizations/kpi";
import { ListVisualization } from "@/components/dashboard/visualizations/list";
import { TableVisualization } from "@/components/dashboard/visualizations/table";
import { Skeleton } from "@/components/ui/skeleton";
import type { MetricResult, VisualizationId } from "./types";

export type VisualizationProps = {
  result: MetricResult;
  compact?: boolean;
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

export const visualizationRegistry: Record<
  VisualizationId,
  ComponentType<VisualizationProps>
> = {
  kpi: KpiVisualization,
  line: LineVisualization,
  bar: BarVisualization,
  area: AreaVisualization,
  donut: DonutVisualization,
  gauge: GaugeVisualization,
  list: ListVisualization,
  table: TableVisualization,
};
