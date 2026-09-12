"use client";

import { useEffect, useMemo, useState } from "react";
import { useConvex, useQueries, type ConvexReactClient, type RequestForQueries } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { useAccess, usePermission } from "@/components/app-shell";
import { authClient } from "@/lib/auth-client";
import { metricRegistry } from "@/lib/dashboard/registry";
import type { DashboardRange, DashboardScope, MetricResult, WidgetInstance } from "@/lib/dashboard/types";
import { getUserErrorMessage } from "@/lib/user-errors";

type FinancialContext = FunctionReturnType<typeof api.economicReports.getWidgetContext>;
type FinancialResults = Array<{ key: string; result: MetricResult }>;
const inFlight = new WeakMap<ConvexReactClient, Map<string, Promise<FinancialResults>>>();

export function useFinancialMetrics(
  widgets: WidgetInstance[],
  scope: DashboardScope,
  range: DashboardRange,
  now: number,
  enabled = true,
) {
  const convex = useConvex();
  const organization = authClient.useActiveOrganization();
  const access = useAccess();
  const canView = usePermission("dashboard.view");
  const canViewFinancials = usePermission("dashboard.viewFinancials");
  const allowed = enabled && canView && canViewFinancials && access?.granularity === "detail"
    && !access.kiosk?.kioskModeEnabled && Boolean(organization.data);
  const accessKey = JSON.stringify([organization.data?.id, access?.role, access?.permissions, access?.locationScope, allowed]);
  const requests = useMemo(() => enabled ? widgets.flatMap((widget) => {
    if (widget.metric.kind !== "builtin") return [];
    const definition = metricRegistry[widget.metric.id];
    if (definition.source !== "economic") return [];
    return [{ key: widget.key, metric: widget.metric, visualization: definition.defaultVisualization, range: widget.range }];
  }).sort((a, b) => a.key.localeCompare(b.key)) : [], [enabled, widgets]);
  const args = useMemo(() => ({ widgets: requests, scope, range, now }), [requests, scope, range, now]);
  const queries = useMemo(() => {
    const queries: RequestForQueries = {};
    if (requests.length && allowed) queries.context = { query: api.economicReports.getWidgetContext, args };
    return queries;
  }, [args, requests.length, allowed]);
  const contexts: Record<string, FinancialContext | Error | undefined> = useQueries(queries);
  const candidate = contexts.context;
  const context = allowed && (candidate instanceof Error || candidate?.organizationId === organization.data?.id) ? candidate : undefined;
  const requestKey = JSON.stringify([args, accessKey, context instanceof Error ? context.message : context]);
  const [loaded, setLoaded] = useState<{ key: string; results: FinancialResults | Error }>();

  useEffect(() => {
    if (!requests.length || !context || context instanceof Error) return;
    let active = true;
    const pending = inFlight.get(convex) ?? new Map<string, Promise<FinancialResults>>();
    inFlight.set(convex, pending);
    let promise = pending.get(requestKey);
    if (!promise) {
      promise = convex.action(api.economicReports.getWidgetMetrics, { ...args, expectedRevision: context.revision });
      pending.set(requestKey, promise);
      void promise.finally(() => pending.delete(requestKey)).catch(() => {});
    }
    void promise.then(
      (results) => { if (active) setLoaded({ key: requestKey, results }); },
      (error: unknown) => {
        if (active) setLoaded({ key: requestKey, results: new Error(getUserErrorMessage(error, "Økonomitallene kunne ikke hentes. Prøv igen.")) });
      },
    );
    return () => { active = false; };
    // The key includes every request field and its authorized context, without layout changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convex, requestKey]);

  const byWidget = new Map<string, MetricResult | Error>();
  for (const request of requests) {
    if (!allowed && access && organization.data) {
      byWidget.set(request.key, new Error("Du har ikke adgang til økonomiske data."));
    } else if (context instanceof Error) {
      byWidget.set(request.key, context);
    } else if (context && loaded?.key === requestKey) {
      byWidget.set(request.key, loaded.results instanceof Error ? loaded.results
        : loaded.results.find((item) => item.key === request.key)?.result ?? new Error("Økonomitallet mangler i rapporten. Prøv igen."));
    }
  }
  return byWidget;
}
