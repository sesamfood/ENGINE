import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireLocationAccess, requireLocationManager } from "./lib/auth";
import { recordAudit } from "./lib/audit";
import { getLocationCountWindow } from "./lib/countWindow";
import { getLocationProductAccess } from "./lib/locationProducts";

const MAX_PRODUCTS = 500;

const configurationValidator = v.union(
  v.object({ kind: v.literal("all") }),
  v.object({
    kind: v.literal("selected"),
    selectedProductIds: v.array(v.id("products")),
    ingredientProductIds: v.array(v.id("products")),
  }),
);

async function requireLocation(
  ctx: Parameters<typeof getLocationProductAccess>[0],
  organizationId: string,
  locationId: Id<"locations">,
) {
  const location = await ctx.db.get("locations", locationId);
  if (!location || location.organizationId !== organizationId) {
    throw new ConvexError("Lokationen blev ikke fundet");
  }
  return location;
}

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
    if (access.kind === "all") return access;
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
    if (
      args.productIds.length > MAX_PRODUCTS ||
      new Set(args.productIds).size !== args.productIds.length
    ) {
      throw new ConvexError("Produktvalget er ugyldigt");
    }

    const products = await Promise.all(
      args.productIds.map((productId) => ctx.db.get("products", productId)),
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

    const current = await ctx.db
      .query("locationProducts")
      .withIndex("by_organizationId_and_locationId_and_productId", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", location._id),
      )
      .take(MAX_PRODUCTS + 1);
    if (current.length > MAX_PRODUCTS) {
      throw new ConvexError("Lokationen har for mange valgte Produkter");
    }

    const nextIds = new Set(args.productIds);
    const currentIds = new Set(current.map((row) => row.productId));
    if (
      nextIds.size === currentIds.size &&
      args.productIds.every((productId) => currentIds.has(productId))
    ) {
      return null;
    }
    const countWindow = await getLocationCountWindow(
      ctx,
      organizationId,
      location,
      Date.now(),
    );
    const currentCount = await ctx.db
      .query("counts")
      .withIndex("by_organizationId_and_locationId_and_periodKey", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", location._id)
          .eq("periodKey", countWindow.periodKey),
      )
      .unique();
    if (currentCount?.status === "open") {
      const countItem = await ctx.db
        .query("countItems")
        .withIndex("by_organizationId_and_countId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("countId", currentCount._id),
        )
        .first();
      if (countItem) {
        throw new ConvexError(
          "Produktvalget kan ikke ændres, mens der er en åben Count",
        );
      }
    }
    for (const row of current) {
      if (!nextIds.has(row.productId)) {
        await ctx.db.delete("locationProducts", row._id);
      }
    }
    for (const productId of args.productIds) {
      if (currentIds.has(productId)) continue;
      await ctx.db.insert("locationProducts", {
        organizationId,
        locationId: location._id,
        productId,
      });
    }

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
