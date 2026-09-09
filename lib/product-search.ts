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

function subsequenceScore(value: string, search: string) {
  if (!search) return 0;
  if (value.startsWith(search)) return 0;
  if (value.includes(search)) return 1;
  let cursor = 0;
  for (const character of value) {
    if (character === search[cursor]) cursor += 1;
  }
  return cursor === search.length ? 2 : null;
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
  const normalizedName = normalize(name);
  const normalizedSearch = normalize(search);
  const direct = subsequenceScore(normalizedName, normalizedSearch);
  if (direct !== null) return direct;
  const words = normalizedName.split(" ");
  let score = 3;
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
  return score;
}

export function productSearchScore(
  name: string,
  categoryPath: string,
  search: string,
) {
  const nameScore = productNameSearchScore(name, search);
  const categoryScore = productNameSearchScore(categoryPath, search);
  if (nameScore === null) return categoryScore;
  if (categoryScore === null) return nameScore;
  return Math.min(nameScore, categoryScore);
}
