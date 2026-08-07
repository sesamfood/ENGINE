import type { CSSProperties } from "react";
import type { MetricResult } from "@/lib/dashboard/types";
import { formatMetricValue, total } from "./utils";

export function GaugeVisualization({ result, compact = false }: { result: MetricResult; compact?: boolean }) {
  const value = total(result);
  const target = result.target ?? Math.max(value, 1);
  const ratio = Math.max(0, Math.min(1, value / target));
  return (
    <div className="grid h-full place-items-center">
      <div
        className="grid aspect-square h-full max-h-40 place-items-center rounded-full p-3 sm:p-4"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={value}
        style={{ background: `conic-gradient(var(--primary) ${ratio * 360}deg, var(--muted) 0deg)` } as CSSProperties}
      >
        <div className="grid size-full place-items-center rounded-full bg-card text-center">
          <div>
            <p className={compact ? "text-4xl font-semibold leading-none tracking-tight tabular-nums" : "text-3xl font-semibold tracking-tight tabular-nums"}>
              {formatMetricValue(value, result.unit)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Mål {formatMetricValue(target, result.unit)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
