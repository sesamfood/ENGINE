"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { PencilIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { AppPageHeader, PageTitle } from "@/components/app-page-header";
import { useAccess, usePermission } from "@/components/app-shell";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { RowsSkeleton } from "@/components/page-skeletons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import { useActiveOrganization } from "@/lib/active-organization";
import { getUserErrorMessage } from "@/lib/user-errors";

type Overview = FunctionReturnType<typeof api.economicFinance.getOverview>;
type Connection = NonNullable<Overview["connection"]>;
type FinanceData = FunctionReturnType<typeof api.economicFinance.fetchData>;

const dateFormatter = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00Z`));

function useMoney(currency: string) {
  return useCallback((minor: number) => new Intl.NumberFormat("da-DK", { style: "currency", currency }).format(minor / 100), [currency]);
}

// Danish format: optional "." thousands groups and "," decimals, for example -1.250.000,50.
function parseAmount(value: string) {
  const match = /^(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const minor = Number(match[2].replaceAll(".", "")) * 100 + Number((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -minor : minor;
}

function BankBalanceCard({ organizationId, connection, balance, error, canEdit, loading }: {
  organizationId: string; connection: Connection; balance: number | null | undefined; error: string | null | undefined; canEdit: boolean; loading: boolean;
}) {
  const money = useMoney(connection.currency);
  const setManualBankBalance = useMutation(api.economicFinance.setManualBankBalance);
  const manual = connection.manualBankBalance;
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const parsed = draft === null ? null : parseAmount(draft);

  async function save(amount: number | null) {
    setSaving(true);
    try {
      await setManualBankBalance({ expectedOrganizationId: organizationId, expectedBankAccountNumber: connection.bankAccountNumber, expectedConnectedAt: connection.connectedAt, amount });
      toast.success(amount === null ? "Den indtastede banksaldo er fjernet" : "Banksaldoen er gemt");
      setDraft(null);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Banksaldoen kunne ikke gemmes. Prøv igen."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle appearance="compact" className="flex items-center">
          Banksaldo
          <HelpTooltip label="banksaldo" content={`Den bogførte saldo på konto ${connection.bankAccountNumber} i e-conomic. Den følger først banken, når bankposteringerne er bogført. Indtast den aktuelle saldo fra banken, hvis den er mere præcis.`} />
        </CardTitle>
        {canEdit && draft === null ? (
          <CardAction>
            <Button variant="outline" className="min-h-11" onClick={() => setDraft(manual ? String(manual.amount / 100).replace(".", ",") : "")}>
              <PencilIcon data-icon="inline-start" />Indtast saldo
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent appearance="stacked" className="flex flex-col">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">e-conomic, konto {connection.bankAccountNumber}</p>
            <p className="text-2xl font-semibold tabular-nums">
              {loading ? <Spinner /> : balance === null || balance === undefined ? "Ikke tilgængelig" : money(balance)}
            </p>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Indtastet banksaldo</p>
            <p className="text-2xl font-semibold tabular-nums">{manual ? money(manual.amount) : "Ikke indtastet"}</p>
            {manual ? (
              <p className="text-sm text-muted-foreground">
                {new Date(manual.enteredAt).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short" })} af {manual.enteredByName}
              </p>
            ) : null}
          </div>
        </div>
        {draft !== null ? (
          <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); if (parsed !== null) void save(parsed); }}>
            <Field data-invalid={draft.trim() !== "" && parsed === null} className="sm:max-w-xs">
              <FieldLabel htmlFor="finance-bank-balance">Nuværende banksaldo ({connection.currency})</FieldLabel>
              <Input id="finance-bank-balance" className="h-11" inputMode="decimal" autoFocus disabled={saving}
                value={draft} onChange={(event) => setDraft(event.target.value)} aria-invalid={draft.trim() !== "" && parsed === null} />
              {draft.trim() !== "" && parsed === null ? <FieldError>Angiv et beløb, for eksempel 125.000,50.</FieldError> : null}
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="min-h-11" disabled={saving || parsed === null}>
                {saving ? <Spinner data-icon="inline-start" /> : null}Gem saldo
              </Button>
              {manual ? <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => void save(null)}>Fjern indtastet saldo</Button> : null}
              <Button type="button" variant="ghost" className="min-h-11" disabled={saving} onClick={() => setDraft(null)}>Annullér</Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PaymentsSection({ payments, today, currency }: { payments: FinanceData["payments"]; today: string; currency: string }) {
  const money = useMoney(currency);
  const total = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const overdue = (payment: FinanceData["payments"][number]) => payment.dueDate !== null && payment.dueDate < today;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle appearance="compact" className="flex items-center">
          Kommende betalinger
          <HelpTooltip label="kommende betalinger" content="Bogførte leverandørfakturaer i e-conomic, som ikke er betalt endnu. e-conomic viser ikke, om en betaling allerede ligger klar i betalingsmodulet." />
        </CardTitle>
        <CardDescription>{payments.length} {payments.length === 1 ? "faktura" : "fakturaer"} · {money(total)}</CardDescription>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? <p className="text-sm text-muted-foreground">Ingen ubetalte leverandørfakturaer.</p> : (
          <>
            <div className="hidden rounded-xl border md:block">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Forfald</TableHead><TableHead>Leverandør</TableHead><TableHead>Tekst</TableHead>
                  <TableHead>Bilag</TableHead><TableHead className="text-right">Beløb</TableHead>
                </TableRow></TableHeader>
                <TableBody>{payments.map((payment) => (
                  <TableRow key={payment.entryNumber}>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        {payment.dueDate ? formatDate(payment.dueDate) : "Ingen forfaldsdato"}
                        {overdue(payment) ? <Badge variant="destructive">Forfalden</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell appearance="label" className="max-w-60 whitespace-normal break-words">{payment.supplierName}</TableCell>
                    <TableCell className="max-w-72 whitespace-normal break-words">{payment.text}</TableCell>
                    <TableCell appearance="numeric">{payment.voucherNumber ?? ""}</TableCell>
                    <TableCell appearance="numeric" className="text-right">{money(payment.amount)}</TableCell>
                  </TableRow>
                ))}</TableBody>
                <TableFooter><TableRow>
                  <TableCell colSpan={4}>I alt</TableCell>
                  <TableCell appearance="total" className="text-right">{money(total)}</TableCell>
                </TableRow></TableFooter>
              </Table>
            </div>
            <ul className="flex flex-col divide-y rounded-xl border md:hidden">
              {payments.map((payment) => (
                <li key={payment.entryNumber} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{payment.supplierName}</p>
                    <p className="text-sm text-muted-foreground break-words">
                      {payment.dueDate ? `Forfald ${formatDate(payment.dueDate)}` : "Ingen forfaldsdato"}{payment.text ? ` · ${payment.text}` : ""}
                    </p>
                    {overdue(payment) ? <Badge variant="destructive" className="mt-1">Forfalden</Badge> : null}
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums">{money(payment.amount)}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function JournalSection({ entries, error, connection, canManage }: { entries: FinanceData["journalEntries"]; error: string | null; connection: Connection; canManage: boolean }) {
  const money = useMoney(connection.currency);
  if (error) {
    return (
      <Card size="sm">
        <CardHeader><CardTitle>Sendt til banken</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-destructive">{error}</p></CardContent>
      </Card>
    );
  }
  if (entries === null) {
    return (
      <Card size="sm">
        <CardHeader><CardTitle>Sendt til banken</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Vælg kassekladden med betalinger, der er sendt til banken, under Administration → Integrationer → e-conomic.
          </p>
          {canManage ? <Button variant="outline" className="mt-3 min-h-11" nativeButton={false} render={<Link href="/administration/integrations/economic" />}>Vælg kassekladde</Button> : null}
        </CardContent>
      </Card>
    );
  }
  const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
  const label = (entry: (typeof entries)[number]) => entry.supplierName ?? entry.text;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle appearance="compact" className="flex items-center">
          Sendt til banken
          <HelpTooltip label="sendt til banken" content={`Posteringer i kassekladde ${connection.journalNumber} med konto ${connection.bankAccountNumber} som modkonto.`} />
        </CardTitle>
        <CardDescription>Kassekladde {connection.journalNumber} · {entries.length} {entries.length === 1 ? "postering" : "posteringer"} · {money(total)}</CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? <p className="text-sm text-muted-foreground">Kassekladden har ingen betalinger til banken.</p> : (
          <>
            <div className="hidden rounded-xl border md:block">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Dato</TableHead><TableHead>Modtager / tekst</TableHead><TableHead>Bilag</TableHead>
                  <TableHead>Konto</TableHead><TableHead className="text-right">Beløb</TableHead>
                </TableRow></TableHeader>
                <TableBody>{entries.map((entry) => (
                  <TableRow key={entry.key}>
                    <TableCell>{formatDate(entry.date)}</TableCell>
                    <TableCell className="max-w-80 whitespace-normal break-words">
                      <span className="font-medium">{label(entry)}</span>
                      {entry.supplierName && entry.text ? <span className="block text-sm text-muted-foreground">{entry.text}</span> : null}
                    </TableCell>
                    <TableCell appearance="numeric">{entry.voucherNumber ?? ""}</TableCell>
                    <TableCell appearance="numeric">{entry.accountNumber ?? ""}</TableCell>
                    <TableCell appearance="numeric" className="text-right">{money(entry.amount)}</TableCell>
                  </TableRow>
                ))}</TableBody>
                <TableFooter><TableRow>
                  <TableCell colSpan={4}>I alt</TableCell>
                  <TableCell appearance="total" className="text-right">{money(total)}</TableCell>
                </TableRow></TableFooter>
              </Table>
            </div>
            <ul className="flex flex-col divide-y rounded-xl border md:hidden">
              {entries.map((entry) => (
                <li key={entry.key} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{label(entry)}</p>
                    <p className="text-sm text-muted-foreground break-words">{formatDate(entry.date)}{entry.supplierName && entry.text ? ` · ${entry.text}` : ""}</p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums">{money(entry.amount)}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FinanceContent({ overview }: { overview: Overview & { connection: Connection } }) {
  const fetchData = useAction(api.economicFinance.fetchData);
  const canManage = usePermission("integrations.manage");
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<{ version: number; result: FinanceData | Error }>();
  const { connection } = overview;
  const current = loaded?.version === version ? loaded.result : undefined;
  const loading = current === undefined;
  // Keep showing the last result while a refresh runs.
  const data = loaded && !(loaded.result instanceof Error) ? loaded.result : undefined;

  useEffect(() => {
    let active = true;
    fetchData({}).then(
      (result) => { if (active) setLoaded({ version, result }); },
      (error: unknown) => { if (active) setLoaded({ version, result: new Error(getUserErrorMessage(error, "Data fra e-conomic kunne ikke hentes. Prøv igen.")) }); },
    );
    return () => { active = false; };
  }, [fetchData, version]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          {loading ? <><Spinner />Henter data fra e-conomic</> : data ? `Hentet fra ${connection.companyName} ${new Date(data.fetchedAt).toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short" })}` : null}
        </p>
        <Button variant="outline" className="min-h-11" disabled={loading} onClick={() => setVersion((value) => value + 1)}>
          <RefreshCwIcon data-icon="inline-start" />Opdatér
        </Button>
      </div>
      {current instanceof Error ? (
        <Alert variant="destructive">
          <AlertTitle>Data fra e-conomic kunne ikke hentes</AlertTitle>
          <AlertDescription>{current.message}</AlertDescription>
        </Alert>
      ) : null}
      <BankBalanceCard organizationId={overview.organizationId} connection={connection} balance={data?.bankBalance} error={data?.bankAccountError} canEdit={overview.canEditBankBalance} loading={loading && !data} />
      {data ? (
        <>
          <PaymentsSection payments={data.payments} today={data.today} currency={connection.currency} />
          <JournalSection entries={data.journalEntries} error={data.journalError} connection={connection} canManage={canManage} />
        </>
      ) : loading ? <RowsSkeleton rows={6} rowClassName="h-14" /> : null}
    </>
  );
}

function FinanceAccess() {
  const organization = useActiveOrganization();
  const access = useAccess();
  const canView = usePermission("finance.view");
  const allowed = canView && access?.locationScope.all === true && !access.kiosk?.kioskModeEnabled;
  const overview = useQuery(api.economicFinance.getOverview, allowed && organization.data ? {} : "skip");
  if (!access) return <RowsSkeleton rows={6} rowClassName="h-14" />;
  if (!allowed) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>Økonomi kræver adgang til Økonomi og til alle lokationer.</AlertDescription>
      </Alert>
    );
  }
  if (!overview || overview.organizationId !== organization.data?.id) return <RowsSkeleton rows={6} rowClassName="h-14" />;
  const { connection } = overview;
  if (!connection) {
    return (
      <Empty appearance="outlined" className="min-h-64">
        <EmptyHeader>
          <EmptyTitle>e-conomic er ikke forbundet</EmptyTitle>
          <EmptyDescription>En Administrator kan forbinde e-conomic under Administration → Integrationer.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  // Remount on any change to what the results describe, so old data never shows under new labels.
  // connectedAt changes whenever the keys may belong to another agreement.
  const identity = [overview.organizationId, connection.connectedAt, connection.journalNumber, connection.bankAccountNumber];
  return <FinanceContent key={JSON.stringify(identity)} overview={{ ...overview, connection }} />;
}

export function FinancePage() {
  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-6">
      <AppPageHeader><PageTitle>Økonomi</PageTitle></AppPageHeader>
      <OrganizationAuthGate><FinanceAccess /></OrganizationAuthGate>
    </section>
  );
}
