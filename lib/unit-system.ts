// Shared standard-unit definitions. Imported by the client and Convex.

export type ProductType = "dry" | "wet" | "piece";
export type UnitSystemId = "metric" | "imperial";

export type UnitSystemSettings = {
  mode: "metric" | "imperial" | "custom";
  drySystem: UnitSystemId;
  wetSystem: UnitSystemId;
};

export const DEFAULT_UNIT_SYSTEM: UnitSystemSettings = {
  mode: "metric",
  drySystem: "metric",
  wetSystem: "metric",
};

export function resolveUnitSystem(
  settings: UnitSystemSettings | null | undefined,
): { dry: UnitSystemId; wet: UnitSystemId } {
  const value = settings ?? DEFAULT_UNIT_SYSTEM;
  if (value.mode === "metric") return { dry: "metric", wet: "metric" };
  if (value.mode === "imperial") return { dry: "imperial", wet: "imperial" };
  return { dry: value.drySystem, wet: value.wetSystem };
}

export type StandardUnitDef = {
  key: string;
  name: string;
  // How many standard units one of this unit contains.
  factorToStandard: number;
  isStandard: boolean;
};

const DRY_METRIC: StandardUnitDef[] = [
  { key: "g", name: "g", factorToStandard: 1, isStandard: true },
  { key: "kg", name: "kg", factorToStandard: 1000, isStandard: false },
];
const DRY_IMPERIAL: StandardUnitDef[] = [
  { key: "oz", name: "oz", factorToStandard: 1, isStandard: true },
  { key: "lb", name: "lb", factorToStandard: 16, isStandard: false },
];
const WET_METRIC: StandardUnitDef[] = [
  { key: "ml", name: "ml", factorToStandard: 1, isStandard: true },
  { key: "l", name: "L", factorToStandard: 1000, isStandard: false },
];
const WET_IMPERIAL: StandardUnitDef[] = [
  { key: "floz", name: "fl oz", factorToStandard: 1, isStandard: true },
  { key: "cup", name: "cup", factorToStandard: 8, isStandard: false },
  { key: "pint", name: "pint", factorToStandard: 16, isStandard: false },
  { key: "quart", name: "quart", factorToStandard: 32, isStandard: false },
  { key: "gallon", name: "gallon", factorToStandard: 128, isStandard: false },
];
const PIECE: StandardUnitDef[] = [
  { key: "stk", name: "stk", factorToStandard: 1, isStandard: true },
];

export function standardUnitsFor(
  type: ProductType,
  settings: UnitSystemSettings | null | undefined,
): StandardUnitDef[] {
  const systems = resolveUnitSystem(settings);
  if (type === "dry")
    return systems.dry === "metric" ? DRY_METRIC : DRY_IMPERIAL;
  if (type === "wet")
    return systems.wet === "metric" ? WET_METRIC : WET_IMPERIAL;
  return PIECE;
}

export function standardUnitFor(
  type: ProductType,
  settings: UnitSystemSettings | null | undefined,
): StandardUnitDef {
  return standardUnitsFor(type, settings).find((unit) => unit.isStandard)!;
}

export function systemKeyFor(type: ProductType, key: string) {
  return `${type}:${key}`;
}

export function normalizeUnitName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("da");
}

// Canonical size of one known unit, in grams (dry) or milliliters (wet).
const GRAMS_PER_OZ = 28.349523125;
const ML_PER_FLOZ = 29.5735295625;

type KnownMeasure = { type: "dry" | "wet" | "piece"; canonical: number };

const KNOWN_MEASURES = new Map<string, KnownMeasure>([
  ["g", { type: "dry", canonical: 1 }],
  ["gram", { type: "dry", canonical: 1 }],
  ["kg", { type: "dry", canonical: 1000 }],
  ["kilo", { type: "dry", canonical: 1000 }],
  ["kilogram", { type: "dry", canonical: 1000 }],
  ["mg", { type: "dry", canonical: 0.001 }],
  ["oz", { type: "dry", canonical: GRAMS_PER_OZ }],
  ["ounce", { type: "dry", canonical: GRAMS_PER_OZ }],
  ["ounces", { type: "dry", canonical: GRAMS_PER_OZ }],
  ["lb", { type: "dry", canonical: 16 * GRAMS_PER_OZ }],
  ["lbs", { type: "dry", canonical: 16 * GRAMS_PER_OZ }],
  ["pound", { type: "dry", canonical: 16 * GRAMS_PER_OZ }],
  ["pounds", { type: "dry", canonical: 16 * GRAMS_PER_OZ }],
  ["ml", { type: "wet", canonical: 1 }],
  ["milliliter", { type: "wet", canonical: 1 }],
  ["cl", { type: "wet", canonical: 10 }],
  ["dl", { type: "wet", canonical: 100 }],
  ["l", { type: "wet", canonical: 1000 }],
  ["liter", { type: "wet", canonical: 1000 }],
  ["litre", { type: "wet", canonical: 1000 }],
  ["fl oz", { type: "wet", canonical: ML_PER_FLOZ }],
  ["floz", { type: "wet", canonical: ML_PER_FLOZ }],
  ["fluid ounce", { type: "wet", canonical: ML_PER_FLOZ }],
  ["cup", { type: "wet", canonical: 8 * ML_PER_FLOZ }],
  ["pint", { type: "wet", canonical: 16 * ML_PER_FLOZ }],
  ["quart", { type: "wet", canonical: 32 * ML_PER_FLOZ }],
  ["gallon", { type: "wet", canonical: 128 * ML_PER_FLOZ }],
  ["stk", { type: "piece", canonical: 1 }],
  ["styk", { type: "piece", canonical: 1 }],
  ["stykker", { type: "piece", canonical: 1 }],
  ["pcs", { type: "piece", canonical: 1 }],
  ["pc", { type: "piece", canonical: 1 }],
  ["piece", { type: "piece", canonical: 1 }],
  ["pieces", { type: "piece", canonical: 1 }],
]);

export function knownMeasure(name: string): KnownMeasure | null {
  return KNOWN_MEASURES.get(normalizeUnitName(name)) ?? null;
}

// Canonical size of the org standard unit for a type (grams / ml / pieces).
function standardCanonical(
  type: ProductType,
  settings: UnitSystemSettings | null | undefined,
) {
  const def = standardUnitFor(type, settings);
  return KNOWN_MEASURES.get(normalizeUnitName(def.name))!.canonical;
}

// Suggests product type and "1 old default = X standard units" for migration.
export function suggestMigration(
  defaultUnitName: string,
  settings: UnitSystemSettings | null | undefined,
): { productType: ProductType; factorToStandard: number } | null {
  const measure = knownMeasure(defaultUnitName);
  if (!measure) return null;
  return {
    productType: measure.type,
    factorToStandard:
      measure.canonical / standardCanonical(measure.type, settings),
  };
}

export type UnitNameIssue =
  | { kind: "duplicate-standard"; standardName: string }
  | { kind: "numeric-prefix"; measureName: string };

const NUMERIC_PREFIX = /^(\d+(?:[.,]\d+)?)\s*(.+)$/;

// Flags names that restate a built-in unit, e.g. "kg" or "5g" / "15 kg".
export function checkUnitName(
  name: string,
  type: ProductType | null,
  settings: UnitSystemSettings | null | undefined,
): UnitNameIssue | null {
  const normalized = normalizeUnitName(name);
  if (!normalized) return null;

  if (type) {
    const duplicate = standardUnitsFor(type, settings).find(
      (unit) =>
        normalizeUnitName(unit.name) === normalized ||
        knownMeasure(name)?.canonical ===
          KNOWN_MEASURES.get(normalizeUnitName(unit.name))?.canonical &&
          knownMeasure(name)?.type === type,
    );
    if (duplicate) {
      return { kind: "duplicate-standard", standardName: duplicate.name };
    }
  } else if (knownMeasure(name)) {
    return { kind: "duplicate-standard", standardName: name.trim() };
  }

  const match = NUMERIC_PREFIX.exec(normalized);
  if (match) {
    const measure = knownMeasure(match[2]);
    if (measure && (!type || measure.type === type)) {
      return { kind: "numeric-prefix", measureName: match[2] };
    }
  }
  return null;
}

export function unitNameIssueMessage(issue: UnitNameIssue): string {
  if (issue.kind === "duplicate-standard") {
    return `Enheden ${issue.standardName} findes allerede som standardenhed og kan bruges direkte. Giv enheden et andet navn, hvis den skal betyde noget andet.`;
  }
  return `Undgå navne som et tal foran en standardenhed. Giv enheden et sigende navn i stedet, for eksempel "Pose" eller "Kasse", og angiv mængden via omregningen.`;
}
