import { describe, expect, test } from "vitest";
import {
  countCombinedWarning,
  resolveCountSalesSource,
} from "./countSalesSource";

describe("Count sales source", () => {
  test("keeps OnlinePOS as the backwards-compatible default", () => {
    expect(resolveCountSalesSource(null, true, true)).toBe("onlinePos");
    expect(resolveCountSalesSource(null, false, false)).toBe("onlinePos");
  });

  test("uses Wolt by default when it is the only connected source", () => {
    expect(resolveCountSalesSource(null, false, true)).toBe("wolt");
  });

  test("honors every explicit source choice", () => {
    expect(resolveCountSalesSource("onlinePos", false, true)).toBe("onlinePos");
    expect(resolveCountSalesSource("wolt", true, false)).toBe("wolt");
    expect(resolveCountSalesSource("combined", true, true)).toBe("combined");
  });

  test("warns only when both providers are combined", () => {
    expect(countCombinedWarning("combined")).toContain("to gange");
    expect(countCombinedWarning("onlinePos")).toBeNull();
    expect(countCombinedWarning("wolt")).toBeNull();
  });
});
