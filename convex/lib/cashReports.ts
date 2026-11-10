import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { paymentTypeKind } from "../../lib/cash-report";
import { getOnlinePosOrganizationSettings } from "../integrations/onlinepos/lib/connections";
import { latestRun } from "./kioskDay";

type Ctx = QueryCtx | MutationCtx;

const MAX_ORDERS = 5000;
const FALLBACK_PERIOD_MS = 24 * 60 * 60 * 1000;

// A cash report covers the sales since the previous closing, like the POS's own end-of-day report.
export async function cashReportPeriodStart(
  ctx: Ctx,
  organizationId: string,
  locationId: Id<"locations">,
  now: number,
) {
  const lastEnd = await latestRun(ctx, organizationId, locationId, "endOfDay");
  return lastEnd?.completedAt ?? now - FALLBACK_PERIOD_MS;
}

export async function latestCashReport(
  ctx: Ctx,
  organizationId: string,
  locationId: Id<"locations">,
  since: number,
) {
  return await ctx.db
    .query("cashReports")
    .withIndex("by_organizationId_and_locationId_and_createdAt", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", locationId).gt("createdAt", since),
    )
    .order("desc")
    .first();
}

// In-store sales in the period, or null without sales data. Online payment types are left out, since
// online orders are not paid at the till.
export async function cashReportSales(
  ctx: Ctx,
  organizationId: string,
  locationId: Id<"locations">,
  since: number,
  until: number,
) {
  const [orders, settings] = await Promise.all([
    ctx.db
      .query("salesOrders")
      .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", locationId)
          .gt("occurredAt", since)
          .lte("occurredAt", until),
      )
      .take(MAX_ORDERS),
    getOnlinePosOrganizationSettings(ctx, organizationId),
  ]);
  const online = new Set(settings?.onlinePaymentTypes ?? []);
  const store = orders.filter((order) => !online.has(order.paymentType));
  if (!store.length) return null;
  const sales = { since, until, total: 0, paymentCard: 0, giftCard: 0, transactions: store.length, latestSaleAt: 0 };
  for (const order of store) {
    sales.total += order.revenue;
    const kind = paymentTypeKind(order.paymentType);
    if (kind) sales[kind] += order.revenue;
    sales.latestSaleAt = Math.max(sales.latestSaleAt, order.occurredAt);
  }
  return sales;
}
