export type OnlinePosProductSuggestion = {
  id: number;
  name: string;
  groupName: string;
};

function normalizedProductName(value: string) {
  return value.trim().toLocaleLowerCase("da");
}

function productNameSearchScore(productName: string, query: string) {
  const normalizedQuery = normalizedProductName(query);
  if (!normalizedQuery) return 0;

  const normalizedName = normalizedProductName(productName);
  const queryWords = normalizedQuery.split(/\s+/);
  const matchingWords = queryWords.filter((word) =>
    normalizedName.includes(word),
  ).length;

  if (!matchingWords) return 0;

  return (
    matchingWords * 10 +
    matchingWords / queryWords.length +
    (normalizedName.startsWith(normalizedQuery) ? 5 : 0) -
    normalizedName.length / 1000
  );
}

export function getOnlinePosProductSuggestions(
  products: readonly OnlinePosProductSuggestion[],
  productName: string,
) {
  const exactMatch = products.find(
    (product) =>
      normalizedProductName(product.name) === normalizedProductName(productName),
  );

  if (exactMatch) {
    return { exactMatch, suggestions: [exactMatch] };
  }

  const suggestions = products
    .map((product) => ({
      product,
      score: productNameSearchScore(product.name, productName),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ product }) => product);

  return { exactMatch: undefined, suggestions };
}
