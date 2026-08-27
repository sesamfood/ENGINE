import type { Doc } from "../_generated/dataModel";
import {
  woltClientCredentials,
  woltEndpoints,
} from "./woltCrypto";

const MAX_PROVIDER_ERROR = 300;
const MAX_ITEMS = 500;
const MAX_TEXT = 500;

type JsonObject = Record<string, unknown>;

export type WoltWebhookEnvelope = {
  eventId: string;
  orderId: string;
  venueId: string;
  providerStatus: string;
  eventCreatedAt: number;
};

export type WoltOrderSnapshot = {
  woltOrderId: string;
  venueId: string;
  displayNumber: string;
  status: "created" | "production" | "ready" | "delivered" | "canceled" | "other";
  providerStatus: string;
  orderType: "instant" | "preorder" | "other";
  providerCreatedAt: number;
  scheduledAt?: number;
  occurredAt: number;
  modifiedAt: number;
  basketPrice: number;
  currency: string;
  itemCount: number;
  items: Array<{
    itemId: string;
    name: string;
    normalizedName: string;
    quantity: number;
    posId?: string;
    sku?: string;
    gtin?: string;
    unitPrice: number;
    lineTotal: number;
    currency: string;
  }>;
};

export type WoltTokenResponse = {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
  refreshExpiresIn: number;
  venueId: string;
};

export type WoltWioPayload = {
  authorizationCode: string;
  redirectUri: string;
  partnerVenueId: string;
};

export class WoltProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
    readonly status?: number,
  ) {
    super(message.slice(0, MAX_PROVIDER_ERROR));
  }
}

function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} mangler`);
  }
  return value as JsonObject;
}

function boundedString(value: unknown, label: string, max = MAX_TEXT) {
  if (typeof value !== "string") throw new Error(`${label} mangler`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new Error(`${label} er ugyldig`);
  return normalized;
}

function optionalIdentifier(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).trim();
  return normalized && normalized.length <= 200 ? normalized : undefined;
}

function timestamp(value: unknown, label: string) {
  let parsed: number;
  if (typeof value === "string") parsed = Date.parse(value);
  else if (typeof value === "number") parsed = value < 10_000_000_000 ? value * 1_000 : value;
  else parsed = Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} er ugyldigt`);
  return parsed;
}

function optionalTimestamp(value: unknown) {
  try {
    return value === null || value === undefined ? undefined : timestamp(value, "Tidspunkt");
  } catch {
    return undefined;
  }
}

function nonNegativeInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} er ugyldigt`);
  }
  return value as number;
}

function positiveQuantity(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 10_000) {
    throw new Error("Antal er ugyldigt");
  }
  return value;
}

export function normalizeWoltText(value: string) {
  return value.trim().toLocaleLowerCase("da-DK").replace(/\s+/g, " ").slice(0, MAX_TEXT);
}

export function normalizeWoltStatus(value: string): WoltOrderSnapshot["status"] {
  const normalized = value.trim().toLowerCase();
  if (["created", "received", "fetched", "acknowledged"].includes(normalized)) return "created";
  if (normalized === "production") return "production";
  if (normalized === "ready") return "ready";
  if (normalized === "delivered") return "delivered";
  if (["canceled", "cancelled", "rejected"].includes(normalized)) return "canceled";
  return "other";
}

export function parseWoltWebhook(value: unknown): WoltWebhookEnvelope {
  const root = object(value, "Webhook");
  const order = object(root.order, "Ordre");
  const type = boundedString(root.type, "Webhooktype", 100);
  if (type !== "order.notification") throw new Error("Webhooktypen understøttes ikke");
  return {
    eventId: boundedString(root.id, "Event-id", 200),
    orderId: boundedString(order.id, "Ordre-id", 200),
    venueId: boundedString(order.venue_id, "Venue-id", 200),
    providerStatus: boundedString(order.status, "Status", 100),
    eventCreatedAt: timestamp(root.created_at, "Eventtidspunkt"),
  };
}

export function parseWoltWioPayload(value: unknown): WoltWioPayload {
  const root = object(value, "Onboarding");
  const redirectUri = boundedString(root.redirect_url, "Redirect-URL", 2_000);
  const parsed = new URL(redirectUri);
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && parsed.hostname === "localhost")
  ) {
    throw new Error("Redirect-URL er ugyldig");
  }
  return {
    authorizationCode: boundedString(root.authorization_code, "Godkendelseskode", 8_000),
    redirectUri: parsed.toString(),
    partnerVenueId: boundedString(root.partner_venue_id, "Partner-venue-id", 200),
  };
}

function parseMoney(value: unknown, fallbackCurrency?: string) {
  const money = object(value, "Beløb");
  const total = object(money.total, "Total");
  const currency = boundedString(total.currency ?? fallbackCurrency, "Valuta", 10).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Valuta er ugyldig");
  return { amount: nonNegativeInteger(total.amount, "Beløb"), currency };
}

function parseAmount(value: unknown, fallbackCurrency?: string) {
  const money = object(value, "Beløb");
  const currency = boundedString(money.currency ?? fallbackCurrency, "Valuta", 10).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Valuta er ugyldig");
  return { amount: nonNegativeInteger(money.amount, "Beløb"), currency };
}

export function parseWoltOrder(value: unknown): WoltOrderSnapshot {
  const root = object(value, "Ordre");
  const venue = object(root.venue, "Venue");
  const woltOrderId = boundedString(root.id, "Ordre-id", 200);
  const venueId = boundedString(venue.id, "Venue-id", 200);
  const displayNumber = boundedString(root.order_number, "Ordrenummer", 100);
  const providerStatus = boundedString(root.order_status, "Status", 100);
  const parsedCreatedAt = optionalTimestamp(root.created_at);
  const parsedModifiedAt = optionalTimestamp(root.modified_at);
  if (!parsedCreatedAt && !parsedModifiedAt) {
    throw new Error("Ordren mangler et brugbart tidspunkt");
  }
  const providerCreatedAt = parsedCreatedAt ?? parsedModifiedAt!;
  const modifiedAt = parsedModifiedAt ?? providerCreatedAt;
  const orderTypeValue = typeof root.type === "string" ? root.type.toLowerCase() : "other";
  const orderType = orderTypeValue === "preorder" ? "preorder" : orderTypeValue === "instant" ? "instant" : "other";
  const preOrder = root.pre_order && typeof root.pre_order === "object" && !Array.isArray(root.pre_order)
    ? (root.pre_order as JsonObject)
    : null;
  const scheduledAt = preOrder ? optionalTimestamp(preOrder.preorder_time) : undefined;
  if (orderType === "preorder" && scheduledAt === undefined) {
    throw new Error("Forudbestillingen mangler et gyldigt planlagt tidspunkt");
  }
  const basket = parseMoney(root.basket_price);
  if (!Array.isArray(root.items) || root.items.length > MAX_ITEMS) {
    throw new Error("Ordrelinjerne er ugyldige eller for mange");
  }
  const items = root.items.map((itemValue, index) => {
    const item = object(itemValue, `Ordrelinje ${index + 1}`);
    const itemId = optionalIdentifier(item.id) ?? `${index + 1}`;
    const name = boundedString(item.name, "Produktnavn");
    const quantity = positiveQuantity(item.count);
    const itemPrice = object(item.item_price, "Linjepris");
    const unitPrice = parseAmount(itemPrice.unit_price, basket.currency);
    const lineTotal = parseAmount(itemPrice.total, basket.currency);
    if (unitPrice.currency !== basket.currency || lineTotal.currency !== basket.currency) {
      throw new Error("Ordren har blandede valutaer");
    }
    return {
      itemId,
      name,
      normalizedName: normalizeWoltText(name),
      quantity,
      posId: optionalIdentifier(item.pos_id),
      sku: optionalIdentifier(item.sku),
      gtin: optionalIdentifier(item.gtin),
      unitPrice: unitPrice.amount,
      lineTotal: lineTotal.amount,
      currency: lineTotal.currency,
    };
  });
  return {
    woltOrderId,
    venueId,
    displayNumber,
    status: normalizeWoltStatus(providerStatus),
    providerStatus: providerStatus.slice(0, 100),
    orderType,
    providerCreatedAt,
    scheduledAt,
    occurredAt: orderType === "preorder" && scheduledAt ? scheduledAt : providerCreatedAt,
    modifiedAt,
    basketPrice: basket.amount,
    currency: basket.currency,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    items,
  };
}

function retryAfter(response: Response) {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 60 * 60 * 1_000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, Math.min(at - Date.now(), 60 * 60 * 1_000)) : undefined;
}

async function providerJson(response: Response) {
  if (!response.ok) {
    const retryable = response.status === 429 || response.status === 500 || response.status === 503;
    throw new WoltProviderError(
      `Wolt svarede med HTTP ${response.status}`,
      retryable,
      retryAfter(response),
      response.status,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new WoltProviderError("Wolt svarede med ugyldig JSON", false);
  }
}

export async function requestWoltOrder(orderId: string, accessToken: string) {
  let response: Response;
  try {
    response = await fetch(`${woltEndpoints().api}/v2/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
  } catch {
    throw new WoltProviderError("Wolt kunne ikke nås", true);
  }
  try {
    return parseWoltOrder(await providerJson(response));
  } catch (error) {
    if (error instanceof WoltProviderError) throw error;
    throw new WoltProviderError(error instanceof Error ? error.message : "Wolt-ordren er ugyldig", false);
  }
}

function base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function stringField(value: unknown, name: string) {
  return boundedString(value, name, 8_000);
}

function positiveSeconds(value: unknown, name: string) {
  const parsed = nonNegativeInteger(value, name);
  if (parsed <= 0 || parsed > 365 * 24 * 60 * 60) throw new Error(`${name} er ugyldigt`);
  return parsed;
}

function jwtPayload(token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Wolt-tokenet er ugyldigt");
  const base64Value = parts[1].replaceAll("-", "+").replaceAll("_", "/");
  const json = atob(base64Value.padEnd(Math.ceil(base64Value.length / 4) * 4, "="));
  return object(JSON.parse(json), "Token");
}

function parseTokenResponse(value: unknown): WoltTokenResponse {
  const root = object(value, "Token");
  const accessToken = stringField(root.access_token, "Access token");
  const refreshToken = stringField(root.refresh_token, "Refresh token");
  const payload = jwtPayload(accessToken);
  const integration = object(payload.integration, "Integration");
  return {
    accessToken,
    refreshToken,
    accessExpiresIn: positiveSeconds(root.expires_in, "Access-udløb"),
    refreshExpiresIn:
      root.refresh_expires_in === undefined
        ? 30 * 24 * 60 * 60
        : positiveSeconds(root.refresh_expires_in, "Refresh-udløb"),
    venueId: boundedString(integration.venue_id, "Venue-id", 200),
  };
}

async function tokenRequest(parameters: URLSearchParams) {
  const { clientId, clientSecret } = woltClientCredentials();
  let response: Response;
  try {
    response = await fetch(woltEndpoints().auth, {
      method: "POST",
      headers: {
        Authorization: `Basic ${base64(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: parameters,
    });
  } catch {
    throw new WoltProviderError("Wolt-godkendelse kunne ikke nås", true);
  }
  try {
    return parseTokenResponse(await providerJson(response));
  } catch (error) {
    if (error instanceof WoltProviderError) throw error;
    throw new WoltProviderError(error instanceof Error ? error.message : "Wolt-tokenet er ugyldigt", false);
  }
}

export async function exchangeWoltAuthorizationCode(code: string, redirectUri: string) {
  return await tokenRequest(new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  }));
}

export async function refreshWoltTokens(refreshToken: string) {
  return await tokenRequest(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }));
}

export function publicConnectionHealth(connection: Doc<"woltVenueConnections">) {
  return {
    state: connection.state,
    activatedAt: connection.activatedAt,
    accessTokenExpiresAt: connection.accessTokenExpiresAt,
    lastWebhookAt: connection.lastWebhookAt ?? null,
    lastSuccessAt: connection.lastSuccessAt ?? null,
    lastError: connection.lastError?.slice(0, MAX_PROVIDER_ERROR) ?? null,
  };
}
