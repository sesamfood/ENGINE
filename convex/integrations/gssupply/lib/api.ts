import { ConvexError, v, type Infer } from "convex/values";

const MAX_PRODUCTS = 5000;
const REQUEST_TIMEOUT_MS = 15_000;
const ALLOWED_HOSTS = new Set(["www.gs-supply.dk", "gs-supply.dk"]);

export const gsSupplyCatalogProductValidator = v.object({
  productNumber: v.string(),
  name: v.string(),
  category: v.string(),
  unitAmount: v.number(),
  minOrder: v.number(),
  price: v.number(),
  pictureUrl: v.union(v.string(), v.null()),
  availableQuantity: v.number(),
  leadTimeDays: v.number(),
});

export type GsSupplyCatalogProduct = Infer<
  typeof gsSupplyCatalogProductValidator
>;

export function parseCatalogUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ConvexError("Indtast et gyldigt link til GS Supply-kataloget");
  }
  if (
    url.protocol !== "https:" ||
    !ALLOWED_HOSTS.has(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    !url.pathname.startsWith("/api/") ||
    !url.searchParams.get("api_key")
  ) {
    throw new ConvexError(
      "Linket skal være et https-link til gs-supply.dk/api med en api_key",
    );
  }
  return url;
}

export function catalogUrlPreview(url: URL) {
  const preview = new URL(url);
  preview.searchParams.set("api_key", "••••");
  return decodeURIComponent(preview.toString());
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseProduct(value: unknown): GsSupplyCatalogProduct | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const productNumber = text(row.productNumber);
  const name = text(row.productName);
  const unitAmount = number(row.unitAmount);
  const price = number(row.price);
  if (!productNumber || !name || unitAmount === null || price === null) {
    return null;
  }
  const picture = text(row.picture);
  return {
    productNumber: productNumber.slice(0, 50),
    name: name.slice(0, 300),
    category: text(row.category).slice(0, 300),
    unitAmount,
    minOrder: Math.max(1, number(row.minOrder) ?? 1),
    price,
    pictureUrl: picture.startsWith("https://") ? picture : null,
    availableQuantity: number(row.availableQuantity) ?? 0,
    leadTimeDays: Math.max(0, number(row.customerLeadTime) ?? 0),
  };
}

export async function fetchGsSupplyCatalog(url: URL) {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ConvexError("GS Supply svarede ikke. Prøv igen om lidt");
  }
  if (response.status === 401 || response.status === 403) {
    throw new ConvexError("GS Supply afviste API-nøglen. Kontrollér linket");
  }
  if (!response.ok) {
    throw new ConvexError(
      `GS Supply svarede med status ${response.status}. Prøv igen om lidt`,
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ConvexError("GS Supply returnerede et ugyldigt svar");
  }
  const data =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (data.status !== "success" || !Array.isArray(data.productsData)) {
    throw new ConvexError("GS Supply returnerede ikke et produktkatalog");
  }
  if (data.productsData.length > MAX_PRODUCTS) {
    throw new ConvexError(
      `GS Supply-kataloget har mere end ${MAX_PRODUCTS} produkter`,
    );
  }
  const products = new Map<string, GsSupplyCatalogProduct>();
  for (const row of data.productsData) {
    const product = parseProduct(row);
    if (product && !products.has(product.productNumber)) {
      products.set(product.productNumber, product);
    }
  }
  return [...products.values()];
}
