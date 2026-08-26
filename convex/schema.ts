import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  openingHoursModeValidator,
  weeklyOpeningHoursValidator,
} from "./lib/openingHours";
import { countScheduleValidator } from "./lib/countSettings";
import {
  ownCheckControlTypeValidator,
  ownCheckFieldValidator,
  ownCheckNoteValidator,
  ownCheckScheduleValidator,
  ownCheckValueValidator,
} from "./lib/ownCheckValidators";
import { organizationThemeValidator } from "./lib/organizationTheme";
import {
  customMetricSpecValidator,
  dashboardSummarySourceValidator,
  rangeValidator,
  scopeValidator,
  widgetValidator,
} from "./lib/dashboardValidators";

export default defineSchema({
  rolePermissions: defineTable({
    organizationId: v.string(),
    role: v.string(),
    permissions: v.array(v.string()),
    updatedAt: v.number(),
  }).index("by_organizationId_and_role", ["organizationId", "role"]),

  roles: defineTable({
    organizationId: v.string(),
    key: v.string(),
    name: v.string(),
    isSystem: v.boolean(),
    granularity: v.optional(
      v.union(
        v.literal("detail"),
        v.literal("aggregate"),
        v.literal("anonymous"),
      ),
    ),
    updatedAt: v.number(),
  }).index("by_organizationId_and_key", ["organizationId", "key"]),

  memberLocationAccess: defineTable({
    organizationId: v.string(),
    userId: v.string(),
    scope: v.union(
      v.literal("all"),
      v.literal("selected"),
      v.literal("operator"),
    ),
    locationIds: v.array(v.id("locations")),
    operatorId: v.optional(v.id("operators")),
    updatedAt: v.number(),
  })
    .index("by_organizationId_and_userId", ["organizationId", "userId"])
    .index("by_organizationId", ["organizationId"]),

  auditLog: defineTable({
    organizationId: v.string(),
    locationId: v.optional(v.id("locations")),
    actorKind: v.optional(
      v.union(v.literal("user"), v.literal("apiKey")),
    ),
    actorUserId: v.optional(v.string()),
    actorApiKeyId: v.optional(v.string()),
    actorName: v.string(),
    action: v.string(),
    entityTable: v.string(),
    entityId: v.string(),
    summary: v.string(),
    reason: v.optional(v.string()),
    requestId: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_at", ["at"])
    .index("by_organizationId_and_at", ["organizationId", "at"])
    .index("by_organizationId_and_entityTable_and_entityId", [
      "organizationId",
      "entityTable",
      "entityId",
    ]),

  apiKeyPolicies: defineTable({
    apiKeyId: v.string(),
    organizationId: v.string(),
    name: v.string(),
    prefix: v.string(),
    start: v.string(),
    role: v.string(),
    permissions: v.array(v.string()),
    locationPolicy: v.union(
      v.object({ kind: v.literal("all") }),
      v.object({
        kind: v.literal("selected"),
        locationIds: v.array(v.id("locations")),
      }),
      v.object({
        kind: v.literal("operator"),
        operatorId: v.id("operators"),
      }),
    ),
    status: v.union(v.literal("active"), v.literal("revoked")),
    createdByUserId: v.string(),
    createdByName: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    revision: v.number(),
  })
    .index("by_apiKeyId", ["apiKeyId"])
    .index("by_organizationId_and_createdAt", [
      "organizationId",
      "createdAt",
    ])
    .index("by_organizationId_and_status", ["organizationId", "status"])
    .index("by_organizationId_and_status_and_expiresAt", [
      "organizationId",
      "status",
      "expiresAt",
    ])
    .index("by_organizationId_and_role", ["organizationId", "role"]),

  apiRequestIdempotency: defineTable({
    organizationId: v.string(),
    apiKeyId: v.string(),
    operationId: v.string(),
    key: v.string(),
    requestHash: v.string(),
    responseStatus: v.number(),
    responseJson: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_scope", [
      "organizationId",
      "apiKeyId",
      "operationId",
      "key",
    ])
    .index("by_expiresAt", ["expiresAt"]),

  organizationAssets: defineTable({
    organizationId: v.string(),
    logoStorageId: v.optional(v.id("_storage")),
    wideLogoStorageId: v.optional(v.id("_storage")),
    theme: v.optional(organizationThemeValidator),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_logoStorageId", ["logoStorageId"])
    .index("by_wideLogoStorageId", ["wideLogoStorageId"]),

  organizationSyncActivity: defineTable({
    organizationId: v.string(),
    lastRequestedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),

  onlinePosIntegrations: defineTable({
    organizationId: v.string(),
    token: v.string(),
    companyId: v.number(),
    enabled: v.boolean(),
    connectedAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),

  onlinePosLocationIntegrations: defineTable({
    organizationId: v.string(),
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

  onlinePosProductMappings: defineTable({
    organizationId: v.string(),
    productId: v.id("products"),
    onlinePosProductId: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_productId", ["organizationId", "productId"])
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
    // Set before destroying a day during reconcile; cleared only on success.
    // Dispatcher retries this dayStart until the rebuild completes.
    pendingReconcileDayStart: v.optional(v.number()),
    dayStartRerollToken: v.optional(v.string()),
    dayStartRerollTimeZone: v.optional(v.string()),
    dayStartRerollRetryCount: v.optional(v.number()),
    dayStartRerollError: v.optional(v.string()),
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

  salesOrders: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    occurredAt: v.number(),
    dayStart: v.number(),
    orderNumber: v.number(),
    // Money is stored as integer minor units (øre); readers divide by 100.
    revenue: v.number(),
    itemCount: v.number(),
    paymentType: v.string(),
    department: v.string(),
    source: v.string(),
    externalId: v.string(),
    externalClerkId: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_organizationId_and_locationId_and_occurredAt", [
      "organizationId",
      "locationId",
      "occurredAt",
    ])
    .index("by_organizationId_and_occurredAt", ["organizationId", "occurredAt"])
    .index("by_org_location_day_order_department", [
      "organizationId",
      "locationId",
      "dayStart",
      "orderNumber",
      "department",
    ])
    .index("by_occurredAt", ["occurredAt"]),

  salesLines: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    orderId: v.id("salesOrders"),
    occurredAt: v.number(),
    externalProductId: v.string(),
    productName: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    revenue: v.number(),
    source: v.string(),
    externalId: v.string(),
    externalClerkId: v.optional(v.string()),
    clerkName: v.optional(v.string()),
  })
    .index("by_organizationId_and_orderId", ["organizationId", "orderId"])
    .index("by_organizationId_and_source_and_externalId", [
      "organizationId",
      "source",
      "externalId",
    ])
    .index("by_organizationId_and_locationId_and_occurredAt", [
      "organizationId",
      "locationId",
      "occurredAt",
    ])
    .index("by_occurredAt", ["occurredAt"]),

  salesDaily: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    dayStart: v.number(),
    date: v.string(),
    revenue: v.number(),
    orderCount: v.number(),
    itemCount: v.number(),
    updatedAt: v.number(),
  }).index("by_organizationId_and_locationId_and_dayStart", [
    "organizationId",
    "locationId",
    "dayStart",
  ]),

  feedbackSettings: defineTable({
    organizationId: v.string(),
    enabled: v.boolean(),
    destination: v.union(v.literal("linear"), v.literal("email")),
    email: v.optional(v.string()),
    linearApiKey: v.optional(v.string()),
    linearTeamId: v.optional(v.string()),
    linearTeamName: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),

  feedbackSubmissions: defineTable({
    organizationId: v.string(),
    organizationName: v.string(),
    userId: v.string(),
    userName: v.string(),
    userEmail: v.optional(v.string()),
    area: v.string(),
    type: v.union(v.literal("bug"), v.literal("feature")),
    // Optional so submissions from before titles existed still validate.
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    screenshotStorageId: v.optional(v.id("_storage")),
    destination: v.union(v.literal("linear"), v.literal("email")),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
    ),
    reference: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_organizationId_and_createdAt", ["organizationId", "createdAt"])
    .index("by_screenshotStorageId", ["screenshotStorageId"]),

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

  organizationScheduleSettings: defineTable({
    organizationId: v.string(),
    timeZone: v.string(),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),

  employees: defineTable({
    organizationId: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    displayName: v.string(),
    normalizedName: v.string(),
    imageUrl: v.union(v.string(), v.null()),
    active: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_organizationId_and_normalizedName", [
      "organizationId",
      "normalizedName",
    ])
    .index("by_organizationId_and_active_and_normalizedName", [
      "organizationId",
      "active",
      "normalizedName",
    ])
    .searchIndex("search_displayName", {
      searchField: "displayName",
      filterFields: ["organizationId", "active"],
    }),

  employeeLocationAssignments: defineTable({
    organizationId: v.string(),
    employeeId: v.id("employees"),
    locationId: v.id("locations"),
    updatedAt: v.number(),
  })
    .index("by_organizationId_and_employeeId", ["organizationId", "employeeId"])
    .index("by_organizationId_and_locationId_and_employeeId", [
      "organizationId",
      "locationId",
      "employeeId",
    ]),

  scheduledShifts: defineTable({
    organizationId: v.string(),
    employeeId: v.id("employees"),
    locationId: v.id("locations"),
    startsAt: v.number(),
    endsAt: v.number(),
    roleName: v.union(v.string(), v.null()),
    // Kept optional for rows written by the retired dashboard summary backfill.
    dashboardSummaryTimeZone: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_organizationId_and_startsAt", ["organizationId", "startsAt"])
    .index("by_organizationId_and_locationId_and_startsAt", [
      "organizationId",
      "locationId",
      "startsAt",
    ])
    .index("by_organizationId_and_employeeId_and_startsAt", [
      "organizationId",
      "employeeId",
      "startsAt",
    ]),

  staffFoodRuleTiers: defineTable({
    organizationId: v.string(),
    minimumShiftMinutes: v.number(),
    updatedAt: v.number(),
  }).index("by_organizationId_and_minimumShiftMinutes", [
    "organizationId",
    "minimumShiftMinutes",
  ]),

  staffFoodRuleAllowances: defineTable({
    organizationId: v.string(),
    tierId: v.id("staffFoodRuleTiers"),
    categoryId: v.id("categories"),
    amount: v.number(),
  })
    .index("by_organizationId_and_tierId", ["organizationId", "tierId"])
    .index("by_organizationId_and_tierId_and_categoryId", [
      "organizationId",
      "tierId",
      "categoryId",
    ])
    .index("by_organizationId_and_categoryId", [
      "organizationId",
      "categoryId",
    ]),

  staffFoodRuleProducts: defineTable({
    organizationId: v.string(),
    allowanceId: v.id("staffFoodRuleAllowances"),
    productId: v.id("products"),
  })
    .index("by_organizationId_and_allowanceId", [
      "organizationId",
      "allowanceId",
    ])
    .index("by_organizationId_and_allowanceId_and_productId", [
      "organizationId",
      "allowanceId",
      "productId",
    ])
    .index("by_organizationId_and_productId", ["organizationId", "productId"]),

  staffFoodSessions: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    employeeId: v.id("employees"),
    source: v.union(v.literal("scheduled"), v.literal("manual")),
    scheduledShiftId: v.optional(v.id("scheduledShifts")),
    workDate: v.string(),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    durationMinutes: v.number(),
    createdAt: v.number(),
    createdBy: v.string(),
  })
    .index("by_organizationId_and_scheduledShiftId", [
      "organizationId",
      "scheduledShiftId",
    ])
    .index("by_org_location_employee_date_source", [
      "organizationId",
      "locationId",
      "employeeId",
      "workDate",
      "source",
    ]),

  staffFoodRegistrations: defineTable({
    organizationId: v.string(),
    checkoutId: v.string(),
    sessionId: v.id("staffFoodSessions"),
    locationId: v.id("locations"),
    locationName: v.string(),
    employeeId: v.id("employees"),
    employeeName: v.string(),
    sessionSource: v.union(v.literal("scheduled"), v.literal("manual")),
    workDate: v.string(),
    shiftDurationMinutes: v.number(),
    tierMinimumShiftMinutes: v.number(),
    categoryAllowance: v.number(),
    categoryId: v.id("categories"),
    categoryName: v.string(),
    productId: v.id("products"),
    productName: v.string(),
    quantity: v.number(),
    defaultUnitId: v.id("units"),
    defaultUnitName: v.string(),
    defaultQuantity: v.number(),
    registeredAt: v.number(),
    registeredBy: v.string(),
    registeredByName: v.string(),
    status: v.union(v.literal("active"), v.literal("voided")),
    voidedAt: v.optional(v.number()),
    voidedBy: v.optional(v.string()),
    voidedByName: v.optional(v.string()),
    // Kept optional for rows written by the retired dashboard summary backfill.
    dashboardSummaryTimeZone: v.optional(v.string()),
  })
    .index("by_organizationId_and_checkoutId", ["organizationId", "checkoutId"])
    .index("by_organizationId_and_sessionId_and_registeredAt", [
      "organizationId",
      "sessionId",
      "registeredAt",
    ])
    .index("by_organizationId_and_sessionId_and_status_and_categoryId", [
      "organizationId",
      "sessionId",
      "status",
      "categoryId",
    ])
    .index("by_organizationId_and_registeredAt", [
      "organizationId",
      "registeredAt",
    ])
    .index("by_organizationId_and_locationId_and_registeredAt", [
      "organizationId",
      "locationId",
      "registeredAt",
    ])
    .index("by_organizationId_and_employeeId_and_registeredAt", [
      "organizationId",
      "employeeId",
      "registeredAt",
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
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),

  categories: defineTable({
    organizationId: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    parentCategoryId: v.optional(v.id("categories")),
  })
    .index("by_organizationId_and_normalizedName", [
      "organizationId",
      "normalizedName",
    ])
    .index("by_organizationId_and_parentCategoryId", [
      "organizationId",
      "parentCategoryId",
    ]),

  units: defineTable({
    organizationId: v.string(),
    name: v.string(),
    normalizedName: v.string(),
  }).index("by_organizationId_and_normalizedName", [
    "organizationId",
    "normalizedName",
  ]),

  markets: defineTable({
    organizationId: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    currency: v.optional(v.string()),
    timeZone: v.optional(v.string()),
  }).index("by_organizationId_and_normalizedName", [
    "organizationId",
    "normalizedName",
  ]),

  legalEntities: defineTable({
    organizationId: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    registrationNumber: v.optional(v.string()),
  }).index("by_organizationId_and_normalizedName", [
    "organizationId",
    "normalizedName",
  ]),

  operators: defineTable({
    organizationId: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    legalEntityId: v.optional(v.id("legalEntities")),
    contactEmail: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
  })
    .index("by_organizationId_and_normalizedName", [
      "organizationId",
      "normalizedName",
    ])
    .index("by_organizationId_and_status", ["organizationId", "status"])
    .index("by_organizationId_and_legalEntityId", [
      "organizationId",
      "legalEntityId",
    ]),

  products: defineTable({
    organizationId: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    categoryId: v.id("categories"),
    defaultUnitId: v.id("units"),
    imageStorageId: v.optional(v.id("_storage")),
    maxTemperatureCelsius: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("archived")),
    createdBy: v.string(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_imageStorageId", ["imageStorageId"])
    .index("by_organizationId_and_normalizedName", [
      "organizationId",
      "normalizedName",
    ])
    .index("by_organizationId_and_categoryId", ["organizationId", "categoryId"])
    .index("by_status_and_archivedAt", ["status", "archivedAt"])
    .index("by_organizationId_and_status_and_normalizedName", [
      "organizationId",
      "status",
      "normalizedName",
    ])
    .index("by_organizationId_and_status_and_categoryId_and_normalizedName", [
      "organizationId",
      "status",
      "categoryId",
      "normalizedName",
    ])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["organizationId", "status", "categoryId"],
    }),

  productUnits: defineTable({
    organizationId: v.string(),
    productId: v.id("products"),
    unitId: v.id("units"),
    factorToDefault: v.number(),
  })
    .index("by_organizationId_and_productId", ["organizationId", "productId"])
    .index("by_organizationId_and_productId_and_unitId", [
      "organizationId",
      "productId",
      "unitId",
    ])
    .index("by_organizationId_and_unitId", ["organizationId", "unitId"]),

  productIngredients: defineTable({
    organizationId: v.string(),
    productId: v.id("products"),
    ingredientProductId: v.id("products"),
    quantity: v.number(),
    unitId: v.id("units"),
  })
    .index("by_organizationId_and_productId", ["organizationId", "productId"])
    .index("by_organizationId_and_productId_and_ingredientProductId", [
      "organizationId",
      "productId",
      "ingredientProductId",
    ])
    .index("by_organizationId_and_ingredientProductId", [
      "organizationId",
      "ingredientProductId",
    ])
    .index("by_organizationId_and_ingredientProductId_and_unitId", [
      "organizationId",
      "ingredientProductId",
      "unitId",
    ]),

  locations: defineTable({
    organizationId: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    countProductOrder: v.optional(v.array(v.id("products"))),
    openingHoursMode: v.optional(openingHoursModeValidator),
    weeklyOpeningHours: v.optional(v.array(weeklyOpeningHoursValidator)),
    marketId: v.optional(v.id("markets")),
    legalEntityId: v.optional(v.id("legalEntities")),
    operatorId: v.optional(v.id("operators")),
    ownershipType: v.optional(
      v.union(
        v.literal("owned"),
        v.literal("franchise"),
        v.literal("jointVenture"),
        v.literal("license"),
      ),
    ),
    conceptVersion: v.optional(v.string()),
    openedAt: v.optional(v.number()),
    currency: v.optional(v.string()),
    timeZone: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("planned"),
        v.literal("open"),
        v.literal("temporarilyClosed"),
        v.literal("closed"),
      ),
    ),
  })
    .index("by_organizationId_and_normalizedName", [
      "organizationId",
      "normalizedName",
    ])
    .index("by_organizationId_and_status", ["organizationId", "status"])
    .index("by_organizationId_and_operatorId", ["organizationId", "operatorId"])
    .index("by_organizationId_and_legalEntityId", [
      "organizationId",
      "legalEntityId",
    ])
    .index("by_organizationId_and_marketId", ["organizationId", "marketId"]),

  locationSpecialOpeningHours: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    date: v.string(),
    closed: v.boolean(),
    openMinuteOfDay: v.number(),
    closeMinuteOfDay: v.number(),
  }).index("by_organizationId_and_locationId_and_date", [
    "organizationId",
    "locationId",
    "date",
  ]),

  transfers: defineTable({
    organizationId: v.string(),
    fromLocationId: v.id("locations"),
    toLocationId: v.id("locations"),
    responsibleUserId: v.string(),
    responsibleName: v.string(),
    comment: v.optional(v.string()),
    transferredAt: v.number(),
    createdBy: v.string(),
    stockApplied: v.optional(v.boolean()),
    // Kept optional for rows written by the retired dashboard summary backfill.
    itemCount: v.optional(v.number()),
    totalQuantity: v.optional(v.number()),
    hasTemperatureDeviation: v.optional(v.boolean()),
    dashboardSummaryTimeZone: v.optional(v.string()),
  })
    .index("by_organizationId_and_transferredAt", [
      "organizationId",
      "transferredAt",
    ])
    .index("by_organizationId_and_fromLocationId", [
      "organizationId",
      "fromLocationId",
    ])
    .index("by_organizationId_and_fromLocationId_and_transferredAt", [
      "organizationId",
      "fromLocationId",
      "transferredAt",
    ])
    .index("by_organizationId_and_toLocationId", [
      "organizationId",
      "toLocationId",
    ])
    .index("by_organizationId_and_toLocationId_and_transferredAt", [
      "organizationId",
      "toLocationId",
      "transferredAt",
    ]),

  transferItems: defineTable({
    organizationId: v.string(),
    transferId: v.id("transfers"),
    productId: v.id("products"),
    productName: v.string(),
    unitId: v.id("units"),
    unitName: v.string(),
    quantity: v.number(),
    factorToDefault: v.optional(v.number()),
    temperatureCelsius: v.optional(v.number()),
    maxTemperatureCelsius: v.optional(v.number()),
  }).index("by_organizationId_and_transferId", [
    "organizationId",
    "transferId",
  ]),

  wasteSettings: defineTable({
    organizationId: v.string(),
    inactivitySeconds: v.number(),
    popularityPeriod: v.union(
      v.literal("allTime"),
      v.literal("30Days"),
      v.literal("90Days"),
    ),
    historyScope: v.optional(
      v.union(v.literal("location"), v.literal("organization")),
    ),
    badDeliveryDeductFromStock: v.optional(v.boolean()),
    badDeliveryShowStockChoice: v.optional(v.boolean()),
    badDeliveryTo: v.optional(v.array(v.string())),
    badDeliveryCc: v.optional(v.array(v.string())),
    badDeliveryBcc: v.optional(v.array(v.string())),
    badDeliveryEmailSubject: v.optional(v.string()),
    badDeliveryEmailBody: v.optional(v.string()),
  }).index("by_org", ["organizationId"]),

  wasteRegistrations: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    locationName: v.string(),
    productId: v.id("products"),
    productName: v.string(),
    unitId: v.id("units"),
    unitName: v.string(),
    quantity: v.number(),
    quantityKey: v.string(),
    factorToDefault: v.number(),
    defaultUnitId: v.id("units"),
    defaultUnitName: v.string(),
    defaultQuantity: v.number(),
    registeredAt: v.number(),
    registeredBy: v.string(),
    registeredByName: v.string(),
    source: v.union(v.literal("shortcut"), v.literal("custom")),
    status: v.union(v.literal("active"), v.literal("voided")),
    activeIn30Days: v.boolean(),
    activeIn90Days: v.boolean(),
    // Kept optional for rows written by the retired dashboard summary backfill.
    reportSummaryApplied: v.optional(v.boolean()),
    voidedAt: v.optional(v.number()),
    voidedBy: v.optional(v.string()),
    voidedByName: v.optional(v.string()),
    dashboardSummaryTimeZone: v.optional(v.string()),
  })
    .index("by_org_and_time", ["organizationId", "registeredAt"])
    .index("by_org_location_time", [
      "organizationId",
      "locationId",
      "registeredAt",
    ])
    .index("by_org_status_time", ["organizationId", "status", "registeredAt"])
    .index("by_org_location_status_time", [
      "organizationId",
      "locationId",
      "status",
      "registeredAt",
    ])
    .index("by_org_location_product_status_time", [
      "organizationId",
      "locationId",
      "productId",
      "status",
      "registeredAt",
    ])
    .index("by_org_location_product_unit_qty_status_time", [
      "organizationId",
      "locationId",
      "productId",
      "unitId",
      "quantityKey",
      "status",
      "registeredAt",
    ])
    .index("by_org_product_status_time", [
      "organizationId",
      "productId",
      "status",
      "registeredAt",
    ])
    .index("by_org_product_unit_qty_status_time", [
      "organizationId",
      "productId",
      "unitId",
      "quantityKey",
      "status",
      "registeredAt",
    ]),

  wasteReportDailySummaries: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    locationName: v.string(),
    productId: v.id("products"),
    productName: v.string(),
    defaultUnitId: v.id("units"),
    defaultUnitName: v.string(),
    dayStartAt: v.number(),
    shard: v.optional(v.number()),
    count: v.number(),
    quantity: v.number(),
    latestRegisteredAt: v.number(),
  })
    .index("by_organizationId_and_dayStartAt", [
      "organizationId",
      "dayStartAt",
    ])
    .index("by_organizationId_and_locationId_and_dayStartAt", [
      "organizationId",
      "locationId",
      "dayStartAt",
    ])
    .index(
      "by_org_location_product_defaultUnit_dayStartAt_shard",
      [
        "organizationId",
        "locationId",
        "productId",
        "defaultUnitId",
        "dayStartAt",
        "shard",
      ],
    ),

  wasteReportSummaryStatuses: defineTable({
    organizationId: v.string(),
    state: v.union(v.literal("building"), v.literal("ready")),
    runToken: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),

  badDeliveries: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    locationName: v.string(),
    registeredAt: v.number(),
    registeredBy: v.string(),
    registeredByName: v.string(),
    comment: v.optional(v.string()),
    deductFromStock: v.boolean(),
    itemCount: v.number(),
    status: v.union(v.literal("active"), v.literal("voided")),
    voidedAt: v.optional(v.number()),
    voidedBy: v.optional(v.string()),
    voidedByName: v.optional(v.string()),
    to: v.array(v.string()),
    cc: v.array(v.string()),
    bcc: v.array(v.string()),
    emailSubject: v.optional(v.string()),
    emailBody: v.optional(v.string()),
    initialNoticeStatus: v.union(
      v.literal("notConfigured"),
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    initialNoticeAttemptedAt: v.optional(v.number()),
    initialNoticeSentAt: v.optional(v.number()),
    initialNoticeProviderId: v.optional(v.string()),
    initialNoticeFailureMessage: v.optional(v.string()),
    initialNoticeInFlight: v.optional(v.boolean()),
    cancellationNoticeStatus: v.union(
      v.literal("notConfigured"),
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped"),
    ),
    cancellationNoticeAttemptedAt: v.optional(v.number()),
    cancellationNoticeSentAt: v.optional(v.number()),
    cancellationNoticeProviderId: v.optional(v.string()),
    cancellationNoticeFailureMessage: v.optional(v.string()),
    cancellationNoticeInFlight: v.optional(v.boolean()),
    // Kept optional for rows written by the retired dashboard summary backfill.
    dashboardSummaryTimeZone: v.optional(v.string()),
  })
    .index("by_organizationId_and_registeredAt", [
      "organizationId",
      "registeredAt",
    ])
    .index("by_organizationId_and_locationId_and_registeredAt", [
      "organizationId",
      "locationId",
      "registeredAt",
    ])
    .index("by_organizationId_and_status_and_registeredAt", [
      "organizationId",
      "status",
      "registeredAt",
    ]),

  badDeliveryItems: defineTable({
    organizationId: v.string(),
    badDeliveryId: v.id("badDeliveries"),
    productId: v.id("products"),
    productName: v.string(),
    unitId: v.id("units"),
    unitName: v.string(),
    quantity: v.number(),
    factorToDefault: v.number(),
    defaultUnitId: v.id("units"),
    defaultUnitName: v.string(),
    defaultQuantity: v.number(),
  }).index("by_organizationId_and_badDeliveryId", [
    "organizationId",
    "badDeliveryId",
  ]),

  badDeliveryAttachments: defineTable({
    organizationId: v.string(),
    badDeliveryId: v.id("badDeliveries"),
    kind: v.union(v.literal("badProducts"), v.literal("deliveryNote")),
    storageId: v.id("_storage"),
    contentType: v.string(),
    fileSize: v.number(),
  })
    .index("by_organizationId_and_badDeliveryId", [
      "organizationId",
      "badDeliveryId",
    ])
    .index("by_storageId", ["storageId"]),

  wasteProductStats: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    productId: v.id("products"),
    allTimeCount: v.number(),
    count30Days: v.number(),
    count90Days: v.number(),
    lastRegisteredAt: v.number(),
    topAllTime: v.array(
      v.object({ unitId: v.id("units"), quantity: v.number() }),
    ),
    top30Days: v.array(
      v.object({ unitId: v.id("units"), quantity: v.number() }),
    ),
    top90Days: v.array(
      v.object({ unitId: v.id("units"), quantity: v.number() }),
    ),
  })
    .index("by_org_product", ["organizationId", "productId"])
    .index("by_org_location_product", [
      "organizationId",
      "locationId",
      "productId",
    ])
    .index("by_org_location_all_count", [
      "organizationId",
      "locationId",
      "allTimeCount",
      "lastRegisteredAt",
    ])
    .index("by_org_location_30_count", [
      "organizationId",
      "locationId",
      "count30Days",
      "lastRegisteredAt",
    ])
    .index("by_org_location_90_count", [
      "organizationId",
      "locationId",
      "count90Days",
      "lastRegisteredAt",
    ]),

  wasteAmountStats: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    productId: v.id("products"),
    unitId: v.id("units"),
    quantity: v.number(),
    quantityKey: v.string(),
    allTimeCount: v.number(),
    count30Days: v.number(),
    count90Days: v.number(),
    lastRegisteredAt: v.number(),
  })
    .index("by_org_product", ["organizationId", "productId"])
    .index("by_org_location_product_unit_qty", [
      "organizationId",
      "locationId",
      "productId",
      "unitId",
      "quantityKey",
    ])
    .index("by_org_location_product_all_count", [
      "organizationId",
      "locationId",
      "productId",
      "allTimeCount",
      "lastRegisteredAt",
    ])
    .index("by_org_location_product_30_count", [
      "organizationId",
      "locationId",
      "productId",
      "count30Days",
      "lastRegisteredAt",
    ])
    .index("by_org_location_product_90_count", [
      "organizationId",
      "locationId",
      "productId",
      "count90Days",
      "lastRegisteredAt",
    ]),

  wasteOrganizationProductStats: defineTable({
    organizationId: v.string(),
    productId: v.id("products"),
    allTimeCount: v.number(),
    count30Days: v.number(),
    count90Days: v.number(),
    lastRegisteredAt: v.number(),
    topAllTime: v.array(
      v.object({ unitId: v.id("units"), quantity: v.number() }),
    ),
    top30Days: v.array(
      v.object({ unitId: v.id("units"), quantity: v.number() }),
    ),
    top90Days: v.array(
      v.object({ unitId: v.id("units"), quantity: v.number() }),
    ),
  })
    .index("by_org_product", ["organizationId", "productId"])
    .index("by_org_all_count", [
      "organizationId",
      "allTimeCount",
      "lastRegisteredAt",
    ])
    .index("by_org_30_count", [
      "organizationId",
      "count30Days",
      "lastRegisteredAt",
    ])
    .index("by_org_90_count", [
      "organizationId",
      "count90Days",
      "lastRegisteredAt",
    ]),

  wasteOrganizationAmountStats: defineTable({
    organizationId: v.string(),
    productId: v.id("products"),
    unitId: v.id("units"),
    quantity: v.number(),
    quantityKey: v.string(),
    allTimeCount: v.number(),
    count30Days: v.number(),
    count90Days: v.number(),
    lastRegisteredAt: v.number(),
  })
    .index("by_org_product", ["organizationId", "productId"])
    .index("by_org_product_unit_qty", [
      "organizationId",
      "productId",
      "unitId",
      "quantityKey",
    ])
    .index("by_org_product_all_count", [
      "organizationId",
      "productId",
      "allTimeCount",
      "lastRegisteredAt",
    ])
    .index("by_org_product_30_count", [
      "organizationId",
      "productId",
      "count30Days",
      "lastRegisteredAt",
    ])
    .index("by_org_product_90_count", [
      "organizationId",
      "productId",
      "count90Days",
      "lastRegisteredAt",
    ]),

  wasteProductConfigs: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    productId: v.id("products"),
    pinnedAt: v.optional(v.number()),
    pinnedBy: v.optional(v.string()),
    shortcutOverrides: v.optional(
      v.array(v.object({ unitId: v.id("units"), quantity: v.number() })),
    ),
  })
    .index("by_org_product", ["organizationId", "productId"])
    .index("by_org_location_product", [
      "organizationId",
      "locationId",
      "productId",
    ])
    .index("by_org_location_pinned", [
      "organizationId",
      "locationId",
      "pinnedAt",
    ]),

  countSettings: defineTable({
    organizationId: v.string(),
    closeMinuteOfDay: v.optional(v.number()),
    openMinuteOfDay: v.optional(v.number()),
    allowOutsideWindow: v.optional(v.boolean()),
    lockOtherFeaturesDuringCount: v.optional(v.boolean()),
    requireCountBeforeOpening: v.optional(v.boolean()),
    countSchedule: v.optional(countScheduleValidator),
  }).index("by_organizationId", ["organizationId"]),

  counts: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    periodKey: v.string(),
    status: v.union(v.literal("open"), v.literal("submitted")),
    submittedAt: v.optional(v.number()),
    submittedByName: v.optional(v.string()),
    createdBy: v.string(),
  })
    .index("by_organizationId_and_locationId_and_periodKey", [
      "organizationId",
      "locationId",
      "periodKey",
    ])
    .index("by_organizationId_and_locationId_and_submittedAt", [
      "organizationId",
      "locationId",
      "submittedAt",
    ])
    .index("by_organizationId_and_locationId_and_status", [
      "organizationId",
      "locationId",
      "status",
    ]),

  countItems: defineTable({
    organizationId: v.string(),
    countId: v.id("counts"),
    productId: v.id("products"),
    unitId: v.id("units"),
    quantity: v.number(),
  })
    .index("by_organizationId_and_countId", ["organizationId", "countId"])
    .index("by_organizationId_and_countId_and_productId_and_unitId", [
      "organizationId",
      "countId",
      "productId",
      "unitId",
    ])
    .index("by_organizationId_and_productId", ["organizationId", "productId"]),

  countReconciliationItems: defineTable({
    organizationId: v.string(),
    countId: v.id("counts"),
    productId: v.id("products"),
    productName: v.string(),
    defaultUnitName: v.string(),
    expectedQuantity: v.number(),
    countedQuantity: v.number(),
    expectedSinceAt: v.number(),
  }).index("by_organizationId_and_countId", ["organizationId", "countId"]),

  locationStock: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    productId: v.id("products"),
    quantity: v.number(),
    updatedAt: v.number(),
    lastCountedAt: v.optional(v.number()),
  })
    .index("by_organizationId_and_locationId_and_productId", [
      "organizationId",
      "locationId",
      "productId",
    ])
    .index("by_organizationId_and_productId", ["organizationId", "productId"]),

  kioskSettings: defineTable({
    organizationId: v.string(),
    enabledPages: v.array(v.string()),
    homePage: v.string(),
    inactivitySeconds: v.union(v.number(), v.null()),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),

  dashboardDailySummaries: defineTable({
    organizationId: v.string(),
    source: v.union(
      v.literal("waste"),
      v.literal("badDeliveries"),
      v.literal("staffFood"),
      v.literal("transfers"),
      v.literal("scheduledShifts"),
    ),
    timeZone: v.string(),
    locationId: v.id("locations"),
    counterpartLocationId: v.union(v.id("locations"), v.null()),
    dayStart: v.number(),
    count: v.number(),
    value: v.number(),
    updatedAt: v.number(),
  })
    .index(
      "by_org_source_timeZone_locationId_counterpartLocationId_dayStart",
      [
        "organizationId",
        "source",
        "timeZone",
        "locationId",
        "counterpartLocationId",
        "dayStart",
      ],
    )
    .index("by_org_source_timeZone_dayStart", [
      "organizationId",
      "source",
      "timeZone",
      "dayStart",
    ])
    .index("by_org_source_timeZone_locationId_dayStart", [
      "organizationId",
      "source",
      "timeZone",
      "locationId",
      "dayStart",
    ])
    .index("by_org_source_timeZone_counterpartLocationId_dayStart", [
      "organizationId",
      "source",
      "timeZone",
      "counterpartLocationId",
      "dayStart",
    ]),

  dashboardSummaryDeltas: defineTable({
    deltas: v.array(
      v.object({
        organizationId: v.string(),
        source: dashboardSummarySourceValidator,
        timeZone: v.string(),
        locationId: v.id("locations"),
        counterpartLocationId: v.union(v.id("locations"), v.null()),
        dayStart: v.number(),
        count: v.number(),
        value: v.number(),
      }),
    ),
  }),

  dashboardSummaryStatuses: defineTable({
    organizationId: v.string(),
    source: v.union(
      v.literal("waste"),
      v.literal("badDeliveries"),
      v.literal("staffFood"),
      v.literal("transfers"),
      v.literal("scheduledShifts"),
    ),
    timeZone: v.string(),
    version: v.optional(v.number()),
    state: v.union(
      v.literal("building"),
      v.literal("ready"),
      v.literal("stale"),
    ),
    runToken: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_organizationId_and_source", ["organizationId", "source"]),

  sidebarSettings: defineTable({
    organizationId: v.string(),
    itemOrder: v.array(v.string()),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),

  dashboards: defineTable({
    organizationId: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    widgets: v.array(widgetValidator),
    defaultScope: scopeValidator,
    defaultRange: rangeValidator,
    roleIds: v.array(v.string()),
    defaultForRoleIds: v.array(v.string()),
    defaultForLocationIds: v.array(v.id("locations")),
    isOrganizationDefault: v.boolean(),
    sortOrder: v.number(),
    createdBy: v.string(),
    updatedBy: v.string(),
    updatedAt: v.number(),
  })
    .index("by_organizationId_and_normalizedName", [
      "organizationId",
      "normalizedName",
    ])
    .index("by_organizationId_and_sortOrder", [
      "organizationId",
      "sortOrder",
    ]),

  customMetrics: defineTable({
    organizationId: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    description: v.optional(v.string()),
    spec: customMetricSpecValidator,
    createdBy: v.string(),
    updatedBy: v.string(),
    updatedAt: v.number(),
  }).index("by_organizationId_and_normalizedName", [
    "organizationId",
    "normalizedName",
  ]),

  dashboardShares: defineTable({
    organizationId: v.string(),
    dashboardId: v.id("dashboards"),
    token: v.string(),
    unlockKey: v.string(),
    passwordHash: v.optional(v.string()),
    passwordSalt: v.optional(v.string()),
    name: v.string(),
    widgets: v.array(widgetValidator),
    customMetricSnapshots: v.array(
      v.object({
        id: v.id("customMetrics"),
        name: v.string(),
        spec: customMetricSpecValidator,
      }),
    ),
    scope: scopeValidator,
    range: rangeValidator,
    createdBy: v.string(),
    granularity: v.optional(
      v.union(
        v.literal("detail"),
        v.literal("aggregate"),
        v.literal("anonymous"),
      ),
    ),
    salesDetailAllowed: v.optional(v.boolean()),
    expiresAt: v.number(),
    revokedAt: v.optional(v.number()),
    lastViewedAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_organizationId", ["organizationId"])
    .index("by_revokedAt_and_expiresAt", ["revokedAt", "expiresAt"]),

  ownCheckTemplates: defineTable({
    organizationId: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    currentVersion: v.number(),
    status: v.union(v.literal("active"), v.literal("archived")),
    createdBy: v.string(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_organizationId_and_normalizedName", ["organizationId", "normalizedName"])
    .index("by_organizationId_and_status_and_normalizedName", [
      "organizationId", "status", "normalizedName",
    ])
    .index("by_organizationId_and_status_and_archivedAt", [
      "organizationId", "status", "archivedAt",
    ]),

  ownCheckTemplateVersions: defineTable({
    organizationId: v.string(),
    templateId: v.id("ownCheckTemplates"),
    version: v.number(),
    name: v.string(),
    description: v.string(),
    controlType: ownCheckControlTypeValidator,
    schedule: ownCheckScheduleValidator,
    startMinuteOfDay: v.optional(v.number()),
    dueMinuteOfDay: v.optional(v.number()),
    fields: v.array(ownCheckFieldValidator),
    allLocations: v.boolean(),
    locationIds: v.array(v.id("locations")),
    responsibleRole: v.optional(v.string()),
    validFrom: v.number(),
    validTo: v.optional(v.number()),
    createdAt: v.number(),
    createdBy: v.string(),
    createdByName: v.string(),
  })
    .index("by_organizationId_and_templateId_and_version", [
      "organizationId", "templateId", "version",
    ])
    .index("by_organizationId_and_validFrom", ["organizationId", "validFrom"])
    .index("by_organizationId_and_templateId_and_validFrom", [
      "organizationId", "templateId", "validFrom",
    ]),

  ownCheckEntries: defineTable({
    organizationId: v.string(),
    locationId: v.id("locations"),
    locationName: v.string(),
    templateId: v.id("ownCheckTemplates"),
    templateVersionId: v.id("ownCheckTemplateVersions"),
    templateVersion: v.number(),
    name: v.string(),
    controlType: ownCheckControlTypeValidator,
    dueDateKey: v.string(),
    dueAt: v.number(),
    status: v.union(v.literal("completed"), v.literal("deviation"), v.literal("approved")),
    hasDeviation: v.boolean(),
    followUp: v.union(v.literal("none"), v.literal("open"), v.literal("resolved")),
    compliant: v.boolean(),
    values: v.array(ownCheckValueValidator),
    note: v.optional(v.string()),
    deviation: v.optional(ownCheckNoteValidator),
    correctiveAction: v.optional(ownCheckNoteValidator),
    performedAt: v.number(),
    performedBy: v.string(),
    performedByName: v.string(),
    approvedAt: v.optional(v.number()),
    approvedBy: v.optional(v.string()),
    approvedByName: v.optional(v.string()),
    revision: v.number(),
    updatedAt: v.number(),
    clientRequestId: v.optional(v.string()),
  })
    .index("by_organizationId_and_locationId_and_dueDateKey", [
      "organizationId", "locationId", "dueDateKey",
    ])
    .index("by_org_location_template_dueDateKey", [
      "organizationId", "locationId", "templateId", "dueDateKey",
    ])
    .index("by_organizationId_and_locationId_and_dueAt", [
      "organizationId", "locationId", "dueAt",
    ])
    .index("by_organizationId_and_dueAt", ["organizationId", "dueAt"])
    .index("by_org_dueDateKey_dueAt", [
      "organizationId", "dueDateKey", "dueAt",
    ])
    .index("by_org_location_status_dueDateKey_dueAt", [
      "organizationId", "locationId", "status", "dueDateKey", "dueAt",
    ])
    .index("by_org_location_hasDeviation_dueDateKey_dueAt", [
      "organizationId", "locationId", "hasDeviation", "dueDateKey", "dueAt",
    ])
    .index("by_organizationId_and_status_and_dueAt", [
      "organizationId", "status", "dueAt",
    ])
    .index("by_organizationId_and_performedBy_and_dueAt", [
      "organizationId", "performedBy", "dueAt",
    ])
    .index("by_organizationId_and_clientRequestId", [
      "organizationId", "clientRequestId",
    ]),

  ownCheckEntryRevisions: defineTable({
    organizationId: v.string(),
    entryId: v.id("ownCheckEntries"),
    revision: v.number(),
    kind: v.union(
      v.literal("submitted"),
      v.literal("edited"),
      v.literal("deviationRecorded"),
      v.literal("correctiveActionRecorded"),
      v.literal("approved"),
    ),
    values: v.array(ownCheckValueValidator),
    status: v.union(v.literal("completed"), v.literal("deviation"), v.literal("approved")),
    hasDeviation: v.boolean(),
    followUp: v.union(v.literal("none"), v.literal("open"), v.literal("resolved")),
    compliant: v.boolean(),
    note: v.optional(v.string()),
    deviation: v.optional(ownCheckNoteValidator),
    correctiveAction: v.optional(ownCheckNoteValidator),
    changes: v.array(v.object({
      field: v.string(),
      label: v.string(),
      from: v.union(v.string(), v.null()),
      to: v.union(v.string(), v.null()),
    })),
    reason: v.optional(v.string()),
    at: v.number(),
    actorUserId: v.string(),
    actorName: v.string(),
  }).index("by_organizationId_and_entryId_and_revision", [
    "organizationId", "entryId", "revision",
  ]),

  ownCheckSettings: defineTable({
    organizationId: v.string(),
    lateSubmissionDays: v.optional(v.number()),
    requireSecondPersonApproval: v.optional(v.boolean()),
    blockDuringCount: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),

  ownCheckAttachments: defineTable({
    organizationId: v.string(),
    entryId: v.id("ownCheckEntries"),
    fieldKey: v.string(),
    storageId: v.id("_storage"),
    contentType: v.string(),
    fileSize: v.number(),
    addedAtRevision: v.number(),
    removedAtRevision: v.optional(v.number()),
    uploadedAt: v.number(),
    uploadedBy: v.string(),
  })
    .index("by_organizationId_and_entryId", ["organizationId", "entryId"])
    .index("by_storageId", ["storageId"]),
});
