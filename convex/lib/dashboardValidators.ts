import { v } from "convex/values";
import { salesSourceValidator } from "./woltValidators";

export { salesSourceValidator } from "./woltValidators";

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
  v.literal("woltCancellationRate"),
);

export const dashboardSummarySourceValidator = v.union(
  v.literal("waste"),
  v.literal("badDeliveries"),
  v.literal("staffFood"),
  v.literal("transfers"),
  v.literal("scheduledShifts"),
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

export const widgetRangePresetValidator = v.union(
  v.literal("today"),
  v.literal("yesterday"),
  v.literal("7days"),
  v.literal("30days"),
  v.literal("thisMonth"),
);

export const widgetMetricValidator = v.union(
  v.object({ kind: v.literal("builtin"), id: metricIdValidator }),
  v.object({ kind: v.literal("custom"), id: v.id("customMetrics") }),
);

export const datasetIdValidator = v.union(
  v.literal("waste"),
  v.literal("badDelivery"),
  v.literal("transfers"),
  v.literal("staffFood"),
  v.literal("shifts"),
  v.literal("counts"),
  v.literal("salesDaily"),
  v.literal("salesOrders"),
  v.literal("salesLines"),
  v.literal("woltOrders"),
  v.literal("woltOrderItems"),
);

export const querySpecValidator = v.object({
  dataset: datasetIdValidator,
  measure: v.string(),
  filters: v.array(
    v.object({
      field: v.string(),
      op: v.union(v.literal("in"), v.literal("notIn")),
      values: v.array(v.string()),
    }),
  ),
});

const metricBucketValidator = v.union(
  v.literal("day"),
  v.literal("week"),
  v.literal("month"),
);

const dimensionFilterValidator = v.object({
  op: v.union(v.literal("in"), v.literal("notIn")),
  values: v.array(v.string()),
});

export const customMetricSpecValidator = v.union(
  v.object({
    kind: v.literal("single"),
    query: querySpecValidator,
    dimension: v.optional(v.string()),
    dimensionFilter: v.optional(dimensionFilterValidator),
    bucket: metricBucketValidator,
    limit: v.optional(v.number()),
  }),
  v.object({
    kind: v.literal("ratio"),
    numerator: querySpecValidator,
    denominator: querySpecValidator,
    dimension: v.optional(v.string()),
    dimensionFilter: v.optional(dimensionFilterValidator),
    bucket: metricBucketValidator,
    limit: v.optional(v.number()),
  }),
);

export const widgetValidator = v.object({
  key: v.string(),
  metric: widgetMetricValidator,
  visualization: visualizationValidator,
  size: widgetSizeValidator,
  position: v.optional(v.object({ column: v.number(), row: v.number() })),
  range: v.optional(widgetRangePresetValidator),
  options: v.optional(
    v.object({
      limit: v.optional(v.number()),
      yAxisMin: v.optional(v.number()),
      yAxisMax: v.optional(v.number()),
      salesSource: v.optional(salesSourceValidator),
    }),
  ),
});

export const scopeValidator = v.object({
  mode: v.union(v.literal("aggregate"), v.literal("compare")),
  locationIds: v.union(v.array(v.id("locations")), v.null()),
  level: v.optional(
    v.union(
      v.literal("organization"),
      v.literal("market"),
      v.literal("operator"),
      v.literal("location"),
    ),
  ),
  parentId: v.optional(v.string()),
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
    v.array(
      v.object({ key: v.string(), label: v.string(), value: v.number() }),
    ),
  ),
  target: v.optional(v.number()),
  truncated: v.optional(v.boolean()),
  currency: v.optional(v.string()),
  mixedCurrency: v.optional(v.boolean()),
  freshness: v.optional(
    v.object({
      lastSuccessAt: v.union(v.number(), v.null()),
      staleLocationCount: v.number(),
      errorLocationCount: v.number(),
      affectedLocationNames: v.optional(v.array(v.string())),
    }),
  ),
  headlineTotal: v.optional(v.number()),
  headlinePrevious: v.optional(v.union(v.number(), v.null())),
});

export const metricRequestValidator = v.object({
  key: v.string(),
  metric: widgetMetricValidator,
  visualization: visualizationValidator,
  range: v.optional(widgetRangePresetValidator),
  salesSource: v.optional(salesSourceValidator),
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
