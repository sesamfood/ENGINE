"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  useChartWidth,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { DEFAULT_CURRENCY, type MetricResult } from "@/lib/dashboard/types";
import {
  chartDateTicks,
  chartModel,
  chartValueDomain,
  chartYAxisWidth,
  formatMetricValue,
  isMixedCurrency,
  shortDate,
} from "./utils";

export type TimeSeriesProps = {
  result: MetricResult;
  compact?: boolean;
  tooltipLabel?: string;
  yAxisMin?: number;
  yAxisMax?: number;
};

function TimeSeriesAxes({
  result,
  compact,
  domain,
  ticks,
}: {
  result: MetricResult;
  compact: boolean;
  domain: ReturnType<typeof chartValueDomain>;
  ticks: ReturnType<typeof chartDateTicks>;
}) {
  const chartWidth = useChartWidth() ?? 320;
  const narrow = chartWidth < 240;
  const numberFormat = new Intl.NumberFormat("da-DK", {
    notation: "compact",
    maximumFractionDigits: 1,
    ...(result.unit === "currency" && {
      style: "currency",
      currency: result.currency ?? DEFAULT_CURRENCY,
      maximumFractionDigits: 0,
    }),
  });
  const formatTick = (value: number) => {
    if (!narrow) return formatMetricValue(value, result);
    const label = numberFormat.format(value);
    if (result.unit === "percent") return `${label} %`;
    if (result.unit === "hours") return `${label} t`;
    return label;
  };
  return (
    <>
      <XAxis
        hide={compact}
        dataKey="t"
        ticks={ticks}
        interval="preserveStartEnd"
        tickFormatter={narrow ? (timestamp) => new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "numeric" }).format(timestamp) : shortDate}
        tickLine={false}
        axisLine={false}
        minTickGap={8}
        tick={{ fontSize: narrow ? 10 : undefined }}
      />
      <YAxis
        hide={compact}
        width={Math.min(chartYAxisWidth(domain, result), chartWidth * 0.4)}
        domain={domain}
        tickFormatter={(value) => formatTick(Number(value))}
        tickLine={false}
        axisLine={false}
        tick={{ fontSize: narrow ? 10 : undefined }}
      />
    </>
  );
}

export function TimeSeriesVisualization({
  variant,
  result,
  compact = false,
  tooltipLabel,
  yAxisMin,
  yAxisMax,
}: TimeSeriesProps & { variant: "line" | "area" | "bar" }) {
  if (isMixedCurrency(result)) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        Flere valutaer
      </div>
    );
  }
  const model = chartModel(result);
  const domain = chartValueDomain(model, yAxisMin, yAxisMax);
  return (
    <ChartContainer
      config={model.config}
      className="h-full min-h-0 w-full aspect-auto"
    >
      <ComposedChart
        accessibilityLayer
        data={model.data}
        margin={
          compact
            ? { left: 0, right: 4, top: 2, bottom: 0 }
            : { left: 0, right: 12, top: 8 }
        }
      >
        <CartesianGrid vertical={false} />
        <TimeSeriesAxes
          result={result}
          compact={compact}
          domain={domain}
          ticks={chartDateTicks(model.data)}
        />
        <ChartTooltip
          cursor={variant !== "bar"}
          content={
            <ChartTooltipContent
              tooltipTitle={tooltipLabel}
              labelFormatter={(_, payload) =>
                payload?.[0]?.payload?.t ? shortDate(payload[0].payload.t) : ""
              }
            />
          }
        />
        {!compact && result.series.length > 1 ? (
          <ChartLegend
            content={
              <ChartLegendContent
                appearance="compact"
                className="max-h-16 flex-wrap overflow-x-hidden overflow-y-auto [&>div]:min-w-0 [&>div]:max-w-full [&>div]:wrap-anywhere"
              />
            }
          />
        ) : null}
        {model.keys.map((key) =>
          variant === "area" ? (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stroke={`var(--color-${key})`}
              fill={`var(--color-${key})`}
              fillOpacity={0.16}
              strokeWidth={2.5}
            />
          ) : variant === "bar" ? (
            <Bar
              key={key}
              dataKey={key}
              fill={`var(--color-${key})`}
              radius={3}
            />
          ) : (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={`var(--color-${key})`}
              strokeWidth={2.5}
              dot={false}
            />
          ),
        )}
      </ComposedChart>
    </ChartContainer>
  );
}
