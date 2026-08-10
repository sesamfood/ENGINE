"use client";

import { MapPinIcon } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type LocationOption = {
  id: Id<"locations">;
  name: string;
};

export function LocationField({
  id,
  locations,
  value,
  onValueChange,
  locked = false,
  lockedName,
  disabled,
  className,
  placeholder = "Vælg lokation",
}: {
  id?: string;
  locations: readonly LocationOption[] | undefined;
  value?: Id<"locations"> | string | null;
  onValueChange?: (value: string) => void;
  locked?: boolean;
  lockedName?: string | null;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const items =
    locations?.map((location) => ({
      value: location.id,
      label: location.name,
    })) ?? [];

  if (locked) {
    return (
      <div
        id={id}
        aria-label={lockedName ?? "Lokation"}
        className={cn(
          "flex h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium",
          className,
        )}
      >
        <MapPinIcon aria-hidden="true" />
        <span className="truncate">{lockedName ?? "Lokation"}</span>
      </div>
    );
  }

  return (
    <Select
      items={items}
      value={value ?? null}
      onValueChange={(next) => {
        if (next) onValueChange?.(next);
      }}
      disabled={disabled ?? !items.length}
    >
      <SelectTrigger id={id} className={cn("h-11! w-full", className)}>
        <MapPinIcon aria-hidden="true" />
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
