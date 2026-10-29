"use client";

import { useState } from "react";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import type { VisualizationId } from "@/lib/dashboard/types";

export type YAxisValues = { min?: number; max?: number };

export function visualizationHasYAxis(visualization: VisualizationId) {
  return visualization === "line" || visualization === "area" || visualization === "bar";
}

function numberOrUndefined(value: string) {
  if (!value.trim()) return undefined;
  const number = Number(value.replace(",", "."));
  return Number.isFinite(number) ? number : undefined;
}

function YAxisInput({
  value,
  onCommit,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "onBlur"> & {
  value?: number;
  onCommit: (value: number | undefined) => void;
}) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  return (
    <Input
      {...props}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onCommit(numberOrUndefined(draft))}
    />
  );
}

export function YAxisSettings({
  idPrefix,
  min,
  max,
  onChange,
  onValidityChange,
}: {
  idPrefix: string;
  min?: number;
  max?: number;
  onChange: (axis: YAxisValues) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  const [draftInvalid, setDraftInvalid] = useState(false);
  const [draftVersion, setDraftVersion] = useState(0);
  const invalidBounds = draftInvalid || (min !== undefined && max !== undefined && min >= max);

  function commit(next: YAxisValues) {
    const invalid = next.min !== undefined && next.max !== undefined && next.min >= next.max;
    setDraftInvalid(invalid);
    onValidityChange?.(!invalid);
    if (!invalid) {
      setDraftVersion((version) => version + 1);
      onChange(next);
    }
  }

  return (
    <FieldGroup appearance="standard" className="grid sm:grid-cols-2">
      <Field data-invalid={invalidBounds || undefined}>
        <div className="flex items-center gap-1">
          <FieldLabel htmlFor={`${idPrefix}-min`}>Minimum på Y-akse</FieldLabel>
          <HelpTooltip label="Minimum på Y-akse" content="Minimum starter ved 0." />
        </div>
        <YAxisInput
          key={`${idPrefix}-min-${draftVersion}`}
          id={`${idPrefix}-min`}
          type="text"
          inputMode="decimal"
          step="any"
          value={min ?? 0}
          aria-invalid={invalidBounds}
          onCommit={(nextMin) => commit({ min: nextMin, max })}
        />
      </Field>
      <Field data-invalid={invalidBounds || undefined}>
        <div className="flex items-center gap-1">
          <FieldLabel htmlFor={`${idPrefix}-max`}>Maksimum på Y-akse</FieldLabel>
          <HelpTooltip label="Maksimum på Y-akse" content="Lad feltet stå tomt for automatisk skala." />
        </div>
        <YAxisInput
          key={`${idPrefix}-max-${draftVersion}`}
          id={`${idPrefix}-max`}
          type="text"
          inputMode="decimal"
          step="any"
          value={max}
          placeholder="Automatisk"
          aria-invalid={invalidBounds}
          onCommit={(nextMax) => commit({ min, max: nextMax })}
        />
      </Field>
      {invalidBounds ? (
        <FieldError className="sm:col-span-2">Minimum skal være mindre end maksimum.</FieldError>
      ) : null}
    </FieldGroup>
  );
}
