import { ConvexError, v } from "convex/values";
import { internalMutation, type MutationCtx, type QueryCtx } from "../_generated/server";

const encoder = new TextEncoder();

function encode(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

function decode(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function organizationCredentialKey(ctx: QueryCtx, organizationId: string) {
  return (await ctx.db.query("integrationSecrets")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique())?.key ?? null;
}

export async function ensureOrganizationCredentialKey(ctx: MutationCtx, organizationId: string) {
  const current = await organizationCredentialKey(ctx, organizationId);
  if (current) return current;
  const key = encode(crypto.getRandomValues(new Uint8Array(32)));
  await ctx.db.insert("integrationSecrets", { organizationId, key });
  return key;
}

export const ensureKey = internalMutation({
  args: { organizationId: v.string() },
  returns: v.string(),
  handler: (ctx, { organizationId }) => ensureOrganizationCredentialKey(ctx, organizationId),
});

async function importKey(key: string) {
  return crypto.subtle.importKey("raw", decode(key), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptCredential(value: string, organizationId: string, key: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(organizationId) },
    await importKey(key), encoder.encode(value),
  );
  return `v3.${encode(iv)}.${encode(new Uint8Array(ciphertext))}`;
}

export async function decryptCredential(value: string, organizationId: string, key: string | null) {
  const [version, iv, ciphertext, extra] = value.split(".");
  if (version !== "v3" || !iv || !ciphertext || extra !== undefined || !key) {
    throw new ConvexError("Integrationens nøgle kunne ikke læses. Gem organisationens nøgler igen");
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decode(iv), additionalData: encoder.encode(organizationId) },
    await importKey(key), decode(ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}
