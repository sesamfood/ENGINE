import type { MetricId } from "./types";

export type DashboardSummarySource =
  | "waste"
  | "badDeliveries"
  | "transfers"
  | "staffFood"
  | "scheduledShifts";

const sourceByMetric: Partial<Record<MetricId, DashboardSummarySource>> = {
  wasteQuantity: "waste",
  wasteRegistrations: "waste",
  badDeliveries: "badDeliveries",
  transfers: "transfers",
  itemsMoved: "transfers",
  staffFoodRegistrations: "staffFood",
  scheduledHours: "scheduledShifts",
};

const locationComparisonSources = [
  "waste",
  "badDeliveries",
  "transfers",
  "staffFood",
] as const satisfies readonly DashboardSummarySource[];

export function dashboardSummarySourcesFor(
  metricIds: readonly MetricId[],
): DashboardSummarySource[] {
  const sources = new Set<DashboardSummarySource>();
  for (const metricId of metricIds) {
    const source = sourceByMetric[metricId];
    if (source) sources.add(source);
    if (metricId === "locationComparison") {
      for (const comparisonSource of locationComparisonSources) {
        sources.add(comparisonSource);
      }
    }
  }
  return [...sources];
}

export function dashboardMetricUsesSummary(metricId: MetricId) {
  return (
    metricId === "locationComparison" || sourceByMetric[metricId] !== undefined
  );
}
