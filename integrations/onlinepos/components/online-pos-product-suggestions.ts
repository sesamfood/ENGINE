import { normalizeProductSearch, searchProducts } from "@/lib/product-search";

export type OnlinePosProductSuggestion = {
  id: number;
  name: string;
  groupName: string;
};

export function getOnlinePosProductSuggestions(
  products: readonly OnlinePosProductSuggestion[],
  productName: string,
) {
  const exactMatches = products.filter(
    (product) =>
      normalizeProductSearch(product.name) ===
      normalizeProductSearch(productName),
  );

  if (exactMatches.length > 0) {
    return { hasExactMatch: true, suggestions: exactMatches };
  }

  const suggestions = normalizeProductSearch(productName)
    ? searchProducts(products, productName, (product) => ({
        name: product.name,
        categoryPath: product.groupName,
      })).slice(0, 3)
    : [];

  return { hasExactMatch: false, suggestions };
}
