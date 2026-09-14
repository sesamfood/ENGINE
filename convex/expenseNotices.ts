"use node";

import { v } from "convex/values";
import { expenseCategories } from "../lib/expenses";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { emailErrorMessage, escapeHtml } from "./lib/email";
import { sendResendEmail } from "./lib/resend";

export const sendNotice = internalAction({
  args: { expenseId: v.id("expenses") }, returns: v.null(),
  handler: async (ctx, args) => {
    const expense = await ctx.runMutation(internal.expenses.claimNotice, args);
    if (!expense) return null;
    let result: { providerId: string } | { error: string };
    try {
      const money = new Intl.NumberFormat("da-DK", { style: "currency", currency: expense.currency });
      const category = expenseCategories.find((item) => item.id === expense.categoryId)?.label ?? expense.categoryId;
      const text = [
        "Udgift registreret", "", `Reference: ${expense._id}`, `Lokation: ${expense.locationName}`,
        `Kategori: ${category}`, `Leverandør / modtager: ${expense.supplier}`, `Dato: ${expense.date}`, `Periode: ${expense.period}`,
        `Beløb ekskl. moms: ${money.format(expense.netAmount / 100)}`, `Moms (${expense.vatRate} %): ${money.format(expense.vatAmount / 100)}`,
        `Beløb inkl. moms: ${money.format(expense.grossAmount / 100)}`, `Registreret af: ${expense.registeredByName}`,
        `Kommentar: ${expense.comment || "Ingen kommentar"}`,
      ].join("\n");
      const attachments: Array<{ filename: string; content: string }> = [];
      if (expense.attachment) {
        const file = await ctx.storage.get(expense.attachment.storageId);
        if (!file) throw new Error("Bilaget blev ikke fundet");
        attachments.push({ filename: expense.attachment.fileName, content: Buffer.from(await file.arrayBuffer()).toString("base64") });
      }
      const providerId = await sendResendEmail({
        to: expense.to, ...(expense.cc.length ? { cc: expense.cc } : {}), ...(expense.bcc.length ? { bcc: expense.bcc } : {}),
        subject: `Udgift - ${expense.locationName} - ${expense.date}`,
        text, html: `<div>${escapeHtml(text).replaceAll("\n", "<br>")}</div>`, attachments,
      }, `expense/${expense._id}`);
      result = { providerId };
    } catch (error) {
      result = { error: emailErrorMessage(error, "E-mailen kunne ikke sendes") };
    }
    await ctx.runMutation(internal.expenses.completeNotice, { ...args, ...result });
    return null;
  },
});
