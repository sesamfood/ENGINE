import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { env } from "../_generated/server";
import type { EconomicCredentials } from "./economicApi";
import { decryptCredential } from "../integrations/credentials";

function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new ConvexError("e-conomic-nøglen er ugyldig");
  return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const bytes = decode(env.ECONOMIC_ENCRYPTION_KEY?.trim() ?? "");
  if (bytes.length !== 32) throw new ConvexError("e-conomic-kryptering er ikke konfigureret korrekt");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function decryptEconomicToken(value: string, organizationId: string, key: string | null) {
  if (value.startsWith("v3.")) return decryptCredential(value, organizationId, key);
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

export async function decryptEconomicCredentials(connection: Pick<Doc<"economicConnections">, "organizationId" | "encryptedToken" | "encryptedAppSecretToken">, key: string | null): Promise<EconomicCredentials> {
  if (!connection.encryptedAppSecretToken) {
    throw new ConvexError("Forbind e-conomic igen med organisationens appnøgle og aftalenøgle i Administration");
  }
  const [appSecretToken, agreementGrantToken] = await Promise.all([
    decryptEconomicToken(connection.encryptedAppSecretToken, connection.organizationId, key),
    decryptEconomicToken(connection.encryptedToken, connection.organizationId, key),
  ]);
  return { appSecretToken, agreementGrantToken };
}

export async function economicFingerprint(value: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
