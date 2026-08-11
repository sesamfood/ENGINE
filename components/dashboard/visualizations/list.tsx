import type { MetricResult } from "@/lib/dashboard/types";
import { formatMetricValue } from "./utils";

export function ListVisualization({ result, compact = false }: { result: MetricResult; compact?: boolean }) {
  const rows = result.breakdown ?? result.series.map((series) => ({ key: series.key, label: series.label, value: series.total }));
  return (
    <ol className={compact ? "flex h-full flex-col gap-1 overflow-auto pr-1 text-xs" : "flex h-full flex-col gap-2 overflow-auto pr-1"}>
      {rows.slice(0, 10).map((row, index) => (
        <li key={row.key} className="flex items-center gap-3 text-sm">
          <span className="w-5 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
          <span className="min-w-0 flex-1 truncate">{row.label}</span>
          <span className="font-medium tabular-nums">{formatMetricValue(row.value, result)}</span>
        </li>
      ))}
    </ol>
  );
}
