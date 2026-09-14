import { env } from "../_generated/server";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ENCRYPTION_VERSION = "v2";

export type WoltEnvironmentName = "development" | "production";

export type WoltCredentials = {
  environment: WoltEnvironmentName;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  wioApiKey: string | null;
  wioRedirectUris: string[];
};

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

export function woltWioRedirectUris(values: readonly string[]) {
  if (values.length > 10) {
    throw new Error("WIO må højst have 10 redirect-URL'er");
  }
  return new Set(
    values.map((value) => {
      const parsed = new URL(value);
      if (
        parsed.protocol !== "https:" &&
        !(
          parsed.protocol === "http:" &&
          (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
        )
      ) {
        throw new Error("WIO redirect-URL'er skal bruge HTTPS");
      }
      return parsed.toString();
    }),
  );
}

export function woltOAuthRedirectUri() {
  const value = requiredValue(env.CONVEX_SITE_URL, "CONVEX_SITE_URL");
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" &&
    !(
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    )
  ) {
    throw new Error("CONVEX_SITE_URL skal bruge HTTPS");
  }
  return new URL("/wolt/oauth/callback", parsed).toString();
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

export function woltEndpoints(environment: WoltEnvironmentName) {
  if (environment === "development") {
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

async function encryptionKey(organizationId: string) {
  if (!organizationId) throw new Error("Organisationen mangler");
  const secret = requiredValue(env.BETTER_AUTH_SECRET, "BETTER_AUTH_SECRET");
  const sourceKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("engine/wolt/secrets/v2"),
      info: encoder.encode(organizationId),
    },
    sourceKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function randomWoltSecret(bytes = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function hashWoltState(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export async function encryptWoltSecret(value: string, organizationId: string) {
  if (!value || value.length > 8_000) throw new Error("Hemmeligheden er ugyldig");
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: encoder.encode(organizationId) },
    await encryptionKey(organizationId),
    encoder.encode(value),
  );
  return `${ENCRYPTION_VERSION}.${bytesToBase64Url(nonce)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptWoltSecret(value: string, organizationId: string) {
  const [version, nonceValue, ciphertextValue, extra] = value.split(".");
  if (version === "v1") {
    throw new Error("Wolt-forbindelsen bruger gamle nøgler. Tilslut Wolt igen under organisationens integrationer.");
  }
  if (
    version !== ENCRYPTION_VERSION ||
    !nonceValue ||
    !ciphertextValue ||
    extra !== undefined
  ) {
    throw new Error("Den krypterede værdi har et ukendt format");
  }
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64UrlToBytes(nonceValue),
      additionalData: encoder.encode(organizationId),
    },
    await encryptionKey(organizationId),
    base64UrlToBytes(ciphertextValue),
  );
  return decoder.decode(plaintext);
}

export async function verifyWoltSignature(
  body: Uint8Array,
  signatureHex: string | null,
  webhookSecret: string,
) {
  if (!signatureHex || signatureHex.length !== 64) return false;
  const supplied = hexToBytes(signatureHex);
  if (!supplied || supplied.length !== 32) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(webhookSecret),
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
