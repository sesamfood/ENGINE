import { ConvexError } from "convex/values";
import { dashboardDatasets } from "../../lib/dashboard/datasets";
import type {
  CustomMetricQuerySpec,
  CustomMetricSpec,
  MetricResult,
  MetricUnit,
} from "../../lib/dashboard/types";
import type { DataGranularity } from "../../lib/auth-permissions";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  dateKey,
  zonedStart,
  type DashboardMetricParams,
} from "./dashboardMetrics";

const MAX_ROWS = 5_000;
const MAX_TRANSFER_DETAILS = 500;

type MetricRow = {
  timestamp: number;
  locationId: Id<"locations">;
  value: number;
  dimensionKey: string;
  dimensionLabel: string;
  distinctKey?: string;
};

type RowResult = { rows: MetricRow[]; truncated: boolean };

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

function matchesFilters(
  fields: Record<string, string>,
  filters: CustomMetricQuerySpec["filters"],
) {
  return filters.every((filter) => {
    const included = filter.values.includes(fields[filter.field] ?? "");
    return filter.op === "in" ? included : !included;
  });
}

function dimension(
  id: string | undefined,
  fields: Record<string, { key: string; label: string }>,
) {
  return id
    ? (fields[id] ?? { key: "unknown", label: "Ukendt" })
    : { key: "all", label: "Alle" };
}

async function locationRows<T>(
  params: DashboardMetricParams,
  load: (locationId: Id<"locations">, remaining: number) => Promise<T[]>,
) {
  const rows: T[] = [];
  let truncated = false;
  for (const location of params.locations) {
    const remaining = MAX_ROWS - rows.length;
    if (remaining === 0) {
      truncated = true;
      break;
    }
    const part = await load(location.id, remaining);
    rows.push(...part.slice(0, remaining));
    if (part.length > remaining) {
      truncated = true;
      break;
    }
  }
  return { rows, truncated };
}

async function wasteRows(
  ctx: QueryCtx,
  spec: CustomMetricQuerySpec,
  dimensionId: string | undefined,
  params: DashboardMetricParams,
): Promise<RowResult> {
  const result = await locationRows(params, async (locationId, remaining) =>
    await ctx.db
      .query("wasteRegistrations")
      .withIndex("by_org_location_time", (q) =>
        q
          .eq("organizationId", params.organizationId)
          .eq("locationId", locationId)
          .gte("registeredAt", params.previousFrom)
          .lt("registeredAt", params.to),
      )
      .take(remaining + 1),
  );
  const categoryByProduct = new Map<
    Id<"products">,
    { key: string; label: string }
  >();
  if (dimensionId === "category") {
    const products = await Promise.all(
      [...new Set(result.rows.map((row) => row.productId))].map((productId) =>
        ctx.db.get("products", productId),
      ),
    );
    const categories = await Promise.all(
      [...new Set(products.flatMap((product) => product?.categoryId ?? []))].map(
        (categoryId) => ctx.db.get("categories", categoryId),
      ),
    );
    const names = new Map(
      categories.flatMap((category) =>
        category ? [[category._id, category.name] as const] : [],
      ),
    );
    for (const product of products) {
      if (!product) continue;
      categoryByProduct.set(
        product._id,
        product.categoryId
          ? {
              key: product.categoryId,
              label: names.get(product.categoryId) ?? "Ukendt kategori",
            }
          : { key: "uncategorized", label: "Uden kategori" },
      );
    }
  }
  return {
    truncated: result.truncated,
    rows: result.rows.flatMap((row) => {
      if (
        !matchesFilters(
          { status: row.status, source: row.source },
          spec.filters,
        )
      ) {
        return [];
      }
      const selected = dimension(dimensionId, {
        product: { key: row.productId, label: row.productName },
        category:
          categoryByProduct.get(row.productId) ??
          ({ key: "uncategorized", label: "Uden kategori" } as const),
        unit: { key: row.defaultUnitId, label: row.defaultUnitName },
        location: { key: row.locationId, label: row.locationName },
        source: { key: row.source, label: row.source },
        registeredBy: {
          key: row.registeredBy,
          label: row.registeredByName,
        },
      });
      return [{
        timestamp: row.registeredAt,
        locationId: row.locationId,
        value: spec.measure === "quantity" ? row.defaultQuantity : 1,
        dimensionKey: selected.key,
        dimensionLabel: selected.label,
      }];
    }),
  };
}

async function badDeliveryRows(
  ctx: QueryCtx,
  spec: CustomMetricQuerySpec,
  dimensionId: string | undefined,
  params: DashboardMetricParams,
): Promise<RowResult> {
  const result = await locationRows(params, async (locationId, remaining) =>
    await ctx.db
      .query("badDeliveries")
      .withIndex("by_organizationId_and_locationId_and_registeredAt", (q) =>
        q
          .eq("organizationId", params.organizationId)
          .eq("locationId", locationId)
          .gte("registeredAt", params.previousFrom)
          .lt("registeredAt", params.to),
      )
      .take(remaining + 1),
  );
  return {
    truncated: result.truncated,
    rows: result.rows.flatMap((row) => {
      if (
        !matchesFilters(
          {
            status: row.status,
            deductFromStock: String(row.deductFromStock),
          },
          spec.filters,
        )
      ) {
        return [];
      }
      const selected = dimension(dimensionId, {
        location: { key: row.locationId, label: row.locationName },
        registeredBy: {
          key: row.registeredBy,
          label: row.registeredByName,
        },
      });
      return [{
        timestamp: row.registeredAt,
        locationId: row.locationId,
        value: spec.measure === "itemCount" ? row.itemCount : 1,
        dimensionKey: selected.key,
        dimensionLabel: selected.label,
      }];
    }),
  };
}

async function transferRows(
  ctx: QueryCtx,
  spec: CustomMetricQuerySpec,
  dimensionId: string | undefined,
  params: DashboardMetricParams,
): Promise<RowResult> {
  const byId = new Map<Id<"transfers">, Doc<"transfers">>();
  let truncated = false;
  for (const location of params.locations) {
    for (const direction of ["from", "to"] as const) {
      const remaining = MAX_ROWS - byId.size;
      if (remaining === 0) {
        truncated = true;
        break;
      }
      const part =
        direction === "from"
          ? await ctx.db
              .query("transfers")
              .withIndex(
                "by_organizationId_and_fromLocationId_and_transferredAt",
                (q) =>
                  q
                    .eq("organizationId", params.organizationId)
                    .eq("fromLocationId", location.id)
                    .gte("transferredAt", params.previousFrom)
                    .lt("transferredAt", params.to),
              )
              .take(remaining + 1)
          : await ctx.db
              .query("transfers")
              .withIndex(
                "by_organizationId_and_toLocationId_and_transferredAt",
                (q) =>
                  q
                    .eq("organizationId", params.organizationId)
                    .eq("toLocationId", location.id)
                    .gte("transferredAt", params.previousFrom)
                    .lt("transferredAt", params.to),
              )
              .take(remaining + 1);
      for (const transfer of part.slice(0, remaining)) {
        byId.set(transfer._id, transfer);
      }
      if (part.length > remaining) truncated = true;
    }
  }
  const scoped = [...byId.values()];
  const locationNames = new Map(
    params.locations.map((location) => [location.id, location.name]),
  );
  if (
    spec.measure === "transfers" &&
    dimensionId !== "product" &&
    dimensionId !== "unit"
  ) {
    return {
      truncated,
      rows: scoped.map((row) => {
        const selected = dimension(dimensionId, {
          fromLocation: {
            key: row.fromLocationId,
            label: locationNames.get(row.fromLocationId) ?? "Ukendt lokation",
          },
          toLocation: {
            key: row.toLocationId,
            label: locationNames.get(row.toLocationId) ?? "Ukendt lokation",
          },
          responsible: {
            key: row.responsibleUserId,
            label: row.responsibleName,
          },
        });
        return {
          timestamp: row.transferredAt,
          locationId: row.fromLocationId,
          value: 1,
          dimensionKey: selected.key,
          dimensionLabel: selected.label,
        };
      }),
    };
  }
  const items: Doc<"transferItems">[] = [];
  const detailedTransfers = scoped.slice(0, MAX_TRANSFER_DETAILS);
  let itemRowsTruncated =
    truncated || detailedTransfers.length < scoped.length;
  for (const transfer of detailedTransfers) {
    const remaining = MAX_ROWS - items.length;
    if (remaining === 0) {
      itemRowsTruncated = true;
      break;
    }
    const part = await ctx.db
      .query("transferItems")
      .withIndex("by_organizationId_and_transferId", (q) =>
        q
          .eq("organizationId", params.organizationId)
          .eq("transferId", transfer._id),
      )
      .take(remaining + 1);
    items.push(...part.slice(0, remaining));
    if (part.length > remaining) itemRowsTruncated = true;
  }
  const transferById = new Map(
    detailedTransfers.map((transfer) => [transfer._id, transfer]),
  );
  return {
    truncated: itemRowsTruncated,
    rows: items.flatMap((item) => {
      const transfer = transferById.get(item.transferId);
      if (!transfer) return [];
      const selected = dimension(dimensionId, {
        fromLocation: {
          key: transfer.fromLocationId,
          label: locationNames.get(transfer.fromLocationId) ?? "Ukendt lokation",
        },
        toLocation: {
          key: transfer.toLocationId,
          label: locationNames.get(transfer.toLocationId) ?? "Ukendt lokation",
        },
        product: { key: item.productId, label: item.productName },
        unit: { key: item.unitId, label: item.unitName },
        responsible: {
          key: transfer.responsibleUserId,
          label: transfer.responsibleName,
        },
      });
      return [{
        timestamp: transfer.transferredAt,
        locationId: transfer.fromLocationId,
        value:
          spec.measure === "transfers"
            ? 1
            : item.quantity * (item.factorToDefault ?? 1),
        dimensionKey: selected.key,
        dimensionLabel: selected.label,
        distinctKey:
          spec.measure === "transfers" ? transfer._id : undefined,
      }];
    }),
  };
}

async function staffFoodRows(
  ctx: QueryCtx,
  spec: CustomMetricQuerySpec,
  dimensionId: string | undefined,
  params: DashboardMetricParams,
): Promise<RowResult> {
  const result = await locationRows(params, async (locationId, remaining) =>
    await ctx.db
      .query("staffFoodRegistrations")
      .withIndex("by_organizationId_and_locationId_and_registeredAt", (q) =>
        q
          .eq("organizationId", params.organizationId)
          .eq("locationId", locationId)
          .gte("registeredAt", params.previousFrom)
          .lt("registeredAt", params.to),
      )
      .take(remaining + 1),
  );
  return {
    truncated: result.truncated,
    rows: result.rows.flatMap((row) => {
      if (
        !matchesFilters(
          { status: row.status, sessionSource: row.sessionSource },
          spec.filters,
        )
      ) {
        return [];
      }
      const selected = dimension(dimensionId, {
        employee: { key: row.employeeId, label: row.employeeName },
        product: { key: row.productId, label: row.productName },
        category: { key: row.categoryId, label: row.categoryName },
        location: { key: row.locationId, label: row.locationName },
        sessionSource: { key: row.sessionSource, label: row.sessionSource },
      });
      return [{
        timestamp: row.registeredAt,
        locationId: row.locationId,
        value: spec.measure === "quantity" ? row.defaultQuantity : 1,
        dimensionKey: selected.key,
        dimensionLabel: selected.label,
        distinctKey:
          spec.measure === "employees" ? row.employeeId : undefined,
      }];
    }),
  };
}

async function shiftRows(
  ctx: QueryCtx,
  spec: CustomMetricQuerySpec,
  dimensionId: string | undefined,
  params: DashboardMetricParams,
): Promise<RowResult> {
  const result = await locationRows(params, async (locationId, remaining) =>
    await ctx.db
      .query("scheduledShifts")
      .withIndex("by_organizationId_and_locationId_and_startsAt", (q) =>
        q
          .eq("organizationId", params.organizationId)
          .eq("locationId", locationId)
          .gte("startsAt", params.previousFrom)
          .lt("startsAt", params.to),
      )
      .take(remaining + 1),
  );
  const employeeIds = [...new Set(result.rows.map((row) => row.employeeId))];
  const employees = await Promise.all(
    employeeIds.map((employeeId) => ctx.db.get("employees", employeeId)),
  );
  const employeeNames = new Map(
    employees.flatMap((employee) =>
      employee ? [[employee._id, employee.displayName] as const] : [],
    ),
  );
  const locationNames = new Map(
    params.locations.map((location) => [location.id, location.name]),
  );
  return {
    truncated: result.truncated,
    rows: result.rows.flatMap((row) => {
      if (
        !matchesFilters({ roleName: row.roleName ?? "" }, spec.filters)
      ) {
        return [];
      }
      const selected = dimension(dimensionId, {
        employee: {
          key: row.employeeId,
          label: employeeNames.get(row.employeeId) ?? "Ukendt medarbejder",
        },
        location: {
          key: row.locationId,
          label: locationNames.get(row.locationId) ?? "Ukendt lokation",
        },
        roleName: {
          key: row.roleName ?? "unknown",
          label: row.roleName ?? "Uden rolle",
        },
      });
      return [{
        timestamp: row.startsAt,
        locationId: row.locationId,
        value:
          spec.measure === "hours"
            ? Math.max(0, row.endsAt - row.startsAt) / 3_600_000
            : 1,
        dimensionKey: selected.key,
        dimensionLabel: selected.label,
        distinctKey:
          spec.measure === "employees" ? row.employeeId : undefined,
      }];
    }),
  };
}

async function countRows(
  ctx: QueryCtx,
  spec: CustomMetricQuerySpec,
  dimensionId: string | undefined,
  params: DashboardMetricParams,
): Promise<RowResult> {
  const result = await locationRows(params, async (locationId, remaining) =>
    await ctx.db
      .query("counts")
      .withIndex("by_organizationId_and_locationId_and_periodKey", (q) =>
        q.eq("organizationId", params.organizationId).eq("locationId", locationId),
      )
      .order("desc")
      .take(remaining + 1),
  );
  const locationNames = new Map(
    params.locations.map((location) => [location.id, location.name]),
  );
  return {
    truncated: result.truncated,
    rows: result.rows.flatMap((row) => {
      const timestamp = row.submittedAt ?? row._creationTime;
      if (
        timestamp < params.previousFrom ||
        timestamp >= params.to ||
        !matchesFilters({ status: row.status }, spec.filters)
      ) {
        return [];
      }
      const selected = dimension(dimensionId, {
        location: {
          key: row.locationId,
          label: locationNames.get(row.locationId) ?? "Ukendt lokation",
        },
        status: { key: row.status, label: row.status },
        periodKey: { key: row.periodKey, label: row.periodKey },
      });
      return [{
        timestamp,
        locationId: row.locationId,
        value: spec.measure === "submitted" && row.status !== "submitted" ? 0 : 1,
        dimensionKey: selected.key,
        dimensionLabel: selected.label,
      }];
    }),
  };
}

async function salesDailyRows(
  ctx: QueryCtx,
  spec: CustomMetricQuerySpec,
  dimensionId: string | undefined,
  params: DashboardMetricParams,
): Promise<RowResult> {
  const result = await locationRows(params, async (locationId, remaining) =>
    await ctx.db
      .query("salesDaily")
      .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
        q
          .eq("organizationId", params.organizationId)
          .eq("locationId", locationId)
          .gte("dayStart", params.previousFrom)
          .lt("dayStart", params.to),
      )
      .take(remaining + 1),
  );
  const locationNames = new Map(
    params.locations.map((location) => [location.id, location.name]),
  );
  return {
    truncated: result.truncated,
    rows: result.rows.map((row) => {
      const selected = dimension(dimensionId, {
        location: {
          key: row.locationId,
          label: locationNames.get(row.locationId) ?? "Ukendt lokation",
        },
      });
      return {
        timestamp: row.dayStart,
        locationId: row.locationId,
        value:
          spec.measure === "revenue"
            ? row.revenue / 100
            : spec.measure === "orders"
              ? row.orderCount
              : row.itemCount,
        dimensionKey: selected.key,
        dimensionLabel: selected.label,
      };
    }),
  };
}

async function salesOrderRows(
  ctx: QueryCtx,
  spec: CustomMetricQuerySpec,
  dimensionId: string | undefined,
  params: DashboardMetricParams,
): Promise<RowResult> {
  const result = await locationRows(params, async (locationId, remaining) =>
    await ctx.db
      .query("salesOrders")
      .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
        q
          .eq("organizationId", params.organizationId)
          .eq("locationId", locationId)
          .gte("occurredAt", params.previousFrom)
          .lt("occurredAt", params.to),
      )
      .take(remaining + 1),
  );
  const locationNames = new Map(
    params.locations.map((location) => [location.id, location.name]),
  );
  const hourFormatter = new Intl.DateTimeFormat("da-DK", {
    timeZone: params.timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  });
  return {
    truncated: result.truncated,
    rows: result.rows.flatMap((row) => {
      if (
        !matchesFilters(
          { paymentType: row.paymentType, department: row.department },
          spec.filters,
        )
      ) {
        return [];
      }
      const hour = hourFormatter.format(row.occurredAt);
      const selected = dimension(dimensionId, {
        location: {
          key: row.locationId,
          label: locationNames.get(row.locationId) ?? "Ukendt lokation",
        },
        paymentType: { key: row.paymentType || "unknown", label: row.paymentType || "Ukendt" },
        department: { key: row.department || "unknown", label: row.department || "Ukendt" },
        hourOfDay: {
          key: hour,
          label: `${hour}:00`,
        },
      });
      return [{
        timestamp: row.occurredAt,
        locationId: row.locationId,
        value:
          spec.measure === "revenue"
            ? row.revenue / 100
            : spec.measure === "items"
              ? row.itemCount
              : 1,
        dimensionKey: selected.key,
        dimensionLabel: selected.label,
      }];
    }),
  };
}

async function salesLineRows(
  ctx: QueryCtx,
  spec: CustomMetricQuerySpec,
  dimensionId: string | undefined,
  params: DashboardMetricParams,
): Promise<RowResult> {
  const result = await locationRows(params, async (locationId, remaining) =>
    await ctx.db
      .query("salesLines")
      .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
        q
          .eq("organizationId", params.organizationId)
          .eq("locationId", locationId)
          .gte("occurredAt", params.previousFrom)
          .lt("occurredAt", params.to),
      )
      .take(remaining + 1),
  );
  const locationNames = new Map(
    params.locations.map((location) => [location.id, location.name]),
  );
  return {
    truncated: result.truncated,
    rows: result.rows.flatMap((row) => {
      if (
        !matchesFilters({ product: row.externalProductId }, spec.filters)
      ) {
        return [];
      }
      const selected = dimension(dimensionId, {
        product: { key: row.externalProductId, label: row.productName },
        location: {
          key: row.locationId,
          label: locationNames.get(row.locationId) ?? "Ukendt lokation",
        },
      });
      return [{
        timestamp: row.occurredAt,
        locationId: row.locationId,
        value:
          spec.measure === "revenue"
            ? row.revenue / 100
            : spec.measure === "quantity"
              ? row.quantity
              : 1,
        dimensionKey: selected.key,
        dimensionLabel: selected.label,
      }];
    }),
  };
}

function bucketStart(
  timestamp: number,
  bucket: CustomMetricSpec["bucket"],
  timeZone: string,
) {
  const key = dateKey(timestamp, timeZone);
  if (bucket === "month") return zonedStart(`${key.slice(0, 7)}-01`, timeZone);
  if (bucket === "week") {
    const [year, month, day] = key.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - mondayOffset);
    return zonedStart(date.toISOString().slice(0, 10), timeZone);
  }
  return zonedStart(key, timeZone);
}

function sumRows(rows: MetricRow[]) {
  const distinct = rows.some((row) => row.distinctKey !== undefined);
  if (!distinct) return rows.reduce((sum, row) => sum + row.value, 0);
  return new Set(rows.map((row) => row.distinctKey)).size;
}

async function loadRows(
  ctx: QueryCtx,
  query: CustomMetricQuerySpec,
  dimensionId: string | undefined,
  params: DashboardMetricParams,
) {
  switch (query.dataset) {
    case "waste":
      return await wasteRows(ctx, query, dimensionId, params);
    case "badDelivery":
      return await badDeliveryRows(ctx, query, dimensionId, params);
    case "transfers":
      return await transferRows(ctx, query, dimensionId, params);
    case "staffFood":
      return await staffFoodRows(ctx, query, dimensionId, params);
    case "shifts":
      return await shiftRows(ctx, query, dimensionId, params);
    case "counts":
      return await countRows(ctx, query, dimensionId, params);
    case "salesDaily":
      return await salesDailyRows(ctx, query, dimensionId, params);
    case "salesOrders":
      return await salesOrderRows(ctx, query, dimensionId, params);
    case "salesLines":
      return await salesLineRows(ctx, query, dimensionId, params);
  }
}

function measureUnit(query: CustomMetricQuerySpec) {
  const dataset = dashboardDatasets[query.dataset];
  return dataset.measures.find((measure) => measure.id === query.measure)!.unit;
}

async function singleResult(
  ctx: QueryCtx,
  query: CustomMetricQuerySpec,
  dimensionId: string | undefined,
  bucket: CustomMetricSpec["bucket"],
  limit: number,
  params: DashboardMetricParams,
  selectedDimensionKeys?: string[],
): Promise<MetricResult> {
  const loaded = await loadRows(ctx, query, dimensionId, params);
  const locationNames = new Map(
    params.locations.map((location) => [location.id, location.name]),
  );
  const current = loaded.rows.filter(
    (row) => row.timestamp >= params.from && row.timestamp < params.to,
  );
  const previous = loaded.rows.filter(
    (row) =>
      row.timestamp >= params.previousFrom && row.timestamp < params.previousTo,
  );
  const labels = new Map<string, string>();
  for (const row of loaded.rows) labels.set(row.dimensionKey, row.dimensionLabel);
  let groupKeys: string[];
  if (dimensionId) {
    if (selectedDimensionKeys) {
      groupKeys = selectedDimensionKeys;
    } else {
      const totals = new Map<string, number>();
      for (const row of current) {
        totals.set(
          row.dimensionKey,
          (totals.get(row.dimensionKey) ?? 0) + row.value,
        );
      }
      groupKeys = [...totals.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, limit)
        .map(([key]) => key);
    }
  } else if (params.compare) {
    groupKeys = params.locations.map((location) => location.id);
    for (const location of params.locations) labels.set(location.id, location.name);
  } else {
    groupKeys = ["all"];
    labels.set("all", "Alle lokationer");
  }
  const topKeys = new Set(groupKeys);
  if (
    dimensionId &&
    loaded.rows.some((row) => !topKeys.has(row.dimensionKey))
  ) {
    groupKeys.push("other");
    labels.set("other", "Andre");
  }
  const groupFor = (row: MetricRow) => {
    if (dimensionId) return topKeys.has(row.dimensionKey) ? row.dimensionKey : "other";
    return params.compare ? row.locationId : "all";
  };
  const series = groupKeys.map((key) => {
    const currentRows = current.filter((row) => groupFor(row) === key);
    const previousRows = previous.filter((row) => groupFor(row) === key);
    const byBucket = new Map<number, MetricRow[]>();
    for (const row of currentRows) {
      const start = bucketStart(row.timestamp, bucket, params.timeZone);
      byBucket.set(start, [...(byBucket.get(start) ?? []), row]);
    }
    return {
      key,
      label: labels.get(key) ?? locationNames.get(key as Id<"locations">) ?? key,
      points: [...byBucket.entries()]
        .sort(([left], [right]) => left - right)
        .map(([t, rows]) => ({ t, value: rounded(sumRows(rows)) })),
      total: rounded(sumRows(currentRows)),
      previousTotal: rounded(sumRows(previousRows)),
    };
  });
  return {
    unit: measureUnit(query),
    series,
    ...(dimensionId
      ? {
          breakdown: series.map((item) => ({
            key: item.key,
            label: item.label,
            value: item.total,
          })),
        }
      : {}),
    truncated: loaded.truncated || undefined,
  };
}

function ratioUnit(numerator: MetricUnit, denominator: MetricUnit): MetricUnit {
  if (numerator === "currency" && (denominator === "count" || denominator === "hours")) {
    return "currency";
  }
  return "count";
}

function ratioResult(numerator: MetricResult, denominator: MetricResult): MetricResult {
  const denominatorByKey = new Map(
    denominator.series.map((series) => [series.key, series]),
  );
  const series = numerator.series.map((numeratorSeries) => {
    const denominatorSeries = denominatorByKey.get(numeratorSeries.key);
    const denominatorPoints = new Map(
      denominatorSeries?.points.map((point) => [point.t, point.value]) ?? [],
    );
    return {
      key: numeratorSeries.key,
      label: numeratorSeries.label,
      points: numeratorSeries.points.flatMap((point) => {
        const divisor = denominatorPoints.get(point.t) ?? 0;
        return divisor === 0
          ? []
          : [{ t: point.t, value: rounded(point.value / divisor) }];
      }),
      total:
        denominatorSeries && denominatorSeries.total !== 0
          ? rounded(numeratorSeries.total / denominatorSeries.total)
          : 0,
      previousTotal:
        denominatorSeries?.previousTotal && numeratorSeries.previousTotal !== null
          ? rounded(numeratorSeries.previousTotal / denominatorSeries.previousTotal)
          : null,
    };
  });
  const numeratorTotal = numerator.series.reduce((sum, item) => sum + item.total, 0);
  const denominatorTotal = denominator.series.reduce((sum, item) => sum + item.total, 0);
  const numeratorPrevious = numerator.series.reduce(
    (sum, item) => sum + (item.previousTotal ?? 0),
    0,
  );
  const denominatorPrevious = denominator.series.reduce(
    (sum, item) => sum + (item.previousTotal ?? 0),
    0,
  );
  return {
    unit: ratioUnit(numerator.unit, denominator.unit),
    series,
    breakdown: numerator.breakdown
      ? series.map((item) => ({ key: item.key, label: item.label, value: item.total }))
      : undefined,
    truncated: numerator.truncated || denominator.truncated || undefined,
    headlineTotal:
      denominatorTotal === 0 ? 0 : rounded(numeratorTotal / denominatorTotal),
    headlinePrevious:
      denominatorPrevious === 0
        ? null
        : rounded(numeratorPrevious / denominatorPrevious),
  };
}

function aggregateLocationSeries(result: MetricResult): MetricResult {
  if (result.series.length <= 1) return result;
  const byTime = new Map<number, number>();
  for (const series of result.series) {
    for (const point of series.points) {
      byTime.set(point.t, (byTime.get(point.t) ?? 0) + point.value);
    }
  }
  const previous = result.series.map((series) => series.previousTotal);
  return {
    ...result,
    breakdown: undefined,
    series: [{
      key: "all",
      label: "Alle lokationer",
      points: [...byTime.entries()]
        .sort(([left], [right]) => left - right)
        .map(([t, value]) => ({ t, value: rounded(value) })),
      total: rounded(
        result.headlineTotal ??
          result.series.reduce((sum, series) => sum + series.total, 0),
      ),
      previousTotal:
        result.headlinePrevious !== undefined
          ? result.headlinePrevious
          : previous.some((value) => value === null)
            ? null
            : rounded(
                previous.reduce<number>(
                  (sum, value) => sum + (value ?? 0),
                  0,
                ),
              ),
    }],
  };
}

function restaurantLabel(index: number) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return `Restaurant ${label}`;
}

async function anonymizeLocationSeries(
  result: MetricResult,
  params: DashboardMetricParams,
) {
  if (params.ownLocationIds === null) return result;
  const keys = new Set(
    [
      ...result.series.map((series) => series.key),
      ...(result.breakdown?.map((item) => item.key) ?? []),
    ].filter((key) => !params.ownLocationIds?.has(key as Id<"locations">)),
  );
  const scored = await Promise.all(
    [...keys].map(async (key) => {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(`${params.anonymousSeed}:${key}`),
      );
      return { key, score: [...new Uint8Array(digest)].join(":") };
    }),
  );
  scored.sort((left, right) => left.score.localeCompare(right.score));
  const aliases = new Map(
    scored.map(({ key }, index) => [
      key,
      { key: `restaurant-${index + 1}`, label: restaurantLabel(index) },
    ]),
  );
  return {
    ...result,
    series: result.series.map((series) => {
      const alias = aliases.get(series.key);
      return alias ? { ...series, ...alias } : series;
    }),
    breakdown: result.breakdown?.map((item) => {
      const alias = aliases.get(item.key);
      return alias ? { ...item, ...alias } : item;
    }),
  };
}

async function applyCustomMetricGranularity(
  result: MetricResult,
  dimensionId: string | undefined,
  params: DashboardMetricParams,
) {
  const locationSeries =
    !dimensionId ||
    dimensionId === "location" ||
    dimensionId === "fromLocation" ||
    dimensionId === "toLocation";
  if (!locationSeries || params.accessGranularity === "detail") return result;
  if (params.accessGranularity === "aggregate") {
    return aggregateLocationSeries(result);
  }
  return await anonymizeLocationSeries(result, params);
}

function assertQuerySpec(query: CustomMetricQuerySpec) {
  const dataset = dashboardDatasets[query.dataset];
  if (!dataset.measures.some((measure) => measure.id === query.measure)) {
    throw new ConvexError("Målingen understøttes ikke af datasættet");
  }
  if (query.filters.length > dataset.filters.length) {
    throw new ConvexError("Filterkombinationen understøttes ikke");
  }
  const seen = new Set<string>();
  for (const filter of query.filters) {
    if (
      seen.has(filter.field) ||
      !dataset.filters.some((field) => field.id === filter.field) ||
      filter.values.length === 0 ||
      filter.values.length > 50 ||
      new Set(filter.values).size !== filter.values.length ||
      filter.values.some((value) => !value.trim() || value.length > 200)
    ) {
      throw new ConvexError("Filteret er ugyldigt");
    }
    seen.add(filter.field);
  }
}

export function validateCustomMetricSpec(
  spec: CustomMetricSpec,
  granularity?: DataGranularity,
) {
  const queries =
    spec.kind === "single" ? [spec.query] : [spec.numerator, spec.denominator];
  queries.forEach(assertQuerySpec);
  if (
    spec.limit !== undefined &&
    (!Number.isInteger(spec.limit) || spec.limit < 1 || spec.limit > 50)
  ) {
    throw new ConvexError("Grænsen skal være mellem 1 og 50");
  }
  if (spec.dimension) {
    const datasets = queries.map((query) => dashboardDatasets[query.dataset]);
    if (
      datasets.some(
        (dataset) =>
          !dataset.dimensions.some((dimension) => dimension.id === spec.dimension),
      )
    ) {
      throw new ConvexError("Dimensionen understøttes ikke af datasættet");
    }
    if (
      granularity === "anonymous" &&
      datasets.some((dataset) =>
        dataset.dimensions.some(
          (dimension) =>
            dimension.id === spec.dimension && dimension.anonymous === true,
        ),
      )
    ) {
      throw new ConvexError("Dimensionen er ikke tilgængelig for denne rolle");
    }
  }
}

export function customMetricIsSensitive(spec: CustomMetricSpec) {
  const queries =
    spec.kind === "single" ? [spec.query] : [spec.numerator, spec.denominator];
  return queries.some((query) => dashboardDatasets[query.dataset].permission);
}

export async function executeCustomMetric(
  ctx: QueryCtx,
  spec: CustomMetricSpec,
  params: DashboardMetricParams,
) {
  const effectiveParams =
    customMetricIsSensitive(spec) &&
    !params.salesDetailAllowed &&
    params.accessGranularity === "detail"
      ? { ...params, accessGranularity: "aggregate" as const }
      : params;
  validateCustomMetricSpec(spec, effectiveParams.accessGranularity);
  const limit = spec.limit ?? 10;
  if (spec.kind === "single") {
    return await applyCustomMetricGranularity(
      await singleResult(
        ctx,
        spec.query,
        spec.dimension,
        spec.bucket,
        limit,
        effectiveParams,
      ),
      spec.dimension,
      effectiveParams,
    );
  }
  const numerator = await singleResult(
    ctx,
    spec.numerator,
    spec.dimension,
    spec.bucket,
    limit,
    effectiveParams,
  );
  const denominator = await singleResult(
    ctx,
    spec.denominator,
    spec.dimension,
    spec.bucket,
    limit,
    effectiveParams,
    spec.dimension
      ? numerator.series
          .filter((series) => series.key !== "other")
          .map((series) => series.key)
      : undefined,
  );
  const locationSeries =
    !spec.dimension ||
    spec.dimension === "location" ||
    spec.dimension === "fromLocation" ||
    spec.dimension === "toLocation";
  const normalizedNumerator =
    effectiveParams.accessGranularity === "aggregate" && locationSeries
      ? aggregateLocationSeries(numerator)
      : numerator;
  const normalizedDenominator =
    effectiveParams.accessGranularity === "aggregate" && locationSeries
      ? aggregateLocationSeries(denominator)
      : denominator;
  return await applyCustomMetricGranularity(
    ratioResult(normalizedNumerator, normalizedDenominator),
    spec.dimension,
    effectiveParams,
  );
}
