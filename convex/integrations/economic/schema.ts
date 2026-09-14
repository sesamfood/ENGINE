import { defineTable } from "convex/server";
import { v } from "convex/values";
import { economicApprovalItemValidator, economicMappingFields } from "./lib/validators";

export const economicTables = {
  economicConnections: defineTable({
    organizationId: v.string(),
    agreementNumber: v.number(),
    name: v.string(),
    currency: v.string(),
    encryptedToken: v.string(),
    encryptedAppSecretToken: v.optional(v.string()),
    enabled: v.boolean(),
    ...economicMappingFields,
    revision: v.number(),
    connectedAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_agreementNumber", ["organizationId", "agreementNumber"]),

  economicLocationMappings: defineTable({
    organizationId: v.string(),
    connectionId: v.id("economicConnections"),
    locationId: v.id("locations"),
    dimensionKey: v.union(v.number(), v.null()),
  }).index("by_organizationId_and_locationId", ["organizationId", "locationId"])
    .index("by_connectionId", ["connectionId"]),

  economicApprovals: defineTable({
    organizationId: v.string(),
    connectionId: v.id("economicConnections"),
    locationId: v.id("locations"),
    month: v.string(),
    items: v.array(economicApprovalItemValidator),
    sourceNote: v.string(),
    revision: v.number(),
    approvedAt: v.number(),
    approvedBy: v.string(),
  }).index("by_organizationId_and_locationId_and_month_and_revision", [
    "organizationId", "locationId", "month", "revision",
  ]),
};
