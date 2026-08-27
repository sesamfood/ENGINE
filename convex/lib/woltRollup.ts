import type { Id } from "../_generated/dataModel";
import { dateKey, zonedStart } from "./dashboardMetrics";
import type { WoltOrderSnapshot } from "./woltApi";

export type WoltDailyContribution = {
  organizationId: string;
  locationId: Id<"locations">;
  dayStart: number;
  date: string;
  currency: string;
  revenue: number;
  orderCount: number;
  itemCount: number;
  canceledCount: number;
  totalCount: number;
};

export function woltDailyContribution(
  organizationId: string,
  locationId: Id<"locations">,
  timeZone: string,
  snapshot: Pick<
    WoltOrderSnapshot,
    "occurredAt" | "currency" | "basketPrice" | "itemCount" | "status"
  > & { refundAmount?: number },
): WoltDailyContribution {
  const date = dateKey(snapshot.occurredAt, timeZone);
  const delivered = snapshot.status === "delivered";
  const canceled = snapshot.status === "canceled";
  const refundAmount = snapshot.refundAmount ?? 0;
  return {
    organizationId,
    locationId,
    dayStart: zonedStart(date, timeZone),
    date,
    currency: snapshot.currency,
    revenue: delivered ? Math.max(0, snapshot.basketPrice - refundAmount) : 0,
    orderCount: delivered ? 1 : 0,
    itemCount: delivered ? snapshot.itemCount : 0,
    canceledCount: canceled ? 1 : 0,
    totalCount: delivered || canceled ? 1 : 0,
  };
}

export function subtractWoltContribution(
  next: WoltDailyContribution,
  previous: WoltDailyContribution,
) {
  if (
    next.organizationId !== previous.organizationId ||
    next.locationId !== previous.locationId ||
    next.dayStart !== previous.dayStart ||
    next.currency !== previous.currency
  ) {
    throw new Error("Bidragene tilhører ikke samme dagsrække");
  }
  return {
    revenue: next.revenue - previous.revenue,
    orderCount: next.orderCount - previous.orderCount,
    itemCount: next.itemCount - previous.itemCount,
    canceledCount: next.canceledCount - previous.canceledCount,
    totalCount: next.totalCount - previous.totalCount,
  };
}
