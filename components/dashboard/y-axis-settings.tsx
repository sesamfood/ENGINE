"use client";

import { useState } from "react";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
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
    <FieldGroup className="grid gap-4 sm:grid-cols-2">
      <Field data-invalid={invalidBounds || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-min`}>Minimum på Y-akse</FieldLabel>
        <YAxisInput
          key={`${idPrefix}-min-${draftVersion}`}
          id={`${idPrefix}-min`}
          type="text"
          inputMode="decimal"
          step="any"
          value={min}
          placeholder="Automatisk"
          aria-invalid={invalidBounds}
          onCommit={(nextMin) => commit({ min: nextMin, max })}
        />
      </Field>
      <Field data-invalid={invalidBounds || undefined}>
        <FieldLabel htmlFor={`${idPrefix}-max`}>Maksimum på Y-akse</FieldLabel>
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
      <FieldDescription className="sm:col-span-2">
        Lad felterne stå tomme for automatisk skala.
      </FieldDescription>
      {invalidBounds ? (
        <FieldError className="sm:col-span-2">Minimum skal være mindre end maksimum.</FieldError>
      ) : null}
    </FieldGroup>
  );
}
