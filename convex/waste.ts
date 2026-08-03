import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { canViewWasteReports } from "../lib/auth-permissions";
import {
  requireOrganizationAdmin,
  requireWasteRegistrar,
  requireWasteReporter,
} from "./lib/auth";
import { requireOtherFeaturesUnlocked } from "./lib/countLock";
import {
  DEFAULT_BAD_DELIVERY_EMAIL_BODY,
  DEFAULT_BAD_DELIVERY_EMAIL_SUBJECT,
  validateBadDeliveryEmailBody,
  validateBadDeliveryEmailSubject,
  validateBadDeliveryRecipients,
} from "./lib/badDeliverySettings";
import { addStock, normalizeStock } from "./lib/stock";

const MAX_PRODUCTS = 500;
const MAX_CHILD_ROWS = 200;
const MAX_REBUILD_ROWS = 1_000;
const MAX_QUANTITY = 1_000_000;
const UNDO_WINDOW_MS = 30_000;
const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;
const DAYS_90_MS = 90 * 24 * 60 * 60 * 1000;

const popularityPeriodValidator = v.union(
  v.literal("allTime"),
  v.literal("30Days"),
  v.literal("90Days"),
);
const historyScopeValidator = v.union(
  v.literal("location"),
  v.literal("organization"),
);
const sourceValidator = v.union(v.literal("shortcut"), v.literal("custom"));
const statusValidator = v.union(v.literal("active"), v.literal("voided"));
const shortcutValidator = v.object({
  unitId: v.id("units"),
  quantity: v.number(),
});
const viewSettingsValidator = v.object({
  inactivitySeconds: v.number(),
  popularityPeriod: popularityPeriodValidator,
  historyScope: historyScopeValidator,
});
const settingsValidator = viewSettingsValidator.extend({
  badDeliveryDeductFromStock: v.boolean(),
  badDeliveryShowStockChoice: v.boolean(),
  badDeliveryTo: v.array(v.string()),
  badDeliveryCc: v.array(v.string()),
  badDeliveryBcc: v.array(v.string()),
  badDeliveryEmailSubject: v.string(),
  badDeliveryEmailBody: v.string(),
});
const reportRowValidator = v.object({
  id: v.id("wasteRegistrations"),
  locationId: v.id("locations"),
  locationName: v.string(),
  productId: v.id("products"),
  productName: v.string(),
  unitId: v.id("units"),
  unitName: v.string(),
  quantity: v.number(),
  defaultUnitId: v.id("units"),
  defaultUnitName: v.string(),
  defaultQuantity: v.number(),
  registeredAt: v.number(),
  registeredByName: v.string(),
  source: sourceValidator,
  status: statusValidator,
  voidedAt: v.union(v.number(), v.null()),
  voidedByName: v.union(v.string(), v.null()),
});

type WasteContext = QueryCtx | MutationCtx;
type PopularityPeriod = "allTime" | "30Days" | "90Days";

function normalizeQuantity(quantity: number) {
  return normalizeStock(quantity);
}

function quantityKey(quantity: number) {
  return String(normalizeQuantity(quantity));
}

function requireQuantity(quantity: number) {
  const normalized = normalizeQuantity(quantity);
  if (!Number.isFinite(quantity) || normalized <= 0 || normalized > MAX_QUANTITY) {
    throw new ConvexError(
      `Mængden skal være større end nul og højst ${MAX_QUANTITY}`,
    );
  }
  return normalized;
}

function validateRange(startAt: number, endAt: number) {
  if (
    !Number.isFinite(startAt) ||
    !Number.isFinite(endAt) ||
    startAt <= 0 ||
    endAt <= 0 ||
    startAt > endAt
  ) {
    throw new ConvexError("Perioden er ugyldig");
  }
}

async function requireLocation(
  ctx: WasteContext,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const location = await ctx.db.get("locations", locationId);
  if (!location || location.organizationId !== organizationId) {
    throw new ConvexError("Locationen blev ikke fundet");
  }
  return location;
}

async function requireActiveProduct(
  ctx: WasteContext,
  organizationId: string,
  productId: Id<"products">,
) {
  const product = await ctx.db.get("products", productId);
  if (
    !product ||
    product.organizationId !== organizationId ||
    product.status !== "active"
  ) {
    throw new ConvexError("Produktet blev ikke fundet");
  }
  return product;
}

async function settingsFor(ctx: WasteContext, organizationId: string) {
  const settings = await ctx.db
    .query("wasteSettings")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .unique();
  return {
    inactivitySeconds: settings?.inactivitySeconds ?? 30,
    popularityPeriod: settings?.popularityPeriod ?? ("allTime" as const),
    historyScope: settings?.historyScope ?? ("location" as const),
    badDeliveryDeductFromStock:
      settings?.badDeliveryDeductFromStock ?? true,
    badDeliveryShowStockChoice:
      settings?.badDeliveryShowStockChoice ?? true,
    badDeliveryTo: settings?.badDeliveryTo ?? [],
    badDeliveryCc: settings?.badDeliveryCc ?? [],
    badDeliveryBcc: settings?.badDeliveryBcc ?? [],
    badDeliveryEmailSubject:
      settings?.badDeliveryEmailSubject ?? DEFAULT_BAD_DELIVERY_EMAIL_SUBJECT,
    badDeliveryEmailBody:
      settings?.badDeliveryEmailBody ?? DEFAULT_BAD_DELIVERY_EMAIL_BODY,
  };
}

async function productStats(
  ctx: WasteContext,
  registration: Pick<
    Doc<"wasteRegistrations">,
    "organizationId" | "locationId" | "productId"
  >,
) {
  return await ctx.db
    .query("wasteProductStats")
    .withIndex("by_org_location_product", (q) =>
      q
        .eq("organizationId", registration.organizationId)
        .eq("locationId", registration.locationId)
        .eq("productId", registration.productId),
    )
    .unique();
}

async function amountStats(
  ctx: WasteContext,
  registration: Pick<
    Doc<"wasteRegistrations">,
    | "organizationId"
    | "locationId"
    | "productId"
    | "unitId"
    | "quantityKey"
  >,
) {
  return await ctx.db
    .query("wasteAmountStats")
    .withIndex(
      "by_org_location_product_unit_qty",
      (q) =>
        q
          .eq("organizationId", registration.organizationId)
          .eq("locationId", registration.locationId)
          .eq("productId", registration.productId)
          .eq("unitId", registration.unitId)
          .eq("quantityKey", registration.quantityKey),
    )
    .unique();
}

async function organizationProductStats(
  ctx: WasteContext,
  organizationId: string,
  productId: Id<"products">,
) {
  return await ctx.db
    .query("wasteOrganizationProductStats")
    .withIndex("by_org_product", (q) =>
      q.eq("organizationId", organizationId).eq("productId", productId),
    )
    .unique();
}

async function organizationAmountStats(
  ctx: WasteContext,
  registration: Pick<
    Doc<"wasteRegistrations">,
    "organizationId" | "productId" | "unitId" | "quantityKey"
  >,
) {
  return await ctx.db
    .query("wasteOrganizationAmountStats")
    .withIndex("by_org_product_unit_qty", (q) =>
      q
        .eq("organizationId", registration.organizationId)
        .eq("productId", registration.productId)
        .eq("unitId", registration.unitId)
        .eq("quantityKey", registration.quantityKey),
    )
    .unique();
}

type AmountStat = {
  unitId: Id<"units">;
  quantity: number;
  allTimeCount: number;
  count30Days: number;
  count90Days: number;
  lastRegisteredAt: number;
};

function countForPeriod(row: AmountStat, period: PopularityPeriod) {
  return period === "30Days"
    ? row.count30Days
    : period === "90Days"
      ? row.count90Days
      : row.allTimeCount;
}

function selectTopAmounts(
  rows: AmountStat[],
  period: PopularityPeriod,
  unitNames: Map<Id<"units">, string>,
) {
  return rows
    .filter((row) => countForPeriod(row, period) > 0)
    .sort(
      (a, b) =>
        countForPeriod(b, period) - countForPeriod(a, period) ||
        b.lastRegisteredAt - a.lastRegisteredAt ||
        a.quantity - b.quantity ||
        (unitNames.get(a.unitId) ?? "").localeCompare(
          unitNames.get(b.unitId) ?? "",
          "da",
        ),
    )
    .slice(0, 2)
    .map((row) => ({ unitId: row.unitId, quantity: row.quantity }));
}

async function topAmounts(
  ctx: MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
  productId: Id<"products">,
  period: PopularityPeriod,
) {
  const rows =
    period === "30Days"
      ? await ctx.db
          .query("wasteAmountStats")
          .withIndex(
            "by_org_location_product_30_count",
            (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("locationId", locationId)
                .eq("productId", productId)
                .gt("count30Days", 0),
          )
          .order("desc")
          .take(MAX_CHILD_ROWS)
      : period === "90Days"
        ? await ctx.db
            .query("wasteAmountStats")
            .withIndex(
              "by_org_location_product_90_count",
              (q) =>
                q
                  .eq("organizationId", organizationId)
                  .eq("locationId", locationId)
                  .eq("productId", productId)
                  .gt("count90Days", 0),
            )
            .order("desc")
            .take(MAX_CHILD_ROWS)
        : await ctx.db
            .query("wasteAmountStats")
            .withIndex(
              "by_org_location_product_all_count",
              (q) =>
                q
                  .eq("organizationId", organizationId)
                  .eq("locationId", locationId)
                  .eq("productId", productId)
                  .gt("allTimeCount", 0),
            )
            .order("desc")
            .take(MAX_CHILD_ROWS);
  const unitNames = new Map<Id<"units">, string>();
  await Promise.all(
    [...new Set(rows.map((row) => row.unitId))].map(async (unitId) => {
      const unit = await ctx.db.get("units", unitId);
      unitNames.set(unitId, unit?.name ?? "");
    }),
  );
  return selectTopAmounts(rows, period, unitNames);
}

async function topOrganizationAmounts(
  ctx: MutationCtx,
  organizationId: string,
  productId: Id<"products">,
  period: PopularityPeriod,
) {
  const rows =
    period === "30Days"
      ? await ctx.db
          .query("wasteOrganizationAmountStats")
          .withIndex("by_org_product_30_count", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("productId", productId)
              .gt("count30Days", 0),
          )
          .order("desc")
          .take(MAX_CHILD_ROWS)
      : period === "90Days"
        ? await ctx.db
            .query("wasteOrganizationAmountStats")
            .withIndex("by_org_product_90_count", (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("productId", productId)
                .gt("count90Days", 0),
            )
            .order("desc")
            .take(MAX_CHILD_ROWS)
        : await ctx.db
            .query("wasteOrganizationAmountStats")
            .withIndex("by_org_product_all_count", (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("productId", productId)
                .gt("allTimeCount", 0),
            )
            .order("desc")
            .take(MAX_CHILD_ROWS);
  const unitNames = new Map<Id<"units">, string>();
  await Promise.all(
    [...new Set(rows.map((row) => row.unitId))].map(async (unitId) => {
      const unit = await ctx.db.get("units", unitId);
      unitNames.set(unitId, unit?.name ?? "");
    }),
  );
  return selectTopAmounts(rows, period, unitNames);
}

async function refreshTopAmounts(
  ctx: MutationCtx,
  registration: Pick<
    Doc<"wasteRegistrations">,
    "organizationId" | "locationId" | "productId"
  >,
  periods: PopularityPeriod[],
) {
  const stats = await productStats(ctx, registration);
  if (!stats) return;
  const patch: Partial<Doc<"wasteProductStats">> = {};
  for (const period of periods) {
    const top = await topAmounts(
      ctx,
      registration.organizationId,
      registration.locationId,
      registration.productId,
      period,
    );
    if (period === "allTime") patch.topAllTime = top;
    if (period === "30Days") patch.top30Days = top;
    if (period === "90Days") patch.top90Days = top;
  }
  await ctx.db.patch("wasteProductStats", stats._id, patch);
}

async function refreshOrganizationTopAmounts(
  ctx: MutationCtx,
  registration: Pick<
    Doc<"wasteRegistrations">,
    "organizationId" | "productId"
  >,
  periods: PopularityPeriod[],
) {
  const stats = await organizationProductStats(
    ctx,
    registration.organizationId,
    registration.productId,
  );
  if (!stats) return;
  const patch: Partial<Doc<"wasteOrganizationProductStats">> = {};
  for (const period of periods) {
    const top = await topOrganizationAmounts(
      ctx,
      registration.organizationId,
      registration.productId,
      period,
    );
    if (period === "allTime") patch.topAllTime = top;
    if (period === "30Days") patch.top30Days = top;
    if (period === "90Days") patch.top90Days = top;
  }
  await ctx.db.patch("wasteOrganizationProductStats", stats._id, patch);
}

async function addRegistrationStats(
  ctx: MutationCtx,
  registration: Doc<"wasteRegistrations">,
) {
  const [
    currentProduct,
    currentAmount,
    currentOrganizationProduct,
    currentOrganizationAmount,
  ] = await Promise.all([
    productStats(ctx, registration),
    amountStats(ctx, registration),
    organizationProductStats(
      ctx,
      registration.organizationId,
      registration.productId,
    ),
    organizationAmountStats(ctx, registration),
  ]);
  if (currentProduct) {
    await ctx.db.patch("wasteProductStats", currentProduct._id, {
      allTimeCount: currentProduct.allTimeCount + 1,
      count30Days: currentProduct.count30Days + 1,
      count90Days: currentProduct.count90Days + 1,
      lastRegisteredAt: registration.registeredAt,
    });
  } else {
    await ctx.db.insert("wasteProductStats", {
      organizationId: registration.organizationId,
      locationId: registration.locationId,
      productId: registration.productId,
      allTimeCount: 1,
      count30Days: 1,
      count90Days: 1,
      lastRegisteredAt: registration.registeredAt,
      topAllTime: [],
      top30Days: [],
      top90Days: [],
    });
  }
  if (currentAmount) {
    await ctx.db.patch("wasteAmountStats", currentAmount._id, {
      allTimeCount: currentAmount.allTimeCount + 1,
      count30Days: currentAmount.count30Days + 1,
      count90Days: currentAmount.count90Days + 1,
      lastRegisteredAt: registration.registeredAt,
    });
  } else {
    await ctx.db.insert("wasteAmountStats", {
      organizationId: registration.organizationId,
      locationId: registration.locationId,
      productId: registration.productId,
      unitId: registration.unitId,
      quantity: registration.quantity,
      quantityKey: registration.quantityKey,
      allTimeCount: 1,
      count30Days: 1,
      count90Days: 1,
      lastRegisteredAt: registration.registeredAt,
    });
  }
  if (currentOrganizationProduct) {
    await ctx.db.patch(
      "wasteOrganizationProductStats",
      currentOrganizationProduct._id,
      {
        allTimeCount: currentOrganizationProduct.allTimeCount + 1,
        count30Days: currentOrganizationProduct.count30Days + 1,
        count90Days: currentOrganizationProduct.count90Days + 1,
        lastRegisteredAt: registration.registeredAt,
      },
    );
  } else {
    await ctx.db.insert("wasteOrganizationProductStats", {
      organizationId: registration.organizationId,
      productId: registration.productId,
      allTimeCount: 1,
      count30Days: 1,
      count90Days: 1,
      lastRegisteredAt: registration.registeredAt,
      topAllTime: [],
      top30Days: [],
      top90Days: [],
    });
  }
  if (currentOrganizationAmount) {
    await ctx.db.patch(
      "wasteOrganizationAmountStats",
      currentOrganizationAmount._id,
      {
        allTimeCount: currentOrganizationAmount.allTimeCount + 1,
        count30Days: currentOrganizationAmount.count30Days + 1,
        count90Days: currentOrganizationAmount.count90Days + 1,
        lastRegisteredAt: registration.registeredAt,
      },
    );
  } else {
    await ctx.db.insert("wasteOrganizationAmountStats", {
      organizationId: registration.organizationId,
      productId: registration.productId,
      unitId: registration.unitId,
      quantity: registration.quantity,
      quantityKey: registration.quantityKey,
      allTimeCount: 1,
      count30Days: 1,
      count90Days: 1,
      lastRegisteredAt: registration.registeredAt,
    });
  }
  await Promise.all([
    refreshTopAmounts(ctx, registration, ["allTime", "30Days", "90Days"]),
    refreshOrganizationTopAmounts(ctx, registration, [
      "allTime",
      "30Days",
      "90Days",
    ]),
  ]);
}

async function latestActiveRegistration(
  ctx: MutationCtx,
  registration: Doc<"wasteRegistrations">,
  forAmount: boolean,
) {
  return forAmount
    ? await ctx.db
        .query("wasteRegistrations")
        .withIndex(
          "by_org_location_product_unit_qty_status_time",
          (q) =>
            q
              .eq("organizationId", registration.organizationId)
              .eq("locationId", registration.locationId)
              .eq("productId", registration.productId)
              .eq("unitId", registration.unitId)
              .eq("quantityKey", registration.quantityKey)
              .eq("status", "active"),
        )
        .order("desc")
        .first()
    : await ctx.db
        .query("wasteRegistrations")
        .withIndex(
          "by_org_location_product_status_time",
          (q) =>
            q
              .eq("organizationId", registration.organizationId)
              .eq("locationId", registration.locationId)
              .eq("productId", registration.productId)
              .eq("status", "active"),
        )
        .order("desc")
        .first();
}

async function latestActiveOrganizationRegistration(
  ctx: MutationCtx,
  registration: Doc<"wasteRegistrations">,
  forAmount: boolean,
) {
  return forAmount
    ? await ctx.db
        .query("wasteRegistrations")
        .withIndex("by_org_product_unit_qty_status_time", (q) =>
          q
            .eq("organizationId", registration.organizationId)
            .eq("productId", registration.productId)
            .eq("unitId", registration.unitId)
            .eq("quantityKey", registration.quantityKey)
            .eq("status", "active"),
        )
        .order("desc")
        .first()
    : await ctx.db
        .query("wasteRegistrations")
        .withIndex("by_org_product_status_time", (q) =>
          q
            .eq("organizationId", registration.organizationId)
            .eq("productId", registration.productId)
            .eq("status", "active"),
        )
        .order("desc")
        .first();
}

async function decrementStats(
  ctx: MutationCtx,
  registration: Doc<"wasteRegistrations">,
  periods: PopularityPeriod[],
  refreshLatest: boolean,
) {
  const [
    currentProduct,
    currentAmount,
    currentOrganizationProduct,
    currentOrganizationAmount,
    latestProduct,
    latestAmount,
    latestOrganizationProduct,
    latestOrganizationAmount,
  ] = await Promise.all([
    productStats(ctx, registration),
    amountStats(ctx, registration),
    organizationProductStats(
      ctx,
      registration.organizationId,
      registration.productId,
    ),
    organizationAmountStats(ctx, registration),
    refreshLatest ? latestActiveRegistration(ctx, registration, false) : null,
    refreshLatest ? latestActiveRegistration(ctx, registration, true) : null,
    refreshLatest
      ? latestActiveOrganizationRegistration(ctx, registration, false)
      : null,
    refreshLatest
      ? latestActiveOrganizationRegistration(ctx, registration, true)
      : null,
  ]);
  if (currentProduct) {
    await ctx.db.patch("wasteProductStats", currentProduct._id, {
      allTimeCount: periods.includes("allTime")
        ? Math.max(0, currentProduct.allTimeCount - 1)
        : currentProduct.allTimeCount,
      count30Days: periods.includes("30Days")
        ? Math.max(0, currentProduct.count30Days - 1)
        : currentProduct.count30Days,
      count90Days: periods.includes("90Days")
        ? Math.max(0, currentProduct.count90Days - 1)
        : currentProduct.count90Days,
      lastRegisteredAt: refreshLatest
        ? (latestProduct?.registeredAt ?? 0)
        : currentProduct.lastRegisteredAt,
    });
  }
  if (currentAmount) {
    await ctx.db.patch("wasteAmountStats", currentAmount._id, {
      allTimeCount: periods.includes("allTime")
        ? Math.max(0, currentAmount.allTimeCount - 1)
        : currentAmount.allTimeCount,
      count30Days: periods.includes("30Days")
        ? Math.max(0, currentAmount.count30Days - 1)
        : currentAmount.count30Days,
      count90Days: periods.includes("90Days")
        ? Math.max(0, currentAmount.count90Days - 1)
        : currentAmount.count90Days,
      lastRegisteredAt: refreshLatest
        ? (latestAmount?.registeredAt ?? 0)
        : currentAmount.lastRegisteredAt,
    });
  }
  if (currentOrganizationProduct) {
    await ctx.db.patch(
      "wasteOrganizationProductStats",
      currentOrganizationProduct._id,
      {
        allTimeCount: periods.includes("allTime")
          ? Math.max(0, currentOrganizationProduct.allTimeCount - 1)
          : currentOrganizationProduct.allTimeCount,
        count30Days: periods.includes("30Days")
          ? Math.max(0, currentOrganizationProduct.count30Days - 1)
          : currentOrganizationProduct.count30Days,
        count90Days: periods.includes("90Days")
          ? Math.max(0, currentOrganizationProduct.count90Days - 1)
          : currentOrganizationProduct.count90Days,
        lastRegisteredAt: refreshLatest
          ? (latestOrganizationProduct?.registeredAt ?? 0)
          : currentOrganizationProduct.lastRegisteredAt,
      },
    );
  }
  if (currentOrganizationAmount) {
    await ctx.db.patch(
      "wasteOrganizationAmountStats",
      currentOrganizationAmount._id,
      {
        allTimeCount: periods.includes("allTime")
          ? Math.max(0, currentOrganizationAmount.allTimeCount - 1)
          : currentOrganizationAmount.allTimeCount,
        count30Days: periods.includes("30Days")
          ? Math.max(0, currentOrganizationAmount.count30Days - 1)
          : currentOrganizationAmount.count30Days,
        count90Days: periods.includes("90Days")
          ? Math.max(0, currentOrganizationAmount.count90Days - 1)
          : currentOrganizationAmount.count90Days,
        lastRegisteredAt: refreshLatest
          ? (latestOrganizationAmount?.registeredAt ?? 0)
          : currentOrganizationAmount.lastRegisteredAt,
      },
    );
  }
  await Promise.all([
    refreshTopAmounts(ctx, registration, periods),
    refreshOrganizationTopAmounts(ctx, registration, periods),
  ]);
}

function reportRow(registration: Doc<"wasteRegistrations">) {
  return {
    id: registration._id,
    locationId: registration.locationId,
    locationName: registration.locationName,
    productId: registration.productId,
    productName: registration.productName,
    unitId: registration.unitId,
    unitName: registration.unitName,
    quantity: registration.quantity,
    defaultUnitId: registration.defaultUnitId,
    defaultUnitName: registration.defaultUnitName,
    defaultQuantity: registration.defaultQuantity,
    registeredAt: registration.registeredAt,
    registeredByName: registration.registeredByName,
    source: registration.source,
    status: registration.status,
    voidedAt: registration.voidedAt ?? null,
    voidedByName: registration.voidedByName ?? null,
  };
}

export const getSettings = query({
  args: {},
  returns: settingsValidator,
  handler: async (ctx) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    return await settingsFor(ctx, organizationId);
  },
});

export const setSettings = mutation({
  args: settingsValidator.fields,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    if (
      !Number.isInteger(args.inactivitySeconds) ||
      args.inactivitySeconds < 5 ||
      args.inactivitySeconds > 3600
    ) {
      throw new ConvexError("Inaktivitet skal være mellem 5 og 3600 sekunder");
    }
    const recipients = validateBadDeliveryRecipients({
      to: args.badDeliveryTo,
      cc: args.badDeliveryCc,
      bcc: args.badDeliveryBcc,
    });
    const next = {
      ...args,
      badDeliveryEmailSubject: validateBadDeliveryEmailSubject(
        args.badDeliveryEmailSubject,
      ),
      badDeliveryEmailBody: validateBadDeliveryEmailBody(
        args.badDeliveryEmailBody,
      ),
      badDeliveryTo: recipients.to,
      badDeliveryCc: recipients.cc,
      badDeliveryBcc: recipients.bcc,
    };
    const current = await ctx.db
      .query("wasteSettings")
      .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
      .unique();
    if (current) await ctx.db.patch("wasteSettings", current._id, next);
    else await ctx.db.insert("wasteSettings", { organizationId, ...next });
    if (
      args.historyScope === "organization" &&
      (current?.historyScope ?? "location") !== "organization"
    ) {
      const products = await ctx.db
        .query("products")
        .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
          q.eq("organizationId", organizationId).eq("status", "active"),
        )
        .take(MAX_PRODUCTS);
      await Promise.all(
        products.map((product) =>
          ctx.scheduler.runAfter(
            0,
            internal.waste.rebuildOrganizationStatsForProduct,
            { organizationId, productId: product._id },
          ),
        ),
      );
    }
    return null;
  },
});

export const listCatalog = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("products"),
      name: v.string(),
      category: v.object({ id: v.id("categories"), name: v.string() }),
      imageUrl: v.union(v.string(), v.null()),
      defaultUnitId: v.id("units"),
      units: v.array(
        v.object({
          id: v.id("units"),
          name: v.string(),
          factorToDefault: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const { organizationId } = await requireWasteRegistrar(ctx);
    const products = await ctx.db
      .query("products")
      .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId).eq("status", "active"),
      )
      .take(MAX_PRODUCTS);
    return await Promise.all(
      products.map(async (product) => {
        const [category, productUnits, imageUrl] = await Promise.all([
          ctx.db.get("categories", product.categoryId),
          ctx.db
            .query("productUnits")
            .withIndex("by_organizationId_and_productId", (q) =>
              q.eq("organizationId", organizationId).eq("productId", product._id),
            )
            .take(MAX_CHILD_ROWS),
          product.imageStorageId
            ? ctx.storage.getUrl(product.imageStorageId)
            : Promise.resolve(null),
        ]);
        if (!category || category.organizationId !== organizationId) {
          throw new ConvexError("Produktets kategori blev ikke fundet");
        }
        const units = await Promise.all(
          productUnits.map(async (row) => {
            const unit = await ctx.db.get("units", row.unitId);
            return unit?.organizationId === organizationId
              ? {
                  id: unit._id,
                  name: unit.name,
                  factorToDefault: row.factorToDefault,
                }
              : null;
          }),
        );
        return {
          id: product._id,
          name: product.name,
          category: { id: category._id, name: category.name },
          imageUrl,
          defaultUnitId: product.defaultUnitId,
          units: units.filter((unit) => unit !== null),
        };
      }),
    );
  },
});

export const getViewState = query({
  args: { locationId: v.id("locations") },
  returns: v.object({
    settings: viewSettingsValidator,
    rankings: v.array(
      v.object({
        productId: v.id("products"),
        count: v.number(),
        lastRegisteredAt: v.number(),
        learnedShortcuts: v.array(shortcutValidator),
      }),
    ),
    configs: v.array(
      v.object({
        productId: v.id("products"),
        pinnedAt: v.union(v.number(), v.null()),
        shortcutOverrides: v.union(v.array(shortcutValidator), v.null()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const { organizationId } = await requireWasteRegistrar(ctx);
    await requireLocation(ctx, organizationId, args.locationId);
    const settings = await settingsFor(ctx, organizationId);
    const stats = settings.historyScope === "organization"
      ? settings.popularityPeriod === "30Days"
        ? await ctx.db
            .query("wasteOrganizationProductStats")
            .withIndex("by_org_30_count", (q) =>
              q.eq("organizationId", organizationId),
            )
            .order("desc")
            .take(MAX_PRODUCTS)
        : settings.popularityPeriod === "90Days"
          ? await ctx.db
              .query("wasteOrganizationProductStats")
              .withIndex("by_org_90_count", (q) =>
                q.eq("organizationId", organizationId),
              )
              .order("desc")
              .take(MAX_PRODUCTS)
          : await ctx.db
              .query("wasteOrganizationProductStats")
              .withIndex("by_org_all_count", (q) =>
                q.eq("organizationId", organizationId),
              )
              .order("desc")
              .take(MAX_PRODUCTS)
      : settings.popularityPeriod === "30Days"
        ? await ctx.db
            .query("wasteProductStats")
            .withIndex("by_org_location_30_count", (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("locationId", args.locationId),
            )
            .order("desc")
            .take(MAX_PRODUCTS)
        : settings.popularityPeriod === "90Days"
          ? await ctx.db
              .query("wasteProductStats")
              .withIndex("by_org_location_90_count", (q) =>
                q
                  .eq("organizationId", organizationId)
                  .eq("locationId", args.locationId),
              )
              .order("desc")
              .take(MAX_PRODUCTS)
          : await ctx.db
              .query("wasteProductStats")
              .withIndex("by_org_location_all_count", (q) =>
                q
                  .eq("organizationId", organizationId)
                  .eq("locationId", args.locationId),
              )
              .order("desc")
              .take(MAX_PRODUCTS);
    const configs = await ctx.db
      .query("wasteProductConfigs")
      .withIndex("by_org_location_pinned", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", args.locationId),
      )
      .take(MAX_PRODUCTS);
    return {
      settings: {
        inactivitySeconds: settings.inactivitySeconds,
        popularityPeriod: settings.popularityPeriod,
        historyScope: settings.historyScope,
      },
      rankings: stats
        .filter((row) =>
          settings.popularityPeriod === "30Days"
            ? row.count30Days > 0
            : settings.popularityPeriod === "90Days"
              ? row.count90Days > 0
              : row.allTimeCount > 0,
        )
        .map((row) => ({
          productId: row.productId,
          count:
            settings.popularityPeriod === "30Days"
              ? row.count30Days
              : settings.popularityPeriod === "90Days"
                ? row.count90Days
                : row.allTimeCount,
          lastRegisteredAt: row.lastRegisteredAt,
          learnedShortcuts:
            settings.popularityPeriod === "30Days"
              ? row.top30Days
              : settings.popularityPeriod === "90Days"
                ? row.top90Days
                : row.topAllTime,
        })),
      configs: configs.map((row) => ({
        productId: row.productId,
        pinnedAt: row.pinnedAt ?? null,
        shortcutOverrides: row.shortcutOverrides ?? null,
      })),
    };
  },
});

export const registerWaste = mutation({
  args: {
    locationId: v.id("locations"),
    productId: v.id("products"),
    unitId: v.id("units"),
    quantity: v.number(),
    source: sourceValidator,
  },
  returns: v.object({
    registrationId: v.id("wasteRegistrations"),
    productName: v.string(),
    unitName: v.string(),
    quantity: v.number(),
    registeredAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const { organizationId, userIdentifier, userName } =
      await requireWasteRegistrar(ctx);
    await requireOtherFeaturesUnlocked(ctx, organizationId, args.locationId);
    const quantity = requireQuantity(args.quantity);
    const [location, product, productUnit, unit] = await Promise.all([
      requireLocation(ctx, organizationId, args.locationId),
      requireActiveProduct(ctx, organizationId, args.productId),
      ctx.db
        .query("productUnits")
        .withIndex("by_organizationId_and_productId_and_unitId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("productId", args.productId)
            .eq("unitId", args.unitId),
        )
        .unique(),
      ctx.db.get("units", args.unitId),
    ]);
    if (!productUnit || !unit || unit.organizationId !== organizationId) {
      throw new ConvexError("Produktets enhed blev ikke fundet");
    }
    const defaultUnit = await ctx.db.get("units", product.defaultUnitId);
    if (!defaultUnit || defaultUnit.organizationId !== organizationId) {
      throw new ConvexError("Produktets standardenhed blev ikke fundet");
    }
    const now = Date.now();
    const defaultQuantity = normalizeStock(quantity * productUnit.factorToDefault);
    const registrationId = await ctx.db.insert("wasteRegistrations", {
      organizationId,
      locationId: location._id,
      locationName: location.name,
      productId: product._id,
      productName: product.name,
      unitId: unit._id,
      unitName: unit.name,
      quantity,
      quantityKey: quantityKey(quantity),
      factorToDefault: productUnit.factorToDefault,
      defaultUnitId: defaultUnit._id,
      defaultUnitName: defaultUnit.name,
      defaultQuantity,
      registeredAt: now,
      registeredBy: userIdentifier,
      registeredByName: userName,
      source: args.source,
      status: "active",
      activeIn30Days: true,
      activeIn90Days: true,
    });
    const registration = (await ctx.db.get("wasteRegistrations", registrationId))!;
    await addStock(ctx, organizationId, location._id, product._id, -defaultQuantity);
    await addRegistrationStats(ctx, registration);
    await Promise.all([
      ctx.scheduler.runAt(
        now + DAYS_30_MS,
        internal.waste.expireRegistrationFrom30DayStats,
        { registrationId },
      ),
      ctx.scheduler.runAt(
        now + DAYS_90_MS,
        internal.waste.expireRegistrationFrom90DayStats,
        { registrationId },
      ),
    ]);
    return {
      registrationId,
      productName: product.name,
      unitName: unit.name,
      quantity,
      registeredAt: now,
    };
  },
});

export const setPinned = mutation({
  args: {
    locationId: v.id("locations"),
    productId: v.id("products"),
    pinned: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId, userIdentifier } = await requireWasteRegistrar(ctx);
    await Promise.all([
      requireLocation(ctx, organizationId, args.locationId),
      requireActiveProduct(ctx, organizationId, args.productId),
    ]);
    const current = await ctx.db
      .query("wasteProductConfigs")
      .withIndex("by_org_location_product", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", args.locationId)
          .eq("productId", args.productId),
      )
      .unique();
    if (args.pinned) {
      if (current) {
        if (!current.pinnedAt) {
          await ctx.db.patch("wasteProductConfigs", current._id, {
            pinnedAt: Date.now(),
            pinnedBy: userIdentifier,
          });
        }
      } else {
        await ctx.db.insert("wasteProductConfigs", {
          organizationId,
          locationId: args.locationId,
          productId: args.productId,
          pinnedAt: Date.now(),
          pinnedBy: userIdentifier,
        });
      }
    } else if (current) {
      if (current.shortcutOverrides) {
        await ctx.db.patch("wasteProductConfigs", current._id, {
          pinnedAt: undefined,
          pinnedBy: undefined,
        });
      } else {
        await ctx.db.delete("wasteProductConfigs", current._id);
      }
    }
    return null;
  },
});

export const setShortcutOverride = mutation({
  args: {
    locationId: v.id("locations"),
    productId: v.id("products"),
    shortcuts: v.array(shortcutValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    await requireLocation(ctx, organizationId, args.locationId);
    const product = await requireActiveProduct(ctx, organizationId, args.productId);
    if (args.shortcuts.length !== 2) {
      throw new ConvexError("Angiv præcis to shortcuts");
    }
    const normalized = [] as Array<{ unitId: Id<"units">; quantity: number }>;
    for (const shortcut of args.shortcuts) {
      const quantity = requireQuantity(shortcut.quantity);
      const productUnit = await ctx.db
        .query("productUnits")
        .withIndex("by_organizationId_and_productId_and_unitId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("productId", product._id)
            .eq("unitId", shortcut.unitId),
        )
        .unique();
      if (!productUnit) throw new ConvexError("Enheden blev ikke fundet");
      normalized.push({ unitId: shortcut.unitId, quantity });
    }
    if (
      normalized[0].unitId === normalized[1].unitId &&
      normalized[0].quantity === normalized[1].quantity
    ) {
      throw new ConvexError("De to shortcuts skal være forskellige");
    }
    const current = await ctx.db
      .query("wasteProductConfigs")
      .withIndex("by_org_location_product", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", args.locationId)
          .eq("productId", product._id),
      )
      .unique();
    if (current) {
      await ctx.db.patch("wasteProductConfigs", current._id, {
        shortcutOverrides: normalized,
      });
    } else {
      await ctx.db.insert("wasteProductConfigs", {
        organizationId,
        locationId: args.locationId,
        productId: product._id,
        shortcutOverrides: normalized,
      });
    }
    return null;
  },
});

export const clearShortcutOverride = mutation({
  args: { locationId: v.id("locations"), productId: v.id("products") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    await requireLocation(ctx, organizationId, args.locationId);
    const current = await ctx.db
      .query("wasteProductConfigs")
      .withIndex("by_org_location_product", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", args.locationId)
          .eq("productId", args.productId),
      )
      .unique();
    if (current) {
      if (current.pinnedAt) {
        await ctx.db.patch("wasteProductConfigs", current._id, {
          shortcutOverrides: undefined,
        });
      } else {
        await ctx.db.delete("wasteProductConfigs", current._id);
      }
    }
    return null;
  },
});

export const voidWasteRegistration = mutation({
  args: { registrationId: v.id("wasteRegistrations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireWasteRegistrar(ctx);
    const registration = await ctx.db.get("wasteRegistrations", args.registrationId);
    if (!registration || registration.organizationId !== auth.organizationId) {
      throw new ConvexError("Registreringen blev ikke fundet");
    }
    if (registration.status === "voided") {
      throw new ConvexError("Registreringen er allerede annulleret");
    }
    const now = Date.now();
    const canUndoOwn =
      registration.registeredBy === auth.userIdentifier &&
      now - registration.registeredAt <= UNDO_WINDOW_MS;
    if (!canUndoOwn && !canViewWasteReports(auth.role)) {
      throw new ConvexError("Du har ikke adgang til at annullere registreringen");
    }
    await requireOtherFeaturesUnlocked(
      ctx,
      auth.organizationId,
      registration.locationId,
    );
    const periods: PopularityPeriod[] = ["allTime"];
    if (registration.activeIn30Days) periods.push("30Days");
    if (registration.activeIn90Days) periods.push("90Days");
    await ctx.db.patch("wasteRegistrations", registration._id, {
      status: "voided",
      activeIn30Days: false,
      activeIn90Days: false,
      voidedAt: now,
      voidedBy: auth.userIdentifier,
      voidedByName: auth.userName,
    });
    await addStock(
      ctx,
      auth.organizationId,
      registration.locationId,
      registration.productId,
      registration.defaultQuantity,
    );
    await decrementStats(ctx, registration, periods, true);
    return null;
  },
});

export const expireRegistrationFrom30DayStats = internalMutation({
  args: { registrationId: v.id("wasteRegistrations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const registration = await ctx.db.get("wasteRegistrations", args.registrationId);
    if (
      !registration ||
      registration.status !== "active" ||
      !registration.activeIn30Days
    ) {
      return null;
    }
    await ctx.db.patch("wasteRegistrations", registration._id, {
      activeIn30Days: false,
    });
    await decrementStats(ctx, registration, ["30Days"], false);
    return null;
  },
});

export const expireRegistrationFrom90DayStats = internalMutation({
  args: { registrationId: v.id("wasteRegistrations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const registration = await ctx.db.get("wasteRegistrations", args.registrationId);
    if (
      !registration ||
      registration.status !== "active" ||
      !registration.activeIn90Days
    ) {
      return null;
    }
    await ctx.db.patch("wasteRegistrations", registration._id, {
      activeIn90Days: false,
    });
    await decrementStats(ctx, registration, ["90Days"], false);
    return null;
  },
});

export const rebuildOrganizationStatsForProduct = internalMutation({
  args: {
    organizationId: v.string(),
    productId: v.id("products"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const product = await ctx.db.get("products", args.productId);
    if (!product || product.organizationId !== args.organizationId) return null;
    const [locationProducts, locationAmounts, currentProduct, currentAmounts] =
      await Promise.all([
        ctx.db
          .query("wasteProductStats")
          .withIndex("by_org_product", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("productId", args.productId),
          )
          .take(MAX_REBUILD_ROWS + 1),
        ctx.db
          .query("wasteAmountStats")
          .withIndex("by_org_product", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("productId", args.productId),
          )
          .take(MAX_REBUILD_ROWS + 1),
        organizationProductStats(ctx, args.organizationId, args.productId),
        ctx.db
          .query("wasteOrganizationAmountStats")
          .withIndex("by_org_product", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("productId", args.productId),
          )
          .take(MAX_REBUILD_ROWS + 1),
      ]);
    if (
      locationProducts.length > MAX_REBUILD_ROWS ||
      locationAmounts.length > MAX_REBUILD_ROWS ||
      currentAmounts.length > MAX_REBUILD_ROWS
    ) {
      throw new ConvexError(
        "Organisationens Waste-historik er for stor til at blive samlet automatisk",
      );
    }
    const totals = locationProducts.reduce(
      (result, row) => ({
        allTimeCount: result.allTimeCount + row.allTimeCount,
        count30Days: result.count30Days + row.count30Days,
        count90Days: result.count90Days + row.count90Days,
        lastRegisteredAt: Math.max(
          result.lastRegisteredAt,
          row.lastRegisteredAt,
        ),
      }),
      {
        allTimeCount: 0,
        count30Days: 0,
        count90Days: 0,
        lastRegisteredAt: 0,
      },
    );
    const amountsByKey = new Map<
      string,
      Omit<Doc<"wasteOrganizationAmountStats">, "_id" | "_creationTime">
    >();
    for (const row of locationAmounts) {
      const key = `${row.unitId}:${row.quantityKey}`;
      const current = amountsByKey.get(key);
      amountsByKey.set(key, {
        organizationId: args.organizationId,
        productId: args.productId,
        unitId: row.unitId,
        quantity: row.quantity,
        quantityKey: row.quantityKey,
        allTimeCount: (current?.allTimeCount ?? 0) + row.allTimeCount,
        count30Days: (current?.count30Days ?? 0) + row.count30Days,
        count90Days: (current?.count90Days ?? 0) + row.count90Days,
        lastRegisteredAt: Math.max(
          current?.lastRegisteredAt ?? 0,
          row.lastRegisteredAt,
        ),
      });
    }
    const amounts = [...amountsByKey.values()];
    const unitNames = new Map<Id<"units">, string>();
    await Promise.all(
      [...new Set(amounts.map((row) => row.unitId))].map(async (unitId) => {
        const unit = await ctx.db.get("units", unitId);
        unitNames.set(unitId, unit?.name ?? "");
      }),
    );
    if (totals.allTimeCount > 0) {
      const values = {
        organizationId: args.organizationId,
        productId: args.productId,
        ...totals,
        topAllTime: selectTopAmounts(amounts, "allTime", unitNames),
        top30Days: selectTopAmounts(amounts, "30Days", unitNames),
        top90Days: selectTopAmounts(amounts, "90Days", unitNames),
      };
      if (currentProduct) {
        await ctx.db.replace(
          "wasteOrganizationProductStats",
          currentProduct._id,
          values,
        );
      } else {
        await ctx.db.insert("wasteOrganizationProductStats", values);
      }
    } else if (currentProduct) {
      await ctx.db.delete("wasteOrganizationProductStats", currentProduct._id);
    }
    const currentAmountsByKey = new Map(
      currentAmounts.map((row) => [`${row.unitId}:${row.quantityKey}`, row]),
    );
    for (const amount of amounts) {
      const key = `${amount.unitId}:${amount.quantityKey}`;
      const current = currentAmountsByKey.get(key);
      if (current) {
        await ctx.db.replace("wasteOrganizationAmountStats", current._id, amount);
        currentAmountsByKey.delete(key);
      } else {
        await ctx.db.insert("wasteOrganizationAmountStats", amount);
      }
    }
    for (const stale of currentAmountsByKey.values()) {
      await ctx.db.delete("wasteOrganizationAmountStats", stale._id);
    }
    return null;
  },
});

export const cleanupProductData = internalMutation({
  args: {
    organizationId: v.string(),
    productId: v.id("products"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const limit = 100;
    const [
      productStats,
      amountStatsRows,
      organizationProductStatsRows,
      organizationAmountStatsRows,
      configs,
    ] = await Promise.all([
      ctx.db
        .query("wasteProductStats")
        .withIndex("by_org_product", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("productId", args.productId),
        )
        .take(limit),
      ctx.db
        .query("wasteAmountStats")
        .withIndex("by_org_product", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("productId", args.productId),
        )
        .take(limit),
      ctx.db
        .query("wasteOrganizationProductStats")
        .withIndex("by_org_product", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("productId", args.productId),
        )
        .take(limit),
      ctx.db
        .query("wasteOrganizationAmountStats")
        .withIndex("by_org_product", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("productId", args.productId),
        )
        .take(limit),
      ctx.db
        .query("wasteProductConfigs")
        .withIndex("by_org_product", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("productId", args.productId),
        )
        .take(limit),
    ]);
    for (const row of productStats) await ctx.db.delete("wasteProductStats", row._id);
    for (const row of amountStatsRows) await ctx.db.delete("wasteAmountStats", row._id);
    for (const row of organizationProductStatsRows) {
      await ctx.db.delete("wasteOrganizationProductStats", row._id);
    }
    for (const row of organizationAmountStatsRows) {
      await ctx.db.delete("wasteOrganizationAmountStats", row._id);
    }
    for (const row of configs) await ctx.db.delete("wasteProductConfigs", row._id);
    if (
      productStats.length === limit ||
      amountStatsRows.length === limit ||
      organizationProductStatsRows.length === limit ||
      organizationAmountStatsRows.length === limit ||
      configs.length === limit
    ) {
      await ctx.scheduler.runAfter(0, internal.waste.cleanupProductData, args);
    }
    return null;
  },
});

export const listRegistrations = query({
  args: {
    paginationOpts: paginationOptsValidator,
    startAt: v.number(),
    endAt: v.number(),
    locationId: v.optional(v.id("locations")),
  },
  returns: paginationResultValidator(reportRowValidator),
  handler: async (ctx, args) => {
    const { organizationId } = await requireWasteReporter(ctx);
    validateRange(args.startAt, args.endAt);
    if (args.locationId) {
      await requireLocation(ctx, organizationId, args.locationId);
    }
    const results = args.locationId
      ? await ctx.db
          .query("wasteRegistrations")
          .withIndex("by_org_location_time", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("locationId", args.locationId!)
              .gte("registeredAt", args.startAt)
              .lte("registeredAt", args.endAt),
          )
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("wasteRegistrations")
          .withIndex("by_org_and_time", (q) =>
            q
              .eq("organizationId", organizationId)
              .gte("registeredAt", args.startAt)
              .lte("registeredAt", args.endAt),
          )
          .order("desc")
          .paginate(args.paginationOpts);
    return { ...results, page: results.page.map(reportRow) };
  },
});

export const exportRegistrations = query({
  args: {
    paginationOpts: paginationOptsValidator,
    startAt: v.number(),
    endAt: v.number(),
    locationId: v.optional(v.id("locations")),
    activeOnly: v.boolean(),
  },
  returns: paginationResultValidator(reportRowValidator),
  handler: async (ctx, args) => {
    const { organizationId } = await requireWasteReporter(ctx);
    validateRange(args.startAt, args.endAt);
    if (args.paginationOpts.numItems > 100) {
      throw new ConvexError("Eksportsiden er for stor");
    }
    if (args.locationId) {
      await requireLocation(ctx, organizationId, args.locationId);
    }
    const results = args.activeOnly
      ? args.locationId
        ? await ctx.db
            .query("wasteRegistrations")
            .withIndex(
              "by_org_location_status_time",
              (q) =>
                q
                  .eq("organizationId", organizationId)
                  .eq("locationId", args.locationId!)
                  .eq("status", "active")
                  .gte("registeredAt", args.startAt)
                  .lte("registeredAt", args.endAt),
            )
            .order("desc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("wasteRegistrations")
            .withIndex("by_org_status_time", (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("status", "active")
                .gte("registeredAt", args.startAt)
                .lte("registeredAt", args.endAt),
            )
            .order("desc")
            .paginate(args.paginationOpts)
      : args.locationId
        ? await ctx.db
            .query("wasteRegistrations")
            .withIndex("by_org_location_time", (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("locationId", args.locationId!)
                .gte("registeredAt", args.startAt)
                .lte("registeredAt", args.endAt),
            )
            .order("desc")
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("wasteRegistrations")
            .withIndex("by_org_and_time", (q) =>
              q
                .eq("organizationId", organizationId)
                .gte("registeredAt", args.startAt)
                .lte("registeredAt", args.endAt),
            )
            .order("desc")
            .paginate(args.paginationOpts);
    return { ...results, page: results.page.map(reportRow) };
  },
});
