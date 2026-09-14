import { ConvexError, v } from "convex/values";
import { env, internalQuery, mutation, query } from "./_generated/server";
import {
  requireAllLocationAccess,
  requireHumanPrincipal,
  requireIntegrationManager,
} from "./lib/auth";
import { recordAudit } from "./lib/audit";
import {
  decryptWoltSecret,
  encryptWoltSecret,
  woltOAuthRedirectUri,
  woltWioRedirectUris,
} from "./lib/woltCrypto";
import {
  woltCredentialsValidator,
  woltEnvironmentValidator,
} from "./lib/woltCredentialValidators";

export const getSettings = query({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    canManage: v.boolean(),
    hasActiveConnections: v.boolean(),
    environment: woltEnvironmentValidator,
    clientId: v.string(),
    hasClientSecret: v.boolean(),
    hasWebhookSecret: v.boolean(),
    hasWioApiKey: v.boolean(),
    wioRedirectUris: v.array(v.string()),
    oauthRedirectUri: v.string(),
    webhookUrl: v.string(),
    wioOnboardingUrl: v.string(),
  }),
  handler: async (ctx) => {
    const auth = await requireIntegrationManager(ctx);
    const integration = await ctx.db
      .query("woltIntegrations")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", auth.organizationId))
      .unique();
    const credentials = integration?.credentials;
    const connections = await ctx.db
      .query("woltVenueConnections")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", auth.organizationId))
      .take(201);
    return {
      configured: Boolean(credentials),
      canManage: auth.principalKind === "user" && auth.locationScope.all,
      hasActiveConnections: connections.length > 200 ||
        connections.some((connection) => connection.state !== "disabled"),
      environment: credentials?.environment ?? "production",
      clientId: credentials?.clientId ?? "",
      hasClientSecret: Boolean(credentials?.clientSecretCiphertext),
      hasWebhookSecret: Boolean(credentials?.webhookSecretCiphertext),
      hasWioApiKey: Boolean(credentials?.wioApiKeyCiphertext),
      wioRedirectUris: credentials?.wioRedirectUris ?? [],
      oauthRedirectUri: woltOAuthRedirectUri(),
      webhookUrl: new URL("/wolt/webhook", env.CONVEX_SITE_URL).toString(),
      wioOnboardingUrl: new URL("/wolt/onboarding", env.CONVEX_SITE_URL).toString(),
    };
  },
});

function secretInput(value: string | undefined, label: string, minimum: number) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (new TextEncoder().encode(normalized).length < minimum || normalized.length > 8_000) {
    throw new ConvexError(`${label} skal være mellem ${minimum} og 8000 tegn`);
  }
  return normalized;
}

export const save = mutation({
  args: {
    environment: woltEnvironmentValidator,
    clientId: v.string(),
    clientSecret: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
    wioApiKey: v.optional(v.string()),
    wioRedirectUris: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = requireHumanPrincipal(await requireIntegrationManager(ctx));
    requireAllLocationAccess(auth);
    const { organizationId } = auth;
    const clientId = args.clientId.trim();
    if (!clientId || clientId.length > 200) {
      throw new ConvexError("Client-id skal være mellem 1 og 200 tegn");
    }
    const clientSecret = secretInput(args.clientSecret, "Client secret", 1);
    const webhookSecret = secretInput(args.webhookSecret, "Webhook-nøglen", 16);
    const wioApiKey = secretInput(args.wioApiKey, "WIO-nøglen", 32);
    const current = await ctx.db
      .query("woltIntegrations")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    const previous = current?.credentials;
    if ((!clientSecret || !webhookSecret) && !previous) {
      throw new ConvexError("Udfyld organisationens client secret og webhook-nøgle");
    }
    let wioRedirectUris: string[];
    try {
      wioRedirectUris = [...woltWioRedirectUris(args.wioRedirectUris)];
    } catch {
      throw new ConvexError("WIO kræver gyldige HTTPS-redirect-URL'er, højst 10");
    }
    if ((wioApiKey || previous?.wioApiKeyCiphertext) && wioRedirectUris.length === 0) {
      throw new ConvexError("Angiv mindst én redirect-URL til WIO-nøglen");
    }
    const connections = await ctx.db
      .query("woltVenueConnections")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .take(201);
    if (connections.length > 200) {
      throw new ConvexError("Organisationen har for mange Wolt-forbindelser til at ændre nøglerne her");
    }
    if (previous && (previous.clientId !== clientId || previous.environment !== args.environment)) {
      if (connections.some((connection) => connection.state !== "disabled")) {
        throw new ConvexError("Afbryd Wolt-forbindelserne, før du ændrer client-id eller miljø");
      }
      const [pending, processing, oauthStates] = await Promise.all([
        ctx.db.query("woltOnboardingEvents")
          .withIndex("by_organizationId_and_state", (q) => q.eq("organizationId", organizationId).eq("state", "pending"))
          .first(),
        ctx.db.query("woltOnboardingEvents")
          .withIndex("by_organizationId_and_state", (q) => q.eq("organizationId", organizationId).eq("state", "processing"))
          .first(),
        ctx.db.query("woltOAuthStates")
          .withIndex("by_organizationId_and_locationId", (q) => q.eq("organizationId", organizationId))
          .take(201),
      ]);
      if (pending || processing || oauthStates.length > 200 ||
        oauthStates.some((state) => state.consumedAt === undefined && state.expiresAt > Date.now())) {
        throw new ConvexError("Vent på, at den igangværende Wolt-opsætning afsluttes eller udløber, før du ændrer client-id eller miljø");
      }
    }
    const clientSecretCiphertext = clientSecret
      ? await encryptWoltSecret(clientSecret, organizationId)
      : previous?.clientSecretCiphertext;
    const webhookSecretCiphertext = webhookSecret
      ? await encryptWoltSecret(webhookSecret, organizationId)
      : previous?.webhookSecretCiphertext;
    if (!clientSecretCiphertext || !webhookSecretCiphertext) {
      throw new ConvexError("Organisationens Wolt-nøgler mangler");
    }
    const credentials = {
      environment: args.environment,
      clientId,
      clientSecretCiphertext,
      webhookSecretCiphertext,
      wioApiKeyCiphertext: wioApiKey
        ? await encryptWoltSecret(wioApiKey, organizationId)
        : previous?.wioApiKeyCiphertext,
      wioRedirectUris,
    };
    const updatedAt = Date.now();
    const integrationId = current?._id ?? await ctx.db.insert("woltIntegrations", {
      organizationId,
      credentials,
      enabled: false,
      updatedAt,
    });
    if (current) await ctx.db.patch("woltIntegrations", integrationId, { credentials, updatedAt });
    for (const connection of connections) {
      if (
        connection.state !== "disabled" && connection.state !== "reauthorizationRequired" &&
        (!connection.accessTokenCiphertext.startsWith("v2.") ||
          !connection.refreshTokenCiphertext.startsWith("v2."))
      ) {
        await ctx.db.patch("woltVenueConnections", connection._id, {
          state: "reauthorizationRequired",
          lastError: "Forbind Wolt igen med organisationens egne nøgler",
          updatedAt,
        });
      }
    }
    await recordAudit(ctx, auth, {
      action: "wolt.credentials.updated",
      entityTable: "woltIntegrations",
      entityId: integrationId,
      summary: "Opdaterede organisationens Wolt-nøgler",
    });
    return null;
  },
});

export const getForOrganization = internalQuery({
  args: { organizationId: v.string() },
  returns: v.union(woltCredentialsValidator, v.null()),
  handler: async (ctx, { organizationId }) => {
    const integration = await ctx.db
      .query("woltIntegrations")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    const credentials = integration?.credentials;
    if (!credentials) return null;
    return {
      environment: credentials.environment,
      clientId: credentials.clientId,
      clientSecret: await decryptWoltSecret(credentials.clientSecretCiphertext, organizationId),
      webhookSecret: await decryptWoltSecret(credentials.webhookSecretCiphertext, organizationId),
      wioApiKey: credentials.wioApiKeyCiphertext
        ? await decryptWoltSecret(credentials.wioApiKeyCiphertext, organizationId)
        : null,
      wioRedirectUris: credentials.wioRedirectUris,
    };
  },
});
