export function normalizeProductSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("da-DK")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function subsequenceScore(value: string, search: string) {
  if (!search) return 0;
  if (value === search) return 0;
  if (value.startsWith(search)) return 1;
  if (value.includes(search)) return 2;
  if (
    search
      .split(" ")
      .every((term) => value.split(" ").some((word) => word.startsWith(term)))
  )
    return 3;
  let cursor = 0;
  for (const character of value) {
    if (character === search[cursor]) cursor += 1;
  }
  return cursor === search.length ? 5 : null;
}

const synonymGroups = [
  ["kikært", "kikærter", "chickpea", "chickpeas", "garbanzo"],
  ["aubergine", "eggplant"],
  ["squash", "courgette", "zucchini"],
  ["koriander", "cilantro", "coriander"],
  ["kylling", "chicken"],
  ["oksekød", "beef"],
  ["svinekød", "pork"],
  ["kartoffel", "kartofler", "potato", "potatoes"],
  ["tomat", "tomater", "tomato", "tomatoes"],
  ["løg", "onion", "onions"],
  ["hvidløg", "garlic"],
  ["mælk", "milk"],
  ["smør", "butter"],
  ["ost", "cheese"],
  ["æg", "egg", "eggs"],
  ["mel", "flour"],
  ["sukker", "sugar"],
  ["olie", "oil"],
  ["rapsolie", "canola", "canola oil", "rapeseed oil"],
  ["ris", "rice"],
] as const;
const synonyms = new Map(
  synonymGroups.flatMap((group) =>
    group.map(
      (term) =>
        [
          normalizeProductSearch(term),
          normalizeProductSearch(group[0]),
        ] as const,
    ),
  ),
);
const phraseSynonyms = [...synonyms]
  .filter(([term]) => term.includes(" "))
  .sort(([left], [right]) => right.length - left.length);

function synonymText(value: string) {
  for (const [phrase, replacement] of phraseSynonyms) {
    value = value.replace(new RegExp(`\\b${phrase}\\b`, "g"), replacement);
  }
  return value
    .split(" ")
    .map((term) => synonyms.get(term) ?? term)
    .join(" ");
}

function editDistance(left: string, right: string) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }

  return previous[right.length];
}

export function productNameSearchScore(name: string, search: string) {
  const normalizedName = normalizeProductSearch(name);
  const normalizedSearch = normalizeProductSearch(search.slice(0, 200));
  const direct = subsequenceScore(normalizedName, normalizedSearch);
  if (direct !== null) return direct;
  const synonymMatch = subsequenceScore(
    synonymText(normalizedName),
    synonymText(normalizedSearch),
  );
  if (synonymMatch !== null) return 4 + synonymMatch / 10;
  const words = normalizedName.split(" ");
  let score = 6;
  for (const term of normalizedSearch.split(" ")) {
    if (term.length < 3) return null;
    const tolerance = Math.max(1, Math.floor(term.length / 3));
    let best = Number.POSITIVE_INFINITY;
    for (const word of words) {
      for (
        let length = Math.max(1, term.length - tolerance);
        length <= Math.min(word.length, term.length + tolerance);
        length += 1
      ) {
        best = Math.min(best, editDistance(term, word.slice(0, length)));
      }
    }
    if (best > tolerance) return null;
    score += best;
  }
  return Math.min(score, 19);
}

export function productSearchScore(
  name: string,
  categoryPath: string,
  search: string,
) {
  const nameScore = productNameSearchScore(name, search);
  const categoryMatch = productNameSearchScore(categoryPath, search);
  const categoryScore = categoryMatch === null ? null : 20 + categoryMatch;
  if (nameScore === null && categoryScore === null && categoryPath) {
    const combinedScore = productNameSearchScore(
      `${name} ${categoryPath}`,
      search,
    );
    return combinedScore === null ? null : 40 + combinedScore;
  }
  if (nameScore === null) return categoryScore;
  if (categoryScore === null) return nameScore;
  return Math.min(nameScore, categoryScore);
}

export function searchProducts<T>(
  products: readonly T[],
  search: string,
  fields: (product: T) => { name: string; categoryPath?: string },
) {
  if (!normalizeProductSearch(search)) return [...products];
  return products
    .flatMap((product) => {
      const { name, categoryPath = "" } = fields(product);
      const score = productSearchScore(name, categoryPath, search);
      return score === null ? [] : [{ product, name, score }];
    })
    .sort(
      (left, right) =>
        left.score - right.score || left.name.localeCompare(right.name, "da"),
    )
    .map(({ product }) => product);
}
