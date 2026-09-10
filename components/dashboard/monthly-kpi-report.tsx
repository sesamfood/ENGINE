"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowLeftIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { dateKey } from "@/lib/date";
import { previousKpiMonth, type MonthlyKpiCell, type MonthlyKpiRow } from "@/lib/dashboard/monthly-kpi";
import { useDashboardNow } from "@/lib/dashboard/use-dashboard-now";
import { getUserErrorMessage } from "@/lib/user-errors";
import { useAccess, usePermission } from "@/components/app-shell";
import { AppPageHeader } from "@/components/app-page-header";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MonthlyBudgetDialog } from "./monthly-budget-dialog";

type MonthlyContext = FunctionReturnType<typeof api.monthlyKpi.getContext>;
const columns = [
  { key: "actual", label: "Faktisk" },
  { key: "budget", label: "Budget" },
  { key: "variance", label: "Afvigelse" },
  { key: "lastMonth", label: "Sidste måned" },
  { key: "ytd", label: "År til dato" },
] as const;

function ReportCell({ cell, row, column, currency }: {
  cell: MonthlyKpiCell;
  row: MonthlyKpiRow;
  column: typeof columns[number];
  currency: string | null;
}) {
  const isVariance = column.key === "variance";
  const estimated = cell.estimated || (row.id === "estimatedLabourPercent" && column.key !== "budget");
  let formatted = "Ikke tilgængelig";
  if (cell.value !== null && Number.isFinite(cell.value) && (row.unit !== "currency" || currency)) {
    const options: Intl.NumberFormatOptions = { maximumFractionDigits: row.unit === "count" ? 0 : row.unit === "percent" ? 1 : 2, signDisplay: isVariance ? "exceptZero" : "auto" };
    if (row.unit === "currency" && currency) {
      options.style = "currency";
      options.currency = currency;
    }
    formatted = new Intl.NumberFormat("da-DK", options).format(cell.value);
    if (row.unit === "percent") formatted += isVariance ? " procentpoint" : " %";
  }
  return (
    <TableCell className="py-4 text-right tabular-nums">
      <div className="flex items-center justify-end gap-1">
        <span className={cell.value === null ? "text-muted-foreground" : undefined}>{formatted}</span>
        {cell.reason ? <HelpTooltip label={`${row.label}, ${column.label.toLowerCase()}`} content={cell.reason} /> : null}
      </div>
      {estimated ? <Badge variant="outline" className="mt-1">Estimat</Badge> : null}
    </TableCell>
  );
}

function MonthlyReportContent({ context }: { context: MonthlyContext }) {
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
  const report = useQuery(api.monthlyKpi.getReport, validMonth && context.locations.length > 0 ? { month, locationIds, now } : "skip");
  const requestSync = useMutation(api.monthlyKpi.requestSync);

  async function sync() {
    setSyncing(true);
    try {
      const result = await requestSync({ month, locationIds });
      if (result.queued > 0) toast.success("Opdateringen er sat i gang");
      else toast.info("Ingen opdatering blev sat i gang. Data kan allerede være ved at blive opdateret.");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Rapportens data kunne ikke opdateres. Prøv igen."));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <AppPageHeader>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Månedsrapport</h1>
          <Button variant="outline" className="min-h-11" nativeButton={false} render={<Link href="/dashboard" />}><ArrowLeftIcon data-icon="inline-start" />Dashboard</Button>
        </div>
      </AppPageHeader>
      {context.locations.length === 0 ? (
        <Empty className="min-h-64 border"><EmptyHeader><EmptyTitle>Ingen lokationer</EmptyTitle><EmptyDescription>Du har ingen lokationer, der kan vises i rapporten.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <>
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
            <FieldGroup className="sm:max-w-xl sm:flex-row">
              <Field data-invalid={!validMonth}>
                <FieldLabel htmlFor="monthly-report-month">Måned</FieldLabel>
                <Input id="monthly-report-month" type="month" className="h-11" min="1900-01" max={currentMonth} value={month} onChange={(event) => setMonth(event.target.value)} aria-invalid={!validMonth} aria-describedby={!validMonth ? "monthly-report-month-error" : undefined} />
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
              {context.canManageBudgets && validMonth ? <MonthlyBudgetDialog key={`${month}:${selectedLocation?.id ?? "all"}`} month={month} locations={context.locations} selectedLocationId={selectedLocation?.id ?? null} /> : null}
              {context.canSync ? <Button variant="outline" className="min-h-11" disabled={syncing || !validMonth} onClick={() => void sync()}>{syncing ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}{syncing ? "Opdaterer" : "Opdatér data"}</Button> : null}
            </div>
          </div>
          {validMonth && report === undefined ? <Skeleton className="h-80 w-full" /> : report ? (
            <>
              <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
                <p>{report.through ? `Faktisk til og med ${new Date(`${report.through}T12:00:00Z`).toLocaleDateString("da-DK", { dateStyle: "long", timeZone: "UTC" })}.` : "Ingen afsluttede dage i den valgte måned."} Budgettet dækker hele måneden.</p>
                <p>{report.updatedAt === null ? "Ingen synkronisering registreret" : `Ældste synkronisering ${new Date(report.updatedAt).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short", timeZone: context.timeZone })}`}</p>
              </div>
              <div className="overflow-hidden rounded-xl border bg-card">
                <Table className="min-w-[56rem]">
                  <TableCaption className="sr-only">Månedsrapport for {month}, {selectedLocation?.name ?? "alle tilgængelige lokationer"}</TableCaption>
                  <TableHeader><TableRow><TableHead className="min-w-48">KPI</TableHead>{columns.map((column) => <TableHead key={column.key} className="text-right">{column.label}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>{report.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableHead scope="row" className="py-4 font-medium">
                        <div className="flex items-center gap-1">
                          {row.label}
                          {row.id === "estimatedLabourPercent" ? <HelpTooltip label="lønprocentens estimat" content="Lønprocenten er et estimat baseret på lønomkostningen i Workfeeds opsætning. Lokationens valuta og organisationens tidszone skal stemme med Workfeed. Den endelige lønomkostning kan afvige." /> : null}
                        </div>
                      </TableHead>
                      {columns.map((column) => <ReportCell key={column.key} cell={row[column.key]} row={row} column={column} currency={report.currency} />)}
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>
              <p className="text-sm text-muted-foreground">Lønprocenten er et estimat fra Workfeed. Sidste måned er den foregående kalendermåned. År til dato beregnes af årets samlede beløb og antal.</p>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}

function MonthlyReportAccess() {
  const access = useAccess();
  const canView = usePermission("dashboard.view");
  const canViewFinancials = usePermission("dashboard.viewFinancials");
  const allowed = canView && canViewFinancials && access?.granularity === "detail" && !access.kiosk?.kioskModeEnabled;
  const context = useQuery(api.monthlyKpi.getContext, allowed ? {} : "skip");
  if (!access) return <Skeleton className="h-96 w-full" />;
  if (!allowed) return <Alert variant="destructive" className="max-w-xl"><AlertTitle>Ingen adgang</AlertTitle><AlertDescription>Du har ikke adgang til månedsrapportens økonomiske data.</AlertDescription></Alert>;
  if (context === undefined) return <Skeleton className="h-96 w-full" />;
  return <MonthlyReportContent context={context} />;
}

export function MonthlyKpiReport() {
  return <OrganizationAuthGate><MonthlyReportAccess /></OrganizationAuthGate>;
}
