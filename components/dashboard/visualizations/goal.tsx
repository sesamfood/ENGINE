import type { CSSProperties } from "react";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { DEFAULT_GOAL_PERCENT, type MetricResult } from "@/lib/dashboard/types";
import { formatMetricValue, previousTotal, total } from "./utils";

const percentFormat = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1, signDisplay: "exceptZero" });

export function GoalVisualization({
  result,
  compact = false,
  goalPercent = DEFAULT_GOAL_PERCENT,
  comparisonLabel = "den foregående periode",
}: {
  result: MetricResult;
  compact?: boolean;
  goalPercent?: number;
  comparisonLabel?: string;
}) {
  const current = total(result);
  const baseline = previousTotal(result);
  const target = baseline === null ? null : baseline * (1 + goalPercent / 100);
  if (current === null || target === null || target <= 0) {
    return (
      <Empty appearance="flush" className="h-full">
        <EmptyDescription>Der er ingen sammenligningsdata at beregne målet ud fra.</EmptyDescription>
      </Empty>
    );
  }

  const progress = (current / target) * 100;
  const reached = progress >= 100;
  const value = formatMetricValue(current, result);
  const fontSize = `clamp(1rem, ${160 / Math.max(value.length, 1)}cqw, ${compact ? 2 : 3}rem)`;
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col justify-center gap-2 overflow-auto @container">
      <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <span
          className="text-(length:--metric-font-size) whitespace-nowrap font-semibold leading-tight tracking-tight tabular-nums"
          style={{ "--metric-font-size": fontSize } as CSSProperties}
        >
          {value}
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">af {formatMetricValue(target, result)}</span>
      </p>
      <Progress
        value={Math.max(0, Math.min(100, progress))}
        aria-label="Fremskridt mod målet"
        aria-valuetext={`${Math.round(progress)} % af målet`}
        size="lg"
        tone={reached ? "success" : "default"}
      />
      <p className="text-sm font-medium tabular-nums">
        {new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(progress)} % af målet{reached ? " · Nået" : ""}
      </p>
      {compact ? null : (
        <p className="text-xs text-muted-foreground">
          Mål: {percentFormat.format(goalPercent)} % i forhold til {comparisonLabel} ({formatMetricValue(baseline, result)})
        </p>
      )}
    </div>
  );
}
