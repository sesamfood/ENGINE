import { expect, test } from "vitest";
import type { Id } from "../_generated/dataModel";
import { woltDailyContribution } from "./woltRollup";

const locationId = "location" as Id<"locations">;

test("leveret Wolt-ordre bidrager med kurv, ordre og varer", () => {
  expect(
    woltDailyContribution("org", locationId, "Europe/Copenhagen", {
      occurredAt: Date.parse("2026-08-27T22:30:00.000Z"),
      currency: "DKK",
      basketPrice: 12_500,
      itemCount: 3,
      status: "delivered",
    }),
  ).toMatchObject({
    date: "2026-08-28",
    revenue: 12_500,
    orderCount: 1,
    itemCount: 3,
    canceledCount: 0,
    totalCount: 1,
  });
});

test("annulleret ordre bidrager kun til annulleringsraten", () => {
  expect(
    woltDailyContribution("org", locationId, "Europe/Copenhagen", {
      occurredAt: Date.parse("2026-08-27T10:00:00.000Z"),
      currency: "DKK",
      basketPrice: 12_500,
      itemCount: 3,
      status: "canceled",
    }),
  ).toMatchObject({
    revenue: 0,
    orderCount: 0,
    itemCount: 0,
    canceledCount: 1,
    totalCount: 1,
  });
});

test("refund fratrækkes kun når et dokumenteret beløb gives", () => {
  const withoutProof = woltDailyContribution("org", locationId, "UTC", {
    occurredAt: Date.parse("2026-08-27T10:00:00.000Z"),
    currency: "DKK",
    basketPrice: 10_000,
    itemCount: 1,
    status: "delivered",
  });
  const withProof = woltDailyContribution("org", locationId, "UTC", {
    occurredAt: Date.parse("2026-08-27T10:00:00.000Z"),
    currency: "DKK",
    basketPrice: 10_000,
    refundAmount: 2_500,
    itemCount: 1,
    status: "delivered",
  });
  expect(withoutProof.revenue).toBe(10_000);
  expect(withProof.revenue).toBe(7_500);
});
