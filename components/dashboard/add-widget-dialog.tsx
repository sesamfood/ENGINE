"use client";

import { useIntegrations } from "@/integrations/use-integrations";
import { customMetricAvailable, metricSourceAvailable, salesSourceOptions } from "@/integrations/dashboard";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAccess } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveMetrics } from "./use-live-metrics";
import { useFinancialMetrics } from "./use-financial-metrics";
import { LiveMetricContent, MetricSourceAttribution } from "./live-metric-content";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { customMetricVisualizations, ratioMetricVisualizations } from "@/lib/dashboard/datasets";
import { metricRegistry, metrics, sizeLabels, supportsSalesSource, visualizationLabels } from "@/lib/dashboard/registry";
import { widgetSizeSpans } from "@/lib/dashboard/layout";
import { visualizationRegistry } from "@/lib/dashboard/visualizations";
import { widgetSizes, type DashboardRange, type DashboardScope, type MetricId, type MetricResult, type SalesSource, type VisualizationId, type WidgetInstance, type WidgetSize } from "@/lib/dashboard/types";
import { getUserErrorMessage } from "@/lib/user-errors";
import type { CustomMetricDefinition } from "./custom-metric-definition";
import { visualizationHasYAxis, YAxisSettings } from "./y-axis-settings";

const CustomMetricBuilder = dynamic(() => import("./custom-metric-builder").then((module) => module.CustomMetricBuilder));

type Step = 1 | 2 | 3;

const stepLabels = ["Måling", "Visualisering", "Størrelse"] as const;

const sizePreviewClasses: Record<WidgetSize, string> = {
  "1x1": "aspect-5/4 w-14",
  "1x2": "aspect-5/8 w-14",
  "2x1": "aspect-5/2 w-28",
  "2x2": "aspect-5/4 w-28",
  "4x2": "aspect-5/2 w-56 max-w-full",
};

export function AddWidgetDialog({
  canViewSensitive,
  scope,
  range,
  now,
  onAdd,
  open: controlledOpen,
  onOpenChange,
  showTrigger = true,
}: {
  canViewSensitive: boolean;
  scope: DashboardScope;
  range: DashboardRange;
  now: number;
  onAdd: (widget: WidgetInstance) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}) {
  const integrations = useIntegrations();
  const sources = salesSourceOptions(integrations);
  const access = useAccess();
  const convex = useConvex();
  const available = metrics.filter((metric) => metricSourceAvailable(metric.source, integrations)).filter(
    (metric) => metric.source === "economic"
      ? access?.granularity === "detail" && access.permissions.includes("dashboard.viewFinancials")
      : (!metric.sensitive || canViewSensitive) && (!metric.live || access?.granularity === "detail"),
  );
  const categories = Array.from(new Set(available.map((metric) => metric.category))).map((category) => ({
    label: category,
    metrics: available.filter((metric) => metric.category === category),
  }));
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const previousOpen = useRef(open);
  const skipNextControlledOpenReset = useRef(false);
  const allCustomMetrics = useQuery(
    api.customMetrics.list,
    open ? {} : "skip",
  );
  const customMetrics = allCustomMetrics?.filter((metric) => customMetricAvailable(metric.spec, integrations));
  const sourceAvailability = useQuery(
    api.dashboard.salesSourceAvailability,
    open ? { scope } : "skip",
  );
  const [step, setStep] = useState<Step>(1);
  const [metricId, setMetricId] = useState<MetricId>(available[0]?.id ?? "wasteRegistrations");
  const [salesSourceOverride, setSalesSourceOverride] = useState<SalesSource>();
  const [customMetricId, setCustomMetricId] = useState<Id<"customMetrics"> | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderMetric, setBuilderMetric] = useState<CustomMetricDefinition | null>(null);
  const [deletingMetric, setDeletingMetric] = useState<CustomMetricDefinition | null>(null);
  const [deleting, setDeleting] = useState(false);
  const removeCustomMetric = useMutation(api.customMetrics.remove);
  const definition = metricRegistry[metricId];
  const customMetric = customMetrics?.find((metric) => metric.id === customMetricId);
  const customMetricPending = Boolean(customMetricId && !customMetric);
  const selectedMetricAvailable = customMetricId ? Boolean(customMetric) : available.some((metric) => metric.id === metricId);
  const [visualization, setVisualization] = useState<VisualizationId>(definition.defaultVisualization);
  const [size, setSize] = useState<WidgetSize>(definition.defaultSize);
  const [yAxisMin, setYAxisMin] = useState<number | undefined>(0);
  const [yAxisMax, setYAxisMax] = useState<number>();
  const [yAxisValid, setYAxisValid] = useState(true);
  const [previewResult, setPreviewResult] = useState<MetricResult>();
  const livePreviewWidgets = useMemo<[WidgetInstance]>(() => [{
    key: "live-preview", metric: { kind: "builtin", id: metricId }, visualization, size,
    range: definition.defaultRange,
  }], [metricId, visualization, size, definition.defaultRange]);
  const [livePreviewWidget] = livePreviewWidgets;
  const livePreview = useLiveMetrics(livePreviewWidgets, scope, open && selectedMetricAvailable && step === 2 && !customMetricId && Boolean(definition.live));
  const livePreviewState = livePreview.byWidget.get(livePreviewWidget.key);
  const financialPreview = useFinancialMetrics(livePreviewWidgets, scope, range, now,
    open && step === 2 && !customMetricId && definition.source === "economic");
  const financialPreviewResult = financialPreview.get(livePreviewWidget.key);
  const displayedPreview = !customMetricId && definition.source === "economic"
    ? financialPreviewResult instanceof Error ? undefined : financialPreviewResult
    : previewResult;
  const salesSource = metricId === "woltCancellationRate"
    ? "wolt"
    : (salesSourceOverride && sources.some((source) => source.value === salesSourceOverride) ? salesSourceOverride : undefined) ?? (
        integrations?.wolt && sourceAvailability && !sourceAvailability.onlinePos && sourceAvailability.wolt
          ? "wolt"
          : "onlinePos"
      );
  useEffect(() => {
    if (!open || !selectedMetricAvailable || step !== 2 || (customMetricId && !customMetric) || (!customMetricId && (definition.live || definition.source === "economic"))) return;
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      setPreviewResult(undefined);
      const request =
        customMetric
          ? convex.query(api.customMetrics.preview, {
              spec: customMetric.spec,
              visualization: "kpi",
              scope,
              range,
              now,
            })
          : convex.query(api.dashboard.getMetric, {
              metricId,
              visualization: definition.defaultVisualization,
              scope,
              range,
              now,
              ...(supportsSalesSource(metricId) ||
              metricId === "woltCancellationRate"
                ? { salesSource }
                : {}),
            });
      void request
        .then((result) => {
          if (active) setPreviewResult(result);
        })
        .catch((error: unknown) => {
          if (!active) return;
          toast.error(
            getUserErrorMessage(
              error,
              "Forhåndsvisningen kunne ikke indlæses. Prøv igen.",
            ),
          );
        });
    }, 450);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    convex,
    customMetric,
    customMetricId,
    definition.defaultVisualization,
    definition.live,
    definition.source,
    metricId,
    now,
    open,
    range,
    salesSource,
    selectedMetricAvailable,
    scope,
    step,
  ]);
  const customVisualizations = customMetric
    ? (customMetric.spec.kind === "ratio" ? ratioMetricVisualizations : customMetricVisualizations)
        .filter((value) => Boolean(customMetric.spec.dimension) || (value !== "donut" && value !== "list" && value !== "table"))
    : [];
  const availableVisualizations = customMetricId ? customVisualizations : definition.visualizations;

  function selectMetric(nextMetricId: MetricId) {
    const next = metricRegistry[nextMetricId];
    setPreviewResult(undefined);
    setCustomMetricId(null);
    setMetricId(next.id);
    setSalesSourceOverride(undefined);
    setVisualization(next.defaultVisualization);
    setSize(next.defaultSize);
    setYAxisMin(0);
    setYAxisMax(undefined);
    setYAxisValid(true);
  }

  function selectCustomMetric(nextMetricId: Id<"customMetrics">) {
    setPreviewResult(undefined);
    setCustomMetricId(nextMetricId);
    setVisualization("kpi");
    setSize("2x2");
    setYAxisMin(0);
    setYAxisMax(undefined);
    setYAxisValid(true);
  }

  function selectVisualization(nextVisualization: VisualizationId) {
    setVisualization(nextVisualization);
  }

  function add() {
    if (!selectedMetricAvailable) return;
    const options = {
      ...(yAxisMin !== undefined ? { yAxisMin } : {}),
      ...(yAxisMax !== undefined ? { yAxisMax } : {}),
      ...(!customMetric && (supportsSalesSource(metricId) || metricId === "woltCancellationRate")
        ? { salesSource }
        : {}),
    };
    onAdd({
      key: crypto.randomUUID(),
      metric: customMetric
        ? { kind: "custom", id: customMetric.id }
        : { kind: "builtin", id: metricId },
      visualization,
      size,
      range: customMetric ? undefined : definition.defaultRange,
      options: Object.keys(options).length ? options : undefined,
    });
    setDialogOpen(false);
    setStep(1);
  }

  function closeOrPrevious() {
    if (step === 1) {
      setDialogOpen(false);
      return;
    }
    setStep((current) => (current - 1) as Step);
  }

  function resetDialogState() {
    setPreviewResult(undefined);
    setStep(1);
    setCustomMetricId(null);
    setSalesSourceOverride(undefined);
    setYAxisValid(true);
  }

  function setDialogOpen(nextOpen: boolean, reset = nextOpen) {
    setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
    if (nextOpen && reset) resetDialogState();
    if (nextOpen && !reset) skipNextControlledOpenReset.current = true;
  }

  useEffect(() => {
    if (controlledOpen !== undefined && open && !previousOpen.current) {
      if (skipNextControlledOpenReset.current) skipNextControlledOpenReset.current = false;
      else resetDialogState();
    }
    previousOpen.current = open;
  }, [controlledOpen, open]);

  function openCustomMetricBuilder() {
    setBuilderMetric(null);
    setDialogOpen(false);
    setBuilderOpen(true);
  }

  function editCustomMetric(metric: CustomMetricDefinition) {
    setBuilderMetric(metric);
    setDialogOpen(false);
    setBuilderOpen(true);
  }

  async function confirmDeleteCustomMetric() {
    if (!deletingMetric) return;
    setDeleting(true);
    try {
      await removeCustomMetric({ metricId: deletingMetric.id });
      if (customMetricId === deletingMetric.id) selectMetric(metricId);
      toast.success("Målingen er slettet");
      setDeletingMetric(null);
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Målingen kunne ikke slettes. Prøv igen."),
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(nextOpen) => setDialogOpen(nextOpen)}>
      {showTrigger ? (
        <DialogTrigger render={<Button type="button" size="lg" className="min-h-11" />}>
          <PlusIcon data-icon="inline-start" />
          Tilføj widget
        </DialogTrigger>
      ) : null}
      <DialogContent className="grid max-h-(--spacing-viewport-inset) min-h-0 grid-rows-(--grid-rows-widget-dialog) overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Tilføj widget</DialogTitle>
          <DialogDescription>
            Trin {step} af 3: {step === 1 ? "vælg en måling" : step === 2 ? "vælg en visualisering" : "vælg en størrelse"}.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={String(step)}
          onValueChange={(value) => {
            const next = Number(value) as Step;
            if (next <= step) setStep(next);
          }}
        >
          <TabsList className="grid h-10 w-full grid-cols-3">
            {stepLabels.map((label, index) => {
              const value = (index + 1) as Step;
              return (
                <TabsTrigger key={label} value={String(value)} disabled={value > step}>
                  <span className="hidden sm:inline">{value}. </span>
                  {label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <div className="min-h-0 overflow-y-auto p-1">
          {step === 1 || !selectedMetricAvailable ? (
            <div className="flex h-full min-h-0 flex-col gap-3">
              <div>
                <h2 className="text-sm font-medium">Hvad vil du følge?</h2>
                <p className="text-sm text-muted-foreground">Søg i de indbyggede eller organisationens målinger.</p>
              </div>
              <Command appearance="outline" className="min-h-0 flex-1" shouldFilter>
                <CommandInput aria-label="Søg efter måling" placeholder="Søg efter måling..." />
                <CommandList className="min-h-0 max-h-none flex-1">
                  <CommandEmpty>Ingen målinger fundet.</CommandEmpty>
                  {categories.map((category) => (
                    <CommandGroup
                      key={category.label}
                      heading={category.label}
                    >
                      {category.metrics.map((metric) => {
                        const selected = !customMetricId && metric.id === metricId;
                        return (
                          <CommandItem
                            key={metric.id}
                            value={`${metric.label} ${metric.description}`}
                            onSelect={() => selectMetric(metric.id)}
                            aria-selected={selected}
                            appearance="search"
                            highlighted={selected}
                            className="min-h-14 items-start"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">{metric.label}</p>
                              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{metric.description}</p>
                            </div>
                            {selected ? <CheckIcon aria-label="Valgt" /> : null}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ))}
                  {customMetrics?.length ? (
                    <CommandGroup
                      heading="Organisationens målinger"
                    >
                      {customMetrics.map((metric) => {
                        const selected = metric.id === customMetricId;
                        return (
                          <div key={metric.id} className="flex items-start gap-2 [&:not(:has([cmdk-item]))]:hidden">
                            <CommandItem
                              value={`${metric.name} ${metric.description ?? ""} tilpasset måling`}
                              onSelect={() => selectCustomMetric(metric.id)}
                              aria-selected={selected}
                              appearance="search"
                              highlighted={selected}
                              className="min-h-14 min-w-0 flex-1 items-start"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-medium">{metric.name}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{metric.description || "Tilpasset måling fra organisationens bibliotek."}</p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {metric.spec.kind === "ratio" ? "Forhold" : "Enkeltmåling"} · {metric.usageCount} widget{metric.usageCount === 1 ? "" : "s"}
                                </p>
                              </div>
                            </CommandItem>
                            <div className="flex shrink-0 gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Redigér data for ${metric.name}`}
                                onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                                onClick={(event) => { event.stopPropagation(); editCustomMetric(metric); }}
                              >
                                <PencilIcon />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={metric.usageCount > 0
                                  ? `${metric.name} kan ikke slettes, fordi målingen bruges af en widget`
                                  : `Slet ${metric.name}`}
                                disabled={metric.usageCount > 0}
                                onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                                onClick={(event) => { event.stopPropagation(); setDeletingMetric(metric); }}
                              >
                                <Trash2Icon />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </CommandGroup>
                  ) : null}
                  <CommandGroup heading="Byg selv">
                    <CommandItem
                      value="opret tilpasset måling builder"
                      onSelect={openCustomMetricBuilder}
                      appearance="create"
                      className="min-h-14"
                    >
                      <PlusIcon />
                      <div className="min-w-0">
                        <p className="font-medium">Opret tilpasset måling</p>
                        <p className="text-xs text-muted-foreground">Brug de kuraterede datasæt til en ny widget.</p>
                      </div>
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
              {!customMetricId && selectedMetricAvailable ? (
                <div className="flex shrink-0 flex-col gap-1" aria-live="polite">
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-medium">{definition.label}</p>
                    <HelpTooltip label={`Beregning for ${definition.label}`} content={
                      <div className="flex max-w-sm flex-col gap-2">
                        <p>{definition.formula}</p>
                        <p>Datakilder: {definition.source === "economic" ? "Månedsrapport" : definition.sourceTables.join(", ")}</p>
                      </div>
                    } />
                  </div>
                  <p className="text-sm text-muted-foreground">{definition.description}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 2 && selectedMetricAvailable ? (
            <div className="flex min-h-full flex-col gap-3">
              <div>
                <h2 className="text-sm font-medium">Hvordan skal {(customMetric?.name ?? (customMetricId ? "målingen" : definition.label)).toLowerCase()} vises?</h2>
                <p className="text-sm text-muted-foreground">Vælg en visning. Du kan ændre den senere.</p>
              </div>
              {!customMetricId && supportsSalesSource(metricId) ? (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/25 p-3">
                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-medium">Salgskilde</p>
                    <p className="text-xs text-muted-foreground">Vælg hvilke ordredata widgetten skal bruge.</p>
                  </div>
                  <Select
                    items={sources}
                    value={salesSource}
                    onValueChange={(value) => {
                      if (value === "onlinePos" || value === "wolt" || value === "combined") {
                        setPreviewResult(undefined);
                        setSalesSourceOverride(value);
                      }
                    }}
                  >
                    <SelectTrigger className="h-11 w-48" aria-label="Salgskilde">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {sources.map(({ value, label }) => (
                          <SelectItem key={value} value={value}>{label}</SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {!customMetricId && metricId === "woltCancellationRate" ? (
                <p className="rounded-lg border bg-muted/25 p-3 text-sm text-muted-foreground">
                  Datakilde: Wolt
                </p>
              ) : null}
              {customMetricPending ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Skeleton className="h-56 w-full" />
                  <Skeleton className="h-56 w-full" />
                </div>
              ) : (
                <ToggleGroup
                  value={[visualization]}
                  onValueChange={(values) => {
                    const next = availableVisualizations.find(
                      (item) => item === values[0],
                    );
                    if (next) selectVisualization(next);
                  }}
                  spacing={3}
                  aria-label="Visualisering"
                  appearance="cards"
                  className="grid w-full min-w-0 items-stretch sm:grid-cols-2"
                >
                  {availableVisualizations.map((visualizationId) => {
                    const Visualization = visualizationRegistry[visualizationId];
                    const selected = visualization === visualizationId;
                    return (
                      <ToggleGroupItem
                        key={visualizationId}
                        value={visualizationId}
                        nativeButton={false}
                        render={(props) => (
                          <Card
                            {...props}
                            size="sm"
                            data-size="sm"
                            data-slot="card"
                            appearance="choice"
                            highlight={selected ? "choice" : undefined}
                            className="cursor-pointer"
                          />
                        )}
                      >
                        <CardHeader>
                          <CardTitle>{visualizationLabels[visualizationId]}</CardTitle>
                        </CardHeader>
                        <CardContent
                          className="h-44 min-h-0 overflow-hidden"
                          onKeyDown={(event) => {
                            if (
                              ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) &&
                              event.target instanceof Element &&
                              event.target.closest('[role="application"]')
                            ) {
                              event.stopPropagation();
                            }
                          }}
                        >
                          {livePreviewState ? (
                            <LiveMetricContent widget={{ ...livePreviewWidget, visualization: visualizationId }} state={livePreviewState} compact />
                          ) : financialPreviewResult instanceof Error ? (
                            <Alert variant="destructive"><AlertDescription>{financialPreviewResult.message}</AlertDescription></Alert>
                          ) : displayedPreview ? (
                            <Visualization result={displayedPreview} />
                          ) : (
                            <Skeleton className="size-full" />
                          )}
                        </CardContent>
                      </ToggleGroupItem>
                    );
                  })}
                </ToggleGroup>
              )}
              {!customMetricId && definition.live ? <MetricSourceAttribution widget={livePreviewWidget} data={livePreviewState?.kind === "ready" ? livePreviewState.data : undefined} /> : null}
              {!customMetricId && definition.source === "economic" ? <p className="text-sm text-muted-foreground">Denne måned. Økonomital hentes ved indlæsning og følger samme beregninger som månedsrapporten.</p> : null}
            </div>
          ) : null}

          {step === 3 && selectedMetricAvailable ? (
            <div className="flex min-h-full flex-col gap-3">
              <div>
                <h2 className="text-sm font-medium">Hvor meget plads skal widgetten bruge?</h2>
                <p className="text-sm text-muted-foreground">Størrelsen kan altid justeres fra widgettens hjørne.</p>
              </div>
              <ToggleGroup
                value={[size]}
                onValueChange={(values) => {
                  const next = widgetSizes.find((item) => item === values[0]);
                  if (next) setSize(next);
                }}
                spacing={3}
                aria-label="Widgetstørrelse"
                appearance="cards"
                className="grid w-full min-w-0 items-stretch sm:grid-cols-2 lg:grid-cols-3"
              >
                {widgetSizes.map((nextSize) => {
                  const selected = size === nextSize;
                  const span = widgetSizeSpans[nextSize];
                  return (
                    <ToggleGroupItem
                      key={nextSize}
                      value={nextSize}
                      nativeButton={false}
                      render={(props) => (
                        <Card
                          {...props}
                          size="sm"
                          data-size="sm"
                          data-slot="card"
                          appearance="choice"
                          highlight={selected ? "choice" : undefined}
                          className="cursor-pointer"
                        />
                      )}
                    >
                      <CardHeader>
                        <CardTitle>{sizeLabels[nextSize]}</CardTitle>
                        <CardDescription>{span.columns} × {span.rows}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex h-36 items-center justify-center overflow-hidden">
                        <div className={cn("rounded-lg border-2 border-dashed border-primary/50 bg-primary/10", sizePreviewClasses[nextSize])} aria-hidden="true" />
                      </CardContent>
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
              {visualizationHasYAxis(visualization) ? (
                <div className="flex flex-col gap-3 border-t pt-4">
                  <div>
                    <h2 className="text-sm font-medium">Y-akse</h2>
                    <p className="text-sm text-muted-foreground">Angiv grænser eller brug automatisk skala.</p>
                  </div>
                  <YAxisSettings
                    idPrefix="new-widget-y-axis"
                    min={yAxisMin}
                    max={yAxisMax}
                    onChange={({ min, max }) => {
                      setYAxisMin(min);
                      setYAxisMax(max);
                    }}
                    onValidityChange={setYAxisValid}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={closeOrPrevious}>
            {step === 1 ? "Annullér" : <><ChevronLeftIcon data-icon="inline-start" /> Tilbage</>}
          </Button>
          {step < 3 ? (
            <Button type="button" disabled={customMetricPending || !selectedMetricAvailable} onClick={() => setStep((current) => (current + 1) as Step)}>
              Næste <ChevronRightIcon data-icon="inline-end" />
            </Button>
          ) : (
            <Button type="button" onClick={add} disabled={!yAxisValid || !selectedMetricAvailable}>Tilføj widget</Button>
          )}
        </DialogFooter>
      </DialogContent>
      </Dialog>
      {builderOpen && (!builderMetric || customMetricAvailable(builderMetric.spec, integrations)) ? (
        <CustomMetricBuilder
          key={`${builderOpen ? "open" : "closed"}:${builderMetric?.id ?? "new"}:${builderMetric?.updatedAt ?? ""}`}
          open
          onOpenChange={(nextOpen) => {
            setBuilderOpen(nextOpen);
            if (!nextOpen) {
              setBuilderMetric(null);
              setStep(1);
              setDialogOpen(true, false);
            }
          }}
          scope={scope}
          range={range}
          now={now}
          granularity={access?.granularity}
          metric={builderMetric}
          onSaved={(id) => {
            setBuilderOpen(false);
            setBuilderMetric(null);
            selectCustomMetric(id);
            setStep(2);
            setDialogOpen(true, false);
          }}
        />
      ) : null}
      <AlertDialog open={Boolean(deletingMetric && customMetricAvailable(deletingMetric.spec, integrations))} onOpenChange={(nextOpen) => { if (!nextOpen && !deleting) setDeletingMetric(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet tilpasset måling?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingMetric ? `Målingen “${deletingMetric.name}” slettes permanent.` : "Målingen slettes permanent."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annullér</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={(event) => { event.preventDefault(); void confirmDeleteCustomMetric(); }}>
              {deleting ? "Sletter…" : "Slet måling"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
