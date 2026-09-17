import { defineTable } from "convex/server";
import { v } from "convex/values";
import { menuGroupValidator } from "../../lib/menuGroups";

export const onlineposTables = {
  onlinePosIntegrations: defineTable({
    organizationId: v.string(),
    name: v.optional(v.string()),
    catalogScoped: v.optional(v.boolean()),
    token: v.string(),
    companyId: v.number(),
    enabled: v.boolean(),
    stockSyncEnabled: v.optional(v.boolean()),
    stockRefundsToWaste: v.optional(v.boolean()),
    stockSyncStartedAt: v.optional(v.number()),
    stockSyncHistoryStartAt: v.optional(v.number()),
    stockSyncSinceLastCount: v.optional(v.boolean()),
    stockMappingRevision: v.optional(v.number()),
    connectedAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),

  onlinePosLocationIntegrations: defineTable({
    organizationId: v.string(),
    masterIntegrationId: v.optional(v.id("onlinePosIntegrations")),
    locationId: v.id("locations"),
    token: v.string(),
    companyId: v.number(),
    connectedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_locationId", [
      "organizationId",
      "locationId",
    ]),

  onlinePosSalesResets: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
  }).index("by_organizationId_and_locationId", [
    "organizationId",
    "locationId",
  ]),

  onlinePosStockSyncStatus: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    runToken: v.string(),
    activationAt: v.number(),
    state: v.union(v.literal("running"), v.literal("idle"), v.literal("error")),
    updatedAt: v.number(),
    lastSuccessAt: v.optional(v.number()),
    syncedThroughAt: v.optional(v.number()),
    salesStatusId: v.optional(v.id("onlinePosSyncStatus")),
    salesRevision: v.optional(v.number()),
    orderRevisionsVersion: v.optional(v.literal(1)),
    mappingRevision: v.optional(v.number()),
    connectionId: v.optional(v.id("onlinePosLocationIntegrations")),
    connectedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    unmappedQuantity: v.number(),
  }).index("by_organizationId_and_locationId", ["organizationId", "locationId"]),

  onlinePosProductMappings: defineTable({
    organizationId: v.string(),
    integrationId: v.optional(v.id("onlinePosIntegrations")),
    productId: v.id("products"),
    onlinePosProductId: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_integrationId", [
      "organizationId",
      "integrationId",
    ])
    .index("by_organizationId_and_integrationId_and_onlinePosProductId", [
      "organizationId",
      "integrationId",
      "onlinePosProductId",
    ])
    .index("by_organizationId_and_productId", ["organizationId", "productId"])
    .index("by_organizationId_and_integrationId_and_productId", [
      "organizationId",
      "integrationId",
      "productId",
    ])
    .index("by_organizationId_and_onlinePosProductId", [
      "organizationId",
      "onlinePosProductId",
    ]),

  onlinePosMenus: defineTable({
    organizationId: v.string(),
    integrationId: v.optional(v.id("onlinePosIntegrations")),
    onlinePosProductId: v.number(),
    name: v.string(),
    onlinePosProductName: v.optional(v.string()),
    groupName: v.string(),
    groups: v.optional(v.array(menuGroupValidator)),
    products: v.array(
      v.object({
        kind: v.optional(v.union(v.literal("primary"), v.literal("additional"))),
        groupId: v.optional(v.string()),
        productId: v.id("products"),
        name: v.string(),
      }),
    ),
    updatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_integrationId", [
      "organizationId",
      "integrationId",
    ])
    .index("by_organizationId_and_integrationId_and_onlinePosProductId", [
      "organizationId",
      "integrationId",
      "onlinePosProductId",
    ])
    .index("by_organizationId_and_onlinePosProductId", [
      "organizationId",
      "onlinePosProductId",
    ]),

  onlinePosSyncStatus: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    state: v.union(
      v.literal("idle"),
      v.literal("queued"),
      v.literal("running"),
      v.literal("error"),
    ),
    runToken: v.optional(v.string()),
    syncedThroughAt: v.optional(v.number()),
    backfillThroughAt: v.optional(v.number()),
    stockRevision: v.optional(v.number()),
    stockChangedFrom: v.optional(v.number()),
    stockFullSyncRevision: v.optional(v.number()),
    // Set before destroying a day during reconcile; cleared only on success.
    // Dispatcher retries this dayStart until the rebuild completes.
    pendingReconcileDayStart: v.optional(v.number()),
    dayStartRerollToken: v.optional(v.string()),
    dayStartRerollTimeZone: v.optional(v.string()),
    dayStartRerollRetryCount: v.optional(v.number()),
    dayStartRerollError: v.optional(v.string()),
    dailyHistoryFrom: v.optional(v.number()),
    // Keep the latest reconciled day hash; replace by dayStart.
    reconcileHashes: v.optional(
      v.array(v.object({ dayStart: v.number(), hash: v.string() })),
    ),
    reconcileFailCount: v.optional(v.number()),
    // true after we've written location-scoped line externalIds
    lineIdsScoped: v.optional(v.boolean()),
    lastAttemptAt: v.optional(v.number()),
    lastSuccessAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_locationId", [
      "organizationId",
      "locationId",
    ]),

  onlinePosFinancialMonths: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    month: v.string(),
    sourceKey: v.string(),
    state: v.union(v.literal("queued"), v.literal("running"), v.literal("idle"), v.literal("error")),
    runToken: v.optional(v.string()),
    requestedThrough: v.string(),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
    snapshot: v.optional(v.object({
      netRevenue: v.number(),
      transactionCount: v.number(),
      currency: v.string(),
      timeZone: v.string(),
      through: v.string(),
      syncedAt: v.number(),
      sourceKey: v.string(),
      version: v.literal(1),
      days: v.array(v.object({
        date: v.string(),
        netRevenue: v.number(),
        transactionCount: v.number(),
      })),
    })),
  }).index("by_organizationId_and_locationId_and_month", [
    "organizationId",
    "locationId",
    "month",
  ]),
};
