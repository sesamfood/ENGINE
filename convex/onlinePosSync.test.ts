/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { dayStartOf } from "./lib/salesRollup";

const modules = import.meta.glob("./**/*.ts");

test("tidszonegenopbygning bevarer omsætningen og kan genstartes", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const organizationId = "org";
  const originalTimeZone = "Europe/Copenhagen";
  const nextTimeZone = "America/New_York";
  const occurredAt = Date.UTC(2026, 7, 10, 0, 30);
  const { locationId, statusId } = await t.run(async (ctx) => {
    const locationId = await ctx.db.insert("locations", {
      organizationId,
      name: "Centrum",
      normalizedName: "centrum",
      timeZone: originalTimeZone,
    });
    const statusId = await ctx.db.insert("onlinePosSyncStatus", {
      organizationId,
      locationId,
      state: "idle",
      dayStartRerollToken: "initial",
      dayStartRerollTimeZone: originalTimeZone,
      updatedAt: Date.now(),
    });
    const dayStart = dayStartOf(occurredAt, originalTimeZone);
    await ctx.db.insert("salesOrders", {
      organizationId,
      locationId,
      occurredAt,
      dayStart,
      orderNumber: 1,
      revenue: 12_500,
      itemCount: 2,
      paymentType: "card",
      department: "counter",
      source: "onlinePos",
      externalId: "1",
      updatedAt: Date.now(),
    });
    await ctx.db.insert("salesDaily", {
      organizationId,
      locationId,
      dayStart,
      date: "2026-08-10",
      revenue: 12_500,
      orderCount: 1,
      itemCount: 2,
      updatedAt: Date.now(),
    });
    return { locationId, statusId };
  });

  const noOp = await t.mutation(
    internal.onlinePosSync.rerollLocationDayStarts,
    {
      organizationId,
      locationId,
      timeZone: originalTimeZone,
      token: "initial",
      phase: "orders",
    },
  );
  expect(noOp.patched).toBe(0);
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());

  await t.run(async (ctx) => {
    await ctx.db.patch("locations", locationId, { timeZone: nextTimeZone });
    await ctx.db.patch("onlinePosSyncStatus", statusId, {
      dayStartRerollToken: "next",
      dayStartRerollTimeZone: nextTimeZone,
      updatedAt: Date.now(),
    });
  });
  await t.mutation(internal.onlinePosSync.rerollLocationDayStarts, {
    organizationId,
    locationId,
    timeZone: nextTimeZone,
    token: "next",
    phase: "orders",
  });
  await t.mutation(internal.onlinePosSync.rerollLocationDayStarts, {
    organizationId,
    locationId,
    timeZone: nextTimeZone,
    token: "next",
    phase: "orders",
  });
  await t.finishAllScheduledFunctions(() => vi.runAllTimers());

  const result = await t.run(async (ctx) => {
    const orders = await ctx.db
      .query("salesOrders")
      .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", locationId),
      )
      .take(10);
    const daily = await ctx.db
      .query("salesDaily")
      .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", locationId),
      )
      .take(10);
    return { orders, daily };
  });
  expect(result.orders[0]?.dayStart).toBe(
    dayStartOf(occurredAt, nextTimeZone),
  );
  expect(result.daily.reduce((sum, day) => sum + day.revenue, 0)).toBe(
    result.orders.reduce((sum, order) => sum + order.revenue, 0),
  );
  vi.useRealTimers();
});
