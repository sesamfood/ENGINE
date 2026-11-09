import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../../_generated/server";
import { requireExternalDelivery } from "../../lib/testOrganizations";
import { requireIntegrationEnabled } from "../state";
import { withAccessToken } from "./api";
import { parseProductNumber, placeOrder } from "./lib/api";

const MAX_LINES = 500;

export const getPayload = internalQuery({
  args: { orderId: v.id("orders") },
  returns: v.union(
    v.object({
      organizationId: v.string(),
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const order = await ctx.db.get("orders", args.orderId);
    if (!order?.supplierOrder || order.supplierOrder.status !== "pending") {
      return null;
    }
    // Recorded even if the integration was disabled meanwhile, so the order is never sent twice.
    await ctx.db.patch("orders", order._id, {
      supplierOrder: args.failureMessage
        ? {
            provider: order.supplierOrder.provider,
            status: "failed",
            failureMessage: args.failureMessage,
          }
        : { provider: order.supplierOrder.provider, status: "sent" },
    });
    return null;
  },
});

/** Sends a placed order to AB Catering. Scheduled once per order, so it never retries on its own. */
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
    try {
      await requireExternalDelivery(ctx, payload.organizationId);
      await requireIntegrationEnabled(ctx, payload.organizationId, "abcatering");
      const lines = payload.lines.map((line) => {
        const product = parseProductNumber(line.supplierProductNumber ?? "");
        if (!product || !Number.isInteger(line.quantity) || line.quantity <= 0) {
          throw new ConvexError("En linje mangler et gyldigt AB Catering-varenummer");
        }
        return { ...product, quantity: line.quantity };
      });
      const response = await withAccessToken(
        ctx,
        payload.organizationId,
        (accessToken) => placeOrder(accessToken, lines),
      );
      console.log(`AB Catering accepted order ${args.orderId}: ${response}`);
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
    });
    return null;
  },
});
