/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, components } from "./_generated/api";
import schema from "./schema";
import betterAuthSchema from "./betterAuth/schema";
import type { Id } from "./_generated/dataModel";
import { defaultRolePermissions } from "../lib/auth-permissions";

const modules = import.meta.glob("./**/*.ts");
const betterAuthModules = import.meta.glob("./betterAuth/**/*.ts");

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
    email: "ada@example.com",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  const org = await baCreate(t, "organization", {
    name: "Chain",
    slug: `chain-${now}`,
    createdAt: now,
  });
  const member = await baCreate(t, "member", {
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
  return { now, user, org, member, session, asUser };
}

async function createUser(
  t: ReturnType<typeof convexTest>,
  organizationId: string,
  role: "admin" | "manager" | "member",
  index: number,
  options?: { kioskLocationId?: string; isKioskAccount?: boolean },
) {
  const now = Date.now();
  const user = await baCreate(t, "user", {
    name: `Bruger ${index}`,
    email: `user-${index}-${now}@example.com`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  const member = await baCreate(t, "member", {
    organizationId,
    userId: user._id,
    role,
    kioskLocationId: options?.kioskLocationId,
    createdAt: now,
  });
  const session = await baCreate(t, "session", {
    expiresAt: now + 60 * 60 * 1000,
    token: `test-token-${index}-${now}`,
    createdAt: now,
    updatedAt: now,
    userId: user._id,
    activeOrganizationId: organizationId,
    isKioskAccount: options?.isKioskAccount ?? false,
    kioskModeEnabled: options?.isKioskAccount ?? false,
  });
  const asUser = t.withIdentity({
    subject: user._id,
    issuer: "http://localhost:3000",
    tokenIdentifier: `http://localhost:3000|${user._id}`,
    sessionId: session._id,
  } as never);
  return { user, member, session, asUser };
}

async function seedLocations(
  t: ReturnType<typeof convexTest>,
  organizationId: string,
) {
  return await t.run(async (ctx) => {
    const allowedLocationId = await ctx.db.insert("locations", {
      organizationId,
      name: "Nord",
      normalizedName: "nord",
    });
    const foreignLocationId = await ctx.db.insert("locations", {
      organizationId,
      name: "Syd",
      normalizedName: "syd",
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
      updatedAt: Date.now(),
    });
    await ctx.db.insert("productUnits", {
      organizationId,
      productId,
      unitId,
      factorToDefault: 1,
    });
    return { allowedLocationId, foreignLocationId, productId, unitId };
  });
}

function wasteRow(
  organizationId: string,
  locationId: Id<"locations">,
  productId: Id<"products">,
  unitId: Id<"units">,
  registeredAt: number,
) {
  return {
    organizationId,
    locationId,
    locationName: "Lokation",
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
    registeredAt,
    registeredBy: "test",
    registeredByName: "Test",
    source: "custom" as const,
    status: "active" as const,
    activeIn30Days: true,
    activeIn90Days: true,
  };
}

test("en manager uden waste.report kan ikke se spildregistreringer", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const manager = await createUser(t, org._id, "manager", 1);
  await asUser.mutation(api.access.saveRolePermissions, {
    role: "manager",
    permissions: defaultRolePermissions.manager.filter(
      (permission) => permission !== "waste.report",
    ),
  });
  await expect(
    manager.asUser.query(api.waste.listRegistrations, {
      paginationOpts: { numItems: 10, cursor: null },
      startAt: 0,
      endAt: Date.now(),
    }),
  ).rejects.toThrowError("Du har ikke adgang");
});

test("rolleindstillinger afviser administratorrollen og ukendte tilladelser", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await setupAuthOrg(t);
  await expect(
    asUser.mutation(api.access.saveRolePermissions, {
      role: "admin",
      permissions: [],
    }),
  ).rejects.toThrowError("Administratorrollen kan ikke ændres");
  await expect(
    asUser.mutation(api.access.saveRolePermissions, {
      role: "manager",
      permissions: ["not.a.permission"],
    }),
  ).rejects.toThrowError("En eller flere tilladelser findes ikke");
});

test("valgte lokationer filtrerer valgmuligheder og optællinger", async () => {
  const t = convexTest(schema, modules);
  const { user, org, asUser } = await setupAuthOrg(t);
  const { allowedLocationId, foreignLocationId, productId, unitId } =
    await seedLocations(t, org._id);
  await asUser.mutation(api.access.setMemberLocationAccess, {
    userId: user._id,
    scope: "selected",
    locationIds: [allowedLocationId],
  });
  await expect(asUser.query(api.locations.listLocationOptions, {})).resolves.toEqual([
    { id: allowedLocationId, name: "Nord" },
  ]);
  await expect(
    asUser.mutation(api.count.setCountQuantity, {
      locationId: foreignLocationId,
      productId,
      unitId,
      quantity: 1,
    }),
  ).rejects.toThrowError("Du har ikke adgang til denne lokation");
});

test("spildrapport uden lokation viser kun brugerens valgte lokationer", async () => {
  const t = convexTest(schema, modules);
  const { user, org, now, asUser } = await setupAuthOrg(t);
  const { allowedLocationId, foreignLocationId, productId, unitId } =
    await seedLocations(t, org._id);
  await asUser.mutation(api.access.setMemberLocationAccess, {
    userId: user._id,
    scope: "selected",
    locationIds: [allowedLocationId],
  });
  await t.run(async (ctx) => {
    await ctx.db.insert(
      "wasteRegistrations",
      wasteRow(org._id, allowedLocationId, productId, unitId, now - 10),
    );
    await ctx.db.insert(
      "wasteRegistrations",
      wasteRow(org._id, foreignLocationId, productId, unitId, now - 5),
    );
  });
  const result = await asUser.query(api.waste.listRegistrations, {
    paginationOpts: { numItems: 10, cursor: null },
    startAt: now - 100,
    endAt: now + 100,
  });
  expect(result.page).toHaveLength(1);
  expect(result.page[0]?.locationId).toBe(allowedLocationId);
});

test("kioskkonto beholder sin faste lokation og kioskadgang", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { allowedLocationId, foreignLocationId } = await seedLocations(t, org._id);
  await asUser.mutation(api.access.saveRolePermissions, {
    role: "member",
    permissions: [],
  });
  await t.run(async (ctx) => {
    await ctx.db.insert("kioskSettings", {
      organizationId: org._id,
      enabledPages: ["count.register"],
      homePage: "count.register",
      inactivitySeconds: null,
      updatedAt: Date.now(),
    });
  });
  const kiosk = await createUser(t, org._id, "member", 2, {
    kioskLocationId: allowedLocationId,
    isKioskAccount: true,
  });
  await expect(kiosk.asUser.query(api.locations.listLocationOptions, {})).resolves.toEqual([
    { id: allowedLocationId, name: "Nord" },
  ]);
  await expect(
    kiosk.asUser.query(api.count.getCountState, {
      locationId: allowedLocationId,
      now: Date.now(),
    }),
  ).resolves.toEqual(expect.objectContaining({ count: null }));
  await expect(
    kiosk.asUser.query(api.count.getCountState, {
      locationId: foreignLocationId,
      now: Date.now(),
    }),
  ).rejects.toThrowError("Kioskkontoen har ikke adgang til denne lokation");
});
