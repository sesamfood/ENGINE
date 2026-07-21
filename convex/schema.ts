import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
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
});
