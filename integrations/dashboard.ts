import { dashboardDatasets } from "../lib/dashboard/datasets";
import { metricRegistry, type MetricSource } from "../lib/dashboard/registry";
import type { CustomMetricSpec, SalesSource, WidgetInstance } from "../lib/dashboard/types";

export type IntegrationState = { workfeed: boolean; onlinepos: boolean; economic: boolean; wolt: boolean } | undefined;

export function metricSourceAvailable(source: MetricSource, integrations: IntegrationState) {
  if (source === "wolt" || source === "workfeed") return integrations?.[source] === true;
  return true;
}

export function customMetricAvailable(spec: CustomMetricSpec, integrations: IntegrationState) {
  const queries = spec.kind === "single" ? [spec.query] : [spec.numerator, spec.denominator];
  return queries.every((query) => metricSourceAvailable(dashboardDatasets[query.dataset].source, integrations));
}

export function salesSourceOptions(integrations: IntegrationState): Array<{ value: SalesSource; label: string }> {
  return [
    { value: "onlinePos", label: integrations?.onlinepos ? "OnlinePOS" : "Salgsdata" },
    ...(integrations?.wolt ? [{ value: "wolt" as const, label: "Wolt" }, { value: "combined" as const, label: "Kombineret" }] : []),
  ];
}

export function widgetAvailable(widget: WidgetInstance, integrations: IntegrationState) {
  if (widget.metric.kind !== "builtin") return true;
  if (!metricSourceAvailable(metricRegistry[widget.metric.id].source, integrations)) return false;
  return !["wolt", "combined"].includes(widget.options?.salesSource ?? "") || integrations?.wolt === true;
}
