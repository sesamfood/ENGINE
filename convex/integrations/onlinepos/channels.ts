import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalMutation, mutation, query } from "../../_generated/server";
import {
  requireAllLocationAccess,
  requireIntegrationManager,
} from "../../lib/auth";
import { recordAudit } from "../../lib/audit";
import { backfillDailyPaymentTypes } from "../../lib/salesRollup";
import { isIntegrationEnabled, requireIntegrationEnabled } from "../state";
import { getOnlinePosOrganizationSettings } from "./lib/connections";

const RECENT_DAYS = 30;
const MAX_LOCATIONS = 200;
const MAX_PAYMENT_TYPES = 50;

export const getSalesChannels = query({
  args: {},
  returns: v.object({
    canManage: v.boolean(),
    onlinePaymentTypes: v.array(v.string()),
    missingDayCount: v.number(),
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
    let missingDayCount = 0;
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
        if (day.paymentTypes === undefined) missingDayCount += 1;
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
      missingDayCount,
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

// Fills in payment types for recent days synced before the channel split.
export const backfillRecentPaymentTypes = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const auth = await requireIntegrationManager(ctx);
    await requireIntegrationEnabled(ctx, auth.organizationId, "onlinepos");
    requireAllLocationAccess(auth);
    const connections = await ctx.db
      .query("onlinePosLocationIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .take(MAX_LOCATIONS);
    const after = Date.now() - RECENT_DAYS * 86_400_000 - 1;
    for (const connection of connections) {
      await ctx.scheduler.runAfter(
        0,
        internal.integrations.onlinepos.channels.backfillLocationPaymentTypes,
        {
          organizationId: auth.organizationId,
          locationId: connection.locationId,
          after,
        },
      );
    }
    return null;
  },
});

// One day per transaction keeps busy days within mutation read limits.
export const backfillLocationPaymentTypes = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    after: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await isIntegrationEnabled(ctx, args.organizationId, "onlinepos"))) {
      return null;
    }
    const daily = await ctx.db
      .query("salesDaily")
      .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("locationId", args.locationId)
          .gt("dayStart", args.after),
      )
      .first();
    if (!daily) return null;
    await backfillDailyPaymentTypes(ctx, daily);
    await ctx.scheduler.runAfter(
      0,
      internal.integrations.onlinepos.channels.backfillLocationPaymentTypes,
      { ...args, after: daily.dayStart },
    );
    return null;
  },
});
