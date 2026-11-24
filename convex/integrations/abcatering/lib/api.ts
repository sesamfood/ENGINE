import { ConvexError } from "convex/values";
import type { CatalogItem } from "../../supplierCatalog";

const BASE_URL = "https://abcatering.dk/api/external";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_PRODUCTS = 5000;
// Product ids per gs1 request; longer URLs are rejected.
const GS1_BATCH_SIZE = 50;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** The access token expired or was revoked; a new one fixes it. */
export class AbTokenExpiredError extends Error {}

export type AbCustomer = {
  department: string;
  customerNo: string;
  customerName: string;
  validationKey: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

// AB sends amounts as strings such as "1,155.84".
function amount(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : Number(text(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

async function request(path: string, init: RequestInit) {
  try {
    return await fetch(`${BASE_URL}/${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ConvexError("AB Catering svarede ikke. Prøv igen om lidt");
  }
}

async function json(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ConvexError("AB Catering returnerede et ugyldigt svar");
  }
}

export async function validateLogin(username: string, password: string) {
  const response = await request("profile/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (response.status === 401) {
    throw new ConvexError("AB Catering afviste brugernavnet eller adgangskoden");
  }
  if (!response.ok) {
    throw new ConvexError(
      `AB Catering svarede med status ${response.status}. Prøv igen om lidt`,
    );
  }
  const body = await json(response);
  const customers = (Array.isArray(body) ? body : []).flatMap(
    (row): AbCustomer[] => {
      if (!row || typeof row !== "object") return [];
      const record = row as Record<string, unknown>;
      const customer = {
        department: text(record.department),
        customerNo: text(record.customerNo),
        customerName: text(record.customerName),
        validationKey: text(record.validationKey),
      };
      return customer.customerNo && customer.validationKey ? [customer] : [];
    },
  );
  if (!customers.length) {
    throw new ConvexError("AB Catering-brugeren har ingen kunder");
  }
  return customers;
}

export async function requestAccessToken(apiKey: string, validationKey: string) {
  const response = await request("oauth/token", {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: new URLSearchParams({
      grant_type: "urn:dc:oauth:grant-type:validation-key",
      dc_validation_key: validationKey,
    }),
  });
  const body = await json(response).catch(() => ({}));
  const data =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (data.error === "invalid_grant") {
    throw new ConvexError(
      "Login til AB Catering er udløbet. Forbind igen med brugernavn og adgangskode",
    );
  }
  if (response.status === 401) {
    throw new ConvexError("AB Catering afviste API-nøglen");
  }
  const accessToken = text(data.access_token);
  const expiresIn = amount(data.expires_in) ?? 0;
  if (!response.ok || !accessToken || expiresIn <= 0) {
    throw new ConvexError(
      `AB Catering kunne ikke udstede en adgangsnøgle (status ${response.status})`,
    );
  }
  return { accessToken, expiresAt: Date.now() + expiresIn * 1000 };
}

async function authorizedRequest(
  path: string,
  accessToken: string,
  body?: unknown,
) {
  const response = await request(path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401) {
    if (response.headers.get("www-authenticate")?.includes("invalid_token")) {
      throw new AbTokenExpiredError();
    }
    throw new ConvexError(
      "AB Catering har lukket adgangen til API'et. Kontakt AB Catering",
    );
  }
  if (response.status === 429) {
    throw new ConvexError("AB Catering modtager for mange forespørgsler. Prøv igen om lidt");
  }
  return response;
}

/** One catalog item per product and order unit, so each unit can be linked and ordered. */
function parseProduct(value: unknown): CatalogItem[] {
  if (!value || typeof value !== "object") return [];
  const row = value as Record<string, unknown>;
  const productId = text(row.productId);
  const description = text(row.description);
  const basePrice = amount(row.basePrice);
  if (!/^\d{1,20}$/.test(productId) || !description || row.active === false) {
    return [];
  }
  return (Array.isArray(row.units) ? row.units : []).flatMap((unit) => {
    if (!unit || typeof unit !== "object") return [];
    const record = unit as Record<string, unknown>;
    const unitName = text(record.name);
    const price = amount(record.unitPrice);
    if (!/^[\p{L}\d]{1,20}$/u.test(unitName) || price === null) return [];
    const unitDescription = text(record.description);
    // Base units (kg, l or pieces) per order unit.
    const perUnit = amount(record.amountPerUnit);
    const unitAmount =
      perUnit && perUnit > 0
        ? perUnit
        : basePrice && basePrice > 0
          ? Math.round((price / basePrice) * 1000) / 1000
          : (amount(record.netWeight) ?? 0);
    return [
      {
        productNumber: `${productId} ${unitName}`,
        name: `${description} (${unitName}${unitDescription ? ` ${unitDescription}` : ""})`.slice(0, 300),
        category: text(row.group).slice(0, 300),
        unitAmount,
        minOrder: 1,
        price,
        pictureUrl: null,
        availableQuantity: null,
        leadTimeDays: 0,
      },
    ];
  });
}

// GS1 pictures come from many supplier hosts; some still link over http.
function pictureUrl(value: unknown) {
  try {
    const url = new URL(text(value));
    if (url.protocol === "http:") url.protocol = "https:";
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Picture URLs by product id from AB's GS1 product data. */
async function fetchPictures(accessToken: string, productIds: string[]) {
  const batches = [];
  for (let index = 0; index < productIds.length; index += GS1_BATCH_SIZE) {
    batches.push(productIds.slice(index, index + GS1_BATCH_SIZE));
  }
  const pictures = new Map<string, string>();
  await Promise.all(
    batches.map(async (batch) => {
      const response = await authorizedRequest(
        `product/gs1?productIds=${batch.join(",")}`,
        accessToken,
      );
      if (!response.ok) throw new Error(`gs1 status ${response.status}`);
      const body = await json(response);
      for (const row of Array.isArray(body) ? body : []) {
        const record = (row ?? {}) as {
          productId?: unknown;
          gS1?: { produktinformation?: Record<string, unknown> | null } | null;
        };
        const info = record.gS1?.produktinformation;
        const url = pictureUrl(info?.img_HiRes) ?? pictureUrl(info?.img_LowRes);
        if (url) pictures.set(text(record.productId), url);
      }
    }),
  );
  return pictures;
}

/** The customer's assortment: latest purchases and favorites. */
export async function fetchCustomerProducts(accessToken: string) {
  const response = await authorizedRequest(
    "product/customerproducts",
    accessToken,
    {},
  );
  if (!response.ok) {
    throw new ConvexError(
      `AB Catering svarede med status ${response.status}. Prøv igen om lidt`,
    );
  }
  const body = await json(response);
  const data =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const rows = Object.values(data).flatMap((list) =>
    Array.isArray(list) ? list : [],
  );
  if (rows.length > MAX_PRODUCTS) {
    throw new ConvexError(
      `AB Catering-kataloget har mere end ${MAX_PRODUCTS} produkter`,
    );
  }
  const items = new Map<string, CatalogItem>();
  for (const item of rows.flatMap(parseProduct)) {
    if (!items.has(item.productNumber)) items.set(item.productNumber, item);
  }
  const productIds = [
    ...new Set([...items.values()].map((item) => item.productNumber.split(" ")[0])),
  ];
  // Pictures are optional; the catalog still works without them.
  const pictures = await fetchPictures(accessToken, productIds).catch(
    (error: unknown) => {
      if (error instanceof AbTokenExpiredError) throw error;
      console.warn("AB Catering pictures could not be fetched", error);
      return new Map<string, string>();
    },
  );
  return [...items.values()].map((item) => ({
    ...item,
    pictureUrl: pictures.get(item.productNumber.split(" ")[0]) ?? null,
  }));
}

/** Downloads a catalog picture so it can be stored on a product. */
export async function fetchCatalogPicture(value: string) {
  const url = pictureUrl(value);
  const hostname = url ? new URL(url).hostname : "";
  // Only public host names; IP literals and local hosts could reach internal services.
  if (
    !url ||
    new URL(url).port ||
    !hostname.includes(".") ||
    /^[\d.]+$/.test(hostname) ||
    hostname.startsWith("[") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new ConvexError("Billedet kunne ikke hentes");
  }
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "image/*" },
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ConvexError("Billedet kunne ikke hentes");
  }
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!response.ok || !contentType.startsWith("image/")) {
    throw new ConvexError("Billedet kunne ikke hentes");
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new ConvexError("Billedet er for stort");
  }
  return { bytes, contentType };
}

export type AbOrderLine = { productId: string; unit: string; amount: number };

export function parseProductNumber(productNumber: string) {
  const [productId, unit, extra] = productNumber.trim().split(" ");
  if (!productId || !unit || extra !== undefined) return null;
  return { productId, unit };
}

export type AbOrderMessage = { key: string; message: string };

// Danish text for AB's error and warning keys. AB's own messages are in English.
const MESSAGE_TEXT: Record<string, string> = {
  InvalidRequest: "En linje er ugyldig",
  DuplicateProduct: "Varen er med flere gange i samme enhed",
  InvalidDeliveryDate:
    "Leveringsdatoen er lukket, eller bestillingsfristen er overskredet",
  NotAvailable: "Varen findes ikke i jeres sortiment",
  UnitMisMatch: "Kontrollér enheden",
  HighAmount: "Mængden er for stor",
  BlockedFromOrdering: "Varen kan ikke leveres på leveringsdatoen",
  OrderingNotAllowed: "AB Catering-brugeren må ikke afgive bestillinger",
  UnknownUser: "AB Catering-brugeren findes ikke længere",
  UnknownDepartment: "AB Catering-afdelingen findes ikke længere",
  LineNotAdded: "En linje kunne ikke tilføjes",
  OrderNotPlaced: "Bestillingen kunne ikke afgives",
  Date: "Varen leveres senere i en separat ordre",
  HighPrice: "Linjeprisen er over 12.500 kr.",
  LowAmount: "Mængden er mindre end den mindste pakning",
  LastOrderedUnit: "Varen blev sidst bestilt i en anden enhed",
  PriceChanged: "Prisen er en anden på den senere leveringsdag",
};

function parseMessages(value: unknown): AbOrderMessage[] {
  return (Array.isArray(value) ? value : []).flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const key = text(record.key);
    if (!key) return [];
    const product = text(record.productDescription) || text(record.productId);
    const unit = text(record.unit);
    const subject = product ? `${product}${unit ? ` (${unit})` : ""}: ` : "";
    const detail = MESSAGE_TEXT[key] ?? text(record.message);
    return [{ key, message: `${subject}${detail}`.slice(0, 500) }];
  });
}

export type AbPlaceOrderResult =
  | { status: "placed"; orderNumbers: number[] }
  | { status: "warnings"; warnings: AbOrderMessage[] }
  | { status: "errors"; errors: AbOrderMessage[]; warnings: AbOrderMessage[] };

/** Places the order, or only checks it when `testOrder` is set. */
export async function placeOrder(
  accessToken: string,
  order: {
    lines: AbOrderLine[];
    deliveryDate: string;
    ignoreWarnings: string[];
    testOrder: boolean;
  },
): Promise<AbPlaceOrderResult> {
  const response = await authorizedRequest("placeorder", accessToken, {
    lines: order.lines,
    deliveryDate: order.deliveryDate,
    ignoreWarnings: order.ignoreWarnings.map((key) => ({ key })),
    testOrder: order.testOrder,
  });
  const requestId = response.headers.get("requestid");
  const body = await response.text();
  let data: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(body) as unknown;
    if (parsed && typeof parsed === "object") {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    // Handled by the status checks below.
  }
  const errors = parseMessages(data.errors);
  const warnings = parseMessages(data.warnings);
  if (response.status === 200) {
    const orderNumbers = (Array.isArray(data.orderNumbers) ? data.orderNumbers : [])
      .filter((value): value is number => Number.isInteger(value));
    return { status: "placed", orderNumbers };
  }
  if (response.status === 202) {
    return warnings.length || !order.testOrder
      ? { status: "warnings", warnings }
      : { status: "placed", orderNumbers: [] };
  }
  if (response.status === 400 && errors.length) {
    return { status: "errors", errors, warnings };
  }
  console.error(
    `AB Catering placeorder failed with status ${response.status} (RequestId ${requestId})`,
    body.slice(0, 2000),
  );
  throw new ConvexError(
    `AB Catering afviste bestillingen (status ${response.status}${requestId ? `, RequestId ${requestId}` : ""})`,
  );
}
