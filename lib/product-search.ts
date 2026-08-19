function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("da-DK")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fuzzyScore(value: string, search: string) {
  if (!search) return 0;
  if (value.startsWith(search)) return 0;
  if (value.includes(search)) return 1;
  let cursor = 0;
  for (const character of value) {
    if (character === search[cursor]) cursor += 1;
  }
  return cursor === search.length ? 2 : null;
}

export function productSearchScore(
  name: string,
  categoryPath: string,
  search: string,
) {
  const normalizedSearch = normalize(search);
  if (!normalizedSearch) return 0;
  const nameScore = fuzzyScore(normalize(name), normalizedSearch);
  const categoryScore = fuzzyScore(normalize(categoryPath), normalizedSearch);
  if (nameScore === null) return categoryScore;
  if (categoryScore === null) return nameScore;
  return Math.min(nameScore, categoryScore);
}
