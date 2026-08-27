import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import {
  decryptWoltSecret,
  encryptWoltSecret,
  randomWoltSecret,
} from "./lib/woltCrypto";
import {
  exchangeWoltAuthorizationCode,
  refreshWoltTokens,
  requestWoltOrder,
  WoltProviderError,
} from "./lib/woltApi";
import { resolveTimeZone } from "./lib/timeZone";
import { woltDailyContribution } from "./lib/woltRollup";
import {
  woltOrderSnapshotValidator,
  woltWebhookEnvelopeValidator,
} from "./lib/woltValidators";

const MAX_ATTEMPTS = 8;
const MAX_PROVIDER_ERROR = 300;
const MAX_ITEMS = 500;
const JOB_BATCH = 50;
const DETAIL_RETENTION_MS = 400 * 24 * 60 * 60 * 1_000;
const QUARANTINE_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const ONBOARDING_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const ACCESS_TOKEN_SKEW_MS = 15 * 60 * 1_000;
const REFRESH_LEASE_MS = 2 * 60 * 1_000;

const inboxResultValidator = v.union(
  v.object({ kind: v.literal("accepted") }),
  v.object({ kind: v.literal("duplicate") }),
  v.object({ kind: v.literal("quarantined") }),
);

const webhookClaimValidator = v.union(
  v.object({
    eventId: v.id("woltWebhookEvents"),
    runToken: v.string(),
    organizationId: v.string(),
    locationId: v.id("locations"),
    venueId: v.string(),
    orderId: v.string(),
    attemptCount: v.number(),
    accessTokenCiphertext: v.string(),
    refreshTokenCiphertext: v.string(),
    accessTokenExpiresAt: v.number(),
    refreshTokenExpiresAt: v.number(),
    tokenVersion: v.number(),
  }),
  v.null(),
);

const onboardingClaimValidator = v.union(
  v.object({
    onboardingEventId: v.id("woltOnboardingEvents"),
    runToken: v.string(),
    organizationId: v.string(),
    locationId: v.id("locations"),
    partnerVenueId: v.union(v.string(), v.null()),
    mode: v.union(v.literal("ssio"), v.literal("wio")),
    authorizationCodeCiphertext: v.string(),
    redirectUri: v.string(),
    attemptCount: v.number(),
  }),
  v.null(),
);

const refreshLeaseValidator = v.union(
  v.object({ kind: v.literal("busy"), retryAt: v.number() }),
  v.object({
    kind: v.literal("claimed"),
    leaseId: v.string(),
    tokenVersion: v.number(),
    venueId: v.string(),
    refreshTokenCiphertext: v.string(),
  }),
  v.object({ kind: v.literal("unavailable") }),
);

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : "Ukendt Wolt-fejl")
    .slice(0, MAX_PROVIDER_ERROR);
}

function retryDelay(attemptCount: number, retryAfterMs: number | undefined, seed: number) {
  const base = retryAfterMs !== undefined
    ? Math.max(1_000, retryAfterMs)
    : Math.min(15 * 60 * 1_000, 5_000 * 2 ** Math.max(0, attemptCount - 1));
  const jitterWindow = Math.min(30_000, Math.max(1, Math.floor(base * 0.2)));
  return base + Math.abs(Math.trunc(seed)) % jitterWindow;
}

function isRetryable(error: unknown) {
  return error instanceof WoltProviderError && error.retryable;
}

async function adoptWebhookQuarantineRows(
  ctx: MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
  venueId: string,
) {
  const rows = await ctx.db
    .query("woltWebhookQuarantine")
    .withIndex("by_venueId_and_receivedAt", (q) => q.eq("venueId", venueId))
    .take(100);
  let adopted = 0;
  for (const row of rows) {
    const existing = await ctx.db
      .query("woltWebhookEvents")
      .withIndex("by_venueId_and_eventId", (q) =>
        q.eq("venueId", venueId).eq("eventId", row.eventId),
      )
      .unique();
    if (!existing) {
      const eventId = await ctx.db.insert("woltWebhookEvents", {
        eventId: row.eventId,
        organizationId,
        locationId,
        venueId,
        orderId: row.orderId,
        providerStatus: row.providerStatus,
        eventCreatedAt: row.eventCreatedAt,
        state: "pending",
        attemptCount: 0,
        nextAttemptAt: Date.now(),
        receivedAt: row.receivedAt,
      });
      await ctx.scheduler.runAfter(0, internal.woltSync.processWebhookEvent, {
        eventId,
      });
      adopted += 1;
    }
    await ctx.db.delete(row._id);
  }
  return { adopted, more: rows.length === 100 };
}

export const acceptWebhook = internalMutation({
  args: { envelope: woltWebhookEnvelopeValidator, receivedAt: v.number() },
  returns: inboxResultValidator,
  handler: async (ctx, args) => {
    const { envelope } = args;
    const [existing, quarantined] = await Promise.all([
      ctx.db
        .query("woltWebhookEvents")
        .withIndex("by_venueId_and_eventId", (q) =>
          q.eq("venueId", envelope.venueId).eq("eventId", envelope.eventId),
        )
        .unique(),
      ctx.db
        .query("woltWebhookQuarantine")
        .withIndex("by_venueId_and_eventId", (q) =>
          q.eq("venueId", envelope.venueId).eq("eventId", envelope.eventId),
        )
        .unique(),
    ]);
    if (existing || quarantined) return { kind: "duplicate" as const };

    const connections = await ctx.db
      .query("woltVenueConnections")
      .withIndex("by_venueId", (q) => q.eq("venueId", envelope.venueId))
      .take(2);
    const connection = connections.length === 1 ? connections[0] : null;
    if (!connection || connection.state !== "ready") {
      await ctx.db.insert("woltWebhookQuarantine", {
        ...envelope,
        reason:
          connections.length > 1
            ? "venue-id er tvetydigt"
            : connection
              ? "forbindelsen er ikke aktiv"
              : "venue-id er ukendt",
        receivedAt: args.receivedAt,
      });
      return { kind: "quarantined" as const };
    }

    const eventId = await ctx.db.insert("woltWebhookEvents", {
      ...envelope,
      organizationId: connection.organizationId,
      locationId: connection.locationId,
      state: "pending",
      attemptCount: 0,
      nextAttemptAt: args.receivedAt,
      receivedAt: args.receivedAt,
    });
    await ctx.db.patch(connection._id, {
      lastWebhookAt: args.receivedAt,
      updatedAt: args.receivedAt,
    });
    await ctx.scheduler.runAfter(0, internal.woltSync.processWebhookEvent, {
      eventId,
    });
    return { kind: "accepted" as const };
  },
});

export const consumeOAuthCallback = internalMutation({
  args: {
    stateHash: v.string(),
    authorizationCodeHash: v.string(),
    authorizationCodeCiphertext: v.string(),
    now: v.number(),
  },
  returns: v.object({ returnPath: v.string() }),
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("woltOAuthStates")
      .withIndex("by_stateHash", (q) => q.eq("stateHash", args.stateHash))
      .unique();
    if (!state || state.consumedAt !== undefined || state.expiresAt <= args.now) {
      throw new ConvexError("Forbindelseslinket er udløbet eller allerede brugt");
    }
    const location = await ctx.db.get("locations", state.locationId);
    if (!location || location.organizationId !== state.organizationId) {
      throw new ConvexError("Lokationen blev ikke fundet");
    }
    await ctx.db.patch(state._id, { consumedAt: args.now });
    const onboardingEventId = await ctx.db.insert("woltOnboardingEvents", {
      organizationId: state.organizationId,
      locationId: state.locationId,
      mode: "ssio",
      authorizationCodeHash: args.authorizationCodeHash,
      authorizationCodeCiphertext: args.authorizationCodeCiphertext,
      redirectUri: state.redirectUri,
      redirectUriAllowed: true,
      state: "pending",
      attemptCount: 0,
      nextAttemptAt: args.now,
      expiresAt: args.now + 60 * 60 * 1_000,
      createdAt: args.now,
      updatedAt: args.now,
    });
    await ctx.scheduler.runAfter(0, internal.woltSync.processOnboardingEvent, {
      onboardingEventId,
    });
    return { returnPath: state.returnPath };
  },
});

export const acceptWioOnboarding = internalMutation({
  args: {
    partnerVenueId: v.string(),
    authorizationCodeHash: v.string(),
    authorizationCodeCiphertext: v.string(),
    redirectUri: v.string(),
    now: v.number(),
  },
  returns: inboxResultValidator,
  handler: async (ctx, args) => {
    const [existingEvent, existingQuarantine] = await Promise.all([
      ctx.db
        .query("woltOnboardingEvents")
        .withIndex("by_authorizationCodeHash", (q) =>
          q.eq("authorizationCodeHash", args.authorizationCodeHash),
        )
        .unique(),
      ctx.db
        .query("woltOnboardingQuarantine")
        .withIndex("by_authorizationCodeHash", (q) =>
          q.eq("authorizationCodeHash", args.authorizationCodeHash),
        )
        .unique(),
    ]);
    if (existingEvent || existingQuarantine) return { kind: "duplicate" as const };
    const mappings = await ctx.db
      .query("woltPartnerVenueMappings")
      .withIndex("by_partnerVenueId", (q) =>
        q.eq("partnerVenueId", args.partnerVenueId),
      )
      .take(2);
    const mapping = mappings.length === 1 ? mappings[0] : null;
    if (!mapping) {
      await ctx.db.insert("woltOnboardingQuarantine", {
        partnerVenueId: args.partnerVenueId,
        authorizationCodeHash: args.authorizationCodeHash,
        authorizationCodeCiphertext: args.authorizationCodeCiphertext,
        redirectUri: args.redirectUri,
        redirectUriAllowed: true,
        reason: mappings.length > 1 ? "partner-venue-id er tvetydigt" : "partner-venue-id er ukendt",
        createdAt: args.now,
        expiresAt: args.now + 60 * 60 * 1_000,
      });
      return { kind: "quarantined" as const };
    }
    const location = await ctx.db.get("locations", mapping.locationId);
    if (!location || location.organizationId !== mapping.organizationId) {
      await ctx.db.insert("woltOnboardingQuarantine", {
        partnerVenueId: args.partnerVenueId,
        authorizationCodeHash: args.authorizationCodeHash,
        authorizationCodeCiphertext: args.authorizationCodeCiphertext,
        redirectUri: args.redirectUri,
        redirectUriAllowed: true,
        reason: "lokationskoblingen er ugyldig",
        createdAt: args.now,
        expiresAt: args.now + 60 * 60 * 1_000,
      });
      return { kind: "quarantined" as const };
    }
    const onboardingEventId = await ctx.db.insert("woltOnboardingEvents", {
      organizationId: mapping.organizationId,
      locationId: mapping.locationId,
      partnerVenueId: args.partnerVenueId,
      mode: "wio",
      authorizationCodeHash: args.authorizationCodeHash,
      authorizationCodeCiphertext: args.authorizationCodeCiphertext,
      redirectUri: args.redirectUri,
      redirectUriAllowed: true,
      state: "pending",
      attemptCount: 0,
      nextAttemptAt: args.now,
      expiresAt: args.now + 60 * 60 * 1_000,
      createdAt: args.now,
      updatedAt: args.now,
    });
    await ctx.scheduler.runAfter(0, internal.woltSync.processOnboardingEvent, {
      onboardingEventId,
    });
    return { kind: "accepted" as const };
  },
});

export const claimOnboardingEvent = internalMutation({
  args: { onboardingEventId: v.id("woltOnboardingEvents"), runToken: v.string(), now: v.number() },
  returns: onboardingClaimValidator,
  handler: async (ctx, args) => {
    const event = await ctx.db.get("woltOnboardingEvents", args.onboardingEventId);
    if (
      !event ||
      event.state !== "pending" ||
      event.nextAttemptAt > args.now
    ) {
      return null;
    }
    if (event.expiresAt <= args.now || event.attemptCount >= MAX_ATTEMPTS) {
      await ctx.db.patch(event._id, {
        state: "deadLetter",
        authorizationCodeCiphertext: "",
        lastError: "Wolt-godkendelsen udløb før den kunne gennemføres",
        updatedAt: args.now,
      });
      return null;
    }
    const location = await ctx.db.get("locations", event.locationId);
    if (!location || location.organizationId !== event.organizationId) {
      await ctx.db.patch(event._id, {
        state: "deadLetter",
        authorizationCodeCiphertext: "",
        lastError: "Lokationen blev ikke fundet",
        updatedAt: args.now,
      });
      return null;
    }
    await ctx.db.patch(event._id, {
      state: "processing",
      runToken: args.runToken,
      attemptCount: event.attemptCount + 1,
      nextAttemptAt: args.now + 15 * 60 * 1_000,
      updatedAt: args.now,
    });
    return {
      onboardingEventId: event._id,
      runToken: args.runToken,
      organizationId: event.organizationId,
      locationId: event.locationId,
      partnerVenueId: event.partnerVenueId ?? null,
      mode: event.mode,
      authorizationCodeCiphertext: event.authorizationCodeCiphertext,
      redirectUri: event.redirectUri,
      attemptCount: event.attemptCount + 1,
    };
  },
});

export const completeOnboardingEvent = internalMutation({
  args: {
    onboardingEventId: v.id("woltOnboardingEvents"),
    runToken: v.string(),
    venueId: v.string(),
    accessTokenCiphertext: v.string(),
    refreshTokenCiphertext: v.string(),
    accessTokenExpiresAt: v.number(),
    refreshTokenExpiresAt: v.number(),
    now: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get("woltOnboardingEvents", args.onboardingEventId);
    if (!event || event.state !== "processing" || event.runToken !== args.runToken) return false;
    const conflicts = await ctx.db
      .query("woltVenueConnections")
      .withIndex("by_venueId", (q) => q.eq("venueId", args.venueId))
      .take(2);
    if (
      conflicts.some(
        (connection) =>
          connection.organizationId !== event.organizationId ||
          connection.locationId !== event.locationId,
      )
    ) {
      await ctx.db.patch(event._id, {
        state: "deadLetter",
        runToken: undefined,
        authorizationCodeCiphertext: "",
        lastError: "Wolt-venuet er allerede koblet til en anden lokation",
        updatedAt: args.now,
      });
      return false;
    }
    const existing = await ctx.db
      .query("woltVenueConnections")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", event.organizationId).eq("locationId", event.locationId),
      )
      .unique();
    const connection = {
      venueId: args.venueId,
      partnerVenueId: event.partnerVenueId ?? undefined,
      onboardingMode: event.mode,
      state: "ready" as const,
      accessTokenCiphertext: args.accessTokenCiphertext,
      refreshTokenCiphertext: args.refreshTokenCiphertext,
      accessTokenExpiresAt: args.accessTokenExpiresAt,
      refreshTokenExpiresAt: args.refreshTokenExpiresAt,
      tokenVersion: (existing?.tokenVersion ?? 0) + 1,
      refreshLeaseId: undefined,
      refreshLeaseExpiresAt: undefined,
      activatedAt: args.now,
      disabledAt: undefined,
      lastError: undefined,
      updatedAt: args.now,
    };
    if (existing) await ctx.db.patch(existing._id, connection);
    else {
      await ctx.db.insert("woltVenueConnections", {
        organizationId: event.organizationId,
        locationId: event.locationId,
        ...connection,
      });
    }
    const adopted = await adoptWebhookQuarantineRows(
      ctx,
      event.organizationId,
      event.locationId,
      args.venueId,
    );
    if (adopted.more) {
      await ctx.scheduler.runAfter(0, internal.woltSync.adoptWebhookQuarantine, {
        organizationId: event.organizationId,
        locationId: event.locationId,
        venueId: args.venueId,
      });
    }
    await ctx.db.patch(event._id, {
      state: "completed",
      runToken: undefined,
      lastError: undefined,
      authorizationCodeCiphertext: "",
      updatedAt: args.now,
    });
    return true;
  },
});

export const adoptWebhookQuarantine = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    venueId: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("woltVenueConnections")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", args.organizationId).eq("locationId", args.locationId),
      )
      .unique();
    if (!connection || connection.state !== "ready" || connection.venueId !== args.venueId) {
      return 0;
    }
    const result = await adoptWebhookQuarantineRows(
      ctx,
      args.organizationId,
      args.locationId,
      args.venueId,
    );
    if (result.more) {
      await ctx.scheduler.runAfter(0, internal.woltSync.adoptWebhookQuarantine, args);
    }
    return result.adopted;
  },
});

export const failOnboardingEvent = internalMutation({
  args: {
    onboardingEventId: v.id("woltOnboardingEvents"),
    runToken: v.string(),
    retryable: v.boolean(),
    retryAfterMs: v.optional(v.number()),
    message: v.string(),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get("woltOnboardingEvents", args.onboardingEventId);
    if (!event || event.state !== "processing" || event.runToken !== args.runToken) return null;
    const canRetry = args.retryable && event.attemptCount < MAX_ATTEMPTS && event.expiresAt > args.now;
    const delay = retryDelay(
      event.attemptCount,
      args.retryAfterMs,
      args.now + event.attemptCount * 997,
    );
    await ctx.db.patch(event._id, {
      state: canRetry ? "pending" : "deadLetter",
      runToken: undefined,
      nextAttemptAt: canRetry ? args.now + delay : event.nextAttemptAt,
      authorizationCodeCiphertext: canRetry
        ? event.authorizationCodeCiphertext
        : "",
      lastError: args.message.slice(0, MAX_PROVIDER_ERROR),
      updatedAt: args.now,
    });
    if (canRetry) {
      await ctx.scheduler.runAfter(delay, internal.woltSync.processOnboardingEvent, {
        onboardingEventId: event._id,
      });
    }
    return null;
  },
});

export const processOnboardingEvent = internalAction({
  args: { onboardingEventId: v.id("woltOnboardingEvents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const runToken = randomWoltSecret(16);
    const claim = await ctx.runMutation(internal.woltSync.claimOnboardingEvent, {
      ...args,
      runToken,
      now: Date.now(),
    });
    if (!claim) return null;
    try {
      const code = await decryptWoltSecret(claim.authorizationCodeCiphertext);
      const tokens = await exchangeWoltAuthorizationCode(code, claim.redirectUri);
      const now = Date.now();
      await ctx.runMutation(internal.woltSync.completeOnboardingEvent, {
        onboardingEventId: claim.onboardingEventId,
        runToken,
        venueId: tokens.venueId,
        accessTokenCiphertext: await encryptWoltSecret(tokens.accessToken),
        refreshTokenCiphertext: await encryptWoltSecret(tokens.refreshToken),
        accessTokenExpiresAt: now + tokens.accessExpiresIn * 1_000,
        refreshTokenExpiresAt: now + tokens.refreshExpiresIn * 1_000,
        now,
      });
    } catch (error) {
      await ctx.runMutation(internal.woltSync.failOnboardingEvent, {
        onboardingEventId: claim.onboardingEventId,
        runToken,
        retryable: isRetryable(error),
        retryAfterMs: error instanceof WoltProviderError ? error.retryAfterMs : undefined,
        message: errorMessage(error),
        now: Date.now(),
      });
    }
    return null;
  },
});

export const claimWebhookEvent = internalMutation({
  args: { eventId: v.id("woltWebhookEvents"), runToken: v.string(), now: v.number() },
  returns: webhookClaimValidator,
  handler: async (ctx, args) => {
    const event = await ctx.db.get("woltWebhookEvents", args.eventId);
    if (!event || event.state !== "pending" || event.nextAttemptAt > args.now) return null;
    if (event.attemptCount >= MAX_ATTEMPTS) {
      await ctx.db.patch(event._id, {
        state: "deadLetter",
        lastError: "Wolt-eventet nåede grænsen for genforsøg",
      });
      return null;
    }
    const connection = await ctx.db
      .query("woltVenueConnections")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", event.organizationId).eq("locationId", event.locationId),
      )
      .unique();
    if (!connection || connection.venueId !== event.venueId || connection.state !== "ready") {
      await ctx.db.patch(event._id, {
        state: "deadLetter",
        lastError: "Wolt-forbindelsen er ikke aktiv",
      });
      return null;
    }
    await ctx.db.patch(event._id, {
      state: "processing",
      runToken: args.runToken,
      attemptCount: event.attemptCount + 1,
      nextAttemptAt: args.now + 15 * 60 * 1_000,
    });
    return {
      eventId: event._id,
      runToken: args.runToken,
      organizationId: event.organizationId,
      locationId: event.locationId,
      venueId: event.venueId,
      orderId: event.orderId,
      attemptCount: event.attemptCount + 1,
      accessTokenCiphertext: connection.accessTokenCiphertext,
      refreshTokenCiphertext: connection.refreshTokenCiphertext,
      accessTokenExpiresAt: connection.accessTokenExpiresAt,
      refreshTokenExpiresAt: connection.refreshTokenExpiresAt,
      tokenVersion: connection.tokenVersion,
    };
  },
});

export const acquireRefreshLease = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    expectedTokenVersion: v.number(),
    leaseId: v.string(),
    now: v.number(),
  },
  returns: refreshLeaseValidator,
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("woltVenueConnections")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", args.organizationId).eq("locationId", args.locationId),
      )
      .unique();
    if (!connection || connection.state !== "ready") {
      return { kind: "unavailable" as const };
    }
    if (connection.tokenVersion !== args.expectedTokenVersion) {
      return { kind: "busy" as const, retryAt: args.now + 1_000 };
    }
    if (
      connection.refreshLeaseId &&
      connection.refreshLeaseExpiresAt &&
      connection.refreshLeaseExpiresAt > args.now
    ) {
      return {
        kind: "busy" as const,
        retryAt: connection.refreshLeaseExpiresAt,
      };
    }
    await ctx.db.patch(connection._id, {
      refreshLeaseId: args.leaseId,
      refreshLeaseExpiresAt: args.now + REFRESH_LEASE_MS,
      updatedAt: args.now,
    });
    return {
      kind: "claimed" as const,
      leaseId: args.leaseId,
      tokenVersion: connection.tokenVersion,
      venueId: connection.venueId,
      refreshTokenCiphertext: connection.refreshTokenCiphertext,
    };
  },
});

export const commitRefresh = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    leaseId: v.string(),
    expectedTokenVersion: v.number(),
    venueId: v.string(),
    accessTokenCiphertext: v.string(),
    refreshTokenCiphertext: v.string(),
    accessTokenExpiresAt: v.number(),
    refreshTokenExpiresAt: v.number(),
    now: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("woltVenueConnections")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", args.organizationId).eq("locationId", args.locationId),
      )
      .unique();
    if (
      !connection ||
      connection.state !== "ready" ||
      connection.venueId !== args.venueId ||
      connection.tokenVersion !== args.expectedTokenVersion ||
      connection.refreshLeaseId !== args.leaseId
    ) {
      return false;
    }
    await ctx.db.patch(connection._id, {
      accessTokenCiphertext: args.accessTokenCiphertext,
      refreshTokenCiphertext: args.refreshTokenCiphertext,
      accessTokenExpiresAt: args.accessTokenExpiresAt,
      refreshTokenExpiresAt: args.refreshTokenExpiresAt,
      tokenVersion: connection.tokenVersion + 1,
      refreshLeaseId: undefined,
      refreshLeaseExpiresAt: undefined,
      lastError: undefined,
      updatedAt: args.now,
    });
    return true;
  },
});

export const releaseRefreshLease = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    leaseId: v.string(),
    expectedTokenVersion: v.number(),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("woltVenueConnections")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", args.organizationId).eq("locationId", args.locationId),
      )
      .unique();
    if (
      connection?.state === "ready" &&
      connection.tokenVersion === args.expectedTokenVersion &&
      connection.refreshLeaseId === args.leaseId
    ) {
      await ctx.db.patch(connection._id, {
        refreshLeaseId: undefined,
        refreshLeaseExpiresAt: undefined,
        updatedAt: args.now,
      });
    }
    return null;
  },
});

export const requireReauthorization = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    message: v.string(),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("woltVenueConnections")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", args.organizationId).eq("locationId", args.locationId),
      )
      .unique();
    if (connection && connection.state !== "disabled") {
      await ctx.db.patch(connection._id, {
        state: "reauthorizationRequired",
        accessTokenCiphertext: "",
        refreshTokenCiphertext: "",
        accessTokenExpiresAt: 0,
        refreshTokenExpiresAt: 0,
        refreshLeaseId: undefined,
        refreshLeaseExpiresAt: undefined,
        lastError: args.message.slice(0, MAX_PROVIDER_ERROR),
        updatedAt: args.now,
      });
    }
    return null;
  },
});

export const recordConnectionError = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    message: v.string(),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("woltVenueConnections")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("locationId", args.locationId),
      )
      .unique();
    if (connection?.state === "ready") {
      await ctx.db.patch(connection._id, {
        lastError: args.message.slice(0, MAX_PROVIDER_ERROR),
        updatedAt: args.now,
      });
    }
    return null;
  },
});

type AccessContext = {
  organizationId: string;
  locationId: Id<"locations">;
  venueId: string;
  accessTokenCiphertext: string;
  accessTokenExpiresAt: number;
  tokenVersion: number;
};

async function usableAccessToken(ctx: ActionCtx, connection: AccessContext) {
  if (connection.accessTokenExpiresAt > Date.now() + ACCESS_TOKEN_SKEW_MS) {
    return await decryptWoltSecret(connection.accessTokenCiphertext);
  }
  const leaseId = randomWoltSecret(16);
  const lease = await ctx.runMutation(internal.woltSync.acquireRefreshLease, {
    organizationId: connection.organizationId,
    locationId: connection.locationId,
    expectedTokenVersion: connection.tokenVersion,
    leaseId,
    now: Date.now(),
  });
  if (lease.kind === "unavailable") {
    throw new WoltProviderError("Wolt-forbindelsen kræver ny godkendelse", false);
  }
  if (lease.kind === "busy") {
    throw new WoltProviderError("Et andet token-skift er i gang", true, lease.retryAt - Date.now());
  }
  let rotated = false;
  try {
    const tokens = await refreshWoltTokens(
      await decryptWoltSecret(lease.refreshTokenCiphertext),
    );
    rotated = true;
    if (tokens.venueId !== lease.venueId) {
      throw new WoltProviderError("Tokenet tilhører et andet Wolt-venue", false);
    }
    const now = Date.now();
    const committed = await ctx.runMutation(internal.woltSync.commitRefresh, {
      organizationId: connection.organizationId,
      locationId: connection.locationId,
      leaseId,
      expectedTokenVersion: lease.tokenVersion,
      venueId: lease.venueId,
      accessTokenCiphertext: await encryptWoltSecret(tokens.accessToken),
      refreshTokenCiphertext: await encryptWoltSecret(tokens.refreshToken),
      accessTokenExpiresAt: now + tokens.accessExpiresIn * 1_000,
      refreshTokenExpiresAt: now + tokens.refreshExpiresIn * 1_000,
      now,
    });
    if (!committed) {
      await ctx.runMutation(internal.woltSync.requireReauthorization, {
        organizationId: connection.organizationId,
        locationId: connection.locationId,
        message: "Det roterede refresh-token kunne ikke gemmes",
        now: Date.now(),
      });
      throw new WoltProviderError("Wolt-forbindelsen kræver ny godkendelse", false);
    }
    return tokens.accessToken;
  } catch (error) {
    if (!rotated) {
      await ctx.runMutation(internal.woltSync.releaseRefreshLease, {
        organizationId: connection.organizationId,
        locationId: connection.locationId,
        leaseId,
        expectedTokenVersion: lease.tokenVersion,
        now: Date.now(),
      });
    }
    if (rotated || (error instanceof WoltProviderError && !error.retryable)) {
      await ctx.runMutation(internal.woltSync.requireReauthorization, {
        organizationId: connection.organizationId,
        locationId: connection.locationId,
        message: errorMessage(error),
        now: Date.now(),
      });
    }
    throw error;
  }
}

async function changeDaily(
  ctx: MutationCtx,
  contribution: ReturnType<typeof woltDailyContribution>,
  direction: 1 | -1,
) {
  const row = await ctx.db
    .query("woltSalesDaily")
    .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
      q
        .eq("organizationId", contribution.organizationId)
        .eq("locationId", contribution.locationId)
        .eq("dayStart", contribution.dayStart),
    )
    .unique();
  const delta = {
    revenue: direction * contribution.revenue,
    orderCount: direction * contribution.orderCount,
    itemCount: direction * contribution.itemCount,
    canceledCount: direction * contribution.canceledCount,
    totalCount: direction * contribution.totalCount,
  };
  if (row) {
    if (row.currency !== contribution.currency) throw new Error("Valutaen for dagsrækken er ændret");
    const next = {
      revenue: row.revenue + delta.revenue,
      orderCount: row.orderCount + delta.orderCount,
      itemCount: row.itemCount + delta.itemCount,
      canceledCount: row.canceledCount + delta.canceledCount,
      totalCount: row.totalCount + delta.totalCount,
    };
    if (Object.values(next).some((value) => value < -1e-6)) {
      throw new Error("Wolt-dagsrækken kan ikke blive negativ");
    }
    await ctx.db.patch(row._id, { ...next, updatedAt: Date.now() });
    return;
  }
  if (direction === -1) throw new Error("Det tidligere Wolt-bidrag mangler");
  await ctx.db.insert("woltSalesDaily", {
    ...contribution,
    updatedAt: Date.now(),
  });
}

async function markConnectionSuccess(
  ctx: MutationCtx,
  event: {
    organizationId: string;
    locationId: Id<"locations">;
    venueId: string;
  },
  now: number,
) {
  const connection = await ctx.db
    .query("woltVenueConnections")
    .withIndex("by_organizationId_and_locationId", (q) =>
      q
        .eq("organizationId", event.organizationId)
        .eq("locationId", event.locationId),
    )
    .unique();
  if (connection?.state === "ready" && connection.venueId === event.venueId) {
    await ctx.db.patch(connection._id, {
      lastSuccessAt: now,
      lastError: undefined,
      updatedAt: now,
    });
  }
}

export const applyOrderSnapshot = internalMutation({
  args: {
    eventId: v.id("woltWebhookEvents"),
    runToken: v.string(),
    snapshot: woltOrderSnapshotValidator,
    now: v.number(),
  },
  returns: v.union(v.literal("updated"), v.literal("outOfOrder"), v.literal("ignored")),
  handler: async (ctx, args) => {
    const event = await ctx.db.get("woltWebhookEvents", args.eventId);
    if (!event || event.state !== "processing" || event.runToken !== args.runToken) return "ignored";
    if (event.orderId !== args.snapshot.woltOrderId || event.venueId !== args.snapshot.venueId) {
      throw new Error("Webhook og ordre tilhører ikke samme Wolt-ressource");
    }
    const location = await ctx.db.get("locations", event.locationId);
    if (!location || location.organizationId !== event.organizationId) throw new Error("Lokationen blev ikke fundet");
    const existing = await ctx.db
      .query("woltOrders")
      .withIndex("by_organizationId_and_woltOrderId", (q) =>
        q.eq("organizationId", event.organizationId).eq("woltOrderId", event.orderId),
      )
      .unique();
    if (existing && existing.modifiedAt >= args.snapshot.modifiedAt) {
      await ctx.db.patch(event._id, {
        state: "completed",
        runToken: undefined,
        lastError: undefined,
        completedAt: args.now,
      });
      await markConnectionSuccess(ctx, event, args.now);
      return "outOfOrder";
    }
    const timeZone = await resolveTimeZone(ctx, event.organizationId, event.locationId);
    if (existing) {
      const oldContribution = woltDailyContribution(
        event.organizationId,
        event.locationId,
        timeZone,
        {
          occurredAt: existing.occurredAt,
          currency: existing.currency,
          basketPrice: existing.basketPrice,
          refundAmount: existing.refundAmount,
          itemCount: existing.itemCount,
          status: existing.status,
        },
      );
      oldContribution.dayStart = existing.dayStart;
      oldContribution.date = existing.date;
      await changeDaily(
        ctx,
        oldContribution,
        -1,
      );
    }
    const nextContribution = woltDailyContribution(
      event.organizationId,
      event.locationId,
      timeZone,
      args.snapshot,
    );
    await changeDaily(ctx, nextContribution, 1);

    const values = {
      venueId: args.snapshot.venueId,
      displayNumber: args.snapshot.displayNumber,
      normalizedDisplayNumber: args.snapshot.displayNumber.trim().toLocaleLowerCase("da-DK"),
      status: args.snapshot.status,
      providerStatus: args.snapshot.providerStatus,
      orderType: args.snapshot.orderType,
      occurredAt: args.snapshot.occurredAt,
      dayStart: nextContribution.dayStart,
      date: nextContribution.date,
      providerCreatedAt: args.snapshot.providerCreatedAt,
      scheduledAt: args.snapshot.scheduledAt,
      modifiedAt: args.snapshot.modifiedAt,
      basketPrice: args.snapshot.basketPrice,
      refundAmount: undefined,
      netRevenue: args.snapshot.status === "delivered" ? args.snapshot.basketPrice : 0,
      currency: args.snapshot.currency,
      itemCount: args.snapshot.itemCount,
      contributionVersion: 1,
      updatedAt: args.now,
    };
    let orderId: Id<"woltOrders">;
    if (existing) {
      orderId = existing._id;
      const oldItems = await ctx.db
        .query("woltOrderItems")
        .withIndex("by_organizationId_and_orderId", (q) =>
          q.eq("organizationId", event.organizationId).eq("orderId", existing._id),
        )
        .take(MAX_ITEMS + 1);
      if (oldItems.length > MAX_ITEMS) throw new Error("Ordren har for mange gemte linjer");
      for (const item of oldItems) await ctx.db.delete(item._id);
      await ctx.db.patch(existing._id, values);
    } else {
      orderId = await ctx.db.insert("woltOrders", {
        organizationId: event.organizationId,
        locationId: event.locationId,
        woltOrderId: args.snapshot.woltOrderId,
        ...values,
      });
    }
    for (const item of args.snapshot.items) {
      await ctx.db.insert("woltOrderItems", {
        organizationId: event.organizationId,
        locationId: event.locationId,
        orderId,
        woltOrderId: args.snapshot.woltOrderId,
        ...item,
        occurredAt: args.snapshot.occurredAt,
        status: args.snapshot.status,
        orderType: args.snapshot.orderType,
        observedAt: args.snapshot.occurredAt,
      });
    }
    await ctx.db.patch(event._id, {
      state: "completed",
      runToken: undefined,
      lastError: undefined,
      completedAt: args.now,
    });
    await markConnectionSuccess(ctx, event, args.now);
    return "updated";
  },
});

export const failWebhookEvent = internalMutation({
  args: {
    eventId: v.id("woltWebhookEvents"),
    runToken: v.string(),
    retryable: v.boolean(),
    retryAfterMs: v.optional(v.number()),
    message: v.string(),
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get("woltWebhookEvents", args.eventId);
    if (!event || event.state !== "processing" || event.runToken !== args.runToken) return null;
    const canRetry = args.retryable && event.attemptCount < MAX_ATTEMPTS;
    const delay = retryDelay(
      event.attemptCount,
      args.retryAfterMs,
      args.now + event.attemptCount * 997,
    );
    await ctx.db.patch(event._id, {
      state: canRetry ? "pending" : "deadLetter",
      runToken: undefined,
      nextAttemptAt: canRetry ? args.now + delay : event.nextAttemptAt,
      lastError: args.message.slice(0, MAX_PROVIDER_ERROR),
    });
    const connection = await ctx.db
      .query("woltVenueConnections")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", event.organizationId).eq("locationId", event.locationId),
      )
      .unique();
    if (connection) {
      await ctx.db.patch(connection._id, {
        lastError: args.message.slice(0, MAX_PROVIDER_ERROR),
        updatedAt: args.now,
      });
    }
    if (canRetry) {
      await ctx.scheduler.runAfter(delay, internal.woltSync.processWebhookEvent, {
        eventId: event._id,
      });
    }
    return null;
  },
});

export const processWebhookEvent = internalAction({
  args: { eventId: v.id("woltWebhookEvents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const runToken = randomWoltSecret(16);
    const claim = await ctx.runMutation(internal.woltSync.claimWebhookEvent, {
      ...args,
      runToken,
      now: Date.now(),
    });
    if (!claim) return null;
    try {
      const accessToken = await usableAccessToken(ctx, claim);
      const snapshot = await requestWoltOrder(claim.orderId, accessToken);
      await ctx.runMutation(internal.woltSync.applyOrderSnapshot, {
        eventId: claim.eventId,
        runToken,
        snapshot,
        now: Date.now(),
      });
    } catch (error) {
      if (
        error instanceof WoltProviderError &&
        (error.status === 401 || error.status === 403)
      ) {
        await ctx.runMutation(internal.woltSync.requireReauthorization, {
          organizationId: claim.organizationId,
          locationId: claim.locationId,
          message: errorMessage(error),
          now: Date.now(),
        });
      }
      await ctx.runMutation(internal.woltSync.failWebhookEvent, {
        eventId: claim.eventId,
        runToken,
        retryable: isRetryable(error),
        retryAfterMs: error instanceof WoltProviderError ? error.retryAfterMs : undefined,
        message: errorMessage(error),
        now: Date.now(),
      });
    }
    return null;
  },
});

export const rerollLocationDays = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    timeZone: v.string(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const location = await ctx.db.get("locations", args.locationId);
    if (!location || location.organizationId !== args.organizationId) return null;
    if (
      (await resolveTimeZone(ctx, args.organizationId, args.locationId)) !==
      args.timeZone
    ) {
      return null;
    }
    const page = await ctx.db
      .query("woltOrders")
      .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
        q.eq("organizationId", args.organizationId).eq("locationId", args.locationId),
      )
      .order("asc")
      .paginate({ cursor: args.cursor, numItems: 50 });
    for (const order of page.page) {
      const next = woltDailyContribution(
        args.organizationId,
        args.locationId,
        args.timeZone,
        {
          occurredAt: order.occurredAt,
          currency: order.currency,
          basketPrice: order.basketPrice,
          refundAmount: order.refundAmount,
          itemCount: order.itemCount,
          status: order.status,
        },
      );
      if (next.dayStart === order.dayStart && next.date === order.date) continue;
      const previous = { ...next, dayStart: order.dayStart, date: order.date };
      await changeDaily(ctx, previous, -1);
      await changeDaily(ctx, next, 1);
      await ctx.db.patch(order._id, { dayStart: next.dayStart, date: next.date });
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.woltSync.rerollLocationDays, {
        ...args,
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});

export const dispatchPendingJobs = internalMutation({
  args: {},
  returns: v.object({ webhooks: v.number(), onboarding: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const [webhooks, onboarding, stuckWebhooks, stuckOnboarding] = await Promise.all([
      ctx.db
        .query("woltWebhookEvents")
        .withIndex("by_state_and_nextAttemptAt", (q) =>
          q.eq("state", "pending").lte("nextAttemptAt", now),
        )
        .take(JOB_BATCH),
      ctx.db
        .query("woltOnboardingEvents")
        .withIndex("by_state_and_nextAttemptAt", (q) =>
          q.eq("state", "pending").lte("nextAttemptAt", now),
        )
        .take(JOB_BATCH),
      ctx.db
        .query("woltWebhookEvents")
        .withIndex("by_state_and_nextAttemptAt", (q) =>
          q.eq("state", "processing").lte("nextAttemptAt", now),
        )
        .take(JOB_BATCH),
      ctx.db
        .query("woltOnboardingEvents")
        .withIndex("by_state_and_nextAttemptAt", (q) =>
          q.eq("state", "processing").lte("nextAttemptAt", now),
        )
        .take(JOB_BATCH),
    ]);
    for (const event of stuckWebhooks) {
      const exhausted = event.attemptCount >= MAX_ATTEMPTS;
      await ctx.db.patch(event._id, {
        state: exhausted ? "deadLetter" : "pending",
        runToken: undefined,
        nextAttemptAt: now,
        lastError: exhausted
          ? "Wolt-eventet nåede grænsen efter et afbrudt job"
          : "Et afbrudt job blev startet igen",
      });
      if (!exhausted) webhooks.push(event);
    }
    for (const event of stuckOnboarding) {
      const exhausted =
        event.attemptCount >= MAX_ATTEMPTS || event.expiresAt <= now;
      await ctx.db.patch(event._id, {
        state: exhausted ? "deadLetter" : "pending",
        runToken: undefined,
        nextAttemptAt: now,
        authorizationCodeCiphertext: exhausted
          ? ""
          : event.authorizationCodeCiphertext,
        lastError: exhausted
          ? "Wolt-godkendelsen udløb efter et afbrudt job"
          : "Et afbrudt job blev startet igen",
        updatedAt: now,
      });
      if (!exhausted) onboarding.push(event);
    }
    for (const event of webhooks) {
      await ctx.scheduler.runAfter(0, internal.woltSync.processWebhookEvent, { eventId: event._id });
    }
    for (const event of onboarding) {
      await ctx.scheduler.runAfter(0, internal.woltSync.processOnboardingEvent, {
        onboardingEventId: event._id,
      });
    }
    return { webhooks: webhooks.length, onboarding: onboarding.length };
  },
});

export const getConnectionForRefresh = internalQuery({
  args: { connectionId: v.id("woltVenueConnections") },
  returns: v.union(
    v.object({
      organizationId: v.string(),
      locationId: v.id("locations"),
      venueId: v.string(),
      accessTokenCiphertext: v.string(),
      accessTokenExpiresAt: v.number(),
      tokenVersion: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get("woltVenueConnections", args.connectionId);
    if (!connection || connection.state !== "ready") return null;
    return {
      organizationId: connection.organizationId,
      locationId: connection.locationId,
      venueId: connection.venueId,
      accessTokenCiphertext: connection.accessTokenCiphertext,
      accessTokenExpiresAt: connection.accessTokenExpiresAt,
      tokenVersion: connection.tokenVersion,
    };
  },
});

export const refreshConnection = internalAction({
  args: { connectionId: v.id("woltVenueConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.runQuery(internal.woltSync.getConnectionForRefresh, args);
    if (!connection) return null;
    try {
      await usableAccessToken(ctx, connection);
    } catch (error) {
      // The refresh helper records terminal token loss. Retryable failures are
      // picked up by the next maintenance pass.
      await ctx.runMutation(internal.woltSync.recordConnectionError, {
        organizationId: connection.organizationId,
        locationId: connection.locationId,
        message: errorMessage(error),
        now: Date.now(),
      });
    }
    return null;
  },
});

export const dispatchTokenMaintenance = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const refreshBefore = Date.now() + ACCESS_TOKEN_SKEW_MS;
    const connections = await ctx.db
      .query("woltVenueConnections")
      .withIndex("by_state_and_accessTokenExpiresAt", (q) =>
        q.eq("state", "ready").lte("accessTokenExpiresAt", refreshBefore),
      )
      .take(25);
    for (const connection of connections) {
      await ctx.scheduler.runAfter(0, internal.woltSync.refreshConnection, {
        connectionId: connection._id,
      });
    }
    if (connections.length === 25) {
      await ctx.scheduler.runAfter(60_000, internal.woltSync.dispatchTokenMaintenance, {});
    }
    return connections.length;
  },
});

async function deleteMany(
  ctx: MutationCtx,
  documents: Array<{ _id: Id<TableNames> }>,
) {
  for (const document of documents) await ctx.db.delete(document._id);
}

export const prune = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number(), more: v.boolean() }),
  handler: async (ctx) => {
    const now = Date.now();
    const [
      oauthStates,
      onboarding,
      onboardingQuarantine,
      webhookEvents,
      webhookQuarantine,
      items,
      disabledConnections,
    ] = await Promise.all([
        ctx.db.query("woltOAuthStates").withIndex("by_expiresAt", (q) => q.lt("expiresAt", now)).take(100),
        ctx.db
          .query("woltOnboardingEvents")
          .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now - ONBOARDING_RETENTION_MS))
          .take(100),
        ctx.db
          .query("woltOnboardingQuarantine")
          .withIndex("by_expiresAt", (q) => q.lt("expiresAt", now))
          .take(100),
        ctx.db
          .query("woltWebhookEvents")
          .withIndex("by_receivedAt", (q) => q.lt("receivedAt", now - DETAIL_RETENTION_MS))
          .take(100),
        ctx.db
          .query("woltWebhookQuarantine")
          .withIndex("by_receivedAt", (q) => q.lt("receivedAt", now - QUARANTINE_RETENTION_MS))
          .take(100),
        ctx.db
          .query("woltOrderItems")
          .withIndex("by_observedAt", (q) => q.lt("observedAt", now - DETAIL_RETENTION_MS))
          .take(100),
        ctx.db
          .query("woltVenueConnections")
          .withIndex("by_state_and_disabledAt", (q) =>
            q.eq("state", "disabled").lt("disabledAt", now - DETAIL_RETENTION_MS),
          )
          .take(100),
      ]);
    await deleteMany(ctx, [
      ...oauthStates,
      ...onboarding,
      ...onboardingQuarantine,
      ...webhookEvents,
      ...webhookQuarantine,
      ...items,
      ...disabledConnections,
    ]);
    const orders = await ctx.db
      .query("woltOrders")
      .withIndex("by_occurredAt", (q) => q.lt("occurredAt", now - DETAIL_RETENTION_MS))
      .take(100);
    let deletedOrders = 0;
    for (const order of orders) {
      const child = await ctx.db
        .query("woltOrderItems")
        .withIndex("by_organizationId_and_orderId", (q) =>
          q.eq("organizationId", order.organizationId).eq("orderId", order._id),
        )
        .first();
      if (!child) {
        await ctx.db.delete(order._id);
        deletedOrders += 1;
      }
    }
    const deleted =
      oauthStates.length +
      onboarding.length +
      onboardingQuarantine.length +
      webhookEvents.length +
      webhookQuarantine.length +
      items.length +
      disabledConnections.length +
      deletedOrders;
    const more =
      oauthStates.length === 100 ||
      onboarding.length === 100 ||
      onboardingQuarantine.length === 100 ||
      webhookEvents.length === 100 ||
      webhookQuarantine.length === 100 ||
      items.length === 100 ||
      disabledConnections.length === 100 ||
      orders.length === 100;
    if (more) await ctx.scheduler.runAfter(0, internal.woltSync.prune, {});
    return { deleted, more };
  },
});
