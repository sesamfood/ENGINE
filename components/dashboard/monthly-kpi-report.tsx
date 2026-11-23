"use client";

import { useIntegrations } from "@/integrations/use-integrations";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, type RequestForQueries } from "convex/react";
import { useQueries, useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { ArrowLeftIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { dateKey } from "@/lib/date";
import { previousKpiMonth, type MonthlyKpiCell, type MonthlyKpiRow } from "@/lib/dashboard/monthly-kpi";
import { useDashboardNow } from "@/lib/dashboard/use-dashboard-now";
import { getUserErrorMessage } from "@/lib/user-errors";
import { useAccess, usePermission } from "@/components/app-shell";
import { AppPageHeader, PageTitle } from "@/components/app-page-header";
import { MonthPicker } from "@/components/date-picker";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldSkeleton, RowsSkeleton } from "@/components/page-skeletons";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MonthlyActualsDialog } from "./monthly-actuals-dialog";
import { MonthlyBudgetDialog } from "./monthly-budget-dialog";
import { useActiveOrganization } from "@/lib/active-organization";

type MonthlyContext = FunctionReturnType<typeof api.monthlyKpi.getContext>;
type Report = FunctionReturnType<typeof api.monthlyKpi.getReport>;
const columns = [
  { key: "actual", label: "Faktisk" },
  { key: "budget", label: "Budget" },
  { key: "variance", label: "Afvigelse" },
  { key: "lastMonth", label: "Sidste måned" },
  { key: "ytd", label: "År til dato" },
] as const;

const explanations: Partial<Record<MonthlyKpiRow["id"], string>> = {
  cogsPercent: "Lagerreguleret vareforbrug i procent af nettoomsætningen. En lavere procent er bedre.",
  labourPercent: "Godkendt løn erstatter estimatet for den enkelte lokation og måned. En lavere procent er bedre.",
  grossMarginPercent: "Nettoomsætning minus vareforbrug, divideret med nettoomsætningen. En højere procent er bedre.",
  wastePercent: "Godkendt registreret Waste i procent af nettoomsætningen. En lavere procent er bedre.",
  rentPercent: "Husleje i procent af nettoomsætningen. En lavere procent er bedre.",
  utilitiesPercent: "El, vand og varme i procent af nettoomsætningen. En lavere procent er bedre.",
  primeCostPercent: "Vareforbrug plus løn i procent af nettoomsætningen. En lavere procent er bedre.",
  ebitdaPercent: "Nettoomsætning minus vareforbrug, løn, husleje, forbrug og øvrige driftsomkostninger, divideret med nettoomsætningen. Waste fratrækkes ikke igen. En højere procent er bedre.",
};

function ReportCell({ cell, row, column, currency }: {
  cell: MonthlyKpiCell; row: MonthlyKpiRow; column: typeof columns[number]; currency: string | null;
}) {
  const isVariance = column.key === "variance";
  let formatted = "Ikke tilgængelig";
  if (cell.value !== null && Number.isFinite(cell.value) && (row.unit !== "currency" || currency)) {
    const options: Intl.NumberFormatOptions = { maximumFractionDigits: row.unit === "count" ? 0 : row.unit === "percent" ? 1 : 2, signDisplay: isVariance ? "exceptZero" : "auto" };
    if (row.unit === "currency" && currency) { options.style = "currency"; options.currency = currency; }
    formatted = new Intl.NumberFormat("da-DK", options).format(cell.value);
    if (row.unit === "percent") formatted += isVariance ? " procentpoint" : " %";
    if (row.unit === "score") formatted += isVariance ? " point" : " / 5";
  }
  const status = cell.estimated ? "Estimat" : cell.status === "provisional" ? "Foreløbig" : cell.status === "approved" ? "Godkendt" : null;
  return (
    <TableCell appearance="metric" className="text-right">
      <div className="flex items-center justify-end gap-1">
        <span className={cell.value === null ? "text-muted-foreground" : undefined}>{formatted}</span>
        {cell.reason || cell.source ? <HelpTooltip label={`${row.label}, ${column.label.toLowerCase()}`} content={
          <div className="flex max-w-sm flex-col gap-2 break-words">
            {cell.reason ? <p>{cell.reason}</p> : null}{cell.source ? <p>Kilde: {cell.source}</p> : null}
          </div>
        } /> : null}
      </div>
      {cell.value !== null && status ? <Badge variant="outline" className="mt-1">{status}</Badge> : null}
    </TableCell>
  );
}

function ReportData({ report, month, locationName, timeZone }: {
  report: Report; month: string; locationName: string; timeZone: string;
}) {
  return (
    <>
      <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
        <p>{report.through ? `Faktisk til og med ${new Date(`${report.through}T12:00:00Z`).toLocaleDateString("da-DK", { dateStyle: "long", timeZone: "UTC" })}.` : "Ingen afsluttede dage i den valgte måned."} Budgettet dækker hele måneden.</p>
        <p>{report.updatedAt === null ? "Ingen synkronisering registreret" : `Ældste synkronisering ${new Date(report.updatedAt).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short", timeZone })}`}</p>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <Table className="min-w-224">
          <TableCaption className="sr-only">Månedsrapport for {month}, {locationName}</TableCaption>
          <TableHeader><TableRow><TableHead className="min-w-48">KPI</TableHead>{columns.map((column) => <TableHead key={column.key} className="text-right">{column.label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{report.rows.map((row) => (
            <TableRow key={row.id}>
              <TableHead scope="row" appearance="metric"><div className="flex items-center gap-1">{row.label}{explanations[row.id] ? <HelpTooltip label={row.label} content={explanations[row.id]} /> : null}</div></TableHead>
              {columns.map((column) => <ReportCell key={column.key} cell={row[column.key]} row={row} column={column} currency={report.currency} />)}
            </TableRow>
          ))}</TableBody>
        </Table>
      </div>
      <p className="text-sm text-muted-foreground">Sidste måned er den foregående kalendermåned. År til dato beregnes af årets samlede beløb og antal. Åbne måneder og estimater er foreløbige. Afvigelser i procenter vises i procentpoint.</p>
    </>
  );
}

function MonthlyReportContent({ context }: { context: MonthlyContext }) {
  const integrations = useIntegrations();
  const dashboardNow = useDashboardNow();
  const [openedAt] = useState(Date.now);
  const now = Math.max(dashboardNow, openedAt);
  const currentMonth = dateKey(now, context.timeZone).slice(0, 7);
  const [month, setMonth] = useState(() => previousKpiMonth(currentMonth));
  const [locationSelection, setLocationSelection] = useState<string>(context.locations.length === 1 ? context.locations[0].id : "all");
  const [syncing, setSyncing] = useState(false);
  const selectedLocation = context.locations.find((location) => location.id === locationSelection);
  const locationIds = selectedLocation ? [selectedLocation.id] : null;
  const validMonth = /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) && month >= "1900-01" && month <= currentMonth;
  const selectedLocationId = selectedLocation?.id ?? null;
  const hasLocations = context.locations.length > 0;
  // useQueries needs a stable object; a new one each render loops forever.
  const reportQueries = useMemo((): RequestForQueries => validMonth && hasLocations
    ? { report: { query: api.monthlyKpi.getReport, args: { month, locationIds: selectedLocationId ? [selectedLocationId] : null, now } } } : {},
  [validMonth, hasLocations, month, selectedLocationId, now]);
  const states: Record<string, Report | Error | undefined> = useQueries(reportQueries);
  const state = states.report;
  const requestSync = useMutation(api.monthlyKpi.requestSync);

  async function sync() {
    setSyncing(true);
    try {
      const result = await requestSync({ month, locationIds });
      if (result.queued > 0) toast.success("Opdateringen er sat i gang");
      else toast.info("Ingen opdatering blev sat i gang. Data kan allerede være ved at blive opdateret.");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Rapportens data kunne ikke opdateres. Prøv igen."));
    } finally { setSyncing(false); }
  }

  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-6">
      <AppPageHeader><div className="flex flex-wrap items-center justify-between gap-4">
        <PageTitle>Månedsrapport</PageTitle>
        <Button variant="outline" className="min-h-11" nativeButton={false} render={<Link href="/dashboard" />}><ArrowLeftIcon data-icon="inline-start" />Dashboard</Button>
      </div></AppPageHeader>
      {context.locations.length === 0 ? (
        <Empty appearance="outlined" className="min-h-64"><EmptyHeader><EmptyTitle>Ingen lokationer</EmptyTitle><EmptyDescription>Du har ingen lokationer, der kan vises i rapporten.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <>
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 lg:flex-row lg:items-end lg:justify-between">
            <FieldGroup className="sm:max-w-xl sm:flex-row">
              <Field data-invalid={!validMonth}>
                <FieldLabel htmlFor="monthly-report-month">Måned</FieldLabel>
                <MonthPicker id="monthly-report-month" min="1900-01" max={currentMonth} value={month} onValueChange={setMonth} aria-invalid={!validMonth} aria-describedby={!validMonth ? "monthly-report-month-error" : undefined} />
                {!validMonth ? <FieldError id="monthly-report-month-error">Vælg den aktuelle måned eller en tidligere måned.</FieldError> : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="monthly-report-location">Lokation</FieldLabel>
                <Select value={selectedLocation?.id ?? "all"} onValueChange={(value) => setLocationSelection(value ?? "all")}>
                  <SelectTrigger id="monthly-report-location" className="min-h-11 w-full"><SelectValue>{selectedLocation?.name ?? "Alle tilgængelige lokationer"}</SelectValue></SelectTrigger>
                  <SelectContent><SelectGroup>
                    <SelectItem value="all" className="min-h-11">Alle tilgængelige lokationer</SelectItem>
                    {context.locations.map((location) => <SelectItem key={location.id} value={location.id} className="min-h-11">{location.name}</SelectItem>)}
                  </SelectGroup></SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            <div className="flex flex-wrap gap-2">
              {context.canManageBudgets && validMonth ? <>
                <MonthlyBudgetDialog key={`budget:${month}:${selectedLocation?.id ?? "all"}`} month={month} locations={context.locations} selectedLocationId={selectedLocation?.id ?? null} />
                <MonthlyActualsDialog key={`actuals:${month}:${selectedLocation?.id ?? "all"}`} month={month} locations={context.locations} selectedLocationId={selectedLocation?.id ?? null} />
              </> : null}
              {context.canSync && (integrations?.onlinepos || integrations?.workfeed) ? <Button variant="outline" className="min-h-11" disabled={syncing || !validMonth} onClick={() => void sync()}>{syncing ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}{syncing ? "Opdaterer" : "Opdatér data"}</Button> : null}
            </div>
          </div>
          {validMonth ? state instanceof Error ? <Alert variant="destructive"><AlertTitle>Rapporten kunne ikke indlæses</AlertTitle><AlertDescription>{getUserErrorMessage(state, "Kontrollér din adgang, og prøv igen.")}</AlertDescription></Alert>
            : state ? <ReportData report={state} month={month} locationName={selectedLocation?.name ?? "alle tilgængelige lokationer"} timeZone={context.timeZone} />
              : <RowsSkeleton rows={8} rowClassName="h-16" /> : null}
        </>
      )}
    </section>
  );
}

function MonthlyReportSkeleton() {
  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-6">
      <AppPageHeader><PageTitle>Månedsrapport</PageTitle></AppPageHeader>
      <div className="flex flex-col gap-5 rounded-xl border bg-card p-4 sm:max-w-none sm:flex-row">
        <FieldSkeleton className="sm:max-w-72" />
        <FieldSkeleton className="sm:max-w-72" />
      </div>
      <RowsSkeleton rows={8} rowClassName="h-16" />
    </section>
  );
}

function MonthlyReportAccess() {
  const organization = useActiveOrganization();
  const access = useAccess();
  const canView = usePermission("dashboard.view");
  const canViewFinancials = usePermission("dashboard.viewFinancials");
  const allowed = canView && canViewFinancials && access?.granularity === "detail";
  const context = useQuery(api.monthlyKpi.getContext, allowed && organization.data ? {} : "skip");
  if (!access) return <MonthlyReportSkeleton />;
  if (!allowed) return <Alert variant="destructive" className="max-w-xl"><AlertTitle>Ingen adgang</AlertTitle><AlertDescription>Du har ikke adgang til månedsrapportens økonomiske data.</AlertDescription></Alert>;
  if (!context || !organization.data || context.organizationId !== organization.data.id) return <MonthlyReportSkeleton />;
  return <MonthlyReportContent key={JSON.stringify([context.organizationId, access.permissions, access.locationScope])} context={context} />;
}

export function MonthlyKpiReport() {
  return <OrganizationAuthGate><MonthlyReportAccess /></OrganizationAuthGate>;
}
