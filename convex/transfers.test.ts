/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, components } from "./_generated/api";
import schema from "./schema";
import betterAuthSchema from "./betterAuth/schema";

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
  const outsider = await baCreate(t, "user", {
    name: "Outsider",
    email: "out@example.com",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  const org = await baCreate(t, "organization", {
    name: "Chain",
    slug: "chain",
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

  return { now, user, outsider, org, asUser };
}

async function seedCatalog(
  t: ReturnType<typeof convexTest>,
  organizationId: string,
  createdBy: string,
) {
  return await t.run(async (ctx) => {
    const fromLocationId = await ctx.db.insert("locations", {
      organizationId,
      name: "Nord",
      normalizedName: "nord",
    });
    const toLocationId = await ctx.db.insert("locations", {
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
    const caseUnitId = await ctx.db.insert("units", {
      organizationId,
      name: "kasse",
      normalizedName: "kasse",
    });
    const productId = await ctx.db.insert("products", {
      organizationId,
      name: "Cola",
      normalizedName: "cola",
      categoryId,
      defaultUnitId: unitId,
      status: "active",
      createdBy,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("productUnits", {
      organizationId,
      productId,
      unitId,
      factorToDefault: 1,
    });
    await ctx.db.insert("productUnits", {
      organizationId,
      productId,
      unitId: caseUnitId,
      factorToDefault: 24,
    });
    return { fromLocationId, toLocationId, productId, unitId, caseUnitId };
  });
}

test("createTransfer rejects identical from and to locations", async () => {
  const t = convexTest(schema, modules);
  const { user, org, asUser } = await setupAuthOrg(t);
  const { fromLocationId, productId, unitId } = await seedCatalog(
    t,
    org._id,
    user._id,
  );

  await expect(
    asUser.mutation(api.transfers.createTransfer, {
      fromLocationId,
      toLocationId: fromLocationId,
      responsibleUserId: user._id,
      transferredAt: Date.now(),
      items: [{ productId, unitId, quantity: 2 }],
    }),
  ).rejects.toThrowError("Fra- og til-butik skal være forskellige");
});

test("createTransfer rejects a responsible user who is not a member", async () => {
  const t = convexTest(schema, modules);
  const { user, outsider, org, asUser } = await setupAuthOrg(t);
  const { fromLocationId, toLocationId, productId, unitId } = await seedCatalog(
    t,
    org._id,
    user._id,
  );

  await expect(
    asUser.mutation(api.transfers.createTransfer, {
      fromLocationId,
      toLocationId,
      responsibleUserId: outsider._id,
      transferredAt: Date.now(),
      items: [{ productId, unitId, quantity: 1 }],
    }),
  ).rejects.toThrowError("Den ansvarlige er ikke medlem af organisationen");
});

test("createTransfer writes one item per line and appears in listTransfers", async () => {
  const t = convexTest(schema, modules);
  const { now, user, org, asUser } = await setupAuthOrg(t);
  const { fromLocationId, toLocationId, productId, unitId, caseUnitId } =
    await seedCatalog(t, org._id, user._id);
  const transferredAt = now;

  const transferId = await asUser.mutation(api.transfers.createTransfer, {
    fromLocationId,
    toLocationId,
    responsibleUserId: user._id,
    transferredAt,
    comment: "Morgenlevering",
    items: [
      { productId, unitId, quantity: 3 },
      { productId, unitId: caseUnitId, quantity: 2 },
    ],
  });

  const items = await t.run(async (ctx) =>
    ctx.db
      .query("transferItems")
      .withIndex("by_organizationId_and_transferId", (q) =>
        q.eq("organizationId", org._id).eq("transferId", transferId),
      )
      .take(200),
  );
  expect(items).toHaveLength(2);

  const listed = await asUser.query(api.transfers.listTransfers, {
    paginationOpts: { numItems: 10, cursor: null },
    startAt: transferredAt - 1_000,
    endAt: transferredAt + 1_000,
  });
  expect(listed.page).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: transferId,
        fromLocationName: "Nord",
        toLocationName: "Syd",
        responsibleName: "Ada Lovelace",
        comment: "Morgenlevering",
        itemCount: 2,
        totalQuantity: 5,
      }),
    ]),
  );
});
