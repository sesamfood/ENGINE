"use client";

import { Trash2Icon } from "lucide-react";
import { useId, useState } from "react";
import { CreatableCombobox } from "@/components/catalog/creatable-combobox";
import { ProductLineGroup } from "@/components/product-line-group";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useCompleteCatalog } from "@/hooks/use-complete-catalog";
import { dateKey, dateTimeFormatter, zonedTimestamp } from "@/lib/date";
import type { OwnCheckControlType } from "@/lib/own-checks";
import { productSearchScore } from "@/lib/product-search";

type ProductTemperature = NonNullable<
  Doc<"ownCheckEntries">["productTemperatures"]
>[number];

export type OwnCheckExecutionDraft = {
  startedAtLocal: string;
  endedAtLocal: string;
  initialStartedAt: number | null;
  initialEndedAt: number | null;
  productTemperatures: Array<{
    productId: Id<"products">;
    productName: string;
    temperature: string;
  }>;
};

function localDateTime(timestamp: number, timeZone: string) {
  const time = dateTimeFormatter("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(timestamp);
  return `${dateKey(timestamp, timeZone)}T${time}`;
}

function executionTimestamp(
  value: string,
  timeZone: string,
  initialTimestamp: number | null,
) {
  if (
    initialTimestamp !== null &&
    localDateTime(initialTimestamp, timeZone) === value
  ) return initialTimestamp;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return NaN;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (hour > 23 || minute > 59) return NaN;
  try {
    const timestamp = zonedTimestamp(match[1], hour * 60 + minute, timeZone);
    return localDateTime(timestamp, timeZone) === value ? timestamp : NaN;
  } catch {
    return NaN;
  }
}

export function initialOwnCheckExecution(
  entry:
    | {
        startedAt: number | null;
        endedAt: number | null;
        productTemperatures: ProductTemperature[];
      }
    | null
    | undefined,
  timeZone: string,
): OwnCheckExecutionDraft {
  const now = Date.now();
  const startedAt = entry?.startedAt ?? now;
  const endedAt = entry?.endedAt ?? now;
  return {
    startedAtLocal: localDateTime(startedAt, timeZone),
    endedAtLocal: localDateTime(endedAt, timeZone),
    initialStartedAt: startedAt,
    initialEndedAt: endedAt,
    productTemperatures: (entry?.productTemperatures ?? []).map((product) => ({
      productId: product.productId,
      productName: product.productName,
      temperature: String(product.temperatureCelsius).replace(".", ","),
    })),
  };
}

export function validateOwnCheckExecution(
  draft: OwnCheckExecutionDraft,
  timeZone: string,
):
  | { valid: false; errors: Record<string, string> }
  | {
      valid: true;
      startedAt: number;
      endedAt: number;
      productTemperatures: Array<{
        productId: Id<"products">;
        temperatureCelsius: number;
      }>;
    } {
  const errors: Record<string, string> = {};
  const startedAt = executionTimestamp(
    draft.startedAtLocal,
    timeZone,
    draft.initialStartedAt,
  );
  let endedAt = executionTimestamp(
    draft.endedAtLocal,
    timeZone,
    draft.initialEndedAt,
  );
  // Equal visible times must stay valid when the original start has seconds.
  if (draft.endedAtLocal === draft.startedAtLocal && endedAt < startedAt) {
    endedAt = startedAt;
  }
  if (!Number.isFinite(startedAt)) errors.startedAt = "Angiv en gyldig starttid";
  if (!Number.isFinite(endedAt)) errors.endedAt = "Angiv en gyldig sluttid";
  else if (endedAt < startedAt) {
    errors.endedAt = "Sluttiden skal være efter eller lig med starttiden";
  }
  if (draft.productTemperatures.length > 100) {
    errors.products = "Du kan højst tilføje 100 produkter";
  }
  const productTemperatures = draft.productTemperatures.map((product) => {
    const normalized = product.temperature.trim().replace(",", ".");
    const temperatureCelsius = Number(normalized);
    if (!normalized) {
      errors[product.productId] = "Angiv produktets temperatur";
    } else if (
      !/^-?\d+(?:\.\d)?$/.test(normalized) ||
      !Number.isFinite(temperatureCelsius) ||
      Math.abs(temperatureCelsius) > 1_000_000_000
    ) {
      errors[product.productId] = "Angiv en gyldig temperatur med højst én decimal";
    }
    return { productId: product.productId, temperatureCelsius };
  });
  return Object.keys(errors).length
    ? { valid: false, errors }
    : { valid: true, startedAt, endedAt, productTemperatures };
}

export function OwnCheckExecutionInputs({
  value,
  onChange,
  controlType,
  disabled,
  errors,
}: {
  value: OwnCheckExecutionDraft;
  onChange: (value: OwnCheckExecutionDraft) => void;
  controlType: OwnCheckControlType;
  disabled: boolean;
  errors: Record<string, string>;
}) {
  const id = useId();
  return (
    <FieldGroup>
      <FieldGroup className="@xl/field-group:flex-row">
        <Field data-invalid={Boolean(errors.startedAt)} data-disabled={disabled}>
          <FieldLabel htmlFor={`${id}-start`}>Starttid *</FieldLabel>
          <Input
            id={`${id}-start`}
            type="datetime-local"
            value={value.startedAtLocal}
            onChange={(event) =>
              onChange({ ...value, startedAtLocal: event.target.value })
            }
            required
            disabled={disabled}
            aria-invalid={Boolean(errors.startedAt)}
            className="h-11"
          />
          <FieldError>{errors.startedAt}</FieldError>
        </Field>
        <Field data-invalid={Boolean(errors.endedAt)} data-disabled={disabled}>
          <FieldLabel htmlFor={`${id}-end`}>Sluttid *</FieldLabel>
          <Input
            id={`${id}-end`}
            type="datetime-local"
            value={value.endedAtLocal}
            onChange={(event) =>
              onChange({ ...value, endedAtLocal: event.target.value })
            }
            min={value.startedAtLocal || undefined}
            required
            disabled={disabled}
            aria-invalid={Boolean(errors.endedAt)}
            className="h-11"
          />
          <FieldError>{errors.endedAt}</FieldError>
        </Field>
      </FieldGroup>
      {controlType === "temperature" ? (
        <ProductTemperatureInputs
          value={value.productTemperatures}
          onChange={(productTemperatures) =>
            onChange({ ...value, productTemperatures })
          }
          disabled={disabled}
          errors={errors}
        />
      ) : null}
    </FieldGroup>
  );
}

function ProductTemperatureInputs({
  value,
  onChange,
  disabled,
  errors,
}: {
  value: OwnCheckExecutionDraft["productTemperatures"];
  onChange: (value: OwnCheckExecutionDraft["productTemperatures"]) => void;
  disabled: boolean;
  errors: Record<string, string>;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const products = useCompleteCatalog(
    api.catalog.listActiveProductSearchOptionsPage,
    {},
  );
  const options = (products ?? [])
    .filter((product) => !value.some((row) => row.productId === product.id))
    .map((product) => ({ value: product.id, label: product.name }));
  const suggestions = (products ?? [])
    .flatMap((product) => {
      if (value.some((row) => row.productId === product.id)) return [];
      const score = productSearchScore(product.name, product.categoryPath, search);
      return score === null ? [] : [{ product, score }];
    })
    .sort((left, right) => left.score - right.score)
    .slice(0, 10)
    .map(({ product }) => ({ value: product.id, label: product.name }));

  return (
    <FieldSet>
      <FieldLegend>Produkttemperaturer</FieldLegend>
      <FieldGroup>
        <Field data-invalid={Boolean(errors.products)} data-disabled={disabled}>
          <FieldLabel>Tilføj produkt</FieldLabel>
          <CreatableCombobox
            options={options}
            suggestionOptions={search.trim() ? suggestions : []}
            value={null}
            onInputValueChange={setSearch}
            onValueChange={(productId) => {
              const product = products?.find((item) => item.id === productId);
              if (
                !product ||
                value.length >= 100 ||
                value.some((row) => row.productId === product.id)
              ) return;
              onChange([
                ...value,
                {
                  productId: product.id,
                  productName: product.name,
                  temperature: "",
                },
              ]);
              setSearch("");
            }}
            placeholder={
              products === undefined
                ? "Henter produkter…"
                : "Søg efter produkter"
            }
            ariaLabel="Tilføj produkt"
            ariaInvalid={Boolean(errors.products)}
            disabled={disabled || products === undefined || value.length >= 100}
          />
          <FieldError>{errors.products}</FieldError>
        </Field>
        {value.length ? (
          <ul className="flex flex-col gap-3">
            {value.map((product) => (
              <ProductLineGroup
                key={product.productId}
                productName={product.productName}
                imageUrl={null}
                action={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0"
                    aria-label={`Fjern ${product.productName}`}
                    disabled={disabled}
                    onClick={() =>
                      onChange(
                        value.filter((row) => row.productId !== product.productId),
                      )
                    }
                  >
                    <Trash2Icon data-icon="inline-start" />
                  </Button>
                }
              >
                <Field
                  data-invalid={Boolean(errors[product.productId])}
                  data-disabled={disabled}
                >
                  <FieldLabel htmlFor={`${id}-${product.productId}`}>
                    Temperatur (°C) *
                  </FieldLabel>
                  <Input
                    id={`${id}-${product.productId}`}
                    inputMode="decimal"
                    value={product.temperature}
                    onChange={(event) =>
                      onChange(
                        value.map((row) =>
                          row.productId === product.productId
                            ? { ...row, temperature: event.target.value }
                            : row,
                        ),
                      )
                    }
                    required
                    disabled={disabled}
                    aria-invalid={Boolean(errors[product.productId])}
                    className="h-11"
                  />
                  <FieldError>{errors[product.productId]}</FieldError>
                </Field>
              </ProductLineGroup>
            ))}
          </ul>
        ) : null}
      </FieldGroup>
    </FieldSet>
  );
}
