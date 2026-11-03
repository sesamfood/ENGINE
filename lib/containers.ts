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

const DECIMAL_INPUT = /^\d+(?:[.,]\d+)?$/;

// Parses "0,45" or "0.45"; anything else is NaN.
export function parseDecimal(value: string) {
  const normalized = value.trim();
  return DECIMAL_INPUT.test(normalized)
    ? Number(normalized.replace(",", "."))
    : Number.NaN;
}
