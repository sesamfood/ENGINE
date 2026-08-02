import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  openingHoursModeValidator,
  weeklyOpeningHoursValidator,
} from "./lib/openingHours";
import { countScheduleValidator } from "./lib/countSettings";

export default defineSchema({
  organizationAssets: defineTable({
    organizationId: v.string(),
    logoStorageId: v.optional(v.id("_storage")),
    wideLogoStorageId: v.optional(v.id("_storage")),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_logoStorageId", ["logoStorageId"])
    .index("by_wideLogoStorageId", ["wideLogoStorageId"]),

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

  onlinePosProductMappings: defineTable({
    organizationId: v.string(),
    productId: v.id("products"),
    onlinePosProductId: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_productId", ["organizationId", "productId"]),

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
    .index("by_organizationId_and_locationId", [
      "organizationId",
      "locationId",
    ])
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
    .index("by_organizationId_and_employeeId", [
      "organizationId",
      "employeeId",
    ])
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
  }).index("by_organizationId_and_normalizedName", [
    "organizationId",
    "normalizedName",
  ]),

  units: defineTable({
    organizationId: v.string(),
    name: v.string(),
    normalizedName: v.string(),
  }).index("by_organizationId_and_normalizedName", [
    "organizationId",
    "normalizedName",
  ]),

  products: defineTable({
    organizationId: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    categoryId: v.id("categories"),
    defaultUnitId: v.id("units"),
    imageStorageId: v.optional(v.id("_storage")),
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
  }).index("by_organizationId_and_normalizedName", [
    "organizationId",
    "normalizedName",
  ]),

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
  })
    .index("by_organizationId_and_transferredAt", [
      "organizationId",
      "transferredAt",
    ])
    .index("by_organizationId_and_fromLocationId", [
      "organizationId",
      "fromLocationId",
    ])
    .index("by_organizationId_and_toLocationId", [
      "organizationId",
      "toLocationId",
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
  }).index("by_organizationId_and_transferId", ["organizationId", "transferId"]),

  wasteSettings: defineTable({
    organizationId: v.string(),
    inactivitySeconds: v.number(),
    popularityPeriod: v.union(
      v.literal("allTime"),
      v.literal("30Days"),
      v.literal("90Days"),
    ),
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
    voidedAt: v.optional(v.number()),
    voidedBy: v.optional(v.string()),
    voidedByName: v.optional(v.string()),
  })
    .index("by_org_and_time", [
      "organizationId",
      "registeredAt",
    ])
    .index("by_org_location_time", [
      "organizationId",
      "locationId",
      "registeredAt",
    ])
    .index("by_org_status_time", [
      "organizationId",
      "status",
      "registeredAt",
    ])
    .index("by_org_location_status_time", [
      "organizationId",
      "locationId",
      "status",
      "registeredAt",
    ])
    .index(
      "by_org_location_product_status_time",
      [
        "organizationId",
        "locationId",
        "productId",
        "status",
        "registeredAt",
      ],
    )
    .index(
      "by_org_location_product_unit_qty_status_time",
      [
        "organizationId",
        "locationId",
        "productId",
        "unitId",
        "quantityKey",
        "status",
        "registeredAt",
      ],
    ),

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
    .index(
      "by_org_location_all_count",
      ["organizationId", "locationId", "allTimeCount", "lastRegisteredAt"],
    )
    .index(
      "by_org_location_30_count",
      ["organizationId", "locationId", "count30Days", "lastRegisteredAt"],
    )
    .index(
      "by_org_location_90_count",
      ["organizationId", "locationId", "count90Days", "lastRegisteredAt"],
    ),

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
    .index(
      "by_org_location_product_unit_qty",
      ["organizationId", "locationId", "productId", "unitId", "quantityKey"],
    )
    .index(
      "by_org_location_product_all_count",
      [
        "organizationId",
        "locationId",
        "productId",
        "allTimeCount",
        "lastRegisteredAt",
      ],
    )
    .index(
      "by_org_location_product_30_count",
      [
        "organizationId",
        "locationId",
        "productId",
        "count30Days",
        "lastRegisteredAt",
      ],
    )
    .index(
      "by_org_location_product_90_count",
      [
        "organizationId",
        "locationId",
        "productId",
        "count90Days",
        "lastRegisteredAt",
      ],
    ),

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
    .index("by_organizationId_and_productId", [
      "organizationId",
      "productId",
    ]),

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
    .index("by_organizationId_and_productId", [
      "organizationId",
      "productId",
    ]),
});
