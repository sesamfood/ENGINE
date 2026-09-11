"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ClipboardCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getUserErrorMessage } from "@/lib/user-errors";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { monthlyMoneyDraft, parseMonthlyValue } from "./monthly-budget-dialog";

type Actuals = FunctionReturnType<typeof api.monthlyKpi.getActuals>;
type Locations = FunctionReturnType<typeof api.monthlyKpi.getContext>["locations"];

function amountLabel(amount: number | null, currency: string) {
  return amount === null ? "Ikke angivet" : new Intl.NumberFormat("da-DK", { style: "currency", currency }).format(amount / 100);
}

function ActualsForm({ actuals, month, locationId, saving, onSavingChange, onClose }: {
  actuals: Actuals; month: string; locationId: Id<"locations">; saving: boolean;
  onSavingChange: (value: boolean) => void; onClose: () => void;
}) {
  const approve = useMutation(api.monthlyKpi.approveActuals);
  const [cogs, setCogs] = useState(() => monthlyMoneyDraft(actuals.cogs));
  const [waste, setWaste] = useState(() => monthlyMoneyDraft(actuals.waste));
  const [sourceNote, setSourceNote] = useState(actuals.sourceNote);
  const [revision, setRevision] = useState(actuals.revision);
  const [currency, setCurrency] = useState(actuals.currency);
  const [submitted, setSubmitted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const parsedCogs = parseMonthlyValue(cogs, "signedMoney");
  const parsedWaste = parseMonthlyValue(waste, "signedMoney");
  const sourceError = !sourceNote.trim() || sourceNote.trim().length > 1000 ? "Angiv en kilde eller reference på højst 1.000 tegn." : null;
  const conflict = actuals.revision !== revision || actuals.currency !== currency;
  const invalid = parsedCogs.error || parsedWaste.error || sourceError;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (invalid || saving || conflict || !actuals.canApprove) return;
    if (!confirming) { setConfirming(true); return; }
    onSavingChange(true);
    try {
      await approve({ month, locationId, cogs: parsedCogs.value, waste: parsedWaste.value,
        sourceNote, expectedRevision: revision, expectedCurrency: currency });
      toast.success(`Månedstallene er godkendt som revision ${revision + 1}`);
      onClose();
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Månedstallene kunne ikke godkendes. Prøv igen."));
    } finally {
      onSavingChange(false);
    }
  }

  return (
    <form className="flex flex-col gap-5" noValidate onSubmit={(event) => void save(event)}>
      {!actuals.canApprove ? <Alert><AlertTitle>Måneden er ikke afsluttet</AlertTitle><AlertDescription>Manuelle månedstal kan først godkendes, når hele kalendermåneden er afsluttet.</AlertDescription></Alert> : null}
      {conflict ? (
        <Alert>
          <AlertTitle>Månedstallene skal indlæses igen</AlertTitle>
          <AlertDescription>
            <p>Tallene eller lokationens valuta er ændret.</p>
            <Button type="button" variant="outline" className="mt-2 min-h-11" onClick={() => {
              setCogs(monthlyMoneyDraft(actuals.cogs)); setWaste(monthlyMoneyDraft(actuals.waste));
              setSourceNote(actuals.sourceNote); setRevision(actuals.revision); setCurrency(actuals.currency);
              setSubmitted(false); setConfirming(false);
            }}>Indlæs nyeste månedstal</Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {confirming ? (
        <Alert>
          <AlertTitle>Godkend revision {revision + 1}</AlertTitle>
          <AlertDescription>
            <p>Vareforbrug: {amountLabel(parsedCogs.value, currency)}. Waste: {amountLabel(parsedWaste.value, currency)}.</p>
            <p className="whitespace-pre-wrap break-words">Kilde: {sourceNote.trim()}</p>
            <p>Denne revision bliver rapportens manuelle månedstal. Tomme felter fjerner det tidligere manuelle beløb. Tidligere revisioner bevares i historikken.</p>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <FieldGroup>
            <Field data-invalid={submitted && Boolean(parsedCogs.error)}>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="monthly-actuals-cogs">Vareforbrug ({currency})</FieldLabel>
                <HelpTooltip label="Godkendt vareforbrug" content="Brug det lagerregulerede vareforbrug for hele måneden. Indkøb alene er ikke vareforbrug. Beløbet bruges som manuelt grundlag, når godkendt vareforbrug fra e-conomic mangler." />
              </div>
              <Input id="monthly-actuals-cogs" className="h-11" inputMode="text" value={cogs} onChange={(event) => setCogs(event.target.value)}
                disabled={saving || conflict || !actuals.canApprove} aria-invalid={submitted && Boolean(parsedCogs.error)} aria-describedby={submitted && parsedCogs.error ? "monthly-actuals-cogs-error" : undefined} />
              {submitted ? <FieldError id="monthly-actuals-cogs-error">{parsedCogs.error}</FieldError> : null}
            </Field>
            <Field data-invalid={submitted && Boolean(parsedWaste.error)}>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="monthly-actuals-waste">Registreret Waste ({currency})</FieldLabel>
                <HelpTooltip label="Godkendt Waste" content="Brug værdien af registreret Waste for hele måneden. Angiv i kilden, hvordan Staff food og Dårlige leveringer er behandlet. Count-afvigelser og generelt vareforbrug er ikke registreret Waste." />
              </div>
              <Input id="monthly-actuals-waste" className="h-11" inputMode="text" value={waste} onChange={(event) => setWaste(event.target.value)}
                disabled={saving || conflict || !actuals.canApprove} aria-invalid={submitted && Boolean(parsedWaste.error)} aria-describedby={submitted && parsedWaste.error ? "monthly-actuals-waste-error" : undefined} />
              {submitted ? <FieldError id="monthly-actuals-waste-error">{parsedWaste.error}</FieldError> : null}
            </Field>
            <Field data-invalid={submitted && Boolean(sourceError)}>
              <FieldLabel htmlFor="monthly-actuals-source">Kilde eller reference</FieldLabel>
              <Textarea id="monthly-actuals-source" value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} maxLength={1000}
                disabled={saving || conflict || !actuals.canApprove} aria-invalid={submitted && Boolean(sourceError)} aria-describedby={submitted && sourceError ? "monthly-actuals-source-error" : undefined} />
              {submitted ? <FieldError id="monthly-actuals-source-error">{sourceError}</FieldError> : null}
            </Field>
          </FieldGroup>
          <FieldDescription>Beløbene gælder hele måneden. Brug komma som decimaltegn. Krediteringer kan være negative. Et tomt felt betyder, at tallet mangler. 0 er et godkendt nulbeløb.</FieldDescription>
        </>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={() => confirming ? setConfirming(false) : onClose()}>{confirming ? "Redigér" : "Annullér"}</Button>
        <Button type="submit" className="min-h-11" disabled={saving || conflict || !actuals.canApprove}>
          {saving ? <Spinner data-icon="inline-start" /> : null}{saving ? "Godkender" : confirming ? `Godkend revision ${revision + 1}` : "Kontrollér og godkend"}
        </Button>
      </DialogFooter>
      {actuals.history.length ? (
        <details className="rounded-lg border p-3">
          <summary className="min-h-11 cursor-pointer py-2 font-medium">Godkendelseshistorik</summary>
          <ol className="flex flex-col gap-4 pt-2 text-sm">
            {actuals.history.map((entry) => (
              <li key={entry.revision} className="flex flex-col gap-1 border-t pt-3">
                <p className="font-medium">Revision {entry.revision}, {new Date(entry.approvedAt).toLocaleDateString("da-DK", { dateStyle: "medium", timeZone: "UTC" })}</p>
                <p>Vareforbrug: {amountLabel(entry.cogs, entry.currency)}. Waste: {amountLabel(entry.waste, entry.currency)}.</p>
                <p className="whitespace-pre-wrap break-words text-muted-foreground">{entry.sourceNote}</p>
              </li>
            ))}
          </ol>
          {actuals.hasMoreHistory ? <p className="mt-3 text-sm text-muted-foreground">De seneste 20 revisioner vises. Ældre revisioner er bevaret.</p> : null}
        </details>
      ) : null}
    </form>
  );
}

export function MonthlyActualsDialog({ month, locations, selectedLocationId }: {
  month: string; locations: Locations; selectedLocationId: Id<"locations"> | null;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [locationId, setLocationId] = useState<Id<"locations"> | null>(selectedLocationId ?? locations[0]?.id ?? null);
  const selectedLocation = locations.find((location) => location.id === locationId);
  const actuals = useQuery(api.monthlyKpi.getActuals, open && selectedLocation ? { month, locationId: selectedLocation.id, now } : "skip");
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) { if (next) setNow(Date.now()); setOpen(next); } }}>
      <DialogTrigger render={<Button variant="outline" className="min-h-11" />}><ClipboardCheckIcon data-icon="inline-start" />Godkend månedstal</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>Vareforbrug og Waste</DialogTitle>
          <DialogDescription>Godkend manuelle beløb for {new Date(`${month}-01T12:00:00Z`).toLocaleDateString("da-DK", { month: "long", year: "numeric", timeZone: "UTC" })}. Godkendelser gemmes med kilde og revisionshistorik.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="monthly-actuals-location">Lokation</FieldLabel>
          <Select value={locationId} disabled={saving} onValueChange={(value) => setLocationId(locations.find((location) => location.id === value)?.id ?? null)}>
            <SelectTrigger id="monthly-actuals-location" className="min-h-11 w-full"><SelectValue>{selectedLocation?.name ?? "Vælg lokation"}</SelectValue></SelectTrigger>
            <SelectContent><SelectGroup>{locations.map((location) => <SelectItem key={location.id} value={location.id} className="min-h-11">{location.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
        {open && selectedLocation && actuals ? <ActualsForm key={`${month}:${selectedLocation.id}`} actuals={actuals} month={month} locationId={selectedLocation.id} saving={saving} onSavingChange={setSaving} onClose={() => setOpen(false)} /> : <Skeleton className="h-64" />}
      </DialogContent>
    </Dialog>
  );
}
