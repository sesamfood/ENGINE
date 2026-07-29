import { ConvexError, v } from "convex/values";
import {
  activePeriod,
  countWindow,
  DEFAULT_COUNT_SETTINGS,
  type CountSettings,
} from "../lib/count-window";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  requireCounter,
  requireOrganization,
  requireOrganizationAdmin,
} from "./lib/auth";
import { setStock, toDefaultUnit } from "./lib/stock";

const MAX_PRODUCTS = 500;
const MAX_PRODUCT_UNITS = 200;
const MAX_COUNT_ITEMS = 5000;
const MAX_SEARCH_LENGTH = 100;

const settingsValidator = v.object({
  closeMinuteOfDay: v.number(),
  openMinuteOfDay: v.number(),
  allowOutsideWindow: v.boolean(),
});

const countSummaryValidator = v.object({
  id: v.id("counts"),
  status: v.union(v.literal("open"), v.literal("submitted")),
  submittedAt: v.union(v.number(), v.null()),
  submittedByName: v.union(v.string(), v.null()),
});

const countStateValidator = v.object({
  periodKey: v.string(),
  opensAt: v.number(),
  closesAt: v.number(),
  isOpen: v.boolean(),
  outsideWindowAllowed: v.boolean(),
  count: v.union(countSummaryValidator, v.null()),
  totalProducts: v.number(),
  countedProducts: v.number(),
});

const countProductValidator = v.object({
  id: v.id("products"),
  name: v.string(),
  category: v.union(
    v.object({ id: v.id("categories"), name: v.string() }),
    v.null(),
  ),
  imageUrl: v.union(v.string(), v.null()),
  defaultUnitId: v.id("units"),
  units: v.array(
    v.object({
      id: v.id("units"),
      name: v.string(),
      factorToDefault: v.number(),
      quantity: v.number(),
    }),
  ),
});

const locationStockValidator = v.object({
  productId: v.id("products"),
  productName: v.string(),
  categoryName: v.union(v.string(), v.null()),
  imageUrl: v.union(v.string(), v.null()),
  quantity: v.number(),
  defaultUnitName: v.string(),
  units: v.array(
    v.object({
      name: v.string(),
      factorToDefault: v.number(),
    }),
  ),
  lastCountedAt: v.union(v.number(), v.null()),
});

type CountContext = QueryCtx | MutationCtx;
type CountConfiguration = CountSettings & {
  allowOutsideWindow: boolean;
};

async function getSettings(
  ctx: CountContext,
  organizationId: string,
): Promise<CountConfiguration> {
  const settings = await ctx.db
    .query("countSettings")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .unique();
  return settings
    ? {
        closeMinuteOfDay: settings.closeMinuteOfDay,
        openMinuteOfDay: settings.openMinuteOfDay,
        allowOutsideWindow: settings.allowOutsideWindow ?? false,
      }
    : { ...DEFAULT_COUNT_SETTINGS, allowOutsideWindow: false };
}

async function requireLocation(
  ctx: CountContext,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const location = await ctx.db.get("locations", locationId);
  if (!location || location.organizationId !== organizationId) {
    throw new ConvexError("Locationen blev ikke fundet");
  }
  return location;
}

function requireNow(now: number) {
  if (!Number.isFinite(now) || now <= 0) {
    throw new ConvexError("Tidspunktet er ugyldigt");
  }
}

function requireMinuteOfDay(value: number) {
  if (!Number.isInteger(value) || value < 0 || value >= 24 * 60) {
    throw new ConvexError("Tidspunktet er ugyldigt");
  }
}

function windowIsOpen(now: number, opensAt: number, closesAt: number) {
  return now >= opensAt && now < closesAt;
}

async function getCount(
  ctx: CountContext,
  organizationId: string,
  locationId: Id<"locations">,
  periodKey: string,
) {
  return await ctx.db
    .query("counts")
    .withIndex("by_organizationId_and_locationId_and_periodKey", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("locationId", locationId)
        .eq("periodKey", periodKey),
    )
    .unique();
}

async function hasSubmittedCount(
  ctx: CountContext,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const count = await ctx.db
    .query("counts")
    .withIndex(
      "by_organizationId_and_locationId_and_submittedAt",
      (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", locationId)
          .gt("submittedAt", 0),
    )
    .first();
  return count !== null;
}

async function getCountItems(
  ctx: CountContext,
  organizationId: string,
  countId: Id<"counts">,
) {
  const items = await ctx.db
    .query("countItems")
    .withIndex("by_organizationId_and_countId", (q) =>
      q.eq("organizationId", organizationId).eq("countId", countId),
    )
    .take(MAX_COUNT_ITEMS + 1);
  if (items.length > MAX_COUNT_ITEMS) {
    throw new ConvexError("Count har for mange enhedslinjer");
  }
  return items;
}

async function activeProducts(
  ctx: QueryCtx,
  organizationId: string,
  categoryId?: Id<"categories">,
) {
  const products = categoryId
    ? await ctx.db
        .query("products")
        .withIndex(
          "by_organizationId_and_status_and_categoryId_and_normalizedName",
          (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("status", "active")
              .eq("categoryId", categoryId),
        )
        .take(MAX_PRODUCTS + 1)
    : await ctx.db
        .query("products")
        .withIndex(
          "by_organizationId_and_status_and_normalizedName",
          (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("status", "active"),
        )
        .take(MAX_PRODUCTS + 1);

  // ponytail: walking a stockroom needs one uninterrupted list; paginate if organizations outgrow 500 active products.
  return products.slice(0, MAX_PRODUCTS);
}

export const getCountSettings = query({
  args: {},
  returns: settingsValidator,
  handler: async (ctx) => {
    const { organizationId } = await requireOrganization(ctx);
    return await getSettings(ctx, organizationId);
  },
});

export const setCountSettings = mutation({
  args: settingsValidator.fields,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    requireMinuteOfDay(args.closeMinuteOfDay);
    requireMinuteOfDay(args.openMinuteOfDay);
    const current = await ctx.db
      .query("countSettings")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();

    if (current) {
      await ctx.db.patch("countSettings", current._id, args);
    } else {
      await ctx.db.insert("countSettings", { organizationId, ...args });
    }
    return null;
  },
});

export const getCountState = query({
  args: { locationId: v.id("locations"), now: v.number() },
  returns: countStateValidator,
  handler: async (ctx, args) => {
    const { organizationId } = await requireCounter(ctx);
    requireNow(args.now);
    await requireLocation(ctx, organizationId, args.locationId);
    const settings = await getSettings(ctx, organizationId);
    const periodKey = activePeriod(args.now, settings);
    const window = countWindow(periodKey, settings);
    const [count, products, hasSubmitted] = await Promise.all([
      getCount(ctx, organizationId, args.locationId, periodKey),
      activeProducts(ctx, organizationId),
      hasSubmittedCount(ctx, organizationId, args.locationId),
    ]);
    const items = count
      ? await getCountItems(ctx, organizationId, count._id)
      : [];
    const activeProductIds = new Set(products.map((product) => product._id));
    const countedProductIds = new Set(
      items
        .filter((item) => activeProductIds.has(item.productId))
        .map((item) => item.productId),
    );

    return {
      periodKey,
      opensAt: window.opensAt,
      closesAt: window.closesAt,
      isOpen:
        settings.allowOutsideWindow ||
        !hasSubmitted ||
        windowIsOpen(args.now, window.opensAt, window.closesAt),
      outsideWindowAllowed: settings.allowOutsideWindow,
      count: count
        ? {
            id: count._id,
            status: count.status,
            submittedAt: count.submittedAt ?? null,
            submittedByName: count.submittedByName ?? null,
          }
        : null,
      totalProducts: products.length,
      countedProducts: countedProductIds.size,
    };
  },
});

export const listCountProducts = query({
  args: {
    locationId: v.id("locations"),
    now: v.number(),
    categoryId: v.optional(v.id("categories")),
    search: v.string(),
  },
  returns: v.array(countProductValidator),
  handler: async (ctx, args) => {
    const { organizationId } = await requireCounter(ctx);
    requireNow(args.now);
    await requireLocation(ctx, organizationId, args.locationId);
    const search = args.search.trim();
    if (search.length > MAX_SEARCH_LENGTH) {
      throw new ConvexError("Søgningen er for lang");
    }
    if (args.categoryId) {
      const category = await ctx.db.get("categories", args.categoryId);
      if (!category || category.organizationId !== organizationId) {
        throw new ConvexError("Kategorien blev ikke fundet");
      }
    }

    const settings = await getSettings(ctx, organizationId);
    const periodKey = activePeriod(args.now, settings);
    const count = await getCount(
      ctx,
      organizationId,
      args.locationId,
      periodKey,
    );
    const countItems = count
      ? await getCountItems(ctx, organizationId, count._id)
      : [];
    const quantities = new Map(
      countItems.map((item) => [
        `${item.productId}:${item.unitId}`,
        item.quantity,
      ]),
    );
    const products = search
      ? await ctx.db
          .query("products")
          .withSearchIndex("search_name", (q) => {
            const productSearch = q
              .search("name", search)
              .eq("organizationId", organizationId)
              .eq("status", "active");
            return args.categoryId
              ? productSearch.eq("categoryId", args.categoryId)
              : productSearch;
          })
          .take(MAX_PRODUCTS)
      : await activeProducts(ctx, organizationId, args.categoryId);

    return await Promise.all(
      products.map(async (product) => {
        const [category, productUnits, imageUrl] = await Promise.all([
          ctx.db.get("categories", product.categoryId),
          ctx.db
            .query("productUnits")
            .withIndex("by_organizationId_and_productId", (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("productId", product._id),
            )
            .take(MAX_PRODUCT_UNITS + 1),
          product.imageStorageId
            ? ctx.storage.getUrl(product.imageStorageId)
            : null,
        ]);
        if (productUnits.length > MAX_PRODUCT_UNITS) {
          throw new ConvexError("Produktet har for mange enheder");
        }
        const units = await Promise.all(
          productUnits.map((row) => ctx.db.get("units", row.unitId)),
        );

        return {
          id: product._id,
          name: product.name,
          category:
            category?.organizationId === organizationId
              ? { id: category._id, name: category.name }
              : null,
          imageUrl,
          defaultUnitId: product.defaultUnitId,
          units: productUnits.flatMap((row, index) => {
            const unit = units[index];
            return unit?.organizationId === organizationId
              ? [
                  {
                    id: unit._id,
                    name: unit.name,
                    factorToDefault: row.factorToDefault,
                    quantity:
                      quantities.get(`${product._id}:${unit._id}`) ?? 0,
                  },
                ]
              : [];
          }),
        };
      }),
    );
  },
});

export const setCountQuantity = mutation({
  args: {
    locationId: v.id("locations"),
    productId: v.id("products"),
    unitId: v.id("units"),
    quantity: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId, userIdentifier } = await requireCounter(ctx);
    if (!Number.isFinite(args.quantity) || args.quantity < 0) {
      throw new ConvexError("Mængden skal være nul eller større");
    }
    await requireLocation(ctx, organizationId, args.locationId);
    const [product, productUnit] = await Promise.all([
      ctx.db.get("products", args.productId),
      ctx.db
        .query("productUnits")
        .withIndex("by_organizationId_and_productId_and_unitId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("productId", args.productId)
            .eq("unitId", args.unitId),
        )
        .unique(),
    ]);
    if (
      !product ||
      product.organizationId !== organizationId ||
      product.status !== "active" ||
      !productUnit
    ) {
      throw new ConvexError("Produktet eller enheden blev ikke fundet");
    }

    const now = Date.now();
    const settings = await getSettings(ctx, organizationId);
    const periodKey = activePeriod(now, settings);
    const window = countWindow(periodKey, settings);
    const [currentCount, hasSubmitted] = await Promise.all([
      getCount(ctx, organizationId, args.locationId, periodKey),
      hasSubmittedCount(ctx, organizationId, args.locationId),
    ]);
    if (
      !settings.allowOutsideWindow &&
      hasSubmitted &&
      !windowIsOpen(now, window.opensAt, window.closesAt)
    ) {
      throw new ConvexError("Count-vinduet er lukket");
    }
    let count = currentCount;
    if (count?.status === "submitted") {
      throw new ConvexError("Count er allerede registreret");
    }
    if (!count && args.quantity === 0) return null;
    if (!count) {
      const countId = await ctx.db.insert("counts", {
        organizationId,
        locationId: args.locationId,
        periodKey,
        status: "open",
        createdBy: userIdentifier,
      });
      count = (await ctx.db.get("counts", countId))!;
    }

    const item = await ctx.db
      .query("countItems")
      .withIndex(
        "by_organizationId_and_countId_and_productId_and_unitId",
        (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("countId", count._id)
            .eq("productId", args.productId)
            .eq("unitId", args.unitId),
      )
      .unique();

    if (args.quantity === 0) {
      if (item) await ctx.db.delete("countItems", item._id);
    } else if (item) {
      await ctx.db.patch("countItems", item._id, {
        quantity: args.quantity,
      });
    } else {
      await ctx.db.insert("countItems", {
        organizationId,
        countId: count._id,
        productId: args.productId,
        unitId: args.unitId,
        quantity: args.quantity,
      });
    }
    return null;
  },
});

export const submitCount = mutation({
  args: { locationId: v.id("locations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId, userName } = await requireCounter(ctx);
    await requireLocation(ctx, organizationId, args.locationId);
    const now = Date.now();
    const settings = await getSettings(ctx, organizationId);
    const periodKey = activePeriod(now, settings);
    const window = countWindow(periodKey, settings);
    const [count, hasSubmitted] = await Promise.all([
      getCount(ctx, organizationId, args.locationId, periodKey),
      hasSubmittedCount(ctx, organizationId, args.locationId),
    ]);
    if (
      !settings.allowOutsideWindow &&
      hasSubmitted &&
      !windowIsOpen(now, window.opensAt, window.closesAt)
    ) {
      throw new ConvexError("Count-vinduet er lukket");
    }
    if (!count) {
      throw new ConvexError("Indtast mindst én mængde før registrering");
    }
    if (count.status === "submitted") {
      throw new ConvexError("Count er allerede registreret");
    }
    const items = await getCountItems(ctx, organizationId, count._id);
    if (items.length === 0) {
      throw new ConvexError("Indtast mindst én mængde før registrering");
    }

    const totals = new Map<Id<"products">, number>();
    for (const item of items) {
      const quantity = await toDefaultUnit(
        ctx,
        organizationId,
        item.productId,
        item.unitId,
        item.quantity,
      );
      if (quantity === null) {
        throw new ConvexError(
          "En produkt-enhed er ændret. Opdatér count og prøv igen",
        );
      }
      totals.set(
        item.productId,
        (totals.get(item.productId) ?? 0) + quantity,
      );
    }
    for (const [productId, quantity] of totals) {
      await setStock(
        ctx,
        organizationId,
        args.locationId,
        productId,
        quantity,
        now,
      );
    }
    await ctx.db.patch("counts", count._id, {
      status: "submitted",
      submittedAt: now,
      submittedByName: userName,
    });
    return null;
  },
});

export const listLocationStock = query({
  args: { locationId: v.id("locations") },
  returns: v.array(locationStockValidator),
  handler: async (ctx, args) => {
    const { organizationId } = await requireCounter(ctx);
    await requireLocation(ctx, organizationId, args.locationId);
    const products = await activeProducts(ctx, organizationId);

    return await Promise.all(
      products.map(async (product) => {
        const [category, defaultUnit, stock, imageUrl, productUnits] =
          await Promise.all([
            ctx.db.get("categories", product.categoryId),
            ctx.db.get("units", product.defaultUnitId),
            ctx.db
              .query("locationStock")
              .withIndex(
                "by_organizationId_and_locationId_and_productId",
                (q) =>
                  q
                    .eq("organizationId", organizationId)
                    .eq("locationId", args.locationId)
                    .eq("productId", product._id),
              )
              .unique(),
            product.imageStorageId
              ? ctx.storage.getUrl(product.imageStorageId)
              : null,
            ctx.db
              .query("productUnits")
              .withIndex("by_organizationId_and_productId", (q) =>
                q
                  .eq("organizationId", organizationId)
                  .eq("productId", product._id),
              )
              .take(MAX_PRODUCT_UNITS + 1),
          ]);
        if (!defaultUnit || defaultUnit.organizationId !== organizationId) {
          throw new ConvexError("Produktets standardenhed blev ikke fundet");
        }
        if (productUnits.length > MAX_PRODUCT_UNITS) {
          throw new ConvexError("Produktet har for mange enheder");
        }
        const units = await Promise.all(
          productUnits.map((row) => ctx.db.get("units", row.unitId)),
        );
        return {
          productId: product._id,
          productName: product.name,
          categoryName:
            category?.organizationId === organizationId
              ? category.name
              : null,
          imageUrl,
          quantity: stock?.quantity ?? 0,
          defaultUnitName: defaultUnit.name,
          units: productUnits.flatMap((row, index) => {
            const unit = units[index];
            return unit?.organizationId === organizationId
              ? [
                  {
                    name: unit.name,
                    factorToDefault: row.factorToDefault,
                  },
                ]
              : [];
          }),
          lastCountedAt: stock?.lastCountedAt ?? null,
        };
      }),
    );
  },
});
