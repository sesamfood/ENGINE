"use client";

import { useId } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { Field, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function OnlinePosMasterSelect({
  masters,
  value,
  onValueChange,
  disabled,
}: {
  masters: Array<{
    id: Id<"onlinePosIntegrations">;
    name: string;
    companyId: number;
  }>;
  value: Id<"onlinePosIntegrations"> | null;
  onValueChange: (value: Id<"onlinePosIntegrations">) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const items = masters.map((master) => ({
    value: master.id,
    label: `${master.name} · ${master.companyId}`,
  }));
  return (
    <Field>
      <div className="flex items-center gap-1">
        <FieldLabel htmlFor={id}>Masterforbindelse</FieldLabel>
        <HelpTooltip
          label="OnlinePOS-masterforbindelse"
          content="Produktkoblinger, menuer, tilvalg og fravalg følger den valgte masterforbindelse."
        />
      </div>
      <Select
        items={items}
        value={value}
        disabled={disabled || masters.length === 0}
        onValueChange={(next) => {
          const master = masters.find((option) => option.id === next);
          if (master) onValueChange(master.id);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Vælg masterforbindelse" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
