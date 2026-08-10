"use client";

import { GitCompareArrowsIcon, MapPinIcon } from "lucide-react";
import { LocationField } from "@/components/location-field";
import { useLocationAccess } from "@/components/app-shell";
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
  const access = useLocationAccess();
  const visibleLocations = access.locations ?? locations;
  const singleLocation = access.isLocked && access.lockedId
    ? visibleLocations.filter((location) => location.id === access.lockedId)
    : visibleLocations;
  const availableLocations = singleLocation.length ? singleLocation : visibleLocations;
  const selected = (scope.locationIds ?? []).filter((id) =>
    availableLocations.some((location) => location.id === id),
  );
  const lockedToSingle = availableLocations.length === 1;
  const currentMode = lockedToSingle ? "aggregate" : scope.mode;
  const aggregateValue = lockedToSingle
    ? availableLocations[0]?.id ?? "all"
    : scope.mode === "aggregate" && selected.length === 1
      ? selected[0]
      : "all";

  function setMode(value: string[]) {
    const mode = value[0];
    if (lockedToSingle) {
      if (availableLocations[0]) {
        onChange({ mode: "aggregate", locationIds: [availableLocations[0].id] });
      }
      return;
    }
    if (mode === "aggregate") {
      onChange({ mode: "aggregate", locationIds: null });
    } else if (mode === "compare") {
      const ids = selected.length >= 2 ? selected : availableLocations.slice(0, 2).map((location) => location.id);
      if (ids.length >= 2) onChange({ mode: "compare", locationIds: ids });
    }
  }

  function toggleLocation(id: Id<"locations">, checked: boolean) {
    const next = checked ? [...selected, id] : selected.filter((item) => item !== id);
    if (next.length >= 2) onChange({ mode: "compare", locationIds: next });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup value={[currentMode]} onValueChange={setMode} variant="outline" size="lg" spacing={0}>
        <ToggleGroupItem value="aggregate" className="min-h-11">
          <MapPinIcon data-icon="inline-start" />
          Lokation
        </ToggleGroupItem>
        {!lockedToSingle ? <ToggleGroupItem value="compare" className="min-h-11" disabled={availableLocations.length < 2}>
          <GitCompareArrowsIcon data-icon="inline-start" />
          Sammenlign
        </ToggleGroupItem> : null}
      </ToggleGroup>
      {lockedToSingle ? (
        <LocationField
          locations={availableLocations}
          value={aggregateValue}
          locked
          lockedName={availableLocations[0]?.name}
          className="h-11! w-56 min-w-48"
        />
      ) : scope.mode === "aggregate" ? (
        <Select
          items={[
            { value: "all", label: "Alle lokationer" },
            ...availableLocations.map((location) => ({ value: location.id, label: location.name })),
          ]}
          value={aggregateValue}
          onValueChange={(value) => onChange({ mode: "aggregate", locationIds: value && value !== "all" ? [value as Id<"locations">] : null })}
        >
          <SelectTrigger aria-label="Lokation" className="h-11! w-56 min-w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">Alle lokationer</SelectItem>
              {availableLocations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" size="lg" className="min-h-11" />}>
            {selected.length} lokationer
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Vælg lokationer</DropdownMenuLabel>
              {availableLocations.map((location) => (
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
