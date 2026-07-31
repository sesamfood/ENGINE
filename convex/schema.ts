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

  onlinePosProductMappings: defineTable({
    organizationId: v.string(),
    productId: v.id("products"),
    onlinePosProductId: v.number(),
  })
    .index("by_organizationId", ["organizationId"])
    .index("by_organizationId_and_productId", ["organizationId", "productId"]),

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
