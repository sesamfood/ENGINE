"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { QuantityInput } from "@/components/quantity-input";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getUserErrorMessage } from "@/lib/user-errors";

type LatestCountProduct = {
  id: Id<"products">;
  name: string;
  units: Array<{ id: Id<"units">; name: string }>;
};

// Pass one product to skip the picker; pass several to let the user choose.
export function AddToLatestCountDialog({
  locationId,
  open,
  products,
  onOpenChange,
}: {
  locationId: Id<"locations">;
  open: boolean;
  products: LatestCountProduct[];
  onOpenChange: (open: boolean) => void;
}) {
  const addProduct = useMutation(api.count.addProductToLatestCount);
  const [pickedId, setPickedId] = useState<Id<"products"> | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const fixed = products.length === 1;
  const product = fixed
    ? products[0]
    : products.find((candidate) => candidate.id === pickedId);

  function close() {
    setPickedId(null);
    setQuantities({});
    onOpenChange(false);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product) return;
    setSaving(true);
    try {
      await addProduct({
        locationId,
        productId: product.id,
        quantities: product.units.map((unit) => ({
          unitId: unit.id,
          quantity: quantities[unit.id] ?? 0,
        })),
      });
      toast.success(`${product.name} er tilføjet til seneste Count`);
      close();
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Produktet kunne ikke tilføjes. Prøv igen."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) close();
      }}
    >
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <form className="flex flex-col gap-4" onSubmit={save}>
          <DialogHeader>
            <DialogTitle>
              {fixed && product ? product.name : "Tilføj glemt Produkt"}
            </DialogTitle>
            <DialogDescription>
              Tilføj den optalte beholdning til den seneste registrerede
              Count. Lageret overskrives med mængden.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {!fixed ? (
              <Field>
                <FieldLabel htmlFor="latest-count-product">Produkt</FieldLabel>
                <Combobox
                  items={products.map((candidate) => candidate.id)}
                  value={pickedId}
                  disabled={saving}
                  itemToStringLabel={(id) =>
                    products.find((candidate) => candidate.id === id)?.name ??
                    ""
                  }
                  onValueChange={(id) => {
                    setPickedId(id);
                    setQuantities({});
                  }}
                >
                  <ComboboxInput
                    id="latest-count-product"
                    placeholder="Søg efter Produkt"
                    className="h-11 w-full"
                    disabled={saving}
                  />
                  <ComboboxContent>
                    <ComboboxEmpty>Ingen Produkter fundet.</ComboboxEmpty>
                    <ComboboxList>
                      {(id: Id<"products">) => (
                        <ComboboxItem key={id} value={id} className="min-h-11">
                          {products.find((candidate) => candidate.id === id)
                            ?.name}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </Field>
            ) : null}
            {product?.units.map((unit) => (
              <Field key={unit.id} orientation="responsive">
                <FieldLabel className="@md/field-group:min-w-24">
                  {unit.name}
                </FieldLabel>
                <div className="w-full @md/field-group:w-56">
                  <QuantityInput
                    label={`Mængde af ${product.name} i ${unit.name}`}
                    value={quantities[unit.id] ?? 0}
                    disabled={saving}
                    onValueChange={(value) => {
                      const quantity = Number(value.replace(",", "."));
                      if (Number.isFinite(quantity))
                        setQuantities((current) => ({
                          ...current,
                          [unit.id]: Math.max(0, quantity),
                        }));
                    }}
                  />
                </div>
              </Field>
            ))}
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={close}
            >
              Annullér
            </Button>
            <Button type="submit" disabled={saving || !product}>
              {saving ? <Spinner data-icon="inline-start" /> : null}
              Tilføj til Count
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
