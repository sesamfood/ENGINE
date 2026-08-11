import { expect, test } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  requireLocationAccess,
  requirePermission,
  resolveLocationFilter,
} from "./auth";
import { hasPermission } from "../../lib/auth-permissions";

type TestAuth = Parameters<typeof resolveLocationFilter>[0];

const location = (value: string) => value as Id<"locations">;

function makeAuth(overrides: Partial<TestAuth> = {}): TestAuth {
  return {
    organizationId: "org",
    role: "member",
    granularity: "detail",
    permissions: new Set(["count.register"]),
    locationScope: { all: true, ids: new Set() },
    userId: "user-id",
    sessionId: "session",
    isKioskAccount: false,
    kioskModeEnabled: false,
    kioskLocationId: null,
    userIdentifier: "user",
    userName: "Bruger",
    ...overrides,
  };
}

test("resolveLocationFilter bruger en eksplicit lokation", () => {
  const locationId = location("allowed");
  const auth = makeAuth({
    locationScope: { all: false, ids: new Set([locationId]) },
  });

  expect(resolveLocationFilter(auth, locationId)).toEqual({ locationId });
});

test("resolveLocationFilter bruger kioskkontoens faste lokation", () => {
  const kioskLocationId = location("kiosk");
  const auth = makeAuth({
    isKioskAccount: true,
    kioskModeEnabled: true,
    kioskLocationId,
  });

  expect(resolveLocationFilter(auth)).toEqual({ locationId: kioskLocationId });
});

test("resolveLocationFilter returnerer all for et all-scope", () => {
  expect(resolveLocationFilter(makeAuth())).toBe("all");
});

test("resolveLocationFilter returnerer valgte lokationer", () => {
  const first = location("first");
  const second = location("second");
  const auth = makeAuth({
    locationScope: { all: false, ids: new Set([first, second]) },
  });

  expect(resolveLocationFilter(auth)).toEqual({ locationIds: [first, second] });
});

test("requireLocationAccess afviser en lokation uden for scope", () => {
  const allowedLocationId = location("allowed");
  const foreignLocationId = location("foreign");
  const auth = makeAuth({
    locationScope: { all: false, ids: new Set([allowedLocationId]) },
  });

  expect(() => requireLocationAccess(auth, foreignLocationId)).toThrowError(
    "Du har ikke adgang til denne lokation",
  );
});

test("requireLocationAccess afviser en kioskkonto på en anden lokation", () => {
  const kioskLocationId = location("kiosk");
  const foreignLocationId = location("foreign");
  const auth = makeAuth({
    isKioskAccount: true,
    kioskModeEnabled: true,
    kioskLocationId,
  });

  expect(() => requireLocationAccess(auth, foreignLocationId)).toThrowError(
    "Kioskkontoen har ikke adgang til denne lokation",
  );
});

test("hasPermission kræver også administratorens gemte tilladelse", () => {
  expect(hasPermission("admin", new Set(), "count.register")).toBe(false);
  expect(
    hasPermission("admin", new Set(["count.register"]), "count.register"),
  ).toBe(true);
  expect(hasPermission("member", new Set(), "count.register")).toBe(false);
});

test("requirePermission afviser et medlem uden tilladelsen", async () => {
  const ctx = {
    runQuery: async () => ({
      organizationId: "org",
      role: "member",
      permissions: [],
      locationScope: { all: true, ids: [] },
      userId: "user-id",
      sessionId: "session",
      isKioskAccount: false,
      kioskModeEnabled: false,
      kioskLocationId: null,
      userIdentifier: "user",
      userName: "Bruger",
    }),
  } as never;

  await expect(requirePermission(ctx, "count.register")).rejects.toThrowError(
    "Du har ikke adgang",
  );
});
