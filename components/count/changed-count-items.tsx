"use client";

import { QuantityInput } from "@/components/quantity-input";
import {
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { parseDecimal } from "@/lib/containers";
import { getUserErrorMessage } from "@/lib/user-errors";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { toast } from "sonner";

type ChangedItem = FunctionReturnType<
  typeof api.count.listChangedCountItems
>[number];

function ChangedCountItem({
  locationId,
  item,
}: {
  locationId: Id<"locations">;
  item: ChangedItem;
}) {
  const [unitId, setUnitId] = useState(item.defaultUnitId);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<"save" | "remove" | null>(null);
  const setQuantity = useMutation(api.count.setCountQuantity);
  const removeItem = useMutation(api.count.removeChangedCountItem);
  const quantity = parseDecimal(draft);
  const validQuantity = Number.isFinite(quantity) && quantity >= 0;
  const unitItems = item.units.map((unit) => ({
    value: unit.id,
    label: unit.name,
  }));

  async function run(action: "save" | "remove", task: () => Promise<null>) {
    setPending(action);
    try {
      await task();
    } catch (error) {
      setPending(null);
      toast.error(
        getUserErrorMessage(
          error,
          "Produktet kunne ikke gemmes. Prøv igen.",
        ),
      );
    }
  }

  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0">
      <div className="text-left">
        <p className="font-medium">{item.productName}</p>
        <p className="text-sm text-muted-foreground">
          {item.countAreaName ? `${item.countAreaName} · ` : null}
          Talt før ændringen: {item.quantity.toLocaleString("da-DK")}{" "}
          {item.unitName}
        </p>
      </div>
      {unitId ? (
        <div className="grid grid-cols-2 gap-2">
          <QuantityInput
            label={`Mængde for ${item.productName}`}
            value={draft}
            onValueChange={setDraft}
            invalid={draft !== "" && !validQuantity}
            disabled={pending !== null}
          />
          <Select
            items={unitItems}
            value={unitId}
            onValueChange={(value) => {
              const unit = item.units.find((unit) => unit.id === value);
              if (unit) setUnitId(unit.id);
            }}
            disabled={pending !== null}
          >
            <SelectTrigger
              aria-label={`Enhed for ${item.productName}`}
              className="h-11! w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {unitItems.map((unit) => (
                  <SelectItem key={unit.value} value={unit.value}>
                    {unit.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      ) : (
        <p className="text-left text-sm text-muted-foreground">
          Produktet kan ikke tælles længere. Fjern det fra denne Count.
        </p>
      )}
      {unitId && !validQuantity ? (
        <p className="text-left text-sm text-muted-foreground">
          Angiv en mængde på 0 eller mere for at gemme.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={pending !== null}
          onClick={() =>
            void run("remove", () =>
              removeItem({ locationId, countItemId: item.id }),
            )
          }
        >
          {pending === "remove" ? <Spinner data-icon="inline-start" /> : null}
          Fjern
        </Button>
        {unitId ? (
          <Button
            type="button"
            className="min-h-11"
            disabled={pending !== null || !validQuantity}
            onClick={() =>
              void run("save", () =>
                setQuantity({
                  locationId,
                  countAreaId: item.countAreaId,
                  productId: item.productId,
                  unitId,
                  quantity,
                  replacesCountItemId: item.id,
                }),
              )
            }
          >
            {pending === "save" ? <Spinner data-icon="inline-start" /> : null}
            Gem
          </Button>
        ) : null}
      </div>
    </li>
  );
}

export function ChangedCountItems({
  locationId,
  items,
}: {
  locationId: Id<"locations">;
  items: ChangedItem[];
}) {
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Tjek ændrede produkter</AlertDialogTitle>
        <AlertDialogDescription>
          Enhederne er ændret, efter produkterne blev talt. Tjek hvert produkt,
          og angiv den rigtige mængde, før du registrerer Count.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <ul className="max-h-80 divide-y overflow-y-auto">
        {items.map((item) => (
          <ChangedCountItem key={item.id} locationId={locationId} item={item} />
        ))}
      </ul>
    </>
  );
}
