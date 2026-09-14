import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  decryptWoltSecret,
  encryptWoltSecret,
  hashWoltState,
  verifyWoltSignature,
  woltWioRedirectUris,
} from "./woltCrypto";

const webhookSecret = "organization-webhook-secret-with-enough-bytes";

function hex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-auth-secret-with-enough-entropy-for-encryption");
});

afterEach(() => vi.unstubAllEnvs());

describe("Wolt-kryptering", () => {
  test("krypterer med ny nonce og kan kun dekryptere for samme organisation", async () => {
    const first = await encryptWoltSecret("hemmelig", "organization-1");
    const second = await encryptWoltSecret("hemmelig", "organization-1");
    expect(first).toMatch(/^v2\./);
    expect(first).not.toBe(second);
    await expect(decryptWoltSecret(first, "organization-1")).resolves.toBe("hemmelig");
    await expect(decryptWoltSecret(first, "organization-2")).rejects.toThrow();
    await expect(decryptWoltSecret(first.replace(/^v2/, "v1"), "organization-1"))
      .rejects.toThrow("Tilslut Wolt igen");
  });

  test("hash til OAuth-state er stabilt uden at gemme state", async () => {
    expect(await hashWoltState("state")).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashWoltState("state")).toBe(await hashWoltState("state"));
  });

  test("WIO redirect-URL skal stå på den eksakte allowliste", () => {
    const allowed = woltWioRedirectUris([
      "https://one.example.com/callback",
      "https://two.example.com/callback",
      "http://127.0.0.1:3000/callback",
    ]);
    expect(allowed.has("https://one.example.com/callback")).toBe(true);
    expect(allowed.has("https://one.example.com/other")).toBe(false);
    expect(allowed.has("http://127.0.0.1:3000/callback")).toBe(true);
    expect(woltWioRedirectUris([]).size).toBe(0);
    expect(() => woltWioRedirectUris(["http://one.example.com/callback"]))
      .toThrow("HTTPS");
    expect(() => woltWioRedirectUris(Array(11).fill("https://one.example.com/callback")))
      .toThrow("10");
  });
});

test("webhook-signaturen verificeres over de rå bytes", async () => {
  const body = new TextEncoder().encode('{"id":"event"}\n');
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, body)));
  await expect(verifyWoltSignature(body, signature, webhookSecret)).resolves.toBe(true);
  await expect(
    verifyWoltSignature(new TextEncoder().encode('{"id":"event"}'), signature, webhookSecret),
  ).resolves.toBe(false);
  await expect(verifyWoltSignature(body, signature, "other-organization-secret"))
    .resolves.toBe(false);
  await expect(verifyWoltSignature(body, "not-hex", webhookSecret)).resolves.toBe(false);
});
