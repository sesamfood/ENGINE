import { ConvexError } from "convex/values";
import type { DashboardRange, MetricId, MetricResult, MetricUnit } from "../../lib/dashboard/types";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

const DEFAULT_TIME_ZONE = "Europe/Copenhagen";
const MAX_ROWS = 5_000;
const MAX_SCOPE_LOCATIONS = 200;
const MAX_TRANSFER_DETAILS = 500;
const DAY_MS = 24 * 60 * 60 * 1_000;

export type DashboardLocation = { id: Id<"locations">; name: string };

export type DashboardMetricParams = {
  organizationId: string;
  locations: DashboardLocation[];
  compare: boolean;
  from: number;
  to: number;
  previousFrom: number;
  previousTo: number;
  granularity: "day";
  timeZone: string;
};

type MetricComputer = (
  ctx: QueryCtx,
  params: DashboardMetricParams,
) => Promise<MetricResult>;

type TimedValue = {
  timestamp: number;
  locationId: Id<"locations">;
  value: number;
};

export function dateKey(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function zonedStart(value: string, timeZone: string) {
  const [year, month, day] = value.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(guess).map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess += target - represented;
  }
  return guess;
}

function validDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

export function resolveDashboardRange(
  range: DashboardRange,
  timeZone = DEFAULT_TIME_ZONE,
  now = Date.now(),
) {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(now);
  } catch {
    timeZone = DEFAULT_TIME_ZONE;
  }

  const today = dateKey(now, timeZone);
  let fromDate = today;
  let toDate = today;
  if (range.preset === "yesterday") {
    fromDate = addDays(today, -1);
    toDate = fromDate;
  } else if (range.preset === "7days") {
    fromDate = addDays(today, -6);
  } else if (range.preset === "30days") {
    fromDate = addDays(today, -29);
  } else if (range.preset === "thisMonth") {
    fromDate = `${today.slice(0, 8)}01`;
  } else if (range.preset === "custom") {
    if (!validDate(range.from) || !validDate(range.to) || range.from! > range.to!) {
      throw new ConvexError("Vælg en gyldig periode");
    }
    fromDate = range.from!;
    toDate = range.to!;
  }

  const from = zonedStart(fromDate, timeZone);
  const to = zonedStart(addDays(toDate, 1), timeZone);
  if (to - from > 366 * DAY_MS) {
    throw new ConvexError("Dashboardperioden må højst være ét år");
  }
  return {
    from,
    to,
    previousFrom: from - (to - from),
    previousTo: from,
    timeZone,
  };
}

export async function resolveMetricParams(
  ctx: QueryCtx,
  organizationId: string,
  scope: { mode: "aggregate" | "compare"; locationIds: Id<"locations">[] | null },
  range: DashboardRange,
) {
  const [allLocations, scheduleSettings] = await Promise.all([
    ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(201),
    ctx.db
      .query("organizationScheduleSettings")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .unique(),
  ]);
  if (allLocations.length > 200) throw new ConvexError("Organisationen har for mange locations");

  const byId = new Map(allLocations.map((location) => [location._id, location]));
  const selectedIds = scope.locationIds ?? allLocations.map((location) => location._id);
  if (selectedIds.length === 0) throw new ConvexError("Vælg mindst én location");
  if (new Set(selectedIds).size !== selectedIds.length) {
    throw new ConvexError("En location må kun vælges én gang");
  }
  if (selectedIds.length > MAX_SCOPE_LOCATIONS) {
    throw new ConvexError(`Dashboardet kan højst vise ${MAX_SCOPE_LOCATIONS} locations ad gangen`);
  }
  const locations = selectedIds.map((id) => {
    const location = byId.get(id);
    if (!location) throw new ConvexError("Locationen blev ikke fundet");
    return { id: location._id, name: location.name };
  });
  if (scope.mode === "compare" && locations.length < 2) {
    throw new ConvexError("Vælg mindst to locations til sammenligning");
  }

  return {
    organizationId,
    locations,
    compare: scope.mode === "compare",
    granularity: "day" as const,
    ...resolveDashboardRange(range, scheduleSettings?.timeZone),
  };
}

function rounded(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function dayStarts(from: number, to: number, timeZone: string) {
  const starts: number[] = [];
  let key = dateKey(from, timeZone);
  while (true) {
    const start = zonedStart(key, timeZone);
    if (start >= to) break;
    starts.push(start);
    key = addDays(key, 1);
  }
  return starts;
}

function seriesResult(
  unit: MetricUnit,
  rows: TimedValue[],
  params: DashboardMetricParams,
  options?: Pick<MetricResult, "breakdown" | "target" | "truncated">,
): MetricResult {
  const groups = params.compare
    ? params.locations.map((location) => ({ key: location.id, label: location.name }))
    : [{ key: "all", label: "Alle locations" }];
  const days = dayStarts(params.from, params.to, params.timeZone);
  const series = groups.map((group) => {
    const relevant = params.compare
      ? rows.filter((row) => row.locationId === group.key)
      : rows;
    const current = relevant.filter(
      (row) => row.timestamp >= params.from && row.timestamp < params.to,
    );
    const previous = relevant.filter(
      (row) => row.timestamp >= params.previousFrom && row.timestamp < params.previousTo,
    );
    const byDay = new Map<number, number>();
    for (const row of current) {
      const start = zonedStart(dateKey(row.timestamp, params.timeZone), params.timeZone);
      byDay.set(start, (byDay.get(start) ?? 0) + row.value);
    }
    return {
      key: String(group.key),
      label: group.label,
      points: days.map((t) => ({ t, value: rounded(byDay.get(t) ?? 0) })),
      total: rounded(current.reduce((sum, row) => sum + row.value, 0)),
      previousTotal: rounded(previous.reduce((sum, row) => sum + row.value, 0)),
    };
  });
  return { unit, series, ...options };
}

async function wasteRows(ctx: QueryCtx, params: DashboardMetricParams) {
  const selected = new Set(params.locations.map((location) => location.id));
  const rows = await ctx.db
    .query("wasteRegistrations")
    .withIndex("by_org_status_time", (q) =>
      q.eq("organizationId", params.organizationId).eq("status", "active").gte("registeredAt", params.previousFrom).lt("registeredAt", params.to),
    )
    .take(MAX_ROWS + 1);
  return { rows: rows.filter((row) => selected.has(row.locationId)).slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS };
}

const wasteQuantity: MetricComputer = async (ctx, params) => {
  const result = await wasteRows(ctx, params);
  return seriesResult(
    "quantity",
    result.rows.map((row) => ({
      timestamp: row.registeredAt,
      locationId: row.locationId,
      value: row.defaultQuantity,
    })),
    params,
    { truncated: result.truncated || undefined },
  );
};

const wasteRegistrations: MetricComputer = async (ctx, params) => {
  const result = await wasteRows(ctx, params);
  return seriesResult(
    "count",
    result.rows.map((row) => ({ timestamp: row.registeredAt, locationId: row.locationId, value: 1 })),
    params,
    { truncated: result.truncated || undefined },
  );
};

const topWastedProducts: MetricComputer = async (ctx, params) => {
  const result = await wasteRows(ctx, params);
  const current = result.rows.filter((row) => row.registeredAt >= params.from);
  const products = new Map<string, { label: string; value: number }>();
  for (const row of current) {
    const item = products.get(row.productId) ?? { label: row.productName, value: 0 };
    item.value += 1;
    products.set(row.productId, item);
  }
  return seriesResult(
    "count",
    result.rows.map((row) => ({ timestamp: row.registeredAt, locationId: row.locationId, value: 1 })),
    params,
    {
      breakdown: [...products.entries()]
        .map(([key, item]) => ({ key, ...item }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
      truncated: result.truncated || undefined,
    },
  );
};

const wasteByCategory: MetricComputer = async (ctx, params) => {
  const result = await wasteRows(ctx, params);
  const current = result.rows.filter((row) => row.registeredAt >= params.from);
  const productIds = [...new Set(current.map((row) => row.productId))];
  const products = await Promise.all(productIds.map((id) => ctx.db.get("products", id)));
  const categoryIds = [...new Set(products.flatMap((product) => product?.categoryId ? [product.categoryId] : []))];
  const categories = await Promise.all(categoryIds.map((id) => ctx.db.get("categories", id)));
  const categoryNames = new Map(categories.flatMap((category) => category ? [[category._id, category.name] as const] : []));
  const categoryByProduct = new Map(products.flatMap((product) => product ? [[product._id, product.categoryId] as const] : []));
  const values = new Map<string, { label: string; value: number }>();
  for (const row of current) {
    const categoryId = categoryByProduct.get(row.productId);
    const key = categoryId ?? "uncategorized";
    const item = values.get(key) ?? { label: categoryId ? (categoryNames.get(categoryId) ?? "Ukendt kategori") : "Uden kategori", value: 0 };
    item.value += 1;
    values.set(key, item);
  }
  return seriesResult(
    "count",
    result.rows.map((row) => ({ timestamp: row.registeredAt, locationId: row.locationId, value: 1 })),
    params,
    {
      breakdown: [...values.entries()].map(([key, item]) => ({ key, ...item })).sort((a, b) => b.value - a.value).slice(0, 10),
      truncated: result.truncated || undefined,
    },
  );
};

async function badDeliveryRows(ctx: QueryCtx, params: DashboardMetricParams) {
  const selected = new Set(params.locations.map((location) => location.id));
  const rows = await ctx.db
    .query("badDeliveries")
    .withIndex("by_organizationId_and_status_and_registeredAt", (q) =>
      q.eq("organizationId", params.organizationId).eq("status", "active").gte("registeredAt", params.previousFrom).lt("registeredAt", params.to),
    )
    .take(MAX_ROWS + 1);
  return { rows: rows.filter((row) => selected.has(row.locationId)).slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS };
}

const badDeliveries: MetricComputer = async (ctx, params) => {
  const result = await badDeliveryRows(ctx, params);
  return seriesResult("count", result.rows.map((row) => ({ timestamp: row.registeredAt, locationId: row.locationId, value: 1 })), params, { truncated: result.truncated || undefined });
};

async function countRows(ctx: QueryCtx, params: DashboardMetricParams) {
  const parts = await Promise.all(
    params.locations.map((location) =>
      ctx.db
        .query("counts")
        .withIndex("by_organizationId_and_locationId_and_periodKey", (q) => q.eq("organizationId", params.organizationId).eq("locationId", location.id))
        .take(101),
    ),
  );
  return { rows: parts.flat().slice(0, MAX_ROWS), truncated: parts.some((part) => part.length > 100) || parts.flat().length > MAX_ROWS };
}

const countCompliance: MetricComputer = async (ctx, params) => {
  const result = await countRows(ctx, params);
  const timed = result.rows.map((row) => ({ timestamp: row.submittedAt ?? row._creationTime, locationId: row.locationId, submitted: row.status === "submitted" }));
  const groups = params.compare ? params.locations : [{ id: "all" as const, name: "Alle locations" }];
  const series = groups.map((group) => {
    const relevant = params.compare ? timed.filter((row) => row.locationId === group.id) : timed;
    const current = relevant.filter((row) => row.timestamp >= params.from && row.timestamp < params.to);
    const previous = relevant.filter((row) => row.timestamp >= params.previousFrom && row.timestamp < params.previousTo);
    const percent = (rows: typeof relevant) => rows.length ? rounded((rows.filter((row) => row.submitted).length / rows.length) * 100) : 0;
    return { key: String(group.id), label: group.name, points: [{ t: params.from, value: percent(current) }], total: percent(current), previousTotal: percent(previous) };
  });
  return { unit: "percent", series, target: 100, truncated: result.truncated || undefined };
};

const openCounts: MetricComputer = async (ctx, params) => {
  const result = await countRows(ctx, params);
  const snapshots = (locationId: Id<"locations"> | null, at: number) => result.rows.filter((row) => (!locationId || row.locationId === locationId) && row._creationTime < at && (!row.submittedAt || row.submittedAt >= at)).length;
  const groups = params.compare ? params.locations : [{ id: null, name: "Alle locations" }];
  return {
    unit: "count",
    series: groups.map((group) => ({
      key: group.id ?? "all",
      label: group.name,
      points: [{ t: params.from, value: snapshots(group.id, Math.min(params.to, Date.now() + 1)) }],
      total: snapshots(group.id, Math.min(params.to, Date.now() + 1)),
      previousTotal: snapshots(group.id, params.previousTo),
    })),
    truncated: result.truncated || undefined,
  };
};

async function transferRows(ctx: QueryCtx, params: DashboardMetricParams) {
  const selected = new Set(params.locations.map((location) => location.id));
  const rows = await ctx.db
    .query("transfers")
    .withIndex("by_organizationId_and_transferredAt", (q) => q.eq("organizationId", params.organizationId).gte("transferredAt", params.previousFrom).lt("transferredAt", params.to))
    .take(MAX_ROWS + 1);
  return { rows: rows.filter((row) => selected.has(row.fromLocationId) || selected.has(row.toLocationId)).slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS };
}

const transfers: MetricComputer = async (ctx, params) => {
  const result = await transferRows(ctx, params);
  return seriesResult("count", result.rows.map((row) => ({ timestamp: row.transferredAt, locationId: row.fromLocationId, value: 1 })), params, { truncated: result.truncated || undefined });
};

async function transferItems(ctx: QueryCtx, transfers: Doc<"transfers">[]) {
  const selected = transfers.slice(0, MAX_TRANSFER_DETAILS);
  const parts = await Promise.all(selected.map((transfer) => ctx.db.query("transferItems").withIndex("by_organizationId_and_transferId", (q) => q.eq("organizationId", transfer.organizationId).eq("transferId", transfer._id)).take(201)));
  const rows = parts.flat();
  return {
    rows: rows.slice(0, MAX_ROWS),
    truncated: transfers.length > selected.length || parts.some((part) => part.length > 200) || rows.length > MAX_ROWS,
  };
}

const itemsMoved: MetricComputer = async (ctx, params) => {
  const transferResult = await transferRows(ctx, params);
  const itemResult = await transferItems(ctx, transferResult.rows);
  const byTransfer = new Map(transferResult.rows.map((row) => [row._id, row]));
  const rows = itemResult.rows.flatMap((item) => {
    const transfer = byTransfer.get(item.transferId);
    return transfer ? [{ timestamp: transfer.transferredAt, locationId: transfer.fromLocationId, value: item.quantity * (item.factorToDefault ?? 1) }] : [];
  });
  return seriesResult("quantity", rows, params, { truncated: transferResult.truncated || itemResult.truncated || undefined });
};

const topTransferredProducts: MetricComputer = async (ctx, params) => {
  const transferResult = await transferRows(ctx, params);
  const itemResult = await transferItems(ctx, transferResult.rows);
  const byTransfer = new Map(transferResult.rows.map((row) => [row._id, row]));
  const values = new Map<string, { label: string; value: number }>();
  const rows: TimedValue[] = [];
  for (const item of itemResult.rows) {
    const transfer = byTransfer.get(item.transferId);
    if (!transfer) continue;
    const value = item.quantity * (item.factorToDefault ?? 1);
    rows.push({ timestamp: transfer.transferredAt, locationId: transfer.fromLocationId, value });
    if (transfer.transferredAt >= params.from) {
      const entry = values.get(item.productId) ?? { label: item.productName, value: 0 };
      entry.value += value;
      values.set(item.productId, entry);
    }
  }
  return seriesResult("quantity", rows, params, {
    breakdown: [...values.entries()].map(([key, item]) => ({ key, label: item.label, value: rounded(item.value) })).sort((a, b) => b.value - a.value).slice(0, 10),
    truncated: transferResult.truncated || itemResult.truncated || undefined,
  });
};

async function staffFoodRows(ctx: QueryCtx, params: DashboardMetricParams) {
  const selected = new Set(params.locations.map((location) => location.id));
  const rows = await ctx.db
    .query("staffFoodRegistrations")
    .withIndex("by_organizationId_and_registeredAt", (q) => q.eq("organizationId", params.organizationId).gte("registeredAt", params.previousFrom).lt("registeredAt", params.to))
    .take(MAX_ROWS + 1);
  return { rows: rows.filter((row) => row.status === "active" && selected.has(row.locationId)).slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS };
}

const staffFoodRegistrations: MetricComputer = async (ctx, params) => {
  const result = await staffFoodRows(ctx, params);
  return seriesResult("count", result.rows.map((row) => ({ timestamp: row.registeredAt, locationId: row.locationId, value: 1 })), params, { truncated: result.truncated || undefined });
};

const staffFoodPerEmployee: MetricComputer = async (ctx, params) => {
  const result = await staffFoodRows(ctx, params);
  const values = new Map<string, { label: string; value: number }>();
  for (const row of result.rows.filter((row) => row.registeredAt >= params.from)) {
    const item = values.get(row.employeeId) ?? { label: row.employeeName, value: 0 };
    item.value += 1;
    values.set(row.employeeId, item);
  }
  return seriesResult("count", result.rows.map((row) => ({ timestamp: row.registeredAt, locationId: row.locationId, value: 1 })), params, {
    breakdown: [...values.entries()].map(([key, item]) => ({ key, ...item })).sort((a, b) => b.value - a.value).slice(0, 10),
    truncated: result.truncated || undefined,
  });
};

async function shiftRows(ctx: QueryCtx, params: DashboardMetricParams, from = params.previousFrom, to = params.to) {
  const selected = new Set(params.locations.map((location) => location.id));
  const rows = await ctx.db
    .query("scheduledShifts")
    .withIndex("by_organizationId_and_startsAt", (q) => q.eq("organizationId", params.organizationId).gte("startsAt", from).lt("startsAt", to))
    .take(MAX_ROWS + 1);
  return { rows: rows.filter((row) => selected.has(row.locationId)).slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS };
}

const scheduledHours: MetricComputer = async (ctx, params) => {
  const result = await shiftRows(ctx, params);
  return seriesResult("hours", result.rows.map((row) => ({ timestamp: row.startsAt, locationId: row.locationId, value: Math.max(0, row.endsAt - row.startsAt) / 3_600_000 })), params, { truncated: result.truncated || undefined });
};

const headcountToday: MetricComputer = async (ctx, params) => {
  const today = dateKey(Date.now(), params.timeZone);
  const from = zonedStart(today, params.timeZone);
  const to = zonedStart(addDays(today, 1), params.timeZone);
  const result = await shiftRows(ctx, params, from - DAY_MS * 2, to);
  const groups = params.compare ? params.locations : [{ id: "all" as const, name: "Alle locations" }];
  const employees = await Promise.all([...new Set(result.rows.map((row) => row.employeeId))].map((id) => ctx.db.get("employees", id)));
  const names = new Map(employees.flatMap((employee) => employee ? [[employee._id, employee.displayName] as const] : []));
  const active = result.rows.filter((row) => row.startsAt < to && row.endsAt > from);
  return {
    unit: "count",
    series: groups.map((group) => {
      const rows = params.compare ? active.filter((row) => row.locationId === group.id) : active;
      const total = new Set(rows.map((row) => row.employeeId)).size;
      return { key: String(group.id), label: group.name, points: [{ t: from, value: total }], total, previousTotal: null };
    }),
    breakdown: [...new Set(active.map((row) => row.employeeId))].slice(0, 10).map((id) => ({ key: id, label: names.get(id) ?? "Ukendt medarbejder", value: 1 })),
    truncated: result.truncated || undefined,
  };
};

const locationComparison: MetricComputer = async (ctx, params) => {
  const [waste, deliveries, transferResult, staffFood] = await Promise.all([
    wasteRows(ctx, params),
    badDeliveryRows(ctx, params),
    transferRows(ctx, params),
    staffFoodRows(ctx, params),
  ]);
  const rows: TimedValue[] = [
    ...waste.rows.map((row) => ({ timestamp: row.registeredAt, locationId: row.locationId, value: 1 })),
    ...deliveries.rows.map((row) => ({ timestamp: row.registeredAt, locationId: row.locationId, value: 1 })),
    ...transferResult.rows.map((row) => ({ timestamp: row.transferredAt, locationId: row.fromLocationId, value: 1 })),
    ...staffFood.rows.map((row) => ({ timestamp: row.registeredAt, locationId: row.locationId, value: 1 })),
  ];
  const compared = seriesResult("count", rows, { ...params, compare: true }, { truncated: waste.truncated || deliveries.truncated || transferResult.truncated || staffFood.truncated || undefined });
  return { ...compared, breakdown: compared.series.map((series) => ({ key: series.key, label: series.label, value: series.total })).sort((a, b) => b.value - a.value) };
};

async function salesDailyRows(ctx: QueryCtx, params: DashboardMetricParams) {
  // Empty selection should not happen (resolveMetricParams requires ≥1); keep
  // the org-wide path as a safe fallback.
  if (params.locations.length === 0) {
    const rows = await ctx.db
      .query("salesDaily")
      .withIndex("by_organizationId_and_dayStart", (q) =>
        q
          .eq("organizationId", params.organizationId)
          .gte("dayStart", params.previousFrom)
          .lt("dayStart", params.to),
      )
      .take(MAX_ROWS + 1);
    return {
      rows: rows.slice(0, MAX_ROWS),
      truncated: rows.length > MAX_ROWS,
    };
  }
  // Per selected location so a subset is not truncated by unrelated rows.
  const parts = await Promise.all(
    params.locations.map((location) =>
      ctx.db
        .query("salesDaily")
        .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
          q
            .eq("organizationId", params.organizationId)
            .eq("locationId", location.id)
            .gte("dayStart", params.previousFrom)
            .lt("dayStart", params.to),
        )
        .take(MAX_ROWS + 1),
    ),
  );
  const combined = parts.flat();
  return {
    rows: combined.slice(0, MAX_ROWS),
    truncated: combined.length > MAX_ROWS,
  };
}

const salesRevenue: MetricComputer = async (ctx, params) => {
  const result = await salesDailyRows(ctx, params);
  return seriesResult(
    "currency",
    result.rows.map((row) => ({
      timestamp: row.dayStart,
      locationId: row.locationId,
      value: row.revenue / 100,
    })),
    params,
    { truncated: result.truncated || undefined },
  );
};

const salesOrderCount: MetricComputer = async (ctx, params) => {
  const result = await salesDailyRows(ctx, params);
  return seriesResult(
    "count",
    result.rows.map((row) => ({
      timestamp: row.dayStart,
      locationId: row.locationId,
      value: row.orderCount,
    })),
    params,
    { truncated: result.truncated || undefined },
  );
};

const averageBasket: MetricComputer = async (ctx, params) => {
  const result = await salesDailyRows(ctx, params);
  const groups = params.compare
    ? params.locations.map((location) => ({ key: location.id, label: location.name }))
    : [{ key: "all" as const, label: "Alle locations" }];
  const days = dayStarts(params.from, params.to, params.timeZone);
  let headlineRevenue = 0;
  let headlineOrders = 0;
  let headlinePreviousRevenue = 0;
  let headlinePreviousOrders = 0;
  const series = groups.map((group) => {
    const relevant = params.compare
      ? result.rows.filter((row) => row.locationId === group.key)
      : result.rows;
    const current = relevant.filter(
      (row) => row.dayStart >= params.from && row.dayStart < params.to,
    );
    const previous = relevant.filter(
      (row) => row.dayStart >= params.previousFrom && row.dayStart < params.previousTo,
    );
    const byDay = new Map<number, { revenue: number; orders: number }>();
    for (const row of current) {
      const entry = byDay.get(row.dayStart) ?? { revenue: 0, orders: 0 };
      entry.revenue += row.revenue;
      entry.orders += row.orderCount;
      byDay.set(row.dayStart, entry);
    }
    const periodRevenue = current.reduce((sum, row) => sum + row.revenue, 0);
    const periodOrders = current.reduce((sum, row) => sum + row.orderCount, 0);
    const previousRevenue = previous.reduce((sum, row) => sum + row.revenue, 0);
    const previousOrders = previous.reduce((sum, row) => sum + row.orderCount, 0);
    headlineRevenue += periodRevenue;
    headlineOrders += periodOrders;
    headlinePreviousRevenue += previousRevenue;
    headlinePreviousOrders += previousOrders;
    return {
      key: String(group.key),
      label: group.label,
      points: days.map((t) => {
        const entry = byDay.get(t);
        return {
          t,
          value: rounded(entry && entry.orders > 0 ? entry.revenue / 100 / entry.orders : 0),
        };
      }),
      total: rounded(periodOrders > 0 ? periodRevenue / 100 / periodOrders : 0),
      previousTotal: rounded(
        previousOrders > 0 ? previousRevenue / 100 / previousOrders : 0,
      ),
    };
  });
  return {
    unit: "currency",
    series,
    truncated: result.truncated || undefined,
    headlineTotal: rounded(
      headlineOrders > 0 ? headlineRevenue / 100 / headlineOrders : 0,
    ),
    headlinePrevious: rounded(
      headlinePreviousOrders > 0
        ? headlinePreviousRevenue / 100 / headlinePreviousOrders
        : 0,
    ),
  };
};

export const dashboardMetricComputers: Record<MetricId, MetricComputer> = {
  wasteQuantity,
  wasteRegistrations,
  topWastedProducts,
  wasteByCategory,
  badDeliveries,
  countCompliance,
  openCounts,
  transfers,
  itemsMoved,
  topTransferredProducts,
  staffFoodRegistrations,
  staffFoodPerEmployee,
  scheduledHours,
  headcountToday,
  locationComparison,
  salesRevenue,
  salesOrderCount,
  averageBasket,
};
