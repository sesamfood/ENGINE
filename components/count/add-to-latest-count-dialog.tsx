"use client";

import { useMutation } from "convex/react";
import { PlusIcon } from "lucide-react";
import { usePermission } from "@/components/app-shell";
import { useCountState } from "@/components/count/count-state-provider";
import { useCompleteCatalog } from "@/hooks/use-complete-catalog";
import { useState } from "react";
import { toast } from "sonner";
import { CountQuantityInput } from "@/components/count/count-quantity-input";
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
  units: Array<{
    id: Id<"units">;
    name: string;
    factorToDefault: number;
    container?: { id: Id<"containers">; name: string; weightGrams: number };
  }>;
};

// Bottom-bar action for adding a product that was forgotten in the latest Count.
export function AddForgottenProductButton() {
  const { locationId } = useCountState();
  const canManage = usePermission("count.manage");
  const [open, setOpen] = useState(false);
  const products = useCompleteCatalog(
    api.count.listCatalogPage,
    open && locationId ? { locationId } : "skip",
  );
  if (!canManage || !locationId) return null;

  return (
    <>
      <Button
        type="button"
        size="lg"
        variant="outline"
        appearance="responsive"
        className="min-h-11 shrink-0"
        onClick={() => setOpen(true)}
      >
        <PlusIcon data-icon="inline-start" />
        <span className="sm:hidden">Seneste Count</span>
        <span className="hidden sm:inline">Tilføj til seneste Count</span>
      </Button>
      <AddToLatestCountDialog
        locationId={locationId}
        open={open}
        products={products ?? []}
        onOpenChange={setOpen}
      />
    </>
  );
}

function AddToLatestCountDialog({
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
  const product = products.find((candidate) => candidate.id === pickedId);

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
              Tilføj til seneste Count
            </DialogTitle>
            <DialogDescription>
              Tilføj den optalte beholdning til den seneste registrerede
              Count. Lageret overskrives med mængden.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
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
                    placeholder="Søg efter produkt"
                    className="h-11 w-full"
                    disabled={saving}
                  />
                  <ComboboxContent>
                    <ComboboxEmpty>Ingen produkter fundet.</ComboboxEmpty>
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
            {product?.units.map((unit) => (
              <Field key={unit.id} orientation="responsive">
                <FieldLabel className="@md/field-group:min-w-24">
                  {unit.name}
                </FieldLabel>
                <div className="w-full @md/field-group:w-56">
                  <CountQuantityInput
                    label={`Mængde af ${product.name} i ${unit.name}`}
                    units={product.units}
                    unit={unit}
                    value={quantities[unit.id] ?? 0}
                    disabled={saving}
                    onQuantityChange={(quantity) =>
                      setQuantities((current) => ({
                        ...current,
                        [unit.id]: quantity,
                      }))
                    }
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
