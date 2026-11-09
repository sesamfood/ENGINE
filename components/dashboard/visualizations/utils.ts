import type { ChartConfig } from "@/components/ui/chart";
import { periodPosition, type ResolvedTarget } from "@/lib/dashboard/target";
import {
  DEFAULT_CURRENCY,
  type DashboardRange,
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

export function comparisonPeriodText(result: MetricResult | undefined, range: DashboardRange | undefined) {
  if (result?.comparison === "lastYear") return "samme ugedage sidste år";
  switch (range?.preset) {
    case "today": return "i går";
    case "yesterday": return "dagen før";
    case "7days": return "de foregående 7 dage";
    case "30days": return "de foregående 30 dage";
    case "thisMonth": return "den foregående måned";
    default: return "den foregående tilsvarende periode";
  }
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

export function seriesSummary(result: MetricResult) {
  return result.series
    .map((series) => {
      if (!series.points.length) return `${series.label}: ingen data i perioden`;
      const values = series.points.map((point) => point.value);
      return `${series.label}: i alt ${formatMetricValue(series.total, result)}, højeste ${formatMetricValue(Math.max(...values), result)}, laveste ${formatMetricValue(Math.min(...values), result)}`;
    })
    .join(". ");
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
  const rows = [...data.values()].sort((left, right) => left.t - right.t);
  // The current day is incomplete; plotting it reads as a collapse.
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const completeRows = rows.length > 1 && rows[rows.length - 1].t >= startOfToday ? rows.slice(0, -1) : rows;
  return {
    config,
    data: completeRows,
    keys: result.series.map((_, index) => `series${index}`),
  };
}

/**
 * Adds the target to each day of one daily series. Weekly and monthly targets turn both the
 * series and the target into running totals that restart each period.
 */
export function targetChartModel(
  model: ReturnType<typeof chartModel>,
  chart: NonNullable<ResolvedTarget["chart"]>,
) {
  const [key] = model.keys;
  const running = chart.period !== "day";
  let periodId = "";
  let actualTotal = 0;
  let targetTotal = 0;
  const data = model.data.map((row) => {
    const { id } = periodPosition(row.t, chart.period);
    if (id !== periodId) {
      periodId = id;
      actualTotal = 0;
      targetTotal = 0;
    }
    const value = row[key] ?? 0;
    const target = chart.dailyTarget(row.t);
    actualTotal += value;
    // A period cut off by the range start only counts the days shown, for both lines.
    targetTotal += target;
    return running
      ? { ...row, daily: value, [key]: actualTotal, target: targetTotal }
      : { ...row, target };
  });
  const config: ChartConfig = {
    ...model.config,
    ...(running ? { [key]: { ...model.config[key], label: "Løbende total" }, daily: { label: "Dag", color: "transparent" } } : {}),
    target: { label: "Mål", color: "var(--foreground)" },
  };
  return { config, data, keys: model.keys, running };
}

function niceCeil(value: number) {
  if (!Number.isFinite(value) || value <= 0) return value;
  const base = 10 ** Math.floor(Math.log10(value));
  const fraction = value / base;
  const nice = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((step) => fraction <= step) ?? 10;
  return nice * base;
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
    ? [min - Math.max(Math.abs(min) * 0.1, 1), niceCeil(max + Math.max(Math.abs(max) * 0.1, 1))] as const
    : [min >= 0 ? Math.max(0, min - (max - min) * 0.1) : min - (max - min) * 0.1, niceCeil(max + (max - min) * 0.1)] as const;
  const lower = yAxisMin ?? 0;
  const upper = yAxisMax ?? automatic[1];
  return lower < upper ? ([lower, upper] as const) : automatic;
}

export function chartValueDomain(
  model: ReturnType<typeof chartModel>,
  yAxisMin?: number,
  yAxisMax?: number,
  extraValues: number[] = [],
) {
  const values = model.data.flatMap((row) =>
    model.keys.flatMap((key) => {
      const value = row[key];
      return typeof value === "number" && Number.isFinite(value) ? [value] : [];
    }),
  );
  return valueDomain([...values, ...extraValues], yAxisMin, yAxisMax);
}

export function chartValueDomainFromValues(
  values: number[],
  yAxisMin?: number,
  yAxisMax?: number,
) {
  return valueDomain(values, yAxisMin, yAxisMax);
}

export function chartValueTicks(domain: readonly [number, number]) {
  const [lower, upper] = domain;
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || upper <= lower) {
    return [lower, upper];
  }
  const span = upper - lower;
  const base = 10 ** Math.floor(Math.log10(span));
  const candidates = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10].map(
    (factor) => factor * base,
  );
  for (const step of candidates) {
    const count = span / step;
    if (Math.abs(count - Math.round(count)) > 1e-9) continue;
    if (count < 2 || count > 6) continue;
    return Array.from({ length: Math.round(count) + 1 }, (_, index) =>
      Number((lower + index * step).toPrecision(12)),
    );
  }
  return Array.from({ length: 5 }, (_, index) => lower + (span * index) / 4);
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
