"use client";

import type { ReactNode } from "react";
import { Trash2Icon } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CreatableCombobox,
  type ComboboxOption,
} from "@/components/catalog/creatable-combobox";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type IngredientDraft = {
  key: string;
  productId: Id<"products"> | null;
  quantity: string;
  unitId: Id<"units"> | null;
  onlinePosProductId: number | null;
};

type IngredientProduct = {
  id: Id<"products">;
  units: Array<{ id: Id<"units">; name: string }>;
};

export function validateIngredientRows(
  rows: IngredientDraft[],
  errors: Record<string, string>,
) {
  for (const row of rows) {
    if (!row.productId)
      errors[`${row.key}-product`] = "Vælg produkt for hver ingrediens";
    else if (
      rows.some(
        (candidate) =>
          candidate.key !== row.key && candidate.productId === row.productId,
      )
    ) {
      errors[`${row.key}-product`] = "Hver ingrediens kan kun tilføjes én gang";
    }
    const quantity = Number(row.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0)
      errors[`${row.key}-quantity`] = "Indtast en mængde større end nul";
    if (!row.unitId) errors[`${row.key}-unit`] = "Vælg en enhed";
  }
}

export function IngredientEditorRow({
  row,
  products,
  options,
  onChange,
  onRemove,
  productLabel,
  removeLabel,
  disabled,
  errors,
  productChildren,
  children,
}: {
  row: IngredientDraft;
  products: IngredientProduct[];
  options: ComboboxOption[];
  onChange: (patch: Partial<IngredientDraft>) => void;
  onRemove: () => void;
  productLabel: string;
  removeLabel: string;
  disabled?: boolean;
  errors: Record<string, string>;
  productChildren?: ReactNode;
  children?: ReactNode;
}) {
  const selectedProduct = products.find(
    (product) => product.id === row.productId,
  );
  const productError = errors[`${row.key}-product`];
  const quantityError = errors[`${row.key}-quantity`];
  const unitError = errors[`${row.key}-unit`];
  return (
    <div className="grid gap-3 rounded-xl border p-3 md:grid-cols-[minmax(0,1fr)_8rem_minmax(8rem,0.55fr)_auto] md:items-start">
      <div className="flex min-w-0 flex-col gap-3 md:col-start-1 md:row-start-1">
        <Field data-invalid={Boolean(productError)}>
          <FieldLabel>Produkt</FieldLabel>
          <CreatableCombobox
            options={options}
            value={row.productId}
            disabled={disabled}
            onValueChange={(value) => {
              const product = products.find(
                (candidate) => candidate.id === value,
              );
              onChange({
                productId: product?.id ?? null,
                unitId: product?.units[0]?.id ?? null,
                onlinePosProductId: null,
              });
            }}
            placeholder="Søg efter produkter"
            ariaLabel={productLabel}
            ariaInvalid={Boolean(productError)}
          />
          <FieldError>{productError}</FieldError>
        </Field>
        {productChildren}
      </div>
      {children}
      <Field
        className="md:col-start-2 md:row-start-1"
        data-invalid={Boolean(quantityError)}
      >
        <FieldLabel htmlFor={`${row.key}-quantity`}>Mængde</FieldLabel>
        <Input
          id={`${row.key}-quantity`}
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={row.quantity}
          onChange={(event) => onChange({ quantity: event.target.value })}
          className="h-11"
          aria-invalid={Boolean(quantityError)}
        />
        <FieldError>{quantityError}</FieldError>
      </Field>
      <Field
        className="md:col-start-3 md:row-start-1"
        data-invalid={Boolean(unitError)}
      >
        <FieldLabel htmlFor={`${row.key}-unit`}>Enhed</FieldLabel>
        <Select
          items={(selectedProduct?.units ?? []).map((unit) => ({
            value: unit.id,
            label: unit.name,
          }))}
          value={row.unitId}
          onValueChange={(value) => {
            const unit = selectedProduct?.units.find(
              (candidate) => candidate.id === value,
            );
            onChange({ unitId: unit?.id ?? null });
          }}
          disabled={!selectedProduct}
        >
          <SelectTrigger
            id={`${row.key}-unit`}
            className="h-11! w-full"
            aria-invalid={Boolean(unitError)}
          >
            <SelectValue placeholder="Vælg enhed" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {selectedProduct?.units.map((unit) => (
                <SelectItem key={unit.id} value={unit.id}>
                  {unit.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldError>{unitError}</FieldError>
      </Field>
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        className="md:col-start-4 md:row-start-1 md:mt-6"
        aria-label={removeLabel}
        onClick={onRemove}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}
