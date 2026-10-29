import type { MetricId } from "./types";

// Metrics with one value per location. Lists, forecasts, and external sources stay on the dashboard.
export const operationsMetricIds = [
  "salesRevenue",
  "salesOrderCount",
  "averageBasket",
  "storeSalesRevenue",
  "onlineSalesRevenue",
  "woltCancellationRate",
  "wasteRegistrations",
  "wasteQuantity",
  "badDeliveries",
  "openCounts",
  "countCompliance",
  "transfers",
  "itemsMoved",
  "staffFoodRegistrations",
  "staffFoodPerEmployee",
  "headcountToday",
  "scheduledHours",
] as const satisfies readonly MetricId[];

export type OperationsMetricId = (typeof operationsMetricIds)[number];

export const operationsRanges = ["today", "7days"] as const;
export type OperationsRange = (typeof operationsRanges)[number];

export const MAX_OPERATIONS_METRICS = 8;
