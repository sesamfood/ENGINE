// Container weights are stored in grams and capacities in milliliters.
import {
  knownMeasure,
  standardUnitsFor,
  type UnitSystemSettings,
} from "./unit-system";

// The org's units for a container weight (dry) or capacity (wet), with their
// size in grams or milliliters.
export function measureUnits(
  type: "dry" | "wet",
  settings: UnitSystemSettings | null | undefined,
) {
  return standardUnitsFor(type, settings).map((unit) => ({
    name: unit.name,
    size: knownMeasure(unit.name)!.canonical,
  }));
}

// Shows a gram or milliliter amount in the largest unit it fills, e.g. 1,2 kg.
export function formatMeasure(
  amount: number,
  units: Array<{ name: string; size: number }>,
) {
  const unit =
    [...units].reverse().find((item) => amount >= item.size) ?? units[0];
  return `${(amount / unit.size).toLocaleString("da-DK", {
    maximumFractionDigits: 3,
  })} ${unit.name}`;
}

type ProductUnit = { name: string; factorToDefault: number };

// Grams in one of the unit, or null when the product has no weight unit.
export function gramsPerUnit(units: ProductUnit[], unit: ProductUnit) {
  const weightUnit = units.find(
    (item) => knownMeasure(item.name)?.type === "dry",
  );
  if (!weightUnit) return null;
  return (
    (knownMeasure(weightUnit.name)!.canonical / weightUnit.factorToDefault) *
    unit.factorToDefault
  );
}

// Product containers that can be subtracted in the unit, weighed in the unit.
export function containerTares<T extends { weightGrams: number }>(
  units: ProductUnit[],
  unit: ProductUnit,
  containers: T[],
) {
  const grams = gramsPerUnit(units, unit);
  if (!grams) return [];
  return containers.map((container) => ({
    ...container,
    tare: container.weightGrams / grams,
  }));
}
