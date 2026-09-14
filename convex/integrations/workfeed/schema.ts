import { defineTable } from "convex/server";
import { v } from "convex/values";

export const workfeedTables = {
  workfeedLaborDaily: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    date: v.string(),
    laborCostMinor: v.number(),
    currency: v.string(),
    sourceKey: v.string(),
    updatedAt: v.number(),
  }).index("by_organizationId_and_locationId_and_date", [
    "organizationId", "locationId", "date",
  ]),

  workfeedLaborSyncStatus: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    month: v.string(),
    sourceKey: v.string(),
    currency: v.string(),
    timeZone: v.string(),
    state: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("ready"),
      v.literal("error"),
    ),
    runToken: v.string(),
    requestedThrough: v.string(),
    coveredThrough: v.optional(v.string()),
    laborCostMinor: v.optional(v.number()),
    lastAttemptAt: v.number(),
    lastSuccessAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  }).index("by_organizationId_and_locationId_and_month", [
    "organizationId", "locationId", "month",
  ]),

  workfeedIntegrations: defineTable({
    organizationId: v.string(),
    apiKey: v.string(),
    companyId: v.string(),
    enabled: v.boolean(),
    connectedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_enabled_and_organizationId", ["enabled", "organizationId"]),

  workfeedLocationMappings: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    departmentId: v.string(),
    departmentName: v.string(),
    updatedAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_locationId", ["organizationId", "locationId"])
    .index("by_organizationId_and_departmentId", [
      "organizationId",
      "departmentId",
    ]),

  workfeedEmployeeMappings: defineTable({
    organizationId: v.string(),
    companyId: v.string(),
    externalEmployeeId: v.string(),
    employeeId: v.id("employees"),
    syncToken: v.string(),
    lastSeenAt: v.number(),
    pendingLocationIds: v.optional(v.array(v.id("locations"))),
    pendingActive: v.optional(v.boolean()),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_companyId_and_externalEmployeeId", [
      "organizationId",
      "companyId",
      "externalEmployeeId",
    ])
    .index("by_organizationId_and_employeeId", [
      "organizationId",
      "employeeId",
    ]),

  workfeedShiftMappings: defineTable({
    organizationId: v.string(),
    companyId: v.string(),
    externalShiftId: v.string(),
    shiftId: v.id("scheduledShifts"),
    externalDepartmentId: v.string(),
    startsAt: v.number(),
    syncToken: v.string(),
    lastSeenAt: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_companyId_and_externalShiftId", [
      "organizationId",
      "companyId",
      "externalShiftId",
    ])
    .index("by_organizationId_and_companyId_and_startsAt", [
      "organizationId",
      "companyId",
      "startsAt",
    ])
    .index("by_organizationId_and_shiftId", ["organizationId", "shiftId"]),

  workfeedRoles: defineTable({
    organizationId: v.string(),
    companyId: v.string(),
    externalRoleId: v.string(),
    externalDepartmentId: v.string(),
    name: v.string(),
    active: v.boolean(),
    syncToken: v.string(),
    updatedAt: v.number(),
  }).index("by_organizationId_and_companyId_and_externalRoleId", [
    "organizationId",
    "companyId",
    "externalRoleId",
  ]),

  workfeedSyncStatus: defineTable({
    organizationId: v.string(),
    state: v.union(
      v.literal("idle"),
      v.literal("queued"),
      v.literal("running"),
      v.literal("error"),
    ),
    runKind: v.optional(v.union(v.literal("employees"), v.literal("shifts"))),
    runToken: v.optional(v.string()),
    pendingShiftChunks: v.optional(v.number()),
    shiftChunkHashes: v.optional(v.array(v.string())),
    lastEmployeeAttemptAt: v.optional(v.number()),
    lastEmployeeSuccessAt: v.optional(v.number()),
    lastEmployeeCompanyId: v.optional(v.string()),
    lastShiftAttemptAt: v.optional(v.number()),
    lastShiftSuccessAt: v.optional(v.number()),
    shiftCoverageFrom: v.optional(v.number()),
    shiftCoverageThrough: v.optional(v.number()),
    shiftCoverageCompanyId: v.optional(v.string()),
    shiftCoverageTimeZone: v.optional(v.string()),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),
};
