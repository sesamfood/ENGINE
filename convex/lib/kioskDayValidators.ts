import { v } from "convex/values";
import { kioskDestinations } from "../../lib/kiosk";
import { kioskDayTaskIcons } from "../../lib/kiosk-day";

export const kioskDayTaskValidator = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  icon: v.optional(v.union(...kioskDayTaskIcons.map((icon) => v.literal(icon)))),
  link: v.optional(v.union(...kioskDestinations.map((page) => v.literal(page.id)))),
  // A cash report task is done once a cash report is saved, not by ticking it off.
  kind: v.optional(v.literal("cashReport")),
});

const amount = v.union(v.number(), v.null());

export const cashReportValuesValidator = v.object({
  total: amount,
  paymentCard: amount,
  giftCard: amount,
  transactions: amount,
  cashBalance: amount,
  countedCash: amount,
  countedCard: amount,
  difference: amount,
});

// The location's in-store sales in Engine for the same period, when it has any.
export const cashReportSalesValidator = v.object({
  since: v.number(),
  until: v.number(),
  total: v.number(),
  paymentCard: v.number(),
  giftCard: v.number(),
  transactions: v.number(),
  latestSaleAt: v.number(),
});
