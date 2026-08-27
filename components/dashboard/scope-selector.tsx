"use client";

import { MapPinIcon } from "lucide-react";
import { useQuery } from "convex/react";
import { useLocationAccess } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DashboardScope } from "@/lib/dashboard/types";

type ScopeLevel = "organization" | "market" | "operator" | "location";
type Location = { id: Id<"locations">; name: string };
type ScopeLocation = Location & {
  marketId: Id<"markets"> | null;
  operatorId: Id<"operators"> | null;
};
const checkboxItemClassName = "min-h-10 pr-1.5 pl-8 [&_[data-slot=dropdown-menu-checkbox-item-indicator]]:right-auto [&_[data-slot=dropdown-menu-checkbox-item-indicator]]:left-2";

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
  const scopeOptions = useQuery(api.dashboard.listScopeOptions, {});
  const visibleLocations = access.locations ?? locations;
  const allowedIds = new Set(visibleLocations.map((location) => location.id));
  const optionLocations = (scopeOptions?.locations ?? visibleLocations).filter(
    (location) => allowedIds.has(location.id),
  ) as ScopeLocation[];
  const singleLocation = access.isLocked && access.lockedId
    ? optionLocations.filter((location) => location.id === access.lockedId)
    : optionLocations;
  const availableLocations = singleLocation.length ? singleLocation : optionLocations;
  const lockedToSingle = access.isLocked || availableLocations.length === 1;
  const currentLevel: ScopeLevel = lockedToSingle ? "location" : scope.level ?? (
    scope.locationIds?.length === 1 ? "location" : "organization"
  );
  const currentParentId = lockedToSingle
    ? availableLocations[0]?.id
    : scope.parentId ?? (
    currentLevel === "location" && scope.locationIds?.length === 1
      ? scope.locationIds[0]
      : undefined
  );
  const selectedLocations = optionLocations.filter((location) => {
    if (currentLevel === "market") return location.marketId === currentParentId;
    if (currentLevel === "operator") return location.operatorId === currentParentId;
    if (currentLevel === "location") return true;
    return true;
  });
  const selectedIds = (scope.locationIds ?? selectedLocations.map((location) => location.id)).filter(
    (id) => selectedLocations.some((location) => location.id === id),
  );
  function scopeFor(level: ScopeLevel, parentId?: string): DashboardScope {
    if (level === "organization") {
      return { mode: "aggregate", locationIds: null, level };
    }
    if (!parentId) return { mode: "aggregate", locationIds: null, level };
    if (level === "location") {
      return {
        mode: "aggregate",
        locationIds: [parentId as Id<"locations">],
        level,
        parentId,
      };
    }
    return { mode: "aggregate", locationIds: null, level, parentId };
  }

  function toggleLocation(id: Id<"locations">, checked: boolean) {
    if (currentLevel === "location") {
      if (checked) onChange(scopeFor("location", id));
      return;
    }
    const next = checked
      ? [...selectedIds, id]
      : selectedIds.filter((item) => item !== id);
    if (next.length === 0) return;
    const allSelected = next.length === selectedLocations.length;
    onChange({
      ...scope,
      level: currentLevel,
      parentId: currentLevel === "organization" ? undefined : currentParentId,
      mode: allSelected || next.length === 1 ? "aggregate" : "compare",
      locationIds: allSelected ? null : next,
    });
  }

  function selectAllLocations() {
    onChange({
      ...scope,
      level: currentLevel,
      parentId: currentLevel === "organization" ? undefined : currentParentId,
      mode: "aggregate",
      locationIds: null,
    });
  }

  function selectOnlyLocation(id: Id<"locations">) {
    if (currentLevel === "location") {
      onChange(scopeFor("location", id));
      return;
    }
    onChange({
      ...scope,
      level: currentLevel,
      parentId: currentLevel === "organization" ? undefined : currentParentId,
      mode: "aggregate",
      locationIds: [id],
    });
  }

  const currentParentName = currentLevel === "market"
    ? scopeOptions?.markets?.find((market) => market.id === currentParentId)?.name
    : currentLevel === "operator"
      ? scopeOptions?.operators?.find((operator) => operator.id === currentParentId)?.name
      : currentLevel === "location"
        ? optionLocations.find((location) => location.id === currentParentId)?.name
        : undefined;
  const allSelected = currentLevel !== "location" && selectedIds.length > 0 && selectedIds.length === selectedLocations.length;
  const triggerLabel = allSelected
    ? "Alle lokationer"
    : selectedIds.length === 1
      ? selectedLocations.find((location) => location.id === selectedIds[0])?.name ?? "1 lokation"
      : `${selectedIds.length} lokationer`;

  function changeMode(mode: DashboardScope["mode"]) {
    const locationIds = mode === "compare"
      ? selectedIds
      : allSelected
        ? null
        : selectedIds;
    onChange({ ...scope, mode, locationIds });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {lockedToSingle ? (
        <Button type="button" variant="outline" size="lg" className="min-h-11 max-w-full min-w-48" disabled aria-label="Valgt lokation">
          <MapPinIcon data-icon="inline-start" />
          <span className="min-w-0 truncate">{triggerLabel}</span>
        </Button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" size="lg" className="min-h-11 max-w-full min-w-56" aria-label="Vælg dashboardets lokationer" />}>
            <MapPinIcon data-icon="inline-start" />
            <span className="min-w-0 truncate">{triggerLabel}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Lokationer</DropdownMenuLabel>
              {currentLevel !== "location" ? (
                <DropdownMenuCheckboxItem className={checkboxItemClassName} checked={allSelected} onCheckedChange={(checked) => { if (checked) selectAllLocations(); }}>
                  {currentLevel === "organization" ? "Alle lokationer" : `Alle i ${currentParentName ?? "gruppen"}`}
                </DropdownMenuCheckboxItem>
              ) : null}
            </DropdownMenuGroup>
            {currentLevel !== "location" ? <DropdownMenuSeparator /> : null}
            <DropdownMenuGroup className="max-h-64 overflow-y-auto">
              {selectedLocations.map((location) => (
                <div key={location.id} role="presentation" className="group/location grid grid-cols-[minmax(0,1fr)_auto] gap-x-1">
                  <DropdownMenuCheckboxItem
                    className={checkboxItemClassName}
                    checked={selectedIds.includes(location.id)}
                    disabled={selectedIds.includes(location.id) && selectedIds.length <= 1}
                    onCheckedChange={(checked) => toggleLocation(location.id, checked)}
                  >
                    <span className="min-w-0 truncate">{location.name}</span>
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuItem
                    className="invisible min-h-10 justify-center group-focus-within/location:visible group-hover/location:visible"
                    aria-label={`Vælg kun ${location.name}`}
                    onClick={() => selectOnlyLocation(location.id)}
                  >
                    Kun
                  </DropdownMenuItem>
                </div>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {selectedIds.length >= 2 ? (
        <ToggleGroup
          value={[scope.mode]}
          onValueChange={(value) => {
            const mode = value[0];
            if (mode === "aggregate" || mode === "compare") changeMode(mode);
          }}
          variant="outline"
          size="lg"
          spacing={0}
          aria-label="Vis data som"
        >
          <ToggleGroupItem value="aggregate" className="min-h-11">Akkumuleret</ToggleGroupItem>
          <ToggleGroupItem value="compare" className="min-h-11">Pr. lokation</ToggleGroupItem>
        </ToggleGroup>
      ) : null}
    </div>
  );
}
