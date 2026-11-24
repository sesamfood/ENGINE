import { v } from "convex/values";

export const expenseCategoryValidator = v.string();

export const expenseCategoryOptionValidator = v.object({
  id: expenseCategoryValidator,
  label: v.string(),
  enabled: v.boolean(),
});

// Rows written while expenses could be exported to e-conomic still hold these fields.
// Drop them from the schema after clearing them from existing rows.
export const legacyEconomicExpenseFields = [
  "economic", "economicStatus", "economicError", "economicAttemptedAt", "economicEntryNumber",
  "economicVoucherNumber", "economicDimensionAttached", "economicAttachmentUploaded",
] as const;

export const expenseFields = {
  organizationId: v.string(),
  requestId: v.string(),
  requestFingerprint: v.string(),
  locationId: v.id("locations"),
  locationName: v.string(),
  currency: v.string(),
  categoryId: expenseCategoryValidator,
  categoryLabel: v.optional(v.string()),
  supplier: v.string(),
  netAmount: v.number(),
  vatRate: v.number(),
  vatAmount: v.number(),
  grossAmount: v.number(),
  date: v.string(),
  period: v.string(),
  comment: v.string(),
  attachment: v.optional(v.object({
    storageId: v.id("_storage"),
    fileName: v.string(),
    contentType: v.string(),
    fileSize: v.number(),
  })),
  registeredAt: v.number(),
  registeredBy: v.string(),
  registeredByName: v.string(),
  to: v.array(v.string()),
  cc: v.array(v.string()),
  bcc: v.array(v.string()),
  noticeStatus: v.union(
    v.literal("notConfigured"), v.literal("pending"), v.literal("sending"),
    v.literal("sent"), v.literal("failed"),
  ),
  noticeError: v.optional(v.string()),
  noticeAttemptedAt: v.optional(v.number()),
  noticeFirstAttemptedAt: v.optional(v.number()),
  noticeProviderId: v.optional(v.string()),
  economic: v.optional(v.any()),
  economicStatus: v.optional(v.string()),
  economicError: v.optional(v.string()),
  economicAttemptedAt: v.optional(v.number()),
  economicEntryNumber: v.optional(v.number()),
  economicVoucherNumber: v.optional(v.number()),
  economicDimensionAttached: v.optional(v.boolean()),
  economicAttachmentUploaded: v.optional(v.boolean()),
};
