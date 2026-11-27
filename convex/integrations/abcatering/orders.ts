import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "../../_generated/server";
import { orderInputValidator, requireDeliveryDate } from "../../ordering";
import { requireExternalDelivery } from "../../lib/testOrganizations";
import { requireIntegrationEnabled } from "../state";
import { withAccessToken } from "./api";
import {
  parseProductNumber,
  placeOrder,
  type AbOrderMessage,
} from "./lib/api";

const MAX_LINES = 500;

function abLines(
  lines: { supplierProductNumber?: string; quantity: number }[],
) {
  return lines.map((line) => {
    const product = parseProductNumber(line.supplierProductNumber ?? "");
    if (!product || !Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new ConvexError("En linje mangler et gyldigt AB Catering-varenummer");
    }
    return { ...product, amount: line.quantity };
  });
}

function joinMessages(messages: AbOrderMessage[]) {
  return messages
    .map((message) => message.message)
    .join(". ")
    .slice(0, 1000);
}

const messageValidator = v.object({ key: v.string(), message: v.string() });

/** Checks the order with AB without placing it, so the user can see its warnings first. */
export const check = action({
  args: orderInputValidator.extend({ deliveryDate: v.string() }).fields,
  returns: v.object({
    errors: v.array(messageValidator),
    warnings: v.array(messageValidator),
  }),
  handler: async (
    ctx,
    { deliveryDate, ...order },
  ): Promise<{ errors: AbOrderMessage[]; warnings: AbOrderMessage[] }> => {
    const payload = await ctx.runQuery(
      internal.ordering.prepareAbCateringOrder,
      order,
    );
    await requireExternalDelivery(ctx, payload.organizationId);
    await requireIntegrationEnabled(ctx, payload.organizationId, "abcatering");
    const date = requireDeliveryDate(deliveryDate);
    const result = await withAccessToken(
      ctx,
      payload.organizationId,
      (accessToken) =>
        placeOrder(accessToken, {
          lines: abLines(payload.lines),
          deliveryDate: date,
          ignoreWarnings: [],
          testOrder: true,
        }),
    );
    if (result.status === "placed") return { errors: [], warnings: [] };
    return {
      errors: result.status === "errors" ? result.errors : [],
      warnings: result.warnings,
    };
  },
});

export const getPayload = internalQuery({
  args: { orderId: v.id("orders") },
  returns: v.union(
    v.object({
      organizationId: v.string(),
      deliveryDate: v.union(v.string(), v.null()),
      acceptedWarnings: v.array(v.string()),
      lines: v.array(
        v.object({
          supplierProductNumber: v.optional(v.string()),
          quantity: v.number(),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const order = await ctx.db.get("orders", args.orderId);
    if (order?.supplierOrder?.status !== "pending") return null;
    const lines = await ctx.db
      .query("orderLines")
      .withIndex("by_organizationId_and_orderId", (q) =>
        q.eq("organizationId", order.organizationId).eq("orderId", order._id),
      )
      .take(MAX_LINES);
    return {
      organizationId: order.organizationId,
      deliveryDate: order.supplierOrder.deliveryDate ?? null,
      acceptedWarnings: order.supplierOrder.acceptedWarnings ?? [],
      lines: lines.map(({ supplierProductNumber, quantity }) => ({
        supplierProductNumber,
        quantity,
      })),
    };
  },
});

export const complete = internalMutation({
  args: {
    orderId: v.id("orders"),
    failureMessage: v.optional(v.string()),
    orderNumbers: v.optional(v.array(v.number())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const order = await ctx.db.get("orders", args.orderId);
    if (!order?.supplierOrder || order.supplierOrder.status !== "pending") {
      return null;
    }
    // Recorded even if the integration was disabled meanwhile, so the order is never sent twice.
    await ctx.db.patch("orders", order._id, {
      supplierOrder: args.failureMessage !== undefined
        ? {
            ...order.supplierOrder,
            status: "failed",
            failureMessage:
              args.failureMessage || "Bestillingen kunne ikke sendes til AB Catering",
          }
        : {
            ...order.supplierOrder,
            status: "sent",
            orderNumbers: args.orderNumbers,
          },
    });
    return null;
  },
});

/** Places an order with AB Catering. Scheduled once per order, so it never retries on its own. */
export const submit = internalAction({
  args: { orderId: v.id("orders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(
      internal.integrations.abcatering.orders.getPayload,
      args,
    );
    if (!payload) return null;
    let failureMessage: string | undefined;
    let orderNumbers: number[] | undefined;
    try {
      await requireExternalDelivery(ctx, payload.organizationId);
      await requireIntegrationEnabled(ctx, payload.organizationId, "abcatering");
      const { deliveryDate } = payload;
      if (!deliveryDate) throw new ConvexError("Bestillingen mangler en leveringsdato");
      const lines = abLines(payload.lines);
      const result = await withAccessToken(
        ctx,
        payload.organizationId,
        (accessToken) =>
          placeOrder(accessToken, {
            lines,
            deliveryDate,
            ignoreWarnings: payload.acceptedWarnings,
            testOrder: false,
          }),
      );
      if (result.status === "placed") {
        orderNumbers = result.orderNumbers;
      } else if (result.status === "errors") {
        failureMessage = joinMessages(result.errors);
      } else {
        failureMessage = `Nye advarsler fra AB Catering: ${joinMessages(result.warnings)}`;
      }
    } catch (error) {
      failureMessage =
        error instanceof ConvexError && typeof error.data === "string"
          ? error.data
          : "Bestillingen kunne ikke sendes til AB Catering";
      console.error(`AB Catering order ${args.orderId} failed`, error);
    }
    await ctx.runMutation(internal.integrations.abcatering.orders.complete, {
      orderId: args.orderId,
      failureMessage,
      orderNumbers,
    });
    return null;
  },
});
