import type { Id } from "@/convex/_generated/dataModel";

export const metricIds = [
  "wasteQuantity",
  "wasteRegistrations",
  "topWastedProducts",
  "wasteByCategory",
  "badDeliveries",
  "countCompliance",
  "openCounts",
  "transfers",
  "itemsMoved",
  "topTransferredProducts",
  "staffFoodRegistrations",
  "staffFoodPerEmployee",
  "scheduledHours",
  "headcountToday",
  "locationComparison",
  "salesRevenue",
  "salesOrderCount",
  "averageBasket",
] as const;

export const visualizationIds = [
  "kpi",
  "line",
  "bar",
  "area",
  "donut",
  "gauge",
  "list",
  "table",
] as const;

export const widgetSizes = ["1x1", "1x2", "2x1", "2x2", "4x2"] as const;

export const rangePresets = [
  "today",
  "yesterday",
  "7days",
  "30days",
  "thisMonth",
  "custom",
] as const;

export type MetricId = (typeof metricIds)[number];
export type VisualizationId = (typeof visualizationIds)[number];
export type WidgetSize = (typeof widgetSizes)[number];
export type RangePreset = (typeof rangePresets)[number];
export type MetricUnit =
  | "count"
  | "currency"
  | "percent"
  | "quantity"
  | "hours";

export type MetricSeries = {
  key: string;
  label: string;
  points: { t: number; value: number }[];
  total: number;
  previousTotal: number | null;
};

export type MetricResult = {
  unit: MetricUnit;
  series: MetricSeries[];
  breakdown?: { key: string; label: string; value: number }[];
  target?: number;
  truncated?: boolean;
};

export type WidgetInstance = {
  key: string;
  metricId: MetricId;
  visualization: VisualizationId;
  size: WidgetSize;
  position?: { column: number; row: number };
  options?: { limit?: number };
};

export type DashboardScope = {
  mode: "aggregate" | "compare";
  locationIds: Id<"locations">[] | null;
};

export type DashboardRange = {
  preset: RangePreset;
  from?: string;
  to?: string;
};

export type DashboardConfig = {
  widgets: WidgetInstance[];
  scope: DashboardScope;
  range: DashboardRange;
  updatedAt: number | null;
};
