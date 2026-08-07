"use client";

import { GitCompareArrowsIcon, MapPinIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Id } from "@/convex/_generated/dataModel";
import type { DashboardScope } from "@/lib/dashboard/types";

type Location = { id: Id<"locations">; name: string };

export function ScopeSelector({
  scope,
  locations,
  onChange,
}: {
  scope: DashboardScope;
  locations: Location[];
  onChange: (scope: DashboardScope) => void;
}) {
  const selected = scope.locationIds ?? [];
  const aggregateValue = scope.mode === "aggregate" && selected.length === 1 ? selected[0] : "all";

  function setMode(value: string[]) {
    const mode = value[0];
    if (mode === "aggregate") {
      onChange({ mode: "aggregate", locationIds: null });
    } else if (mode === "compare") {
      const ids = selected.length >= 2 ? selected : locations.slice(0, 2).map((location) => location.id);
      if (ids.length >= 2) onChange({ mode: "compare", locationIds: ids });
    }
  }

  function toggleLocation(id: Id<"locations">, checked: boolean) {
    const next = checked ? [...selected, id] : selected.filter((item) => item !== id);
    if (next.length >= 2) onChange({ mode: "compare", locationIds: next });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup value={[scope.mode]} onValueChange={setMode} variant="outline" spacing={0}>
        <ToggleGroupItem value="aggregate">
          <MapPinIcon data-icon="inline-start" />
          Location
        </ToggleGroupItem>
        <ToggleGroupItem value="compare" disabled={locations.length < 2}>
          <GitCompareArrowsIcon data-icon="inline-start" />
          Sammenlign
        </ToggleGroupItem>
      </ToggleGroup>
      {scope.mode === "aggregate" ? (
        <Select
          items={[
            { value: "all", label: "Alle locations" },
            ...locations.map((location) => ({ value: location.id, label: location.name })),
          ]}
          value={aggregateValue}
          onValueChange={(value) => onChange({ mode: "aggregate", locationIds: value && value !== "all" ? [value as Id<"locations">] : null })}
        >
          <SelectTrigger className="w-56 min-w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">Alle locations</SelectItem>
              {locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" />}>
            {selected.length} locations
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Vælg locations</DropdownMenuLabel>
              {locations.map((location) => (
                <DropdownMenuCheckboxItem
                  key={location.id}
                  checked={selected.includes(location.id)}
                  disabled={selected.includes(location.id) && selected.length <= 2}
                  onCheckedChange={(checked) => toggleLocation(location.id, checked)}
                >
                  {location.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
