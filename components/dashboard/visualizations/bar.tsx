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
import { chartDateTicks, chartModel, chartValueDomain, chartValueDomainFromValues, chartYAxisWidth, formatMetricValue, isMixedCurrency, shortDate } from "./utils";

export function BarVisualization({ result, compact = false, yAxisMin, yAxisMax }: { result: MetricResult; compact?: boolean; yAxisMin?: number; yAxisMax?: number }) {
  if (isMixedCurrency(result)) {
    return <div className="grid h-full place-items-center text-sm text-muted-foreground">Flere valutaer</div>;
  }
  if (result.breakdown?.length) {
    const config = { value: { label: "Værdi", color: "var(--chart-1)" } } satisfies ChartConfig;
    const data = result.breakdown.slice(0, compact ? 4 : 8);
    const domain = chartValueDomainFromValues(data.map((item) => item.value), yAxisMin, yAxisMax);
    return (
      <ChartContainer config={config} className="h-full min-h-0 w-full aspect-auto">
        <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: compact ? 0 : 8, right: compact ? 4 : 16 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" hide={compact} domain={domain} tickFormatter={(value) => formatMetricValue(Number(value), result)} />
          <YAxis hide={compact} dataKey="label" type="category" width={110} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Bar dataKey="value" fill="var(--color-value)" radius={4} />
        </BarChart>
      </ChartContainer>
    );
  }
  const model = chartModel(result);
  const domain = chartValueDomain(model, yAxisMin, yAxisMax);
  return (
    <ChartContainer config={model.config} className="h-full min-h-0 w-full aspect-auto">
      <BarChart accessibilityLayer data={model.data} margin={compact ? { left: 0, right: 4, top: 2, bottom: 0 } : { left: 0, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis hide={compact} dataKey="t" ticks={chartDateTicks(model.data)} interval="preserveStartEnd" tickFormatter={shortDate} tickLine={false} axisLine={false} minTickGap={8} />
        <YAxis hide={compact} width={chartYAxisWidth(domain, result)} domain={domain} tickFormatter={(value) => formatMetricValue(Number(value), result)} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {!compact && result.series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
        {model.keys.map((key) => <Bar key={key} dataKey={key} fill={`var(--color-${key})`} radius={3} />)}
      </BarChart>
    </ChartContainer>
  );
}
