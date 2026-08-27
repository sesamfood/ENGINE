/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const envelope = {
  eventId: "event-1",
  orderId: "order-1",
  venueId: "venue-1",
  providerStatus: "CREATED",
  eventCreatedAt: Date.parse("2026-08-27T10:00:00.000Z"),
};

async function seedConnection(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const locationId = await ctx.db.insert("locations", {
      organizationId: "org-1",
      name: "Centrum",
      normalizedName: "centrum",
      timeZone: "Europe/Copenhagen",
    });
    const connectionId = await ctx.db.insert("woltVenueConnections", {
      organizationId: "org-1",
      locationId,
      venueId: "venue-1",
      onboardingMode: "ssio",
      state: "ready",
      accessTokenCiphertext: "encrypted-access",
      refreshTokenCiphertext: "encrypted-refresh",
      accessTokenExpiresAt: Date.now() + 60_000,
      refreshTokenExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1_000,
      tokenVersion: 1,
      activatedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { locationId, connectionId };
  });
}

test("webhook-inbox deduplikerer og sætter ukendte venues i karantæne", async () => {
  const t = convexTest(schema, modules);
  const unknown = await t.mutation(internal.woltSync.acceptWebhook, {
    envelope,
    receivedAt: Date.now(),
  });
  expect(unknown).toEqual({ kind: "quarantined" });
  expect(
    await t.mutation(internal.woltSync.acceptWebhook, {
      envelope,
      receivedAt: Date.now(),
    }),
  ).toEqual({ kind: "duplicate" });

  const knownEnvelope = { ...envelope, eventId: "event-2", venueId: "venue-2" };
  await t.run(async (ctx) => {
    const locationId = await ctx.db.insert("locations", {
      organizationId: "org-2",
      name: "Nord",
      normalizedName: "nord",
    });
    await ctx.db.insert("woltVenueConnections", {
      organizationId: "org-2",
      locationId,
      venueId: "venue-2",
      onboardingMode: "wio",
      state: "ready",
      accessTokenCiphertext: "encrypted-access",
      refreshTokenCiphertext: "encrypted-refresh",
      accessTokenExpiresAt: Date.now() + 60_000,
      refreshTokenExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1_000,
      tokenVersion: 1,
      activatedAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
  expect(
    await t.mutation(internal.woltSync.acceptWebhook, {
      envelope: knownEnvelope,
      receivedAt: Date.now(),
    }),
  ).toEqual({ kind: "accepted" });
  expect(
    await t.mutation(internal.woltSync.acceptWebhook, {
      envelope: knownEnvelope,
      receivedAt: Date.now(),
    }),
  ).toEqual({ kind: "duplicate" });
});

test("ældre snapshots kan ikke tilbagerulle ordre eller dagsrække", async () => {
  const t = convexTest(schema, modules);
  const { locationId, connectionId } = await seedConnection(t);
  const createEvent = async (eventId: string, runToken: string) =>
    await t.run(async (ctx) =>
      await ctx.db.insert("woltWebhookEvents", {
        eventId,
        organizationId: "org-1",
        locationId,
        venueId: "venue-1",
        orderId: "order-1",
        providerStatus: "DELIVERED",
        eventCreatedAt: Date.now(),
        state: "processing",
        runToken,
        attemptCount: 1,
        nextAttemptAt: Date.now() + 60_000,
        receivedAt: Date.now(),
      }),
    );
  const deliveredAt = Date.parse("2026-08-27T10:00:00.000Z");
  const eventId = await createEvent("event-delivered", "run-1");
  expect(
    await t.mutation(internal.woltSync.applyOrderSnapshot, {
      eventId,
      runToken: "run-1",
      snapshot: {
        woltOrderId: "order-1",
        venueId: "venue-1",
        displayNumber: "10",
        status: "delivered",
        providerStatus: "delivered",
        orderType: "instant",
        providerCreatedAt: deliveredAt,
        occurredAt: deliveredAt,
        modifiedAt: deliveredAt + 5_000,
        basketPrice: 12_500,
        currency: "DKK",
        itemCount: 2,
        items: [
          {
            itemId: "item-1",
            name: "Burger",
            normalizedName: "burger",
            quantity: 2,
            posId: "POS-1",
            unitPrice: 6_250,
            lineTotal: 12_500,
            currency: "DKK",
          },
        ],
      },
      now: deliveredAt + 10_000,
    }),
  ).toBe("updated");

  await t.run(async (ctx) => {
    await ctx.db.patch("woltVenueConnections", connectionId, {
      lastSuccessAt: 1,
      lastError: "Midlertidig fejl",
    });
  });

  const oldEventId = await createEvent("event-old", "run-2");
  expect(
    await t.mutation(internal.woltSync.applyOrderSnapshot, {
      eventId: oldEventId,
      runToken: "run-2",
      snapshot: {
        woltOrderId: "order-1",
        venueId: "venue-1",
        displayNumber: "10",
        status: "canceled",
        providerStatus: "rejected",
        orderType: "instant",
        providerCreatedAt: deliveredAt,
        occurredAt: deliveredAt,
        modifiedAt: deliveredAt,
        basketPrice: 12_500,
        currency: "DKK",
        itemCount: 2,
        items: [],
      },
      now: deliveredAt + 20_000,
    }),
  ).toBe("outOfOrder");

  const state = await t.run(async (ctx) => ({
    order: await ctx.db
      .query("woltOrders")
      .withIndex("by_organizationId_and_woltOrderId", (q) =>
        q.eq("organizationId", "org-1").eq("woltOrderId", "order-1"),
      )
      .unique(),
    daily: await ctx.db
      .query("woltSalesDaily")
      .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
        q.eq("organizationId", "org-1").eq("locationId", locationId),
      )
      .unique(),
    connection: await ctx.db.get("woltVenueConnections", connectionId),
  }));
  expect(state.order?.status).toBe("delivered");
  expect(state.daily).toMatchObject({ revenue: 12_500, orderCount: 1, canceledCount: 0 });
  expect(state.connection?.lastSuccessAt).toBe(deliveredAt + 20_000);
  expect(state.connection?.lastError).toBeUndefined();
  const storedItem = await t.run(async (ctx) =>
    await ctx.db
      .query("woltOrderItems")
      .withIndex("by_organizationId_and_orderId", (q) =>
        q.eq("organizationId", "org-1").eq("orderId", state.order!._id),
      )
      .unique(),
  );
  expect(storedItem).toMatchObject({
    occurredAt: deliveredAt,
    status: "delivered",
    orderType: "instant",
  });
});

test("refresh-token lease tillader kun én rotation for samme version", async () => {
  const t = convexTest(schema, modules);
  const { locationId } = await seedConnection(t);
  const first = await t.mutation(internal.woltSync.acquireRefreshLease, {
    organizationId: "org-1",
    locationId,
    expectedTokenVersion: 1,
    leaseId: "lease-1",
    now: 1_000,
  });
  const second = await t.mutation(internal.woltSync.acquireRefreshLease, {
    organizationId: "org-1",
    locationId,
    expectedTokenVersion: 1,
    leaseId: "lease-2",
    now: 1_001,
  });
  expect(first).toMatchObject({ kind: "claimed", leaseId: "lease-1" });
  expect(second).toMatchObject({ kind: "busy" });

  const committed = await t.mutation(internal.woltSync.commitRefresh, {
    organizationId: "org-1",
    locationId,
    leaseId: "lease-1",
    expectedTokenVersion: 1,
    venueId: "venue-1",
    accessTokenCiphertext: "new-access",
    refreshTokenCiphertext: "new-refresh",
    accessTokenExpiresAt: 100_000,
    refreshTokenExpiresAt: 1_000_000,
    now: 2_000,
  });
  expect(committed).toBe(true);
  expect(
    await t.mutation(internal.woltSync.commitRefresh, {
      organizationId: "org-1",
      locationId,
      leaseId: "lease-1",
      expectedTokenVersion: 1,
      venueId: "venue-1",
      accessTokenCiphertext: "lost-access",
      refreshTokenCiphertext: "lost-refresh",
      accessTokenExpiresAt: 100_000,
      refreshTokenExpiresAt: 1_000_000,
      now: 2_001,
    }),
  ).toBe(false);
});

test("udløbne og afbrudte jobs bliver terminale og rydder engangskoder", async () => {
  const t = convexTest(schema, modules);
  const { locationId } = await seedConnection(t);
  const { onboardingEventId, webhookEventId } = await t.run(async (ctx) => ({
    onboardingEventId: await ctx.db.insert("woltOnboardingEvents", {
      organizationId: "org-1",
      locationId,
      mode: "ssio",
      authorizationCodeHash: "code-hash",
      authorizationCodeCiphertext: "encrypted-code",
      redirectUri: "https://example.com/callback",
      redirectUriAllowed: true,
      state: "processing",
      runToken: "stuck-onboarding",
      attemptCount: 8,
      nextAttemptAt: 1,
      expiresAt: 2,
      createdAt: 1,
      updatedAt: 1,
    }),
    webhookEventId: await ctx.db.insert("woltWebhookEvents", {
      eventId: "stuck-event",
      organizationId: "org-1",
      locationId,
      venueId: "venue-1",
      orderId: "stuck-order",
      providerStatus: "CREATED",
      eventCreatedAt: 1,
      state: "processing",
      runToken: "stuck-webhook",
      attemptCount: 8,
      nextAttemptAt: 1,
      receivedAt: 1,
    }),
  }));

  await t.mutation(internal.woltSync.dispatchPendingJobs, {});

  const terminal = await t.run(async (ctx) => ({
    onboarding: await ctx.db.get("woltOnboardingEvents", onboardingEventId),
    webhook: await ctx.db.get("woltWebhookEvents", webhookEventId),
  }));
  expect(terminal.onboarding).toMatchObject({
    state: "deadLetter",
    authorizationCodeCiphertext: "",
  });
  expect(terminal.webhook?.state).toBe("deadLetter");
});
