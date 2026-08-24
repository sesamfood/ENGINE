import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { DEFAULT_CURRENCY } from "../../lib/dashboard/types";
import { hasPermission } from "../../lib/auth-permissions";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { query } from "../_generated/server";
import {
  requireLocationAccess,
  requireOrganization,
  type OrganizationAuth,
} from "../lib/auth";

const MAX_PAGE_SIZE = 100;
const MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1_000;

const salesOrderValidator = v.object({
  id: v.id("salesOrders"),
  locationId: v.id("locations"),
  occurredAt: v.string(),
  dayStart: v.string(),
  orderNumber: v.number(),
  revenueMinor: v.number(),
  itemCount: v.number(),
  paymentType: v.string(),
  department: v.string(),
  source: v.string(),
  currency: v.string(),
  updatedAt: v.string(),
});

const salesLineValidator = v.object({
  id: v.id("salesLines"),
  orderId: v.id("salesOrders"),
  locationId: v.id("locations"),
  occurredAt: v.string(),
  sourceProductId: v.string(),
  productName: v.string(),
  quantity: v.number(),
  unitPriceMinor: v.number(),
  revenueMinor: v.number(),
  source: v.string(),
  clerkName: v.union(v.string(), v.null()),
  currency: v.string(),
});

const salesDailyValidator = v.object({
  id: v.id("salesDaily"),
  locationId: v.id("locations"),
  dayStart: v.string(),
  date: v.string(),
  revenueMinor: v.number(),
  orderCount: v.number(),
  itemCount: v.number(),
  currency: v.string(),
  updatedAt: v.string(),
});

function restError(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

function requireApiKeyPrincipal(auth: OrganizationAuth) {
  if (auth.principalKind !== "apiKey" || !auth.apiKeyId) {
    restError("api_key_required", "An API key is required for this operation.");
  }
}

async function requireSalesAccess(
  ctx: QueryCtx,
  kind: "aggregate" | "detail",
) {
  const auth = await requireOrganization(ctx);
  requireApiKeyPrincipal(auth);
  const legacy = hasPermission(
    auth.role,
    auth.permissions,
    "dashboard.viewSales",
  );
  const allowed =
    legacy ||
    hasPermission(
      auth.role,
      auth.permissions,
      kind === "aggregate" ? "sales.viewAggregate" : "sales.viewDetail",
    ) ||
    (kind === "aggregate" &&
      hasPermission(auth.role, auth.permissions, "sales.viewDetail"));
  if (!allowed) {
    restError(
      "forbidden",
      "The API key does not have permission for this operation.",
    );
  }
  if (
    auth.granularity === "anonymous" ||
    (kind === "detail" && auth.granularity !== "detail")
  ) {
    restError(
      "forbidden",
      "The API key role does not allow this level of sales detail.",
    );
  }
  return auth;
}

function requirePageSize(numItems: number) {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > MAX_PAGE_SIZE) {
    restError(
      "page_size_invalid",
      "Page size must be an integer between 1 and 100.",
    );
  }
}

function requireRange(from: number, to: number) {
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from >= to ||
    to - from > MAX_RANGE_MS
  ) {
    restError(
      "sales_range_invalid",
      "The sales range must be positive and no longer than 31 days.",
    );
  }
}

async function locationCurrency(
  ctx: QueryCtx,
  organizationId: string,
  location: Doc<"locations">,
) {
  if (location.currency) return location.currency;
  if (!location.marketId) return DEFAULT_CURRENCY;
  const market = await ctx.db.get("markets", location.marketId);
  return market?.organizationId === organizationId && market.currency
    ? market.currency
    : DEFAULT_CURRENCY;
}

async function readLocation(
  ctx: QueryCtx,
  auth: OrganizationAuth,
  publicId: string,
) {
  const id = ctx.db.normalizeId("locations", publicId);
  const location = id ? await ctx.db.get("locations", id) : null;
  if (!location || location.organizationId !== auth.organizationId) {
    restError("location_not_found", "Location was not found.");
  }
  requireLocationAccess(auth, location._id);
  return {
    location,
    currency: await locationCurrency(ctx, auth.organizationId, location),
  };
}

function orderDto(order: Doc<"salesOrders">, currency: string) {
  return {
    id: order._id,
    locationId: order.locationId,
    occurredAt: new Date(order.occurredAt).toISOString(),
    dayStart: new Date(order.dayStart).toISOString(),
    orderNumber: order.orderNumber,
    revenueMinor: order.revenue,
    itemCount: order.itemCount,
    paymentType: order.paymentType,
    department: order.department,
    source: order.source,
    currency,
    updatedAt: new Date(order.updatedAt).toISOString(),
  };
}

function lineDto(line: Doc<"salesLines">, currency: string) {
  return {
    id: line._id,
    orderId: line.orderId,
    locationId: line.locationId,
    occurredAt: new Date(line.occurredAt).toISOString(),
    sourceProductId: line.externalProductId,
    productName: line.productName,
    quantity: line.quantity,
    unitPriceMinor: line.unitPrice,
    revenueMinor: line.revenue,
    source: line.source,
    clerkName: line.clerkName ?? null,
    currency,
  };
}

function dailyDto(daily: Doc<"salesDaily">, currency: string) {
  return {
    id: daily._id,
    locationId: daily.locationId,
    dayStart: new Date(daily.dayStart).toISOString(),
    date: daily.date,
    revenueMinor: daily.revenue,
    orderCount: daily.orderCount,
    itemCount: daily.itemCount,
    currency,
    updatedAt: new Date(daily.updatedAt).toISOString(),
  };
}

export const listDaily = query({
  args: {
    locationId: v.string(),
    from: v.number(),
    to: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(salesDailyValidator),
  handler: async (ctx, args) => {
    const auth = await requireSalesAccess(ctx, "aggregate");
    requirePageSize(args.paginationOpts.numItems);
    requireRange(args.from, args.to);
    const { location, currency } = await readLocation(
      ctx,
      auth,
      args.locationId,
    );
    const result = await ctx.db
      .query("salesDaily")
      .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("locationId", location._id)
          .gte("dayStart", args.from)
          .lt("dayStart", args.to),
      )
      .order("asc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((daily) => dailyDto(daily, currency)),
    };
  },
});

export const getDaily = query({
  args: { id: v.string() },
  returns: v.union(salesDailyValidator, v.null()),
  handler: async (ctx, args) => {
    const auth = await requireSalesAccess(ctx, "aggregate");
    const id = ctx.db.normalizeId("salesDaily", args.id);
    const daily = id ? await ctx.db.get("salesDaily", id) : null;
    if (!daily || daily.organizationId !== auth.organizationId) return null;
    requireLocationAccess(auth, daily.locationId);
    const location = await ctx.db.get("locations", daily.locationId);
    if (!location || location.organizationId !== auth.organizationId) return null;
    return dailyDto(
      daily,
      await locationCurrency(ctx, auth.organizationId, location),
    );
  },
});

export const listOrders = query({
  args: {
    locationId: v.string(),
    from: v.number(),
    to: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(salesOrderValidator),
  handler: async (ctx, args) => {
    const auth = await requireSalesAccess(ctx, "detail");
    requirePageSize(args.paginationOpts.numItems);
    requireRange(args.from, args.to);
    const { location, currency } = await readLocation(
      ctx,
      auth,
      args.locationId,
    );
    const result = await ctx.db
      .query("salesOrders")
      .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("locationId", location._id)
          .gte("occurredAt", args.from)
          .lt("occurredAt", args.to),
      )
      .order("asc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((order) => orderDto(order, currency)),
    };
  },
});

export const getOrder = query({
  args: { id: v.string() },
  returns: v.union(salesOrderValidator, v.null()),
  handler: async (ctx, args) => {
    const auth = await requireSalesAccess(ctx, "detail");
    const id = ctx.db.normalizeId("salesOrders", args.id);
    const order = id ? await ctx.db.get("salesOrders", id) : null;
    if (!order || order.organizationId !== auth.organizationId) return null;
    requireLocationAccess(auth, order.locationId);
    const location = await ctx.db.get("locations", order.locationId);
    if (!location || location.organizationId !== auth.organizationId) return null;
    return orderDto(
      order,
      await locationCurrency(ctx, auth.organizationId, location),
    );
  },
});

export const listLines = query({
  args: {
    locationId: v.string(),
    from: v.number(),
    to: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(salesLineValidator),
  handler: async (ctx, args) => {
    const auth = await requireSalesAccess(ctx, "detail");
    requirePageSize(args.paginationOpts.numItems);
    requireRange(args.from, args.to);
    const { location, currency } = await readLocation(
      ctx,
      auth,
      args.locationId,
    );
    const result = await ctx.db
      .query("salesLines")
      .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("locationId", location._id)
          .gte("occurredAt", args.from)
          .lt("occurredAt", args.to),
      )
      .order("asc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((line) => lineDto(line, currency)),
    };
  },
});

export const getLine = query({
  args: { id: v.string() },
  returns: v.union(salesLineValidator, v.null()),
  handler: async (ctx, args) => {
    const auth = await requireSalesAccess(ctx, "detail");
    const id = ctx.db.normalizeId("salesLines", args.id);
    const line = id ? await ctx.db.get("salesLines", id) : null;
    if (!line || line.organizationId !== auth.organizationId) return null;
    requireLocationAccess(auth, line.locationId);
    const location = await ctx.db.get("locations", line.locationId);
    if (!location || location.organizationId !== auth.organizationId) return null;
    return lineDto(
      line,
      await locationCurrency(ctx, auth.organizationId, location),
    );
  },
});
