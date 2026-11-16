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
import { addDays, dateKey } from "@/lib/date";
import { targetableMetrics, type MetricDefinition } from "@/lib/dashboard/registry";
import { targetPeriodLabels, targetUsesPeriod } from "@/lib/dashboard/target";
import { targetPeriods, type DashboardRange, type TargetPeriod } from "@/lib/dashboard/types";
import { useDashboardNow } from "@/lib/dashboard/use-dashboard-now";
import { getUserErrorMessage } from "@/lib/user-errors";
import { useAccess, usePermission } from "@/components/app-shell";
import { AppPageHeader, PageTitle } from "@/components/app-page-header";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { formatDraft, parseNumber } from "@/components/dashboard/target-settings";
import { formatMetricValue, total } from "@/components/dashboard/visualizations/utils";

type Target = FunctionReturnType<typeof api.locationTargets.list>["targets"][number];

const periodTitles: Record<TargetPeriod, string> = { day: "I dag", week: "Denne uge", month: "Denne måned" };
const periodPhrases: Record<TargetPeriod, string> = { day: "pr. dag", week: "pr. uge", month: "pr. måned" };

/** The current day, week or month so far. Levels such as averages are shown for the month. */
function progressRange(period: TargetPeriod, usesPeriod: boolean, now: number, timeZone: string): DashboardRange {
  if (!usesPeriod || period === "month") return { preset: "thisMonth" };
  if (period === "day") return { preset: "today" };
  const today = dateKey(now, timeZone);
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  return { preset: "custom", from: addDays(today, -weekday), to: today };
}

export function LocationTargetsPage() {
  const access = useAccess();
  const canView = usePermission("dashboard.view");
  const integrations = useIntegrations();
  const scopeOptions = useQuery(api.dashboard.listScopeOptions, canView ? {} : "skip");
  const context = useQuery(api.employees.getContext, canView ? {} : "skip");
  const [selectedId, setSelectedId] = useState<Id<"locations"> | null>(null);
  const locations = scopeOptions?.locations ?? [];
  const location = locations.find((item) => item.id === selectedId) ?? locations[0];
  const data = useQuery(api.locationTargets.list, location ? { locationId: location.id } : "skip");
  const now = useDashboardNow();
  const canViewLegacySales = usePermission("dashboard.viewSales");
  const canViewAggregateSales = usePermission("sales.viewAggregate");
  const canViewDetailedSales = usePermission("sales.viewDetail");
  const canViewSales = canViewLegacySales || canViewAggregateSales || canViewDetailedSales;
  const disabledFeatures = access?.disabledFeatures ?? [];
  const available = targetableMetrics.filter((metric) =>
    metricSourceAvailable(metric.source, integrations)
    && metricFeaturesAvailable(metric.features, disabledFeatures)
    && (!metric.sensitive || canViewSales));

  const header = (
    <AppPageHeader><PageTitle>Mål</PageTitle></AppPageHeader>
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
      {scopeOptions === undefined || context === undefined ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-11 w-full sm:max-w-sm" />
          <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-40" />)}</div>
        </div>
      ) : !location ? (
        <Empty appearance="outlined" className="min-h-64">
          <EmptyHeader><EmptyTitle>Ingen lokationer</EmptyTitle><EmptyDescription>Du har ingen lokationer, du kan sætte mål for.</EmptyDescription></EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            {locations.length > 1 ? (
              <Field className="sm:max-w-sm">
                <FieldLabel htmlFor="targets-location">Lokation</FieldLabel>
                <Select value={location.id} onValueChange={(value) => setSelectedId(value as Id<"locations">)}>
                  <SelectTrigger id="targets-location" className="min-h-11 w-full"><SelectValue>{location.name}</SelectValue></SelectTrigger>
                  <SelectContent><SelectGroup>
                    {locations.map((item) => <SelectItem key={item.id} value={item.id} className="min-h-11">{item.name}</SelectItem>)}
                  </SelectGroup></SelectContent>
                </Select>
              </Field>
            ) : <p className="text-sm font-medium">{location.name}</p>}
            <p className="text-sm text-muted-foreground">Målene vises på dashboardets widgets for lokationen.</p>
          </div>
          {data === undefined ? (
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
                  canManage={data.canManage}
                  now={now}
                  timeZone={context.timeZone}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function TargetCard({ metric, locationId, target, canManage, now, timeZone }: {
  metric: MetricDefinition;
  locationId: Id<"locations">;
  target: Target | undefined;
  canManage: boolean;
  now: number;
  timeZone: string;
}) {
  const usesPeriod = targetUsesPeriod({ kind: "builtin", id: metric.id });
  const period = target?.period ?? "week";
  const range = progressRange(period, usesPeriod, now, timeZone);
  const result = useQuery(api.dashboard.getMetric, target ? {
    metricId: metric.id,
    visualization: "kpi",
    scope: { mode: "aggregate", locationIds: [locationId] },
    range,
    now,
  } : "skip");
  const current = result ? total(result) : null;
  const ceiling = metric.direction === "down-good";
  const format = (value: number | null) => formatMetricValue(value, result ?? metric.unit);
  const ratio = target && current !== null && target.amount > 0 ? current / target.amount : null;
  const reached = target && current !== null && (ceiling ? current <= target.amount : current >= target.amount);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{metric.label}</CardTitle>
        <CardDescription>
          {target
            ? `Mål: ${format(target.amount)}${usesPeriod ? ` ${periodPhrases[target.period]}` : ""}${ceiling ? " (loft)" : ""}`
            : "Intet mål"}
        </CardDescription>
        {canManage ? (
          <CardAction>
            <TargetDialog metric={metric} locationId={locationId} target={target} usesPeriod={usesPeriod} />
          </CardAction>
        ) : null}
      </CardHeader>
      {target ? (
        <CardContent>
          <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            {result === undefined ? <Skeleton className="h-8 w-28" /> : <span className="text-2xl font-semibold tabular-nums">{format(current)}</span>}
            <span className="text-sm text-muted-foreground">{usesPeriod ? periodTitles[target.period] : periodTitles.month}</span>
          </div>
          <Progress
            value={ratio === null ? 0 : Math.min(100, Math.round(ratio * 100))}
            size="lg"
            tone={reached ? "success" : ceiling && ratio !== null && ratio > 1 ? "destructive" : "default"}
            aria-label={`Fremgang mod målet for ${metric.label}`}
          />
          <p className="text-sm text-muted-foreground">
            {ratio === null
              ? "Ingen data endnu"
              : ceiling
                ? reached ? `${Math.round(ratio * 100)} % af loftet er brugt` : `${Math.round((ratio - 1) * 100)} % over loftet`
                : reached ? "Målet er nået" : `${Math.round(ratio * 100)} % af målet`}
          </p>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

function TargetDialog({ metric, locationId, target, usesPeriod }: {
  metric: MetricDefinition;
  locationId: Id<"locations">;
  target: Target | undefined;
  usesPeriod: boolean;
}) {
  const upsert = useMutation(api.locationTargets.upsert);
  const remove = useMutation(api.locationTargets.remove);
  const [open, setOpen] = useState(false);
  const [amountDraft, setAmountDraft] = useState(target ? formatDraft(target.amount) : "");
  const [period, setPeriod] = useState<TargetPeriod>(target?.period ?? "week");
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  const amount = parseNumber(amountDraft);
  const invalid = !Number.isFinite(amount) || amount < 0 || (metric.unit === "percent" && amount > 100);
  const periodOptions = targetPeriods.map((item) => ({ value: item, label: targetPeriodLabels[item] }));

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setAmountDraft(target ? formatDraft(target.amount) : "");
      setPeriod(target?.period ?? "week");
      setTouched(false);
    }
  }

  async function save() {
    setTouched(true);
    if (invalid) return;
    setSaving(true);
    try {
      await upsert({ locationId, metricId: metric.id, amount, period: usesPeriod ? period : "day" });
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
      <DialogContent>
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
          <Field data-invalid={(touched && invalid) || undefined}>
            <FieldLabel htmlFor={`target-${metric.id}-amount`}>{usesPeriod ? "Mål pr. periode" : "Målværdi"}</FieldLabel>
            <div className="flex gap-2">
              <InputGroup className="h-11 min-w-0 flex-1">
                <InputGroupInput
                  id={`target-${metric.id}-amount`}
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={amountDraft}
                  aria-invalid={touched && invalid}
                  onChange={(event) => setAmountDraft(event.target.value)}
                  onBlur={() => setTouched(true)}
                />
                {metric.unit === "percent" ? (
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
              <FieldError>{metric.unit === "percent" ? "Angiv en procent mellem 0 og 100." : "Angiv et mål på 0 eller mere."}</FieldError>
            ) : null}
          </Field>
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
