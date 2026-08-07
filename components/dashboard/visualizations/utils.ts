import type { ChartConfig } from "@/components/ui/chart";
import type { MetricResult, MetricUnit } from "@/lib/dashboard/types";

export function total(result: MetricResult) {
  return result.series.reduce((sum, series) => sum + series.total, 0);
}

export function previousTotal(result: MetricResult) {
  const values = result.series.map((series) => series.previousTotal);
  return values.some((value) => value === null)
    ? null
    : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

export function formatMetricValue(value: number, unit: MetricUnit) {
  if (unit === "currency") {
    return new Intl.NumberFormat("da-DK", {
      style: "currency",
      currency: "DKK",
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

export function shortDate(timestamp: number) {
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "short",
  }).format(timestamp);
}
