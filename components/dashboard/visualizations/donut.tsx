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
import { TableVisualization } from "./table";
import { isMixedCurrency } from "./utils";

export function DonutVisualization({ result, compact = false, tooltipLabel }: { result: MetricResult; compact?: boolean; tooltipLabel?: string }) {
  if (isMixedCurrency(result)) {
    return <div className="grid h-full place-items-center text-sm text-muted-foreground">Flere valutaer</div>;
  }
  if (compact) return <TableVisualization result={result} compact />;
  const rows = result.breakdown ?? result.series.map((series) => ({ key: series.key, label: series.label, value: series.total }));
  const values = rows.slice(0, 8);
  const data = values.map((item, index) => ({
    ...item,
    key: `slice${index}`,
    fill: `var(--color-slice${index})`,
  }));
  const config = Object.fromEntries(data.map((item, index) => [item.key, { label: item.label, color: `var(--chart-${(index % 5) + 1})` }])) satisfies ChartConfig;
  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <ChartContainer config={config} className="min-h-0 w-full flex-1 aspect-auto">
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
                  appearance="compact"
                  className="max-h-16 flex-wrap overflow-x-hidden overflow-y-auto [&>div]:min-w-0 [&>div]:max-w-full [&>div]:wrap-anywhere"
                />
              }
            />
          ) : null}
        </PieChart>
      </ChartContainer>
      {rows.length > values.length ? <p role="status" className="shrink-0 text-xs text-muted-foreground">Viser {values.length} af {rows.length} grupper. Fordelingen gælder de viste grupper.</p> : null}
    </div>
  );
}
