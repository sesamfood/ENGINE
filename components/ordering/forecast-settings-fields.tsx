"use client";

import { Field, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { validForecastSettings } from "@/lib/ordering-forecast";

export type ForecastSettingsDraft = {
  coverageDays: string;
  bufferPercent: string;
};

export function forecastSettingsDraft(settings: {
  coverageDays: number;
  bufferPercent: number;
}): ForecastSettingsDraft {
  return {
    coverageDays: String(settings.coverageDays),
    bufferPercent: String(settings.bufferPercent),
  };
}

export function parseForecastSettings(draft: ForecastSettingsDraft) {
  if (!draft.coverageDays.trim() || !draft.bufferPercent.trim()) return null;
  const settings = {
    coverageDays: Number(draft.coverageDays),
    bufferPercent: Number(draft.bufferPercent),
  };
  return validForecastSettings(settings.coverageDays, settings.bufferPercent)
    ? settings
    : null;
}

export function ForecastSettingsFields({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: ForecastSettingsDraft;
  onChange: (value: ForecastSettingsDraft) => void;
  disabled?: boolean;
}) {
  const coverageDays = Number(value.coverageDays);
  const bufferPercent = Number(value.bufferPercent);
  const validCoverage =
    value.coverageDays.trim() !== "" && validForecastSettings(coverageDays, 0);
  const validBuffer =
    value.bufferPercent.trim() !== "" &&
    validForecastSettings(1, bufferPercent);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field data-invalid={!validCoverage} data-disabled={disabled}>
        <div className="flex items-center gap-1">
          <FieldLabel htmlFor={`${id}-days`}>Dækning i dage</FieldLabel>
          <HelpTooltip
            label="dækning"
            content="Antal dage fra bestillingsdagen, som bestillingen skal dække. Medregn leveringstiden. Vælg 1 til 28 dage."
          />
        </div>
        <Input
          id={`${id}-days`}
          type="number"
          min={1}
          max={28}
          step={1}
          className="h-11"
          value={value.coverageDays}
          disabled={disabled}
          aria-invalid={!validCoverage}
          onChange={(event) =>
            onChange({ ...value, coverageDays: event.target.value })
          }
        />
      </Field>
      <Field data-invalid={!validBuffer} data-disabled={disabled}>
        <div className="flex items-center gap-1">
          <FieldLabel htmlFor={`${id}-buffer`}>Buffer i %</FieldLabel>
          <HelpTooltip
            label="buffer"
            content="Ekstra mængde oven i det forventede forbrug, før lageret trækkes fra. Vælg 0 til 100 %."
          />
        </div>
        <Input
          id={`${id}-buffer`}
          type="number"
          min={0}
          max={100}
          className="h-11"
          value={value.bufferPercent}
          disabled={disabled}
          aria-invalid={!validBuffer}
          onChange={(event) =>
            onChange({ ...value, bufferPercent: event.target.value })
          }
        />
      </Field>
    </div>
  );
}
