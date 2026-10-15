import type { Doc, Id } from "../../../_generated/dataModel";
import type { QueryCtx } from "../../../_generated/server";
import { isIntegrationEnabled } from "../../state";

export const MAX_LINKS = 500;
const MAX_PRODUCT_UNITS = 200;

export async function getGsSupplyConnection(
  ctx: QueryCtx,
  organizationId: string,
) {
  return ctx.db
    .query("gsSupplyConnections")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .unique();
}

/** The supplier whose orders use the GS Supply catalog, when the integration is usable. */
export async function getGsSupplySupplierId(
  ctx: QueryCtx,
  organizationId: string,
) {
  if (!(await isIntegrationEnabled(ctx, organizationId, "gssupply"))) {
    return null;
  }
  return (await getGsSupplyConnection(ctx, organizationId))?.supplierId ?? null;
}

/** Units a product can be ordered in, with their factor to the default unit. */
export async function getProductUnitFactors(
  ctx: QueryCtx,
  product: Doc<"products">,
) {
  const rows = await ctx.db
    .query("productUnits")
    .withIndex("by_organizationId_and_productId", (q) =>
      q.eq("organizationId", product.organizationId).eq("productId", product._id),
    )
    .take(MAX_PRODUCT_UNITS);
  const factors = new Map<Id<"units">, number>(
    rows.map((row) => [row.unitId, row.factorToDefault]),
  );
  factors.set(product.defaultUnitId, 1);
  return factors;
}

export async function getGsSupplyLink(
  ctx: QueryCtx,
  organizationId: string,
  productId: Id<"products">,
) {
  return ctx.db
    .query("gsSupplyProductLinks")
    .withIndex("by_organizationId_and_productId", (q) =>
      q.eq("organizationId", organizationId).eq("productId", productId),
    )
    .unique();
}

/** Factor from a unit to the product's default unit, or null if the product no longer has the unit. */
export async function getProductUnitFactor(
  ctx: QueryCtx,
  product: Doc<"products">,
  unitId: Id<"units">,
) {
  if (unitId === product.defaultUnitId) return 1;
  const row = await ctx.db
    .query("productUnits")
    .withIndex("by_organizationId_and_productId_and_unitId", (q) =>
      q
        .eq("organizationId", product.organizationId)
        .eq("productId", product._id)
        .eq("unitId", unitId),
    )
    .unique();
  return row?.factorToDefault ?? null;
}
