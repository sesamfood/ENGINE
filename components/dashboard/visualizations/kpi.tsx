"use client";

import type { CSSProperties } from "react";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { targetReached, type ResolvedTarget } from "@/lib/dashboard/target";
import type { MetricResult } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";
import { formatMetricValue, total } from "./utils";

export function KpiVisualization({
  result,
  compact = false,
  target,
}: {
  result: MetricResult;
  compact?: boolean;
  target?: ResolvedTarget | null;
}) {
  const value = total(result);
  const label = formatMetricValue(value, result);
  const showTarget = target && value !== null && target.total > 0;
  const visibleSeries = result.series.slice(0, compact ? 2 : 3);
  const hiddenSeries = result.series.length - visibleSeries.length;
  const seriesRows =
    result.series.length > 1
      ? visibleSeries.length + (hiddenSeries > 0 ? 1 : 0)
      : 0;
  const extraRows = seriesRows + (showTarget ? 1 : 0);
  // Fit the label to the card: width by character count, height minus the series rows.
  const fontSize = `clamp(1rem, min(${170 / Math.max(label.length, 1)}cqw, max(2.25rem, (100cqh - ${extraRows * 1.5}rem) * 0.8)), 8rem)`;
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2 overflow-auto @container-size">
      <p
        className="text-(length:--metric-font-size) mt-auto shrink-0 whitespace-nowrap font-semibold leading-tight tracking-tight tabular-nums"
        style={{ "--metric-font-size": fontSize } as CSSProperties}
      >
        {label}
      </p>
      {showTarget ? (
        <p
          className={cn(
            "shrink-0 truncate text-sm tabular-nums",
            targetReached(value, target) ? "text-success" : "text-muted-foreground",
          )}
          title={target.description}
        >
          {target.ceiling ? "Maks." : "Mål"} {formatMetricValue(target.total, result)} ·{" "}
          {new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format((value / target.total) * 100)} %
        </p>
      ) : null}
      {result.series.length > 1 ? (
        <div className="flex min-w-0 shrink-0 flex-col items-start gap-1 text-xs text-muted-foreground">
          <div className="flex min-w-0 max-w-full flex-col gap-1 overflow-hidden">
            {visibleSeries.map((series) => (
              <div
                key={series.key}
                className="flex min-w-0 max-w-full items-center gap-1"
              >
                <span className="min-w-0 truncate">{series.label}:</span>
                <span className="shrink-0 tabular-nums">
                  {formatMetricValue(series.total, result)}
                </span>
              </div>
            ))}
          </div>
          {hiddenSeries > 0 ? (
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    appearance="metricLink"
                    className="h-5 max-w-full min-w-0 justify-start"
                    aria-label={`Vis alle ${result.series.length} grupper`}
                  />
                }
              >
                + {hiddenSeries}{" "}
                {hiddenSeries === 1 ? "gruppe" : "flere grupper"}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80">
                <PopoverHeader>
                  <PopoverTitle>Grupper</PopoverTitle>
                </PopoverHeader>
                <div className="flex max-h-64 flex-col gap-1 overflow-y-auto text-sm">
                  {result.series.map((series) => (
                    <div
                      key={series.key}
                      className="flex min-w-0 items-center justify-between gap-3"
                    >
                      <span className="min-w-0 truncate">{series.label}</span>
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatMetricValue(series.total, result)}
                      </span>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
