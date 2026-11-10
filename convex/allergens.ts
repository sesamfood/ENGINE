import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireAllergenViewer, requireLocationAccess } from "./lib/auth";
import { allergenValidator, createAllergenResolver } from "./lib/allergens";
import { getLocationProductAccess, locationHasProduct } from "./lib/locationProducts";
import { requireOrganizationLocation } from "./lib/locations";

const MAX_SCANNED_PRODUCTS = 2000;
const MAX_SOLD_PRODUCTS = 500;

/** Sold products (with a sales price) available at the location, with all allergens. */
export const listForLocation = query({
  args: { locationId: v.id("locations") },
  returns: v.object({
    products: v.array(
      v.object({
        id: v.id("products"),
        name: v.string(),
        salesPrice: v.number(),
        allergens: v.array(allergenValidator),
      }),
    ),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const auth = await requireAllergenViewer(ctx);
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    await requireOrganizationLocation(ctx, organizationId, args.locationId);
    const [scanned, access] = await Promise.all([
      ctx.db
        .query("products")
        .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
          q.eq("organizationId", organizationId).eq("status", "active"),
        )
        .take(MAX_SCANNED_PRODUCTS + 1),
      getLocationProductAccess(ctx, organizationId, args.locationId),
    ]);
    const sold = scanned
      .slice(0, MAX_SCANNED_PRODUCTS)
      .filter(
        (product) =>
          product.salesPrice !== undefined && locationHasProduct(access, product._id),
      );
    const resolveAllergens = createAllergenResolver(ctx, organizationId);
    const products = [];
    for (const product of sold.slice(0, MAX_SOLD_PRODUCTS)) {
      products.push({
        id: product._id,
        name: product.name,
        salesPrice: product.salesPrice!,
        allergens: await resolveAllergens(product._id),
      });
    }
    return {
      products,
      truncated: scanned.length > MAX_SCANNED_PRODUCTS || sold.length > MAX_SOLD_PRODUCTS,
    };
  },
});
