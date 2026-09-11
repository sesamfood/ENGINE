"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { useAction, useMutation, useQueries, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowLeftIcon, CheckIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldContent, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { MonthlyActualsDialog } from "./monthly-actuals-dialog";
import { MonthlyBudgetDialog } from "./monthly-budget-dialog";

type MonthlyContext = FunctionReturnType<typeof api.monthlyKpi.getContext>;
type ReportState = FunctionReturnType<typeof api.economicReports.getReportState>;
type LiveReport = FunctionReturnType<typeof api.economicReports.getReport>;
type ApprovalCandidate = LiveReport["approvals"][number];
const columns = [
  { key: "actual", label: "Faktisk" },
  { key: "budget", label: "Budget" },
  { key: "variance", label: "Afvigelse" },
  { key: "lastMonth", label: "Sidste måned" },
  { key: "ytd", label: "År til dato" },
] as const;

const explanations: Partial<Record<MonthlyKpiRow["id"], string>> = {
  cogsPercent: "Lagerreguleret vareforbrug i procent af nettoomsætningen. En lavere procent er bedre.",
  labourPercent: "Godkendt løn fra e-conomic erstatter Workfeeds estimat for den enkelte lokation og måned. En lavere procent er bedre.",
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
    <TableCell className="py-4 text-right tabular-nums">
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

const categoryLabels = { sales: "Nettoomsætning", cogs: "Vareforbrug", labour: "Løn", rent: "Husleje", utilities: "Forbrug", other: "Øvrige driftsomkostninger" };
function candidateKey(candidate: ApprovalCandidate) { return `${candidate.kind}:${candidate.category}`; }
function candidateAmount(candidate: ApprovalCandidate) {
  return new Intl.NumberFormat("da-DK", { style: "currency", currency: candidate.currency }).format(candidate.amountMinor / 100);
}

function AccountingApprovalDialog({ candidates, month, locationId, now, revision }: {
  candidates: ApprovalCandidate[]; month: string; locationId: Id<"locations">; now: number; revision: string;
}) {
  const approve = useAction(api.economicReports.approve);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [sourceNote, setSourceNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const chosen = candidates.filter((candidate) => selected.includes(candidateKey(candidate)));
  const sourceError = !sourceNote.trim() || sourceNote.trim().length > 1000 ? "Angiv en kilde eller reference på højst 1.000 tegn." : null;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (saving || sourceError || !chosen.length) return;
    if (!confirming) { setConfirming(true); return; }
    setSaving(true);
    try {
      await approve({ month, locationId, now, expectedRevision: revision,
        items: chosen.map(({ category, kind, fingerprint }) => ({ category, kind, fingerprint })), sourceNote });
      toast.success("De valgte beløb er godkendt");
      setOpen(false);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Beløbene kunne ikke godkendes. Opdatér rapporten, og prøv igen."));
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) { setOpen(next); if (!next) setConfirming(false); } }}>
      <DialogTrigger render={<Button variant="outline" className="min-h-11" />}><CheckIcon data-icon="inline-start" />Godkend e-conomic</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>Godkend beløb fra e-conomic</DialogTitle>
          <DialogDescription>{candidates[0]?.locationName}, {new Date(`${month}-01T12:00:00Z`).toLocaleDateString("da-DK", { month: "long", year: "numeric", timeZone: "UTC" })}. Kontrollér beløbene mod de afsluttede regnskabs- og budgetrapporter.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-5" noValidate onSubmit={(event) => void save(event)}>
          {confirming ? (
            <Alert>
              <AlertTitle>Godkend de valgte beløb</AlertTitle>
              <AlertDescription>
                <ul className="flex list-disc flex-col gap-2 pl-5">{chosen.map((candidate) => <li key={candidateKey(candidate)}>{categoryLabels[candidate.category]}, {candidate.kind === "actual" ? "faktisk" : "budget"}: {candidateAmount(candidate)}</li>)}</ul>
                <p className="whitespace-pre-wrap break-words">Kilde: {sourceNote.trim()}</p>
                <p>Beløbene kontrolleres igen før godkendelse. Senere ændringer i regnskabet kræver en ny godkendelse.</p>
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <FieldGroup>
                {candidates.map((candidate) => {
                  const key = candidateKey(candidate);
                  return (
                    <Field key={key} orientation="horizontal" className="items-start rounded-lg border p-3">
                      <Checkbox id={`economic-approval-${key}`} className="mt-1" checked={selected.includes(key)} disabled={saving}
                        onCheckedChange={(checked) => setSelected((current) => checked ? [...current, key] : current.filter((value) => value !== key))} />
                      <FieldContent>
                        <FieldLabel htmlFor={`economic-approval-${key}`} className="min-h-11 flex-wrap">
                          {categoryLabels[candidate.category]} · {candidate.kind === "actual" ? "Faktisk" : "Budget"} · {candidateAmount(candidate)}
                        </FieldLabel>
                        <p className="break-words text-sm text-muted-foreground">{candidate.source}</p>
                      </FieldContent>
                    </Field>
                  );
                })}
                {submitted && !chosen.length ? <FieldError>Vælg mindst ét beløb.</FieldError> : null}
                <Field data-invalid={submitted && Boolean(sourceError)}>
                  <FieldLabel htmlFor="economic-approval-source">Kilde eller reference</FieldLabel>
                  <Textarea id="economic-approval-source" value={sourceNote} maxLength={1000} onChange={(event) => setSourceNote(event.target.value)} disabled={saving}
                    aria-invalid={submitted && Boolean(sourceError)} aria-describedby={submitted && sourceError ? "economic-approval-source-error" : undefined} />
                  {submitted ? <FieldError id="economic-approval-source-error">{sourceError}</FieldError> : null}
                </Field>
              </FieldGroup>
              <p className="text-sm text-muted-foreground">Godkend kun fuldstændige beløb. Vareforbrug skal være lagerreguleret, og løn skal omfatte alle arbejdsgiveromkostninger.</p>
            </>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => confirming ? setConfirming(false) : setOpen(false)}>{confirming ? "Redigér valg" : "Annullér"}</Button>
            <Button type="submit" className="min-h-11" disabled={saving}>{saving ? <Spinner data-icon="inline-start" /> : null}{saving ? "Godkender" : confirming ? "Godkend valgte beløb" : "Kontrollér og godkend"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type LoadedReport = { version: number } & ({ kind: "ready"; data: LiveReport } | { kind: "error"; message: string });

function ReportData({ state, month, locationId, locationName, now, timeZone, pendingReads }: {
  state: ReportState; month: string; locationId: Id<"locations"> | null; locationName: string; now: number; timeZone: string;
  pendingReads: RefObject<Map<string, Promise<LiveReport>>>;
}) {
  const getReport = useAction(api.economicReports.getReport);
  const [requestedAt] = useState(now);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [loaded, setLoaded] = useState<LoadedReport | null>(null);
  const current = loaded?.version === refreshVersion ? loaded : null;
  const loading = state.connected && current === null;
  const result = current?.kind === "ready" ? current.data : null;
  const report = result?.report ?? state.report;
  const errors = current?.kind === "error" ? [current.message] : result?.errors ?? [];
  const candidates = locationId ? result?.approvals.filter((candidate) => candidate.locationId === locationId && candidate.month === month && !candidate.approved) ?? [] : [];

  useEffect(() => {
    if (!state.connected) return;
    let active = true;
    const key = JSON.stringify([month, locationId, state.revision]);
    let promise = pendingReads.current.get(key);
    if (!promise) {
      promise = getReport({ month, locationIds: locationId ? [locationId] : null, now: requestedAt, expectedRevision: state.revision });
      pendingReads.current.set(key, promise);
      void promise.finally(() => pendingReads.current.delete(key)).catch(() => {});
    }
    void promise.then(
      (data) => { if (active) setLoaded({ version: refreshVersion, kind: "ready", data }); },
      (error: unknown) => { if (active) setLoaded({ version: refreshVersion, kind: "error", message: getUserErrorMessage(error, "e-conomic kunne ikke indlæses. Prøv igen.") }); },
    );
    return () => { active = false; };
  }, [getReport, locationId, month, pendingReads, refreshVersion, requestedAt, state.connected, state.revision]);

  return (
    <>
      {state.connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            {loading ? <><Spinner data-icon="inline-start" />Henter beløb fra e-conomic</> : result?.fetchedAt ? `e-conomic hentet ${new Date(result.fetchedAt).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short", timeZone })}` : "e-conomic er ikke indlæst"}
          </p>
          <div className="flex flex-wrap gap-2">
            {state.canApprove && locationId && candidates.length ? <AccountingApprovalDialog key={refreshVersion} candidates={candidates} month={month} locationId={locationId} now={requestedAt} revision={state.revision} /> : null}
            <Button variant="outline" className="min-h-11" disabled={loading} onClick={() => setRefreshVersion((version) => version + 1)}><RefreshCwIcon data-icon="inline-start" />Opdatér e-conomic</Button>
          </div>
        </div>
      ) : <p className="text-sm text-muted-foreground">e-conomic er ikke forbundet for de valgte lokationer.</p>}
      {errors.length ? <Alert variant="destructive"><AlertTitle>e-conomic kunne ikke indlæses fuldstændigt</AlertTitle><AlertDescription><ul className="flex list-disc flex-col gap-1 pl-5">{errors.map((error, index) => <li key={`${index}:${error}`}>{error}</li>)}</ul><p>Opdatér e-conomic for at prøve igen.</p></AlertDescription></Alert> : null}
      <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
        <p>{report.through ? `Faktisk til og med ${new Date(`${report.through}T12:00:00Z`).toLocaleDateString("da-DK", { dateStyle: "long", timeZone: "UTC" })}.` : "Ingen afsluttede dage i den valgte måned."} Budgettet dækker hele måneden.</p>
        <p>{report.updatedAt === null ? "Ingen POS- eller Workfeed-synkronisering registreret" : `Ældste POS- eller Workfeed-synkronisering ${new Date(report.updatedAt).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short", timeZone })}`}</p>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card" aria-busy={loading}>
        <Table className="min-w-[56rem]">
          <TableCaption className="sr-only">Månedsrapport for {month}, {locationName}</TableCaption>
          <TableHeader><TableRow><TableHead className="min-w-48">KPI</TableHead>{columns.map((column) => <TableHead key={column.key} className="text-right">{column.label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{report.rows.map((row) => (
            <TableRow key={row.id}>
              <TableHead scope="row" className="py-4 font-medium"><div className="flex items-center gap-1">{row.label}{explanations[row.id] ? <HelpTooltip label={row.label} content={explanations[row.id]} /> : null}</div></TableHead>
              {columns.map((column) => <ReportCell key={column.key} cell={row[column.key]} row={row} column={column} currency={report.currency} />)}
            </TableRow>
          ))}</TableBody>
        </Table>
      </div>
      <p className="text-sm text-muted-foreground">Sidste måned er den foregående kalendermåned. År til dato beregnes af årets samlede beløb og antal. Åbne måneder og Workfeed-estimater er foreløbige. Afvigelser i procenter vises i procentpoint.</p>
    </>
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
  const pendingReads = useRef(new Map<string, Promise<LiveReport>>());
  const selectedLocation = context.locations.find((location) => location.id === locationSelection);
  const locationIds = selectedLocation ? [selectedLocation.id] : null;
  const validMonth = /^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) && month >= "1900-01" && month <= currentMonth;
  const states: Record<string, ReportState | Error | undefined> = useQueries(validMonth && context.locations.length > 0
    ? { report: { query: api.economicReports.getReportState, args: { month, locationIds, now } } } : {});
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
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <AppPageHeader><div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Månedsrapport</h1>
        <Button variant="outline" className="min-h-11" nativeButton={false} render={<Link href="/dashboard" />}><ArrowLeftIcon data-icon="inline-start" />Dashboard</Button>
      </div></AppPageHeader>
      {context.locations.length === 0 ? (
        <Empty className="min-h-64 border"><EmptyHeader><EmptyTitle>Ingen lokationer</EmptyTitle><EmptyDescription>Du har ingen lokationer, der kan vises i rapporten.</EmptyDescription></EmptyHeader></Empty>
      ) : (
        <>
          <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 lg:flex-row lg:items-end lg:justify-between">
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
              {context.canManageBudgets && validMonth ? <>
                <MonthlyBudgetDialog key={`budget:${month}:${selectedLocation?.id ?? "all"}`} month={month} locations={context.locations} selectedLocationId={selectedLocation?.id ?? null} />
                <MonthlyActualsDialog key={`actuals:${month}:${selectedLocation?.id ?? "all"}`} month={month} locations={context.locations} selectedLocationId={selectedLocation?.id ?? null} />
              </> : null}
              {context.canSync ? <Button variant="outline" className="min-h-11" disabled={syncing || !validMonth} onClick={() => void sync()}>{syncing ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}{syncing ? "Opdaterer" : "Opdatér POS og Workfeed"}</Button> : null}
            </div>
          </div>
          {validMonth ? state instanceof Error ? <Alert variant="destructive"><AlertTitle>Rapporten kunne ikke indlæses</AlertTitle><AlertDescription>{getUserErrorMessage(state, "Kontrollér din adgang, og prøv igen.")}</AlertDescription></Alert>
            : state ? <ReportData key={`${context.organizationId}:${month}:${selectedLocation?.id ?? "all"}:${state.revision}`} state={state} month={month} locationId={selectedLocation?.id ?? null} locationName={selectedLocation?.name ?? "alle tilgængelige lokationer"} now={now} timeZone={context.timeZone} pendingReads={pendingReads} />
              : <Skeleton className="h-80 w-full" /> : null}
        </>
      )}
    </section>
  );
}

function MonthlyReportAccess() {
  const organization = authClient.useActiveOrganization();
  const access = useAccess();
  const canView = usePermission("dashboard.view");
  const canViewFinancials = usePermission("dashboard.viewFinancials");
  const allowed = canView && canViewFinancials && access?.granularity === "detail" && !access.kiosk?.kioskModeEnabled;
  const context = useQuery(api.monthlyKpi.getContext, allowed && organization.data ? {} : "skip");
  if (!access) return <Skeleton className="h-96 w-full" />;
  if (!allowed) return <Alert variant="destructive" className="max-w-xl"><AlertTitle>Ingen adgang</AlertTitle><AlertDescription>Du har ikke adgang til månedsrapportens økonomiske data.</AlertDescription></Alert>;
  if (!context || !organization.data || context.organizationId !== organization.data.id) return <Skeleton className="h-96 w-full" />;
  return <MonthlyReportContent key={JSON.stringify([context.organizationId, access.permissions, access.locationScope])} context={context} />;
}

export function MonthlyKpiReport() {
  return <OrganizationAuthGate><MonthlyReportAccess /></OrganizationAuthGate>;
}
