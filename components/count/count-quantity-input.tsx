"use client";

import { QuantityInput } from "@/components/quantity-input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Id } from "@/convex/_generated/dataModel";
import { containerTares } from "@/lib/containers";
import { useState } from "react";

const round = (value: number) => Math.round(value * 1e6) / 1e6;
const NO_CONTAINER = "none";

type Unit = { name: string; factorToDefault: number };

// Count input that can subtract a container's weight from a gross weighing.
export function CountQuantityInput({
  label,
  product,
  unit,
  value,
  disabled,
  onQuantityChange,
}: {
  label: string;
  product: {
    units: Unit[];
    containers: Array<{ id: Id<"containers">; name: string; weightGrams: number }>;
  };
  unit: Unit & { containerId?: Id<"containers"> };
  value: number;
  disabled?: boolean;
  onQuantityChange: (quantity: number) => void;
}) {
  const tares = containerTares(product.units, unit, product.containers);
  const [selectedId, setSelectedId] = useState<string>(
    unit.containerId ?? NO_CONTAINER,
  );
  const selected = tares.find((container) => container.id === selectedId);
  const tare = selected?.tare ?? 0;
  const tareLabel = (container: (typeof tares)[number]) =>
    `${container.name} (−${container.tare.toLocaleString("da-DK", { maximumFractionDigits: 3 })} ${unit.name})`;
  const written = value > 0 ? round(value + tare) : value;

  // Keep the written number and recalculate the saved quantity.
  function changeContainer(id: string) {
    setSelectedId(id);
    if (written > 0) {
      const next = tares.find((container) => container.id === id)?.tare ?? 0;
      onQuantityChange(Math.max(0, round(written - next)));
    }
  }

  const input = (
    <QuantityInput
      label={label}
      value={written}
      disabled={disabled}
      onValueChange={(text) => {
        const quantity = Number(text.replace(",", "."));
        if (Number.isFinite(quantity))
          onQuantityChange(Math.max(0, round(quantity - tare)));
      }}
    />
  );
  if (tares.length === 0) return input;

  return (
    <div className="flex flex-col gap-2">
      {input}
      <Select
        value={selectedId}
        disabled={disabled}
        onValueChange={(id) => {
          if (typeof id === "string") changeContainer(id);
        }}
      >
        <SelectTrigger
          aria-label={`Beholder for ${label.toLocaleLowerCase("da")}`}
          className="h-11! w-full"
        >
          <SelectValue>
            {selected ? tareLabel(selected) : "Ingen beholder"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            <SelectItem value={NO_CONTAINER}>Ingen beholder</SelectItem>
            {tares.map((container) => (
              <SelectItem key={container.id} value={container.id}>
                {tareLabel(container)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
