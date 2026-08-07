"use client";

import { useState } from "react";
import { RefreshCwIcon } from "lucide-react";
import { useAction, useQuery } from "convex/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { metricRegistry } from "@/lib/dashboard/registry";
import type { DashboardRange, DashboardScope, MetricResult, WidgetInstance, WidgetSize, VisualizationId } from "@/lib/dashboard/types";
import { visualizationRegistry } from "@/lib/dashboard/visualizations";
import { WidgetCard } from "./widget-card";

function message(error: unknown) {
  return error instanceof Error ? error.message : "Målingen kunne ikke hentes";
}

export function DashboardWidget({
  widget,
  scope,
  range,
  editable,
  resizing,
  publicAccess,
  onVisualizationChange,
  onResize,
  onRemove,
}: {
  widget: WidgetInstance;
  scope: DashboardScope;
  range: DashboardRange;
  editable: boolean;
  resizing?: boolean;
  publicAccess?: { token: string; accessKey: string };
  onVisualizationChange?: (visualization: VisualizationId) => void;
  onResize?: (size: WidgetSize, complete: boolean) => void;
  onRemove?: () => void;
}) {
  const definition = metricRegistry[widget.metricId];
  const authenticatedResult = useQuery(
    api.dashboard.getMetric,
    publicAccess || definition.live
      ? "skip"
      : {
          metricId: widget.metricId,
          visualization: definition.defaultVisualization,
          scope,
          range,
        },
  );
  const sharedResult = useQuery(
    api.dashboardShare.getSharedMetric,
    publicAccess
      ? {
          token: publicAccess.token,
          accessKey: publicAccess.accessKey,
          metricId: widget.metricId,
          visualization: widget.visualization,
        }
      : "skip",
  );
  const getLiveMetric = useAction(api.dashboard.getLiveMetric);
  const [liveResult, setLiveResult] = useState<MetricResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const result = publicAccess ? sharedResult : definition.live ? liveResult : authenticatedResult;
  const Visualization = visualizationRegistry[widget.visualization];
  const compact = widget.size === "1x1" || widget.size === "2x1";

  async function refresh() {
    setRefreshing(true);
    try {
      setLiveResult(await getLiveMetric({
        metricId: widget.metricId,
        visualization: widget.visualization,
        scope,
        range,
      }));
    } catch (error) {
      toast.error(message(error));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <WidgetCard
      widget={widget}
      result={result ?? undefined}
      editable={editable}
      resizing={resizing}
      onVisualizationChange={onVisualizationChange}
      onResize={onResize}
      onRemove={onRemove}
    >
      {definition.live && !liveResult ? (
        <div className="grid h-full place-items-center text-center">
          <div className="flex max-w-xs flex-col items-center gap-3">
            <p className="text-base leading-snug text-muted-foreground">
              Hentes direkte fra OnlinePOS og gemmes ikke i dashboardet.
            </p>
            <Button data-dashboard-no-drag type="button" variant="outline" className="h-9 text-base" onPointerDown={(event) => event.stopPropagation()} onClick={() => void refresh()} disabled={refreshing}>
              {refreshing ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
              Hent omsætning
            </Button>
          </div>
        </div>
      ) : result == null ? (
        <div className="flex h-full flex-col gap-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="min-h-24 flex-1" />
        </div>
      ) : (
        <Visualization result={result} compact={compact} />
      )}
    </WidgetCard>
  );
}
