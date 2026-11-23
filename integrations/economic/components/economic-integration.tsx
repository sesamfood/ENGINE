"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { PlugIcon, UnplugIcon } from "lucide-react";
import { toast } from "sonner";
import { useAccess, usePermission } from "@/components/app-shell";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { getUserErrorMessage } from "@/lib/user-errors";
import { useActiveOrganization } from "@/lib/active-organization";

type Connection = NonNullable<FunctionReturnType<typeof api.economic.getSettings>["connection"]>;
type Journal = FunctionReturnType<typeof api.economic.listJournals>[number];

function ConnectionForm({ organizationId, reconnect, onDone }: {
  organizationId: string;
  reconnect: boolean;
  onDone?: () => void;
}) {
  const connect = useAction(api.economic.connect);
  const [appSecretToken, setAppSecretToken] = useState("");
  const [agreementGrantToken, setAgreementGrantToken] = useState("");
  const [saving, setSaving] = useState(false);
  const ready = Boolean(appSecretToken.trim() && agreementGrantToken.trim());

  async function save() {
    if (!ready || saving) return;
    setSaving(true);
    try {
      await connect({ expectedOrganizationId: organizationId, appSecretToken, agreementGrantToken });
      setAppSecretToken("");
      setAgreementGrantToken("");
      toast.success(reconnect ? "Forbindelsen er opdateret" : "e-conomic er forbundet");
      onDone?.();
    } catch (error) {
      toast.error(getUserErrorMessage(error, "e-conomic kunne ikke forbindes. Kontrollér nøglerne, og prøv igen."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <FieldGroup className="grid md:grid-cols-2">
        <Field data-disabled={saving}>
          <div className="flex items-center gap-1">
            <FieldLabel htmlFor="economic-app-token">Appnøgle</FieldLabel>
            <HelpTooltip label="appnøgle" content="AppSecretToken fra jeres app i e-conomic. Nøglen gemmes krypteret og vises ikke igen." />
          </div>
          <Input id="economic-app-token" type="password" className="h-11" autoComplete="off" placeholder="AppSecretToken"
            maxLength={1000} required disabled={saving} value={appSecretToken} onChange={(event) => setAppSecretToken(event.target.value)} />
        </Field>
        <Field data-disabled={saving}>
          <div className="flex items-center gap-1">
            <FieldLabel htmlFor="economic-grant-token">Aftalenøgle</FieldLabel>
            <HelpTooltip label="aftalenøgle" content="AgreementGrantToken, som e-conomic udsteder, når aftalen giver appen adgang. Nøglen gemmes krypteret og vises ikke igen." />
          </div>
          <Input id="economic-grant-token" type="password" className="h-11" autoComplete="off" placeholder="AgreementGrantToken"
            maxLength={1000} required disabled={saving} value={agreementGrantToken} onChange={(event) => setAgreementGrantToken(event.target.value)} />
        </Field>
      </FieldGroup>
      <div className="flex flex-wrap justify-end gap-3">
        {onDone ? <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={onDone}>Annullér</Button> : null}
        <Button type="submit" className="min-h-11" disabled={saving || !ready}>
          {saving ? <Spinner data-icon="inline-start" /> : <PlugIcon data-icon="inline-start" />}
          {reconnect ? "Opdatér forbindelse" : "Forbind e-conomic"}
        </Button>
      </div>
    </form>
  );
}

function OptionsForm({ organizationId, connection }: { organizationId: string; connection: Connection }) {
  const listJournals = useAction(api.economic.listJournals);
  const saveOptions = useMutation(api.economic.saveOptions);
  const [journals, setJournals] = useState<Journal[] | Error>();
  const [journalNumber, setJournalNumber] = useState(connection.journalNumber === null ? "none" : String(connection.journalNumber));
  const [bankAccountNumber, setBankAccountNumber] = useState(String(connection.bankAccountNumber));
  const [saving, setSaving] = useState(false);
  const bankAccountValid = /^[1-9]\d{0,9}$/.test(bankAccountNumber.trim());

  useEffect(() => {
    let active = true;
    listJournals({}).then(
      (result) => { if (active) setJournals(result); },
      (error: unknown) => { if (active) setJournals(new Error(getUserErrorMessage(error, "Kassekladderne kunne ikke hentes."))); },
    );
    return () => { active = false; };
  }, [listJournals]);

  const journalItems = [
    { value: "none", label: "Ingen kassekladde" },
    ...(Array.isArray(journals) ? journals : []).map((journal) => ({ value: String(journal.journalNumber), label: `${journal.journalNumber} · ${journal.name}` })),
  ];
  if (!journalItems.some((item) => item.value === journalNumber)) {
    journalItems.push({ value: journalNumber, label: `Kassekladde ${journalNumber}` });
  }

  async function save() {
    if (!bankAccountValid || saving) return;
    setSaving(true);
    try {
      await saveOptions({ expectedOrganizationId: organizationId, journalNumber: journalNumber === "none" ? null : Number(journalNumber), bankAccountNumber: Number(bankAccountNumber) });
      toast.success("Indstillingerne er gemt");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Indstillingerne kunne ikke gemmes. Prøv igen."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id="economic-options" className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <FieldGroup className="grid md:grid-cols-2">
        <Field data-disabled={saving}>
          <div className="flex items-center gap-1">
            <FieldLabel htmlFor="economic-journal">Kassekladde</FieldLabel>
            <HelpTooltip label="kassekladde" content="Kassekladden, hvor betalinger ligger, når de er eksporteret til banken. Økonomi viser posteringerne med bankkontoen som modkonto." />
          </div>
          {journals === undefined ? <Skeleton className="h-11 w-full" /> : (
            <Select items={journalItems} value={journalNumber} disabled={saving} onValueChange={(value) => setJournalNumber(value ?? "none")}>
              <SelectTrigger id="economic-journal" className="min-h-11 w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>
                {journalItems.map((item) => <SelectItem key={item.value} value={item.value} className="min-h-11">{item.label}</SelectItem>)}
              </SelectGroup></SelectContent>
            </Select>
          )}
          {journals instanceof Error ? <FieldError>{journals.message}</FieldError> : null}
        </Field>
        <Field data-disabled={saving} data-invalid={!bankAccountValid}>
          <div className="flex items-center gap-1">
            <FieldLabel htmlFor="economic-bank-account">Bankkonto</FieldLabel>
            <HelpTooltip label="bankkonto" content="Kontonummeret for banken i kontoplanen. Saldoen hentes fra kontoen, og den bruges som modkonto i kassekladden. Skifter du konto, fjernes den indtastede banksaldo." />
          </div>
          <Input id="economic-bank-account" className="h-11" inputMode="numeric" required disabled={saving}
            value={bankAccountNumber} onChange={(event) => setBankAccountNumber(event.target.value)} aria-invalid={!bankAccountValid} />
          {!bankAccountValid ? <FieldError>Angiv et kontonummer.</FieldError> : null}
        </Field>
      </FieldGroup>
      <div className="flex justify-end">
        <Button type="submit" className="min-h-11" disabled={saving || !bankAccountValid}>
          {saving ? <Spinner data-icon="inline-start" /> : null}Gem indstillinger
        </Button>
      </div>
    </form>
  );
}

function ConnectedSettings({ organizationId, connection }: { organizationId: string; connection: Connection }) {
  const disconnect = useMutation(api.economic.disconnect);
  const [reconnecting, setReconnecting] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function remove() {
    setRemoving(true);
    try {
      await disconnect({ expectedOrganizationId: organizationId });
      toast.success("Forbindelsen til e-conomic er fjernet");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Forbindelsen kunne ikke fjernes. Prøv igen."));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card size="sm">
        <CardHeader>
          <CardTitle>{connection.companyName}</CardTitle>
          <CardDescription>{connection.agreementNumber === null ? connection.currency : `Aftale ${connection.agreementNumber} · ${connection.currency}`}</CardDescription>
        </CardHeader>
        {reconnecting ? (
          <CardContent>
            <ConnectionForm organizationId={organizationId} reconnect onDone={() => setReconnecting(false)} />
          </CardContent>
        ) : (
          <CardFooter appearance="spaced" className="flex-wrap justify-end">
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="outline" className="min-h-11" disabled={removing} />}>
                <UnplugIcon data-icon="inline-start" />Fjern forbindelse
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Fjern forbindelsen til e-conomic?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Nøglerne, valget af kassekladde og den indtastede banksaldo slettes. Økonomi kan ikke længere hente data fra e-conomic.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={removing}>Behold forbindelse</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" disabled={removing} onClick={() => void remove()}>Fjern forbindelse</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="outline" className="min-h-11" onClick={() => setReconnecting(true)}>Opdatér forbindelse</Button>
          </CardFooter>
        )}
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Økonomi</CardTitle>
          <CardDescription>Vælg kassekladden med betalinger, der er sendt til banken, og bankkontoen.</CardDescription>
        </CardHeader>
        <CardContent>
          <OptionsForm key={`${connection.connectedAt}:${connection.journalNumber}:${connection.bankAccountNumber}`} organizationId={organizationId} connection={connection} />
        </CardContent>
      </Card>
    </div>
  );
}

export function EconomicIntegration() {
  const { data: session, isPending } = authClient.useSession();
  const organizationId = useActiveOrganization().data?.id;
  if (isPending || !organizationId) return <Skeleton className="h-72 w-full max-w-6xl" />;
  return <OrganizationIntegration key={`${organizationId}:${session?.user.id}`} organizationId={organizationId} />;
}

function OrganizationIntegration({ organizationId }: { organizationId: string }) {
  const access = useAccess();
  const canManage = usePermission("integrations.manage") && access?.locationScope.all === true;
  const settings = useQuery(api.economic.getSettings, canManage ? {} : "skip");

  if (!access || (canManage && (!settings || settings.organizationId !== organizationId))) {
    return <Skeleton className="h-72 w-full max-w-6xl" />;
  }
  if (!canManage || !settings) return null;
  if (settings.connection) return <ConnectedSettings organizationId={organizationId} connection={settings.connection} />;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Forbind e-conomic</CardTitle>
        <CardDescription>Indtast organisationens appnøgle og aftalenøgle fra e-conomic.</CardDescription>
      </CardHeader>
      <CardContent>
        <ConnectionForm organizationId={organizationId} reconnect={false} />
      </CardContent>
    </Card>
  );
}
