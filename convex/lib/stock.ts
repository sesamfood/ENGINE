import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type ReadContext = QueryCtx | MutationCtx;

export function normalizeStock(quantity: number) {
  return Math.round(quantity * 1e6) / 1e6;
}

export async function toDefaultUnit(
  ctx: ReadContext,
  organizationId: string,
  productId: Id<"products">,
  unitId: Id<"units">,
  quantity: number,
) {
  const productUnit = await ctx.db
    .query("productUnits")
    .withIndex("by_organizationId_and_productId_and_unitId", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("productId", productId)
        .eq("unitId", unitId),
    )
    .unique();

  return productUnit
    ? normalizeStock(quantity * productUnit.factorToDefault)
    : null;
}

export async function addStock(
  ctx: MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
  productId: Id<"products">,
  delta: number,
) {
  const current = await ctx.db
    .query("locationStock")
    .withIndex("by_organizationId_and_locationId_and_productId", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("locationId", locationId)
        .eq("productId", productId),
    )
    .unique();
  const updatedAt = Date.now();

  if (current) {
    await ctx.db.patch("locationStock", current._id, {
      quantity: normalizeStock(current.quantity + delta),
      updatedAt,
    });
    return;
  }

  await ctx.db.insert("locationStock", {
    organizationId,
    locationId,
    productId,
    quantity: normalizeStock(delta),
    updatedAt,
  });
}

export async function setStock(
  ctx: MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
  productId: Id<"products">,
  quantity: number,
  countedAt: number,
) {
  const current = await ctx.db
    .query("locationStock")
    .withIndex("by_organizationId_and_locationId_and_productId", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("locationId", locationId)
        .eq("productId", productId),
    )
    .unique();
  const next = {
    quantity: normalizeStock(quantity),
    updatedAt: countedAt,
    lastCountedAt: countedAt,
  };

  if (current) {
    await ctx.db.patch("locationStock", current._id, next);
    return current;
  }

  await ctx.db.insert("locationStock", {
    organizationId,
    locationId,
    productId,
    ...next,
  });
  return null;
}
