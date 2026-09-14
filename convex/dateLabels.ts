import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  requireCatalogManager,
  requireLocationAccess,
  requirePermission,
} from "./lib/auth";
import { requireOrganizationLocation } from "./lib/locations";
import { requireLocationProduct } from "./lib/locationProducts";
import { paginateActiveProducts } from "./lib/productCatalog";
import { getProductCategoryIds } from "./lib/productCategories";
import { expiryValidator, requireValidExpiry } from "./lib/expiry";
import { recordAudit } from "./lib/audit";

const labelProductValidator = v.object({
  id: v.id("products"),
  name: v.string(),
  categories: v.array(v.object({ id: v.id("categories"), name: v.string() })),
  imageUrl: v.union(v.string(), v.null()),
  expiry: v.union(expiryValidator, v.null()),
});

export const authorizePrinter = query({
  args: { locationId: v.id("locations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requirePermission(
      ctx,
      "dateLabels.print",
      "dateLabels.print",
    );
    requireLocationAccess(auth, args.locationId);
    await requireOrganizationLocation(
      ctx,
      auth.organizationId,
      args.locationId,
    );
    return null;
  },
});

export const listProducts = query({
  args: {
    locationId: v.id("locations"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(labelProductValidator),
  handler: async (ctx, args) => {
    const auth = await requirePermission(
      ctx,
      "dateLabels.print",
      "dateLabels.print",
    );
    requireLocationAccess(auth, args.locationId);
    await requireOrganizationLocation(
      ctx,
      auth.organizationId,
      args.locationId,
    );
    const result = await paginateActiveProducts(
      ctx,
      auth.organizationId,
      args.paginationOpts,
      args.locationId,
    );
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (product) => {
          const categories = await Promise.all(
            (await getProductCategoryIds(ctx, product)).map((id) =>
              ctx.db.get("categories", id),
            ),
          );
          return {
            id: product._id,
            name: product.name,
            categories: categories.flatMap((category) =>
              category?.organizationId === auth.organizationId
                ? [{ id: category._id, name: category.name }]
                : [],
            ),
            imageUrl: product.imageStorageId
              ? await ctx.storage.getUrl(product.imageStorageId)
              : null,
            expiry: product.expiry ?? null,
          };
        }),
      ),
    };
  },
});

export const rememberExpiry = mutation({
  args: {
    locationId: v.id("locations"),
    productId: v.id("products"),
    expiry: expiryValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    await requirePermission(ctx, "dateLabels.print");
    requireLocationAccess(auth, args.locationId);
    await requireOrganizationLocation(
      ctx,
      auth.organizationId,
      args.locationId,
    );
    const product = await ctx.db.get("products", args.productId);
    if (
      !product ||
      product.organizationId !== auth.organizationId ||
      product.status !== "active"
    ) {
      throw new ConvexError("Produktet blev ikke fundet");
    }
    await requireLocationProduct(
      ctx,
      auth.organizationId,
      args.locationId,
      product._id,
    );
    requireValidExpiry(args.expiry);
    if (product.expiry)
      throw new ConvexError(
        "Produktet har allerede en holdbarhed. Vælg produktet igen for at bruge den",
      );
    await ctx.db.patch("products", product._id, {
      expiry: args.expiry,
      updatedAt: Math.max(Date.now(), product.updatedAt + 1),
    });
    await recordAudit(ctx, auth, {
      action: "catalog.productUpdated",
      entityTable: "products",
      entityId: product._id,
      summary: `Holdbarheden for ${product.name} blev gemt`,
    });
    return null;
  },
});
