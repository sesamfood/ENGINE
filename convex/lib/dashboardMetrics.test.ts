import { ConvexError } from "convex/values";
import { describe, expect, test } from "vitest";
import {
  resolveBuiltinSalesSource,
  salesSourceProviders,
} from "./dashboardMetrics";

describe("dashboard sales sources", () => {
  test("keeps OnlinePOS as the default for existing sales widgets", () => {
    expect(resolveBuiltinSalesSource("salesRevenue")).toBe("onlinePos");
    expect(resolveBuiltinSalesSource("salesOrderCount")).toBe("onlinePos");
    expect(resolveBuiltinSalesSource("averageBasket")).toBe("onlinePos");
  });

  test("uses only the explicitly selected providers", () => {
    expect(salesSourceProviders("onlinePos")).toEqual(["onlinepos"]);
    expect(salesSourceProviders("wolt")).toEqual(["wolt"]);
    expect(salesSourceProviders("combined")).toEqual(["onlinepos", "wolt"]);
  });

  test("locks Wolt cancellation rate to Wolt", () => {
    expect(resolveBuiltinSalesSource("woltCancellationRate")).toBe("wolt");
    expect(() =>
      resolveBuiltinSalesSource("woltCancellationRate", "combined"),
    ).toThrow(ConvexError);
  });

  test("rejects a sales source on non-sales widgets", () => {
    expect(resolveBuiltinSalesSource("wasteQuantity")).toBeUndefined();
    expect(() =>
      resolveBuiltinSalesSource("wasteQuantity", "wolt"),
    ).toThrow(ConvexError);
  });
});
