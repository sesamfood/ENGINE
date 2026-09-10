import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

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
