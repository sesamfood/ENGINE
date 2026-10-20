import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { emailErrorMessage, escapeHtml } from "./lib/email";
import { sendResendEmail } from "./lib/resend";
import { requireExternalDelivery } from "./lib/testOrganizations";
import { resolveTimeZone } from "./lib/timeZone";

const MAX_LINES = 500;

export const getPayload = internalQuery({
  args: { orderId: v.id("orders") },
  returns: v.union(
    v.object({
      organizationId: v.string(),
      to: v.string(),
      locationName: v.string(),
      supplierName: v.string(),
      createdByName: v.string(),
      createdAt: v.number(),
      timeZone: v.string(),
      lines: v.array(
        v.object({
          productName: v.string(),
          unitName: v.string(),
          quantity: v.number(),
          supplierProductNumber: v.optional(v.string()),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const order = await ctx.db.get("orders", args.orderId);
    if (!order?.email || order.email.status !== "pending") return null;
    const lines = await ctx.db
      .query("orderLines")
      .withIndex("by_organizationId_and_orderId", (q) =>
        q.eq("organizationId", order.organizationId).eq("orderId", order._id),
      )
      .take(MAX_LINES);
    const location = await ctx.db.get("locations", order.locationId);
    return {
      timeZone: await resolveTimeZone(
        ctx,
        order.organizationId,
        location ? order.locationId : undefined,
      ),
      organizationId: order.organizationId,
      to: order.email.to,
      locationName: order.locationName,
      supplierName: order.supplierName ?? "",
      createdByName: order.createdByName,
      createdAt: order.createdAt,
      lines: lines.map(
        ({ productName, unitName, quantity, supplierProductNumber }) => ({
          productName,
          unitName,
          quantity,
          supplierProductNumber,
        }),
      ),
    };
  },
});

export const complete = internalMutation({
  args: {
    orderId: v.id("orders"),
    failureMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const order = await ctx.db.get("orders", args.orderId);
    if (!order?.email || order.email.status !== "pending") return null;
    await ctx.db.patch("orders", order._id, {
      email: args.failureMessage
        ? { ...order.email, status: "failed", failureMessage: args.failureMessage }
        : { to: order.email.to, status: "sent" },
    });
    return null;
  },
});

export const send = internalAction({
  args: { orderId: v.id("orders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(internal.orderEmails.getPayload, args);
    if (!payload) return null;
    let failureMessage: string | undefined;
    try {
      await requireExternalDelivery(ctx, payload.organizationId);
      const quantities = new Intl.NumberFormat("da-DK", {
        maximumFractionDigits: 6,
      });
      const date = new Intl.DateTimeFormat("da-DK", {
        dateStyle: "long",
        timeZone: payload.timeZone,
      }).format(payload.createdAt);
      const lines = payload.lines.map(
        (line) =>
          `${line.supplierProductNumber ? `${line.supplierProductNumber} ` : ""}${line.productName}: ${quantities.format(line.quantity)} ${line.unitName}`,
      );
      const intro = `Bestilling til ${payload.supplierName} fra ${payload.locationName}, afgivet ${date} af ${payload.createdByName}.`;
      await sendResendEmail(
        {
          to: payload.to,
          subject: `Bestilling fra ${payload.locationName}`,
          text: `${intro}\n\n${lines.map((line) => `- ${line}`).join("\n")}\n`,
          html: `<p>${escapeHtml(intro)}</p><ul>${lines
            .map((line) => `<li>${escapeHtml(line)}</li>`)
            .join("")}</ul>`,
        },
        `order/${args.orderId}`,
      );
    } catch (error) {
      failureMessage = emailErrorMessage(error, "Ukendt e-mailfejl");
    }
    await ctx.runMutation(internal.orderEmails.complete, {
      orderId: args.orderId,
      failureMessage,
    });
    return null;
  },
});
