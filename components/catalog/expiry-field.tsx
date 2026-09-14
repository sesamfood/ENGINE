"use client";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { expiryUnits, type Expiry } from "@/lib/expiry";

export function ExpiryField({
  id,
  value,
  unit,
  onValueChange,
  onUnitChange,
  error,
  disabled,
}: {
  id: string;
  value: string;
  unit: Expiry["unit"];
  onValueChange: (value: string) => void;
  onUnitChange: (unit: Expiry["unit"]) => void;
  error?: string | null;
  disabled?: boolean;
}) {
  return (
    <Field data-invalid={Boolean(error)} data-disabled={disabled}>
      <div className="flex items-center gap-2">
        <FieldLabel htmlFor={id}>Holdbarhed</FieldLabel>
        <HelpTooltip
          label="holdbarhed"
          content="Beregnes fra produktionsdato og klokkeslæt. Dage og måneder følger kalenderen i dansk tid. Lad feltet stå tomt for at spørge ved print."
        />
      </div>
      <div className="flex gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          disabled={disabled}
          className="h-11 min-w-0 flex-1"
          placeholder="Ikke angivet"
        />
        <Select
          items={expiryUnits}
          value={unit}
          onValueChange={(next) => {
            if (next) onUnitChange(next);
          }}
          disabled={disabled}
        >
          <SelectTrigger
            aria-label="Enhed for holdbarhed"
            className="h-11! w-32"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {expiryUnits.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </Field>
  );
}
