"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { MetricResult } from "@/lib/dashboard/types";
import { chartDateTicks, chartModel, chartValueDomain, chartYAxisWidth, formatMetricValue, isMixedCurrency, shortDate } from "./utils";

export function LineVisualization({ result, compact = false, tooltipLabel, yAxisMin, yAxisMax }: { result: MetricResult; compact?: boolean; tooltipLabel?: string; yAxisMin?: number; yAxisMax?: number }) {
  if (isMixedCurrency(result)) {
    return <div className="grid h-full place-items-center text-sm text-muted-foreground">Flere valutaer</div>;
  }
  const model = chartModel(result);
  const domain = chartValueDomain(model, yAxisMin, yAxisMax);
  return (
    <ChartContainer config={model.config} className="h-full min-h-0 w-full aspect-auto">
      <LineChart accessibilityLayer data={model.data} margin={compact ? { left: 0, right: 4, top: 2, bottom: 0 } : { left: 0, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis hide={compact} dataKey="t" ticks={chartDateTicks(model.data)} interval="preserveStartEnd" tickFormatter={shortDate} tickLine={false} axisLine={false} minTickGap={8} />
        <YAxis hide={compact} width={chartYAxisWidth(domain, result)} domain={domain} tickFormatter={(value) => formatMetricValue(Number(value), result)} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent tooltipTitle={tooltipLabel} labelFormatter={(_, payload) => payload?.[0]?.payload?.t ? shortDate(payload[0].payload.t) : ""} />} />
        {!compact && result.series.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
        {model.keys.map((key) => (
          <Line key={key} type="monotone" dataKey={key} stroke={`var(--color-${key})`} strokeWidth={2.5} dot={false} />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
