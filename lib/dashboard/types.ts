import type { Id } from "@/convex/_generated/dataModel";

export const DEFAULT_CURRENCY = "DKK";

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
  "woltCancellationRate",
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
export type WidgetRangePreset = Exclude<RangePreset, "custom">;
export const salesSources = ["onlinePos", "wolt", "combined"] as const;
export type SalesSource = (typeof salesSources)[number];

export const salesSourceLabels: Record<SalesSource, string> = {
  onlinePos: "OnlinePOS",
  wolt: "Wolt",
  combined: "OnlinePOS + Wolt",
};

export type CustomMetricDatasetId =
  | "waste"
  | "badDelivery"
  | "transfers"
  | "staffFood"
  | "shifts"
  | "counts"
  | "salesDaily"
  | "salesOrders"
  | "salesLines"
  | "woltOrders"
  | "woltOrderItems";
export type CustomMetricFilter = {
  field: string;
  op: "in" | "notIn";
  values: string[];
};
export type CustomMetricQuerySpec = {
  dataset: CustomMetricDatasetId;
  measure: string;
  filters: CustomMetricFilter[];
};
export type CustomMetricSpec =
  | {
      kind: "single";
      query: CustomMetricQuerySpec;
      dimension?: string;
      bucket: "day" | "week" | "month";
      limit?: number;
    }
  | {
      kind: "ratio";
      numerator: CustomMetricQuerySpec;
      denominator: CustomMetricQuerySpec;
      dimension?: string;
      bucket: "day" | "week" | "month";
      limit?: number;
    };
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
  currency?: string;
  mixedCurrency?: boolean;
  freshness?: {
    lastSuccessAt: number | null;
    staleLocationCount: number;
    errorLocationCount: number;
    affectedLocationNames?: string[];
  };
  // Optional weighted headline for ratio metrics. KPI/%-change prefer this over
  // summing series totals, which is wrong for averages in compare scope.
  headlineTotal?: number;
  headlinePrevious?: number | null;
};

export type WidgetInstance = {
  key: string;
  metric:
    | { kind: "builtin"; id: MetricId }
    | { kind: "custom"; id: Id<"customMetrics"> };
  visualization: VisualizationId;
  size: WidgetSize;
  position?: { column: number; row: number };
  range?: WidgetRangePreset;
  options?: {
    limit?: number;
    yAxisMin?: number;
    yAxisMax?: number;
    /** Sales widgets default to OnlinePOS for backwards compatibility. */
    salesSource?: SalesSource;
  };
};

export type DashboardScope = {
  mode: "aggregate" | "compare";
  locationIds: Id<"locations">[] | null;
  level?: "organization" | "market" | "operator" | "location";
  parentId?: string;
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
