"use client";

import { Cell, Pie, PieChart, type PieLabelRenderProps } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MetricResult } from "@/lib/dashboard/types";
import { isMixedCurrency } from "./utils";

export function DonutVisualization({ result, compact = false }: { result: MetricResult; compact?: boolean }) {
  if (isMixedCurrency(result)) {
    return <div className="grid h-full place-items-center text-sm text-muted-foreground">Flere valutaer</div>;
  }
  const values = (result.breakdown ?? result.series.map((series) => ({ key: series.key, label: series.label, value: series.total }))).slice(0, 8);
  const config = Object.fromEntries(values.map((item, index) => [item.key, { label: item.label, color: `var(--chart-${(index % 5) + 1})` }])) satisfies ChartConfig;
  const data = values.map((item) => ({ ...item, fill: `var(--color-${item.key})` }));
  const innerRadius = compact ? "54%" : "48%";
  const outerRadius = compact ? "88%" : "76%";
  function renderLabel({ index, x, y, textAnchor }: PieLabelRenderProps) {
    const label = values[index]?.label;
    if (!label) return null;
    return (
      <text x={x} y={y} textAnchor={textAnchor} dominantBaseline="middle" fill="var(--foreground)" className="fill-foreground" fontSize={compact ? 11 : 10}>
        {label}
      </text>
    );
  }
  return (
    <ChartContainer config={config} className="h-full min-h-0 w-full aspect-auto">
      <PieChart accessibilityLayer>
        <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
        <Pie data={data} dataKey="value" nameKey="key" innerRadius={innerRadius} outerRadius={outerRadius} paddingAngle={2} isAnimationActive={false} label={renderLabel} labelLine={false}>
          {data.map((item) => <Cell key={item.key} fill={item.fill} />)}
        </Pie>
        {!compact ? <ChartLegend content={<ChartLegendContent nameKey="key" className="flex-wrap gap-x-3 gap-y-1" />} /> : null}
      </PieChart>
    </ChartContainer>
  );
}
