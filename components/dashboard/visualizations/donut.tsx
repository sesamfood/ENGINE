"use client";

import { Cell, Pie, PieChart } from "recharts";
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

export function DonutVisualization({ result, compact = false, tooltipLabel }: { result: MetricResult; compact?: boolean; tooltipLabel?: string }) {
  if (isMixedCurrency(result)) {
    return <div className="grid h-full place-items-center text-sm text-muted-foreground">Flere valutaer</div>;
  }
  const values = (result.breakdown ?? result.series.map((series) => ({ key: series.key, label: series.label, value: series.total }))).slice(0, 8);
  const config = Object.fromEntries(values.map((item, index) => [item.key, { label: item.label, color: `var(--chart-${(index % 5) + 1})` }])) satisfies ChartConfig;
  const data = values.map((item) => ({ ...item, fill: `var(--color-${item.key})` }));
  return (
    <ChartContainer config={config} className="h-full min-h-0 w-full aspect-auto">
      <PieChart accessibilityLayer>
        <ChartTooltip content={<ChartTooltipContent nameKey="key" tooltipTitle={tooltipLabel} hideLabel={!tooltipLabel} />} />
        <Pie data={data} dataKey="value" nameKey="key" innerRadius="54%" outerRadius="88%" paddingAngle={2} isAnimationActive={false}>
          {data.map((item) => <Cell key={item.key} fill={item.fill} />)}
        </Pie>
        {!compact ? (
          <ChartLegend
            content={
              <ChartLegendContent
                nameKey="key"
                className="max-h-16 flex-wrap gap-x-3 gap-y-1 overflow-x-hidden overflow-y-auto pt-2 [&>div]:min-w-0 [&>div]:max-w-full [&>div]:wrap-anywhere"
              />
            }
          />
        ) : null}
      </PieChart>
    </ChartContainer>
  );
}
