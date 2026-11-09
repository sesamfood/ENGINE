import { DAY_MS, inclusiveDateRangeDays } from "../date";
import { metricRegistry } from "./registry";
import {
  DEFAULT_GOAL_PERCENT,
  type DashboardRange,
  type MetricId,
  type MetricResult,
  type VisualizationId,
  type WidgetInstance,
  type WidgetTarget,
  type TargetPeriod,
} from "./types";

export type BudgetTotals = { sales: number | null; transactions: number | null; currency: string | null };

export type ResolvedTarget = {
  /** Target for the whole widget period, comparable to the headline value. */
  total: number;
  /** Target for one chart point. */
  perPoint: number;
  /** Lower is better, so staying at or under the target counts as reached. */
  ceiling: boolean;
  description: string;
};

export const targetVisualizations: readonly VisualizationId[] = ["kpi", "line", "bar", "area", "goal"];

export const targetPeriodLabels: Record<TargetPeriod, string> = { day: "Dag", week: "Uge", month: "Måned" };
const targetPeriodPhrases: Record<TargetPeriod, string> = { day: "pr. dag", week: "pr. uge", month: "pr. måned" };
const targetPeriodDays: Record<TargetPeriod, number> = { day: 1, week: 7, month: 365.25 / 12 };

export const budgetMetrics: Partial<Record<MetricId, "sales" | "transactions" | "averageBasket">> = {
  salesRevenue: "sales",
  salesOrderCount: "transactions",
  averageBasket: "averageBasket",
};

// Averages and ratios are not summed over days, so their target applies to every point as is.
const nonAdditiveMetrics = new Set<MetricId>([
  "averageBasket", "onlineAverageBasket", "storeAverageBasket", "staffFoodPerEmployee", "googleRating",
]);

export function supportsTarget(widget: Pick<WidgetInstance, "metric" | "visualization">) {
  if (!targetVisualizations.includes(widget.visualization)) return false;
  if (widget.metric.kind === "custom") return true;
  const definition = metricRegistry[widget.metric.id];
  return !definition.live && definition.source !== "economic";
}

/** Whether a manual target is an amount per day, week or month rather than a fixed level. */
export function targetUsesPeriod(metric: WidgetInstance["metric"]) {
  return metric.kind === "custom" || (metricRegistry[metric.id].unit !== "percent" && !nonAdditiveMetrics.has(metric.id));
}

export function supportsBudgetTarget(widget: Pick<WidgetInstance, "metric">) {
  return widget.metric.kind === "builtin" && budgetMetrics[widget.metric.id] !== undefined;
}

/** Goal widgets saved before targets had options always aimed a percentage above the comparison. */
export function widgetTarget(widget: WidgetInstance): WidgetTarget | undefined {
  if (!supportsTarget(widget)) return undefined;
  return widget.options?.target
    ?? (widget.visualization === "goal" ? { kind: "comparison", percent: widget.options?.goalPercent ?? DEFAULT_GOAL_PERCENT } : undefined);
}

export function rangeDays(range: DashboardRange, now: number) {
  switch (range.preset) {
    case "today":
    case "yesterday": return 1;
    case "7days": return 7;
    case "30days": return 30;
    case "thisMonth": return new Date(now).getDate();
    case "custom": return range.from && range.to ? inclusiveDateRangeDays(range.from, range.to) : NaN;
  }
}

function bucketDays(result: MetricResult) {
  const points = result.series[0]?.points ?? [];
  if (points.length < 2) return 1;
  const days = Math.round((points[1].t - points[0].t) / DAY_MS);
  return days >= 28 ? targetPeriodDays.month : Math.max(1, days);
}

function budgetValue(metricId: MetricId, budget: BudgetTotals | null | undefined, result: MetricResult) {
  const kind = budgetMetrics[metricId];
  if (!kind || !budget) return null;
  if (kind === "transactions") return budget.transactions;
  if (budget.currency !== null && result.currency !== undefined && budget.currency !== result.currency) return null;
  if (kind === "sales") return budget.sales;
  return budget.sales !== null && budget.transactions ? budget.sales / budget.transactions : null;
}

export function resolveTarget({
  widget,
  result,
  range,
  now,
  budget,
  previous,
  comparisonLabel,
  formatValue,
}: {
  widget: WidgetInstance;
  result: MetricResult;
  range: DashboardRange;
  now: number;
  budget?: BudgetTotals | null;
  previous: number | null;
  comparisonLabel: string;
  formatValue: (value: number) => string;
}): ResolvedTarget | null {
  const target = widgetTarget(widget);
  if (!target) return null;
  const metricId = widget.metric.kind === "builtin" ? widget.metric.id : undefined;
  const additive = result.unit !== "percent" && result.headlineTotal === undefined
    && !(metricId && nonAdditiveMetrics.has(metricId));
  const days = rangeDays(range, now);
  if (!Number.isFinite(days) || days <= 0) return null;
  const ceiling = metricId !== undefined && metricRegistry[metricId].direction === "down-good";
  const fromTotal = (total: number | null, description: string) =>
    total === null || !Number.isFinite(total)
      ? null
      : { total, perPoint: additive ? (total / days) * bucketDays(result) : total, ceiling, description };

  if (target.kind === "comparison") {
    const percent = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(target.percent);
    return fromTotal(
      previous === null ? null : previous * (1 + target.percent / 100),
      `${percent} % i forhold til ${comparisonLabel} (${previous === null ? "—" : formatValue(previous)})`,
    );
  }
  if (target.kind === "budget") {
    return fromTotal(metricId ? budgetValue(metricId, budget, result) : null, "Budget for perioden");
  }
  const perDay = target.amount / targetPeriodDays[target.period];
  return additive
    ? fromTotal(perDay * days, `${formatValue(target.amount)} ${targetPeriodPhrases[target.period]}`)
    : fromTotal(target.amount, `Fast mål: ${formatValue(target.amount)}`);
}

export function targetReached(current: number, target: ResolvedTarget) {
  return target.ceiling ? current <= target.total : current >= target.total;
}
