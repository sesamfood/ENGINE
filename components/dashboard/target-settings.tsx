"use client";

import { useState } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { metricRegistry } from "@/lib/dashboard/registry";
import { supportsBudgetTarget, targetPeriodLabels, targetUsesPeriod } from "@/lib/dashboard/target";
import {
  DEFAULT_GOAL_PERCENT,
  targetPeriods,
  type TargetPeriod,
  type WidgetInstance,
  type WidgetTarget,
} from "@/lib/dashboard/types";

type TargetKind = WidgetTarget["kind"] | "none";

/** Accepts Danish input such as "40.000" or "12,5". */
function parseNumber(value: string) {
  const compact = value.trim().replace(/\s/g, "");
  if (!compact) return NaN;
  if (compact.includes(",")) return Number(compact.replace(/\./g, "").replace(",", "."));
  return Number(/^-?\d{1,3}(\.\d{3})+$/.test(compact) ? compact.replace(/\./g, "") : compact);
}

const formatDraft = (value: number) => String(value).replace(".", ",");

export function TargetSettings({
  id,
  metric,
  value,
  required = false,
  onChange,
  onValidityChange,
}: {
  id: string;
  metric: WidgetInstance["metric"];
  value: WidgetTarget | undefined;
  /** Goal widgets always need a target. */
  required?: boolean;
  onChange: (target: WidgetTarget | undefined) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  const [kind, setKind] = useState<TargetKind>(value?.kind ?? "none");
  const [percentDraft, setPercentDraft] = useState(formatDraft(value?.kind === "comparison" ? value.percent : DEFAULT_GOAL_PERCENT));
  const [amountDraft, setAmountDraft] = useState(value?.kind === "manual" ? formatDraft(value.amount) : "");
  const [period, setPeriod] = useState<TargetPeriod>(value?.kind === "manual" ? value.period : "week");
  const usesPeriod = targetUsesPeriod(metric);
  const unit = metric.kind === "builtin" ? metricRegistry[metric.id].unit : undefined;
  const kindOptions = [
    ...(required ? [] : [{ value: "none", label: "Intet mål" }]),
    { value: "comparison", label: "Procent af sidste år" },
    { value: "manual", label: "Fast mål" },
    ...(supportsBudgetTarget({ metric }) ? [{ value: "budget", label: "Budget" }] : []),
  ];
  const periodOptions = targetPeriods.map((item) => ({ value: item, label: targetPeriodLabels[item] }));

  function build(next: { kind: TargetKind; percentDraft: string; amountDraft: string; period: TargetPeriod }): WidgetTarget | undefined | null {
    if (next.kind === "none") return undefined;
    if (next.kind === "budget") return { kind: "budget" };
    if (next.kind === "comparison") {
      const percent = parseNumber(next.percentDraft);
      return Number.isFinite(percent) && percent > -100 ? { kind: "comparison", percent } : null;
    }
    const amount = parseNumber(next.amountDraft);
    return Number.isFinite(amount) && amount >= 0 ? { kind: "manual", amount, period: usesPeriod ? next.period : "day" } : null;
  }

  const state = { kind, percentDraft, amountDraft, period };
  const invalid = build(state) === null;

  function update(patch: Partial<typeof state>, commit: boolean) {
    const next = { ...state, ...patch };
    if (patch.kind !== undefined) setKind(patch.kind);
    if (patch.percentDraft !== undefined) setPercentDraft(patch.percentDraft);
    if (patch.amountDraft !== undefined) setAmountDraft(patch.amountDraft);
    if (patch.period !== undefined) setPeriod(patch.period);
    const target = build(next);
    onValidityChange?.(target !== null);
    if (commit && target !== null && JSON.stringify(target) !== JSON.stringify(value)) onChange(target);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field>
        <div className="flex items-center gap-1">
          <FieldLabel htmlFor={`${id}-kind`}>Mål</FieldLabel>
          <HelpTooltip
            label="målet"
            content="Procent af sidste år sammenligner med de samme ugedage sidste år. Fast mål er et beløb eller antal pr. dag, uge eller måned, som omregnes til widgettens periode. Budget bruger månedsbudgettet fordelt på dagene i perioden. For målinger, hvor lavere er bedre, er målet et loft."
          />
        </div>
        <Select items={kindOptions} value={kind} onValueChange={(next) => update({ kind: next as TargetKind }, true)}>
          <SelectTrigger id={`${id}-kind`} className="h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {kindOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      {kind === "comparison" ? (
        <Field data-invalid={invalid || undefined}>
          <FieldLabel htmlFor={`${id}-percent`}>Ændring</FieldLabel>
          <InputGroup className="h-11">
            <InputGroupInput
              id={`${id}-percent`}
              type="text"
              inputMode="decimal"
              value={percentDraft}
              aria-invalid={invalid}
              onChange={(event) => update({ percentDraft: event.target.value }, false)}
              onBlur={() => update({}, true)}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>%</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          {invalid ? <FieldError>Angiv en procent større end -100.</FieldError> : null}
        </Field>
      ) : null}
      {kind === "manual" ? (
        <Field data-invalid={invalid || undefined}>
          <FieldLabel htmlFor={`${id}-amount`}>{usesPeriod ? "Mål pr. periode" : "Målværdi"}</FieldLabel>
          <div className="flex gap-2">
            <InputGroup className="h-11 min-w-0 flex-1">
              <InputGroupInput
                id={`${id}-amount`}
                type="text"
                inputMode="decimal"
                value={amountDraft}
                aria-invalid={invalid}
                onChange={(event) => update({ amountDraft: event.target.value }, false)}
                onBlur={() => update({}, true)}
              />
              {unit === "percent" || unit === "hours" ? (
                <InputGroupAddon align="inline-end">
                  <InputGroupText>{unit === "percent" ? "%" : "t"}</InputGroupText>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
            {usesPeriod ? (
              <Select items={periodOptions} value={period} onValueChange={(next) => update({ period: next as TargetPeriod }, true)}>
                <SelectTrigger className="h-11 w-28" aria-label="Periode for målet">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {periodOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : null}
          </div>
          {invalid ? <FieldError>Angiv et mål på 0 eller mere.</FieldError> : null}
        </Field>
      ) : null}
      {kind === "budget" ? (
        <FieldDescription className="self-end">Kræver adgang til månedsrapporten og et budget for alle valgte lokationer.</FieldDescription>
      ) : null}
    </div>
  );
}
