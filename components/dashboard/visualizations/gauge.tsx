import { Empty, EmptyDescription } from "@/components/ui/empty";
import type { MetricResult } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";
import { formatMetricValue, total } from "./utils";
import { KpiVisualization } from "./kpi";

export function GaugeVisualization({ result, compact = false }: { result: MetricResult; compact?: boolean }) {
  const scaleMax = result.scaleMax;
  const maximum = scaleMax ?? result.target;
  const values = scaleMax === undefined ? [total(result)] : result.series.map((series) => series.total);
  if (result.unit === "percent" && (maximum === undefined || maximum <= 0
    || values.some((value) => value !== null && (value < 0 || value > maximum)))) {
    return <KpiVisualization result={result} compact={compact} />;
  }
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
          single ? "flex flex-col" : "grid auto-rows-max content-center-safe gap-x-4 gap-y-3",
          !single && (compact
            ? "grid-cols-[repeat(auto-fit,minmax(min(100%,5rem),1fr))]"
            : "grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]"),
        )}
      >
        {result.series.map((series) => {
          const ratio = Math.max(0, Math.min(1, series.total / scaleMax));
          const formattedValue = formatMetricValue(series.total, result);
          return (
            <figure
              key={series.key}
              className={cn(
                "flex min-w-0 shrink-0 flex-col items-center gap-2 text-center",
                (compact || !single) && "gap-1",
                single && "my-auto",
              )}
            >
              <div
                className={cn(
                  "shrink-0",
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
              <figcaption title={series.label} className="w-full shrink-0 truncate text-xs font-medium">
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
  const formattedValue = formatMetricValue(value, result);
  const targetLabel = `Mål ${formatMetricValue(target, result)}`;
  const valueFontSize = `clamp(1rem, min(${112.5 / formattedValue.length}cqw, ${Math.min(35, 112.5 / formattedValue.length)}cqh), ${compact ? 2.25 : 1.875}rem)`;
  return (
    <div
      className="relative flex h-full min-h-0 min-w-0 items-center justify-center [container-type:size]"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={target}
      aria-valuenow={result.mixedCurrency ? undefined : numericValue}
      aria-valuetext={result.mixedCurrency ? formattedValue : `${formattedValue}, ${targetLabel}`}
    >
      <svg
        viewBox="0 0 160 160"
        className="size-full max-h-40 max-w-40"
        aria-hidden="true"
      >
        <circle cx={80} cy={80} r={72} fill="var(--card)" stroke="var(--muted)" strokeWidth={16} />
        {ratio > 0 ? (
          <circle
            cx={80}
            cy={80}
            r={72}
            pathLength={100}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={16}
            strokeDasharray={`${ratio * 100} 100`}
            transform="rotate(-90 80 80)"
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col overflow-auto" aria-hidden="true">
        <div className="m-auto flex max-w-full shrink-0 flex-col items-center gap-1 text-center">
          <p
            className="max-w-full font-semibold leading-tight tracking-tight wrap-anywhere tabular-nums"
            style={{ fontSize: valueFontSize }}
          >
            {formattedValue}
          </p>
          {result.mixedCurrency ? null : (
            <p className="max-w-full text-xs leading-tight text-muted-foreground wrap-anywhere">
              {targetLabel}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
