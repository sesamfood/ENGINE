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

export const sendNotice = internalAction({
  args: {
    badDeliveryId: v.id("badDeliveries"),
    kind: noticeKindValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payload = await ctx.runMutation(internal.badDeliveries.claimNotice, args);
    if (!payload) return null;
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
      const productHtml = payload.items
        .map(
          (item) =>
            `<li>${escapeHtml(item.productName)}: ${escapeHtml(quantities.format(item.quantity))} ${escapeHtml(item.unitName)}</li>`,
        )
        .join("");
      const stock = payload.deductFromStock
        ? "Varerne er trukket fra lageret."
        : "Varerne er ikke trukket fra lageret.";
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
                ? "daarlige-varer"
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
      const text = isCancellation
        ? `Registreringen af dårlig levering er annulleret.\n\nReference: ${reference}\nLocation: ${payload.locationName}\nRegistreret: ${date}\nAnnulleret: ${correction}${payload.voidedByName ? ` af ${payload.voidedByName}` : ""}\n\n${stock}`
        : `Dårlig levering\n\nReference: ${reference}\nLocation: ${payload.locationName}\nTidspunkt: ${date}\nRegistreret af: ${payload.registeredByName}\n\nVarer:\n${productText}\n\nKommentar: ${payload.comment ?? "Ingen kommentar"}\n${stock}`;
      const html = isCancellation
        ? `<h1>Registreringen er annulleret</h1><p><strong>Reference:</strong> ${escapeHtml(reference)}</p><p><strong>Location:</strong> ${escapeHtml(payload.locationName)}<br><strong>Registreret:</strong> ${escapeHtml(date)}<br><strong>Annulleret:</strong> ${escapeHtml(correction)}${payload.voidedByName ? ` af ${escapeHtml(payload.voidedByName)}` : ""}</p><p>${escapeHtml(stock)}</p>`
        : `<h1>Dårlig levering</h1><p><strong>Reference:</strong> ${escapeHtml(reference)}<br><strong>Location:</strong> ${escapeHtml(payload.locationName)}<br><strong>Tidspunkt:</strong> ${escapeHtml(date)}<br><strong>Registreret af:</strong> ${escapeHtml(payload.registeredByName)}</p><h2>Varer</h2><ul>${productHtml}</ul><p><strong>Kommentar:</strong> ${escapeHtml(payload.comment ?? "Ingen kommentar")}</p><p>${escapeHtml(stock)}</p>`;
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
      await ctx.runMutation(internal.badDeliveries.completeNotice, {
        ...args,
        success: true,
        providerId,
      });
    } catch (error) {
      await ctx.runMutation(internal.badDeliveries.completeNotice, {
        ...args,
        success: false,
        failureMessage: cleanError(error),
      });
    }
    return null;
  },
});
