import { defineTable } from "convex/server";
import { v } from "convex/values";

export const gssupplyTables = {
  gsSupplyConnections: defineTable({
    organizationId: v.string(),
    encryptedCatalogUrl: v.string(),
    // The catalog URL without its API key, safe to show in settings.
    catalogUrlPreview: v.string(),
    supplierId: v.optional(v.id("suppliers")),
    connectedAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),

  gsSupplyProductLinks: defineTable({
    organizationId: v.string(),
    productId: v.id("products"),
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
