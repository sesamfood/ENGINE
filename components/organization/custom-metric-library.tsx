"use client";

import { useState } from "react";
import { ChartNoAxesCombinedIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { useAccess, usePermission } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { dashboardDatasets } from "@/lib/dashboard/datasets";
import type { CustomMetricSpec, DashboardRange, DashboardScope } from "@/lib/dashboard/types";
import { useDashboardNow } from "@/lib/dashboard/use-dashboard-now";
import { CustomMetricBuilder, type CustomMetricDefinition } from "@/components/dashboard/custom-metric-builder";

function metricMessage(error: unknown) {
  return error instanceof Error ? error.message : "Målingen kunne ikke opdateres";
}

function metricSummary(spec: CustomMetricSpec) {
  if (spec.kind === "single") {
    return dashboardDatasets[spec.query.dataset].label;
  }
  return `${dashboardDatasets[spec.numerator.dataset].label} ÷ ${dashboardDatasets[spec.denominator.dataset].label}`;
}

const libraryDefaults = {
  scope: { mode: "aggregate", locationIds: null } as DashboardScope,
  range: { preset: "30days" } as DashboardRange,
};

export function CustomMetricLibrary() {
  const canManage = usePermission("dashboard.manage");
  const access = useAccess();
  const now = useDashboardNow();
  const metrics = useQuery(api.customMetrics.list, canManage ? {} : "skip") as CustomMetricDefinition[] | undefined;
  const removeMetric = useMutation(api.customMetrics.remove);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingMetric, setEditingMetric] = useState<CustomMetricDefinition | null>(null);
  const [deletingMetric, setDeletingMetric] = useState<CustomMetricDefinition | null>(null);
  const [deleting, setDeleting] = useState(false);
  function openCreate() {
    setEditingMetric(null);
    setBuilderOpen(true);
  }

  function openEdit(metric: CustomMetricDefinition) {
    setEditingMetric(metric);
    setBuilderOpen(true);
  }

  async function confirmDelete() {
    if (!deletingMetric) return;
    setDeleting(true);
    try {
      await removeMetric({ metricId: deletingMetric.id });
      toast.success("Målingen er slettet");
      setDeletingMetric(null);
    } catch (error) {
      toast.error(metricMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  if (!canManage) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>Du har ikke adgang til organisationens målingsbibliotek.</AlertDescription>
      </Alert>
    );
  }

  if (metrics === undefined) {
    return <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-44 w-full" /><Skeleton className="h-44 w-full" /></div>;
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Genbrugelige målinger for hele organisationen.</p>
          <p className="mt-1 text-sm text-muted-foreground">{metrics.length} af 50 målinger i biblioteket.</p>
        </div>
        <Button type="button" className="min-h-11" onClick={openCreate}>
          <PlusIcon data-icon="inline-start" />
          Opret måling
        </Button>
      </div>

      {metrics.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {metrics.map((metric) => (
            <Card key={metric.id} className="flex h-full flex-col">
              <CardHeader>
                <CardTitle className="truncate">{metric.name}</CardTitle>
                <CardDescription className="line-clamp-3">
                  {metric.description || metricSummary(metric.spec)}
                </CardDescription>
                <CardAction className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" aria-label={`Redigér ${metric.name}`} onClick={() => openEdit(metric)}>
                    <PencilIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Slet ${metric.name}`}
                    disabled={metric.usageCount > 0}
                    onClick={() => setDeletingMetric(metric)}
                  >
                    <Trash2Icon />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="mt-auto flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{metric.spec.kind === "ratio" ? "Forhold" : "Enkeltmåling"}</Badge>
                <Badge variant={metric.sensitive ? "outline" : "secondary"}>
                  {metric.sensitive ? "Følsom" : "Ikke følsom"}
                </Badge>
                <Badge variant="outline">{metric.usageCount} widget{metric.usageCount === 1 ? "" : "s"}</Badge>
                <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                  <ChartNoAxesCombinedIcon aria-hidden="true" />
                  <span className="truncate">{metricSummary(metric.spec)}</span>
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><ChartNoAxesCombinedIcon /></EmptyMedia>
            <EmptyTitle>Ingen tilpassede målinger</EmptyTitle>
            <EmptyDescription>Opret den første måling fra organisationens kuraterede datasæt.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <CustomMetricBuilder
        key={`${builderOpen ? "open" : "closed"}:${editingMetric?.id ?? "new"}:${editingMetric?.updatedAt ?? ""}`}
        open={builderOpen}
        onOpenChange={(open) => {
          setBuilderOpen(open);
          if (!open) setEditingMetric(null);
        }}
        scope={libraryDefaults.scope}
        range={libraryDefaults.range}
        now={now}
        granularity={access?.granularity}
        metric={editingMetric}
        mode="library"
      />

      <AlertDialog open={Boolean(deletingMetric)} onOpenChange={(open) => { if (!open && !deleting) setDeletingMetric(null); }}>
        <AlertDialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Slet tilpasset måling?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingMetric ? `Målingen “${deletingMetric.name}” slettes permanent.` : "Målingen slettes permanent."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">Målingen bruges ikke af nogen widget.</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annullér</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={(event) => { event.preventDefault(); void confirmDelete(); }}>
              {deleting ? "Sletter…" : "Slet måling"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
