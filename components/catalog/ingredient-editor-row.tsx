"use client";

import { useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getUserErrorMessage } from "@/lib/user-errors";
import {
  CreatableCombobox,
  type ComboboxOption,
} from "@/components/catalog/creatable-combobox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";

const ADD_UNIT_VALUE = "__add_unit__";

export type IngredientDraft = {
  key: string;
  productId: Id<"products"> | null;
  quantity: string;
  unitId: Id<"units"> | null;
  onlinePosProductId: number | null;
};

type IngredientProduct = {
  id: Id<"products">;
  name: string;
  defaultUnitName?: string;
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
  unitOptions,
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
  unitOptions: ComboboxOption[];
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
  const [addingUnit, setAddingUnit] = useState(false);
  const canAddUnit = selectedProduct?.defaultUnitName !== undefined;
  return (
    <div className="grid gap-3 rounded-xl border p-3 md:grid-cols-(--grid-cols-product-mapping) md:items-start">
      <div className="flex min-w-0 flex-col gap-3 md:col-start-1 md:row-start-1">
        <Field data-invalid={Boolean(productError)}>
          <FieldLabel>Produkt</FieldLabel>
          <CreatableCombobox
            productSearch
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
            if (value === ADD_UNIT_VALUE) {
              setAddingUnit(true);
              return;
            }
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
            {canAddUnit ? (
              <>
                <SelectSeparator />
                <SelectItem value={ADD_UNIT_VALUE}>
                  <PlusIcon />
                  Tilføj enhed
                </SelectItem>
              </>
            ) : null}
          </SelectContent>
        </Select>
        <FieldError>{unitError}</FieldError>
        {selectedProduct && canAddUnit ? (
          <AddProductUnitDialog
            open={addingUnit}
            onOpenChange={setAddingUnit}
            product={selectedProduct}
            unitOptions={unitOptions}
            onAdded={(unitId) => onChange({ unitId })}
          />
        ) : null}
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

function AddProductUnitDialog({
  open,
  onOpenChange,
  product,
  unitOptions,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: IngredientProduct;
  unitOptions: ComboboxOption[];
  onAdded: (unitId: Id<"units">) => void;
}) {
  const addProductUnit = useMutation(api.catalog.addProductUnit);
  const [unitValue, setUnitValue] = useState<string | null>(null);
  const [factor, setFactor] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const availableOptions = unitOptions.filter(
    (option) =>
      !product.units.some((unit) => option.value === `existing:${unit.id}`),
  );
  const unitName =
    unitOptions.find((option) => option.value === unitValue)?.label ??
    unitValue?.replace(/^new:/, "") ??
    "enhed";

  function close(next: boolean) {
    if (isSaving) return;
    if (!next) {
      setUnitValue(null);
      setFactor("");
      setError("");
    }
    onOpenChange(next);
  }

  async function save() {
    const factorToDefault = Number(factor.trim().replace(",", "."));
    if (!unitValue) return setError("Vælg en enhed");
    if (!Number.isFinite(factorToDefault) || factorToDefault <= 0) {
      return setError("Omregningen skal være større end nul");
    }
    setIsSaving(true);
    setError("");
    try {
      const unitId = await addProductUnit({
        productId: product.id,
        unit: unitValue.startsWith("new:")
          ? { kind: "new", name: unitValue.slice(4) }
          : { kind: "existing", id: unitValue.slice(9) as Id<"units"> },
        factorToDefault,
      });
      onAdded(unitId);
      toast.success(`${unitName} er tilføjet til ${product.name}`);
      setIsSaving(false);
      close(false);
    } catch (caught) {
      setError(getUserErrorMessage(caught, "Enheden kunne ikke tilføjes. Prøv igen."));
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tilføj enhed</DialogTitle>
          <DialogDescription>
            Enheden tilføjes til produktet {product.name}.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Enhed</FieldLabel>
            <CreatableCombobox
              options={availableOptions}
              value={unitValue}
              onValueChange={setUnitValue}
              placeholder="Vælg eller opret en enhed"
              allowCreate
              ariaLabel="Enhed"
            />
          </Field>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor="add-product-unit-factor">
              1 {unitName} svarer til
            </FieldLabel>
            <Input
              id="add-product-unit-factor"
              type="text"
              inputMode="decimal"
              value={factor}
              onChange={(event) => setFactor(event.target.value)}
              className="h-11"
              aria-invalid={Boolean(error)}
            />
            <FieldDescription>{product.defaultUnitName}</FieldDescription>
            <FieldError>{error}</FieldError>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={() => close(false)}
          >
            Annullér
          </Button>
          <Button type="button" disabled={isSaving} onClick={save}>
            {isSaving ? <Spinner data-icon="inline-start" /> : null}
            Tilføj enhed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
