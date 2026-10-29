"use client";

import { useState } from "react";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { DEFAULT_GOAL_PERCENT } from "@/lib/dashboard/types";

export function GoalSettings({
  id,
  value = DEFAULT_GOAL_PERCENT,
  onChange,
  onValidityChange,
}: {
  id: string;
  value?: number;
  onChange: (goalPercent: number) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  const [draft, setDraft] = useState(String(value).replace(".", ","));
  const parsed = Number(draft.trim().replace(",", "."));
  const invalid = !draft.trim() || !Number.isFinite(parsed) || parsed <= -100;

  return (
    <Field data-invalid={invalid || undefined}>
      <div className="flex items-center gap-1">
        <FieldLabel htmlFor={id}>Mål</FieldLabel>
        <HelpTooltip
          label="målet"
          content="Målet beregnes ud fra widgettens periode og sammenligning, for eksempel 10 % mere end samme periode sidste år eller den foregående måned. Brug et negativt tal for et mål under sammenligningsperioden."
        />
      </div>
      <InputGroup>
        <InputGroupInput
          id={id}
          type="text"
          inputMode="decimal"
          value={draft}
          aria-invalid={invalid}
          onChange={(event) => {
            setDraft(event.target.value);
            const next = Number(event.target.value.trim().replace(",", "."));
            onValidityChange?.(Boolean(event.target.value.trim()) && Number.isFinite(next) && next > -100);
          }}
          onBlur={() => {
            if (!invalid && parsed !== value) onChange(parsed);
          }}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>%</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      {invalid ? <FieldError>Angiv en procent større end -100.</FieldError> : null}
    </Field>
  );
}
