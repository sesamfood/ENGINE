import { defineTable } from "convex/server";
import { v } from "convex/values";
import { woltStoredCredentialsValidator } from "./lib/credentialValidators";
import { woltConnectionStateValidator, woltJobStateValidator, woltOnboardingModeValidator, woltOrderStatusValidator, woltOrderTypeValidator, woltProductMatchTypeValidator } from "./lib/validators";

export const woltTables = {
  woltIntegrations: defineTable({
    organizationId: v.string(),
    credentials: v.optional(woltStoredCredentialsValidator),
    enabled: v.boolean(),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),

  woltVenueConnections: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    venueId: v.string(),
    partnerVenueId: v.optional(v.string()),
    onboardingMode: woltOnboardingModeValidator,
    state: woltConnectionStateValidator,
    accessTokenCiphertext: v.string(),
    refreshTokenCiphertext: v.string(),
    accessTokenExpiresAt: v.number(),
    refreshTokenExpiresAt: v.number(),
    tokenVersion: v.number(),
    refreshLeaseId: v.optional(v.string()),
    refreshLeaseExpiresAt: v.optional(v.number()),
    activatedAt: v.number(),
    disabledAt: v.optional(v.number()),
    lastWebhookAt: v.optional(v.number()),
    lastSuccessAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_locationId", [
      "organizationId",
      "locationId",
    ])
    .index("by_venueId", ["venueId"])
    .index("by_state_and_accessTokenExpiresAt", [
      "state",
      "accessTokenExpiresAt",
    ])
    .index("by_state_and_disabledAt", ["state", "disabledAt"]),

  woltOAuthStates: defineTable({
    stateHash: v.string(),
    organizationId: v.string(),
    locationId: v.id("locations"),
    userId: v.string(),
    redirectUri: v.string(),
    returnPath: v.string(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_stateHash", ["stateHash"])
    .index("by_expiresAt", ["expiresAt"])
    .index("by_organizationId_and_locationId", [
      "organizationId",
      "locationId",
    ]),

  woltPartnerVenueMappings: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    partnerVenueId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_locationId", [
      "organizationId",
      "locationId",
    ])
    .index("by_partnerVenueId", ["partnerVenueId"]),

  woltOnboardingEvents: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    partnerVenueId: v.optional(v.string()),
    mode: woltOnboardingModeValidator,
    authorizationCodeHash: v.string(),
    authorizationCodeCiphertext: v.string(),
    redirectUri: v.string(),
    redirectUriAllowed: v.literal(true),
    state: woltJobStateValidator,
    runToken: v.optional(v.string()),
    attemptCount: v.number(),
    nextAttemptAt: v.number(),
    lastError: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_authorizationCodeHash", ["authorizationCodeHash"])
    .index("by_state_and_nextAttemptAt", ["state", "nextAttemptAt"])
    .index("by_organizationId_and_state", ["organizationId", "state"])
    .index("by_organizationId_and_locationId", [
      "organizationId",
      "locationId",
    ])
    .index("by_expiresAt", ["expiresAt"]),

  woltOnboardingQuarantine: defineTable({
    organizationId: v.optional(v.string()),
    partnerVenueId: v.string(),
    authorizationCodeHash: v.string(),
    authorizationCodeCiphertext: v.string(),
    redirectUri: v.string(),
    redirectUriAllowed: v.literal(true),
    reason: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_authorizationCodeHash", ["authorizationCodeHash"])
    .index("by_partnerVenueId", ["partnerVenueId"])
    .index("by_expiresAt", ["expiresAt"]),

  woltWebhookEvents: defineTable({
    eventId: v.string(),
    organizationId: v.string(),
    locationId: v.id("locations"),
    venueId: v.string(),
    orderId: v.string(),
    providerStatus: v.string(),
    eventCreatedAt: v.number(),
    state: woltJobStateValidator,
    runToken: v.optional(v.string()),
    attemptCount: v.number(),
    nextAttemptAt: v.number(),
    lastError: v.optional(v.string()),
    receivedAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_eventId", ["eventId"])
    .index("by_venueId_and_eventId", ["venueId", "eventId"])
    .index("by_state_and_nextAttemptAt", ["state", "nextAttemptAt"])
    .index("by_organizationId_and_state", ["organizationId", "state"])
    .index("by_organizationId_and_locationId_and_state", [
      "organizationId",
      "locationId",
      "state",
    ])
    .index("by_organizationId_and_locationId_and_receivedAt", [
      "organizationId",
      "locationId",
      "receivedAt",
    ])
    .index("by_organizationId_and_orderId_and_receivedAt", [
      "organizationId",
      "orderId",
      "receivedAt",
    ])
    .index("by_receivedAt", ["receivedAt"]),

  woltWebhookQuarantine: defineTable({
    organizationId: v.optional(v.string()),
    eventId: v.string(),
    venueId: v.string(),
    orderId: v.string(),
    providerStatus: v.string(),
    eventCreatedAt: v.number(),
    reason: v.string(),
    receivedAt: v.number(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_venueId_and_eventId", ["venueId", "eventId"])
    .index("by_venueId_and_receivedAt", ["venueId", "receivedAt"])
    .index("by_organizationId_and_venueId_and_receivedAt", ["organizationId", "venueId", "receivedAt"])
    .index("by_receivedAt", ["receivedAt"]),

  woltOrders: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    venueId: v.string(),
    woltOrderId: v.string(),
    displayNumber: v.string(),
    normalizedDisplayNumber: v.string(),
    status: woltOrderStatusValidator,
    providerStatus: v.string(),
    orderType: woltOrderTypeValidator,
    occurredAt: v.number(),
    dayStart: v.number(),
    date: v.string(),
    providerCreatedAt: v.number(),
    scheduledAt: v.optional(v.number()),
    modifiedAt: v.number(),
    basketPrice: v.number(),
    refundAmount: v.optional(v.number()),
    netRevenue: v.number(),
    currency: v.string(),
    itemCount: v.number(),
    contributionVersion: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId_and_woltOrderId", [
      "organizationId",
      "woltOrderId",
    ])
    .index("by_organizationId_and_normalizedDisplayNumber", [
      "organizationId",
      "normalizedDisplayNumber",
    ])
    .index("by_organizationId_and_occurredAt", [
      "organizationId",
      "occurredAt",
    ])
    .index("by_organizationId_and_locationId_and_occurredAt", [
      "organizationId",
      "locationId",
      "occurredAt",
    ])
    .index("by_organizationId_and_status_and_occurredAt", [
      "organizationId",
      "status",
      "occurredAt",
    ])
    .index("by_organizationId_and_locationId_and_status_and_occurredAt", [
      "organizationId",
      "locationId",
      "status",
      "occurredAt",
    ])
    .index("by_occurredAt", ["occurredAt"]),

  woltOrderItems: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    orderId: v.id("woltOrders"),
    woltOrderId: v.string(),
    itemId: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    quantity: v.number(),
    posId: v.optional(v.string()),
    sku: v.optional(v.string()),
    gtin: v.optional(v.string()),
    unitPrice: v.number(),
    lineTotal: v.number(),
    currency: v.string(),
    occurredAt: v.number(),
    status: woltOrderStatusValidator,
    orderType: woltOrderTypeValidator,
    observedAt: v.number(),
  })
    .index("by_organizationId_and_orderId", ["organizationId", "orderId"])
    .index("by_organizationId_and_locationId_and_observedAt", [
      "organizationId",
      "locationId",
      "observedAt",
    ])
    .index("by_organizationId_and_locationId_and_occurredAt", [
      "organizationId",
      "locationId",
      "occurredAt",
    ])
    .index("by_organizationId_and_locationId_and_status_and_occurredAt", [
      "organizationId",
      "locationId",
      "status",
      "occurredAt",
    ])
    .index("by_organizationId_and_observedAt", [
      "organizationId",
      "observedAt",
    ])
    .index("by_organizationId_and_gtin", ["organizationId", "gtin"])
    .index("by_organizationId_and_posId", ["organizationId", "posId"])
    .index("by_organizationId_and_sku", ["organizationId", "sku"])
    .index("by_organizationId_and_normalizedName", [
      "organizationId",
      "normalizedName",
    ])
    .index("by_observedAt", ["observedAt"]),

  woltProductMappings: defineTable({
    organizationId: v.string(),
    locationId: v.union(v.id("locations"), v.null()),
    matchType: woltProductMatchTypeValidator,
    matchValue: v.string(),
    productId: v.id("products"),
    updatedBy: v.string(),
    updatedAt: v.number(),
  })
    .index("by_organizationId_and_matchType_and_matchValue_and_locationId", [
      "organizationId",
      "matchType",
      "matchValue",
      "locationId",
    ])
    .index("by_organizationId_and_productId", [
      "organizationId",
      "productId",
    ])
    .index("by_organizationId_and_locationId", [
      "organizationId",
      "locationId",
    ])
    .index("by_organizationId", ["organizationId"]),

  woltSalesDaily: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    dayStart: v.number(),
    date: v.string(),
    currency: v.string(),
    revenue: v.number(),
    orderCount: v.number(),
    itemCount: v.number(),
    canceledCount: v.number(),
    totalCount: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId_and_locationId_and_dayStart", [
      "organizationId",
      "locationId",
      "dayStart",
    ])
    .index("by_organizationId_and_dayStart", [
      "organizationId",
      "dayStart",
    ]),
};
