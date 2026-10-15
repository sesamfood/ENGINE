"use client";

import { useAction, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { RefreshCwIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CreatableCombobox,
  type ComboboxOption,
} from "@/components/catalog/creatable-combobox";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { normalizeProductSearch } from "@/lib/product-search";
import { suggestCatalogItems, suggestUnitId } from "./gs-supply-suggestions";
import { getUserErrorMessage } from "@/lib/user-errors";

export type GsSupplyProduct = FunctionReturnType<
  typeof api.integrations.gssupply.api.fetchCatalog
>[number];
type Link = { productNumber: string; productName: string; unitId: Id<"units"> };
type Unit = { id: Id<"units">; name: string; factorToDefault: number };

/** Fetches the live catalog. `undefined` while loading, `null` after an error. */
export function useGsSupplyCatalog(enabled = true) {
  const fetchCatalog = useAction(api.integrations.gssupply.api.fetchCatalog);
  const [products, setProducts] = useState<GsSupplyProduct[] | null>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetchCatalog({})
      .then((result) => {
        if (active) setProducts(result);
      })
      .catch((error) => {
        if (!active) return;
        setProducts(null);
        toast.error(
          getUserErrorMessage(
            error,
            "GS Supply-kataloget kunne ikke hentes. Prøv igen.",
          ),
        );
      });
    return () => {
      active = false;
    };
  }, [enabled, fetchCatalog, attempt]);
  const reload = useCallback(() => {
    setProducts(undefined);
    setAttempt((value) => value + 1);
  }, []);
  return { products: enabled ? products : undefined, reload };
}

export function gsSupplyProductLabel(product: {
  productNumber: string;
  name: string;
}) {
  return `${product.productNumber} · ${product.name}`;
}

export function GsSupplyLinkEditor({
  productId,
  productName,
  units,
  link,
  catalog,
  onRetry,
}: {
  productId: Id<"products">;
  productName: string;
  units: Unit[];
  link: Link | null;
  catalog: GsSupplyProduct[] | null | undefined;
  onRetry: () => void;
}) {
  const setProductLink = useMutation(
    api.integrations.gssupply.api.setProductLink,
  );
  const [saving, setSaving] = useState(false);
  // A chosen catalog product waits here until a unit is chosen.
  const [pending, setPending] = useState<{
    productNumber: string;
    productName: string;
  } | null>(null);
  const options = useMemo<ComboboxOption[]>(
    () =>
      (catalog ?? []).map((product) => ({
        value: product.productNumber,
        label: gsSupplyProductLabel(product),
        searchName: product.name,
        searchText: `${product.productNumber} ${product.category}`,
      })),
    [catalog],
  );

  async function save(next: Link | null) {
    setSaving(true);
    try {
      await setProductLink({ productId, link: next });
      setPending(null);
      toast.success(
        next ? "GS Supply-koblingen er gemt" : "GS Supply-koblingen er fjernet",
      );
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "GS Supply-koblingen kunne ikke gemmes. Prøv igen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  if (catalog === undefined) return <Skeleton className="h-11 w-full" />;
  if (catalog === null) {
    return (
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        onClick={onRetry}
      >
        <RefreshCwIcon data-icon="inline-start" />
        Prøv at hente GS Supply-kataloget igen
      </Button>
    );
  }

  const selected = pending ?? link;
  const stale =
    link !== null &&
    pending === null &&
    !catalog.some((product) => product.productNumber === link.productNumber);
  const available: ComboboxOption[] =
    stale && link
      ? [
          {
            value: link.productNumber,
            label: `${gsSupplyProductLabel({ productNumber: link.productNumber, name: link.productName })} (ikke i kataloget)`,
            disabled: true,
          },
          ...options,
        ]
      : options;
  const exact = catalog.filter(
    (product) =>
      normalizeProductSearch(product.name) ===
      normalizeProductSearch(productName),
  );
  const suggestions = exact.length
    ? exact
    : suggestCatalogItems(catalog, productName);
  const selectedItem = selected
    ? catalog.find((item) => item.productNumber === selected.productNumber)
    : undefined;
  const suggestedUnitId = suggestUnitId(units, selectedItem?.unitAmount);
  const unitItems = units
    .map((unit) => ({
      value: unit.id,
      label: unit.id === suggestedUnitId ? `${unit.name} (forslag)` : unit.name,
    }))
    .sort(
      (left, right) =>
        Number(right.value === suggestedUnitId) -
        Number(left.value === suggestedUnitId),
    );
  const unitId = pending ? null : (link?.unitId ?? null);

  function chooseProduct(productNumber: string | null) {
    if (productNumber === null) {
      setPending(null);
      if (link) void save(null);
      return;
    }
    const product = catalog?.find((row) => row.productNumber === productNumber);
    if (!product) return;
    const next = { productNumber, productName: product.name };
    const keptUnit = link?.unitId ?? suggestUnitId(units, product.unitAmount);
    if (keptUnit) void save({ ...next, unitId: keptUnit });
    else setPending(next);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <CreatableCombobox
          productSearch
          options={available}
          suggestionLabel={
            exact.length
              ? "Forslag med samme navn"
              : "Forslag ud fra produktnavnet"
          }
          suggestionOptions={suggestions.map((product) => ({
            value: product.productNumber,
            label: gsSupplyProductLabel(product),
          }))}
          value={selected?.productNumber ?? null}
          onValueChange={chooseProduct}
          placeholder="Søg efter GS Supply-produkt"
          ariaLabel={`GS Supply-produkt for ${productName}`}
          disabled={saving}
        />
        {stale ? (
          <FieldDescription>
            Produktet findes ikke længere i GS Supply-kataloget. Vælg et nyt,
            eller fjern koblingen.
          </FieldDescription>
        ) : null}
      </div>
      <div className="sm:w-48">
        <Select
          items={unitItems}
          value={unitId}
          onValueChange={(value) => {
            if (!value || !selected) return;
            void save({
              productNumber: selected.productNumber,
              productName: selected.productName,
              unitId: value as Id<"units">,
            });
          }}
          disabled={saving || !selected}
        >
          <SelectTrigger
            className="h-11 w-full"
            aria-label={`Enhed for én GS Supply-pakke af ${productName}`}
            aria-invalid={pending !== null}
          >
            <SelectValue placeholder="Vælg enhed" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {unitItems.map((unit) => (
                <SelectItem key={unit.value} value={unit.value}>
                  {unit.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {pending ? (
          <FieldDescription>Vælg enheden for én pakke.</FieldDescription>
        ) : null}
      </div>
    </div>
  );
}
