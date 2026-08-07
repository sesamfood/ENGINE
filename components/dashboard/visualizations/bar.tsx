"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MetricResult } from "@/lib/dashboard/types";
import { chartModel, shortDate } from "./utils";

export function BarVisualization({ result, compact = false }: { result: MetricResult; compact?: boolean }) {
  if (result.breakdown?.length) {
    const config = { value: { label: "Værdi", color: "var(--chart-1)" } } satisfies ChartConfig;
    return (
      <ChartContainer config={config} className="h-full min-h-0 w-full aspect-auto">
        <BarChart accessibilityLayer data={result.breakdown.slice(0, compact ? 4 : 8)} layout="vertical" margin={{ left: compact ? 0 : 8, right: compact ? 4 : 16 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" hide />
          <YAxis hide={compact} dataKey="label" type="category" width={110} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Bar dataKey="value" fill="var(--color-value)" radius={4} />
        </BarChart>
      </ChartContainer>
    );
  }
  const model = chartModel(result);
  return (
    <ChartContainer config={model.config} className="h-full min-h-0 w-full aspect-auto">
      <BarChart accessibilityLayer data={model.data} margin={compact ? { left: 0, right: 4, top: 2, bottom: 0 } : { left: 0, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis hide={compact} dataKey="t" tickFormatter={shortDate} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis hide={compact} width={36} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {!compact && result.series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
        {model.keys.map((key) => <Bar key={key} dataKey={key} fill={`var(--color-${key})`} radius={3} />)}
      </BarChart>
    </ChartContainer>
  );
}
