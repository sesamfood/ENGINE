import type { ChartConfig } from "@/components/ui/chart";
import {
  DEFAULT_CURRENCY,
  type MetricResult,
  type MetricUnit,
} from "@/lib/dashboard/types";

export function total(result: MetricResult) {
  if (result.unit === "currency" && result.mixedCurrency) return null;
  if (result.headlineTotal !== undefined) return result.headlineTotal;
  return result.series.reduce((sum, series) => sum + series.total, 0);
}

export function previousTotal(result: MetricResult) {
  if (result.unit === "currency" && result.mixedCurrency) return null;
  if (result.headlinePrevious !== undefined) return result.headlinePrevious;
  const values = result.series.map((series) => series.previousTotal);
  return values.some((value) => value === null)
    ? null
    : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

export function isMixedCurrency(result: MetricResult) {
  return result.unit === "currency" && result.mixedCurrency === true;
}

type MetricFormatContext = Pick<
  MetricResult,
  "unit" | "currency" | "mixedCurrency"
>;

export function formatMetricValue(
  value: number | null,
  unitOrContext: MetricUnit | MetricFormatContext,
  fallbackCurrency?: string,
) {
  const context = typeof unitOrContext === "string" ? null : unitOrContext;
  const unit: MetricUnit =
    typeof unitOrContext === "string" ? unitOrContext : unitOrContext.unit;
  if (unit === "currency" && context?.mixedCurrency) return "Flere valutaer";
  if (value === null || !Number.isFinite(value)) return "—";
  if (unit === "currency") {
    return new Intl.NumberFormat("da-DK", {
      style: "currency",
      currency: context?.currency ?? fallbackCurrency ?? DEFAULT_CURRENCY,
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (unit === "percent") {
    return `${new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1 }).format(value)} %`;
  }
  if (unit === "hours") {
    return `${new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1 }).format(value)} t`;
  }
  return new Intl.NumberFormat("da-DK", {
    maximumFractionDigits: unit === "count" ? 0 : 2,
  }).format(value);
}

export function chartModel(result: MetricResult) {
  const data = new Map<number, Record<string, number>>();
  const config: ChartConfig = {};
  result.series.forEach((series, index) => {
    const key = `series${index}`;
    config[key] = {
      label: series.label,
      color: `var(--chart-${(index % 5) + 1})`,
    };
    for (const point of series.points) {
      const row = data.get(point.t) ?? { t: point.t };
      row[key] = point.value;
      data.set(point.t, row);
    }
  });
  return {
    config,
    data: [...data.values()].sort((left, right) => left.t - right.t),
    keys: result.series.map((_, index) => `series${index}`),
  };
}

function valueDomain(values: number[], yAxisMin?: number, yAxisMax?: number) {
  if (!values.length) {
    const lower = yAxisMin ?? 0;
    const upper = yAxisMax ?? 1;
    return lower < upper ? ([lower, upper] as const) : ([0, 1] as const);
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const automatic = min === max
    ? [min - Math.max(Math.abs(min) * 0.1, 1), max + Math.max(Math.abs(max) * 0.1, 1)] as const
    : [min >= 0 ? Math.max(0, min - (max - min) * 0.1) : min - (max - min) * 0.1, max + (max - min) * 0.1] as const;
  const lower = yAxisMin ?? 0;
  const upper = yAxisMax ?? automatic[1];
  return lower < upper ? ([lower, upper] as const) : automatic;
}

export function chartValueDomain(
  model: ReturnType<typeof chartModel>,
  yAxisMin?: number,
  yAxisMax?: number,
) {
  const values = model.data.flatMap((row) =>
    model.keys.flatMap((key) => {
      const value = row[key];
      return typeof value === "number" && Number.isFinite(value) ? [value] : [];
    }),
  );
  return valueDomain(values, yAxisMin, yAxisMax);
}

export function chartValueDomainFromValues(
  values: number[],
  yAxisMin?: number,
  yAxisMax?: number,
) {
  return valueDomain(values, yAxisMin, yAxisMax);
}

export function chartYAxisWidth(domain: readonly [number, number], result: MetricResult) {
  const longest = Math.max(
    ...domain.map((value) => formatMetricValue(value, result).length),
    1,
  );
  return Math.min(132, Math.max(40, longest * 7 + 8));
}

export function chartDateTicks(data: Array<Record<string, number>>) {
  const timestamps = [...new Set(data.map((row) => row.t).filter(Number.isFinite))];
  if (timestamps.length <= 7) return timestamps;

  const indexes = new Set(
    Array.from({ length: 7 }, (_, index) =>
      Math.round((index * (timestamps.length - 1)) / 6),
    ),
  );
  return timestamps.filter((_, index) => indexes.has(index));
}

export function shortDate(timestamp: number) {
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "short",
  }).format(timestamp);
}
