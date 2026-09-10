"use client";

import { useEffect, useMemo, useState } from "react";
import { useConvex, useQueries, type ConvexReactClient, type RequestForQueries } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { metricRegistry } from "@/lib/dashboard/registry";
import type { DashboardScope, LiveMetricResult, MetricId, WidgetInstance } from "@/lib/dashboard/types";
import { getUserErrorMessage } from "@/lib/user-errors";

type LiveContext = FunctionReturnType<typeof api.dashboardLive.getContext>;
export type LiveMetricState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; data: LiveMetricResult };
type LiveGroup = { metricId: MetricId; visualization: WidgetInstance["visualization"] };
type PendingRead = {
  context: string;
  metricId: MetricId;
  locationIds: Set<string>;
  promise: Promise<LiveMetricResult>;
};
type LoadedMetric = {
  identityKey: string;
  requestKey: string;
  context: LiveContext;
  state: Exclude<LiveMetricState, { kind: "loading" }>;
};

function reusableData(entry: LoadedMetric | undefined, context: LiveContext, identityKey: string) {
  if (!entry || entry.identityKey !== identityKey || entry.state.kind !== "ready") return undefined;
  const previous = new Map(entry.context.locations.map((location) => [String(location.id), location]));
  const names = new Map(context.locations.filter((location) => previous.get(location.id)?.placeId === location.placeId).map((location) => [String(location.id), location.name]));
  const data = entry.state.data;
  const locations = data.locations.flatMap((location) => {
    const label = names.get(location.key);
    return label === undefined ? [] : [{ ...location, label }];
  });
  if (!locations.length && context.locations.length) return undefined;
  return {
    ...data,
    locations,
    result: {
      ...data.result,
      series: data.result.series.flatMap((series) => {
        const label = names.get(series.key);
        return label === undefined ? [] : [{ ...series, label }];
      }),
      truncated: context.truncated,
    },
  };
}

// Only unfinished requests are shared. Completed Google content lives in mounted views.
const inFlight = new WeakMap<ConvexReactClient, Set<PendingRead>>();

async function readLiveMetric(
  convex: ConvexReactClient,
  group: LiveGroup,
  scope: DashboardScope,
  context: LiveContext,
  existing?: LiveMetricResult,
): Promise<LiveMetricResult> {
  const limit = metricRegistry[group.metricId].live?.locationLimits[group.visualization] ?? 0;
  const locations = context.locations.slice(0, limit);
  const contextKey = JSON.stringify(context);
  const pending = inFlight.get(convex) ?? new Set<PendingRead>();
  inFlight.set(convex, pending);
  const remaining = new Set(locations.map((location) => String(location.id)));
  const reads: Promise<LiveMetricResult>[] = existing ? [Promise.resolve(existing)] : [];
  for (const location of existing?.locations ?? []) remaining.delete(location.key);
  for (const entry of pending) {
    if (entry.context !== contextKey || entry.metricId !== group.metricId ||
      ![...remaining].some((id) => entry.locationIds.has(id))) continue;
    reads.push(entry.promise);
    for (const id of entry.locationIds) remaining.delete(id);
  }
  if (remaining.size || (!locations.length && !existing)) {
    const locationIds = locations.filter((location) => remaining.has(location.id)).map((location) => location.id);
    const promise = convex.action(api.dashboardLive.getMetric, {
      ...group, scope, locationIds, expectedContext: contextKey,
    });
    const entry: PendingRead = { context: contextKey, metricId: group.metricId, locationIds: new Set(locationIds), promise };
    pending.add(entry);
    void promise.finally(() => pending.delete(entry)).catch(() => {});
    reads.push(promise);
  }
  const parts = await Promise.all(reads);
  const statuses = new Map(parts.flatMap((part) => part.locations.map((location) => [location.key, location] as const)));
  const series = new Map(parts.flatMap((part) => part.result.series.map((item) => [item.key, item] as const)));
  const attributions = new Map(parts.flatMap((part) => part.attributions.map((item) => [JSON.stringify(item), item] as const)));
  const knownLocations = context.locations.filter((location) => statuses.has(location.id));
  return {
    result: {
      unit: metricRegistry[group.metricId].unit,
      scaleMax: parts[0]?.result.scaleMax,
      series: knownLocations.flatMap((location) => { const item = series.get(location.id); return item ? [item] : []; }),
      truncated: context.truncated,
    },
    locations: knownLocations.flatMap((location) => { const item = statuses.get(location.id); return item ? [item] : []; }),
    retrievedAt: Math.min(...parts.map((part) => part.retrievedAt)),
    attributions: [...attributions.values()],
  };
}

export function useLiveMetrics(widgets: WidgetInstance[], scope: DashboardScope, enabled = true) {
  const convex = useConvex();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const groups = useMemo(() => {
    const byMetric = new Map<MetricId, LiveGroup>();
    if (!enabled) return [];
    for (const widget of widgets) {
      if (widget.metric.kind !== "builtin") continue;
      const live = metricRegistry[widget.metric.id].live;
      if (!live) continue;
      const current = byMetric.get(widget.metric.id);
      if (!current || (live.locationLimits[widget.visualization] ?? 0) > (live.locationLimits[current.visualization] ?? 0)) {
        byMetric.set(widget.metric.id, { metricId: widget.metric.id, visualization: widget.visualization });
      }
    }
    return [...byMetric.values()];
  }, [enabled, widgets]);
  useEffect(() => {
    if (!groups.length) return;
    const timer = window.setInterval(() => setRefreshVersion((version) => version + 1), 24 * 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [groups.length]);
  const queries = useMemo(() => Object.fromEntries(groups.map((group): [string, RequestForQueries[string]] => [
    group.metricId,
    { query: api.dashboardLive.getContext, args: { metricId: group.metricId, scope } },
  ])), [groups, scope]);
  const contexts: Record<string, LiveContext | Error | undefined> = useQueries(queries);
  const [loaded, setLoaded] = useState<Record<string, LoadedMetric>>({});
  const requests = groups.map((group) => {
    const context = contexts[group.metricId];
    const identityKey = JSON.stringify([group.metricId, context && !(context instanceof Error) ? [context.organizationId, context.userIdentifier] : null, refreshVersion]);
    return { group, context, identityKey, key: JSON.stringify([group, context instanceof Error ? context.message : context, identityKey]) };
  });
  const requestKey = JSON.stringify(requests.map(({ key }) => key));
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setLoaded((current) => Object.fromEntries(requests.flatMap(({ group, context, identityKey, key }) => {
        if (!context || context instanceof Error) return [];
        const data = reusableData(current[group.metricId], context, identityKey);
        return data ? [[group.metricId, { identityKey, requestKey: key, context, state: { kind: "ready", data } } satisfies LoadedMetric]] : [];
      })));
    });
    for (const { group, context, identityKey, key } of requests) {
      if (!context || context instanceof Error) continue;
      void readLiveMetric(convex, group, scope, context, reusableData(loaded[group.metricId], context, identityKey)).then(
        (data) => {
          if (active) setLoaded((current) => ({ ...current, [group.metricId]: { identityKey, requestKey: key, context, state: { kind: "ready", data } } }));
        },
        (error: unknown) => {
          if (active) setLoaded((current) => ({ ...current, [group.metricId]: { identityKey, requestKey: key, context, state: { kind: "error", message: getUserErrorMessage(error, "Målingen kunne ikke indlæses. Prøv igen.") } } }));
        },
      );
    }
    return () => { active = false; };
    // These values describe the requests. Dates and layout changes must not trigger paid reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convex, requestKey]);

  const byWidget = new Map<string, LiveMetricState>();
  for (const widget of widgets) {
    if (widget.metric.kind !== "builtin" || !metricRegistry[widget.metric.id].live || !enabled) continue;
    const request = requests.find(({ group }) => group.metricId === widget.metric.id);
    if (!request) continue;
    if (request.context instanceof Error) {
      byWidget.set(widget.key, { kind: "error", message: getUserErrorMessage(request.context, "Du har ikke adgang til målingen.") });
      continue;
    }
    const entry = loaded[widget.metric.id];
    if (!request.context) { byWidget.set(widget.key, { kind: "loading" }); continue; }
    if (entry?.state.kind === "error" && entry.requestKey === request.key) { byWidget.set(widget.key, entry.state); continue; }
    const data = reusableData(entry, request.context, request.identityKey);
    const limit = metricRegistry[widget.metric.id].live?.locationLimits[widget.visualization] ?? 0;
    const ids = new Set(request.context.locations.slice(0, limit).map((location) => String(location.id)));
    if (!data || [...ids].some((id) => !data.locations.some((location) => location.key === id))) {
      byWidget.set(widget.key, { kind: "loading" });
      continue;
    }
    const locations = data.locations.filter((location) => ids.has(location.key));
    byWidget.set(widget.key, {
      kind: "ready",
      data: {
        ...data,
        locations,
        result: { ...data.result, series: data.result.series.filter((series) => ids.has(series.key)), truncated: request.context.truncated || request.context.locations.length > limit },
      },
    });
  }
  return { byWidget };
}
