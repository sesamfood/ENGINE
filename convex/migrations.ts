import { Migrations } from "@convex-dev/migrations";
import { ConvexError } from "convex/values";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { unitPriceFromLineTotal } from "./integrations/onlinepos/lib/api";
import { backfillDailyPaymentTypes } from "./lib/salesRollup";
import { gramsPerUnit } from "../lib/containers";

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

// Seeds salesDaily.paymentTypes from retained orders.
export const backfillSalesDailyPaymentTypes = migrations.define({
  table: "salesDaily",
  batchSize: 10,
  migrateOne: async (ctx, daily) => {
    await backfillDailyPaymentTypes(ctx, daily);
  },
});

// Turns unit packaging weights into unlinked containers so the weights are
// kept. Units without a weight conversion keep their old value.
export const packagingWeightsToContainers = migrations.define({
  table: "productUnits",
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    if (row.packagingWeight === undefined) return;
    const product = await ctx.db.get("products", row.productId);
    if (!product || product.organizationId !== row.organizationId) return;
    const siblings = await ctx.db
      .query("productUnits")
      .withIndex("by_organizationId_and_productId", (q) =>
        q
          .eq("organizationId", row.organizationId)
          .eq("productId", row.productId),
      )
      .take(200);
    const units = await Promise.all(
      siblings.map(async (sibling) => ({
        name: (await ctx.db.get("units", sibling.unitId))?.name ?? "",
        factorToDefault: sibling.factorToDefault,
      })),
    );
    const grams = gramsPerUnit(units, { name: "", factorToDefault: row.factorToDefault });
    if (!grams) return;

    const weightGrams = Math.round(row.packagingWeight * grams * 1000) / 1000;
    const name = `Beholder ${
      weightGrams >= 1000
        ? `${(weightGrams / 1000).toLocaleString("da-DK")} kg`
        : `${weightGrams.toLocaleString("da-DK")} g`
    }`;
    const normalizedName = name.toLocaleLowerCase("da");
    const existing = await ctx.db
      .query("containers")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", row.organizationId)
          .eq("normalizedName", normalizedName),
      )
      .first();
    if (!existing) {
      await ctx.db.insert("containers", {
        organizationId: row.organizationId,
        name,
        normalizedName,
        weightGrams,
        status: "active",
        createdBy: product.createdBy,
        updatedAt: Date.now(),
      });
    }
    await ctx.db.patch("productUnits", row._id, { packagingWeight: undefined });
  },
});
