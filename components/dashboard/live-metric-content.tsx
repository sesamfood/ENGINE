"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { metricRegistry } from "@/lib/dashboard/registry";
import type { LiveMetricResult, WidgetInstance } from "@/lib/dashboard/types";
import { visualizationRegistry } from "@/lib/dashboard/visualizations";
import { cn } from "@/lib/utils";
import type { LiveMetricState } from "./use-live-metrics";

const statusLabels: Record<Exclude<LiveMetricResult["locations"][number]["state"], "ready">, string> = {
  unlinked: "Ingen tilknytning. Vælg et sted i lokationens oplysninger.",
  unrated: "Ingen bedømmelse endnu.",
  reconnect: "Stedet skal tilknyttes igen i lokationens oplysninger.",
  notConfigured: "Datakilden er ikke konfigureret.",
  rateLimited: "Grænsen for opslag er nået. Prøv igen senere.",
  unavailable: "Kunne ikke hente den aktuelle værdi. Prøv igen.",
};

export function LiveMetricContent({ widget, state, compact = false }: {
  widget: WidgetInstance;
  state: LiveMetricState;
  compact?: boolean;
}) {
  if (state.kind === "error") return <div className="h-full min-h-0 overflow-y-auto"><Alert variant="destructive"><AlertDescription>{state.message}</AlertDescription></Alert></div>;
  if (state.kind === "loading") return <Skeleton className="size-full" />;
  const source = widget.metric.kind === "builtin" ? metricRegistry[widget.metric.id].live : undefined;
  const limit = source?.locationLimits[widget.visualization] ?? state.data.locations.length;
  const locations = state.data.locations.slice(0, limit);
  const ids = new Set(locations.map((location) => location.key));
  const data = {
    ...state.data,
    locations,
    result: { ...state.data.result, series: state.data.result.series.filter((series) => ids.has(series.key)), truncated: state.data.result.truncated || state.data.locations.length > limit },
  };
  const Visualization = visualizationRegistry[widget.visualization];
  if (!data.locations.length) return (
    <div className="h-full min-h-0 overflow-y-auto">
      <Empty className="min-h-full p-2">
        <EmptyHeader><EmptyTitle>Ingen lokationer valgt</EmptyTitle><EmptyDescription>Vælg en lokation for at se den aktuelle værdi.</EmptyDescription></EmptyHeader>
      </Empty>
    </div>
  );
  const unavailable = data.locations.filter((location) => location.state !== "ready");
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
      {data.result.series.length ? <div className={cn("min-h-0 flex-1", unavailable.length > 0 && "h-40 shrink-0 basis-40")}><Visualization result={data.result} compact={compact} /></div> : null}
      {unavailable.length ? (
        <div role="status" className="max-h-32 shrink-0 overflow-y-auto">
          <ul className="flex flex-col gap-2 text-xs text-muted-foreground">
            {unavailable.map((location) => (
              <li key={location.key}>
                <span className="font-medium text-foreground">{location.label}</span>
                {" · "}{location.state === "ready" ? "" : statusLabels[location.state]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {data.result.truncated ? <p className="text-xs text-muted-foreground">Viser de første {data.locations.length} lokationer. Indsnævr lokationsvalget for at se andre.</p> : null}
    </div>
  );
}

export function MetricSourceAttribution({ widget, data }: { widget: WidgetInstance; data?: LiveMetricResult }) {
  const source = widget.metric.kind === "builtin" ? metricRegistry[widget.metric.id].live : undefined;
  if (!source) return null;
  return (
    <div translate="no" className="flex flex-wrap items-baseline gap-x-2 gap-y-1" data-dashboard-no-drag onPointerDown={(event) => event.stopPropagation()}>
      <span className="text-xs font-normal whitespace-nowrap text-foreground">{source.sourceLabel}</span>
      {data?.attributions.map((attribution) => attribution.providerUri ? (
        <a key={`${attribution.provider}:${attribution.providerUri}`} href={attribution.providerUri} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground underline underline-offset-4">{attribution.provider}</a>
      ) : <span key={attribution.provider} className="text-xs text-muted-foreground">{attribution.provider}</span>)}
    </div>
  );
}
