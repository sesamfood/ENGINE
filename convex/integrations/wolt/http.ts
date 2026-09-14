import { internal } from "../../_generated/api";
import { httpAction } from "../../_generated/server";
import {
  encryptWoltSecret,
  equalWoltSecrets,
  hashWoltState,
  verifyWoltSignature,
  woltAppUrl,
  woltWioRedirectUris,
} from "./lib/crypto";
import { parseWoltWebhook, parseWoltWioPayload } from "./lib/api";

const WEBHOOK_MAX_BYTES = 64 * 1_024;
const ONBOARDING_MAX_BYTES = 16 * 1_024;

function response(status: number, body: string) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function bodyTooLarge(request: Request, maxBytes: number) {
  const value = request.headers.get("content-length");
  if (!value) return false;
  const parsed = Number(value);
  return !Number.isFinite(parsed) || parsed < 0 || parsed > maxBytes;
}

function parseJson(bytes: Uint8Array) {
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export const webhook = httpAction(async (ctx, request) => {
  if (bodyTooLarge(request, WEBHOOK_MAX_BYTES)) return response(413, "Payload too large");
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > WEBHOOK_MAX_BYTES) return response(413, "Payload too large");
  let envelope: ReturnType<typeof parseWoltWebhook>;
  try {
    envelope = parseWoltWebhook(parseJson(body));
  } catch {
    return response(400, "Invalid webhook");
  }
  try {
    const organizationId = await ctx.runQuery(internal.woltSync.getWebhookOrganization, {
      venueId: envelope.venueId,
    });
    if (!organizationId) return response(401, "Unknown venue");
    const credentials = await ctx.runMutation(internal.woltCredentials.getForOrganization, {
      organizationId,
    });
    if (!credentials) return response(503, "Webhook is not configured");
    const verified = await verifyWoltSignature(
      body,
      request.headers.get("wolt-signature"),
      credentials.webhookSecret,
    );
    if (!verified) return response(401, "Invalid signature");
    await ctx.runMutation(internal.woltSync.acceptWebhook, {
      organizationId,
      envelope,
      receivedAt: Date.now(),
    });
    return response(200, "OK");
  } catch {
    return response(503, "Webhook could not be stored");
  }
});

export const oauthCallback = httpAction(async (ctx, request) => {
  const destination = new URL("/administration/integrations/wolt", woltAppUrl());
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code")?.trim();
    const state = url.searchParams.get("state")?.trim();
    if (!code || code.length > 8_000 || !state || state.length > 500) {
      throw new Error("Ugyldigt callback");
    }
    const stateHash = await hashWoltState(state);
    const now = Date.now();
    const organizationId = await ctx.runQuery(internal.woltSync.getOAuthOrganization, {
      stateHash,
      now,
    });
    if (!organizationId) throw new Error("Forbindelseslinket er udløbet eller allerede brugt");
    const key = await ctx.runMutation(internal.integrations.credentials.ensureKey, { organizationId });
    const result = await ctx.runMutation(internal.woltSync.consumeOAuthCallback, {
      organizationId,
      stateHash,
      authorizationCodeHash: await hashWoltState(code),
      authorizationCodeCiphertext: await encryptWoltSecret(code, organizationId, key),
      now,
    });
    const redirect = new URL(result.returnPath, woltAppUrl());
    redirect.searchParams.set("wolt", "processing");
    return Response.redirect(redirect, 303);
  } catch {
    destination.searchParams.set("wolt", "error");
    return Response.redirect(destination, 303);
  }
});

export const wioOnboarding = httpAction(async (ctx, request) => {
  if (bodyTooLarge(request, ONBOARDING_MAX_BYTES)) return response(413, "Payload too large");
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > ONBOARDING_MAX_BYTES) return response(413, "Payload too large");
  let payload: ReturnType<typeof parseWoltWioPayload>;
  try {
    payload = parseWoltWioPayload(parseJson(body));
  } catch {
    return response(400, "Invalid onboarding payload");
  }
  try {
    const organizationId = await ctx.runQuery(internal.woltSync.getWioOrganization, {
      partnerVenueId: payload.partnerVenueId,
    });
    if (!organizationId) return response(401, "Unknown partner venue");
    const credentials = await ctx.runMutation(internal.woltCredentials.getForOrganization, {
      organizationId,
    });
    if (!credentials?.wioApiKey) return response(503, "Onboarding is not configured");
    const suppliedKey = request.headers.get("x-api-key") ?? "";
    if (!equalWoltSecrets(credentials.wioApiKey, suppliedKey)) {
      return response(401, "Invalid API key");
    }
    if (!woltWioRedirectUris(credentials.wioRedirectUris).has(payload.redirectUri)) {
      return response(400, "Invalid redirect URL");
    }
    const key = await ctx.runMutation(internal.integrations.credentials.ensureKey, { organizationId });
    await ctx.runMutation(internal.woltSync.acceptWioOnboarding, {
      organizationId,
      partnerVenueId: payload.partnerVenueId,
      authorizationCodeHash: await hashWoltState(payload.authorizationCode),
      authorizationCodeCiphertext: await encryptWoltSecret(payload.authorizationCode, organizationId, key),
      redirectUri: payload.redirectUri,
      now: Date.now(),
    });
    return response(200, "OK");
  } catch {
    return response(503, "Onboarding could not be stored");
  }
});
