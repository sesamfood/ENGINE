import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const MAX_EXCLUDED_PRODUCTS = 500;

// Pass no locationId for the organization-wide list.
export async function listCountExclusions(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  locationId?: Id<"locations">,
) {
  const rows = await ctx.db
    .query("countExcludedProducts")
    .withIndex("by_organizationId_and_locationId_and_productId", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", locationId),
    )
    .take(MAX_EXCLUDED_PRODUCTS + 1);
  if (rows.length > MAX_EXCLUDED_PRODUCTS) {
    throw new ConvexError("Der er for mange Produkter udeladt fra Count");
  }
  return rows;
}

export async function getCountExcludedProductIds(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const [organizationRows, locationRows] = await Promise.all([
    listCountExclusions(ctx, organizationId),
    listCountExclusions(ctx, organizationId, locationId),
  ]);
  return new Set(
    [...organizationRows, ...locationRows].map((row) => row.productId),
  );
}

export async function requireCountedProduct(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
  productId: Id<"products">,
) {
  const rows = await Promise.all(
    [undefined, locationId].map((scope) =>
      ctx.db
        .query("countExcludedProducts")
        .withIndex("by_organizationId_and_locationId_and_productId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("locationId", scope)
            .eq("productId", productId),
        )
        .first(),
    ),
  );
  if (rows.some(Boolean)) {
    throw new ConvexError("Produktet er udeladt fra Count");
  }
}

export async function setCountExclusions(
  ctx: MutationCtx,
  organizationId: string,
  locationId: Id<"locations"> | undefined,
  productIds: Id<"products">[],
) {
  if (
    productIds.length > MAX_EXCLUDED_PRODUCTS ||
    new Set(productIds).size !== productIds.length
  ) {
    throw new ConvexError("Produktvalget er ugyldigt");
  }
  const current = await listCountExclusions(ctx, organizationId, locationId);
  const currentIds = new Set(current.map((row) => row.productId));
  const added = productIds.filter((productId) => !currentIds.has(productId));
  const products = await Promise.all(
    added.map((productId) => ctx.db.get("products", productId)),
  );
  if (
    products.some(
      (product) =>
        !product ||
        product.organizationId !== organizationId ||
        product.status !== "active",
    )
  ) {
    throw new ConvexError("Et Produkt blev ikke fundet");
  }

  const nextIds = new Set(productIds);
  for (const row of current) {
    if (!nextIds.has(row.productId)) {
      await ctx.db.delete("countExcludedProducts", row._id);
    }
  }
  for (const productId of added) {
    await ctx.db.insert("countExcludedProducts", {
      organizationId,
      locationId,
      productId,
    });
  }
  return added.length > 0 || current.length !== productIds.length - added.length;
}
