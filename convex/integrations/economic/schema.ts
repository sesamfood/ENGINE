import { defineTable } from "convex/server";
import { v } from "convex/values";

export const economicTables = {
  // One e-conomic agreement per organization. Tokens use the shared v3 credential format.
  economicSettings: defineTable({
    organizationId: v.string(),
    encryptedAppSecretToken: v.string(),
    encryptedAgreementGrantToken: v.string(),
    // Null when the grant cannot read /self (Bookkeeping role).
    agreementNumber: v.union(v.number(), v.null()),
    companyName: v.string(),
    currency: v.string(),
    journalNumber: v.union(v.number(), v.null()),
    bankAccountNumber: v.number(),
    manualBankBalance: v.optional(v.object({
      amount: v.number(),
      enteredAt: v.number(),
      enteredByName: v.string(),
    })),
    connectedAt: v.number(),
    updatedAt: v.number(),
  }).index("by_organizationId", ["organizationId"]),
};
