import { Migrations } from "@convex-dev/migrations";
import { ConvexError } from "convex/values";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { unitPriceFromLineTotal } from "./lib/onlinePosApi";

const ONLINE_POS_SOURCE = "onlinePos";

export const migrations = new Migrations<DataModel>(components.migrations);

export const fixOnlinePosLinePrices = migrations.define({
  table: "salesLines",
  batchSize: 50,
  migrateOne: async (ctx, line) => {
    if (line.source !== ONLINE_POS_SOURCE || line.pricingVersion === 1) return;

    const revenue = line.unitPrice;
    const unitPrice = unitPriceFromLineTotal(revenue, line.quantity);
    const revenueDelta = revenue - line.revenue;

    if (!Number.isSafeInteger(revenue) || !Number.isSafeInteger(unitPrice)) {
      throw new ConvexError("OnlinePOS-salgslinjen har ugyldige beløb");
    }

    if (revenueDelta !== 0) {
      const order = await ctx.db.get("salesOrders", line.orderId);
      if (
        !order ||
        order.organizationId !== line.organizationId ||
        order.locationId !== line.locationId ||
        order.source !== ONLINE_POS_SOURCE
      ) {
        throw new ConvexError("OnlinePOS-salgslinjen mangler sin salgsordre");
      }

      const daily = await ctx.db
        .query("salesDaily")
        .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
          q
            .eq("organizationId", line.organizationId)
            .eq("locationId", line.locationId)
            .eq("dayStart", order.dayStart),
        )
        .unique();
      if (!daily) {
        throw new ConvexError("OnlinePOS-salgslinjen mangler sit dagstotal");
      }

      const orderRevenue = order.revenue + revenueDelta;
      const dailyRevenue = daily.revenue + revenueDelta;
      if (
        !Number.isSafeInteger(orderRevenue) ||
        !Number.isSafeInteger(dailyRevenue)
      ) {
        throw new ConvexError("OnlinePOS-salgstotalen er ugyldig");
      }

      const now = Date.now();
      await ctx.db.patch("salesOrders", order._id, {
        revenue: orderRevenue,
        updatedAt: now,
      });
      await ctx.db.patch("salesDaily", daily._id, {
        revenue: dailyRevenue,
        updatedAt: now,
      });
    }

    await ctx.db.patch("salesLines", line._id, {
      unitPrice,
      revenue,
      pricingVersion: 1,
    });
  },
});
