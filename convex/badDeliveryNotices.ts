"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { sendResendEmail } from "./lib/resend";

const noticeKindValidator = v.union(
  v.literal("initial"),
  v.literal("cancellation"),
);

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!,
  );
}

function cleanError(error: unknown) {
  const message = error instanceof Error ? error.message : "Ukendt e-mailfejl";
  return message.replace(/\s+/g, " ").trim().slice(0, 300);
}

function extension(contentType: string) {
  return contentType === "image/jpeg"
    ? "jpg"
    : contentType === "image/png"
      ? "png"
      : contentType === "image/avif"
        ? "avif"
        : "webp";
}

function renderTemplate(template: string, values: Record<string, string>) {
  return template.replace(
    /\{([^{}]+)\}/g,
    (token, key: string) => values[key] ?? token,
  );
}

export const sendNotice = internalAction({
  args: {
    badDeliveryId: v.id("badDeliveries"),
    kind: noticeKindValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let payload;
    try {
      payload = await ctx.runMutation(
        internal.badDeliveries.claimNotice,
        args,
      );
    } catch (error) {
      await ctx.runMutation(internal.badDeliveries.failNoticeClaim, {
        ...args,
        failureMessage: cleanError(error),
      });
      return null;
    }
    if (!payload) return null;
    let completion:
      | { success: true; providerId: string }
      | { success: false; failureMessage: string };
    try {
      const date = new Intl.DateTimeFormat("da-DK", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: payload.timeZone,
      }).format(payload.registeredAt);
      const reference = String(payload.id);
      const quantities = new Intl.NumberFormat("da-DK", {
        maximumFractionDigits: 6,
      });
      const productText = payload.items
        .map(
          (item) =>
            `- ${item.productName}: ${quantities.format(item.quantity)} ${item.unitName}`,
        )
        .join("\n");
      const stock = payload.deductFromStock
        ? "Produkterne er trukket fra lageret."
        : "Produkterne er ikke trukket fra lageret.";
      const subjectBase = payload.emailSubject
        .replaceAll("{location}", payload.locationName)
        .replaceAll("{date}", date);
      const correction = payload.voidedAt
        ? new Intl.DateTimeFormat("da-DK", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: payload.timeZone,
          }).format(payload.voidedAt)
        : "";
      let attachments: Array<{ filename: string; content: string }> | undefined;
      if (args.kind === "initial") {
        const blobs = await Promise.all(
          payload.attachments.map((attachment) =>
            ctx.storage.get(attachment.storageId),
          ),
        );
        if (blobs.some((blob) => !blob)) {
          throw new Error("Et vedhæftet billede blev ikke fundet");
        }
        attachments = await Promise.all(
          payload.attachments.map(async (attachment, index) => ({
            filename: `${
              attachment.kind === "badProducts"
                ? "daarlige-produkter"
                : "foelgeseddel"
            }.${extension(attachment.contentType)}`,
            content: Buffer.from(await blobs[index]!.arrayBuffer()).toString(
              "base64",
            ),
          })),
        );
      }
      const isCancellation = args.kind === "cancellation";
      const subject = isCancellation ? `ANNULLERET: ${subjectBase}` : subjectBase;
      const initialText = renderTemplate(payload.emailBody, {
        reference,
        location: payload.locationName,
        date,
        registrar: payload.registeredByName,
        products: productText,
        comment: payload.comment ?? "Ingen kommentar",
        stock,
      });
      const text = isCancellation
        ? `Registreringen er annulleret.\n\nReference: ${reference}\nLokation: ${payload.locationName}\nRegistreret: ${date}\nAnnulleret: ${correction}${payload.voidedByName ? ` af ${payload.voidedByName}` : ""}\n\n${stock}`
        : initialText;
      const html = isCancellation
        ? `<h1>Registreringen er annulleret</h1><p><strong>Reference:</strong> ${escapeHtml(reference)}</p><p><strong>Lokation:</strong> ${escapeHtml(payload.locationName)}<br><strong>Registreret:</strong> ${escapeHtml(date)}<br><strong>Annulleret:</strong> ${escapeHtml(correction)}${payload.voidedByName ? ` af ${escapeHtml(payload.voidedByName)}` : ""}</p><p>${escapeHtml(stock)}</p>`
        : `<div>${escapeHtml(initialText).replace(/\r?\n/g, "<br>")}</div>`;
      const providerId = await sendResendEmail(
        {
          to: payload.to,
          ...(payload.cc.length ? { cc: payload.cc } : {}),
          ...(payload.bcc.length ? { bcc: payload.bcc } : {}),
          subject,
          text,
          html,
          attachments,
        },
        `bad-delivery/${reference}/${args.kind}`,
      );
      completion = { success: true, providerId };
    } catch (error) {
      completion = { success: false, failureMessage: cleanError(error) };
    }
    await ctx.runMutation(internal.badDeliveries.completeNotice, {
      ...args,
      ...completion,
    });
    return null;
  },
});
