"use client";

import { useEffect, useRef, useState } from "react";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { comparisonPeriodLabels, comparisonPeriods, type ComparisonPeriod, type DashboardRange, type RangePreset } from "@/lib/dashboard/types";
import { dateKey, DEFAULT_TIME_ZONE } from "@/lib/date";

const presets: Array<{ value: RangePreset; label: string }> = [
  { value: "today", label: "I dag" },
  { value: "yesterday", label: "I går" },
  { value: "7days", label: "7 dage" },
  { value: "30days", label: "30 dage" },
  { value: "thisMonth", label: "Denne måned" },
  { value: "custom", label: "Brugerdefineret" },
];

export function RangeSelector({
  range,
  onChange,
  timeZone,
}: {
  range: DashboardRange;
  onChange: (range: DashboardRange) => void;
  timeZone?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const update = () =>
      setCanScrollRight(
        node.scrollWidth - node.clientWidth - node.scrollLeft > 4,
      );
    update();
    node.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  function select(values: string[]) {
    const preset = values[0] as RangePreset | undefined;
    if (!preset) return;
    const defaultDate = dateKey(Date.now(), timeZone ?? DEFAULT_TIME_ZONE);
    onChange(preset === "custom" ? { preset, from: range.from ?? defaultDate, to: range.to ?? defaultDate } : { preset });
  }
  return (
    <div className="flex flex-col gap-3">
      <Select
        items={presets}
        value={range.preset}
        onValueChange={(value) => {
          if (value) select([value]);
        }}
      >
        <SelectTrigger className="h-11 w-full min-w-32 sm:min-w-44 lg:hidden" aria-label="Periode">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {presets.map((preset) => (
              <SelectItem key={preset.value} value={preset.value}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <div ref={scrollRef} data-scroll-right={canScrollRight ? "true" : undefined} className="no-scrollbar hidden overflow-x-auto lg:block">
        <ToggleGroup value={[range.preset]} onValueChange={select} variant="outline" size="lg" spacing={0} className="min-w-max">
          {presets.map((preset) => <ToggleGroupItem key={preset.value} value={preset.value} className="min-h-11">{preset.label}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>
      {range.preset === "custom" ? (
        <FieldGroup appearance="compact" className="grid max-w-lg grid-cols-2">
          <Field>
            <FieldLabel htmlFor="dashboard-from">Fra</FieldLabel>
            <Input id="dashboard-from" type="date" value={range.from ?? ""} onChange={(event) => onChange({ ...range, from: event.target.value })} className="h-11" />
          </Field>
          <Field>
            <FieldLabel htmlFor="dashboard-to">Til</FieldLabel>
            <Input id="dashboard-to" type="date" value={range.to ?? ""} onChange={(event) => onChange({ ...range, to: event.target.value })} className="h-11" />
          </Field>
        </FieldGroup>
      ) : null}
    </div>
  );
}

export function ComparisonSelector({
  comparison,
  onChange,
}: {
  comparison: ComparisonPeriod;
  onChange: (comparison: ComparisonPeriod) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span id="dashboard-comparison-label" className="text-sm text-muted-foreground">Sammenlign med</span>
      <ToggleGroup
        aria-labelledby="dashboard-comparison-label"
        value={[comparison]}
        onValueChange={(values) => {
          const next = comparisonPeriods.find((period) => period === values[0]);
          if (next) onChange(next);
        }}
        variant="outline"
        size="lg"
        spacing={0}
      >
        {comparisonPeriods.map((period) => <ToggleGroupItem key={period} value={period} className="min-h-11">{comparisonPeriodLabels[period]}</ToggleGroupItem>)}
      </ToggleGroup>
    </div>
  );
}
