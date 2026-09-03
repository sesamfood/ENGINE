"use client";

import { useEffect, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAccess } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { salesSourceLabels, widgetSizes, type DashboardRange, type DashboardScope, type MetricId, type MetricResult, type SalesSource, type VisualizationId, type WidgetInstance, type WidgetSize } from "@/lib/dashboard/types";
import { getUserErrorMessage } from "@/lib/user-errors";
import { CustomMetricBuilder, type CustomMetricDefinition } from "./custom-metric-builder";
import { visualizationHasYAxis, YAxisSettings } from "./y-axis-settings";

type Step = 1 | 2 | 3;

const stepLabels = ["Måling", "Visualisering", "Størrelse"] as const;

const sizePreviewClasses: Record<WidgetSize, string> = {
  "1x1": "h-14 w-20",
  "1x2": "h-28 w-20",
  "2x1": "h-14 w-40",
  "2x2": "h-28 w-40",
  "4x2": "h-28 w-full",
};

export function AddWidgetDialog({
  canViewSensitive,
  scope,
  range,
  now,
  onAdd,
}: {
  canViewSensitive: boolean;
  scope: DashboardScope;
  range: DashboardRange;
  now: number;
  onAdd: (widget: WidgetInstance) => void;
}) {
  const access = useAccess();
  const convex = useConvex();
  const available = metrics.filter(
    (metric) => !metric.sensitive || canViewSensitive,
  );
  const categories = Array.from(new Set(available.map((metric) => metric.category))).map((category) => ({
    label: category,
    metrics: available.filter((metric) => metric.category === category),
  }));
  const [open, setOpen] = useState(false);
  const customMetrics = useQuery(
    api.customMetrics.list,
    open ? {} : "skip",
  ) as CustomMetricDefinition[] | undefined;
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
  const [visualization, setVisualization] = useState<VisualizationId>(definition.defaultVisualization);
  const [size, setSize] = useState<WidgetSize>(definition.defaultSize);
  const [yAxisMin, setYAxisMin] = useState<number | undefined>(0);
  const [yAxisMax, setYAxisMax] = useState<number>();
  const [yAxisValid, setYAxisValid] = useState(true);
  const [previewResult, setPreviewResult] = useState<MetricResult>();
  const salesSource = metricId === "woltCancellationRate"
    ? "wolt"
    : salesSourceOverride ?? (
        sourceAvailability && !sourceAvailability.onlinePos && sourceAvailability.wolt
          ? "wolt"
          : "onlinePos"
      );
  useEffect(() => {
    if (!open || step !== 2 || (customMetricId && !customMetric)) return;
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
    metricId,
    now,
    open,
    range,
    salesSource,
    scope,
    step,
  ]);
  const customVisualizations = customMetric
    ? (customMetric.spec.kind === "ratio" ? ratioMetricVisualizations : customMetricVisualizations)
        .filter((value) => Boolean(customMetric.spec.dimension) || (value !== "list" && value !== "table"))
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
      options: Object.keys(options).length ? options : undefined,
    });
    setOpen(false);
    setStep(1);
  }

  function closeOrPrevious() {
    if (step === 1) {
      setOpen(false);
      return;
    }
    setStep((current) => (current - 1) as Step);
  }

  function setDialogOpen(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setPreviewResult(undefined);
      setStep(1);
      setCustomMetricId(null);
      setSalesSourceOverride(undefined);
      setYAxisValid(true);
    }
  }

  function openCustomMetricBuilder() {
    setBuilderMetric(null);
    setOpen(false);
    setBuilderOpen(true);
  }

  function editCustomMetric(metric: CustomMetricDefinition) {
    setBuilderMetric(metric);
    setOpen(false);
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
      <Dialog open={open} onOpenChange={setDialogOpen}>
      <DialogTrigger render={<Button type="button" size="lg" className="min-h-11" />}>
        <PlusIcon data-icon="inline-start" />
        Tilføj widget
      </DialogTrigger>
      <DialogContent className="grid max-h-[calc(100vh-2rem)] min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-4xl">
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
          {step === 1 ? (
            <div className="flex h-full min-h-0 flex-col gap-3">
              <div>
                <h2 className="text-sm font-medium">Hvad vil du følge?</h2>
                <p className="text-sm text-muted-foreground">Søg i de indbyggede eller organisationens målinger.</p>
              </div>
              <Command className="min-h-0 flex-1 rounded-lg border" shouldFilter>
                <CommandInput aria-label="Søg efter måling" placeholder="Søg efter måling..." />
                <CommandList className="min-h-0 max-h-none flex-1">
                  <CommandEmpty>Ingen målinger fundet.</CommandEmpty>
                  {categories.map((category) => (
                    <CommandGroup
                      key={category.label}
                      heading={category.label}
                      className="grid grid-cols-1 gap-2 **:[[cmdk-group-heading]]:col-span-full [&>[cmdk-group-items]]:grid [&>[cmdk-group-items]]:grid-cols-1 [&>[cmdk-group-items]]:gap-2 sm:[&>[cmdk-group-items]]:grid-cols-2"
                    >
                      {category.metrics.map((metric) => {
                        const selected = !customMetricId && metric.id === metricId;
                        return (
                          <CommandItem
                            key={metric.id}
                            value={`${metric.label} ${metric.description} ${metric.formula} ${metric.sourceTables.join(" ")}`}
                            onSelect={() => selectMetric(metric.id)}
                            aria-selected={selected}
                            className={cn(
                              "min-h-32 items-start rounded-lg border bg-card p-3 shadow-xs transition-[background-color,box-shadow,border-color] hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
                              selected && "border-primary bg-primary/5 ring-2 ring-primary/20",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">{metric.label}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{metric.description}</p>
                              <p className="mt-2 text-xs">
                                <span className="font-medium">Formel:</span> {metric.formula}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">Datakilder:</span> {metric.sourceTables.join(", ")}
                              </p>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ))}
                  {customMetrics?.length ? (
                    <CommandGroup
                      heading="Organisationens målinger"
                      className="grid grid-cols-1 gap-2 **:[[cmdk-group-heading]]:col-span-full [&>[cmdk-group-items]]:grid [&>[cmdk-group-items]]:grid-cols-1 [&>[cmdk-group-items]]:gap-2 sm:[&>[cmdk-group-items]]:grid-cols-2"
                    >
                      {customMetrics.map((metric) => {
                        const selected = metric.id === customMetricId;
                        return (
                          <div key={metric.id} className="relative">
                            <CommandItem
                              value={`${metric.name} ${metric.description ?? ""} tilpasset måling`}
                              onSelect={() => selectCustomMetric(metric.id)}
                              aria-selected={selected}
                              className={cn(
                                "min-h-28 items-start rounded-lg border bg-card p-3 pr-24 shadow-xs transition-[background-color,box-shadow,border-color] hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
                                selected && "border-primary bg-primary/5 ring-2 ring-primary/20",
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-medium">{metric.name}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{metric.description || "Tilpasset måling fra organisationens bibliotek."}</p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {metric.spec.kind === "ratio" ? "Forhold" : "Enkeltmåling"} · {metric.usageCount} widget{metric.usageCount === 1 ? "" : "s"}
                                </p>
                              </div>
                            </CommandItem>
                            <div className="absolute top-2 right-2 flex gap-1">
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
                      className="min-h-14 rounded-lg border border-dashed p-3 focus-visible:ring-3 focus-visible:ring-ring/50"
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
            </div>
          ) : null}

          {step === 2 ? (
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
                    items={Object.entries(salesSourceLabels).map(([value, label]) => ({ value, label }))}
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
                        {Object.entries(salesSourceLabels).map(([value, label]) => (
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
                <div className="grid gap-3 sm:grid-cols-2">
                  {availableVisualizations.map((visualizationId) => {
                    const Visualization = visualizationRegistry[visualizationId];
                    const selected = visualization === visualizationId;
                    return (
                      <Card
                        key={visualizationId}
                        size="sm"
                        role="button"
                        tabIndex={0}
                        aria-pressed={selected}
                        className={cn(
                          "cursor-pointer outline-none transition-[box-shadow,border-color] focus-visible:ring-3 focus-visible:ring-ring/50",
                          selected && "border-primary ring-2 ring-primary/25",
                        )}
                        onClick={() => selectVisualization(visualizationId)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          selectVisualization(visualizationId);
                        }}
                      >
                        <CardHeader>
                          <CardTitle>{visualizationLabels[visualizationId]}</CardTitle>
                        </CardHeader>
                        <CardContent className="h-44 min-h-0 overflow-hidden">
                          {previewResult ? (
                            <Visualization result={previewResult} />
                          ) : (
                            <Skeleton className="size-full" />
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="flex min-h-full flex-col gap-3">
              <div>
                <h2 className="text-sm font-medium">Hvor meget plads skal widgetten bruge?</h2>
                <p className="text-sm text-muted-foreground">Størrelsen kan altid justeres fra widgettens hjørne.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {widgetSizes.map((nextSize) => {
                  const selected = size === nextSize;
                  const span = widgetSizeSpans[nextSize];
                  return (
                    <Card
                      key={nextSize}
                      size="sm"
                      role="button"
                      tabIndex={0}
                      aria-pressed={selected}
                      className={cn(
                        "cursor-pointer outline-none transition-[box-shadow,border-color] focus-visible:ring-3 focus-visible:ring-ring/50",
                        selected && "border-primary ring-2 ring-primary/25",
                      )}
                      onClick={() => setSize(nextSize)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        setSize(nextSize);
                      }}
                    >
                      <CardHeader>
                        <CardTitle>{sizeLabels[nextSize]}</CardTitle>
                        <CardDescription>{span.columns} × {span.rows}</CardDescription>
                      </CardHeader>
                      <CardContent className="flex h-36 items-center justify-center overflow-hidden">
                        <div className={cn("rounded-lg border-2 border-dashed border-primary/50 bg-primary/10", sizePreviewClasses[nextSize])} aria-hidden="true" />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
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
            <Button type="button" disabled={customMetricPending} onClick={() => setStep((current) => (current + 1) as Step)}>
              Næste <ChevronRightIcon data-icon="inline-end" />
            </Button>
          ) : (
            <Button type="button" onClick={add} disabled={!yAxisValid}>Tilføj widget</Button>
          )}
        </DialogFooter>
      </DialogContent>
      </Dialog>
      <CustomMetricBuilder
        key={`${builderOpen ? "open" : "closed"}:${builderMetric?.id ?? "new"}:${builderMetric?.updatedAt ?? ""}`}
        open={builderOpen}
        onOpenChange={(nextOpen) => {
          setBuilderOpen(nextOpen);
          if (!nextOpen) {
            setBuilderMetric(null);
            setStep(1);
            setOpen(true);
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
          setOpen(true);
        }}
      />
      <AlertDialog open={Boolean(deletingMetric)} onOpenChange={(nextOpen) => { if (!nextOpen && !deleting) setDeletingMetric(null); }}>
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
