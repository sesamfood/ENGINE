import { v } from "convex/values";

export const metricIdValidator = v.union(
  v.literal("wasteQuantity"),
  v.literal("wasteRegistrations"),
  v.literal("topWastedProducts"),
  v.literal("wasteByCategory"),
  v.literal("badDeliveries"),
  v.literal("countCompliance"),
  v.literal("openCounts"),
  v.literal("transfers"),
  v.literal("itemsMoved"),
  v.literal("topTransferredProducts"),
  v.literal("staffFoodRegistrations"),
  v.literal("staffFoodPerEmployee"),
  v.literal("scheduledHours"),
  v.literal("headcountToday"),
  v.literal("locationComparison"),
  v.literal("salesRevenue"),
  v.literal("salesOrderCount"),
  v.literal("averageBasket"),
);

export const visualizationValidator = v.union(
  v.literal("kpi"),
  v.literal("line"),
  v.literal("bar"),
  v.literal("area"),
  v.literal("donut"),
  v.literal("gauge"),
  v.literal("list"),
  v.literal("table"),
);

export const widgetSizeValidator = v.union(
  v.literal("1x1"),
  v.literal("1x2"),
  v.literal("2x1"),
  v.literal("2x2"),
  v.literal("4x2"),
);

export const widgetValidator = v.object({
  key: v.string(),
  metricId: metricIdValidator,
  visualization: visualizationValidator,
  size: widgetSizeValidator,
  position: v.optional(v.object({ column: v.number(), row: v.number() })),
  options: v.optional(v.object({ limit: v.optional(v.number()) })),
});

export const scopeValidator = v.object({
  mode: v.union(v.literal("aggregate"), v.literal("compare")),
  locationIds: v.union(v.array(v.id("locations")), v.null()),
});

export const rangeValidator = v.object({
  preset: v.union(
    v.literal("today"),
    v.literal("yesterday"),
    v.literal("7days"),
    v.literal("30days"),
    v.literal("thisMonth"),
    v.literal("custom"),
  ),
  from: v.optional(v.string()),
  to: v.optional(v.string()),
});

export const metricPointValidator = v.object({
  t: v.number(),
  value: v.number(),
});

export const metricSeriesValidator = v.object({
  key: v.string(),
  label: v.string(),
  points: v.array(metricPointValidator),
  total: v.number(),
  previousTotal: v.union(v.number(), v.null()),
});

export const metricResultValidator = v.object({
  unit: v.union(
    v.literal("count"),
    v.literal("currency"),
    v.literal("percent"),
    v.literal("quantity"),
    v.literal("hours"),
  ),
  series: v.array(metricSeriesValidator),
  breakdown: v.optional(
    v.array(v.object({ key: v.string(), label: v.string(), value: v.number() })),
  ),
  target: v.optional(v.number()),
  truncated: v.optional(v.boolean()),
  headlineTotal: v.optional(v.number()),
  headlinePrevious: v.optional(v.union(v.number(), v.null())),
});

export const metricRequestValidator = v.object({
  key: v.string(),
  metricId: metricIdValidator,
  visualization: visualizationValidator,
});

export const keyedMetricResultValidator = v.object({
  key: v.string(),
  result: metricResultValidator,
});

export const dashboardConfigValidator = v.object({
  widgets: v.array(widgetValidator),
  scope: scopeValidator,
  range: rangeValidator,
  updatedAt: v.union(v.number(), v.null()),
});
