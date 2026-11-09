import { ConvexError } from "convex/values";
import type { CatalogItem } from "../../supplierCatalog";

const BASE_URL = "https://abcatering.dk/api/external";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_PRODUCTS = 5000;

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

async function authorizedPost(path: string, accessToken: string, body: unknown) {
  const response = await request(path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
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
    const unitAmount =
      basePrice && basePrice > 0
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

/** The customer's assortment: latest purchases and favorites. */
export async function fetchCustomerProducts(accessToken: string) {
  const response = await authorizedPost(
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
  return [...items.values()];
}

export type AbOrderLine = { productId: string; unit: string; quantity: number };

export function parseProductNumber(productNumber: string) {
  const [productId, unit, extra] = productNumber.trim().split(" ");
  if (!productId || !unit || extra !== undefined) return null;
  return { productId, unit };
}

/** Places the order. Returns AB's response body for the order record. */
export async function placeOrder(accessToken: string, lines: AbOrderLine[]) {
  const response = await authorizedPost("order", accessToken, { lines });
  const body = await response.text();
  if (!response.ok) {
    let message = "";
    try {
      const data = JSON.parse(body) as Record<string, unknown>;
      message = text(data.detail) || text(data.title) || text(data.message);
    } catch {
      // Keep the status-only message.
    }
    throw new ConvexError(
      `AB Catering afviste bestillingen (status ${response.status})${message ? `: ${message.slice(0, 300)}` : ""}`,
    );
  }
  return body.slice(0, 2000);
}
