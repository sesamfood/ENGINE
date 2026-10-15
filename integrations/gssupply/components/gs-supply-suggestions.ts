import {
  normalizeProductSearch,
  productNameSearchScore,
} from "@/lib/product-search";

const PACK_UNIT =
  /\b(kasse|karton|pakke|pk|colli|kolli|rulle|saek|spand|dunk|bakke|aeske|pose)/;
const MAX_SUGGESTIONS = 3;

/** Lower is better. GS names are long, so the Engine name is searched within them. */
function matchScore(catalogName: string, productName: string) {
  const direct = productNameSearchScore(catalogName, productName);
  if (direct !== null) return direct;
  const catalogWords = new Set(normalizeProductSearch(catalogName).split(" "));
  const words = normalizeProductSearch(productName)
    .split(" ")
    .filter((word) => word.length >= 3);
  if (!words.length) return null;
  const matched = words.filter((word) =>
    [...catalogWords].some((catalogWord) => catalogWord.startsWith(word)),
  ).length;
  return matched / words.length >= 0.5 ? 10 - matched / words.length : null;
}

function best<T>(items: readonly T[], score: (item: T) => number | null) {
  return items
    .flatMap((item) => {
      const value = score(item);
      return value === null ? [] : [{ item, value }];
    })
    .sort((left, right) => left.value - right.value)
    .slice(0, MAX_SUGGESTIONS)
    .map(({ item }) => item);
}

export function suggestProducts<T extends { name: string }>(
  products: readonly T[],
  catalogName: string,
) {
  return best(products, (product) => matchScore(catalogName, product.name));
}

export function suggestCatalogItems<T extends { name: string }>(
  catalog: readonly T[],
  productName: string,
) {
  return best(catalog, (item) => matchScore(item.name, productName));
}

/** The product unit that matches one pack, when exactly one does. */
export function suggestUnitId<
  T extends { id: string; factorToDefault: number },
>(units: readonly T[], unitAmount: number | null | undefined): T["id"] | null {
  if (!unitAmount) return null;
  const matches = units.filter((unit) => unit.factorToDefault === unitAmount);
  return matches.length === 1 ? matches[0]!.id : null;
}

/** Existing units that are likely pack units, most used by other links first. */
export function suggestNewUnits<T extends { id: string; name: string }>(
  units: readonly T[],
  linkUnitCounts: ReadonlyMap<string, number>,
) {
  return [...units]
    .filter(
      (unit) =>
        linkUnitCounts.has(unit.id) ||
        PACK_UNIT.test(normalizeProductSearch(unit.name)),
    )
    .sort(
      (left, right) =>
        (linkUnitCounts.get(right.id) ?? 0) -
        (linkUnitCounts.get(left.id) ?? 0),
    )
    .slice(0, MAX_SUGGESTIONS);
}
