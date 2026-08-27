import type { Doc, Id } from "../_generated/dataModel";
import { normalizeWoltText } from "./woltApi";

export type WoltItemIdentifiers = {
  gtin?: string;
  posId?: string;
  sku?: string;
  name: string;
};

export type WoltMappingResolution =
  | { kind: "mapped"; mapping: Doc<"woltProductMappings"> }
  | { kind: "conflict"; mappingIds: Id<"woltProductMappings">[] }
  | { kind: "unmapped" };

export function normalizeWoltMatchValue(
  matchType: Doc<"woltProductMappings">["matchType"],
  value: string,
) {
  const trimmed = value.trim();
  return matchType === "name" ? normalizeWoltText(trimmed) : trimmed;
}

export function woltIdentifierCandidates(item: WoltItemIdentifiers) {
  return [
    ...(item.gtin ? [{ matchType: "gtin" as const, matchValue: item.gtin.trim() }] : []),
    ...(item.posId ? [{ matchType: "posId" as const, matchValue: item.posId.trim() }] : []),
    ...(item.sku ? [{ matchType: "sku" as const, matchValue: item.sku.trim() }] : []),
    { matchType: "name" as const, matchValue: normalizeWoltText(item.name) },
  ].filter((candidate) => candidate.matchValue.length > 0);
}

export function resolveWoltMapping(
  mappings: readonly Doc<"woltProductMappings">[],
  locationId: Id<"locations">,
  item: WoltItemIdentifiers,
): WoltMappingResolution {
  for (const candidate of woltIdentifierCandidates(item)) {
    for (const mappingLocation of [locationId, null] as const) {
      const matches = mappings.filter(
        (mapping) =>
          mapping.locationId === mappingLocation &&
          mapping.matchType === candidate.matchType &&
          mapping.matchValue === candidate.matchValue,
      );
      const productIds = new Set(matches.map((mapping) => mapping.productId));
      if (productIds.size > 1) {
        return { kind: "conflict", mappingIds: matches.map((mapping) => mapping._id) };
      }
      if (matches[0]) return { kind: "mapped", mapping: matches[0] };
    }
  }
  return { kind: "unmapped" };
}
