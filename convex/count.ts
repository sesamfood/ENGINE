import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalQuery, mutation, query } from "./_generated/server";
import {
  requireCatalogManager,
  requireCounter,
  requireKioskLocation,
  requireNormalOrganization,
  requireOrganization,
  requireOrganizationAdmin,
} from "./lib/auth";
import { otherFeaturesLocked } from "./lib/countLock";
import { countScheduleValidator } from "./lib/countSettings";
import {
  getCountConfiguration,
  getLocationCountWindow,
} from "./lib/countWindow";
import { setStock, toDefaultUnit } from "./lib/stock";

const MAX_PRODUCTS = 500;
const MAX_PRODUCT_UNITS = 200;
const MAX_COUNT_ITEMS = 5000;
const MAX_SEARCH_LENGTH = 100;

const settingsValidator = v.object({
  allowOutsideWindow: v.boolean(),
  lockOtherFeaturesDuringCount: v.boolean(),
  requireCountBeforeOpening: v.boolean(),
  countSchedule: countScheduleValidator,
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
    }),
  ),
});

const countQuantityValidator = v.object({
  productId: v.id("products"),
  unitId: v.id("units"),
  quantity: v.number(),
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

const reconciliationRowValidator = v.object({
  productId: v.id("products"),
  productName: v.string(),
  defaultUnitName: v.string(),
  expectedQuantity: v.number(),
  countedQuantity: v.number(),
  expectedSinceAt: v.number(),
});

type CountContext = QueryCtx | MutationCtx;

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

function windowIsOpen(
  now: number,
  window: {
    opensAt: number;
    closesAt: number;
    requireCountBeforeOpening: boolean;
  },
) {
  return (
    now >= window.opensAt &&
    (window.requireCountBeforeOpening || now < window.closesAt)
  );
}

function requireCountSchedule(
  schedule:
    | { type: "monthly"; day: number }
    | { type: "interval"; intervalDays: number; anchorDate: string },
) {
  if (schedule.type === "monthly") {
    if (
      !Number.isInteger(schedule.day) ||
      schedule.day < 0 ||
      schedule.day > 31
    ) {
      throw new ConvexError("Count-dagen er ugyldig");
    }
    return;
  }
  if (
    !Number.isInteger(schedule.intervalDays) ||
    schedule.intervalDays < 1 ||
    schedule.intervalDays > 365
  ) {
    throw new ConvexError("Intervallet skal være mellem 1 og 365 dage");
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(schedule.anchorDate);
  if (!match) throw new ConvexError("Første count-dato er ugyldig");
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    throw new ConvexError("Første count-dato er ugyldig");
  }
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
    .withIndex("by_organizationId_and_locationId_and_submittedAt", (q) =>
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
        .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
          q.eq("organizationId", organizationId).eq("status", "active"),
        )
        .take(MAX_PRODUCTS + 1);

  // ponytail: walking a stockroom needs one uninterrupted list; paginate if organizations outgrow 500 active products.
  return products.slice(0, MAX_PRODUCTS);
}

export const getCountSettings = query({
  args: {},
  returns: settingsValidator,
  handler: async (ctx) => {
    const { organizationId } = await requireNormalOrganization(ctx);
    return await getCountConfiguration(ctx, organizationId);
  },
});

export const getOtherFeaturesLockEnabled = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganization(ctx);
    const settings = await getCountConfiguration(ctx, organizationId);
    return settings.lockOtherFeaturesDuringCount;
  },
});

export const setCountSettings = mutation({
  args: settingsValidator.fields,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    requireCountSchedule(args.countSchedule);
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

export const getOtherFeaturesLockState = query({
  args: { locationId: v.id("locations"), now: v.number() },
  returns: v.object({ isLocked: v.boolean() }),
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const { organizationId } = auth;
    requireKioskLocation(auth, args.locationId);
    requireNow(args.now);
    return {
      isLocked: await otherFeaturesLocked(
        ctx,
        organizationId,
        args.locationId,
        args.now,
      ),
    };
  },
});

export const getCountState = query({
  args: { locationId: v.id("locations"), now: v.number() },
  returns: countStateValidator,
  handler: async (ctx, args) => {
    const auth = await requireCounter(ctx, "count.register");
    const { organizationId } = auth;
    requireKioskLocation(auth, args.locationId);
    requireNow(args.now);
    const location = await requireLocation(
      ctx,
      organizationId,
      args.locationId,
    );
    const window = await getLocationCountWindow(
      ctx,
      organizationId,
      location,
      args.now,
    );
    const periodKey = window.periodKey;
    const [count, hasSubmitted] = await Promise.all([
      getCount(ctx, organizationId, args.locationId, periodKey),
      hasSubmittedCount(ctx, organizationId, args.locationId),
    ]);

    return {
      periodKey,
      opensAt: window.opensAt,
      closesAt: window.closesAt,
      isOpen:
        window.allowOutsideWindow ||
        !hasSubmitted ||
        windowIsOpen(args.now, window),
      outsideWindowAllowed: window.allowOutsideWindow,
      count: count
        ? {
            id: count._id,
            status: count.status,
            submittedAt: count.submittedAt ?? null,
            submittedByName: count.submittedByName ?? null,
          }
        : null,
    };
  },
});

export const getCountQuantities = query({
  args: {
    locationId: v.id("locations"),
    countId: v.id("counts"),
  },
  returns: v.array(countQuantityValidator),
  handler: async (ctx, args) => {
    const auth = await requireCounter(ctx, "count.register");
    const { organizationId } = auth;
    requireKioskLocation(auth, args.locationId);
    const count = await ctx.db.get("counts", args.countId);
    if (
      !count ||
      count.organizationId !== organizationId ||
      count.locationId !== args.locationId
    ) {
      throw new ConvexError("Count blev ikke fundet");
    }
    const items = await getCountItems(ctx, organizationId, count._id);
    return items.map((item) => ({
      productId: item.productId,
      unitId: item.unitId,
      quantity: item.quantity,
    }));
  },
});

export const getCountProductOrder = query({
  args: { locationId: v.id("locations") },
  returns: v.array(v.id("products")),
  handler: async (ctx, args) => {
    const auth = await requireCounter(ctx, "count.register");
    const { organizationId } = auth;
    requireKioskLocation(auth, args.locationId);
    const location = await requireLocation(
      ctx,
      organizationId,
      args.locationId,
    );
    return location.countProductOrder ?? [];
  },
});

export const setCountProductOrder = mutation({
  args: {
    locationId: v.id("locations"),
    productIds: v.array(v.id("products")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
    const location = await requireLocation(
      ctx,
      organizationId,
      args.locationId,
    );
    if (
      args.productIds.length > MAX_PRODUCTS ||
      new Set(args.productIds).size !== args.productIds.length
    ) {
      throw new ConvexError("Produktrækkefølgen er ugyldig");
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
      throw new ConvexError("Et produkt blev ikke fundet");
    }
    await ctx.db.patch("locations", location._id, {
      countProductOrder: args.productIds,
    });
    return null;
  },
});

export const listCountProducts = query({
  args: {
    locationId: v.id("locations"),
    categoryId: v.optional(v.id("categories")),
    search: v.string(),
  },
  returns: v.array(countProductValidator),
  handler: async (ctx, args) => {
    const auth = await requireCounter(ctx, "count.register");
    const { organizationId } = auth;
    requireKioskLocation(auth, args.locationId);
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

    const productUnits = await Promise.all(
      products.map((product) =>
        ctx.db
          .query("productUnits")
          .withIndex("by_organizationId_and_productId", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("productId", product._id),
          )
          .take(MAX_PRODUCT_UNITS + 1),
      ),
    );
    for (const rows of productUnits) {
      if (rows.length > MAX_PRODUCT_UNITS) {
        throw new ConvexError("Produktet har for mange enheder");
      }
    }

    const categoryIds = [...new Set(products.map((row) => row.categoryId))];
    const unitIds = [
      ...new Set(productUnits.flatMap((rows) => rows.map((row) => row.unitId))),
    ];
    const [categories, units, imageUrls] = await Promise.all([
      Promise.all(categoryIds.map((id) => ctx.db.get("categories", id))),
      Promise.all(unitIds.map((id) => ctx.db.get("units", id))),
      Promise.all(
        products.map((product) =>
          product.imageStorageId
            ? ctx.storage.getUrl(product.imageStorageId)
            : null,
        ),
      ),
    ]);
    const categoriesById = new Map(
      categories.flatMap((category) =>
        category?.organizationId === organizationId
          ? [[category._id, category] as const]
          : [],
      ),
    );
    const unitsById = new Map(
      units.flatMap((unit) =>
        unit?.organizationId === organizationId
          ? [[unit._id, unit] as const]
          : [],
      ),
    );

    return products.map((product, index) => {
      const category = categoriesById.get(product.categoryId);
      return {
        id: product._id,
        name: product.name,
        category: category
          ? { id: category._id, name: category.name }
          : null,
        imageUrl: imageUrls[index],
        defaultUnitId: product.defaultUnitId,
        units: productUnits[index].flatMap((row) => {
          const unit = unitsById.get(row.unitId);
          return unit
            ? [
                {
                  id: unit._id,
                  name: unit.name,
                  factorToDefault: row.factorToDefault,
                },
              ]
            : [];
        }),
      };
    });
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
    const auth = await requireCounter(ctx, "count.register");
    const { organizationId, userIdentifier } = auth;
    requireKioskLocation(auth, args.locationId);
    if (!Number.isFinite(args.quantity) || args.quantity < 0) {
      throw new ConvexError("Mængden skal være nul eller større");
    }
    const location = await requireLocation(
      ctx,
      organizationId,
      args.locationId,
    );
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
    const window = await getLocationCountWindow(
      ctx,
      organizationId,
      location,
      now,
    );
    const periodKey = window.periodKey;
    const [currentCount, hasSubmitted] = await Promise.all([
      getCount(ctx, organizationId, args.locationId, periodKey),
      hasSubmittedCount(ctx, organizationId, args.locationId),
    ]);
    if (
      !window.allowOutsideWindow &&
      hasSubmitted &&
      !windowIsOpen(now, window)
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
    const auth = await requireCounter(ctx, "count.register");
    const { organizationId, userName } = auth;
    requireKioskLocation(auth, args.locationId);
    const location = await requireLocation(
      ctx,
      organizationId,
      args.locationId,
    );
    const now = Date.now();
    const window = await getLocationCountWindow(
      ctx,
      organizationId,
      location,
      now,
    );
    const periodKey = window.periodKey;
    const [count, hasSubmitted] = await Promise.all([
      getCount(ctx, organizationId, args.locationId, periodKey),
      hasSubmittedCount(ctx, organizationId, args.locationId),
    ]);
    if (
      !window.allowOutsideWindow &&
      hasSubmitted &&
      !windowIsOpen(now, window)
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
      totals.set(item.productId, (totals.get(item.productId) ?? 0) + quantity);
    }
    for (const [productId, quantity] of totals) {
      const previousStock = await setStock(
        ctx,
        organizationId,
        args.locationId,
        productId,
        quantity,
        now,
      );
      if (previousStock?.lastCountedAt) {
        const product = await ctx.db.get("products", productId);
        const defaultUnit = product
          ? await ctx.db.get("units", product.defaultUnitId)
          : null;
        if (
          !product ||
          product.organizationId !== organizationId ||
          !defaultUnit ||
          defaultUnit.organizationId !== organizationId
        ) {
          throw new ConvexError(
            "Produktet eller standardenheden blev ikke fundet",
          );
        }
        await ctx.db.insert("countReconciliationItems", {
          organizationId,
          countId: count._id,
          productId,
          productName: product.name,
          defaultUnitName: defaultUnit.name,
          expectedQuantity: previousStock.quantity,
          countedQuantity: quantity,
          expectedSinceAt: previousStock.lastCountedAt,
        });
      }
    }
    await ctx.db.patch("counts", count._id, {
      status: "submitted",
      submittedAt: now,
      submittedByName: userName,
    });
    return null;
  },
});

export const getWasteReportContext = internalQuery({
  args: { countId: v.id("counts") },
  returns: v.object({
    organizationId: v.string(),
    locationId: v.id("locations"),
    locationName: v.string(),
    submittedAt: v.number(),
    rows: v.array(reconciliationRowValidator),
  }),
  handler: async (ctx, args) => {
    const auth = await requireCounter(ctx, "count.register");
    const count = await ctx.db.get("counts", args.countId);
    if (
      !count ||
      count.organizationId !== auth.organizationId ||
      count.status !== "submitted" ||
      !count.submittedAt
    ) {
      throw new ConvexError("Den registrerede count blev ikke fundet");
    }
    requireKioskLocation(auth, count.locationId);
    const location = await requireLocation(
      ctx,
      auth.organizationId,
      count.locationId,
    );
    const rows = await ctx.db
      .query("countReconciliationItems")
      .withIndex("by_organizationId_and_countId", (q) =>
        q.eq("organizationId", auth.organizationId).eq("countId", count._id),
      )
      .take(MAX_PRODUCTS + 1);
    if (rows.length > MAX_PRODUCTS) {
      throw new ConvexError("Count har for mange produkter");
    }

    return {
      organizationId: auth.organizationId,
      locationId: location._id,
      locationName: location.name,
      submittedAt: count.submittedAt,
      rows: rows.map((row) => ({
        productId: row.productId,
        productName: row.productName,
        defaultUnitName: row.defaultUnitName,
        expectedQuantity: row.expectedQuantity,
        countedQuantity: row.countedQuantity,
        expectedSinceAt: row.expectedSinceAt,
      })),
    };
  },
});

export const listLocationStock = query({
  args: { locationId: v.id("locations") },
  returns: v.array(locationStockValidator),
  handler: async (ctx, args) => {
    const auth = await requireCounter(ctx, "count.stock");
    const { organizationId } = auth;
    requireKioskLocation(auth, args.locationId);
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
            category?.organizationId === organizationId ? category.name : null,
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
