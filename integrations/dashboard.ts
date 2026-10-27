import type { FeatureId } from "../lib/features";
import { dashboardDatasets } from "../lib/dashboard/datasets";
import { metricRegistry, type MetricSource } from "../lib/dashboard/registry";
import type { CustomMetricSpec, SalesSource, WidgetInstance } from "../lib/dashboard/types";

export type IntegrationState = { workfeed: boolean; onlinepos: boolean; economic: boolean; wolt: boolean } | undefined;

export function metricSourceAvailable(source: MetricSource, integrations: IntegrationState) {
  if (source === "wolt" || source === "workfeed") return integrations?.[source] === true;
  return true;
}

export function metricFeaturesAvailable(features: readonly FeatureId[] | undefined, disabledFeatures: readonly FeatureId[]) {
  return !features?.some((feature) => disabledFeatures.includes(feature));
}

export function customMetricFeaturesAvailable(spec: CustomMetricSpec, disabledFeatures: readonly FeatureId[]) {
  const queries = spec.kind === "single" ? [spec.query] : [spec.numerator, spec.denominator];
  return queries.every((query) => {
    const feature = dashboardDatasets[query.dataset].feature;
    return !feature || !disabledFeatures.includes(feature);
  });
}

export function customMetricAvailable(spec: CustomMetricSpec, integrations: IntegrationState, disabledFeatures: readonly FeatureId[] = []) {
  const queries = spec.kind === "single" ? [spec.query] : [spec.numerator, spec.denominator];
  return queries.every((query) => metricSourceAvailable(dashboardDatasets[query.dataset].source, integrations))
    && customMetricFeaturesAvailable(spec, disabledFeatures);
}

export function salesSourceOptions(integrations: IntegrationState): Array<{ value: SalesSource; label: string }> {
  return [
    { value: "onlinePos", label: integrations?.onlinepos ? "OnlinePOS" : "Salgsdata" },
    ...(integrations?.onlinepos
      ? [{ value: "onlinePosStore" as const, label: "OnlinePOS i butik" }, { value: "onlinePosOnline" as const, label: "OnlinePOS online" }]
      : []),
    ...(integrations?.wolt ? [{ value: "wolt" as const, label: "Wolt" }, { value: "combined" as const, label: "Kombineret" }] : []),
  ];
}

export function widgetAvailable(widget: WidgetInstance, integrations: IntegrationState, disabledFeatures: readonly FeatureId[] = []) {
  if (widget.metric.kind !== "builtin") return true;
  const definition = metricRegistry[widget.metric.id];
  if (!metricSourceAvailable(definition.source, integrations)) return false;
  if (!metricFeaturesAvailable(definition.features, disabledFeatures)) return false;
  return !["wolt", "combined"].includes(widget.options?.salesSource ?? "") || integrations?.wolt === true;
}
