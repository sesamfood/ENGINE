"use client";

import { QuantityInput } from "@/components/quantity-input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { useId, useState } from "react";

const round = (value: number) => Math.round(value * 1e6) / 1e6;

// Count input that can subtract the unit's packaging weight from a gross weighing.
export function CountQuantityInput({
  label,
  unit,
  value,
  disabled,
  onQuantityChange,
}: {
  label: string;
  unit: { name: string; packagingWeight?: number };
  value: number;
  disabled?: boolean;
  onQuantityChange: (quantity: number) => void;
}) {
  const switchId = useId();
  const [withPackaging, setWithPackaging] = useState(true);
  const packagingWeight =
    withPackaging && unit.packagingWeight ? unit.packagingWeight : 0;

  const input = (
    <QuantityInput
      label={label}
      value={value > 0 ? round(value + packagingWeight) : value}
      disabled={disabled}
      onValueChange={(text) => {
        const quantity = Number(text.replace(",", "."));
        if (Number.isFinite(quantity))
          onQuantityChange(Math.max(0, round(quantity - packagingWeight)));
      }}
    />
  );
  if (!unit.packagingWeight) return input;

  return (
    <div className="flex flex-col gap-2">
      {input}
      <Field orientation="horizontal" className="min-h-11">
        <Switch
          id={switchId}
          checked={withPackaging}
          disabled={disabled}
          onCheckedChange={setWithPackaging}
        />
        <FieldLabel htmlFor={switchId}>
          Med emballage (−
          {unit.packagingWeight.toLocaleString("da-DK")} {unit.name})
        </FieldLabel>
      </Field>
    </div>
  );
}
