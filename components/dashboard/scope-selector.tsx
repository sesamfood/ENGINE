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
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DashboardScope } from "@/lib/dashboard/types";

type ScopeLevel = "organization" | "market" | "operator" | "location";
type Location = { id: Id<"locations">; name: string };
type ScopeLocation = Location & {
  marketId: Id<"markets"> | null;
  operatorId: Id<"operators"> | null;
};

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
  const marketOptions = (scopeOptions?.markets ?? []).filter((market) =>
    optionLocations.some((location) => location.marketId === market.id),
  );
  const operatorOptions = (scopeOptions?.operators ?? []).filter((operator) =>
    optionLocations.some((location) => location.operatorId === operator.id),
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
  const levelValue = currentLevel === "organization"
    ? "organization"
    : currentLevel === "market"
      ? `market:${currentParentId ?? ""}`
      : currentLevel === "operator"
        ? `operator:${currentParentId ?? ""}`
        : "location";

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

  function selectLevel(value: string) {
    const level = value as ScopeLevel;
    if (level === "organization") {
      onChange(scopeFor(level));
      return;
    }
    const first = level === "market"
      ? marketOptions[0]?.id
      : level === "operator"
        ? operatorOptions[0]?.id
        : optionLocations[0]?.id;
    if (first) onChange(scopeFor(level, first));
  }

  function selectScopeValue(value: string) {
    if (value === "organization") {
      selectLevel(value);
      return;
    }
    if (value.startsWith("market:")) {
      onChange(scopeFor("market", value.slice("market:".length)));
    } else if (value.startsWith("operator:")) {
      onChange(scopeFor("operator", value.slice("operator:".length)));
    } else {
      selectLevel(value);
    }
  }

  const currentParentName = currentLevel === "market"
    ? marketOptions.find((market) => market.id === currentParentId)?.name
    : currentLevel === "operator"
      ? operatorOptions.find((operator) => operator.id === currentParentId)?.name
      : currentLevel === "location"
        ? optionLocations.find((location) => location.id === currentParentId)?.name
        : undefined;
  const allSelected = currentLevel !== "location" && selectedIds.length > 0 && selectedIds.length === selectedLocations.length;
  const selectedSummary = selectedIds.length === 1
    ? selectedLocations.find((location) => location.id === selectedIds[0])?.name ?? "1 lokation"
    : allSelected
      ? currentLevel === "organization" ? "Alle lokationer" : `Alle i ${currentParentName ?? "gruppen"}`
      : `${selectedIds.length} lokationer`;
  const scopeSummary = currentLevel === "organization"
    ? "Organisation"
    : currentLevel === "market"
      ? `Marked · ${currentParentName ?? "Vælg marked"}`
      : currentLevel === "operator"
        ? `Operatør · ${currentParentName ?? "Vælg operatør"}`
        : "Lokation";
  const triggerLabel = `${scopeSummary} · ${selectedSummary}`;

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
              <DropdownMenuLabel>Omfang</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={levelValue} onValueChange={selectScopeValue}>
                <DropdownMenuRadioItem value="organization">Organisation</DropdownMenuRadioItem>
                {marketOptions.map((market) => <DropdownMenuRadioItem key={market.id} value={`market:${market.id}`} className="min-w-0"><span className="min-w-0 truncate">Marked · {market.name}</span></DropdownMenuRadioItem>)}
                {operatorOptions.map((operator) => <DropdownMenuRadioItem key={operator.id} value={`operator:${operator.id}`} className="min-w-0"><span className="min-w-0 truncate">Operatør · {operator.name}</span></DropdownMenuRadioItem>)}
                <DropdownMenuRadioItem value="location">Lokation</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup className="max-h-64 overflow-y-auto">
              <DropdownMenuLabel>{allSelected ? (currentLevel === "organization" ? "Alle lokationer" : `Alle i ${currentParentName ?? "gruppen"}`) : `${selectedIds.length} valgte lokationer`}</DropdownMenuLabel>
              {currentLevel !== "location" ? (
                <DropdownMenuCheckboxItem checked={allSelected} onCheckedChange={(checked) => { if (checked) selectAllLocations(); }}>
                  {currentLevel === "organization" ? "Alle lokationer" : `Alle i ${currentParentName ?? "gruppen"}`}
                </DropdownMenuCheckboxItem>
              ) : null}
              {selectedLocations.map((location) => (
                <DropdownMenuCheckboxItem
                  key={location.id}
                  checked={selectedIds.includes(location.id)}
                  disabled={selectedIds.includes(location.id) && selectedIds.length <= 1}
                  onCheckedChange={(checked) => toggleLocation(location.id, checked)}
                >
                  <span className="min-w-0 truncate">{location.name}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
