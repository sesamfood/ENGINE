"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { PencilIcon } from "lucide-react";
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

type Budget = FunctionReturnType<typeof api.monthlyKpi.getBudget>;
type Locations = FunctionReturnType<typeof api.monthlyKpi.getContext>["locations"];

export function monthlyMoneyDraft(value: number | null) {
  if (value === null) return "";
  const absolute = Math.abs(value);
  return `${value < 0 ? "-" : ""}${Math.floor(absolute / 100).toLocaleString("da-DK")},${String(absolute % 100).padStart(2, "0")}`;
}

export function parseMonthlyValue(value: string, kind: "money" | "signedMoney" | "count" | "score") {
  const trimmed = value.trim();
  if (!trimmed) return { value: null, error: null };
  if (kind === "score") {
    const parsed = /^\d(?:,\d+)?$/.test(trimmed) ? Number(trimmed.replace(",", ".")) : NaN;
    return Number.isFinite(parsed) && parsed >= 1 && parsed <= 5
      ? { value: parsed, error: null } : { value: null, error: "Angiv et mål mellem 1 og 5. Brug komma som decimaltegn." };
  }
  const unsigned = kind === "signedMoney" ? trimmed.replace(/^-/, "") : trimmed;
  const valid = kind === "count" ? /^\d+$/.test(unsigned) : /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(unsigned);
  if (!valid) return { value: null, error: kind === "count" ? "Angiv et helt antal på 0 eller derover." : "Angiv et beløb med højst to decimaler. Brug komma som decimaltegn." };
  const [whole, fraction = ""] = unsigned.replaceAll(".", "").split(",");
  const absolute = kind === "count" ? Number(whole) : Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  const parsed = kind === "signedMoney" && trimmed.startsWith("-") ? -absolute : absolute;
  if (!Number.isSafeInteger(parsed)) return { value: null, error: "Tallet er for stort." };
  return { value: parsed, error: null };
}

function budgetDraft(budget: Budget) {
  return {
    sales: monthlyMoneyDraft(budget.sales), transactions: budget.transactions?.toString() ?? "",
    labour: monthlyMoneyDraft(budget.labour), cogs: monthlyMoneyDraft(budget.cogs),
    waste: monthlyMoneyDraft(budget.waste), rent: monthlyMoneyDraft(budget.rent),
    utilities: monthlyMoneyDraft(budget.utilities), other: monthlyMoneyDraft(budget.other),
    guestScore: budget.guestScore?.toString().replace(".", ",") ?? "",
  };
}

const budgetFields = [
  { key: "sales", label: "Omsætning ekskl. moms", kind: "money" },
  { key: "transactions", label: "Transaktioner", kind: "count" },
  { key: "cogs", label: "Vareforbrug", kind: "money" },
  { key: "labour", label: "Løn", kind: "money" },
  { key: "waste", label: "Waste", kind: "money" },
  { key: "rent", label: "Husleje", kind: "money" },
  { key: "utilities", label: "Forbrug", kind: "money" },
  { key: "other", label: "Øvrige driftsomkostninger", kind: "money" },
  { key: "guestScore", label: "Guest Score-mål", kind: "score" },
] as const;

function BudgetForm({ budget, month, locationId, saving, onSavingChange, onClose }: {
  budget: Budget; month: string; locationId: Id<"locations">; saving: boolean;
  onSavingChange: (value: boolean) => void; onClose: () => void;
}) {
  const saveBudget = useMutation(api.monthlyKpi.saveBudget);
  const [draft, setDraft] = useState(() => budgetDraft(budget));
  const [sourceNote, setSourceNote] = useState(budget.sourceNote);
  const [revision, setRevision] = useState(budget.revision);
  const [currency, setCurrency] = useState(budget.currency);
  const [submitted, setSubmitted] = useState(false);
  const parsed = {
    sales: parseMonthlyValue(draft.sales, "money"), transactions: parseMonthlyValue(draft.transactions, "count"),
    labour: parseMonthlyValue(draft.labour, "money"), cogs: parseMonthlyValue(draft.cogs, "money"),
    waste: parseMonthlyValue(draft.waste, "money"), rent: parseMonthlyValue(draft.rent, "money"),
    utilities: parseMonthlyValue(draft.utilities, "money"), other: parseMonthlyValue(draft.other, "money"),
    guestScore: parseMonthlyValue(draft.guestScore, "score"),
  };
  const sourceError = !sourceNote.trim() || sourceNote.trim().length > 1000 ? "Angiv en kilde eller reference på højst 1.000 tegn." : null;
  const conflict = revision !== budget.revision || currency !== budget.currency;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (saving || conflict || sourceError || Object.values(parsed).some((value) => value.error)) return;
    onSavingChange(true);
    try {
      await saveBudget({ month, locationId, sales: parsed.sales.value, transactions: parsed.transactions.value,
        labour: parsed.labour.value, cogs: parsed.cogs.value, waste: parsed.waste.value, rent: parsed.rent.value,
        utilities: parsed.utilities.value, other: parsed.other.value, guestScore: parsed.guestScore.value,
        sourceNote, expectedRevision: revision, expectedCurrency: currency });
      toast.success("Budgettet er gemt");
      onClose();
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Budgettet kunne ikke gemmes. Prøv igen."));
    } finally {
      onSavingChange(false);
    }
  }

  return (
    <form className="flex flex-col gap-5" noValidate onSubmit={(event) => void save(event)}>
      {conflict ? (
        <Alert>
          <AlertTitle>Budgettet skal indlæses igen</AlertTitle>
          <AlertDescription>
            <p>Budgettet eller lokationens valuta er ændret. Indlæs de nyeste værdier, før du redigerer videre.</p>
            <Button type="button" variant="outline" className="mt-2 min-h-11" onClick={() => {
              setDraft(budgetDraft(budget)); setSourceNote(budget.sourceNote);
              setRevision(budget.revision); setCurrency(budget.currency); setSubmitted(false);
            }}>Indlæs nyeste budget</Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        {budgetFields.map(({ key, label, kind }) => (
          <Field key={key} data-invalid={submitted && Boolean(parsed[key].error)}>
            <FieldLabel htmlFor={`monthly-budget-${key}`}>{label}{kind === "money" ? ` (${budget.currency})` : ""}</FieldLabel>
            <Input id={`monthly-budget-${key}`} className="h-11" inputMode={kind === "count" ? "numeric" : "decimal"}
              value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
              disabled={saving || conflict} aria-invalid={submitted && Boolean(parsed[key].error)}
              aria-describedby={submitted && parsed[key].error ? `monthly-budget-${key}-error` : undefined} />
            {submitted ? <FieldError id={`monthly-budget-${key}-error`}>{parsed[key].error}</FieldError> : null}
          </Field>
        ))}
      </FieldGroup>
      <Field data-invalid={submitted && Boolean(sourceError)}>
        <div className="flex items-center gap-1">
          <FieldLabel htmlFor="monthly-budget-source">Kilde eller reference</FieldLabel>
          <HelpTooltip label="Budgettets kilde" content="Angiv det godkendte budget og eventuelle forudsætninger. Budgetbeløb valgt fra e-conomic hentes direkte og erstatter den pågældende manuelle budgetpost i rapporten." />
        </div>
        <Textarea id="monthly-budget-source" value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} maxLength={1000}
          disabled={saving || conflict} aria-invalid={submitted && Boolean(sourceError)} aria-describedby={submitted && sourceError ? "monthly-budget-source-error" : undefined} />
        {submitted ? <FieldError id="monthly-budget-source-error">{sourceError}</FieldError> : null}
      </Field>
      <FieldDescription>Brug komma som decimaltegn. Et tomt felt betyder, at budgettet mangler. 0 er et budget på nul. Guest Score-målet gælder denne lokation.</FieldDescription>
      <DialogFooter>
        <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={onClose}>Annullér</Button>
        <Button type="submit" className="min-h-11" disabled={saving || conflict}>
          {saving ? <Spinner data-icon="inline-start" /> : null}{saving ? "Gemmer" : "Gem budget"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function MonthlyBudgetDialog({ month, locations, selectedLocationId }: {
  month: string; locations: Locations; selectedLocationId: Id<"locations"> | null;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locationId, setLocationId] = useState<Id<"locations"> | null>(selectedLocationId ?? locations[0]?.id ?? null);
  const selectedLocation = locations.find((location) => location.id === locationId);
  const budget = useQuery(api.monthlyKpi.getBudget, open && selectedLocation ? { month, locationId: selectedLocation.id } : "skip");

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) setOpen(next); }}>
      <DialogTrigger render={<Button variant="outline" className="min-h-11" />}><PencilIcon data-icon="inline-start" />Redigér budget</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>Månedsbudget</DialogTitle>
          <DialogDescription>Budgettet gælder hele {new Date(`${month}-01T12:00:00Z`).toLocaleDateString("da-DK", { month: "long", year: "numeric", timeZone: "UTC" })}.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="monthly-budget-location">Lokation</FieldLabel>
          <Select value={locationId} disabled={saving} onValueChange={(value) => setLocationId(locations.find((location) => location.id === value)?.id ?? null)}>
            <SelectTrigger id="monthly-budget-location" className="min-h-11 w-full"><SelectValue>{selectedLocation?.name ?? "Vælg lokation"}</SelectValue></SelectTrigger>
            <SelectContent><SelectGroup>{locations.map((location) => <SelectItem key={location.id} value={location.id} className="min-h-11">{location.name}</SelectItem>)}</SelectGroup></SelectContent>
          </Select>
        </Field>
        {open && selectedLocation && budget ? (
          <BudgetForm key={`${month}:${selectedLocation.id}`} budget={budget} month={month} locationId={selectedLocation.id} saving={saving} onSavingChange={setSaving} onClose={() => setOpen(false)} />
        ) : <Skeleton className="h-64" />}
      </DialogContent>
    </Dialog>
  );
}
