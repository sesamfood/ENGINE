"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useQueries, type RequestForQueries } from "convex/react";
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, SlidersHorizontalIcon } from "lucide-react";
import { useIntegrations } from "@/integrations/use-integrations";
import { metricFeaturesAvailable, metricSourceAvailable } from "@/integrations/dashboard";
import { AppPageHeader } from "@/components/app-page-header";
import { useAccess, usePermission } from "@/components/app-shell";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import { metricRegistry } from "@/lib/dashboard/registry";
import { MAX_OPERATIONS_METRICS, operationsMetricIds, type OperationsMetricId, type OperationsRange } from "@/lib/dashboard/operations";
import type { MetricResult } from "@/lib/dashboard/types";
import { useDashboardNow } from "@/lib/dashboard/use-dashboard-now";
import { formatMetricValue, previousTotal, total } from "./visualizations/utils";

const METRICS_KEY = "engine.operations.metrics";
const defaultMetrics: OperationsMetricId[] = ["salesRevenue", "wasteRegistrations", "openCounts", "transfers", "staffFoodRegistrations", "headcountToday"];
const rangeLabels: Record<OperationsRange, { label: string; previous: string }> = {
  today: { label: "I dag", previous: "i går" },
  "7days": { label: "Seneste 7 dage", previous: "forrige 7 dage" },
};

// The choice is per device, so a wall-mounted tablet can keep its own board.
const metricListeners = new Set<() => void>();
let unsavedMetrics: string | undefined;

function subscribeMetrics(listener: () => void) {
  metricListeners.add(listener);
  return () => {
    metricListeners.delete(listener);
  };
}

function readStoredMetrics() {
  if (unsavedMetrics !== undefined) return unsavedMetrics;
  try {
    return window.localStorage.getItem(METRICS_KEY);
  } catch {
    return null;
  }
}

function saveMetrics(metrics: OperationsMetricId[]) {
  unsavedMetrics = JSON.stringify(metrics);
  try {
    window.localStorage.setItem(METRICS_KEY, unsavedMetrics);
    unsavedMetrics = undefined;
  } catch {}
  for (const listener of metricListeners) listener();
}

function parseMetrics(raw: string | null) {
  try {
    const stored: unknown = JSON.parse(raw ?? "null");
    return Array.isArray(stored) ? stored.filter((id): id is OperationsMetricId => (operationsMetricIds as readonly unknown[]).includes(id)) : null;
  } catch {
    return null;
  }
}

function Change({ current, previous, result, period }: { current: number | null; previous: number | null; result: MetricResult; period: string }) {
  if (current === null || previous === null || (result.unit !== "percent" && previous === 0)) return null;
  const difference = result.unit === "percent" ? current - previous : ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(difference * 10) / 10;
  const text = `${rounded > 0 ? "+" : ""}${new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1 }).format(rounded)} ${result.unit === "percent" ? "point" : "%"}`;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums" title={`Sammenlignet med ${period}: ${formatMetricValue(previous, result)}`}>
      {rounded > 0 ? <ArrowUpIcon className="size-3" /> : rounded < 0 ? <ArrowDownIcon className="size-3" /> : null}
      {text}
      <span className="sr-only">sammenlignet med {period}</span>
    </span>
  );
}

function MetricPicker({ open, onOpenChange, available, selected, onChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  available: OperationsMetricId[];
  selected: OperationsMetricId[];
  onChange: (metrics: OperationsMetricId[]) => void;
}) {
  const categories = [...new Set(available.map((id) => metricRegistry[id].category))];
  const full = selected.length >= MAX_OPERATIONS_METRICS;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-(--spacing-dialog-dynamic) overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vælg nøgletal</DialogTitle>
          <DialogDescription>Vælg op til {MAX_OPERATIONS_METRICS} nøgletal. Valget gemmes på denne enhed.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {categories.map((category) => (
            <FieldSet key={category}>
              <FieldLegend variant="label">{category}</FieldLegend>
              <FieldGroup appearance="compact">
                {available.filter((id) => metricRegistry[id].category === category).map((id) => {
                  const checked = selected.includes(id);
                  return (
                    <Field key={id} orientation="horizontal">
                      <Checkbox
                        id={`operations-metric-${id}`}
                        checked={checked}
                        disabled={!checked && full}
                        onCheckedChange={(next) => onChange(next
                          ? operationsMetricIds.filter((candidate) => candidate === id || selected.includes(candidate))
                          : selected.filter((candidate) => candidate !== id))}
                      />
                      <FieldLabel htmlFor={`operations-metric-${id}`} className="min-h-11">{metricRegistry[id].label}</FieldLabel>
                    </Field>
                  );
                })}
              </FieldGroup>
            </FieldSet>
          ))}
        </FieldGroup>
        <DialogFooter>
          <Button type="button" className="min-h-11" onClick={() => onOpenChange(false)}>Færdig</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useOperationsResults(metricIds: string, range: OperationsRange, now: number) {
  // useQueries needs a stable object; a new one each render loops forever.
  const queries = useMemo((): RequestForQueries => Object.fromEntries(
    metricIds.split(",").filter(Boolean).map((metricId) => [metricId, { query: api.dashboard.getOperationsMetric, args: { metricId, range, now } }]),
  ), [metricIds, range, now]);
  const results: Record<string, MetricResult | Error | undefined> = useQueries(queries);
  return results;
}

function OperationsContent() {
  const access = useAccess();
  const integrations = useIntegrations();
  const canViewDashboard = usePermission("dashboard.view");
  const permissions = access?.permissions ?? [];
  const canViewWoltSales = permissions.includes("sales.viewAggregate") || permissions.includes("sales.viewDetail");
  const canViewSales = canViewWoltSales || permissions.includes("dashboard.viewSales");
  const now = useDashboardNow();
  const [range, setRange] = useState<OperationsRange>("today");
  const [pickerOpen, setPickerOpen] = useState(false);
  const stored = parseMetrics(useSyncExternalStore(subscribeMetrics, readStoredMetrics, () => null));

  const disabledFeatures = access?.disabledFeatures ?? [];
  const available = operationsMetricIds.filter((id) => {
    const definition = metricRegistry[id];
    return metricSourceAvailable(definition.source, integrations)
      && metricFeaturesAvailable(definition.features, disabledFeatures)
      && (!definition.sensitive || (definition.source === "wolt" ? canViewWoltSales : canViewSales));
  });
  const selected = (stored ?? defaultMetrics).filter((id) => available.includes(id));

  const results = useOperationsResults(selected.join(","), range, now);

  const locations = new Map<string, string>();
  for (const id of selected) {
    const result = results[id];
    if (result && !(result instanceof Error)) for (const series of result.series) locations.set(series.key, series.label);
  }
  const locationRows = [...locations].sort(([, left], [, right]) => left.localeCompare(right, "da"));
  const loading = selected.some((id) => results[id] === undefined);
  const failed = selected.filter((id) => results[id] instanceof Error);
  const period = rangeLabels[range].previous;

  return (
    <section className="mx-auto flex w-full max-w-(--container-dashboard) flex-col gap-6">
      <AppPageHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Driftsoverblik</h1>
          {canViewDashboard ? <Button variant="outline" className="min-h-11" nativeButton={false} render={<Link href="/dashboard" />}><ArrowLeftIcon data-icon="inline-start" />Dashboard</Button> : null}
        </div>
      </AppPageHeader>
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <ToggleGroup value={[range]} onValueChange={(values) => { if (values[0]) setRange(values[0] as OperationsRange); }} variant="outline" size="lg" spacing={0}>
          {(Object.keys(rangeLabels) as OperationsRange[]).map((value) => <ToggleGroupItem key={value} value={value} className="min-h-11">{rangeLabels[value].label}</ToggleGroupItem>)}
        </ToggleGroup>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline"><span className="size-2 rounded-full bg-success" aria-hidden />Live</Badge>
          <span className="text-sm text-muted-foreground">{new Intl.DateTimeFormat("da-DK", { dateStyle: "long" }).format(now)}</span>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setPickerOpen(true)}><SlidersHorizontalIcon data-icon="inline-start" />Vælg nøgletal</Button>
        </div>
      </div>
      <MetricPicker open={pickerOpen} onOpenChange={setPickerOpen} available={available} selected={selected} onChange={saveMetrics} />
      {failed.length ? (
        <Alert variant="destructive">
          <AlertTitle>Nogle nøgletal kunne ikke indlæses</AlertTitle>
          <AlertDescription>{failed.map((id) => metricRegistry[id].label).join(", ")}</AlertDescription>
        </Alert>
      ) : null}
      {!selected.length ? (
        <Empty appearance="outlined" className="min-h-64">
          <EmptyHeader>
            <EmptyTitle>Ingen nøgletal valgt</EmptyTitle>
            <EmptyDescription>Vælg de nøgletal, du vil følge på tværs af lokationer.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {selected.map((id) => {
              const result = results[id];
              return (
                <Card key={id} size="sm">
                  <CardHeader>
                    <CardDescription>{metricRegistry[id].label}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-1">
                    {result === undefined ? <Skeleton className="h-9 w-24" />
                      : result instanceof Error ? <p className="text-sm text-muted-foreground">Kunne ikke indlæses</p>
                        : (
                          <>
                            <p className="text-3xl font-semibold tracking-tight tabular-nums">{formatMetricValue(result.series.length ? total(result) : null, result)}</p>
                            {result.emptyMessage ? <p className="text-xs text-muted-foreground">{result.emptyMessage}</p>
                              : <Change current={total(result)} previous={previousTotal(result)} result={result} period={period} />}
                          </>
                        )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Lokationer</h2>
            {loading && !locationRows.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((index) => <Skeleton key={index} className="h-48 w-full" />)}</div>
            ) : !locationRows.length ? (
              <Empty appearance="outlined" className="min-h-48">
                <EmptyHeader>
                  <EmptyTitle>Ingen lokationer</EmptyTitle>
                  <EmptyDescription>Der er ingen lokationer, der vises på dashboards.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {locationRows.map(([key, label]) => (
                  <Card key={key}>
                    <CardHeader>
                      <CardTitle appearance="truncate">{label}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <dl className="flex flex-col divide-y">
                        {selected.map((id) => {
                          const result = results[id];
                          const series = result && !(result instanceof Error) ? result.series.find((candidate) => candidate.key === key) : undefined;
                          return (
                            <div key={id} className="flex min-h-11 items-center justify-between gap-3 py-2">
                              <dt className="min-w-0 truncate text-sm text-muted-foreground">{metricRegistry[id].label}</dt>
                              <dd className="flex shrink-0 flex-col items-end">
                                {result === undefined ? <Skeleton className="h-5 w-16" />
                                  : (
                                    <>
                                      <span className="font-medium tabular-nums">{result instanceof Error || !series ? "—" : formatMetricValue(series.total, result)}</span>
                                      {series && !(result instanceof Error) ? <Change current={series.total} previous={series.previousTotal} result={result} period={period} /> : null}
                                    </>
                                  )}
                              </dd>
                            </div>
                          );
                        })}
                      </dl>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function OperationsAccess() {
  const access = useAccess();
  const canView = usePermission("dashboard.viewOperations");
  if (!access) return <Skeleton className="h-96 w-full" />;
  if (!canView || access.granularity !== "detail" || access.kiosk?.kioskModeEnabled || access.disabledFeatures.includes("dashboard")) {
    return <Alert variant="destructive" className="max-w-xl"><AlertTitle>Ingen adgang</AlertTitle><AlertDescription>Du har ikke adgang til driftsoverblikket.</AlertDescription></Alert>;
  }
  return <OperationsContent key={JSON.stringify([access.permissions, access.locationScope])} />;
}

export function OperationsBoard() {
  return <OrganizationAuthGate><OperationsAccess /></OrganizationAuthGate>;
}
