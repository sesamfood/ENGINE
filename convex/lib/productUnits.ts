import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const MAX_PRODUCT_UNITS = 200;

export async function listProductUnitOptions(
  ctx: QueryCtx,
  product: Doc<"products">,
) {
  const { organizationId } = product;
  const productUnits = await ctx.db
    .query("productUnits")
    .withIndex("by_organizationId_and_productId", (q) =>
      q.eq("organizationId", organizationId).eq("productId", product._id),
    )
    .take(MAX_PRODUCT_UNITS + 1);
  if (productUnits.length > MAX_PRODUCT_UNITS) {
    throw new ConvexError("Produktet har for mange enheder");
  }
  const units = await Promise.all(
    productUnits.map((productUnit) => ctx.db.get("units", productUnit.unitId)),
  );
  return units.flatMap((unit) =>
    unit?.organizationId === organizationId
      ? [{ id: unit._id, name: unit.name }]
      : [],
  );
}

export async function activeProductUnit(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  product: Doc<"products"> | null,
  unitId: Id<"units">,
) {
  if (
    !product ||
    product.organizationId !== organizationId ||
    product.status !== "active"
  )
    return null;
  const [productUnit, unit] = await Promise.all([
    ctx.db
      .query("productUnits")
      .withIndex("by_organizationId_and_productId_and_unitId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("productId", product._id)
          .eq("unitId", unitId),
      )
      .unique(),
    ctx.db.get("units", unitId),
  ]);
  return productUnit && unit?.organizationId === organizationId
    ? { product, productUnit, unit }
    : null;
}
