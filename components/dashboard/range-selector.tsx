"use client";

import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DashboardRange, RangePreset } from "@/lib/dashboard/types";

const presets: Array<{ value: RangePreset; label: string }> = [
  { value: "today", label: "I dag" },
  { value: "yesterday", label: "I går" },
  { value: "7days", label: "7 dage" },
  { value: "30days", label: "30 dage" },
  { value: "thisMonth", label: "Denne måned" },
  { value: "custom", label: "Brugerdefineret" },
];

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function RangeSelector({
  range,
  onChange,
}: {
  range: DashboardRange;
  onChange: (range: DashboardRange) => void;
}) {
  function select(values: string[]) {
    const preset = values[0] as RangePreset | undefined;
    if (!preset) return;
    onChange(preset === "custom" ? { preset, from: range.from ?? today(), to: range.to ?? today() } : { preset });
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto pb-1">
        <ToggleGroup value={[range.preset]} onValueChange={select} variant="outline" spacing={0} className="min-w-max">
          {presets.map((preset) => <ToggleGroupItem key={preset.value} value={preset.value}>{preset.label}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>
      {range.preset === "custom" ? (
        <FieldGroup className="grid max-w-lg grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="dashboard-from">Fra</FieldLabel>
            <Input id="dashboard-from" type="date" value={range.from ?? ""} onChange={(event) => onChange({ ...range, from: event.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="dashboard-to">Til</FieldLabel>
            <Input id="dashboard-to" type="date" value={range.to ?? ""} onChange={(event) => onChange({ ...range, to: event.target.value })} />
          </Field>
        </FieldGroup>
      ) : null}
    </div>
  );
}
