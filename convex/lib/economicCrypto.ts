import { ConvexError } from "convex/values";
import { env } from "../_generated/server";

const encoder = new TextEncoder();

function encode(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new ConvexError("e-conomic-nøglen er ugyldig");
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const bytes = decode(env.ECONOMIC_ENCRYPTION_KEY?.trim() ?? "");
  if (bytes.length !== 32) throw new ConvexError("e-conomic-kryptering er ikke konfigureret korrekt");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export function economicAppSecret() {
  const value = env.ECONOMIC_APP_SECRET_TOKEN?.trim();
  if (!value) throw new ConvexError("e-conomic er ikke konfigureret på serveren");
  return value;
}

export async function encryptEconomicToken(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), encoder.encode(value));
  return `v1.${encode(iv)}.${encode(new Uint8Array(ciphertext))}`;
}

export async function decryptEconomicToken(value: string) {
  const [version, iv, ciphertext, extra] = value.split(".");
  if (version !== "v1" || !iv || !ciphertext || extra !== undefined) {
    throw new ConvexError("e-conomic-forbindelsen skal oprettes igen");
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(iv) }, await encryptionKey(), decode(ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new ConvexError("e-conomic-forbindelsens nøgle kunne ikke læses");
  }
}

export async function economicFingerprint(value: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
