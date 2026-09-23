"use client";

import { Bar, BarChart, CartesianGrid, Text, XAxis, YAxis, useChartWidth } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  chartValueDomainFromValues,
  formatMetricValue,
  isMixedCurrency,
} from "./utils";
import { TableVisualization } from "./table";
import { TimeSeriesVisualization, type TimeSeriesProps } from "./time-series";

function BreakdownAxis({ compact }: { compact: boolean }) {
  const chartWidth = useChartWidth();
  const axisWidth = Math.min(110, (chartWidth ?? 275) * 0.4);
  return (
    <YAxis
      hide={compact}
      dataKey="label"
      type="category"
      width={axisWidth}
      tickLine={false}
      axisLine={false}
      tickSize={0}
      tickMargin={4}
      tick={({ x, y, payload }) => (
        <Text
          x={x}
          y={y}
          width={Math.max(0, axisWidth - 4)}
          maxLines={1}
          textAnchor="end"
          verticalAnchor="middle"
          // eslint-disable-next-line shadcn/no-inline-styles -- Recharts reads this style to measure and truncate tick text.
          style={{ fontSize: 11 }}
          className="fill-muted-foreground"
        >
          {String(payload.value)}
        </Text>
      )}
    />
  );
}

export function BarVisualization({
  result,
  compact = false,
  tooltipLabel,
  yAxisMin,
  yAxisMax,
}: TimeSeriesProps) {
  if (isMixedCurrency(result)) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        Flere valutaer
      </div>
    );
  }
  if (result.breakdown?.length) {
    if (compact) return <TableVisualization result={result} compact />;
    const config = { value: { label: "Værdi", color: "var(--chart-1)" } } satisfies ChartConfig;
    const data = result.breakdown.slice(0, 8);
    const domain = chartValueDomainFromValues(data.map((item) => item.value), yAxisMin, yAxisMax);
    return (
      <div className="flex h-full min-h-0 flex-col gap-1">
        <ChartContainer config={config} className="min-h-0 w-full flex-1 aspect-auto">
          <BarChart accessibilityLayer data={data} layout="vertical" margin={{ left: compact ? 0 : 8, right: compact ? 4 : 16 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" hide={compact} domain={domain} tickFormatter={(value) => formatMetricValue(Number(value), result)} />
            <BreakdownAxis compact={compact} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
            <Bar dataKey="value" fill="var(--color-value)" radius={4} />
          </BarChart>
        </ChartContainer>
        {result.breakdown.length > data.length ? <p role="status" className="shrink-0 text-xs text-muted-foreground">Viser {data.length} af {result.breakdown.length} grupper.</p> : null}
      </div>
    );
  }
  return (
    <TimeSeriesVisualization
      variant="bar"
      result={result}
      compact={compact}
      tooltipLabel={tooltipLabel}
      yAxisMin={yAxisMin}
      yAxisMax={yAxisMax}
    />
  );
}
