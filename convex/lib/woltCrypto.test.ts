import { beforeEach, describe, expect, test } from "vitest";
import {
  decryptWoltSecret,
  encryptWoltSecret,
  hashWoltState,
  verifyWoltSignature,
  woltWioRedirectUris,
} from "./woltCrypto";

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function hex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

beforeEach(() => {
  process.env.WOLT_ENCRYPTION_KEY = base64Url(new Uint8Array(32).fill(7));
  process.env.WOLT_WEBHOOK_SECRET = "webhook-secret-with-enough-bytes";
  process.env.WOLT_WIO_REDIRECT_URIS =
    "https://one.example.com/callback,https://two.example.com/callback";
});

describe("Wolt-kryptering", () => {
  test("krypterer med ny nonce og kan dekryptere", async () => {
    const first = await encryptWoltSecret("hemmelig");
    const second = await encryptWoltSecret("hemmelig");
    expect(first).not.toBe(second);
    await expect(decryptWoltSecret(first)).resolves.toBe("hemmelig");
  });

  test("hash til OAuth-state er stabilt uden at gemme state", async () => {
    expect(await hashWoltState("state")).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashWoltState("state")).toBe(await hashWoltState("state"));
  });

  test("WIO redirect-URL skal stå på den eksakte allowliste", () => {
    const allowed = woltWioRedirectUris();
    expect(allowed.has("https://one.example.com/callback")).toBe(true);
    expect(allowed.has("https://one.example.com/other")).toBe(false);
  });
});

test("webhook-signaturen verificeres over de rå bytes", async () => {
  const body = new TextEncoder().encode('{"id":"event"}\n');
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(process.env.WOLT_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, body)));
  await expect(verifyWoltSignature(body, signature)).resolves.toBe(true);
  await expect(
    verifyWoltSignature(new TextEncoder().encode('{"id":"event"}'), signature),
  ).resolves.toBe(false);
  await expect(verifyWoltSignature(body, "not-hex")).resolves.toBe(false);
});
