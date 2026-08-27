import { env } from "../_generated/server";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ENCRYPTION_VERSION = "v1";

type WoltEnvironmentName = "development" | "production";

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return null;
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (part) =>
    Number.parseInt(part, 16),
  );
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Ugyldig krypteret værdi");
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function requiredValue(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} er ikke konfigureret`);
  return normalized;
}

export function woltEnvironment(): WoltEnvironmentName {
  const value = requiredValue(env.WOLT_ENVIRONMENT, "WOLT_ENVIRONMENT");
  if (value !== "development" && value !== "production") {
    throw new Error("WOLT_ENVIRONMENT skal være development eller production");
  }
  return value;
}

export function woltClientCredentials() {
  return {
    clientId: requiredValue(env.WOLT_CLIENT_ID, "WOLT_CLIENT_ID"),
    clientSecret: requiredValue(env.WOLT_CLIENT_SECRET, "WOLT_CLIENT_SECRET"),
  };
}

export function woltWebhookSecret() {
  const secret = requiredValue(env.WOLT_WEBHOOK_SECRET, "WOLT_WEBHOOK_SECRET");
  if (encoder.encode(secret).length < 16) {
    throw new Error("WOLT_WEBHOOK_SECRET skal være mindst 16 byte");
  }
  return secret;
}

export function woltWioApiKey() {
  const key = requiredValue(env.WOLT_WIO_API_KEY, "WOLT_WIO_API_KEY");
  if (key.length < 32) throw new Error("WOLT_WIO_API_KEY skal være mindst 32 tegn");
  return key;
}

export function woltWioRedirectUris() {
  const values = requiredValue(
    env.WOLT_WIO_REDIRECT_URIS,
    "WOLT_WIO_REDIRECT_URIS",
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0 || values.length > 10) {
    throw new Error("WOLT_WIO_REDIRECT_URIS skal indeholde 1-10 URL'er");
  }
  return new Set(
    values.map((value) => {
      const parsed = new URL(value);
      if (
        parsed.protocol !== "https:" &&
        !(parsed.protocol === "http:" && parsed.hostname === "localhost")
      ) {
        throw new Error("WOLT_WIO_REDIRECT_URIS skal bruge HTTPS");
      }
      return parsed.toString();
    }),
  );
}

export function woltOAuthRedirectUri() {
  const value = requiredValue(env.WOLT_OAUTH_REDIRECT_URI, "WOLT_OAUTH_REDIRECT_URI");
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && parsed.hostname === "localhost")
  ) {
    throw new Error("WOLT_OAUTH_REDIRECT_URI skal bruge HTTPS");
  }
  return parsed.toString();
}

export function woltAppUrl() {
  const value = requiredValue(env.SITE_URL, "SITE_URL");
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && parsed.hostname === "localhost")
  ) {
    throw new Error("SITE_URL skal bruge HTTPS");
  }
  return parsed.origin;
}

export function woltEndpoints() {
  if (woltEnvironment() === "development") {
    return {
      api: "https://pos-integration-service.development.dev.woltapi.com",
      auth: "https://integrations-authentication-service.development.dev.woltapi.com/oauth2/token",
      ssio: "https://developer.development.dev.woltapi.com/integrate",
    };
  }
  return {
    api: "https://pos-integration-service.wolt.com",
    auth: "https://integrations-authentication-service.wolt.com/oauth2/token",
    ssio: "https://developer.wolt.com/integrate",
  };
}

async function encryptionKey() {
  const encoded = requiredValue(env.WOLT_ENCRYPTION_KEY, "WOLT_ENCRYPTION_KEY");
  const bytes = base64UrlToBytes(encoded);
  if (bytes.length !== 32) {
    throw new Error("WOLT_ENCRYPTION_KEY skal være en base64url-kodet 256-bit nøgle");
  }
  return await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export function randomWoltSecret(bytes = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function hashWoltState(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function encryptWoltSecret(value: string) {
  if (!value || value.length > 8_000) throw new Error("Hemmeligheden er ugyldig");
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    await encryptionKey(),
    encoder.encode(value),
  );
  return `${ENCRYPTION_VERSION}.${bytesToBase64Url(nonce)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptWoltSecret(value: string) {
  const [version, nonceValue, ciphertextValue, extra] = value.split(".");
  if (
    version !== ENCRYPTION_VERSION ||
    !nonceValue ||
    !ciphertextValue ||
    extra !== undefined
  ) {
    throw new Error("Den krypterede værdi har et ukendt format");
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(nonceValue) },
    await encryptionKey(),
    base64UrlToBytes(ciphertextValue),
  );
  return decoder.decode(plaintext);
}

export async function verifyWoltSignature(
  body: Uint8Array,
  signatureHex: string | null,
) {
  if (!signatureHex || signatureHex.length !== 64) return false;
  const supplied = hexToBytes(signatureHex);
  if (!supplied || supplied.length !== 32) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(woltWebhookSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bodyBuffer = new ArrayBuffer(body.byteLength);
  new Uint8Array(bodyBuffer).set(body);
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, bodyBuffer),
  );
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected[index] ^ supplied[index];
  }
  return difference === 0;
}

export function equalWoltSecrets(left: string, right: string) {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}
