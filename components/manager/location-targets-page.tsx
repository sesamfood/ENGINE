"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { PencilIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { metricFeaturesAvailable, metricSourceAvailable } from "@/integrations/dashboard";
import { useIntegrations } from "@/integrations/use-integrations";
import { targetableMetrics, visualizationLabels, type MetricDefinition } from "@/lib/dashboard/registry";
import { targetWidget } from "@/lib/dashboard/target-dashboard";
import { locationTargetKindLabels, locationTargetKinds, targetPeriodLabels, targetUsesPeriod, targetVisualizations, type LocationTargetKind } from "@/lib/dashboard/target";
import { targetPeriods, type TargetPeriod, type VisualizationId, type WidgetInstance, type WidgetSize } from "@/lib/dashboard/types";
import { useDashboardNow } from "@/lib/dashboard/use-dashboard-now";
import { getUserErrorMessage } from "@/lib/user-errors";
import { useAccess, usePermission } from "@/components/app-shell";
import { AppPageHeader, PageTitle } from "@/components/app-page-header";
import { LocationField } from "@/components/location-field";
import { ManagerNavigation } from "@/components/manager/manager-navigation";
import { useActiveOrganization } from "@/lib/active-organization";
import { setManagerLocation, useManagerLocation } from "@/lib/manager-prefs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { formatDraft, parseNumber } from "@/components/dashboard/target-settings";
import { formatMetricValue } from "@/components/dashboard/visualizations/utils";

type Target = FunctionReturnType<typeof api.locationTargets.list>["targets"][number];
type Overview = NonNullable<FunctionReturnType<typeof api.locationTargets.getOverview>>;

export function LocationTargetsPage() {
  const access = useAccess();
  const canView = usePermission("dashboard.view");
  const integrations = useIntegrations();
  const organizationId = useActiveOrganization().data?.id;
  const storedLocationId = useManagerLocation(organizationId);
  const scopeOptions = useQuery(api.dashboard.listScopeOptions, canView ? {} : "skip");
  const settings = useQuery(api.locationTargets.getSettings, canView ? {} : "skip");
  const locations = scopeOptions?.locations ?? [];
  const location = locations.find((item) => item.id === storedLocationId) ?? locations[0];
  const data = useQuery(api.locationTargets.list, location ? { locationId: location.id } : "skip");
  const board = useQuery(api.targetDashboards.get, location ? { locationId: location.id } : "skip");
  const now = useDashboardNow();
  const canViewLegacySales = usePermission("dashboard.viewSales");
  const canViewAggregateSales = usePermission("sales.viewAggregate");
  const canViewDetailedSales = usePermission("sales.viewDetail");
  const canViewSales = canViewLegacySales || canViewAggregateSales || canViewDetailedSales;
  const disabledFeatures = access?.disabledFeatures ?? [];
  const available = targetableMetrics.filter((metric) =>
    settings?.targetMetricIds.includes(metric.id)
    && metricSourceAvailable(metric.source, integrations)
    && metricFeaturesAvailable(metric.features, disabledFeatures)
    && (!metric.sensitive || (metric.source === "wolt" ? canViewAggregateSales || canViewDetailedSales : canViewSales)));

  const header = (
    <AppPageHeader>
      <div className="grid gap-5 sm:grid-cols-(--grid-cols-page-header) sm:items-center">
        <PageTitle>Mål</PageTitle>
        {canView ? (
          <Field>
            <FieldLabel htmlFor="manager-location" className="sr-only">Lokation</FieldLabel>
            <LocationField
              id="manager-location"
              locations={scopeOptions?.locations}
              value={location?.id ?? null}
              locked={locations.length === 1}
              lockedName={locations.length === 1 ? locations[0].name : null}
              onValueChange={(value) => {
                if (organizationId) setManagerLocation(organizationId, value);
              }}
            />
          </Field>
        ) : null}
      </div>
    </AppPageHeader>
  );

  if (access && !canView) {
    return (
      <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-6">
        {header}
        <Alert variant="destructive" className="max-w-xl"><AlertTitle>Ingen adgang</AlertTitle><AlertDescription>Du har ikke adgang til at se dashboardet.</AlertDescription></Alert>
      </section>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-6">
      {header}
      {scopeOptions === undefined || settings === undefined ? (
        <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-40" />)}</div>
      ) : !location ? (
        <Empty appearance="outlined" className="min-h-64">
          <EmptyHeader><EmptyTitle>Ingen lokationer</EmptyTitle><EmptyDescription>Du har ingen lokationer, du kan sætte mål for.</EmptyDescription></EmptyHeader>
        </Empty>
      ) : data === undefined ? (
        <div className="grid gap-4 md:grid-cols-2">{available.map((metric) => <Skeleton key={metric.id} className="h-40" />)}</div>
      ) : available.length === 0 ? (
        <Empty appearance="outlined" className="min-h-64">
          <EmptyHeader><EmptyTitle>Ingen målinger</EmptyTitle><EmptyDescription>Der er ingen målinger, du kan sætte mål for.</EmptyDescription></EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {available.map((metric) => (
            <TargetCard
              key={`${location.id}:${metric.id}`}
              metric={metric}
              locationId={location.id}
              target={data.targets.find((target) => target.metricId === metric.id)}
              widget={board?.widgets.find((widget) => widget.key === targetWidget(metric.id).key)}
              canManage={data.canManage}
              now={now}
            />
          ))}
        </div>
      )}
      <ManagerNavigation />
    </section>
  );
}

const periodTitles: Record<TargetPeriod, string> = { day: "I dag", week: "Denne uge", month: "Denne måned" };
const periodPhrases: Record<TargetPeriod, string> = { day: "pr. dag", week: "pr. uge", month: "pr. måned" };
const previousLabels: Record<TargetPeriod, string> = { day: "I går", week: "Forrige uge", month: "Forrige måned" };
const lastYearLabels: Record<TargetPeriod, string> = {
  day: "Samme ugedag sidste år",
  week: "Samme uge sidste år",
  month: "Samme måned sidste år",
};
const averageLabels: Record<TargetPeriod, string> = {
  day: "Gns. pr. dag, sidste 4 uger",
  week: "Gns. pr. uge, sidste 4 uger",
  month: "Gns. pr. måned, sidste 3 måneder",
};

const formatPercent = (value: number) => `${new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1 }).format(value)} %`;

/** The target for the whole current period in the metric's unit. */
function targetAmount(kind: LocationTargetKind, value: number, overview: Overview | null | undefined) {
  if (kind === "amount") return value;
  const base = kind === "lastYear" ? overview?.lastYear : overview?.previous;
  return base === null || base === undefined ? null : (base * value) / 100;
}

function ReferenceFigures({ metric, overview, period }: {
  metric: MetricDefinition;
  overview: Overview | null | undefined;
  period: TargetPeriod;
}) {
  if (overview === undefined) return <Skeleton className="h-24 w-full" />;
  if (overview === null) return null;
  const format = (value: number | null) => formatMetricValue(value, { unit: metric.unit, currency: overview.currency ?? undefined });
  const rows = [
    { label: `${periodTitles[period]} indtil nu`, value: overview.current },
    { label: previousLabels[period], value: overview.previous },
    { label: lastYearLabels[period], value: overview.lastYear },
    ...(period === "day" ? [] : [{ label: "Sidste år til samme dag", value: overview.lastYearToDate }]),
    { label: averageLabels[period], value: overview.average },
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-3 border-b py-1.5 last:border-b-0">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="font-medium tabular-nums">{format(row.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function TargetCard({ metric, locationId, target, widget, canManage, now }: {
  metric: MetricDefinition;
  locationId: Id<"locations">;
  target: Target | undefined;
  widget: WidgetInstance | undefined;
  canManage: boolean;
  now: number;
}) {
  const usesPeriod = targetUsesPeriod({ kind: "builtin", id: metric.id });
  const period: TargetPeriod = usesPeriod ? target?.period ?? "week" : "month";
  const overview = useQuery(api.locationTargets.getOverview, { locationId, metricId: metric.id, period, now });
  const format = (value: number | null) => formatMetricValue(value, { unit: metric.unit, currency: overview?.currency ?? undefined });
  const ceiling = metric.direction === "down-good";
  const goal = target ? targetAmount(target.kind, target.value, overview) : null;
  const current = overview?.current ?? null;
  const ratio = goal !== null && current !== null && goal > 0 ? current / goal : null;
  const reached = goal !== null && current !== null && (ceiling ? current <= goal : current >= goal);
  const targetText = !target
    ? "Intet mål"
    : target.kind === "amount"
      ? `Mål: ${format(target.value)}${usesPeriod ? ` ${periodPhrases[target.period]}` : ""}`
      : `Mål: ${formatPercent(target.value)} af ${target.kind === "lastYear" ? "sidste år" : "forrige periode"}${usesPeriod ? ` ${periodPhrases[target.period]}` : ""}${goal === null ? "" : ` (${format(goal)})`}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{metric.label}</CardTitle>
        <CardDescription>{targetText}{target && ceiling ? " · loft" : ""}</CardDescription>
        {canManage ? (
          <CardAction>
            <TargetDialog metric={metric} locationId={locationId} target={target} widget={widget} usesPeriod={usesPeriod} now={now} />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {target ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                {overview === undefined ? <Skeleton className="h-8 w-28" /> : <span className="text-2xl font-semibold tabular-nums">{format(current)}</span>}
                <span className="text-sm text-muted-foreground">{periodTitles[period]}</span>
              </div>
              <Progress
                value={ratio === null ? 0 : Math.min(100, Math.round(ratio * 100))}
                size="lg"
                tone={reached ? "success" : ceiling && ratio !== null && ratio > 1 ? "destructive" : "default"}
                aria-label={`Fremgang mod målet for ${metric.label}`}
              />
              <p className="text-sm text-muted-foreground">
                {goal === null
                  ? "Målet kan ikke beregnes uden data for sammenligningsperioden"
                  : ratio === null
                    ? "Ingen data endnu"
                    : ceiling
                      ? reached ? `${Math.round(ratio * 100)} % af loftet er brugt` : `${Math.round((ratio - 1) * 100)} % over loftet`
                      : reached ? "Målet er nået" : `${Math.round(ratio * 100)} % af målet`}
              </p>
            </div>
          ) : null}
          <ReferenceFigures metric={metric} overview={overview} period={period} />
        </div>
      </CardContent>
    </Card>
  );
}

// Common widget sizes, columns × rows on the 8-column dashboard grid.
const sizeChoices: WidgetSize[] = ["2x1", "2x2", "4x1", "4x2", "4x3", "8x2"];
const sizeLabel = (size: WidgetSize) => size.replace("x", " × ");

function TargetDialog({ metric, locationId, target, widget, usesPeriod, now }: {
  metric: MetricDefinition;
  locationId: Id<"locations">;
  target: Target | undefined;
  widget: WidgetInstance | undefined;
  usesPeriod: boolean;
  now: number;
}) {
  const upsert = useMutation(api.locationTargets.upsert);
  const remove = useMutation(api.locationTargets.remove);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<LocationTargetKind>(target?.kind ?? "lastYear");
  const [valueDraft, setValueDraft] = useState(target ? formatDraft(target.value) : "100");
  const [period, setPeriod] = useState<TargetPeriod>(target?.period ?? "week");
  const defaultWidget = widget ?? targetWidget(metric.id);
  const [visualization, setVisualization] = useState<VisualizationId>(defaultWidget.visualization);
  const [size, setSize] = useState<WidgetSize>(defaultWidget.size);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const shownPeriod: TargetPeriod = usesPeriod ? period : "month";
  const overview = useQuery(api.locationTargets.getOverview, open ? { locationId, metricId: metric.id, period: shownPeriod, now } : "skip");
  const value = parseNumber(valueDraft);
  const percent = kind !== "amount";
  const invalid = !Number.isFinite(value) || value < 0
    || (percent ? value > 1000 : metric.unit === "percent" && value > 100);
  const goal = invalid ? null : targetAmount(kind, value, overview);
  const format = (amount: number | null) => formatMetricValue(amount, { unit: metric.unit, currency: overview?.currency ?? undefined });
  const kindOptions = locationTargetKinds.map((item) => ({ value: item, label: locationTargetKindLabels[item] }));
  const periodOptions = targetPeriods.map((item) => ({ value: item, label: targetPeriodLabels[item] }));
  const visualizationOptions = metric.visualizations
    .filter((item) => targetVisualizations.includes(item))
    .map((item) => ({ value: item, label: visualizationLabels[item] }));
  const sizeOptions = (sizeChoices.includes(size) ? sizeChoices : [size, ...sizeChoices])
    .map((item) => ({ value: item, label: sizeLabel(item) }));

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setKind(target?.kind ?? "lastYear");
      setValueDraft(target ? formatDraft(target.value) : "100");
      setPeriod(target?.period ?? "week");
      setVisualization(defaultWidget.visualization);
      setSize(defaultWidget.size);
      setTouched(false);
    }
  }

  function changeKind(next: LocationTargetKind) {
    // Switching between a percentage and an amount makes the old number meaningless.
    if ((next === "amount") !== (kind === "amount")) {
      setValueDraft(next === "amount" ? "" : "100");
      setTouched(false);
    }
    setKind(next);
  }

  async function save() {
    setTouched(true);
    if (invalid) return;
    setSaving(true);
    try {
      await upsert({ locationId, metricId: metric.id, kind, value, period: usesPeriod ? period : "day", visualization, size });
      toast.success("Målet er gemt");
      setOpen(false);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Målet kunne ikke gemmes. Prøv igen."));
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    try {
      await remove({ locationId, metricId: metric.id });
      toast.success("Målet er fjernet");
      setOpen(false);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Målet kunne ikke fjernes. Prøv igen."));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button type="button" variant="outline" className="min-h-11" />}>
        {target ? <PencilIcon data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
        {target ? "Redigér" : "Sæt mål"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mål for {metric.label}</DialogTitle>
          <DialogDescription>
            {metric.direction === "down-good" ? "Lavere er bedre, så målet er et loft." : "Målet vises på dashboardets widgets for lokationen."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field>
            <FieldLabel htmlFor={`target-${metric.id}-kind`}>Måltype</FieldLabel>
            <Select items={kindOptions} value={kind} onValueChange={(next) => changeKind(next as LocationTargetKind)}>
              <SelectTrigger id={`target-${metric.id}-kind`} className="h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                {kindOptions.map((option) => <SelectItem key={option.value} value={option.value} className="min-h-11">{option.label}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
          </Field>
          <Field data-invalid={(touched && invalid) || undefined}>
            <FieldLabel htmlFor={`target-${metric.id}-value`}>
              {percent ? "Procent" : usesPeriod ? "Mål pr. periode" : "Målværdi"}
            </FieldLabel>
            <div className="flex gap-2">
              <InputGroup className="h-11 min-w-0 flex-1">
                <InputGroupInput
                  id={`target-${metric.id}-value`}
                  type="text"
                  inputMode="decimal"
                  value={valueDraft}
                  aria-invalid={touched && invalid}
                  onChange={(event) => setValueDraft(event.target.value)}
                  onBlur={() => setTouched(true)}
                />
                {percent || metric.unit === "percent" ? (
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>%</InputGroupText>
                  </InputGroupAddon>
                ) : null}
              </InputGroup>
              {usesPeriod ? (
                <Select items={periodOptions} value={period} onValueChange={(next) => setPeriod(next as TargetPeriod)}>
                  <SelectTrigger className="h-11 w-28" aria-label="Periode for målet"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>
                    {periodOptions.map((option) => <SelectItem key={option.value} value={option.value} className="min-h-11">{option.label}</SelectItem>)}
                  </SelectGroup></SelectContent>
                </Select>
              ) : null}
            </div>
            {touched && invalid ? (
              <FieldError>
                {percent ? "Angiv en procent mellem 0 og 1.000." : metric.unit === "percent" ? "Angiv en procent mellem 0 og 100." : "Angiv et mål på 0 eller mere."}
              </FieldError>
            ) : percent ? (
              <FieldDescription>
                100 % er samme niveau som {kind === "lastYear" ? "sidste år" : "forrige periode"}.
                {goal !== null ? ` Svarer til ${format(goal)} for ${periodTitles[shownPeriod].toLowerCase()}.` : ""}
              </FieldDescription>
            ) : null}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`target-${metric.id}-visualization`}>Diagramtype</FieldLabel>
              <Select items={visualizationOptions} value={visualization} onValueChange={(next) => setVisualization(next as VisualizationId)}>
                <SelectTrigger id={`target-${metric.id}-visualization`} className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  {visualizationOptions.map((option) => <SelectItem key={option.value} value={option.value} className="min-h-11">{option.label}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor={`target-${metric.id}-size`}>Størrelse på dashboardet</FieldLabel>
              <Select items={sizeOptions} value={size} onValueChange={(next) => setSize(next as WidgetSize)}>
                <SelectTrigger id={`target-${metric.id}-size`} className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>
                  {sizeOptions.map((option) => <SelectItem key={option.value} value={option.value} className="min-h-11">{option.label}</SelectItem>)}
                </SelectGroup></SelectContent>
              </Select>
            </Field>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Tal for {periodTitles[shownPeriod].toLowerCase()}</h3>
            <ReferenceFigures metric={metric} overview={overview} period={shownPeriod} />
          </div>
          <DialogFooter className="sm:justify-between">
            {target ? (
              <AlertDialog>
                <AlertDialogTrigger render={<Button type="button" variant="destructive" className="min-h-11" />}>Fjern mål</AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Fjern målet?</AlertDialogTitle>
                    <AlertDialogDescription>Målet for {metric.label} forsvinder fra lokationens dashboards.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Behold mål</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => void clear()}>Fjern mål</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : <span />}
            <Button type="submit" className="min-h-11" disabled={saving}>
              {saving ? <Spinner data-icon="inline-start" /> : null}Gem mål
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
