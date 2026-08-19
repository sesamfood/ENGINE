"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { createLinearIssue } from "./lib/linear";
import { sendResendEmail } from "./lib/resend";
import {
  feedbackAreaEnglishLabel,
  feedbackTypeEnglishLabel,
} from "../lib/feedback";

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
  const message = error instanceof Error ? error.message : "Ukendt fejl";
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

export const deliver = internalAction({
  args: { submissionId: v.id("feedbackSubmissions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(internal.feedback.getDelivery, args);
    if (!payload) return null;

    const areaLabel = feedbackAreaEnglishLabel(payload.area);
    const typeLabel = feedbackTypeEnglishLabel(payload.type);
    const reporter = payload.userEmail
      ? `${payload.userName} (${payload.userEmail})`
      : payload.userName;
    const registered = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Copenhagen",
    }).format(payload.createdAt);
    // Submissions made before titles existed fall back to the old generated one.
    const title =
      payload.title ||
      `[${typeLabel}] ${areaLabel} – ${payload.organizationName}`;

    try {
      let reference: string | undefined;
      if (payload.destination === "linear") {
        if (!payload.linearApiKey || !payload.linearTeamId) {
          throw new Error("Linear er ikke sat op");
        }
        const description = [
          `**Organization:** ${payload.organizationName}`,
          `**Area:** ${areaLabel}`,
          `**Type:** ${typeLabel}`,
          `**Reported by:** ${reporter}`,
          `**Submitted:** ${registered}`,
          ...(payload.description || payload.screenshotUrl
            ? ["", "---", ""]
            : []),
          ...(payload.description ? [payload.description] : []),
          ...(payload.screenshotUrl
            ? ["", `![Screenshot](${payload.screenshotUrl})`]
            : []),
        ].join("\n");
        const issue = await createLinearIssue(payload.linearApiKey, {
          teamId: payload.linearTeamId,
          type: payload.type,
          title,
          description,
        });
        reference = issue.url || issue.identifier;
      } else {
        if (!payload.email) throw new Error("Modtageradressen mangler");
        const rows = [
          ["Organization", payload.organizationName],
          ["Area", areaLabel],
          ["Type", typeLabel],
          ["Reported by", reporter],
          ["Submitted", registered],
        ]
          .map(
            ([label, value]) =>
              `<tr><td style="padding:4px 16px 4px 0;color:#666;">${escapeHtml(label)}</td><td style="padding:4px 0;">${escapeHtml(value)}</td></tr>`,
          )
          .join("");
        const html = `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#111;">
  <h2 style="margin:0 0 16px;font-size:18px;">${escapeHtml(title)}</h2>
  <table style="border-collapse:collapse;margin-bottom:20px;">${rows}</table>
  ${payload.description ? `<div style="white-space:pre-wrap;">${escapeHtml(payload.description)}</div>` : ""}
</div>`;
        const text = [
          `Organization: ${payload.organizationName}`,
          `Area: ${areaLabel}`,
          `Type: ${typeLabel}`,
          `Reported by: ${reporter}`,
          `Submitted: ${registered}`,
          ...(payload.description ? ["", payload.description] : []),
        ].join("\n");

        let attachments:
          Array<{ filename: string; content: string }> | undefined;
        if (payload.screenshotStorageId) {
          const blob = await ctx.storage.get(payload.screenshotStorageId);
          if (blob) {
            attachments = [
              {
                filename: `screenshot.${extension(blob.type)}`,
                content: Buffer.from(await blob.arrayBuffer()).toString(
                  "base64",
                ),
              },
            ];
          }
        }

        reference = await sendResendEmail({
          to: payload.email,
          subject: title,
          html,
          text,
          ...(attachments ? { attachments } : {}),
        });
      }

      await ctx.runMutation(internal.feedback.completeDelivery, {
        submissionId: args.submissionId,
        ...(reference ? { reference } : {}),
      });
    } catch (error) {
      await ctx.runMutation(internal.feedback.completeDelivery, {
        submissionId: args.submissionId,
        failureMessage: cleanError(error),
      });
    }
    return null;
  },
});
