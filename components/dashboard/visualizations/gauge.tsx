import { Empty, EmptyDescription } from "@/components/ui/empty";
import type { MetricResult } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";
import { formatMetricValue, total } from "./utils";

export function GaugeVisualization({ result, compact = false }: { result: MetricResult; compact?: boolean }) {
  const scaleMax = result.scaleMax;
  if (scaleMax !== undefined) {
    if (result.series.length === 0) {
      return (
        <Empty className="h-full p-0">
          <EmptyDescription>Ingen data</EmptyDescription>
        </Empty>
      );
    }

    const single = result.series.length === 1;
    const formattedMax = formatMetricValue(scaleMax, result);
    return (
      <div
        className={cn(
          "@container h-full min-h-0 overflow-auto",
          single ? "flex flex-col" : "grid content-start gap-x-4 gap-y-3",
          !single && (compact
            ? "auto-rows-[minmax(0,min(100%,7rem))] grid-cols-[repeat(auto-fit,minmax(min(100%,5rem),1fr))]"
            : "auto-rows-[minmax(0,min(100%,8rem))] grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]"),
        )}
      >
        {result.series.map((series) => {
          const ratio = Math.max(0, Math.min(1, series.total / scaleMax));
          const formattedValue = formatMetricValue(series.total, result);
          return (
            <figure
              key={series.key}
              className={cn(
                "flex h-full min-h-0 min-w-0 flex-col items-center gap-3 text-center",
                (compact || !single) && "gap-2",
                single && "justify-center-safe",
              )}
            >
              <div
                className={cn(
                  "min-h-0 shrink",
                  compact ? "size-18" : single ? "size-[min(14rem,100cqw)]" : "size-20",
                )}
                role="meter"
                aria-label={series.label}
                aria-valuemin={0}
                aria-valuemax={scaleMax}
                aria-valuenow={series.total}
                aria-valuetext={`${formattedValue} ud af ${formattedMax}`}
              >
                <svg viewBox="0 0 100 112" className="size-full" aria-hidden="true">
                  <path
                    d="M 24.29 78.64 A 40 40 0 1 1 75.71 78.64"
                    pathLength={100}
                    fill="none"
                    stroke="var(--muted)"
                    strokeWidth={10}
                    strokeLinecap="round"
                  />
                  {ratio > 0 ? (
                    <path
                      d="M 24.29 78.64 A 40 40 0 1 1 75.71 78.64"
                      pathLength={100}
                      fill="none"
                      stroke="var(--success)"
                      strokeWidth={10}
                      strokeLinecap="round"
                      strokeDasharray={`${ratio * 100} 100`}
                    />
                  ) : null}
                  <text
                    x={50}
                    y={67}
                    textAnchor="middle"
                    fill="var(--foreground)"
                    fontSize={24}
                    className="font-semibold tracking-tight tabular-nums"
                  >
                    {formattedValue}
                  </text>
                  <text x={50} y={85} textAnchor="middle" fill="var(--muted-foreground)" fontSize={15}>
                    / {formattedMax}
                  </text>
                </svg>
              </div>
              <figcaption className={cn("max-w-full shrink-0 text-sm font-medium wrap-anywhere", compact && "text-xs")}>
                {series.label}
              </figcaption>
            </figure>
          );
        })}
      </div>
    );
  }

  const value = total(result);
  const numericValue = value ?? 0;
  const target = result.target ?? Math.max(numericValue, 1);
  const ratio = result.mixedCurrency ? 0 : Math.max(0, Math.min(1, numericValue / target));
  return (
    <div className="grid h-full place-items-center">
      <div
        className="grid aspect-square h-full max-h-40 place-items-center rounded-full p-3 sm:p-4"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={result.mixedCurrency ? undefined : numericValue}
        style={{ background: `conic-gradient(var(--primary) ${ratio * 360}deg, var(--muted) 0deg)` }}
      >
        <div className="grid size-full place-items-center rounded-full bg-card text-center">
          <div>
            <p className={compact ? "text-4xl font-semibold leading-none tracking-tight tabular-nums" : "text-3xl font-semibold tracking-tight tabular-nums"}>
              {formatMetricValue(value, result)}
            </p>
            {result.mixedCurrency ? null : (
              <p className="mt-1 text-xs text-muted-foreground">
                Mål {formatMetricValue(target, result)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
