import { defineTable } from "convex/server";
import { v } from "convex/values";

export const abcateringTables = {
  abCateringConnections: defineTable({
    organizationId: v.string(),
    encryptedApiKey: v.string(),
    // From profile/validate. Valid until the AB user's password changes.
    encryptedValidationKey: v.string(),
    customerNo: v.string(),
    customerName: v.string(),
    department: v.string(),
    // Cached OAuth access token, valid for about an hour.
    encryptedAccessToken: v.optional(v.string()),
    accessTokenExpiresAt: v.optional(v.number()),
    supplierId: v.optional(v.id("suppliers")),
    // false keeps orders in the app instead of sending them to AB; missing means send.
    sendOrders: v.optional(v.boolean()),
    connectedAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),

  abCateringProductLinks: defineTable({
    organizationId: v.string(),
    productId: v.id("products"),
    // AB product id and order unit, e.g. "309807 KRT".
    productNumber: v.string(),
    productName: v.string(),
    unitId: v.id("units"),
  })
    .index("by_organizationId_and_productId", ["organizationId", "productId"])
    .index("by_organizationId_and_productNumber", [
      "organizationId",
      "productNumber",
    ])
    .index("by_organizationId_and_unitId", ["organizationId", "unitId"]),
};
