import type { CSSProperties } from "react";
import { Empty, EmptyDescription } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { targetReached, type ResolvedTarget } from "@/lib/dashboard/target";
import type { MetricResult } from "@/lib/dashboard/types";
import { formatMetricValue, total } from "./utils";

export function GoalVisualization({
  result,
  compact = false,
  target,
}: {
  result: MetricResult;
  compact?: boolean;
  target?: ResolvedTarget | null;
}) {
  const current = total(result);
  if (current === null || !target || target.total <= 0) {
    return (
      <Empty appearance="flush" className="h-full">
        <EmptyDescription>Der er ingen data at beregne målet ud fra.</EmptyDescription>
      </Empty>
    );
  }

  const progress = (current / target.total) * 100;
  const reached = targetReached(current, target);
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
        <span className="text-sm text-muted-foreground tabular-nums">
          {target.ceiling ? "maks. " : "af "}{formatMetricValue(target.total, result)}
        </span>
      </p>
      <Progress
        value={Math.max(0, Math.min(100, progress))}
        aria-label="Fremskridt mod målet"
        aria-valuetext={`${Math.round(progress)} % af målet`}
        size="lg"
        tone={reached ? "success" : "default"}
      />
      <p className="text-sm font-medium tabular-nums">
        {new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(progress)} % af målet
        {reached ? (target.ceiling ? " · Under målet" : " · Nået") : target.ceiling ? " · Over målet" : ""}
      </p>
      {compact ? null : <p className="text-xs text-muted-foreground">{target.description}</p>}
    </div>
  );
}
