/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import betterAuthSchema from "./betterAuth/schema";
import type { CustomMetricSpec } from "../lib/dashboard/types";

const modules = import.meta.glob("./**/*.ts");
const betterAuthModules = import.meta.glob("./betterAuth/**/*.ts");
const NOW = Date.UTC(2026, 7, 13, 12);
const FROM = "2026-08-10";
const TO = "2026-08-13";

async function baCreate(
  t: ReturnType<typeof convexTest>,
  model: string,
  data: Record<string, unknown>,
) {
  return await t.mutation(components.betterAuth.adapter.create, {
    input: { model, data },
  } as never);
}

async function setupAuthOrg(t: ReturnType<typeof convexTest>) {
  process.env.SITE_URL = "http://localhost:3000";
  t.registerComponent("betterAuth", betterAuthSchema, betterAuthModules);
  const now = Date.now();
  const user = await baCreate(t, "user", {
    name: "Ada Lovelace",
    email: `ada-${now}@example.com`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  const org = await baCreate(t, "organization", {
    name: "Chain",
    slug: `chain-${now}`,
    createdAt: now,
  });
  await baCreate(t, "member", {
    organizationId: org._id,
    userId: user._id,
    role: "admin",
    createdAt: now,
  });
  const session = await baCreate(t, "session", {
    expiresAt: now + 60 * 60 * 1000,
    token: `test-token-${now}`,
    createdAt: now,
    updatedAt: now,
    userId: user._id,
    activeOrganizationId: org._id,
  });
  const asUser = t.withIdentity({
    subject: user._id,
    issuer: "http://localhost:3000",
    tokenIdentifier: `http://localhost:3000|${user._id}`,
    sessionId: session._id,
  } as never);
  return { org, asUser };
}

async function seedBase(
  t: ReturnType<typeof convexTest>,
  organizationId: string,
) {
  return await t.run(async (ctx) => {
    const locationId = await ctx.db.insert("locations", {
      organizationId,
      name: "Nord",
      normalizedName: "nord",
      timeZone: "Europe/Copenhagen",
    });
    const categoryId = await ctx.db.insert("categories", {
      organizationId,
      name: "Drikke",
      normalizedName: "drikke",
    });
    const unitId = await ctx.db.insert("units", {
      organizationId,
      name: "stk",
      normalizedName: "stk",
    });
    const productId = await ctx.db.insert("products", {
      organizationId,
      name: "Cola",
      normalizedName: "cola",
      categoryId,
      defaultUnitId: unitId,
      status: "active",
      createdBy: "test",
      updatedAt: NOW,
    });
    const employeeId = await ctx.db.insert("employees", {
      organizationId,
      firstName: "Ada",
      lastName: "Lovelace",
      displayName: "Ada Lovelace",
      normalizedName: "ada lovelace",
      imageUrl: null,
      active: true,
      updatedAt: NOW,
    });
    return { locationId, categoryId, unitId, productId, employeeId };
  });
}

function previewArgs(
  locationId: Id<"locations">,
  spec: CustomMetricSpec,
) {
  return {
    spec,
    visualization: "kpi" as const,
    scope: { mode: "aggregate" as const, locationIds: [locationId] },
    range: {
      preset: "custom" as const,
      from: FROM,
      to: TO,
    },
    now: NOW,
  };
}

async function preview(
  asUser: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  locationId: Id<"locations">,
  spec: CustomMetricSpec,
) {
  return await asUser.query(
    api.customMetrics.preview,
    previewArgs(locationId, spec),
  );
}

test("custom metric executor mapper waste er indeksbaseret", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { locationId, unitId, productId } = await seedBase(t, org._id);
  await t.run(async (ctx) => {
    await ctx.db.insert("wasteRegistrations", {
      organizationId: org._id,
      locationId,
      locationName: "Nord",
      productId,
      productName: "Cola",
      unitId,
      unitName: "stk",
      quantity: 2,
      quantityKey: "2",
      factorToDefault: 1,
      defaultUnitId: unitId,
      defaultUnitName: "stk",
      defaultQuantity: 2,
      registeredAt: Date.UTC(2026, 7, 11, 12),
      registeredBy: "ada",
      registeredByName: "Ada Lovelace",
      source: "custom",
      status: "active",
      activeIn30Days: true,
      activeIn90Days: true,
    });
  });
  const result = await preview(asUser, locationId, {
    kind: "single",
    query: { dataset: "waste", measure: "registrations", filters: [] },
    bucket: "day",
  });
  expect(result.unit).toBe("count");
  expect(result.series[0]?.total).toBe(1);
  expect(result.series[0]?.points).toHaveLength(1);
});

test("custom metric executor mapper badDelivery er indeksbaseret", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { locationId } = await seedBase(t, org._id);
  await t.run(async (ctx) => {
    await ctx.db.insert("badDeliveries", {
      organizationId: org._id,
      locationId,
      locationName: "Nord",
      registeredAt: Date.UTC(2026, 7, 11, 12),
      registeredBy: "ada",
      registeredByName: "Ada Lovelace",
      deductFromStock: true,
      itemCount: 3,
      status: "active",
      to: [],
      cc: [],
      bcc: [],
      initialNoticeStatus: "notConfigured",
      cancellationNoticeStatus: "notConfigured",
    });
  });
  const result = await preview(asUser, locationId, {
    kind: "single",
    query: { dataset: "badDelivery", measure: "itemCount", filters: [] },
    bucket: "day",
  });
  expect(result.unit).toBe("count");
  expect(result.series[0]?.total).toBe(3);
  expect(result.series[0]?.points).toHaveLength(1);
});

test("custom metric executor mapper transfers bruger transfer- og item-indeks", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { locationId, unitId, productId } = await seedBase(t, org._id);
  await t.run(async (ctx) => {
    const transferId = await ctx.db.insert("transfers", {
      organizationId: org._id,
      fromLocationId: locationId,
      toLocationId: locationId,
      responsibleUserId: "ada",
      responsibleName: "Ada Lovelace",
      transferredAt: Date.UTC(2026, 7, 11, 12),
      createdBy: "ada",
      stockApplied: true,
    });
    await ctx.db.insert("transferItems", {
      organizationId: org._id,
      transferId,
      productId,
      productName: "Cola",
      unitId,
      unitName: "stk",
      quantity: 2,
      factorToDefault: 1,
    });
  });
  const result = await preview(asUser, locationId, {
    kind: "single",
    query: { dataset: "transfers", measure: "itemsMoved", filters: [] },
    dimension: "product",
    bucket: "day",
  });
  expect(result.unit).toBe("quantity");
  expect(result.series[0]?.total).toBe(2);
  expect(result.series[0]?.label).toBe("Cola");
});

test("custom metric executor mapper staffFood er indeksbaseret", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { locationId, categoryId, unitId, productId, employeeId } =
    await seedBase(t, org._id);
  await t.run(async (ctx) => {
    const sessionId = await ctx.db.insert("staffFoodSessions", {
      organizationId: org._id,
      locationId,
      employeeId,
      source: "manual",
      workDate: "2026-08-11",
      durationMinutes: 120,
      createdAt: NOW,
      createdBy: "ada",
    });
    await ctx.db.insert("staffFoodRegistrations", {
      organizationId: org._id,
      checkoutId: "checkout-1",
      sessionId,
      locationId,
      locationName: "Nord",
      employeeId,
      employeeName: "Ada Lovelace",
      sessionSource: "manual",
      workDate: "2026-08-11",
      shiftDurationMinutes: 120,
      tierMinimumShiftMinutes: 60,
      categoryAllowance: 1,
      categoryId,
      categoryName: "Drikke",
      productId,
      productName: "Cola",
      quantity: 2,
      defaultUnitId: unitId,
      defaultUnitName: "stk",
      defaultQuantity: 2,
      registeredAt: Date.UTC(2026, 7, 11, 12),
      registeredBy: "ada",
      registeredByName: "Ada Lovelace",
      status: "active",
    });
  });
  const result = await preview(asUser, locationId, {
    kind: "single",
    query: { dataset: "staffFood", measure: "quantity", filters: [] },
    bucket: "day",
  });
  expect(result.unit).toBe("quantity");
  expect(result.series[0]?.total).toBe(2);
  expect(result.series[0]?.points).toHaveLength(1);
});

test("custom metric executor mapper shifts er indeksbaseret", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { locationId, employeeId } = await seedBase(t, org._id);
  await t.run(async (ctx) => {
    await ctx.db.insert("scheduledShifts", {
      organizationId: org._id,
      employeeId,
      locationId,
      startsAt: Date.UTC(2026, 7, 11, 12),
      endsAt: Date.UTC(2026, 7, 11, 14),
      roleName: "Manager",
      updatedAt: NOW,
    });
  });
  const result = await preview(asUser, locationId, {
    kind: "single",
    query: { dataset: "shifts", measure: "hours", filters: [] },
    bucket: "day",
  });
  expect(result.unit).toBe("hours");
  expect(result.series[0]?.total).toBe(2);
  expect(result.series[0]?.points).toHaveLength(1);
});

test("custom metric executor mapper counts er indeksbaseret", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { locationId } = await seedBase(t, org._id);
  await t.run(async (ctx) => {
    await ctx.db.insert("counts", {
      organizationId: org._id,
      locationId,
      periodKey: "2026-08",
      status: "submitted",
      submittedAt: Date.UTC(2026, 7, 11, 12),
      submittedByName: "Ada Lovelace",
      createdBy: "ada",
    });
  });
  const result = await preview(asUser, locationId, {
    kind: "single",
    query: { dataset: "counts", measure: "submitted", filters: [] },
    bucket: "day",
  });
  expect(result.unit).toBe("count");
  expect(result.series[0]?.total).toBe(1);
  expect(result.series[0]?.points).toHaveLength(1);
});

test("custom metric executor mapper salesDaily bruger dagligt salgsindeks", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { locationId } = await seedBase(t, org._id);
  await t.run(async (ctx) => {
    await ctx.db.insert("salesDaily", {
      organizationId: org._id,
      locationId,
      dayStart: Date.UTC(2026, 7, 11, 12),
      date: "2026-08-11",
      revenue: 12_345,
      orderCount: 2,
      itemCount: 4,
      updatedAt: NOW,
    });
  });
  const result = await preview(asUser, locationId, {
    kind: "single",
    query: { dataset: "salesDaily", measure: "revenue", filters: [] },
    bucket: "day",
  });
  expect(result.unit).toBe("currency");
  expect(result.series[0]?.total).toBe(123.45);
  expect(result.series[0]?.points).toHaveLength(1);
});

test("custom metric executor mapper salesOrders bruger ordreindeks", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { locationId } = await seedBase(t, org._id);
  await t.run(async (ctx) => {
    await ctx.db.insert("salesOrders", {
      organizationId: org._id,
      locationId,
      occurredAt: Date.UTC(2026, 7, 11, 12),
      dayStart: Date.UTC(2026, 7, 11, 12),
      orderNumber: 1,
      revenue: 1_000,
      itemCount: 3,
      paymentType: "card",
      department: "counter",
      source: "test",
      externalId: "order-1",
      updatedAt: NOW,
    });
  });
  const result = await preview(asUser, locationId, {
    kind: "single",
    query: { dataset: "salesOrders", measure: "orders", filters: [] },
    dimension: "paymentType",
    bucket: "day",
  });
  expect(result.unit).toBe("count");
  expect(result.series[0]?.total).toBe(1);
  expect(result.series[0]?.label).toBe("card");
});

test("custom metric executor mapper salesLines bruger linjeindeks", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { locationId } = await seedBase(t, org._id);
  const orderId = await t.run(async (ctx) =>
    await ctx.db.insert("salesOrders", {
      organizationId: org._id,
      locationId,
      occurredAt: Date.UTC(2026, 7, 11, 12),
      dayStart: Date.UTC(2026, 7, 11, 12),
      orderNumber: 1,
      revenue: 1_000,
      itemCount: 3,
      paymentType: "card",
      department: "counter",
      source: "test",
      externalId: "order-1",
      updatedAt: NOW,
    }),
  );
  await t.run(async (ctx) => {
    await ctx.db.insert("salesLines", {
      organizationId: org._id,
      locationId,
      orderId,
      occurredAt: Date.UTC(2026, 7, 11, 12),
      externalProductId: "product-1",
      productName: "Cola",
      quantity: 3,
      unitPrice: 333,
      revenue: 999,
      source: "test",
      externalId: "line-1",
    });
  });
  const result = await preview(asUser, locationId, {
    kind: "single",
    query: { dataset: "salesLines", measure: "quantity", filters: [] },
    dimension: "product",
    bucket: "day",
  });
  expect(result.unit).toBe("quantity");
  expect(result.series[0]?.total).toBe(3);
  expect(result.series[0]?.label).toBe("Cola");
});

test("custom metric executor holder den fælles indeksbaserede rækkegrænse", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { locationId, unitId, productId } = await seedBase(t, org._id);
  await t.run(async (ctx) => {
    for (let index = 0; index < 5_001; index += 1) {
      await ctx.db.insert("wasteRegistrations", {
        organizationId: org._id,
        locationId,
        locationName: "Nord",
        productId,
        productName: "Cola",
        unitId,
        unitName: "stk",
        quantity: 1,
        quantityKey: "1",
        factorToDefault: 1,
        defaultUnitId: unitId,
        defaultUnitName: "stk",
        defaultQuantity: 1,
        registeredAt: Date.UTC(2026, 7, 11, 12),
        registeredBy: "ada",
        registeredByName: "Ada Lovelace",
        source: "custom",
        status: "active",
        activeIn30Days: true,
        activeIn90Days: true,
      });
    }
  });
  // All nine loaders use the same bounded locationRows contract. The nine
  // mapping tests above exercise each dataset's concrete index; one 5,001-row
  // fixture keeps the cap check fast while proving the shared truncation path.
  const result = await preview(asUser, locationId, {
    kind: "single",
    query: { dataset: "waste", measure: "registrations", filters: [] },
    bucket: "day",
  });
  expect(result.truncated).toBe(true);
  expect(result.series[0]?.total).toBe(5_000);
});

test("custom metric ratio dividerer summer, og nulnævner giver et hul", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { locationId } = await seedBase(t, org._id);
  await t.run(async (ctx) => {
    const daily = [
      { day: 10, revenue: 900, orderCount: 1 },
      { day: 11, revenue: 100, orderCount: 9 },
      { day: 12, revenue: 500, orderCount: 0 },
    ];
    for (const row of daily) {
      await ctx.db.insert("salesDaily", {
        organizationId: org._id,
        locationId,
        dayStart: Date.UTC(2026, 7, row.day, 12),
        date: `2026-08-${String(row.day).padStart(2, "0")}`,
        revenue: row.revenue,
        orderCount: row.orderCount,
        itemCount: row.orderCount,
        updatedAt: NOW,
      });
    }
  });
  const result = await preview(asUser, locationId, {
    kind: "ratio",
    numerator: {
      dataset: "salesDaily",
      measure: "revenue",
      filters: [],
    },
    denominator: {
      dataset: "salesDaily",
      measure: "orders",
      filters: [],
    },
    bucket: "day",
  });
  const series = result.series[0];
  expect(result.unit).toBe("currency");
  expect(result.headlineTotal).toBe(1.5);
  expect(series?.total).toBe(1.5);
  expect(series?.points).toHaveLength(2);
  expect(series?.points.map((point) => point.value)).toEqual([9, 0.11]);
  expect(series?.points.every((point) => point.value !== 0)).toBe(true);
});
