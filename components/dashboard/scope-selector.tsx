"use client";

import { GitCompareArrowsIcon, MapPinIcon } from "lucide-react";
import { useQuery } from "convex/react";
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
  const lockedToSingle = availableLocations.length === 1;
  const currentLevel: ScopeLevel = scope.level ?? (
    scope.locationIds?.length === 1 ? "location" : "organization"
  );
  const marketOptions = (scopeOptions?.markets ?? []).filter((market) =>
    optionLocations.some((location) => location.marketId === market.id),
  );
  const operatorOptions = (scopeOptions?.operators ?? []).filter((operator) =>
    optionLocations.some((location) => location.operatorId === operator.id),
  );

  const currentParentId = scope.parentId ?? (
    currentLevel === "location" && scope.locationIds?.length === 1
      ? scope.locationIds[0]
      : undefined
  );
  const selectedLocations = optionLocations.filter((location) => {
    if (currentLevel === "market") return location.marketId === currentParentId;
    if (currentLevel === "operator") return location.operatorId === currentParentId;
    if (currentLevel === "location") {
      return currentParentId ? location.id === currentParentId : true;
    }
    return true;
  });
  const selectedIds = (scope.locationIds ?? selectedLocations.map((location) => location.id)).filter(
    (id) => selectedLocations.some((location) => location.id === id),
  );
  const currentMode = lockedToSingle ? "aggregate" : scope.mode;
  const aggregateValue = lockedToSingle
    ? availableLocations[0]?.id ?? "all"
    : currentLevel === "organization"
      ? "organization"
      : currentParentId ?? "";
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

  function setMode(value: string[]) {
    const mode = value[0];
    if (lockedToSingle) {
      if (availableLocations[0]) {
        onChange({
          mode: "aggregate",
          locationIds: [availableLocations[0].id],
          level: "location",
          parentId: availableLocations[0].id,
        });
      }
      return;
    }
    if (mode === "aggregate") {
      onChange({
        ...scope,
        mode: "aggregate",
        locationIds: null,
      });
    } else if (mode === "compare") {
      const ids = selectedIds.length >= 2
        ? selectedIds
        : selectedLocations.slice(0, 2).map((location) => location.id);
      if (ids.length >= 2) {
        onChange({ ...scope, mode: "compare", locationIds: ids });
      }
    }
  }

  function toggleLocation(id: Id<"locations">, checked: boolean) {
    const next = checked
      ? [...selectedIds, id]
      : selectedIds.filter((item) => item !== id);
    if (next.length >= 2) {
      onChange({ ...scope, mode: "compare", locationIds: next });
    }
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

  function selectParent(value: string | null) {
    if (currentLevel === "organization" || !value) return;
    onChange(scopeFor(currentLevel, value));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup value={[currentMode]} onValueChange={setMode} variant="outline" size="lg" spacing={0}>
        <ToggleGroupItem value="aggregate" className="min-h-11">
          <MapPinIcon data-icon="inline-start" />
          Lokation
        </ToggleGroupItem>
        {!lockedToSingle ? <ToggleGroupItem value="compare" className="min-h-11" disabled={selectedLocations.length < 2}>
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
      ) : (
        <>
          <Select
            items={[
              { value: "organization", label: "Organisation" },
              ...marketOptions.map((market) => ({ value: `market:${market.id}`, label: `Marked · ${market.name}` })),
              ...operatorOptions.map((operator) => ({ value: `operator:${operator.id}`, label: `Operatør · ${operator.name}` })),
              { value: "location", label: "Lokation" },
            ]}
            value={levelValue}
            onValueChange={(value) => {
              if (!value) return;
              if (value.startsWith("market:")) {
                onChange(scopeFor("market", value.slice("market:".length)));
              } else if (value.startsWith("operator:")) {
                onChange(scopeFor("operator", value.slice("operator:".length)));
              } else {
                selectLevel(value);
              }
            }}
          >
            <SelectTrigger aria-label="Scope-niveau" className="h-11! w-56 min-w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="organization">Organisation</SelectItem>
                {marketOptions.map((market) => <SelectItem key={market.id} value={`market:${market.id}`}>Marked · {market.name}</SelectItem>)}
                {operatorOptions.map((operator) => <SelectItem key={operator.id} value={`operator:${operator.id}`}>Operatør · {operator.name}</SelectItem>)}
                <SelectItem value="location">Lokation</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          {currentLevel !== "organization" && currentMode === "aggregate" ? (
            <Select
              items={
                currentLevel === "market"
                  ? marketOptions.map((market) => ({ value: market.id, label: market.name }))
                  : currentLevel === "operator"
                    ? operatorOptions.map((operator) => ({ value: operator.id, label: operator.name }))
                    : optionLocations.map((location) => ({ value: location.id, label: location.name }))
              }
              value={aggregateValue}
              onValueChange={selectParent}
            >
              <SelectTrigger aria-label="Scope" className="h-11! w-56 min-w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {currentLevel === "market"
                    ? marketOptions.map((market) => <SelectItem key={market.id} value={market.id}>{market.name}</SelectItem>)
                    : currentLevel === "operator"
                      ? operatorOptions.map((operator) => <SelectItem key={operator.id} value={operator.id}>{operator.name}</SelectItem>)
                      : optionLocations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : null}
          {currentMode === "compare" ? (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="outline" size="lg" className="min-h-11" />}>
                {selectedIds.length} lokationer
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Vælg lokationer</DropdownMenuLabel>
                  {selectedLocations.map((location) => (
                    <DropdownMenuCheckboxItem
                      key={location.id}
                      checked={selectedIds.includes(location.id)}
                      disabled={selectedIds.includes(location.id) && selectedIds.length <= 2}
                      onCheckedChange={(checked) => toggleLocation(location.id, checked)}
                    >
                      {location.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </>
      )}
    </div>
  );
}
