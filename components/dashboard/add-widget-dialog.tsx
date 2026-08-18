"use client";

import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAccess } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { customMetricVisualizations, ratioMetricVisualizations } from "@/lib/dashboard/datasets";
import { metricRegistry, metrics, sizeLabels, visualizationLabels } from "@/lib/dashboard/registry";
import { widgetSizeSpans } from "@/lib/dashboard/layout";
import { visualizationRegistry } from "@/lib/dashboard/visualizations";
import { widgetSizes, type DashboardRange, type DashboardScope, type MetricId, type VisualizationId, type WidgetInstance, type WidgetSize } from "@/lib/dashboard/types";
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
  const [step, setStep] = useState<Step>(1);
  const [metricId, setMetricId] = useState<MetricId>(available[0]?.id ?? "wasteRegistrations");
  const [customMetricId, setCustomMetricId] = useState<Id<"customMetrics"> | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const definition = metricRegistry[metricId];
  const customMetric = customMetrics?.find((metric) => metric.id === customMetricId);
  const [visualization, setVisualization] = useState<VisualizationId>(definition.defaultVisualization);
  const [size, setSize] = useState<WidgetSize>(definition.defaultSize);
  const [yAxisMin, setYAxisMin] = useState<number>();
  const [yAxisMax, setYAxisMax] = useState<number>();
  const [yAxisValid, setYAxisValid] = useState(true);
  const builtinPreviewResult = useQuery(
    api.dashboard.getMetric,
    !open || step !== 2 || Boolean(customMetric)
      ? "skip"
      : {
          metricId,
          visualization,
          scope,
          range,
          now,
        },
  );
  const customPreviewResult = useQuery(
    api.customMetrics.preview,
    !open || step !== 2 || !customMetric
      ? "skip"
      : {
          spec: customMetric.spec,
          visualization,
          scope,
          range,
          now,
        },
  );
  const previewResult = customMetric ? customPreviewResult : builtinPreviewResult;
  const customVisualizations = customMetric
    ? (customMetric.spec.kind === "ratio" ? ratioMetricVisualizations : customMetricVisualizations)
        .filter((value) => Boolean(customMetric.spec.dimension) || (value !== "list" && value !== "table"))
    : [];
  const availableVisualizations = customMetric ? customVisualizations : definition.visualizations;

  function selectMetric(nextMetricId: MetricId) {
    const next = metricRegistry[nextMetricId];
    setCustomMetricId(null);
    setMetricId(next.id);
    setVisualization(next.defaultVisualization);
    setSize(next.defaultSize);
    setYAxisMin(undefined);
    setYAxisMax(undefined);
    setYAxisValid(true);
  }

  function selectCustomMetric(nextMetricId: Id<"customMetrics">) {
    setCustomMetricId(nextMetricId);
    setVisualization("kpi");
    setSize("2x2");
    setYAxisMin(undefined);
    setYAxisMax(undefined);
    setYAxisValid(true);
  }

  function selectVisualization(nextVisualization: VisualizationId) {
    setVisualization(nextVisualization);
  }

  function add() {
    const options = yAxisMin !== undefined || yAxisMax !== undefined
      ? {
          ...(yAxisMin !== undefined ? { yAxisMin } : {}),
          ...(yAxisMax !== undefined ? { yAxisMax } : {}),
        }
      : undefined;
    onAdd({
      key: crypto.randomUUID(),
      metric: customMetric
        ? { kind: "custom", id: customMetric.id }
        : { kind: "builtin", id: metricId },
      visualization,
      size,
      options,
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
      setStep(1);
      setCustomMetricId(null);
      setYAxisValid(true);
    }
  }

  function openCustomMetricBuilder() {
    setOpen(false);
    setBuilderOpen(true);
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
                        const selected = metric.id === metricId;
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
                          <CommandItem
                            key={metric.id}
                            value={`${metric.name} ${metric.description ?? ""} tilpasset måling`}
                            onSelect={() => selectCustomMetric(metric.id)}
                            aria-selected={selected}
                            className={cn(
                              "min-h-28 items-start rounded-lg border bg-card p-3 shadow-xs transition-[background-color,box-shadow,border-color] hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
                              selected && "border-primary bg-primary/5 ring-2 ring-primary/20",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium">{metric.name}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{metric.description || "Tilpasset måling fra organisationens bibliotek."}</p>
                              <p className="mt-2 text-xs text-muted-foreground">{metric.spec.kind === "ratio" ? "Forhold" : "Enkeltmåling"}</p>
                            </div>
                          </CommandItem>
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
                <h2 className="text-sm font-medium">Hvordan skal {(customMetric?.name ?? definition.label).toLowerCase()} vises?</h2>
                <p className="text-sm text-muted-foreground">Vælg en visning. Du kan ændre den senere.</p>
              </div>
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
            {step === 1 ? "Annuller" : <><ChevronLeftIcon data-icon="inline-start" /> Tilbage</>}
          </Button>
          {step < 3 ? (
            <Button type="button" onClick={() => setStep((current) => (current + 1) as Step)}>
              Næste <ChevronRightIcon data-icon="inline-end" />
            </Button>
          ) : (
            <Button type="button" onClick={add} disabled={!yAxisValid}>Tilføj widget</Button>
          )}
        </DialogFooter>
      </DialogContent>
      </Dialog>
      <CustomMetricBuilder
        key={`${builderOpen ? "open" : "closed"}:${customMetricId ?? "new"}`}
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        scope={scope}
        range={range}
        now={now}
        granularity={access?.granularity}
        onSaved={(id, selection) => {
          onAdd({
            key: crypto.randomUUID(),
            metric: { kind: "custom", id },
            visualization: selection.visualization,
            size: selection.size,
          });
          setBuilderOpen(false);
          setStep(1);
        }}
      />
    </>
  );
}
