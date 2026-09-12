import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { env } from "../_generated/server";
import type { EconomicCredentials } from "./economicApi";

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

export async function decryptEconomicCredentials(connection: Pick<Doc<"economicConnections">, "encryptedToken" | "encryptedAppSecretToken">): Promise<EconomicCredentials> {
  if (!connection.encryptedAppSecretToken) {
    throw new ConvexError("Forbind e-conomic igen med organisationens appnøgle og aftalenøgle i Administration");
  }
  const [appSecretToken, agreementGrantToken] = await Promise.all([
    decryptEconomicToken(connection.encryptedAppSecretToken),
    decryptEconomicToken(connection.encryptedToken),
  ]);
  return { appSecretToken, agreementGrantToken };
}

export async function economicFingerprint(value: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
