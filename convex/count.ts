import { getOnlinePosOrganizationSettings } from "./integrations/onlinepos/lib/connections";
import { parseDateKey } from "../lib/date";
import { requireOrganizationLocation as requireLocation } from "./lib/locations";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalQuery, mutation, query } from "./_generated/server";
import {
  requireCounter,
  requireLocationAccess,
  requireNormalOrganization,
  requireOrganization,
  requirePermission,
  requireStockViewer,
} from "./lib/auth";
import { otherFeaturesLockState } from "./lib/countLock";
import { getDisabledFeatures } from "./lib/features";
import {
  listCountAreas,
  MAX_COUNT_AREAS,
  MAX_COUNT_AREA_PRODUCTS,
  requireCountArea,
} from "./lib/countAreas";
import { countScheduleValidator } from "./lib/countSettings";
import {
  getCountConfiguration,
  getCurrentCount,
  getOpenAdHocCount,
} from "./lib/countWindow";
import { setStock, toDefaultUnit } from "./lib/stock";
import { recordAudit, requireAuditReason } from "./lib/audit";
import {
  getLocationProductAccess,
  locationHasProduct,
  requireLocationProduct,
} from "./lib/locationProducts";
import {
  getCountExcludedProductIds,
  requireCountedProduct,
} from "./lib/countExclusions";
import {
  activeProductCatalogValidator,
  catalogPaginationOptions,
  listActiveProductPage,
  listLocationActiveProductCatalog,
} from "./lib/productCatalog";

const MAX_PRODUCTS = 500;
const MAX_PRODUCT_UNITS = 200;
const MAX_COUNT_ITEMS = 5000;
const MAX_LOCATION_STOCK_ROWS = 5000;
const MAX_LOCATIONS = 200;

const settingsValidator = v.object({
  allowOutsideWindow: v.boolean(),
  lockOtherFeaturesDuringCount: v.boolean(),
  requireCountBeforeOpening: v.boolean(),
  countSchedule: countScheduleValidator,
});

const countSummaryValidator = v.object({
  id: v.id("counts"),
  status: v.union(v.literal("open"), v.literal("submitted")),
  completedCountAreaIds: v.array(v.id("countAreas")),
  countAreaProgress: v.array(
    v.object({
      countAreaId: v.id("countAreas"),
      countedProductIds: v.array(v.id("products")),
    }),
  ),
  submittedAt: v.union(v.number(), v.null()),
  submittedByName: v.union(v.string(), v.null()),
});

const countStateValidator = v.object({
  timeZone: v.string(),
  periodKey: v.string(),
  opensAt: v.number(),
  closesAt: v.number(),
  nextTransitionAt: v.union(v.number(), v.null()),
  isOpen: v.boolean(),
  outsideWindowAllowed: v.boolean(),
  adHoc: v.boolean(),
  count: v.union(countSummaryValidator, v.null()),
});

const countQuantityValidator = v.object({
  countAreaId: v.union(v.id("countAreas"), v.null()),
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
      id: v.id("units"),
      name: v.string(),
      pluralName: v.optional(v.string()),
      factorToDefault: v.number(),
    }),
  ),
  lastCountedAt: v.union(v.number(), v.null()),
});

const reconciliationRowValidator = v.object({
  productId: v.id("products"),
  productName: v.string(),
  defaultUnitName: v.string(),
  defaultUnitId: v.optional(v.id("units")),
  expectedQuantity: v.number(),
  countedQuantity: v.number(),
  expectedSinceAt: v.number(),
  onlinePosStockAccounting: v.optional(v.boolean()),
  onlinePosAppliedSalesQuantity: v.optional(v.number()),
});

type CountContext = QueryCtx | MutationCtx;

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
  try {
    parseDateKey(schedule.anchorDate);
  } catch {
    throw new ConvexError("Første Count-dato er ugyldig");
  }
}

async function getLatestSubmittedCount(
  ctx: CountContext,
  organizationId: string,
  locationId: Id<"locations">,
) {
  return await ctx.db
    .query("counts")
    .withIndex("by_organizationId_and_locationId_and_submittedAt", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("locationId", locationId)
        .gt("submittedAt", 0),
    )
    .order("desc")
    .first();
}

async function hasSubmittedCount(
  ctx: CountContext,
  organizationId: string,
  locationId: Id<"locations">,
) {
  return (
    (await getLatestSubmittedCount(ctx, organizationId, locationId)) !== null
  );
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

async function listCountAreaProgress(
  ctx: CountContext,
  organizationId: string,
  countId: Id<"counts">,
) {
  const progress = await ctx.db
    .query("countAreaProgress")
    .withIndex("by_organizationId_and_countId", (q) =>
      q.eq("organizationId", organizationId).eq("countId", countId),
    )
    .take(MAX_COUNT_AREAS + 1);
  if (progress.length > MAX_COUNT_AREAS) {
    throw new ConvexError("Count har status for for mange Områder");
  }
  return progress;
}

async function getCountAreaProgress(
  ctx: CountContext,
  organizationId: string,
  countId: Id<"counts">,
  countAreaId: Id<"countAreas">,
) {
  return await ctx.db
    .query("countAreaProgress")
    .withIndex(
      "by_organizationId_and_countId_and_countAreaId",
      (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("countId", countId)
          .eq("countAreaId", countAreaId),
    )
    .unique();
}

async function getWritableCount(
  ctx: MutationCtx,
  args: {
    organizationId: string;
    userIdentifier: string;
    location: Doc<"locations">;
    create: boolean;
  },
) {
  const now = Date.now();
  const { window, count } = await getCurrentCount(
    ctx,
    args.organizationId,
    args.location,
    now,
  );
  if (
    !count?.adHoc &&
    !window.allowOutsideWindow &&
    !windowIsOpen(now, window) &&
    (await hasSubmittedCount(ctx, args.organizationId, args.location._id))
  ) {
    throw new ConvexError("Count-vinduet er lukket");
  }
  if (count?.status === "submitted") {
    throw new ConvexError("Count er allerede registreret");
  }
  if (count || !args.create) return count;

  const countId = await ctx.db.insert("counts", {
    organizationId: args.organizationId,
    locationId: args.location._id,
    periodKey: window.periodKey,
    status: "open",
    createdBy: args.userIdentifier,
  });
  const created = await ctx.db.get("counts", countId);
  if (!created) throw new ConvexError("Count kunne ikke oprettes");
  return created;
}

async function hasOnlinePosStockConnection(
  ctx: MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const onlinePos = await getOnlinePosOrganizationSettings(ctx, organizationId);
  if (!onlinePos?.enabled || !onlinePos.stockSyncEnabled) return false;
  const connection = await ctx.db
    .query("onlinePosLocationIntegrations")
    .withIndex("by_organizationId_and_locationId", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", locationId),
    )
    .unique();
  return connection !== null;
}

// Overwrites stock with the counted quantity and records the deviation for the Waste-rapport.
async function reconcileStock(
  ctx: MutationCtx,
  args: {
    organizationId: string;
    locationId: Id<"locations">;
    countId: Id<"counts">;
    productId: Id<"products">;
    quantity: number;
    now: number;
    onlinePosConnected: boolean;
  },
) {
  const { organizationId, productId, quantity } = args;
  const previousStock = await setStock(
    ctx,
    organizationId,
    args.locationId,
    productId,
    quantity,
    args.now,
  );
  if (!previousStock?.lastCountedAt) return;
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
    throw new ConvexError("Produktet eller standardenheden blev ikke fundet");
  }
  await ctx.db.insert("countReconciliationItems", {
    organizationId,
    countId: args.countId,
    productId,
    productName: product.name,
    defaultUnitName: defaultUnit.name,
    defaultUnitId: defaultUnit._id,
    expectedQuantity:
      previousStock.quantity + (previousStock.onlinePosSalesQuantity ?? 0),
    countedQuantity: quantity,
    expectedSinceAt: previousStock.lastCountedAt,
    onlinePosStockAccounting:
      args.onlinePosConnected ||
      previousStock.onlinePosSalesQuantity !== undefined,
    onlinePosAppliedSalesQuantity: previousStock.onlinePosSalesQuantity,
  });
}

async function markCountAreaProduct(
  ctx: MutationCtx,
  args: {
    organizationId: string;
    locationId: Id<"locations">;
    countId: Id<"counts">;
    countAreaId: Id<"countAreas">;
    productId: Id<"products">;
  },
) {
  const progress = await getCountAreaProgress(
    ctx,
    args.organizationId,
    args.countId,
    args.countAreaId,
  );
  if (progress?.countedProductIds.includes(args.productId)) return;
  if (
    progress &&
    progress.countedProductIds.length >= MAX_COUNT_AREA_PRODUCTS
  ) {
    throw new ConvexError("Området har for mange optalte Produkter");
  }
  if (progress) {
    await ctx.db.patch("countAreaProgress", progress._id, {
      countedProductIds: [...progress.countedProductIds, args.productId],
    });
    return;
  }
  await ctx.db.insert("countAreaProgress", {
    organizationId: args.organizationId,
    locationId: args.locationId,
    countId: args.countId,
    countAreaId: args.countAreaId,
    countedProductIds: [args.productId],
  });
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

  if (products.length > MAX_PRODUCTS) {
    throw new ConvexError(
      "Der er over 500 aktive produkter. Arkivér produkter, du ikke bruger, eller vælg en kategori for at afgrænse listen",
    );
  }
  return products;
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
    if ((await getDisabledFeatures(ctx, organizationId)).includes("count")) {
      return false;
    }
    const settings = await getCountConfiguration(ctx, organizationId);
    return settings.lockOtherFeaturesDuringCount;
  },
});

export const setCountSettings = mutation({
  args: settingsValidator.fields,
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requirePermission(ctx, "count.settings");
    if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
    const { organizationId } = auth;
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
  returns: v.object({
    isLocked: v.boolean(),
    nextTransitionAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    requireNow(args.now);
    return await otherFeaturesLockState(
      ctx,
      organizationId,
      args.locationId,
      args.now,
    );
  },
});

export const getCountState = query({
  args: { locationId: v.id("locations"), now: v.number() },
  returns: countStateValidator,
  handler: async (ctx, args) => {
    const auth = await requireCounter(ctx, "count.register");
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    requireNow(args.now);
    const location = await requireLocation(
      ctx,
      organizationId,
      args.locationId,
    );
    const [{ window, count }, hasSubmitted] = await Promise.all([
      getCurrentCount(ctx, organizationId, location, args.now),
      hasSubmittedCount(ctx, organizationId, args.locationId),
    ]);
    const adHoc = count?.adHoc === true;
    const countAreaProgress = count
      ? await listCountAreaProgress(ctx, organizationId, count._id)
      : [];

    return {
      timeZone: window.timeZone,
      periodKey: count?.periodKey ?? window.periodKey,
      opensAt: window.opensAt,
      closesAt: window.closesAt,
      nextTransitionAt:
        args.now < window.opensAt
          ? window.opensAt
          : args.now < window.closesAt
            ? window.closesAt
            : null,
      isOpen:
        adHoc ||
        window.allowOutsideWindow ||
        !hasSubmitted ||
        windowIsOpen(args.now, window),
      outsideWindowAllowed: window.allowOutsideWindow,
      adHoc,
      count: count
        ? {
            id: count._id,
            status: count.status,
            completedCountAreaIds: count.completedCountAreaIds ?? [],
            countAreaProgress: countAreaProgress.map((progress) => ({
              countAreaId: progress.countAreaId,
              countedProductIds: progress.countedProductIds,
            })),
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
    requireLocationAccess(auth, args.locationId);
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
      countAreaId: item.countAreaId ?? null,
      productId: item.productId,
      unitId: item.unitId,
      quantity: item.quantity,
    }));
  },
});

export const listCatalogPage = query({
  args: { locationId: v.id("locations"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(activeProductCatalogValidator),
  handler: async (ctx, args) => {
    const auth = await requireCounter(ctx, "count.register");
    requireLocationAccess(auth, args.locationId);
    await requireLocation(ctx, auth.organizationId, args.locationId);
    const [result, excludedProductIds] = await Promise.all([
      listActiveProductPage(
        ctx,
        auth.organizationId,
        args.paginationOpts,
        args.locationId,
      ),
      getCountExcludedProductIds(ctx, auth.organizationId, args.locationId),
    ]);
    return {
      ...result,
      page: result.page.filter(
        (product) => !excludedProductIds.has(product.id),
      ),
    };
  },
});

export const listCatalog = query({
  args: { locationId: v.id("locations") },
  returns: v.array(activeProductCatalogValidator),
  handler: async (ctx, args) => {
    const auth = await requireCounter(ctx, "count.register");
    requireLocationAccess(auth, args.locationId);
    await requireLocation(ctx, auth.organizationId, args.locationId);
    const [products, excludedProductIds] = await Promise.all([
      listLocationActiveProductCatalog(
        ctx,
        auth.organizationId,
        args.locationId,
      ),
      getCountExcludedProductIds(ctx, auth.organizationId, args.locationId),
    ]);
    return products.filter((product) => !excludedProductIds.has(product.id));
  },
});

export const setCountQuantity = mutation({
  args: {
    locationId: v.id("locations"),
    countAreaId: v.union(v.id("countAreas"), v.null()),
    productId: v.id("products"),
    unitId: v.id("units"),
    quantity: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCounter(ctx, "count.register");
    const { organizationId, userIdentifier } = auth;
    requireLocationAccess(auth, args.locationId);
    if (!Number.isFinite(args.quantity) || args.quantity < 0) {
      throw new ConvexError("Mængden skal være nul eller større");
    }
    const location = await requireLocation(
      ctx,
      organizationId,
      args.locationId,
    );
    const [product, productUnit, countAreas] = await Promise.all([
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
      listCountAreas(ctx, organizationId, location._id),
    ]);
    if (
      !product ||
      product.organizationId !== organizationId ||
      product.status !== "active" ||
      !productUnit
    ) {
      throw new ConvexError("Produktet eller enheden blev ikke fundet");
    }
    await requireLocationProduct(
      ctx,
      organizationId,
      location._id,
      product._id,
    );
    await requireCountedProduct(
      ctx,
      organizationId,
      location._id,
      product._id,
    );
    if (countAreas.length > 0) {
      if (!args.countAreaId) throw new ConvexError("Vælg et Område");
      const countArea = await requireCountArea(
        ctx,
        organizationId,
        location._id,
        args.countAreaId,
      );
      const areaProduct = await ctx.db
        .query("countAreaProducts")
        .withIndex(
          "by_organizationId_and_countAreaId_and_productId",
          (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("countAreaId", countArea._id)
              .eq("productId", product._id),
        )
        .unique();
      if (!areaProduct) {
        throw new ConvexError("Produktet bruges ikke i det valgte Område");
      }
    } else if (args.countAreaId) {
      throw new ConvexError("Området blev ikke fundet");
    }

    const count = await getWritableCount(ctx, {
      organizationId,
      userIdentifier,
      location,
      create: args.quantity > 0,
    });
    if (!count) return null;

    const itemCandidates = await ctx.db
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
      .take(MAX_COUNT_AREAS + 2);
    if (itemCandidates.length > MAX_COUNT_AREAS + 1) {
      throw new ConvexError(
        "Count har for mange Område-linjer for Produktet",
      );
    }
    const matchingItems = itemCandidates.filter(
      (item) => (item.countAreaId ?? null) === args.countAreaId,
    );
    if (matchingItems.length > 1) {
      throw new ConvexError(
        "Produktet findes flere gange i det valgte Område",
      );
    }
    const item = matchingItems[0] ?? null;

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
        countAreaId: args.countAreaId ?? undefined,
        productId: args.productId,
        unitId: args.unitId,
        quantity: args.quantity,
      });
    }
    if (args.countAreaId) {
      await markCountAreaProduct(ctx, {
        organizationId,
        locationId: location._id,
        countId: count._id,
        countAreaId: args.countAreaId,
        productId: args.productId,
      });
    }
    if (
      args.countAreaId &&
      count.completedCountAreaIds?.includes(args.countAreaId)
    ) {
      await ctx.db.patch("counts", count._id, {
        completedCountAreaIds: count.completedCountAreaIds.filter(
          (countAreaId) => countAreaId !== args.countAreaId,
        ),
      });
    }
    return null;
  },
});

export const startCountArea = mutation({
  args: {
    locationId: v.id("locations"),
    countAreaId: v.id("countAreas"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCounter(ctx, "count.register");
    const { organizationId, userIdentifier } = auth;
    requireLocationAccess(auth, args.locationId);
    const location = await requireLocation(
      ctx,
      organizationId,
      args.locationId,
    );
    await requireCountArea(
      ctx,
      organizationId,
      location._id,
      args.countAreaId,
    );
    const count = await getWritableCount(ctx, {
      organizationId,
      userIdentifier,
      location,
      create: true,
    });
    if (!count) throw new ConvexError("Count kunne ikke oprettes");

    const progress = await getCountAreaProgress(
      ctx,
      organizationId,
      count._id,
      args.countAreaId,
    );
    if (!progress) {
      await ctx.db.insert("countAreaProgress", {
        organizationId,
        locationId: location._id,
        countId: count._id,
        countAreaId: args.countAreaId,
        countedProductIds: [],
      });
    }
    return null;
  },
});

export const markCountAreaProductCounted = mutation({
  args: {
    locationId: v.id("locations"),
    countAreaId: v.id("countAreas"),
    productId: v.id("products"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCounter(ctx, "count.register");
    const { organizationId, userIdentifier } = auth;
    requireLocationAccess(auth, args.locationId);
    const location = await requireLocation(
      ctx,
      organizationId,
      args.locationId,
    );
    const [product, countArea] = await Promise.all([
      ctx.db.get("products", args.productId),
      requireCountArea(
        ctx,
        organizationId,
        location._id,
        args.countAreaId,
      ),
    ]);
    if (
      !product ||
      product.organizationId !== organizationId ||
      product.status !== "active"
    ) {
      throw new ConvexError("Produktet blev ikke fundet");
    }
    const areaProduct = await ctx.db
      .query("countAreaProducts")
      .withIndex(
        "by_organizationId_and_countAreaId_and_productId",
        (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("countAreaId", countArea._id)
            .eq("productId", product._id),
      )
      .unique();
    if (!areaProduct) {
      throw new ConvexError("Produktet bruges ikke i det valgte Område");
    }
    await requireLocationProduct(
      ctx,
      organizationId,
      location._id,
      product._id,
    );
    await requireCountedProduct(
      ctx,
      organizationId,
      location._id,
      product._id,
    );

    const count = await getWritableCount(ctx, {
      organizationId,
      userIdentifier,
      location,
      create: true,
    });
    if (!count) throw new ConvexError("Count kunne ikke oprettes");
    await markCountAreaProduct(ctx, {
      organizationId,
      locationId: location._id,
      countId: count._id,
      countAreaId: countArea._id,
      productId: product._id,
    });
    if (count.completedCountAreaIds?.includes(countArea._id)) {
      await ctx.db.patch("counts", count._id, {
        completedCountAreaIds: count.completedCountAreaIds.filter(
          (countAreaId) => countAreaId !== countArea._id,
        ),
      });
    }
    return null;
  },
});

export const completeCountArea = mutation({
  args: {
    locationId: v.id("locations"),
    countAreaId: v.id("countAreas"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCounter(ctx, "count.register");
    const { organizationId, userIdentifier } = auth;
    requireLocationAccess(auth, args.locationId);
    const location = await requireLocation(
      ctx,
      organizationId,
      args.locationId,
    );
    await requireCountArea(
      ctx,
      organizationId,
      location._id,
      args.countAreaId,
    );

    const count = await getWritableCount(ctx, {
      organizationId,
      userIdentifier,
      location,
      create: true,
    });
    if (!count) throw new ConvexError("Count kunne ikke oprettes");
    if (count.completedCountAreaIds?.includes(args.countAreaId)) {
      return null;
    }
    await ctx.db.patch("counts", count._id, {
      completedCountAreaIds: [
        ...(count.completedCountAreaIds ?? []),
        args.countAreaId,
      ],
    });
    return null;
  },
});

export const submitCount = mutation({
  args: {
    locationId: v.id("locations"),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCounter(ctx, "count.register");
    const { organizationId, userName } = auth;
    const reason = requireAuditReason(args.reason);
    requireLocationAccess(auth, args.locationId);
    const location = await requireLocation(
      ctx,
      organizationId,
      args.locationId,
    );
    const now = Date.now();
    const count = await getWritableCount(ctx, {
      organizationId,
      userIdentifier: auth.userIdentifier,
      location,
      create: false,
    });
    if (!count) {
      throw new ConvexError("Indtast mindst én mængde før registrering");
    }
    const items = await getCountItems(ctx, organizationId, count._id);
    if (items.length === 0) {
      throw new ConvexError("Indtast mindst én mængde før registrering");
    }

    const totals = new Map<Id<"products">, number>();
    const onlinePosConnected = await hasOnlinePosStockConnection(
      ctx,
      organizationId,
      args.locationId,
    );
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
          "En produkt-enhed er ændret. Opdatér Count og prøv igen",
        );
      }
      totals.set(item.productId, (totals.get(item.productId) ?? 0) + quantity);
    }
    for (const [productId, quantity] of totals) {
      await reconcileStock(ctx, {
        organizationId,
        locationId: args.locationId,
        countId: count._id,
        productId,
        quantity,
        now,
        onlinePosConnected,
      });
    }
    await ctx.db.patch("counts", count._id, {
      status: "submitted",
      submittedAt: now,
      submittedByName: userName,
    });
    await recordAudit(ctx, auth, {
      action: "count.reconciled",
      entityTable: "counts",
      entityId: count._id,
      locationId: args.locationId,
      summary: "Count registreret og lageret afstemt",
      reason,
    });
    return null;
  },
});

export const listAdHocCountLocations = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("locations"),
      name: v.string(),
      openedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const auth = await requirePermission(ctx, "count.manage");
    const { organizationId } = auth;
    const locations = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_LOCATIONS + 1);
    if (locations.length > MAX_LOCATIONS) {
      throw new ConvexError("Organisationen har for mange lokationer");
    }
    const accessible = locations.filter(
      (location) =>
        (!auth.isKioskAccount || auth.kioskLocationId === location._id) &&
        (auth.locationScope.all || auth.locationScope.ids.has(location._id)),
    );
    return await Promise.all(
      accessible.map(async (location) => {
        const count = await getOpenAdHocCount(
          ctx,
          organizationId,
          location._id,
        );
        return {
          id: location._id,
          name: location.name,
          openedAt: count?._creationTime ?? null,
        };
      }),
    );
  },
});

export const openAdHocCount = mutation({
  args: {
    locationId: v.id("locations"),
    continueFromLatest: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requirePermission(ctx, "count.manage");
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    const location = await requireLocation(
      ctx,
      organizationId,
      args.locationId,
    );
    const now = Date.now();
    const [{ window, count }, hasSubmitted] = await Promise.all([
      getCurrentCount(ctx, organizationId, location, now),
      hasSubmittedCount(ctx, organizationId, location._id),
    ]);
    if (count?.adHoc) {
      throw new ConvexError("Der er allerede en åben ekstra Count");
    }
    if (
      count?.status !== "submitted" &&
      (window.allowOutsideWindow ||
        !hasSubmitted ||
        windowIsOpen(now, window))
    ) {
      throw new ConvexError("Count-vinduet er allerede åbent");
    }
    const countId = await ctx.db.insert("counts", {
      organizationId,
      locationId: location._id,
      periodKey: `adhoc-${now}`,
      status: "open",
      adHoc: true,
      createdBy: auth.userIdentifier,
    });
    if (args.continueFromLatest) {
      const latest = await getLatestSubmittedCount(
        ctx,
        organizationId,
        location._id,
      );
      const items = latest
        ? await getCountItems(ctx, organizationId, latest._id)
        : [];
      const products = new Map<Id<"products">, boolean>();
      for (const item of items) {
        if (!products.has(item.productId)) {
          const product = await ctx.db.get("products", item.productId);
          products.set(item.productId, product?.status === "active");
        }
        if (
          !products.get(item.productId) ||
          (await toDefaultUnit(
            ctx,
            organizationId,
            item.productId,
            item.unitId,
            item.quantity,
          )) === null
        ) {
          continue;
        }
        await ctx.db.insert("countItems", {
          organizationId,
          countId,
          countAreaId: item.countAreaId,
          productId: item.productId,
          unitId: item.unitId,
          quantity: item.quantity,
        });
      }
      // Keep which Produkter were counted per Område, but let areas be completed again.
      const progress = latest
        ? await listCountAreaProgress(ctx, organizationId, latest._id)
        : [];
      for (const row of progress) {
        await ctx.db.insert("countAreaProgress", {
          organizationId,
          locationId: location._id,
          countId,
          countAreaId: row.countAreaId,
          countedProductIds: row.countedProductIds,
        });
      }
    }
    await recordAudit(ctx, auth, {
      action: "count.adHocOpened",
      entityTable: "counts",
      entityId: countId,
      locationId: location._id,
      summary: "Ekstra Count åbnet",
    });
    return null;
  },
});

export const cancelAdHocCount = mutation({
  args: { locationId: v.id("locations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requirePermission(ctx, "count.manage");
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    await requireLocation(ctx, organizationId, args.locationId);
    const count = await getOpenAdHocCount(
      ctx,
      organizationId,
      args.locationId,
    );
    if (!count) throw new ConvexError("Der er ingen åben ekstra Count");
    const [items, progress] = await Promise.all([
      getCountItems(ctx, organizationId, count._id),
      listCountAreaProgress(ctx, organizationId, count._id),
    ]);
    for (const item of items) await ctx.db.delete("countItems", item._id);
    for (const row of progress) {
      await ctx.db.delete("countAreaProgress", row._id);
    }
    await ctx.db.delete("counts", count._id);
    await recordAudit(ctx, auth, {
      action: "count.adHocCancelled",
      entityTable: "counts",
      entityId: count._id,
      locationId: args.locationId,
      summary: "Ekstra Count annulleret",
    });
    return null;
  },
});

export const addProductToLatestCount = mutation({
  args: {
    locationId: v.id("locations"),
    productId: v.id("products"),
    quantities: v.array(
      v.object({ unitId: v.id("units"), quantity: v.number() }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requirePermission(ctx, "count.manage");
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    if (
      args.quantities.length === 0 ||
      args.quantities.length > MAX_PRODUCT_UNITS ||
      new Set(args.quantities.map((row) => row.unitId)).size !==
        args.quantities.length
    ) {
      throw new ConvexError("Angiv en mængde");
    }
    if (
      args.quantities.some(
        (row) => !Number.isFinite(row.quantity) || row.quantity < 0,
      )
    ) {
      throw new ConvexError("Mængden skal være nul eller større");
    }
    const location = await requireLocation(
      ctx,
      organizationId,
      args.locationId,
    );
    const product = await ctx.db.get("products", args.productId);
    if (
      !product ||
      product.organizationId !== organizationId ||
      product.status !== "active"
    ) {
      throw new ConvexError("Produktet blev ikke fundet");
    }
    await requireLocationProduct(
      ctx,
      organizationId,
      location._id,
      product._id,
    );
    await requireCountedProduct(
      ctx,
      organizationId,
      location._id,
      product._id,
    );
    let quantity = 0;
    for (const row of args.quantities) {
      const converted = await toDefaultUnit(
        ctx,
        organizationId,
        product._id,
        row.unitId,
        row.quantity,
      );
      if (converted === null) throw new ConvexError("Enheden blev ikke fundet");
      quantity += converted;
    }
    const count = await getLatestSubmittedCount(
      ctx,
      organizationId,
      location._id,
    );
    if (!count) {
      throw new ConvexError("Lokationen har ingen registreret Count");
    }
    const counted = await ctx.db
      .query("countItems")
      .withIndex(
        "by_organizationId_and_countId_and_productId_and_unitId",
        (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("countId", count._id)
            .eq("productId", product._id),
      )
      .first();
    if (counted) {
      throw new ConvexError("Produktet er allerede talt i den seneste Count");
    }

    for (const row of args.quantities) {
      await ctx.db.insert("countItems", {
        organizationId,
        countId: count._id,
        productId: product._id,
        unitId: row.unitId,
        quantity: row.quantity,
      });
    }
    await reconcileStock(ctx, {
      organizationId,
      locationId: location._id,
      countId: count._id,
      productId: product._id,
      quantity,
      now: Date.now(),
      onlinePosConnected: await hasOnlinePosStockConnection(
        ctx,
        organizationId,
        location._id,
      ),
    });
    await recordAudit(ctx, auth, {
      action: "count.productAdded",
      entityTable: "counts",
      entityId: count._id,
      locationId: location._id,
      summary: `${product.name} tilføjet til seneste Count`,
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
    const auth = await requirePermission(ctx, "count.export");
    const count = await ctx.db.get("counts", args.countId);
    if (
      !count ||
      count.organizationId !== auth.organizationId ||
      count.status !== "submitted" ||
      !count.submittedAt
    ) {
      throw new ConvexError("Den registrerede Count blev ikke fundet");
    }
    requireLocationAccess(auth, count.locationId);
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
      .take(MAX_COUNT_ITEMS + 1);
    if (rows.length > MAX_COUNT_ITEMS) {
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
        defaultUnitId: row.defaultUnitId,
        expectedQuantity: row.expectedQuantity,
        countedQuantity: row.countedQuantity,
        expectedSinceAt: row.expectedSinceAt,
        onlinePosStockAccounting: row.onlinePosStockAccounting,
        onlinePosAppliedSalesQuantity: row.onlinePosAppliedSalesQuantity,
      })),
    };
  },
});

export const listLocationStockPage = query({
  args: { locationId: v.id("locations"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(locationStockValidator),
  handler: async (ctx, args) => {
    const auth = await requireStockViewer(ctx, "count.stock");
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    await requireLocation(ctx, organizationId, args.locationId);
    const access = await getLocationProductAccess(ctx, organizationId, args.locationId);
    const result = await ctx.db
      .query("products")
      .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId).eq("status", "active"),
      )
      .paginate(catalogPaginationOptions(args.paginationOpts, 25));
    const stocks = await Promise.all(result.page.map((product) =>
      ctx.db
        .query("locationStock")
        .withIndex("by_organizationId_and_locationId_and_productId", (q) =>
          q.eq("organizationId", organizationId)
            .eq("locationId", args.locationId)
            .eq("productId", product._id),
        )
        .unique(),
    ));
    const stockByProductId = new Map(stocks.flatMap((stock) =>
      stock ? [[stock.productId, stock] as const] : [],
    ));
    const products = result.page.filter((product) =>
      locationHasProduct(access, product._id) ||
      (stockByProductId.get(product._id)?.quantity ?? 0) > 0,
    );
    return {
      ...result,
      page: await hydrateLocationStock(ctx, organizationId, products, stockByProductId),
    };
  },
});

export const listLocationStock = query({
  args: { locationId: v.id("locations") },
  returns: v.array(locationStockValidator),
  handler: async (ctx, args) => {
    const auth = await requireStockViewer(ctx, "count.stock");
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    await requireLocation(ctx, organizationId, args.locationId);
    const [allProducts, productAccess, stockRows] = await Promise.all([
      activeProducts(ctx, organizationId),
      getLocationProductAccess(ctx, organizationId, args.locationId),
      ctx.db
        .query("locationStock")
        .withIndex(
          "by_organizationId_and_locationId_and_productId",
          (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("locationId", args.locationId),
        )
        .take(MAX_LOCATION_STOCK_ROWS + 1),
    ]);
    if (stockRows.length > MAX_LOCATION_STOCK_ROWS) {
      throw new ConvexError("Lokationen har for mange lagerlinjer");
    }
    const stockByProductId = new Map<
      Id<"products">,
      Doc<"locationStock">
    >();
    for (const stock of stockRows) {
      if (stockByProductId.has(stock.productId)) {
        throw new ConvexError("Produktets lager findes flere gange");
      }
      stockByProductId.set(stock.productId, stock);
    }
    const products = allProducts.filter(
      (product) =>
        locationHasProduct(productAccess, product._id) ||
        (stockByProductId.get(product._id)?.quantity ?? 0) > 0,
    );
    return await hydrateLocationStock(ctx, organizationId, products, stockByProductId);
  },
});

async function hydrateLocationStock(
  ctx: QueryCtx,
  organizationId: string,
  products: Doc<"products">[],
  stockByProductId: ReadonlyMap<Id<"products">, Doc<"locationStock">>,
) {
  const categoryCache = new Map<
    Id<"categories">,
    Promise<Doc<"categories"> | null>
  >();
  const unitCache = new Map<
    Id<"units">,
    Promise<Doc<"units"> | null>
  >();
  const loadCategory = (categoryId: Id<"categories">) => {
    const cached = categoryCache.get(categoryId);
    if (cached) return cached;
    const pending = ctx.db.get("categories", categoryId);
    categoryCache.set(categoryId, pending);
    return pending;
  };
  const loadUnit = (unitId: Id<"units">) => {
    const cached = unitCache.get(unitId);
    if (cached) return cached;
    const pending = ctx.db.get("units", unitId);
    unitCache.set(unitId, pending);
    return pending;
  };

  return await Promise.all(
    products.map(async (product) => {
      const stock = stockByProductId.get(product._id);
      const [category, defaultUnit, imageUrl, productUnits] =
        await Promise.all([
          loadCategory(product.categoryId),
          loadUnit(product.defaultUnitId),
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
        productUnits.map((row) => loadUnit(row.unitId)),
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
                  id: unit._id,
                  name: unit.name,
                  pluralName: unit.pluralName,
                  factorToDefault: row.factorToDefault,
                },
              ]
            : [];
        }),
        lastCountedAt: stock?.lastCountedAt ?? null,
      };
    }),
  );
}
