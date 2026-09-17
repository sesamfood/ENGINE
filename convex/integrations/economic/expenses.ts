"use node";

import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
import { requireIntegrationEnabled } from "../state";
import {
  attachExpenseDimension, attachExpenseReceipt, createExpenseDraft,
  ExpenseEconomicError, prepareExpenseExport, readExpenseDraft, validateExpenseReceipt,
} from "./lib/expenseApi";

export const exportExpense = internalAction({
  args: { expenseId: v.id("expenses") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const claimed: { expense: Doc<"expenses">; connection: Doc<"economicConnections"> } | null = await ctx.runMutation(internal.expenses.claimEconomic, args);
    if (!claimed) return null;
    const { expense, connection } = claimed;
    let entryNumber = expense.economicEntryNumber;
    let entryPersisted = entryNumber !== undefined;
    let creationStarted = false;
    let dimensionAttached = expense.economicDimensionAttached ?? false;
    let attachmentUploaded = expense.economicAttachmentUploaded ?? false;
    const requireEnabled = () => requireIntegrationEnabled(ctx, expense.organizationId, "economic");
    try {
      const mapping = expense.economic;
      if (!mapping) throw new ExpenseEconomicError("Udgiften mangler en e-conomic-opsætning.");
      let receipt: Blob | null = null;
      if (expense.attachment && !attachmentUploaded) {
        const blob = await ctx.storage.get(expense.attachment.storageId);
        if (!blob) throw new ExpenseEconomicError("Bilaget blev ikke fundet. Kontrollér udgiftens dokumentation.");
        receipt = await validateExpenseReceipt(blob);
      }
      const credentials = await ctx.runMutation(internal.economic.getCredentials, { organizationId: connection.organizationId, connectionId: connection._id });
      const accountingYear = await prepareExpenseExport(credentials, expense, mapping);
      if (entryNumber === undefined) {
        await requireEnabled();
        creationStarted = true;
        const created = await createExpenseDraft(credentials, expense, mapping);
        entryNumber = created.entryNumber;
        await ctx.runMutation(internal.expenses.recordEconomicEntry, { ...args, entryNumber });
        entryPersisted = true;
      }
      const entry = await readExpenseDraft(credentials, expense, mapping, entryNumber);
      await ctx.runMutation(internal.expenses.recordEconomicEntry, { ...args, entryNumber, voucherNumber: entry.voucherNumber });
      if (!dimensionAttached && mapping.dimensionNumber !== null) {
        await requireEnabled();
        await attachExpenseDimension(credentials, expense, mapping, entryNumber, requireEnabled);
        dimensionAttached = true;
      }
      if (receipt) {
        await requireEnabled();
        await attachExpenseReceipt(credentials, expense, accountingYear, entry.voucherNumber, receipt, requireEnabled);
        attachmentUploaded = true;
      }
    } catch (error) {
      const uncertain = !entryPersisted && creationStarted
        && !(error instanceof ExpenseEconomicError && !error.ambiguous);
      const message = error instanceof ExpenseEconomicError ? error.message
        : error instanceof ConvexError && typeof error.data === "string" ? error.data
          : "Udgiften kunne ikke overføres til e-conomic. Kontrollér forbindelsen og prøv igen.";
      await ctx.runMutation(internal.expenses.completeEconomic, {
        ...args, status: uncertain ? "uncertain" : "failed", dimensionAttached, attachmentUploaded,
        error: uncertain ? "e-conomic kan have oprettet posteringen. Kontrollér kassekladden, før udgiften overføres igen." : message,
      });
      return null;
    }
    await ctx.runMutation(internal.expenses.completeEconomic, {
      ...args, status: "created", dimensionAttached, attachmentUploaded,
    });
    return null;
  },
});
