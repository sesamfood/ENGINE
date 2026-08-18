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

test("udløbet session afvises", async () => {
  const t = convexTest(schema, modules);
  const { user, org, now } = await setupAuthOrg(t);
  const session = await baCreate(t, "session", {
    expiresAt: now - 1,
    token: `expired-token-${now}`,
    createdAt: now,
    updatedAt: now,
    userId: user._id,
    activeOrganizationId: org._id,
  });
  const asExpiredUser = t.withIdentity({
    subject: user._id,
    issuer: "http://localhost:3000",
    tokenIdentifier: `http://localhost:3000|${user._id}`,
    sessionId: session._id,
  } as never);

  await expect(
    asExpiredUser.query(api.access.getRuntimeContext, {}),
  ).rejects.toThrowError("Ingen aktiv organisation");
});

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
    reason: "Testændring",
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

test("rolleindstillinger beskytter administrationsadgang og afviser ukendte tilladelser", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await setupAuthOrg(t);
  await expect(
    asUser.mutation(api.access.saveRolePermissions, {
      role: "admin",
      reason: "Testændring",
      permissions: [],
    }),
  ).rejects.toThrowError(
    "Mindst én rolle skal kunne administrere både roller og brugere",
  );
  await expect(
    asUser.mutation(api.access.saveRolePermissions, {
      role: "manager",
      reason: "Testændring",
      permissions: ["not.a.permission"],
    }),
  ).rejects.toThrowError("En eller flere tilladelser findes ikke");
});

test("adgangsændringer kræver en begrundelse og opretter ét auditspor", async () => {
  const t = convexTest(schema, modules);
  const { user, org, asUser } = await setupAuthOrg(t);
  const { allowedLocationId } = await seedLocations(t, org._id);

  await expect(
    asUser.mutation(api.access.saveRolePermissions, {
      role: "manager",
      reason: " ",
      permissions: [...defaultRolePermissions.manager],
    }),
  ).rejects.toThrowError("Angiv en begrundelse");

  await asUser.mutation(api.access.saveRolePermissions, {
    role: "manager",
    reason: "Managerrollen skal begrænses",
    permissions: defaultRolePermissions.manager.filter(
      (permission) => permission !== "waste.report",
    ),
  });
  await asUser.mutation(api.access.setMemberLocationAccess, {
    userId: user._id,
    reason: "Brugeren arbejder kun i Nord",
    scope: "selected",
    locationIds: [allowedLocationId],
  });

  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("auditLog")
      .withIndex("by_organizationId_and_at", (q) =>
        q.eq("organizationId", org._id),
      )
      .take(10),
  );
  expect(rows.map(({ action, reason }) => ({ action, reason }))).toEqual([
    {
      action: "roles.permissionsChanged",
      reason: "Managerrollen skal begrænses",
    },
    {
      action: "members.locationAccessChanged",
      reason: "Brugeren arbejder kun i Nord",
    },
  ]);
});

test("valgte lokationer filtrerer valgmuligheder og optællinger", async () => {
  const t = convexTest(schema, modules);
  const { user, org, asUser } = await setupAuthOrg(t);
  const { allowedLocationId, foreignLocationId, productId, unitId } =
    await seedLocations(t, org._id);
  await asUser.mutation(api.access.setMemberLocationAccess, {
    userId: user._id,
    reason: "Testændring",
    scope: "selected",
    locationIds: [allowedLocationId],
  });
  const runtime = await asUser.query(api.access.getRuntimeContext, {});
  expect(runtime.locations).toEqual([{ id: allowedLocationId, name: "Nord" }]);
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
    reason: "Testændring",
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
  await expect(
    asUser.query(api.waste.listRegistrations, {
      paginationOpts: { numItems: 10, cursor: null },
      startAt: now - 100,
      endAt: now + 100,
      locationId: foreignLocationId,
    }),
  ).rejects.toThrowError("Du har ikke adgang til denne lokation");
});

test("valgt lokationsscope begrænser optællingslinjer", async () => {
  const t = convexTest(schema, modules);
  const { user, org, now, asUser } = await setupAuthOrg(t);
  const { allowedLocationId, foreignLocationId, productId, unitId } =
    await seedLocations(t, org._id);
  await asUser.mutation(api.access.setMemberLocationAccess, {
    userId: user._id,
    reason: "Testændring",
    scope: "selected",
    locationIds: [allowedLocationId],
  });
  const { allowedCountId, foreignCountId } = await t.run(async (ctx) => {
    const allowedCountId = await ctx.db.insert("counts", {
      organizationId: org._id,
      locationId: allowedLocationId,
      periodKey: "2026-08",
      status: "submitted",
      submittedAt: now,
      submittedByName: "Ada Lovelace",
      createdBy: user._id,
    });
    const foreignCountId = await ctx.db.insert("counts", {
      organizationId: org._id,
      locationId: foreignLocationId,
      periodKey: "2026-08",
      status: "submitted",
      submittedAt: now,
      submittedByName: "Ada Lovelace",
      createdBy: user._id,
    });
    await ctx.db.insert("countItems", {
      organizationId: org._id,
      countId: allowedCountId,
      productId,
      unitId,
      quantity: 2,
    });
    await ctx.db.insert("countItems", {
      organizationId: org._id,
      countId: foreignCountId,
      productId,
      unitId,
      quantity: 9,
    });
    return { allowedCountId, foreignCountId };
  });

  await expect(
    asUser.query(api.count.getCountQuantities, {
      locationId: allowedLocationId,
      countId: allowedCountId,
    }),
  ).resolves.toEqual([{ productId, unitId, quantity: 2 }]);
  await expect(
    asUser.query(api.count.getCountQuantities, {
      locationId: foreignLocationId,
      countId: foreignCountId,
    }),
  ).rejects.toThrowError("Du har ikke adgang til denne lokation");
});

test("valgt lokationsscope skjuler flytninger fra andre lokationer", async () => {
  const t = convexTest(schema, modules);
  const { user, org, now, asUser } = await setupAuthOrg(t);
  const { allowedLocationId, foreignLocationId, productId, unitId } =
    await seedLocations(t, org._id);
  await asUser.mutation(api.access.setMemberLocationAccess, {
    userId: user._id,
    reason: "Testændring",
    scope: "selected",
    locationIds: [allowedLocationId],
  });
  const { allowedTransferId, foreignTransferId } = await t.run(async (ctx) => {
    const otherForeignLocationId = await ctx.db.insert("locations", {
      organizationId: org._id,
      name: "Vest",
      normalizedName: "vest",
    });
    const allowedTransferId = await ctx.db.insert("transfers", {
      organizationId: org._id,
      fromLocationId: allowedLocationId,
      toLocationId: foreignLocationId,
      responsibleUserId: user._id,
      responsibleName: "Ada Lovelace",
      transferredAt: now - 10,
      createdBy: user._id,
      stockApplied: true,
    });
    const foreignTransferId = await ctx.db.insert("transfers", {
      organizationId: org._id,
      fromLocationId: foreignLocationId,
      toLocationId: otherForeignLocationId,
      responsibleUserId: user._id,
      responsibleName: "Ada Lovelace",
      transferredAt: now - 5,
      createdBy: user._id,
      stockApplied: true,
    });
    await ctx.db.insert("transferItems", {
      organizationId: org._id,
      transferId: allowedTransferId,
      productId,
      productName: "Cola",
      unitId,
      unitName: "stk",
      quantity: 1,
      factorToDefault: 1,
    });
    await ctx.db.insert("transferItems", {
      organizationId: org._id,
      transferId: foreignTransferId,
      productId,
      productName: "Cola",
      unitId,
      unitName: "stk",
      quantity: 3,
      factorToDefault: 1,
    });
    return { allowedTransferId, foreignTransferId };
  });

  const result = await asUser.query(api.transfers.listTransfers, {
    paginationOpts: { numItems: 10, cursor: null },
    startAt: now - 100,
    endAt: now + 100,
  });
  expect(result.page.map((transfer) => transfer.id)).toEqual([
    allowedTransferId,
  ]);
  expect(result.page.map((transfer) => transfer.id)).not.toContain(
    foreignTransferId,
  );
});

test("kioskkonto beholder sin faste lokation og kioskadgang", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { allowedLocationId, foreignLocationId } = await seedLocations(
    t,
    org._id,
  );
  await asUser.mutation(api.access.saveRolePermissions, {
    role: "member",
    reason: "Testændring",
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
  const runtime = await kiosk.asUser.query(api.access.getRuntimeContext, {});
  expect(runtime.locations).toEqual([
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

test("navngivne roller registreres og håndhæves af Convex", async () => {
  const t = convexTest(schema, modules);
  const { org, now, asUser } = await setupAuthOrg(t);
  const role = await asUser.mutation(api.access.createRole, {
    name: "Franchisetager",
  });
  expect(role).toBe("franchisetager");
  const registered = await t.query(components.betterAuth.adapter.findMany, {
    model: "organizationRole",
    where: [
      { field: "organizationId", value: org._id },
      { field: "role", value: role },
    ],
    paginationOpts: { numItems: 10, cursor: null },
  } as never);
  expect(registered.page).toHaveLength(1);

  await expect(
    asUser.mutation(api.access.saveRolePermissions, {
      role: "admin",
      reason: "Testændring",
      permissions: ["count.register"],
    }),
  ).rejects.toThrowError(
    "Mindst én rolle skal kunne administrere både roller og brugere",
  );
  await asUser.mutation(api.access.saveRolePermissions, {
    role,
    reason: "Testændring",
    permissions: ["count.register", "roles.manage", "members.manage"],
  });
  await expect(
    asUser.mutation(api.access.saveRolePermissions, {
      role: "admin",
      reason: "Testændring",
      permissions: ["count.register"],
    }),
  ).rejects.toThrowError(
    "Mindst én rolle skal kunne administrere både roller og brugere",
  );

  const customUser = await baCreate(t, "user", {
    name: "Grace Hopper",
    email: "grace@example.com",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await baCreate(t, "member", {
    organizationId: org._id,
    userId: customUser._id,
    role,
    createdAt: now,
  });
  const customSession = await baCreate(t, "session", {
    expiresAt: now + 60 * 60 * 1000,
    token: `custom-${now}`,
    createdAt: now,
    updatedAt: now,
    userId: customUser._id,
    activeOrganizationId: org._id,
  });
  const asCustomUser = t.withIdentity({
    subject: customUser._id,
    issuer: "http://localhost:3000",
    tokenIdentifier: `http://localhost:3000|${customUser._id}`,
    sessionId: customSession._id,
  } as never);
  const context = await asCustomUser.query(api.access.getRuntimeContext, {});
  expect(context.role).toBe(role);
  expect(context.permissions).toContain("count.register");
  expect(context.locations).toEqual([]);
  await expect(
    asCustomUser.mutation(api.access.deleteRole, { role }),
  ).rejects.toThrowError("Rollen bruges af et medlem og kan ikke slettes");
});

test("operatørscope begrænser lokationer, spild, optællinger og flytninger", async () => {
  const t = convexTest(schema, modules);
  const { user, org, now, asUser } = await setupAuthOrg(t);
  const { allowedLocationId, foreignLocationId, productId, unitId } =
    await seedLocations(t, org._id);
  const { operatorId, emptyOperatorId, allowedCountId, foreignCountId } =
    await t.run(async (ctx) => {
      const operatorId = await ctx.db.insert("operators", {
        organizationId: org._id,
        name: "Norddrift",
        normalizedName: "norddrift",
        status: "active",
      });
      const emptyOperatorId = await ctx.db.insert("operators", {
        organizationId: org._id,
        name: "Uden restauranter",
        normalizedName: "uden restauranter",
        status: "active",
      });
      await ctx.db.patch("locations", allowedLocationId, { operatorId });
      const allowedCountId = await ctx.db.insert("counts", {
        organizationId: org._id,
        locationId: allowedLocationId,
        periodKey: "2026-08",
        status: "submitted",
        submittedAt: now,
        submittedByName: "Ada Lovelace",
        createdBy: user._id,
      });
      const foreignCountId = await ctx.db.insert("counts", {
        organizationId: org._id,
        locationId: foreignLocationId,
        periodKey: "2026-08",
        status: "submitted",
        submittedAt: now,
        submittedByName: "Ada Lovelace",
        createdBy: user._id,
      });
      await ctx.db.insert(
        "wasteRegistrations",
        wasteRow(org._id, allowedLocationId, productId, unitId, now - 10),
      );
      await ctx.db.insert(
        "wasteRegistrations",
        wasteRow(org._id, foreignLocationId, productId, unitId, now - 5),
      );
      await ctx.db.insert("transfers", {
        organizationId: org._id,
        fromLocationId: allowedLocationId,
        toLocationId: foreignLocationId,
        responsibleUserId: user._id,
        responsibleName: "Ada Lovelace",
        transferredAt: now - 10,
        createdBy: user._id,
        stockApplied: true,
      });
      await ctx.db.insert("transfers", {
        organizationId: org._id,
        fromLocationId: foreignLocationId,
        toLocationId: foreignLocationId,
        responsibleUserId: user._id,
        responsibleName: "Ada Lovelace",
        transferredAt: now - 5,
        createdBy: user._id,
        stockApplied: true,
      });
      for (const [index, locationId] of [
        allowedLocationId,
        foreignLocationId,
      ].entries()) {
        await ctx.db.insert("onlinePosLocationIntegrations", {
          organizationId: org._id,
          locationId,
          token: `token-${index}`,
          companyId: index + 1,
          connectedAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("workfeedLocationMappings", {
          organizationId: org._id,
          locationId,
          departmentId: `department-${index}`,
          departmentName: `Afdeling ${index}`,
          updatedAt: now,
        });
        await ctx.db.insert("salesOrders", {
          organizationId: org._id,
          locationId,
          occurredAt: now - index,
          dayStart: now - 1_000,
          orderNumber: index + 1,
          revenue: 1000,
          itemCount: 1,
          paymentType: "Kort",
          department: "Restaurant",
          source: "test",
          externalId: `order-${index}`,
          updatedAt: now,
        });
      }
      return { operatorId, emptyOperatorId, allowedCountId, foreignCountId };
    });

  await asUser.mutation(api.access.setMemberLocationAccess, {
    userId: user._id,
    reason: "Testændring",
    scope: "operator",
    locationIds: [],
    operatorId,
  });
  const runtime = await asUser.query(api.access.getRuntimeContext, {});
  expect(runtime.locations).toEqual([{ id: allowedLocationId, name: "Nord" }]);
  const waste = await asUser.query(api.waste.listRegistrations, {
    paginationOpts: { numItems: 10, cursor: null },
    startAt: now - 100,
    endAt: now + 100,
  });
  expect(waste.page.map((row) => row.locationId)).toEqual([allowedLocationId]);
  await expect(
    asUser.query(api.count.getCountQuantities, {
      locationId: allowedLocationId,
      countId: allowedCountId,
    }),
  ).resolves.toEqual([]);
  await expect(
    asUser.query(api.count.getCountQuantities, {
      locationId: foreignLocationId,
      countId: foreignCountId,
    }),
  ).rejects.toThrowError("Du har ikke adgang til denne lokation");
  const transfers = await asUser.query(api.transfers.listTransfers, {
    paginationOpts: { numItems: 10, cursor: null },
    startAt: now - 100,
    endAt: now + 100,
  });
  expect(transfers.page).toHaveLength(1);
  expect(transfers.page[0]?.fromLocationName).toBe("Nord");
  const onlinePos = await asUser.query(
    api.onlinePos.listLocationConnections,
    {},
  );
  expect(onlinePos.locations.map((location) => location.id)).toEqual([
    allowedLocationId,
  ]);
  const workfeed = await asUser.query(api.workfeed.listLocationMappings, {});
  expect(workfeed.locations.map((location) => location.id)).toEqual([
    allowedLocationId,
  ]);
  const orders = await asUser.query(api.sales.listOrders, {
    locationId: null,
    from: now - 100,
    to: now + 100,
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(orders.page.map((order) => order.locationId)).toEqual([
    allowedLocationId,
  ]);

  await asUser.mutation(api.access.setMemberLocationAccess, {
    userId: user._id,
    reason: "Testændring",
    scope: "operator",
    locationIds: [],
    operatorId: emptyOperatorId,
  });
  const emptyRuntime = await asUser.query(api.access.getRuntimeContext, {});
  expect(emptyRuntime.locations).toEqual([]);
});

test("dashboardets datavisning håndhæves i API-svaret", async () => {
  const t = convexTest(schema, modules);
  const { user, org, now, asUser } = await setupAuthOrg(t);
  const { allowedLocationId, foreignLocationId, productId, unitId } =
    await seedLocations(t, org._id);
  await t.run(async (ctx) => {
    await ctx.db.patch("locations", allowedLocationId, { currency: "DKK" });
    await ctx.db.patch("locations", foreignLocationId, { currency: "EUR" });
    await ctx.db.insert(
      "wasteRegistrations",
      wasteRow(org._id, allowedLocationId, productId, unitId, now - 10),
    );
    await ctx.db.insert(
      "wasteRegistrations",
      wasteRow(org._id, foreignLocationId, productId, unitId, now - 5),
    );
    for (const locationId of [allowedLocationId, foreignLocationId]) {
      await ctx.db.insert("salesDaily", {
        organizationId: org._id,
        locationId,
        dayStart: now - 1_000,
        date: "2026-08-10",
        revenue: 10_000,
        orderCount: 10,
        itemCount: 10,
        updatedAt: now,
      });
    }
  });
  await asUser.mutation(api.access.ensureRoles, {});
  await asUser.mutation(api.access.saveRolePermissions, {
    role: "admin",
    reason: "Testændring",
    permissions: [...defaultRolePermissions.admin],
    granularity: "aggregate",
  });
  const aggregate = await asUser.query(api.dashboard.getMetrics, {
    widgets: [
      {
        key: "waste",
        metric: { kind: "builtin", id: "wasteRegistrations" },
        visualization: "kpi",
      },
    ],
    scope: {
      mode: "compare",
      locationIds: [allowedLocationId, foreignLocationId],
    },
    range: { preset: "7days" },
    now,
  });
  expect(aggregate[0]?.result.series).toHaveLength(1);
  expect(aggregate[0]?.result.breakdown).toBeUndefined();
  const mixedCurrency = await asUser.query(api.dashboard.getMetrics, {
    widgets: [
      {
        key: "sales",
        metric: { kind: "builtin", id: "salesRevenue" },
        visualization: "kpi",
      },
    ],
    scope: {
      mode: "aggregate",
      locationIds: [allowedLocationId, foreignLocationId],
    },
    range: { preset: "7days" },
    now,
  });
  expect(mixedCurrency[0]?.result.mixedCurrency).toBe(true);
  expect(mixedCurrency[0]?.result.currency).toBeUndefined();
  const singleCurrency = await asUser.query(api.dashboard.getMetrics, {
    widgets: [
      {
        key: "sales",
        metric: { kind: "builtin", id: "salesRevenue" },
        visualization: "kpi",
      },
    ],
    scope: { mode: "aggregate", locationIds: [allowedLocationId] },
    range: { preset: "7days" },
    now,
  });
  expect(singleCurrency[0]?.result.currency).toBe("DKK");
  expect(singleCurrency[0]?.result.mixedCurrency).toBeUndefined();

  await asUser.mutation(api.access.saveRolePermissions, {
    role: "admin",
    reason: "Testændring",
    permissions: defaultRolePermissions.admin.filter(
      (permission) =>
        permission !== "dashboard.viewSales" &&
        permission !== "sales.viewDetail",
    ),
    granularity: "detail",
  });
  const aggregateSalesOnly = await asUser.query(api.dashboard.getMetrics, {
    widgets: [
      {
        key: "waste",
        metric: { kind: "builtin", id: "wasteRegistrations" },
        visualization: "kpi",
      },
      {
        key: "sales",
        metric: { kind: "builtin", id: "salesRevenue" },
        visualization: "kpi",
      },
    ],
    scope: {
      mode: "compare",
      locationIds: [allowedLocationId, foreignLocationId],
    },
    range: { preset: "7days" },
    now,
  });
  expect(aggregateSalesOnly[0]?.result.series).toHaveLength(2);
  expect(aggregateSalesOnly[1]?.result.series).toHaveLength(1);

  const operatorId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("operators", {
      organizationId: org._id,
      name: "Norddrift",
      normalizedName: "norddrift",
      status: "active",
    });
    await ctx.db.patch("locations", allowedLocationId, { operatorId: id });
    return id;
  });
  await asUser.mutation(api.access.setMemberLocationAccess, {
    userId: user._id,
    reason: "Testændring",
    scope: "operator",
    locationIds: [],
    operatorId,
  });
  await asUser.mutation(api.access.saveRolePermissions, {
    role: "admin",
    reason: "Testændring",
    permissions: [...defaultRolePermissions.admin],
    granularity: "anonymous",
  });
  const anonymous = await asUser.query(api.dashboard.getMetrics, {
    widgets: [
      {
        key: "comparison",
        metric: { kind: "builtin", id: "locationComparison" },
        visualization: "table",
      },
    ],
    scope: {
      mode: "compare",
      locationIds: [allowedLocationId],
      level: "location",
      parentId: allowedLocationId,
    },
    range: { preset: "7days" },
    now,
  });
  const payload = JSON.stringify(anonymous);
  expect(payload).toContain("Nord");
  expect(payload).not.toContain("Syd");
});

test("dashboard.view uden dashboard.manage er skrivebeskyttet", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { allowedLocationId } = await seedLocations(t, org._id);
  const manager = await createUser(t, org._id, "manager", 11);
  const dashboardId = await asUser.mutation(api.dashboard.initialize, {});
  const metricId = await asUser.mutation(api.customMetrics.create, {
    name: "Testmåling",
    spec: {
      kind: "single",
      query: { dataset: "waste", measure: "registrations", filters: [] },
      bucket: "day",
    },
  });

  const dashboards = await manager.asUser.query(api.dashboard.list, {});
  expect(dashboards.dashboards.map((dashboard) => dashboard.id)).toContain(
    dashboardId,
  );
  await expect(
    manager.asUser.query(api.dashboard.get, { dashboardId }),
  ).resolves.toEqual(expect.objectContaining({ id: dashboardId }));
  await expect(
    manager.asUser.query(api.dashboard.getMetric, {
      metricId: "wasteRegistrations",
      visualization: "kpi",
      scope: { mode: "aggregate", locationIds: [allowedLocationId] },
      range: { preset: "7days" },
      now: Date.now(),
    }),
  ).resolves.toEqual(expect.objectContaining({ unit: "count" }));
  await expect(manager.asUser.query(api.customMetrics.list, {})).resolves.toEqual(
    [expect.objectContaining({ id: metricId })],
  );

  await expect(
    manager.asUser.mutation(api.dashboard.initialize, {}),
  ).rejects.toThrowError("Du har ikke adgang");
  await expect(
    manager.asUser.mutation(api.dashboard.create, { name: "Nyt dashboard" }),
  ).rejects.toThrowError("Du har ikke adgang");
  await expect(
    manager.asUser.mutation(api.dashboard.duplicate, {
      dashboardId,
      name: "Kopi",
    }),
  ).rejects.toThrowError("Du har ikke adgang");
  await expect(
    manager.asUser.mutation(api.dashboard.saveSettings, {
      dashboardId,
      name: "Dashboard",
      roleIds: [],
      defaultForRoleIds: [],
      defaultForLocationIds: [],
      isOrganizationDefault: true,
      expectedUpdatedAt: 0,
    }),
  ).rejects.toThrowError("Du har ikke adgang");
  await expect(
    manager.asUser.mutation(api.dashboard.reorder, { dashboardIds: [dashboardId] }),
  ).rejects.toThrowError("Du har ikke adgang");
  await expect(
    manager.asUser.mutation(api.dashboard.remove, { dashboardId }),
  ).rejects.toThrowError("Du har ikke adgang");
  await expect(
    manager.asUser.mutation(api.dashboard.saveConfigRevisioned, {
      dashboardId,
      widgets: [],
      expectedUpdatedAt: 0,
    }),
  ).rejects.toThrowError("Du har ikke adgang");
  await expect(
    manager.asUser.mutation(api.dashboard.saveDefaults, {
      dashboardId,
      defaultScope: { mode: "aggregate", locationIds: null },
      defaultRange: { preset: "7days" },
      expectedUpdatedAt: 0,
    }),
  ).rejects.toThrowError("Du har ikke adgang");
  await expect(
    manager.asUser.mutation(api.customMetrics.create, {
      name: "Måling fra manager",
      spec: {
        kind: "single",
        query: { dataset: "waste", measure: "registrations", filters: [] },
        bucket: "day",
      },
    }),
  ).rejects.toThrowError("Du har ikke adgang");
  await expect(
    manager.asUser.mutation(api.customMetrics.update, {
      metricId,
      name: "Opdateret måling",
      spec: {
        kind: "single",
        query: { dataset: "waste", measure: "registrations", filters: [] },
        bucket: "day",
      },
      expectedUpdatedAt: 0,
    }),
  ).rejects.toThrowError("Du har ikke adgang");
  await expect(
    manager.asUser.mutation(api.customMetrics.remove, { metricId }),
  ).rejects.toThrowError("Du har ikke adgang");
});

test("dashboardets rolleallowlist udvider ikke medlemmets lokationsadgang", async () => {
  const t = convexTest(schema, modules);
  const { org, now, asUser } = await setupAuthOrg(t);
  const { allowedLocationId, foreignLocationId, productId, unitId } =
    await seedLocations(t, org._id);
  await asUser.mutation(api.access.ensureRoles, {});
  const dashboardId = await asUser.mutation(api.dashboard.initialize, {});
  const dashboard = await asUser.query(api.dashboard.get, { dashboardId });
  const settingsUpdatedAt = await asUser.mutation(api.dashboard.saveSettings, {
    dashboardId,
    name: dashboard.name,
    roleIds: ["manager"],
    defaultForRoleIds: [],
    defaultForLocationIds: [],
    isOrganizationDefault: true,
    expectedUpdatedAt: dashboard.updatedAt,
  });
  await asUser.mutation(api.dashboard.saveDefaults, {
    dashboardId,
    defaultScope: {
      mode: "compare",
      locationIds: [allowedLocationId, foreignLocationId],
    },
    defaultRange: { preset: "7days" },
    expectedUpdatedAt: settingsUpdatedAt,
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

  const manager = await createUser(t, org._id, "manager", 12);
  await asUser.mutation(api.access.setMemberLocationAccess, {
    userId: manager.user._id,
    reason: "Manageren arbejder kun i Nord",
    scope: "selected",
    locationIds: [allowedLocationId],
  });
  const listed = await manager.asUser.query(api.dashboard.list, {});
  expect(listed.dashboards.map((item) => item.id)).toContain(dashboardId);
  const scopedDashboard = await manager.asUser.query(api.dashboard.get, {
    dashboardId,
  });
  expect(scopedDashboard.defaultScope.locationIds).toEqual([allowedLocationId]);

  const metrics = await manager.asUser.query(api.dashboard.getMetrics, {
    widgets: [
      {
        key: "waste",
        metric: { kind: "builtin", id: "wasteRegistrations" },
        visualization: "kpi",
      },
    ],
    scope: { mode: "aggregate", locationIds: null },
    range: { preset: "7days" },
    now,
  });
  expect(metrics[0]?.result.series).toHaveLength(1);
  expect(metrics[0]?.result.series[0]?.total).toBe(1);
});

test("anonymitetsgranularitet afviser medarbejderdimensioner", async () => {
  const t = convexTest(schema, modules);
  const { asUser } = await setupAuthOrg(t);
  await asUser.mutation(api.access.ensureRoles, {});
  await asUser.mutation(api.access.saveRolePermissions, {
    role: "admin",
    reason: "Anonymitetskontrol",
    permissions: [...defaultRolePermissions.admin],
    granularity: "anonymous",
  });
  const employeeSpec = {
    kind: "single" as const,
    query: { dataset: "staffFood" as const, measure: "registrations", filters: [] },
    dimension: "employee",
    bucket: "day" as const,
  };
  await expect(
    asUser.mutation(api.customMetrics.create, {
      name: "Medarbejdermåling",
      spec: employeeSpec,
    }),
  ).rejects.toThrowError("Dimensionen er ikke tilgængelig for denne rolle");
});
