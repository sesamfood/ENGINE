import { ConvexError, v } from "convex/values";
import { mutation, query } from "../../_generated/server";
import {
  requireAllLocationAccess,
  requireIntegrationManager,
} from "../../lib/auth";
import { recordAudit } from "../../lib/audit";
import { requireIntegrationEnabled } from "../state";
import { getOnlinePosOrganizationSettings } from "./lib/connections";

const RECENT_DAYS = 30;
const MAX_LOCATIONS = 200;
const MAX_PAYMENT_TYPES = 50;

export const getSalesChannels = query({
  args: {},
  returns: v.object({
    canManage: v.boolean(),
    onlinePaymentTypes: v.array(v.string()),
    paymentTypes: v.array(
      v.object({ paymentType: v.string(), orderCount: v.number() }),
    ),
  }),
  handler: async (ctx) => {
    const auth = await requireIntegrationManager(ctx);
    await requireIntegrationEnabled(ctx, auth.organizationId, "onlinepos");
    const [settings, connections] = await Promise.all([
      getOnlinePosOrganizationSettings(ctx, auth.organizationId),
      ctx.db
        .query("onlinePosLocationIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", auth.organizationId),
        )
        .take(MAX_LOCATIONS),
    ]);
    let canManage = true;
    try {
      requireAllLocationAccess(auth);
    } catch {
      canManage = false;
    }
    const onlinePaymentTypes = settings?.onlinePaymentTypes ?? [];
    const counts = new Map(onlinePaymentTypes.map((type) => [type, 0]));
    if (canManage) {
      const since = Date.now() - RECENT_DAYS * 86_400_000;
      const days = await Promise.all(
        connections.map((connection) =>
          ctx.db
            .query("salesDaily")
            .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
              q
                .eq("organizationId", auth.organizationId)
                .eq("locationId", connection.locationId)
                .gte("dayStart", since),
            )
            .take(RECENT_DAYS + 1),
        ),
      );
      for (const day of days.flat()) {
        for (const entry of day.paymentTypes ?? []) {
          counts.set(
            entry.paymentType,
            (counts.get(entry.paymentType) ?? 0) + entry.orderCount,
          );
        }
      }
    }
    return {
      canManage,
      onlinePaymentTypes,
      paymentTypes: [...counts]
        .map(([paymentType, orderCount]) => ({ paymentType, orderCount }))
        .sort((a, b) => b.orderCount - a.orderCount),
    };
  },
});

export const setOnlinePaymentTypes = mutation({
  args: { paymentTypes: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireIntegrationManager(ctx);
    await requireIntegrationEnabled(ctx, auth.organizationId, "onlinepos");
    requireAllLocationAccess(auth);
    const settings = await getOnlinePosOrganizationSettings(
      ctx,
      auth.organizationId,
    );
    if (!settings) throw new ConvexError("Forbind OnlinePOS først");
    const paymentTypes = [...new Set(args.paymentTypes)];
    if (paymentTypes.length > MAX_PAYMENT_TYPES) {
      throw new ConvexError("Vælg færre betalingstyper");
    }
    await ctx.db.patch(settings._id, {
      onlinePaymentTypes: paymentTypes,
      updatedAt: Date.now(),
    });
    await recordAudit(ctx, auth, {
      action: "integration.onlinePaymentTypesChanged",
      entityTable: "onlinePosIntegrations",
      entityId: settings._id,
      summary: paymentTypes.length
        ? `OnlinePOS-betalingstyper for online salg: ${paymentTypes.join(", ")}`
        : "Ingen OnlinePOS-betalingstyper markeret som online salg",
    });
    return null;
  },
});
