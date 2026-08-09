import { ConvexError } from "convex/values";

export const ONLINE_POS_API_URL = "https://api.onlinepos.dk/api";
const MAX_SALE_LINES = 20_000;
const FALLBACK_TIME_ZONE = "Europe/Copenhagen";

export type OnlinePosSettings = { token: string; companyId: number };

export type OnlinePosProduct = {
  id: number;
  name: string;
  groupName: string;
};

export type OnlinePosSaleLine = {
  externalId: string;
  orderNumber: number;
  occurredAt: number;
  externalProductId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  revenue: number;
  paymentType: string;
  department: string;
};

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function dateTimeFormatter(timeZone: string) {
  const cached = dateTimeFormatters.get(timeZone);
  if (cached) return cached;

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    const fallback = dateTimeFormatters.get(FALLBACK_TIME_ZONE);
    if (fallback) {
      dateTimeFormatters.set(timeZone, fallback);
      return fallback;
    }
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: FALLBACK_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    dateTimeFormatters.set(FALLBACK_TIME_ZONE, formatter);
  }
  dateTimeFormatters.set(timeZone, formatter);
  return formatter;
}

export function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function string(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

export function priceNumber(value: unknown) {
  const normalized = string(value).trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function saleTimestamp(
  date: string,
  time: string,
  timeZone: string,
): number | null {
  const dateMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!dateMatch || !timeMatch) return null;
  const desired = Date.UTC(
    Number(dateMatch[3]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[1]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    Number(timeMatch[3] ?? 0),
  );
  const formatter = dateTimeFormatter(timeZone);
  let timestamp = desired;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(timestamp).map((part) => [part.type, part.value]),
    );
    const displayed = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    timestamp += desired - displayed;
  }
  return timestamp;
}

export async function requestOnlinePos(
  path: string,
  settings: OnlinePosSettings,
  init?: RequestInit,
) {
  let response: Response;
  try {
    response = await fetch(`${ONLINE_POS_API_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        token: settings.token,
        firmaid: String(settings.companyId),
        ...init?.headers,
      },
    });
  } catch {
    throw new ConvexError("OnlinePOS kunne ikke kontaktes");
  }

  if (response.status === 403) {
    throw new ConvexError("OnlinePOS afviste firma-id eller token");
  }
  if (!response.ok) {
    throw new ConvexError(`OnlinePOS svarede med status ${response.status}`);
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ConvexError("OnlinePOS returnerede et ugyldigt svar");
  }
}

export function parseProducts(payload: unknown): OnlinePosProduct[] {
  if (!Array.isArray(payload)) {
    throw new ConvexError("OnlinePOS returnerede en ugyldig produktliste");
  }

  return payload.flatMap((value) => {
    const product = object(value);
    const id = number(product?.ID);
    const name = string(product?.name).trim();
    if (id === null || !name) return [];
    return [{ id, name, groupName: string(product?.groupname).trim() }];
  });
}

export async function requestSales(
  settings: OnlinePosSettings,
  from: number,
  to: number,
) {
  const body = new URLSearchParams({
    from: String(Math.floor(from / 1000)),
    to: String(Math.floor(to / 1000)),
    map_to_koncern: "true",
  });
  const payload = object(
    await requestOnlinePos("/exportSales", settings, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    }),
  );
  if (!Array.isArray(payload?.sales)) {
    throw new ConvexError("OnlinePOS returnerede en ugyldig salgsliste");
  }
  return payload.sales;
}

export function parseSaleLines(
  payload: unknown,
  timeZone: string,
): OnlinePosSaleLine[] {
  if (!Array.isArray(payload)) {
    throw new ConvexError("OnlinePOS returnerede en ugyldig salgsliste");
  }
  if (payload.length > MAX_SALE_LINES) {
    throw new ConvexError("Der er for mange OnlinePOS-salgslinjer i perioden");
  }

  const ids = new Set<string>();
  return payload.map((value, index) => {
    const line = object(object(value)?.line);
    const id = number(line?.id);
    const chk = number(line?.chk);
    const productId = number(line?.product_id);
    const amount = number(line?.amount);
    const price = priceNumber(line?.price);
    const department = string(line?.department).trim();
    if (
      id === null ||
      !Number.isInteger(id) ||
      chk === null ||
      !Number.isInteger(chk) ||
      productId === null ||
      !Number.isInteger(productId) ||
      amount === null ||
      price === null ||
      !department
    ) {
      throw new ConvexError(
        `OnlinePOS returnerede en ugyldig salgslinje ved indeks ${index}`,
      );
    }
    const occurredAt = saleTimestamp(
      string(line?.date),
      string(line?.time),
      timeZone,
    );
    if (occurredAt === null) {
      throw new ConvexError(
        `OnlinePOS returnerede en ugyldig salgslinje ved indeks ${index}`,
      );
    }
    const externalId = String(id);
    if (ids.has(externalId)) {
      throw new ConvexError(
        `OnlinePOS returnerede et dubleret salgslinje-id ved indeks ${index}`,
      );
    }
    ids.add(externalId);
    const unitPrice = Math.round(price * 100);
    const quantity = amount;
    const revenue = Math.round(quantity * unitPrice);
    if (!Number.isFinite(unitPrice) || !Number.isFinite(revenue)) {
      throw new ConvexError(
        `OnlinePOS returnerede en for stor salgslinje ved indeks ${index}`,
      );
    }
    return {
      externalId,
      orderNumber: chk,
      occurredAt,
      externalProductId: String(productId),
      productName: string(line?.product),
      quantity,
      unitPrice,
      revenue,
      paymentType: string(line?.payment_type),
      department,
    };
  });
}

export function onlinePosErrorMessage(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === "string") {
    const message = error.data.trim();
    if (message) return message;
  }
  return "OnlinePOS-synkroniseringen mislykkedes";
}
