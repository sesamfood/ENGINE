"use client";

import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import type { MetricResult } from "@/lib/dashboard/types";
import { formatMetricValue, total } from "./utils";

export function KpiVisualization({
  result,
  compact = false,
}: {
  result: MetricResult;
  compact?: boolean;
}) {
  const value = total(result);
  const label = formatMetricValue(value, result);
  const fontSize = `clamp(1.5rem, ${24 / Math.max(label.length, 1)}rem, 3rem)`;
  const visibleSeries = result.series.slice(0, compact ? 2 : 3);
  const hiddenSeries = result.series.length - visibleSeries.length;
  return (
    <div className="flex h-full min-w-0 flex-col justify-end gap-2 overflow-hidden">
      <p
        className={
          compact
            ? "max-w-full truncate font-semibold leading-none tracking-tight tabular-nums"
            : "max-w-full truncate font-semibold tracking-tight tabular-nums"
        }
        style={{ fontSize }}
      >
        {label}
      </p>
      {result.series.length > 1 ? (
        <div className="flex min-h-0 min-w-0 flex-col items-start gap-1 overflow-hidden text-xs text-muted-foreground">
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
                    className="h-5 max-w-full min-w-0 justify-start truncate px-0 text-xs text-muted-foreground"
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
