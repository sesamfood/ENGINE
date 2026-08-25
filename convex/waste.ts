import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { hasPermission } from "../lib/auth-permissions";
import {
  requireKioskDestination,
  requireLocationAccess,
  requireOrganization,
  requireWasteRegistrar,
  requireWasteExporter,
  requireWasteReporter,
  requireWasteSettings,
  isMultiLocationFilter,
  isSingleLocationFilter,
  resolveLocationFilter,
} from "./lib/auth";
import {
  DEFAULT_BAD_DELIVERY_EMAIL_BODY,
  DEFAULT_BAD_DELIVERY_EMAIL_SUBJECT,
  validateBadDeliveryEmailBody,
  validateBadDeliveryEmailSubject,
  validateBadDeliveryRecipients,
} from "./lib/badDeliverySettings";
import { addStock, normalizeStock } from "./lib/stock";
import { recordAudit, requireAuditReason } from "./lib/audit";
import {
  activeProductCatalogValidator,
  listActiveProductCatalog,
} from "./lib/productCatalog";
import {
  dashboardSummaryTimeZone,
  reconcileDashboardSummary,
} from "./lib/dashboardSummaries";

const MAX_PRODUCTS = 500;
const MAX_CHILD_ROWS = 200;
const MAX_REBUILD_ROWS = 1_000;
const MAX_QUANTITY = 1_000_000;
const MIN_PRODUCT_HISTORY = 20;
const UNDO_WINDOW_MS = 30_000;
const UNDO_REASON_GRACE_MS = 30_000;
const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;
const DAYS_90_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_PUBLIC_PAGE_SIZE = 100;
const REPORT_SUMMARY_BUILD_PAGE_SIZE = 50;
const REPORT_SUMMARY_BUILD_TIMEOUT_MS = 10 * 60 * 1_000;
const MAX_REPORT_SUMMARY_ROWS = 8_000;
const MAX_REPORT_BOUNDARY_ROWS = 5_000;
const MAX_REPORT_GROUPS = 5_000;
const UTC_DAY_MS = 24 * 60 * 60 * 1_000;

function requirePageSize(numItems: number, maximum: number) {
  if (!Number.isInteger(numItems) || numItems <= 0 || numItems > maximum) {
    throw new ConvexError("Siden er for stor");
  }
}

function requireCompleteProductSet<T>(rows: T[]) {
  if (rows.length > MAX_PRODUCTS) {
    throw new ConvexError(
      "Der er over 500 produkter. Arkivér produkter, du ikke bruger, eller kontakt en bruger med rollen Administrator",
    );
  }
  return rows;
}

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
const reportSummaryRowValidator = v.object({
  locationId: v.id("locations"),
  locationName: v.string(),
  productId: v.id("products"),
  productName: v.string(),
  defaultUnitId: v.id("units"),
  defaultUnitName: v.string(),
  quantity: v.number(),
  count: v.number(),
});
const reportSummaryStateValidator = v.union(
  v.literal("building"),
  v.literal("ready"),
  v.literal("fallback"),
);

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
  if (
    !Number.isFinite(quantity) ||
    normalized <= 0 ||
    normalized > MAX_QUANTITY
  ) {
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
    throw new ConvexError("Lokationen blev ikke fundet");
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
    badDeliveryDeductFromStock: settings?.badDeliveryDeductFromStock ?? true,
    badDeliveryShowStockChoice: settings?.badDeliveryShowStockChoice ?? true,
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
    "organizationId" | "locationId" | "productId" | "unitId" | "quantityKey"
  >,
) {
  return await ctx.db
    .query("wasteAmountStats")
    .withIndex("by_org_location_product_unit_qty", (q) =>
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

type PeriodCounts = {
  allTimeCount: number;
  count30Days: number;
  count90Days: number;
};

type AmountStat = PeriodCounts & {
  unitId: Id<"units">;
  quantity: number;
  lastRegisteredAt: number;
};

function countForPeriod(row: PeriodCounts, period: PopularityPeriod) {
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
          .withIndex("by_org_location_product_30_count", (q) =>
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
            .withIndex("by_org_location_product_90_count", (q) =>
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
            .withIndex("by_org_location_product_all_count", (q) =>
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
  registration: Pick<Doc<"wasteRegistrations">, "organizationId" | "productId">,
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
        .withIndex("by_org_location_product_unit_qty_status_time", (q) =>
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
        .withIndex("by_org_location_product_status_time", (q) =>
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

function reportSummaryDayStart(registeredAt: number) {
  return Math.floor(registeredAt / UTC_DAY_MS) * UTC_DAY_MS;
}

async function adjustReportSummary(
  ctx: MutationCtx,
  registration: Doc<"wasteRegistrations">,
  direction: 1 | -1,
) {
  const dayStartAt = reportSummaryDayStart(registration.registeredAt);
  const current = await ctx.db
    .query("wasteReportDailySummaries")
    .withIndex(
      "by_org_location_product_defaultUnit_dayStartAt",
      (q) =>
        q
          .eq("organizationId", registration.organizationId)
          .eq("locationId", registration.locationId)
          .eq("productId", registration.productId)
          .eq("defaultUnitId", registration.defaultUnitId)
          .eq("dayStartAt", dayStartAt),
    )
    .unique();

  if (!current) {
    if (direction < 0) return;
    await ctx.db.insert("wasteReportDailySummaries", {
      organizationId: registration.organizationId,
      locationId: registration.locationId,
      locationName: registration.locationName,
      productId: registration.productId,
      productName: registration.productName,
      defaultUnitId: registration.defaultUnitId,
      defaultUnitName: registration.defaultUnitName,
      dayStartAt,
      count: 1,
      quantity: registration.defaultQuantity,
      latestRegisteredAt: registration.registeredAt,
    });
    return;
  }

  const count = current.count + direction;
  if (count <= 0) {
    await ctx.db.delete("wasteReportDailySummaries", current._id);
    return;
  }

  const useRegistrationNames =
    direction > 0 && registration.registeredAt >= current.latestRegisteredAt;
  const latestRemaining =
    direction < 0 && registration.registeredAt >= current.latestRegisteredAt
      ? await ctx.db
          .query("wasteRegistrations")
          .withIndex("by_org_location_product_status_time", (q) =>
            q
              .eq("organizationId", registration.organizationId)
              .eq("locationId", registration.locationId)
              .eq("productId", registration.productId)
              .eq("status", "active")
              .gte("registeredAt", dayStartAt)
              .lt("registeredAt", dayStartAt + UTC_DAY_MS),
          )
          .filter((q) =>
            q.eq(q.field("defaultUnitId"), registration.defaultUnitId),
          )
          .order("desc")
          .first()
      : null;
  await ctx.db.patch("wasteReportDailySummaries", current._id, {
    count,
    quantity: normalizeQuantity(
      current.quantity + direction * registration.defaultQuantity,
    ),
    ...(useRegistrationNames
      ? {
          locationName: registration.locationName,
          productName: registration.productName,
          defaultUnitName: registration.defaultUnitName,
          latestRegisteredAt: registration.registeredAt,
        }
      : latestRemaining
        ? {
            locationName: latestRemaining.locationName,
            productName: latestRemaining.productName,
            defaultUnitName: latestRemaining.defaultUnitName,
            latestRegisteredAt: latestRemaining.registeredAt,
          }
      : {}),
  });
}

export const getSettings = query({
  args: {},
  returns: settingsValidator,
  handler: async (ctx) => {
    const { organizationId } = await requireWasteSettings(ctx);
    return await settingsFor(ctx, organizationId);
  },
});

export const setSettings = mutation({
  args: settingsValidator.fields,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireWasteSettings(ctx);
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
        .take(MAX_PRODUCTS + 1);
      requireCompleteProductSet(products);
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
  returns: v.array(activeProductCatalogValidator),
  handler: async (ctx) => {
    const { organizationId } = await requireWasteRegistrar(
      ctx,
      "waste.register",
    );
    return await listActiveProductCatalog(ctx, organizationId);
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
    const auth = await requireWasteRegistrar(ctx, "waste.register");
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    await requireLocation(ctx, organizationId, args.locationId);
    const settings = await settingsFor(ctx, organizationId);
    const locationStats =
      settings.historyScope === "location"
        ? settings.popularityPeriod === "30Days"
          ? await ctx.db
              .query("wasteProductStats")
              .withIndex("by_org_location_30_count", (q) =>
                q
                  .eq("organizationId", organizationId)
                  .eq("locationId", args.locationId),
              )
              .order("desc")
              .take(MAX_PRODUCTS + 1)
          : settings.popularityPeriod === "90Days"
            ? await ctx.db
                .query("wasteProductStats")
                .withIndex("by_org_location_90_count", (q) =>
                  q
                    .eq("organizationId", organizationId)
                    .eq("locationId", args.locationId),
                )
                .order("desc")
                .take(MAX_PRODUCTS + 1)
            : await ctx.db
                .query("wasteProductStats")
                .withIndex("by_org_location_all_count", (q) =>
                  q
                    .eq("organizationId", organizationId)
                    .eq("locationId", args.locationId),
                )
                .order("desc")
                .take(MAX_PRODUCTS + 1)
        : null;
    const organizationStats =
      settings.popularityPeriod === "30Days"
        ? await ctx.db
            .query("wasteOrganizationProductStats")
            .withIndex("by_org_30_count", (q) =>
              q.eq("organizationId", organizationId),
            )
            .order("desc")
            .take(MAX_PRODUCTS + 1)
        : settings.popularityPeriod === "90Days"
          ? await ctx.db
              .query("wasteOrganizationProductStats")
              .withIndex("by_org_90_count", (q) =>
                q.eq("organizationId", organizationId),
              )
              .order("desc")
              .take(MAX_PRODUCTS + 1)
          : await ctx.db
              .query("wasteOrganizationProductStats")
              .withIndex("by_org_all_count", (q) =>
                q.eq("organizationId", organizationId),
              )
              .order("desc")
              .take(MAX_PRODUCTS + 1);
    requireCompleteProductSet(locationStats ?? []);
    requireCompleteProductSet(organizationStats);
    const locationByProduct = new Map(
      (locationStats ?? []).map((row) => [row.productId, row]),
    );
    const organizationProductIds = new Set(
      organizationStats.map((row) => row.productId),
    );
    const stats =
      settings.historyScope === "organization"
        ? organizationStats
        : [
            ...organizationStats.map((organizationRow) => {
              const locationRow = locationByProduct.get(
                organizationRow.productId,
              );
              return locationRow &&
                countForPeriod(locationRow, settings.popularityPeriod) >=
                  MIN_PRODUCT_HISTORY
                ? locationRow
                : organizationRow;
            }),
            ...(locationStats ?? []).filter(
              (row) => !organizationProductIds.has(row.productId),
            ),
          ];
    const configs = await ctx.db
      .query("wasteProductConfigs")
      .withIndex("by_org_location_pinned", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", args.locationId),
      )
      .take(MAX_PRODUCTS + 1);
    requireCompleteProductSet(configs);
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
    const auth = await requireWasteRegistrar(ctx, "waste.register");
    const { organizationId, userIdentifier, userName } = auth;
    requireLocationAccess(auth, args.locationId);
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
    const summaryTimeZone = await dashboardSummaryTimeZone(ctx, organizationId);
    const defaultQuantity = normalizeStock(
      quantity * productUnit.factorToDefault,
    );
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
      reportSummaryApplied: true,
      dashboardSummaryTimeZone: summaryTimeZone,
    });
    const registration = (await ctx.db.get(
      "wasteRegistrations",
      registrationId,
    ))!;
    await adjustReportSummary(ctx, registration, 1);
    await reconcileDashboardSummary(
      ctx,
      "waste",
      null,
      registration,
      summaryTimeZone,
    );
    await addStock(
      ctx,
      organizationId,
      location._id,
      product._id,
      -defaultQuantity,
    );
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
    const auth = await requireWasteRegistrar(ctx, "waste.register");
    const { organizationId, userIdentifier } = auth;
    requireLocationAccess(auth, args.locationId);
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
    const { organizationId } = await requireWasteSettings(ctx);
    await requireLocation(ctx, organizationId, args.locationId);
    const product = await requireActiveProduct(
      ctx,
      organizationId,
      args.productId,
    );
    if (args.shortcuts.length < 1 || args.shortcuts.length > 2) {
      throw new ConvexError("Angiv en eller to genveje");
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
      normalized.length === 2 &&
      normalized[0].unitId === normalized[1].unitId &&
      normalized[0].quantity === normalized[1].quantity
    ) {
      throw new ConvexError("De to genveje skal være forskellige");
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
    const { organizationId } = await requireWasteSettings(ctx);
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

type VoidWasteOptions = {
  registrationId: Id<"wasteRegistrations">;
  /** Kun fortryd inden for eget undo-vindue må mangle en begrundelse. */
  reason?: string;
  requireUndoWindow: boolean;
};

async function voidRegistration(
  ctx: MutationCtx,
  { registrationId, reason, requireUndoWindow }: VoidWasteOptions,
) {
  const auth = await requireOrganization(ctx);
  const kioskBypass = await requireKioskDestination(ctx, auth, [
    "waste.register",
    "waste.report",
  ]);
  const canRegister = hasPermission(
    auth.role,
    auth.permissions,
    "waste.register",
  );
  const canReport = hasPermission(auth.role, auth.permissions, "waste.report");
  if (!kioskBypass && !canRegister && !canReport) {
    throw new ConvexError("Du har ikke adgang");
  }
  const registration = await ctx.db.get("wasteRegistrations", registrationId);
  if (!registration || registration.organizationId !== auth.organizationId) {
    throw new ConvexError("Registreringen blev ikke fundet");
  }
  requireLocationAccess(auth, registration.locationId);
  if (registration.status === "voided") {
    throw new ConvexError("Registreringen er allerede annulleret");
  }
  const now = Date.now();
  const summaryTimeZone = await dashboardSummaryTimeZone(
    ctx,
    auth.organizationId,
  );
  const nextRegistration = {
    ...registration,
    status: "voided" as const,
    reportSummaryApplied: true,
    dashboardSummaryTimeZone: summaryTimeZone,
  };
  const canUndoOwn =
    registration.registeredBy === auth.userIdentifier &&
    now - registration.registeredAt <= UNDO_WINDOW_MS + UNDO_REASON_GRACE_MS;
  if (requireUndoWindow && !canUndoOwn) {
    throw new ConvexError("Fortrydelsesfristen er udløbet");
  }
  if (!canUndoOwn && !canReport) {
    throw new ConvexError("Du har ikke adgang til at annullere registreringen");
  }
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
    reportSummaryApplied: true,
    dashboardSummaryTimeZone: summaryTimeZone,
  });
  if (registration.reportSummaryApplied) {
    await adjustReportSummary(ctx, registration, -1);
  }
  await reconcileDashboardSummary(
    ctx,
    "waste",
    registration,
    nextRegistration,
    summaryTimeZone,
  );
  await addStock(
    ctx,
    auth.organizationId,
    registration.locationId,
    registration.productId,
    registration.defaultQuantity,
  );
  await decrementStats(ctx, registration, periods, true);
  await recordAudit(ctx, auth, {
    action: "waste.void",
    entityTable: "wasteRegistrations",
    entityId: registration._id,
    locationId: registration.locationId,
    summary: `Waste-registrering for ${registration.productName} annulleret`,
    reason,
  });
}

/** Fortryd egen registrering inden for undo-vinduet. Ingen begrundelse. */
export const undoWasteRegistration = mutation({
  args: { registrationId: v.id("wasteRegistrations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await voidRegistration(ctx, {
      registrationId: args.registrationId,
      requireUndoWindow: true,
    });
    return null;
  },
});

/** Annullér en registrering fra Waste-rapporten. Kræver begrundelse. */
export const voidWasteRegistration = mutation({
  args: {
    registrationId: v.id("wasteRegistrations"),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await voidRegistration(ctx, {
      registrationId: args.registrationId,
      reason: requireAuditReason(args.reason),
      requireUndoWindow: false,
    });
    return null;
  },
});

export const expireRegistrationFrom30DayStats = internalMutation({
  args: { registrationId: v.id("wasteRegistrations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const registration = await ctx.db.get(
      "wasteRegistrations",
      args.registrationId,
    );
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
    const registration = await ctx.db.get(
      "wasteRegistrations",
      args.registrationId,
    );
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
        await ctx.db.replace(
          "wasteOrganizationAmountStats",
          current._id,
          amount,
        );
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
      onlinePosMappings,
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
      ctx.db
        .query("onlinePosProductMappings")
        .withIndex("by_organizationId_and_productId", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("productId", args.productId),
        )
        .take(limit),
    ]);
    for (const row of productStats)
      await ctx.db.delete("wasteProductStats", row._id);
    for (const row of amountStatsRows)
      await ctx.db.delete("wasteAmountStats", row._id);
    for (const row of organizationProductStatsRows) {
      await ctx.db.delete("wasteOrganizationProductStats", row._id);
    }
    for (const row of organizationAmountStatsRows) {
      await ctx.db.delete("wasteOrganizationAmountStats", row._id);
    }
    for (const row of configs)
      await ctx.db.delete("wasteProductConfigs", row._id);
    for (const row of onlinePosMappings) {
      await ctx.db.delete("onlinePosProductMappings", row._id);
    }
    if (
      productStats.length === limit ||
      amountStatsRows.length === limit ||
      organizationProductStatsRows.length === limit ||
      organizationAmountStatsRows.length === limit ||
      configs.length === limit ||
      onlinePosMappings.length === limit
    ) {
      await ctx.scheduler.runAfter(0, internal.waste.cleanupProductData, args);
    }
    return null;
  },
});

function newReportSummaryRunToken() {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

export const requestReportSummaryRebuild = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { organizationId } = await requireWasteExporter(ctx);
    const status = await ctx.db
      .query("wasteReportSummaryStatuses")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();
    const now = Date.now();
    if (status?.state === "ready") return null;
    if (
      status?.state === "building" &&
      now - status.updatedAt <= REPORT_SUMMARY_BUILD_TIMEOUT_MS
    ) {
      return null;
    }

    const runToken = newReportSummaryRunToken();
    if (status) {
      await ctx.db.patch("wasteReportSummaryStatuses", status._id, {
        state: "building",
        runToken,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("wasteReportSummaryStatuses", {
        organizationId,
        state: "building",
        runToken,
        updatedAt: now,
      });
    }
    await ctx.scheduler.runAfter(
      0,
      internal.waste.rebuildReportSummary,
      {
        organizationId,
        runToken,
        cursor: null,
      },
    );
    return null;
  },
});

export const rebuildReportSummary = internalMutation({
  args: {
    organizationId: v.string(),
    runToken: v.string(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await ctx.db
      .query("wasteReportSummaryStatuses")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    if (
      !status ||
      status.state !== "building" ||
      status.runToken !== args.runToken
    ) {
      return null;
    }

    const result = await ctx.db
      .query("wasteRegistrations")
      .withIndex("by_org_and_time", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .paginate({
        numItems: REPORT_SUMMARY_BUILD_PAGE_SIZE,
        cursor: args.cursor,
        maximumRowsRead: REPORT_SUMMARY_BUILD_PAGE_SIZE,
      });
    for (const registration of result.page) {
      if (registration.reportSummaryApplied) continue;
      if (registration.status === "active") {
        await adjustReportSummary(ctx, registration, 1);
      }
      await ctx.db.patch("wasteRegistrations", registration._id, {
        reportSummaryApplied: true,
      });
    }

    await ctx.db.patch("wasteReportSummaryStatuses", status._id, {
      state: result.isDone ? "ready" : "building",
      runToken: result.isDone ? undefined : args.runToken,
      updatedAt: Date.now(),
    });
    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.waste.rebuildReportSummary,
        {
          ...args,
          cursor: result.continueCursor,
        },
      );
    }
    return null;
  },
});

type WasteReportLocationFilter = ReturnType<typeof resolveLocationFilter>;

type ReportSummaryContribution = {
  locationId: Id<"locations">;
  locationName: string;
  productId: Id<"products">;
  productName: string;
  defaultUnitId: Id<"units">;
  defaultUnitName: string;
  quantity: number;
  count: number;
  latestRegisteredAt: number;
};

function addReportSummaryContribution(
  groups: Map<string, ReportSummaryContribution>,
  contribution: ReportSummaryContribution,
) {
  const key = `${contribution.locationId}:${contribution.productId}:${contribution.defaultUnitId}`;
  const current = groups.get(key);
  if (!current) {
    groups.set(key, contribution);
    return;
  }
  groups.set(key, {
    ...current,
    ...(contribution.latestRegisteredAt >= current.latestRegisteredAt
      ? {
          locationName: contribution.locationName,
          productName: contribution.productName,
          defaultUnitName: contribution.defaultUnitName,
          latestRegisteredAt: contribution.latestRegisteredAt,
        }
      : {}),
    quantity: normalizeQuantity(current.quantity + contribution.quantity),
    count: current.count + contribution.count,
  });
}

async function reportDailySummariesInRange(
  ctx: QueryCtx,
  organizationId: string,
  locationFilter: WasteReportLocationFilter,
  startAt: number,
  endAtExclusive: number,
): Promise<Doc<"wasteReportDailySummaries">[]> {
  if (isMultiLocationFilter(locationFilter) && !locationFilter.locationIds.length) {
    return [];
  }
  if (isSingleLocationFilter(locationFilter)) {
    return await ctx.db
      .query("wasteReportDailySummaries")
      .withIndex(
        "by_organizationId_and_locationId_and_dayStartAt",
        (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("locationId", locationFilter.locationId)
            .gte("dayStartAt", startAt)
            .lt("dayStartAt", endAtExclusive),
      )
      .take(MAX_REPORT_SUMMARY_ROWS + 1);
  }
  if (isMultiLocationFilter(locationFilter)) {
    const rows: Doc<"wasteReportDailySummaries">[] = [];
    for (const locationId of locationFilter.locationIds) {
      const remaining = MAX_REPORT_SUMMARY_ROWS - rows.length;
      const locationRows = await ctx.db
        .query("wasteReportDailySummaries")
        .withIndex(
          "by_organizationId_and_locationId_and_dayStartAt",
          (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("locationId", locationId)
              .gte("dayStartAt", startAt)
              .lt("dayStartAt", endAtExclusive),
        )
        .take(remaining + 1);
      rows.push(...locationRows);
      if (rows.length > MAX_REPORT_SUMMARY_ROWS) return rows;
    }
    return rows;
  }
  return await ctx.db
    .query("wasteReportDailySummaries")
    .withIndex("by_organizationId_and_dayStartAt", (q) =>
      q
        .eq("organizationId", organizationId)
        .gte("dayStartAt", startAt)
        .lt("dayStartAt", endAtExclusive),
    )
    .take(MAX_REPORT_SUMMARY_ROWS + 1);
}

async function activeReportRegistrationsInRange(
  ctx: QueryCtx,
  organizationId: string,
  locationFilter: WasteReportLocationFilter,
  startAt: number,
  endAt: number,
  limit: number,
): Promise<Doc<"wasteRegistrations">[]> {
  if (isMultiLocationFilter(locationFilter) && !locationFilter.locationIds.length) {
    return [];
  }
  if (isSingleLocationFilter(locationFilter)) {
    return await ctx.db
      .query("wasteRegistrations")
      .withIndex("by_org_location_status_time", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", locationFilter.locationId)
          .eq("status", "active")
          .gte("registeredAt", startAt)
          .lte("registeredAt", endAt),
      )
      .order("desc")
      .take(limit + 1);
  }
  if (isMultiLocationFilter(locationFilter)) {
    const rows: Doc<"wasteRegistrations">[] = [];
    for (const locationId of locationFilter.locationIds) {
      const remaining = limit - rows.length;
      const locationRows = await ctx.db
        .query("wasteRegistrations")
        .withIndex("by_org_location_status_time", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("locationId", locationId)
            .eq("status", "active")
            .gte("registeredAt", startAt)
            .lte("registeredAt", endAt),
        )
        .order("desc")
        .take(remaining + 1);
      rows.push(...locationRows);
      if (rows.length > limit) return rows;
    }
    return rows;
  }
  return await ctx.db
    .query("wasteRegistrations")
    .withIndex("by_org_status_time", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("status", "active")
        .gte("registeredAt", startAt)
        .lte("registeredAt", endAt),
    )
    .order("desc")
    .take(limit + 1);
}

export const getReportSummary = query({
  args: {
    startAt: v.number(),
    endAt: v.number(),
    locationId: v.optional(v.id("locations")),
  },
  returns: v.object({
    state: reportSummaryStateValidator,
    rows: v.array(reportSummaryRowValidator),
  }),
  handler: async (ctx, args) => {
    const auth = await requireWasteExporter(ctx);
    const { organizationId } = auth;
    const locationFilter = resolveLocationFilter(auth, args.locationId);
    validateRange(args.startAt, args.endAt);
    if (args.locationId) {
      await requireLocation(ctx, organizationId, args.locationId);
    }
    const status = await ctx.db
      .query("wasteReportSummaryStatuses")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();
    if (status?.state !== "ready") {
      return { state: "building" as const, rows: [] };
    }

    const groups = new Map<string, ReportSummaryContribution>();
    const endAtExclusive = Math.floor(args.endAt) + 1;
    const firstFullDayStart =
      Math.ceil(args.startAt / UTC_DAY_MS) * UTC_DAY_MS;
    const fullDaysEndExclusive =
      Math.floor(endAtExclusive / UTC_DAY_MS) * UTC_DAY_MS;
    const rawRanges: Array<{ startAt: number; endAt: number }> = [];

    if (firstFullDayStart < fullDaysEndExclusive) {
      const dailyRows = await reportDailySummariesInRange(
        ctx,
        organizationId,
        locationFilter,
        firstFullDayStart,
        fullDaysEndExclusive,
      );
      if (dailyRows.length > MAX_REPORT_SUMMARY_ROWS) {
        return { state: "fallback" as const, rows: [] };
      }
      for (const row of dailyRows) {
        addReportSummaryContribution(groups, row);
      }
      if (args.startAt < firstFullDayStart) {
        rawRanges.push({
          startAt: args.startAt,
          endAt: firstFullDayStart - 1,
        });
      }
      if (fullDaysEndExclusive < endAtExclusive) {
        rawRanges.push({
          startAt: fullDaysEndExclusive,
          endAt: args.endAt,
        });
      }
    } else {
      rawRanges.push({ startAt: args.startAt, endAt: args.endAt });
    }

    let boundaryRowsRead = 0;
    for (const range of rawRanges) {
      const remaining = MAX_REPORT_BOUNDARY_ROWS - boundaryRowsRead;
      const rows = await activeReportRegistrationsInRange(
        ctx,
        organizationId,
        locationFilter,
        range.startAt,
        range.endAt,
        remaining,
      );
      if (rows.length > remaining) {
        return { state: "fallback" as const, rows: [] };
      }
      boundaryRowsRead += rows.length;
      for (const row of rows) {
        addReportSummaryContribution(groups, {
          locationId: row.locationId,
          locationName: row.locationName,
          productId: row.productId,
          productName: row.productName,
          defaultUnitId: row.defaultUnitId,
          defaultUnitName: row.defaultUnitName,
          quantity: row.defaultQuantity,
          count: 1,
          latestRegisteredAt: row.registeredAt,
        });
      }
    }

    if (groups.size > MAX_REPORT_GROUPS) {
      return { state: "fallback" as const, rows: [] };
    }
    const rows = [...groups.values()]
      .sort(
        (left, right) =>
          left.locationName.localeCompare(right.locationName, "da") ||
          left.productName.localeCompare(right.productName, "da"),
      )
      .map((row) => ({
        locationId: row.locationId,
        locationName: row.locationName,
        productId: row.productId,
        productName: row.productName,
        defaultUnitId: row.defaultUnitId,
        defaultUnitName: row.defaultUnitName,
        quantity: row.quantity,
        count: row.count,
      }));
    return { state: "ready" as const, rows };
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
    const auth = await requireWasteReporter(ctx);
    const { organizationId } = auth;
    const locationFilter = resolveLocationFilter(auth, args.locationId);
    validateRange(args.startAt, args.endAt);
    requirePageSize(args.paginationOpts.numItems, MAX_PUBLIC_PAGE_SIZE);
    if (args.locationId) {
      await requireLocation(ctx, organizationId, args.locationId);
    }
    const results = isSingleLocationFilter(locationFilter)
      ? await ctx.db
          .query("wasteRegistrations")
          .withIndex("by_org_location_time", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("locationId", locationFilter.locationId)
              .gte("registeredAt", args.startAt)
              .lte("registeredAt", args.endAt),
          )
          .order("desc")
          .paginate(args.paginationOpts)
      : isMultiLocationFilter(locationFilter)
        ? await ctx.db
            .query("wasteRegistrations")
            .withIndex("by_org_and_time", (q) =>
              q
                .eq("organizationId", organizationId)
                .gte("registeredAt", args.startAt)
                .lte("registeredAt", args.endAt),
            )
            .filter((q) =>
              q.or(
                ...locationFilter.locationIds.map((locationId) =>
                  q.eq(q.field("locationId"), locationId),
                ),
              ),
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
    const auth = await requireWasteExporter(ctx);
    const { organizationId } = auth;
    const locationFilter = resolveLocationFilter(auth, args.locationId);
    validateRange(args.startAt, args.endAt);
    requirePageSize(args.paginationOpts.numItems, MAX_PUBLIC_PAGE_SIZE);
    if (args.locationId) {
      await requireLocation(ctx, organizationId, args.locationId);
    }
    const results = args.activeOnly
      ? isSingleLocationFilter(locationFilter)
        ? await ctx.db
            .query("wasteRegistrations")
            .withIndex("by_org_location_status_time", (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("locationId", locationFilter.locationId)
                .eq("status", "active")
                .gte("registeredAt", args.startAt)
                .lte("registeredAt", args.endAt),
            )
            .order("desc")
            .paginate(args.paginationOpts)
        : isMultiLocationFilter(locationFilter)
          ? await ctx.db
              .query("wasteRegistrations")
              .withIndex("by_org_status_time", (q) =>
                q
                  .eq("organizationId", organizationId)
                  .eq("status", "active")
                  .gte("registeredAt", args.startAt)
                  .lte("registeredAt", args.endAt),
              )
              .filter((q) =>
                q.or(
                  ...locationFilter.locationIds.map((locationId) =>
                    q.eq(q.field("locationId"), locationId),
                  ),
                ),
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
      : isSingleLocationFilter(locationFilter)
        ? await ctx.db
            .query("wasteRegistrations")
            .withIndex("by_org_location_time", (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("locationId", locationFilter.locationId)
                .gte("registeredAt", args.startAt)
                .lte("registeredAt", args.endAt),
            )
            .order("desc")
            .paginate(args.paginationOpts)
        : isMultiLocationFilter(locationFilter)
          ? await ctx.db
              .query("wasteRegistrations")
              .withIndex("by_org_and_time", (q) =>
                q
                  .eq("organizationId", organizationId)
                  .gte("registeredAt", args.startAt)
                  .lte("registeredAt", args.endAt),
              )
              .filter((q) =>
                q.or(
                  ...locationFilter.locationIds.map((locationId) =>
                    q.eq(q.field("locationId"), locationId),
                  ),
                ),
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
