"use client";

import { QuantityInput } from "@/components/quantity-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  formatMeasure,
  gramsPerUnit,
  measureUnits,
  parseDecimal,
} from "@/lib/containers";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";

const round = (value: number) => Math.round(value * 1e6) / 1e6;
const formatQuantity = (value: number) =>
  value.toLocaleString("da-DK", { maximumFractionDigits: 3 });

type Container = { id: Id<"containers">; name: string; weightGrams: number };
type Unit = { name: string; factorToDefault: number; container?: Container };
type MeasureUnit = { name: string; size: number };
// A weighed, not full container added to the total while the form is open.
type PartialEntry = { key: number; grossGrams: number; quantity: number };

// Count input. Container units can add not full containers by weight.
export function CountQuantityInput({
  label,
  units,
  unit,
  value,
  disabled,
  onQuantityChange,
}: {
  label: string;
  units: Unit[];
  unit: Unit;
  value: number;
  disabled?: boolean;
  onQuantityChange: (quantity: number) => void;
}) {
  const settings = useQuery(api.catalog.getSettings);
  const [partials, setPartials] = useState<PartialEntry[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const grams = unit.container ? gramsPerUnit(units, unit) : null;

  const input = (
    <QuantityInput
      label={label}
      value={value}
      disabled={disabled}
      onValueChange={(text) => {
        const quantity = Number(text.replace(",", "."));
        if (Number.isFinite(quantity)) onQuantityChange(Math.max(0, quantity));
      }}
    />
  );
  if (!unit.container || !grams || !settings) return input;
  const container = unit.container;
  const weightUnits = measureUnits("dry", settings.unitSystem);

  return (
    <div className="flex flex-col gap-2">
      {input}
      {partials.map((entry) => (
        <div
          key={entry.key}
          className="flex items-center gap-2 rounded-lg border ps-3 text-sm"
        >
          <span className="min-w-0 flex-1">
            Ikke fuld: {formatMeasure(entry.grossGrams, weightUnits)} ={" "}
            {formatQuantity(entry.quantity)} {unit.name}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="size-11"
            disabled={disabled}
            aria-label={`Fjern ikke fuld ${container.name} på ${formatMeasure(entry.grossGrams, weightUnits)}`}
            onClick={() => {
              setPartials((current) =>
                current.filter((item) => item.key !== entry.key),
              );
              onQuantityChange(Math.max(0, round(value - entry.quantity)));
            }}
          >
            <XIcon />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full"
        disabled={disabled}
        onClick={() => setDialogOpen(true)}
      >
        <PlusIcon data-icon="inline-start" />
        <span className="truncate">Tilføj ikke fuld {container.name}</span>
      </Button>
      {dialogOpen ? (
        <PartialContainerDialog
          container={container}
          unitName={unit.name}
          gramsPerUnit={grams}
          weightUnits={weightUnits}
          onClose={() => setDialogOpen(false)}
          onAdd={(grossGrams, quantity) => {
            setPartials((current) => [
              ...current,
              { key: Date.now(), grossGrams, quantity },
            ]);
            onQuantityChange(round(value + quantity));
            setDialogOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function PartialContainerDialog({
  container,
  unitName,
  gramsPerUnit,
  weightUnits,
  onClose,
  onAdd,
}: {
  container: Container;
  unitName: string;
  gramsPerUnit: number;
  weightUnits: MeasureUnit[];
  onClose: () => void;
  onAdd: (grossGrams: number, quantity: number) => void;
}) {
  const [weight, setWeight] = useState("");
  // Default to the largest unit, e.g. kg.
  const [weightUnit, setWeightUnit] = useState(weightUnits.at(-1)!);
  const [error, setError] = useState<string | null>(null);
  const grossGrams = parseDecimal(weight) * weightUnit.size;
  const contentGrams = grossGrams - container.weightGrams;
  const quantity = round(contentGrams / gramsPerUnit);
  const valid = Number.isFinite(grossGrams) && contentGrams > 0;
  const emptyWeight = formatMeasure(container.weightGrams, weightUnits);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    // The dialog sits inside the Count form in the React tree.
    event.stopPropagation();
    if (!valid) {
      setError(
        Number.isFinite(grossGrams)
          ? `Vægten skal være mere end beholderens egen vægt på ${emptyWeight}`
          : "Angiv vægten med indhold",
      );
      return;
    }
    onAdd(grossGrams, quantity);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Ikke fuld {container.name}</DialogTitle>
            <DialogDescription>
              Vej beholderen med indhold. Beholderens egen vægt på {emptyWeight}{" "}
              trækkes fra.
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="partial-container-weight">
              Vægt med indhold
            </FieldLabel>
            <div className="flex gap-2">
              <Input
                id="partial-container-weight"
                type="text"
                inputMode="decimal"
                value={weight}
                onChange={(event) => {
                  setWeight(event.target.value);
                  setError(null);
                }}
                className="h-11 flex-1"
                aria-invalid={Boolean(error)}
                autoFocus
              />
              <ToggleGroup
                variant="outline"
                spacing={0}
                aria-label="Vægtenhed"
                value={[weightUnit.name]}
                onValueChange={(values) => {
                  const next = weightUnits.find((item) => item.name === values[0]);
                  if (next) setWeightUnit(next);
                }}
              >
                {weightUnits.map((item) => (
                  <ToggleGroupItem
                    key={item.name}
                    value={item.name}
                    className="min-h-11 min-w-12"
                  >
                    {item.name}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            {valid ? (
              <FieldDescription>
                Indhold: {formatMeasure(contentGrams, weightUnits)} ={" "}
                {formatQuantity(quantity)} {unitName}
              </FieldDescription>
            ) : null}
            <FieldError>{error}</FieldError>
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={onClose}
            >
              Annullér
            </Button>
            <Button type="submit" className="min-h-11">
              OK
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
