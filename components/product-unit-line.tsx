"use client";

import { QuantityInput } from "@/components/quantity-input";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Trash2Icon } from "lucide-react";

export type ProductLineUnit = { id: Id<"units">; name: string };

export function ProductUnitLine({
  lineKey,
  productName,
  units,
  unitId,
  unavailableUnitIds,
  quantity,
  onUnitChange,
  onQuantityChange,
  onRemove,
  error,
  min = 1,
  max,
  integer,
  className,
}: {
  lineKey: string;
  productName: string;
  units: readonly ProductLineUnit[];
  unitId: Id<"units">;
  unavailableUnitIds: ReadonlySet<Id<"units">>;
  quantity: string | number;
  onUnitChange: (unitId: Id<"units">) => void;
  onQuantityChange: (quantity: string) => void;
  onRemove: () => void;
  error?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-[minmax(8rem,1fr)_auto_auto] sm:items-start",
        className,
      )}
    >
      <Field>
        <FieldLabel htmlFor={`${lineKey}-unit`} className="sr-only">
          Enhed for {productName}
        </FieldLabel>
        <Select
          items={units.map((unit) => ({ value: unit.id, label: unit.name }))}
          value={unitId}
          onValueChange={(value) => {
            const unit = units.find((item) => item.id === value);
            if (unit) onUnitChange(unit.id);
          }}
        >
          <SelectTrigger id={`${lineKey}-unit`} className="h-11! w-full">
            <SelectValue placeholder="Vælg enhed" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {units.map((unit) => (
                <SelectItem
                  key={unit.id}
                  value={unit.id}
                  disabled={
                    unit.id !== unitId && unavailableUnitIds.has(unit.id)
                  }
                >
                  {unit.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <Field data-invalid={Boolean(error)}>
        <QuantityInput
          id={`${lineKey}-quantity`}
          label={`Mængde for ${productName}`}
          value={quantity}
          onValueChange={onQuantityChange}
          min={min}
          max={max}
          integer={integer}
          invalid={Boolean(error)}
          className="w-full sm:w-40"
        />
        <FieldError>{error}</FieldError>
      </Field>
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        className="size-11"
        aria-label={`Fjern ${productName} i den valgte enhed`}
        onClick={onRemove}
      >
        <Trash2Icon data-icon="inline-start" />
      </Button>
    </div>
  );
}
