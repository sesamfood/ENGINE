"use client";

import { useMemo } from "react";
import type { RequestForQueries } from "convex/react";
import { useQueries } from "convex-helpers/react/cache/hooks";
import { api } from "@/convex/_generated/api";
import { useAccess, usePermission } from "@/components/app-shell";
import { metricRegistry } from "@/lib/dashboard/registry";
import type { DashboardRange, DashboardScope, MetricResult, WidgetInstance } from "@/lib/dashboard/types";
import { useActiveOrganization } from "@/lib/active-organization";

type FinancialResults = Array<{ key: string; result: MetricResult }>;

export function useFinancialMetrics(
  widgets: WidgetInstance[],
  scope: DashboardScope,
  range: DashboardRange,
  now: number,
  enabled = true,
) {
  const organization = useActiveOrganization();
  const access = useAccess();
  const canView = usePermission("dashboard.view");
  const canViewFinancials = usePermission("dashboard.viewFinancials");
  const allowed = enabled && canView && canViewFinancials && access?.granularity === "detail"
    && !access.kiosk?.kioskModeEnabled && Boolean(organization.data);
  const requests = useMemo(() => enabled ? widgets.flatMap((widget) => {
    if (widget.metric.kind !== "builtin") return [];
    const definition = metricRegistry[widget.metric.id];
    if (definition.source !== "monthlyReport") return [];
    return [{ key: widget.key, metric: widget.metric, visualization: definition.defaultVisualization, range: widget.range }];
  }).sort((a, b) => a.key.localeCompare(b.key)) : [], [enabled, widgets]);
  const queries = useMemo(() => {
    const queries: RequestForQueries = {};
    if (requests.length && allowed) queries.metrics = { query: api.monthlyKpi.getWidgetMetrics, args: { widgets: requests, scope, range, now } };
    return queries;
  }, [requests, scope, range, now, allowed]);
  const loaded: Record<string, FinancialResults | Error | undefined> = useQueries(queries);
  const results = loaded.metrics;

  const byWidget = new Map<string, MetricResult | Error>();
  for (const request of requests) {
    if (!allowed && access && organization.data) {
      byWidget.set(request.key, new Error("Du har ikke adgang til økonomiske data."));
    } else if (results instanceof Error) {
      byWidget.set(request.key, results);
    } else if (results) {
      byWidget.set(request.key, results.find((item) => item.key === request.key)?.result ?? new Error("Økonomitallet mangler i rapporten. Prøv igen."));
    }
  }
  return byWidget;
}
