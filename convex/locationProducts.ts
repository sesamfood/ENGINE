import { requireOrganizationLocation as requireLocation } from "./lib/locations";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireLocationAccess, requireLocationManager } from "./lib/auth";
import { recordAudit } from "./lib/audit";
import {
  getLocationProductAccess,
  setLocationProducts,
} from "./lib/locationProducts";

const configurationValidator = v.union(
  v.object({
    kind: v.literal("all"),
    unusedProductIds: v.array(v.id("products")),
  }),
  v.object({
    kind: v.literal("selected"),
    selectedProductIds: v.array(v.id("products")),
    ingredientProductIds: v.array(v.id("products")),
  }),
);

export const getConfiguration = query({
  args: { locationId: v.id("locations") },
  returns: configurationValidator,
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireLocationAccess(auth, args.locationId);
    await requireLocation(ctx, auth.organizationId, args.locationId);
    const access = await getLocationProductAccess(
      ctx,
      auth.organizationId,
      args.locationId,
    );
    if (access.kind === "all") {
      return {
        kind: "all" as const,
        unusedProductIds: [...access.unusedProductIds],
      };
    }
    return {
      kind: "selected" as const,
      selectedProductIds: [...access.selectedProductIds],
      ingredientProductIds: [...access.effectiveProductIds].filter(
        (productId) => !access.selectedProductIds.has(productId),
      ),
    };
  },
});

export const setConfiguration = mutation({
  args: {
    locationId: v.id("locations"),
    productIds: v.array(v.id("products")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    const location = await requireLocation(
      ctx,
      organizationId,
      args.locationId,
    );
    const changed = await setLocationProducts(
      ctx,
      organizationId,
      location,
      { productIds: args.productIds, unusedProductIds: [] },
    );
    if (!changed) return null;
    await recordAudit(ctx, auth, {
      action: "locations.productsChanged",
      entityTable: "locations",
      entityId: location._id,
      locationId: location._id,
      summary:
        args.productIds.length === 0
          ? `Alle Produkter blev gjort tilgængelige på ${location.name}`
          : `${args.productIds.length} Produkter blev valgt til ${location.name}`,
    });
    return null;
  },
});
