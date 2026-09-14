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
import {
  getLocationProductAccess,
  requireLocationProduct,
} from "./lib/locationProducts";
import {
  dateLabelCategories,
  dateLabelSelectionFields,
  getDateLabelSettings,
  selectedDateLabelCategories,
} from "./lib/dateLabelSettings";
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

export const listProducts = query({
  args: {
    locationId: v.id("locations"),
    paginationOpts: paginationOptsValidator,
    includeHidden: v.optional(v.boolean()),
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
    if (args.includeHidden) await requireCatalogManager(ctx);
    const settings = args.includeHidden
      ? null
      : await getDateLabelSettings(ctx, auth.organizationId, args.locationId);
    const categoriesToShow =
      settings?.mode === "selected"
        ? await selectedDateLabelCategories(
            ctx,
            auth.organizationId,
            settings.categoryIds,
          )
        : new Set<string>();
    const included = new Set(settings?.productIds);
    const excluded = new Set(settings?.excludedProductIds);
    const result = await paginateActiveProducts(
      ctx,
      auth.organizationId,
      args.paginationOpts,
      args.locationId,
    );
    const page = await Promise.all(
      result.page.map(async (product) => {
        const categories = await Promise.all(
          (await getProductCategoryIds(ctx, product)).map((id) =>
            ctx.db.get("categories", id),
          ),
        );
        if (
          settings?.mode === "selected" &&
          (excluded.has(product._id) ||
            (!included.has(product._id) &&
              !categories.some(
                (category) => category && categoriesToShow.has(category._id),
              )))
        )
          return null;
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
    );
    return { ...result, page: page.filter((product) => product !== null) };
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

export const getSettings = query({
  args: { locationId: v.id("locations") },
  returns: v.object({
    ...dateLabelSelectionFields,
    updatedAt: v.union(v.number(), v.null()),
    categories: v.array(
      v.object({
        id: v.id("categories"),
        name: v.string(),
        path: v.string(),
        parentCategoryId: v.union(v.id("categories"), v.null()),
      }),
    ),
  }),
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
    const [settings, categories] = await Promise.all([
      getDateLabelSettings(ctx, auth.organizationId, args.locationId),
      dateLabelCategories(ctx, auth.organizationId),
    ]);
    return {
      mode: settings?.mode ?? "all",
      categoryIds: settings?.categoryIds ?? [],
      productIds: settings?.productIds ?? [],
      excludedProductIds: settings?.excludedProductIds ?? [],
      updatedAt: settings?.updatedAt ?? null,
      categories: categories.map(({ id, name, path, parentCategoryId }) => ({
        id,
        name,
        path,
        parentCategoryId,
      })),
    };
  },
});

export const saveSettings = mutation({
  args: {
    locationId: v.id("locations"),
    ...dateLabelSelectionFields,
    expectedUpdatedAt: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    await requirePermission(ctx, "dateLabels.print");
    requireLocationAccess(auth, args.locationId);
    const location = await requireOrganizationLocation(
      ctx,
      auth.organizationId,
      args.locationId,
    );
    if (
      args.categoryIds.length > 200 ||
      args.productIds.length + args.excludedProductIds.length > 500
    )
      throw new ConvexError(
        "Vælg højst 200 kategorier og 500 enkelte produkter",
      );
    const current = await getDateLabelSettings(
      ctx,
      auth.organizationId,
      args.locationId,
    );
    if ((current?.updatedAt ?? null) !== args.expectedUpdatedAt)
      throw new ConvexError(
        "Indstillingerne er ændret af en anden bruger. Luk og åbn indstillingerne igen",
      );
    const categoryIds =
      args.mode === "all" ? [] : [...new Set(args.categoryIds)];
    const productIds = args.mode === "all" ? [] : [...new Set(args.productIds)];
    const excludedProductIds =
      args.mode === "all" ? [] : [...new Set(args.excludedProductIds)];
    if (productIds.some((id) => excludedProductIds.includes(id)))
      throw new ConvexError("Et produkt kan ikke både vises og skjules");
    for (const id of categoryIds) {
      const category = await ctx.db.get("categories", id);
      if (!category || category.organizationId !== auth.organizationId)
        throw new ConvexError("Kategorien blev ikke fundet");
    }
    const access = await getLocationProductAccess(
      ctx,
      auth.organizationId,
      args.locationId,
    );
    for (const id of [...productIds, ...excludedProductIds]) {
      const product = await ctx.db.get("products", id);
      if (
        !product ||
        product.organizationId !== auth.organizationId ||
        product.status !== "active" ||
        (access.kind === "selected" && !access.effectiveProductIds.has(id))
      )
        throw new ConvexError("Produktet er ikke tilgængeligt på lokationen");
    }
    const values = {
      mode: args.mode,
      categoryIds,
      productIds,
      excludedProductIds,
      updatedAt: Math.max(Date.now(), (current?.updatedAt ?? 0) + 1),
    };
    const id =
      current?._id ??
      (await ctx.db.insert("dateLabelSettings", {
        organizationId: auth.organizationId,
        locationId: args.locationId,
        ...values,
      }));
    if (current) await ctx.db.patch("dateLabelSettings", id, values);
    await recordAudit(ctx, auth, {
      action: "dateLabels.settingsUpdated",
      locationId: args.locationId,
      entityTable: "dateLabelSettings",
      entityId: id,
      summary: `Produktvisningen for Datomærkning på ${location.name} blev gemt`,
    });
    return null;
  },
});
