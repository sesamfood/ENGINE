"use client";

import { useMemo } from "react";
import { RefreshCwIcon } from "lucide-react";
import {
  CreatableCombobox,
  type ComboboxOption,
} from "@/components/catalog/creatable-combobox";
import {
  getOnlinePosProductSuggestions,
  type OnlinePosProductSuggestion,
} from "@/components/catalog/online-pos-product-suggestions";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";

type ProductOption = OnlinePosProductSuggestion & ComboboxOption;

export function useOnlinePosProductOptions(
  products: readonly OnlinePosProductSuggestion[] | null | undefined,
) {
  return useMemo(
    () =>
      products == null
        ? products
        : products.map((product) => ({
            ...product,
            value: String(product.id),
            label: product.groupName
              ? `${product.name} — ${product.groupName}`
              : product.name,
          })),
    [products],
  );
}

export function OnlinePosProductSelect({
  options,
  productName,
  value,
  onValueChange,
  ariaLabel,
  disabled = false,
  onRetry,
}: {
  options: ProductOption[] | null | undefined;
  productName: string;
  value: number | null;
  onValueChange: (value: number | null) => void;
  ariaLabel: string;
  disabled?: boolean;
  onRetry?: () => void;
}) {
  if (options === undefined) return <Skeleton className="h-11 w-full" />;
  if (options === null) {
    return (
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        onClick={onRetry}
        disabled={disabled || !onRetry}
      >
        <RefreshCwIcon data-icon="inline-start" />
        Prøv at hente OnlinePOS-produkter igen
      </Button>
    );
  }
  const { hasExactMatch, suggestions } = getOnlinePosProductSuggestions(
    options,
    productName,
  );
  const stale =
    value !== null && !options.some((product) => product.id === value);
  const available: ComboboxOption[] = stale
    ? [
        {
          value: String(value),
          label: `Ikke længere tilgængeligt (ID ${value})`,
          disabled: true,
        },
        ...options,
      ]
    : options;
  return (
    <>
      <CreatableCombobox
        options={available}
        suggestionLabel={
          hasExactMatch
            ? "Forslag med samme navn"
            : "Forslag ud fra produktnavnet"
        }
        suggestionOptions={suggestions.map((product) => ({
          value: String(product.id),
          label: product.groupName
            ? `${product.name} — ${product.groupName}`
            : product.name,
        }))}
        value={value === null ? null : String(value)}
        onValueChange={(next) =>
          onValueChange(next === null ? null : Number(next))
        }
        placeholder="Søg efter OnlinePOS-produkt"
        ariaLabel={ariaLabel}
        disabled={disabled}
      />
      {stale ? (
        <FieldDescription>
          Produktet findes ikke længere i OnlinePOS. Vælg et nyt produkt, eller
          fjern koblingen.
        </FieldDescription>
      ) : null}
    </>
  );
}
