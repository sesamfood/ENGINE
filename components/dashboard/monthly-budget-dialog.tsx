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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

type Budget = FunctionReturnType<typeof api.monthlyKpi.getBudget>;
type Locations = FunctionReturnType<typeof api.monthlyKpi.getContext>["locations"];

function moneyDraft(value: number | null) {
  if (value === null) return "";
  return `${Math.floor(value / 100).toLocaleString("da-DK")},${String(value % 100).padStart(2, "0")}`;
}

function parseBudgetValue(value: string, money: boolean) {
  const trimmed = value.trim();
  if (!trimmed) return { value: null, error: null };
  const valid = money
    ? /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(trimmed)
    : /^\d+$/.test(trimmed);
  if (!valid) return { value: null, error: money ? "Angiv et positivt beløb eller 0. Brug komma som decimaltegn." : "Angiv et helt antal på 0 eller derover." };
  const [whole, fraction = ""] = trimmed.replaceAll(".", "").split(",");
  const parsed = money ? Number(whole) * 100 + Number(fraction.padEnd(2, "0")) : Number(whole);
  if (!Number.isSafeInteger(parsed)) return { value: null, error: "Tallet er for stort." };
  return { value: parsed, error: null };
}

function BudgetForm({ budget, month, locationId, saving, onSavingChange, onClose }: {
  budget: Budget;
  month: string;
  locationId: Id<"locations">;
  saving: boolean;
  onSavingChange: (value: boolean) => void;
  onClose: () => void;
}) {
  const saveBudget = useMutation(api.monthlyKpi.saveBudget);
  const [sales, setSales] = useState(() => moneyDraft(budget.sales));
  const [transactions, setTransactions] = useState(() => budget.transactions?.toString() ?? "");
  const [labour, setLabour] = useState(() => moneyDraft(budget.labour));
  const [revision, setRevision] = useState(budget.revision);
  const [currency, setCurrency] = useState(budget.currency);
  const [submitted, setSubmitted] = useState(false);
  const parsedSales = parseBudgetValue(sales, true);
  const parsedTransactions = parseBudgetValue(transactions, false);
  const parsedLabour = parseBudgetValue(labour, true);
  const conflict = revision !== budget.revision || currency !== budget.currency;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (saving || conflict || parsedSales.error || parsedTransactions.error || parsedLabour.error) return;
    onSavingChange(true);
    try {
      await saveBudget({ month, locationId, sales: parsedSales.value, transactions: parsedTransactions.value, labour: parsedLabour.value, expectedRevision: revision, expectedCurrency: currency });
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
              setSales(moneyDraft(budget.sales));
              setTransactions(budget.transactions?.toString() ?? "");
              setLabour(moneyDraft(budget.labour));
              setRevision(budget.revision);
              setCurrency(budget.currency);
              setSubmitted(false);
            }}>Indlæs nyeste budget</Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field data-invalid={submitted && Boolean(parsedSales.error)}>
          <FieldLabel htmlFor="monthly-budget-sales">Omsætning ekskl. moms ({budget.currency})</FieldLabel>
          <Input id="monthly-budget-sales" className="h-11" inputMode="decimal" value={sales} onChange={(event) => setSales(event.target.value)} disabled={saving || conflict} aria-invalid={submitted && Boolean(parsedSales.error)} aria-describedby={submitted && parsedSales.error ? "monthly-budget-sales-error" : undefined} />
          {submitted ? <FieldError id="monthly-budget-sales-error">{parsedSales.error}</FieldError> : null}
        </Field>
        <Field data-invalid={submitted && Boolean(parsedTransactions.error)}>
          <FieldLabel htmlFor="monthly-budget-transactions">Transaktioner</FieldLabel>
          <Input id="monthly-budget-transactions" className="h-11" inputMode="numeric" value={transactions} onChange={(event) => setTransactions(event.target.value)} disabled={saving || conflict} aria-invalid={submitted && Boolean(parsedTransactions.error)} aria-describedby={submitted && parsedTransactions.error ? "monthly-budget-transactions-error" : undefined} />
          {submitted ? <FieldError id="monthly-budget-transactions-error">{parsedTransactions.error}</FieldError> : null}
        </Field>
        <Field data-invalid={submitted && Boolean(parsedLabour.error)}>
          <FieldLabel htmlFor="monthly-budget-labour">Løn ({budget.currency})</FieldLabel>
          <Input id="monthly-budget-labour" className="h-11" inputMode="decimal" value={labour} onChange={(event) => setLabour(event.target.value)} disabled={saving || conflict} aria-invalid={submitted && Boolean(parsedLabour.error)} aria-describedby={submitted && parsedLabour.error ? "monthly-budget-labour-error" : undefined} />
          {submitted ? <FieldError id="monthly-budget-labour-error">{parsedLabour.error}</FieldError> : null}
        </Field>
      </FieldGroup>
      <FieldDescription>Brug komma som decimaltegn. Et tomt felt betyder, at budgettet mangler. 0 er et budget på nul.</FieldDescription>
      <DialogFooter>
        <Button type="button" variant="outline" className="min-h-11" disabled={saving} onClick={onClose}>Annullér</Button>
        <Button type="submit" className="min-h-11" disabled={saving || conflict}>
          {saving ? <Spinner data-icon="inline-start" /> : null}
          {saving ? "Gemmer" : "Gem budget"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function MonthlyBudgetDialog({ month, locations, selectedLocationId }: {
  month: string;
  locations: Locations;
  selectedLocationId: Id<"locations"> | null;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locationId, setLocationId] = useState<Id<"locations"> | null>(selectedLocationId ?? locations[0]?.id ?? null);
  const selectedLocation = locations.find((location) => location.id === locationId);
  const budget = useQuery(api.monthlyKpi.getBudget, open && selectedLocation ? { month, locationId: selectedLocation.id } : "skip");

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) setOpen(next); }}>
      <DialogTrigger render={<Button variant="outline" className="min-h-11" />}>
        <PencilIcon data-icon="inline-start" />Redigér budget
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" showCloseButton={!saving}>
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
