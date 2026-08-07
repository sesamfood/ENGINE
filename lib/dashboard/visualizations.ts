import type { ComponentType } from "react";
import { AreaVisualization } from "@/components/dashboard/visualizations/area";
import { BarVisualization } from "@/components/dashboard/visualizations/bar";
import { DonutVisualization } from "@/components/dashboard/visualizations/donut";
import { GaugeVisualization } from "@/components/dashboard/visualizations/gauge";
import { KpiVisualization } from "@/components/dashboard/visualizations/kpi";
import { LineVisualization } from "@/components/dashboard/visualizations/line";
import { ListVisualization } from "@/components/dashboard/visualizations/list";
import { TableVisualization } from "@/components/dashboard/visualizations/table";
import type { MetricResult, VisualizationId } from "./types";

export type VisualizationProps = {
  result: MetricResult;
  compact?: boolean;
};

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
