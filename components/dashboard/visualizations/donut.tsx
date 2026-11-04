"use client";

import { Cell, Pie, PieChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MetricResult } from "@/lib/dashboard/types";
import { formatMetricValue, isMixedCurrency } from "./utils";

export function DonutVisualization({ result, compact = false, tooltipLabel }: { result: MetricResult; compact?: boolean; tooltipLabel?: string }) {
  if (isMixedCurrency(result)) {
    return <div className="grid h-full place-items-center text-sm text-muted-foreground">Flere valutaer</div>;
  }
  const allValues = result.breakdown ?? result.series.map((series) => ({ key: series.key, label: series.label, value: series.total }));
  const values = allValues.length > 8
    ? [...allValues.slice(0, 7), { key: "other", label: "Øvrige", value: allValues.slice(7).reduce((sum, item) => sum + item.value, 0) }]
    : allValues;
  const data = values.map((item, index) => ({
    ...item,
    key: `slice${index}`,
    fill: `var(--color-slice${index})`,
    color: `oklch(from var(--primary) 0.62 0.16 calc(h + ${index * 45}))`,
  }));
  const config = Object.fromEntries(data.map((item) => [item.key, { label: item.label, color: item.color }])) satisfies ChartConfig;
  const totalValue = data.reduce((sum, item) => sum + item.value, 0);
  const percent = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChartContainer config={config} className="min-h-0 w-full flex-1 aspect-auto">
        <PieChart accessibilityLayer>
          <ChartTooltip content={<ChartTooltipContent nameKey="key" tooltipTitle={tooltipLabel} hideLabel={!tooltipLabel} />} />
          <Pie data={data} dataKey="value" nameKey="key" innerRadius="54%" outerRadius="88%" paddingAngle={2} isAnimationActive={false}>
            {data.map((item) => <Cell key={item.key} fill={item.fill} />)}
          </Pie>
        </PieChart>
      </ChartContainer>
      {!compact ? (
        <ul className="flex max-h-18 shrink-0 flex-wrap justify-center gap-x-3 gap-y-1 overflow-y-auto pt-2 pb-1 text-xs">
          {data.map((item) => (
            <li key={item.key} className="flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-xs"
                // eslint-disable-next-line shadcn/no-inline-styles -- Slice color is generated per index at runtime.
                style={{ backgroundColor: item.color }}
              />
              <span className="truncate">{item.label}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {formatMetricValue(item.value, result)}
                {totalValue > 0 ? ` (${percent.format((item.value / totalValue) * 100)} %)` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
