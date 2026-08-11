import type { MetricResult } from "@/lib/dashboard/types";
import { formatMetricValue, total } from "./utils";

export function KpiVisualization({ result, compact = false }: { result: MetricResult; compact?: boolean }) {
  const value = total(result);
  return (
    <div className="flex h-full flex-col justify-end gap-2">
      <p className={compact ? "text-4xl font-semibold leading-none tracking-tight tabular-nums sm:text-5xl" : "text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl"}>
        {formatMetricValue(value, result)}
      </p>
      {result.series.length > 1 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {result.series.map((series) => (
            <span key={series.key}>
              {series.label}: {formatMetricValue(series.total, result)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
