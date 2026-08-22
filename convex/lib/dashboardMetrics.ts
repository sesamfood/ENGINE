import { ConvexError } from "convex/values";
import {
  DEFAULT_CURRENCY,
  type DashboardRange,
  type DashboardScope,
  type MetricId,
  type MetricResult,
  type MetricUnit,
} from "../../lib/dashboard/types";
import type { DataGranularity } from "../../lib/auth-permissions";
import {
  metricRegistry,
  type MetricSource,
} from "../../lib/dashboard/registry";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

const DEFAULT_TIME_ZONE = "Europe/Copenhagen";
const MAX_ROWS = 5_000;
const MAX_SCOPE_LOCATIONS = 200;
const MAX_TRANSFER_DETAILS = 500;
const DAY_MS = 24 * 60 * 60 * 1_000;
const INTEGRATION_FRESHNESS_INTERVAL_MS = 26 * 60 * 60 * 1_000;

export type DashboardLocation = {
  id: Id<"locations">;
  name: string;
  currency: string;
};

export type DashboardComparisonGroup = {
  key: string;
  label: string;
  locationIds: readonly Id<"locations">[];
};

export type DashboardMetricParams = {
  organizationId: string;
  locations: DashboardLocation[];
  scopeSelectsAllLocations: boolean;
  compare: boolean;
  comparisonGroups?: DashboardComparisonGroup[];
  anonymousLocations?: DashboardLocation[];
  anonymousComparisonGroups?: DashboardComparisonGroup[];
  scopeTruncated?: boolean;
  anonymousScopeTruncated?: boolean;
  accessGranularity: DataGranularity;
  salesDetailAllowed: boolean;
  anonymousSeed: string;
  ownLocationIds: ReadonlySet<Id<"locations">> | null;
  from: number;
  to: number;
  previousFrom: number;
  previousTo: number;
  granularity: "day";
  timeZone: string;
  now: number;
  cache: Map<string, Promise<unknown>>;
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
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
      DAY_MS,
  );
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
  return (
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
  );
}

export function resolveDashboardRange(
  range: DashboardRange,
  timeZone: string | undefined,
  now: number,
) {
  timeZone ??= DEFAULT_TIME_ZONE;
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
    if (
      !validDate(range.from) ||
      !validDate(range.to) ||
      range.from! > range.to!
    ) {
      throw new ConvexError("Vælg en gyldig periode");
    }
    fromDate = range.from!;
    toDate = range.to!;
  }

  const from = zonedStart(fromDate, timeZone);
  const to = zonedStart(addDays(toDate, 1), timeZone);
  const dayCount = daysBetween(fromDate, toDate) + 1;
  if (dayCount > 366) {
    throw new ConvexError("Overbliksperioden må højst være ét år");
  }
  return {
    from,
    to,
    previousFrom: zonedStart(addDays(fromDate, -dayCount), timeZone),
    previousTo: from,
    timeZone,
  };
}

export async function resolveMetricParams(
  ctx: QueryCtx,
  organizationId: string,
  scope: DashboardScope,
  range: DashboardRange,
  now: number,
  allowedLocationScope?: { all: boolean; ids: ReadonlySet<Id<"locations">> },
  access?: {
    granularity: DataGranularity;
    anonymousSeed: string;
    salesDetailAllowed?: boolean;
  },
) {
  if (!Number.isFinite(now)) throw new ConvexError("Tidspunktet er ugyldigt");
  const anonymousAccess = access?.granularity === "anonymous";
  const widenAnonymousScope =
    anonymousAccess && scope.locationIds === null && scope.level !== "location";
  const [requestedLocations, scheduleSettings] = await Promise.all([
    scope.locationIds === null
      ? null
      : Promise.all(
          [...new Set(scope.locationIds)].map((locationId) =>
            ctx.db.get("locations", locationId),
          ),
        ),
    ctx.db
      .query("organizationScheduleSettings")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique(),
  ]);
  if (
    requestedLocations?.some(
      (location) => !location || location.organizationId !== organizationId,
    )
  ) {
    throw new ConvexError("Lokationen blev ikke fundet");
  }
  const requestedRows =
    requestedLocations?.filter(
      (location): location is NonNullable<typeof location> => Boolean(location),
    ) ?? null;

  let candidateLocations: Doc<"locations">[];
  if (scope.level === "market") {
    if (!scope.parentId) throw new ConvexError("Vælg et marked");
    const market = await ctx.db.get("markets", scope.parentId as Id<"markets">);
    if (!market || market.organizationId !== organizationId) {
      throw new ConvexError("Markedet blev ikke fundet");
    }
    candidateLocations = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_marketId", (q) =>
        q.eq("organizationId", organizationId).eq("marketId", market._id),
      )
      .take(MAX_SCOPE_LOCATIONS + 1);
  } else if (scope.level === "operator") {
    if (!scope.parentId) throw new ConvexError("Vælg en operatør");
    const operator = await ctx.db.get(
      "operators",
      scope.parentId as Id<"operators">,
    );
    if (!operator || operator.organizationId !== organizationId) {
      throw new ConvexError("Operatøren blev ikke fundet");
    }
    candidateLocations = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_operatorId", (q) =>
        q.eq("organizationId", organizationId).eq("operatorId", operator._id),
      )
      .take(MAX_SCOPE_LOCATIONS + 1);
  } else if (scope.level === "location" && scope.parentId) {
    const location = await ctx.db.get(
      "locations",
      scope.parentId as Id<"locations">,
    );
    if (!location || location.organizationId !== organizationId) {
      throw new ConvexError("Lokationen blev ikke fundet");
    }
    candidateLocations = [location];
  } else if (requestedRows) {
    candidateLocations = requestedRows;
  } else if (
    allowedLocationScope &&
    !allowedLocationScope.all &&
    !widenAnonymousScope
  ) {
    const allowedRows = await Promise.all(
      [...allowedLocationScope.ids]
        .slice(0, MAX_SCOPE_LOCATIONS + 1)
        .map((locationId) => ctx.db.get("locations", locationId)),
    );
    candidateLocations = allowedRows.filter(
      (location): location is NonNullable<typeof location> =>
        Boolean(location && location.organizationId === organizationId),
    );
  } else {
    candidateLocations = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_SCOPE_LOCATIONS + 1);
  }
  const lookupLocations = [
    ...new Map(
      [...candidateLocations, ...(requestedRows ?? [])].map(
        (location) => [location._id, location],
      ),
    ).values(),
  ];

  const marketIds = [
    ...new Set(
      lookupLocations.flatMap((location) =>
        location.marketId ? [location.marketId] : [],
      ),
    ),
  ];
  const markets = await Promise.all(
    marketIds.map((marketId) => ctx.db.get("markets", marketId)),
  );
  const marketById = new Map(
    markets.flatMap((market) =>
      market?.organizationId === organizationId
        ? [[market._id, market] as const]
        : [],
    ),
  );

  const operatorIds = [
    ...new Set(
      lookupLocations.flatMap((location) =>
        location.operatorId ? [location.operatorId] : [],
      ),
    ),
  ];
  const operators = await Promise.all(
    operatorIds.map((operatorId) => ctx.db.get("operators", operatorId)),
  );
  const operatorById = new Map(
    operators.flatMap((operator) =>
      operator?.organizationId === organizationId
        ? [[operator._id, operator] as const]
        : [],
    ),
  );

  const byId = new Map(
    lookupLocations.map((location) => [location._id, location]),
  );
  const candidateIds = new Set(
    candidateLocations.map((location) => location._id),
  );
  if (
    scope.locationIds !== null &&
    scope.locationIds.some((locationId) => !candidateIds.has(locationId))
  ) {
    throw new ConvexError("Lokationsvalget indeholder en ugyldig lokation");
  }
  const hasAccess = (locationId: Id<"locations">) =>
    !allowedLocationScope ||
    allowedLocationScope.all ||
    allowedLocationScope.ids.has(locationId);
  if (scope.locationIds?.some((locationId) => !hasAccess(locationId))) {
    throw new ConvexError("Du har ikke adgang til en eller flere lokationer");
  }
  const selectedIds =
    scope.locationIds === null
      ? candidateLocations
          .filter((location) => hasAccess(location._id))
          .map((location) => location._id)
      : [...new Set(scope.locationIds)];
  const anonymousExpansion = widenAnonymousScope && selectedIds.length > 0;
  const anonymousSelectedIds = anonymousExpansion
    ? candidateLocations.map((location) => location._id)
    : selectedIds;
  const scopeTruncated =
    selectedIds.length > MAX_SCOPE_LOCATIONS;
  const anonymousScopeTruncated =
    anonymousExpansion && anonymousSelectedIds.length > MAX_SCOPE_LOCATIONS;
  const resolvedIds = selectedIds.slice(0, MAX_SCOPE_LOCATIONS);
  const anonymousResolvedIds = anonymousSelectedIds.slice(
    0,
    MAX_SCOPE_LOCATIONS,
  );
  const dashboardLocationsFor = (
    ids: readonly Id<"locations">[],
  ): DashboardLocation[] =>
    ids.flatMap((id) => {
      const location = byId.get(id);
      if (!location) return [];
      const marketCurrency = location.marketId
        ? marketById.get(location.marketId)?.currency
        : undefined;
      return [
        {
          id: location._id,
          name: location.name,
          currency: location.currency || marketCurrency || DEFAULT_CURRENCY,
        },
      ];
    });
  const locations = dashboardLocationsFor(resolvedIds);
  const anonymousLocations = anonymousExpansion
    ? dashboardLocationsFor(anonymousResolvedIds)
    : undefined;

  const comparisonGroupsFor = (
    ids: readonly Id<"locations">[],
    rows: DashboardLocation[],
  ): DashboardComparisonGroup[] | undefined => {
    if (scope.level === "organization") {
      const byMarket = new Map<string, DashboardComparisonGroup>();
      for (const location of ids.flatMap((id) => byId.get(id) ?? [])) {
        const key = location.marketId ?? "unassigned-market";
        const group = byMarket.get(key) ?? {
          key,
          label: location.marketId
            ? (marketById.get(location.marketId)?.name ?? "Ukendt marked")
            : "Uden marked",
          locationIds: [],
        };
        byMarket.set(key, {
          ...group,
          locationIds: [...group.locationIds, location._id],
        });
      }
      return [...byMarket.values()];
    }
    if (scope.level === "market" && scope.parentId) {
      const byOperator = new Map<string, DashboardComparisonGroup>();
      for (const location of ids.flatMap((id) => byId.get(id) ?? [])) {
        const key = location.operatorId ?? "unassigned-operator";
        const group = byOperator.get(key) ?? {
          key,
          label: location.operatorId
            ? (operatorById.get(location.operatorId)?.name ??
              "Ukendt operatør")
            : "Uden operatør",
          locationIds: [],
        };
        byOperator.set(key, {
          ...group,
          locationIds: [...group.locationIds, location._id],
        });
      }
      return [...byOperator.values()];
    }
    if (scope.level === "operator" && scope.parentId) {
      return rows.map((location) => ({
        key: location.id,
        label: location.name,
        locationIds: [location.id],
      }));
    }
    if (scope.level === "location") {
      return rows.map((location) => ({
        key: location.id,
        label: location.name,
        locationIds: [location.id],
      }));
    }
    return undefined;
  };
  const comparisonGroups = comparisonGroupsFor(resolvedIds, locations);
  const anonymousComparisonGroups = anonymousLocations
    ? comparisonGroupsFor(anonymousResolvedIds, anonymousLocations)
    : undefined;

  return {
    organizationId,
    locations,
    scopeSelectsAllLocations: scope.locationIds === null,
    compare: scope.mode === "compare" && locations.length >= 2,
    comparisonGroups,
    anonymousLocations,
    anonymousComparisonGroups,
    anonymousScopeTruncated: anonymousScopeTruncated || undefined,
    scopeTruncated:
      scopeTruncated || undefined,
    accessGranularity: access?.granularity ?? "detail",
    salesDetailAllowed: access?.salesDetailAllowed ?? true,
    anonymousSeed: access?.anonymousSeed ?? "shared-dashboard",
    ownLocationIds:
      anonymousAccess && !allowedLocationScope
        ? new Set<Id<"locations">>()
        : allowedLocationScope?.all
          ? null
          : (allowedLocationScope?.ids ?? null),
    granularity: "day" as const,
    now,
    cache: new Map<string, Promise<unknown>>(),
    ...resolveDashboardRange(range, scheduleSettings?.timeZone, now),
  };
}

export function createMetricParamsResolver(
  ctx: QueryCtx,
  organizationId: string,
  scope: DashboardScope,
  now: number,
  allowedLocationScope: {
    all: boolean;
    ids: ReadonlySet<Id<"locations">>;
  } | undefined,
  access: {
    granularity: DataGranularity;
    anonymousSeed: string;
    salesDetailAllowed?: boolean;
  },
) {
  const paramsByRange = new Map<string, Promise<DashboardMetricParams>>();
  return (range: DashboardRange) => {
    const key = `${range.preset}:${range.from ?? ""}:${range.to ?? ""}`;
    const existing = paramsByRange.get(key);
    if (existing) return existing;
    const params = resolveMetricParams(
      ctx,
      organizationId,
      scope,
      range,
      now,
      allowedLocationScope,
      access,
    );
    paramsByRange.set(key, params);
    return params;
  };
}

function cached<T>(
  params: DashboardMetricParams,
  key: string,
  load: () => Promise<T>,
) {
  const existing = params.cache.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const result = load();
  params.cache.set(key, result);
  return result;
}

type Freshness = NonNullable<MetricResult["freshness"]>;

function withAffectedNames(
  params: DashboardMetricParams,
  names: string[],
  freshness: Omit<Freshness, "affectedLocationNames">,
): Freshness {
  return params.accessGranularity === "detail"
    ? { ...freshness, affectedLocationNames: names }
    : freshness;
}

async function onlinePosFreshness(
  ctx: QueryCtx,
  params: DashboardMetricParams,
): Promise<Freshness> {
  return await cached(params, "freshness:onlinepos", async () => {
    const statuses = await Promise.all(
      params.locations.map((location) =>
        ctx.db
          .query("onlinePosSyncStatus")
          .withIndex("by_organizationId_and_locationId", (q) =>
            q
              .eq("organizationId", params.organizationId)
              .eq("locationId", location.id),
          )
          .unique(),
      ),
    );
    const staleNames: string[] = [];
    const errorNames: string[] = [];
    const successfulSyncs: number[] = [];
    const staleBefore = params.now - INTEGRATION_FRESHNESS_INTERVAL_MS;
    for (const [index, location] of params.locations.entries()) {
      const status = statuses[index];
      const lastSuccessAt = status?.lastSuccessAt ?? null;
      if (lastSuccessAt !== null) successfulSyncs.push(lastSuccessAt);
      const stale = lastSuccessAt === null || lastSuccessAt < staleBefore;
      const error = status?.state === "error" || Boolean(status?.lastError);
      if (stale) staleNames.push(location.name);
      if (error) errorNames.push(location.name);
    }
    const affectedNames = [...new Set([...staleNames, ...errorNames])];
    return withAffectedNames(params, affectedNames, {
      lastSuccessAt:
        successfulSyncs.length === params.locations.length &&
        successfulSyncs.length > 0
          ? Math.min(...successfulSyncs)
          : null,
      staleLocationCount: staleNames.length,
      errorLocationCount: errorNames.length,
    });
  });
}

async function workfeedFreshness(
  ctx: QueryCtx,
  params: DashboardMetricParams,
): Promise<Freshness> {
  return await cached(params, "freshness:workfeed", async () => {
    const status = await ctx.db
      .query("workfeedSyncStatus")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", params.organizationId),
      )
      .unique();
    const lastSuccessAt = status?.lastShiftSuccessAt ?? null;
    const stale =
      lastSuccessAt === null ||
      lastSuccessAt < params.now - INTEGRATION_FRESHNESS_INTERVAL_MS;
    const error = status?.state === "error" || Boolean(status?.lastError);
    const names =
      stale || error ? params.locations.map((location) => location.name) : [];
    return withAffectedNames(params, names, {
      lastSuccessAt,
      staleLocationCount: stale ? params.locations.length : 0,
      errorLocationCount: error ? params.locations.length : 0,
    });
  });
}

async function integrationFreshness(
  ctx: QueryCtx,
  params: DashboardMetricParams,
  source: MetricSource,
): Promise<Freshness> {
  return source === "onlinepos"
    ? await onlinePosFreshness(ctx, params)
    : await workfeedFreshness(ctx, params);
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

export function aggregateLocationLabel(params: DashboardMetricParams) {
  if (params.locations.length === 1) return params.locations[0].name;
  if (!params.scopeSelectsAllLocations) {
    return `${params.locations.length} lokationer`;
  }
  return "Alle lokationer";
}

function seriesResult(
  unit: MetricUnit,
  rows: TimedValue[],
  params: DashboardMetricParams,
  options?: Pick<
    MetricResult,
    "breakdown" | "target" | "truncated" | "currency" | "mixedCurrency"
  >,
  groupOverride?: DashboardComparisonGroup[],
): MetricResult {
  const groups: Array<{
    key: string;
    label: string;
    locationIds?: readonly Id<"locations">[];
  }> = groupOverride?.length
    ? groupOverride
    : params.compare
      ? params.locations.map((location) => ({
          key: location.id,
          label: location.name,
          locationIds: [location.id],
        }))
      : [{ key: "all", label: aggregateLocationLabel(params) }];
  const days = dayStarts(params.from, params.to, params.timeZone);
  const series = groups.map((group) => {
    const relevant = groupOverride?.length
      ? rows.filter((row) => group.locationIds?.includes(row.locationId))
      : params.compare
        ? rows.filter((row) => row.locationId === group.key)
        : rows;
    const current = relevant.filter(
      (row) => row.timestamp >= params.from && row.timestamp < params.to,
    );
    const previous = relevant.filter(
      (row) =>
        row.timestamp >= params.previousFrom &&
        row.timestamp < params.previousTo,
    );
    const byDay = new Map<number, number>();
    for (const row of current) {
      const start = zonedStart(
        dateKey(row.timestamp, params.timeZone),
        params.timeZone,
      );
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

function currencyOptions(
  params: DashboardMetricParams,
): Pick<MetricResult, "currency" | "mixedCurrency"> {
  const currencies = [
    ...new Set(
      params.locations.map((location) => location.currency || DEFAULT_CURRENCY),
    ),
  ];
  if (currencies.length > 1) return { mixedCurrency: true };
  return { currency: currencies[0] ?? DEFAULT_CURRENCY };
}

async function wasteRows(ctx: QueryCtx, params: DashboardMetricParams) {
  return await cached(params, "waste", async () => {
    const selected = new Set(params.locations.map((location) => location.id));
    const location = params.locations.length === 1 ? params.locations[0] : null;
    const rows = location
      ? await ctx.db
          .query("wasteRegistrations")
          .withIndex("by_org_location_status_time", (q) =>
            q
              .eq("organizationId", params.organizationId)
              .eq("locationId", location.id)
              .eq("status", "active")
              .gte("registeredAt", params.previousFrom)
              .lt("registeredAt", params.to),
          )
          .take(MAX_ROWS + 1)
      : await ctx.db
          .query("wasteRegistrations")
          .withIndex("by_org_status_time", (q) =>
            q
              .eq("organizationId", params.organizationId)
              .eq("status", "active")
              .gte("registeredAt", params.previousFrom)
              .lt("registeredAt", params.to),
          )
          .take(MAX_ROWS + 1);
    return {
      rows: rows
        .filter((row) => selected.has(row.locationId))
        .slice(0, MAX_ROWS),
      truncated: rows.length > MAX_ROWS,
    };
  });
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
    result.rows.map((row) => ({
      timestamp: row.registeredAt,
      locationId: row.locationId,
      value: 1,
    })),
    params,
    { truncated: result.truncated || undefined },
  );
};

const topWastedProducts: MetricComputer = async (ctx, params) => {
  const result = await wasteRows(ctx, params);
  const current = result.rows.filter((row) => row.registeredAt >= params.from);
  const products = new Map<string, { label: string; value: number }>();
  for (const row of current) {
    const item = products.get(row.productId) ?? {
      label: row.productName,
      value: 0,
    };
    item.value += 1;
    products.set(row.productId, item);
  }
  return seriesResult(
    "count",
    result.rows.map((row) => ({
      timestamp: row.registeredAt,
      locationId: row.locationId,
      value: 1,
    })),
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
  const products = await Promise.all(
    productIds.map((id) => ctx.db.get("products", id)),
  );
  const categoryIds = [
    ...new Set(
      products.flatMap((product) =>
        product?.categoryId ? [product.categoryId] : [],
      ),
    ),
  ];
  const categories = await Promise.all(
    categoryIds.map((id) => ctx.db.get("categories", id)),
  );
  const categoryNames = new Map(
    categories.flatMap((category) =>
      category ? [[category._id, category.name] as const] : [],
    ),
  );
  const categoryByProduct = new Map(
    products.flatMap((product) =>
      product ? [[product._id, product.categoryId] as const] : [],
    ),
  );
  const values = new Map<string, { label: string; value: number }>();
  for (const row of current) {
    const categoryId = categoryByProduct.get(row.productId);
    const key = categoryId ?? "uncategorized";
    const item = values.get(key) ?? {
      label: categoryId
        ? (categoryNames.get(categoryId) ?? "Ukendt kategori")
        : "Uden kategori",
      value: 0,
    };
    item.value += 1;
    values.set(key, item);
  }
  return seriesResult(
    "count",
    result.rows.map((row) => ({
      timestamp: row.registeredAt,
      locationId: row.locationId,
      value: 1,
    })),
    params,
    {
      breakdown: [...values.entries()]
        .map(([key, item]) => ({ key, ...item }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
      truncated: result.truncated || undefined,
    },
  );
};

async function badDeliveryRows(ctx: QueryCtx, params: DashboardMetricParams) {
  return await cached(params, "bad-deliveries", async () => {
    const selected = new Set(params.locations.map((location) => location.id));
    const location = params.locations.length === 1 ? params.locations[0] : null;
    const rows = location
      ? await ctx.db
          .query("badDeliveries")
          .withIndex(
            "by_organizationId_and_locationId_and_registeredAt",
            (q) =>
              q
                .eq("organizationId", params.organizationId)
                .eq("locationId", location.id)
                .gte("registeredAt", params.previousFrom)
                .lt("registeredAt", params.to),
          )
          .filter((q) => q.eq(q.field("status"), "active"))
          .take(MAX_ROWS + 1)
      : await ctx.db
          .query("badDeliveries")
          .withIndex("by_organizationId_and_status_and_registeredAt", (q) =>
            q
              .eq("organizationId", params.organizationId)
              .eq("status", "active")
              .gte("registeredAt", params.previousFrom)
              .lt("registeredAt", params.to),
          )
          .take(MAX_ROWS + 1);
    return {
      rows: rows
        .filter((row) => selected.has(row.locationId))
        .slice(0, MAX_ROWS),
      truncated: rows.length > MAX_ROWS,
    };
  });
}

const badDeliveries: MetricComputer = async (ctx, params) => {
  const result = await badDeliveryRows(ctx, params);
  return seriesResult(
    "count",
    result.rows.map((row) => ({
      timestamp: row.registeredAt,
      locationId: row.locationId,
      value: 1,
    })),
    params,
    { truncated: result.truncated || undefined },
  );
};

async function countRows(ctx: QueryCtx, params: DashboardMetricParams) {
  return await cached(params, "counts", async () => {
    const parts = await Promise.all(
      params.locations.map((location) =>
        ctx.db
          .query("counts")
          .withIndex("by_organizationId_and_locationId_and_periodKey", (q) =>
            q
              .eq("organizationId", params.organizationId)
              .eq("locationId", location.id),
          )
          .order("desc")
          .take(101),
      ),
    );
    return {
      rows: parts.flat().slice(0, MAX_ROWS),
      truncated:
        parts.some((part) => part.length > 100) ||
        parts.flat().length > MAX_ROWS,
    };
  });
}

const countCompliance: MetricComputer = async (ctx, params) => {
  const result = await countRows(ctx, params);
  const timed = result.rows.map((row) => ({
    timestamp: row.submittedAt ?? row._creationTime,
    locationId: row.locationId,
    submitted: row.status === "submitted",
  }));
  const groups = params.compare
    ? params.locations
    : [{ id: "all" as const, name: aggregateLocationLabel(params) }];
  const series = groups.map((group) => {
    const relevant = params.compare
      ? timed.filter((row) => row.locationId === group.id)
      : timed;
    const current = relevant.filter(
      (row) => row.timestamp >= params.from && row.timestamp < params.to,
    );
    const previous = relevant.filter(
      (row) =>
        row.timestamp >= params.previousFrom &&
        row.timestamp < params.previousTo,
    );
    const percent = (rows: typeof relevant) =>
      rows.length
        ? rounded(
            (rows.filter((row) => row.submitted).length / rows.length) * 100,
          )
        : 0;
    return {
      key: String(group.id),
      label: group.name,
      points: [{ t: params.from, value: percent(current) }],
      total: percent(current),
      previousTotal: percent(previous),
    };
  });
  return {
    unit: "percent",
    series,
    target: 100,
    truncated: result.truncated || undefined,
  };
};

const openCounts: MetricComputer = async (ctx, params) => {
  const result = await countRows(ctx, params);
  const snapshots = (locationId: Id<"locations"> | null, at: number) =>
    result.rows.filter(
      (row) =>
        (!locationId || row.locationId === locationId) &&
        row._creationTime < at &&
        (!row.submittedAt || row.submittedAt >= at),
    ).length;
  const groups = params.compare
    ? params.locations
    : [{ id: null, name: aggregateLocationLabel(params) }];
  return {
    unit: "count",
    series: groups.map((group) => ({
      key: group.id ?? "all",
      label: group.name,
      points: [
        {
          t: params.from,
          value: snapshots(group.id, Math.min(params.to, params.now + 1)),
        },
      ],
      total: snapshots(group.id, Math.min(params.to, params.now + 1)),
      previousTotal: snapshots(group.id, params.previousTo),
    })),
    truncated: result.truncated || undefined,
  };
};

async function transferRows(ctx: QueryCtx, params: DashboardMetricParams) {
  return await cached(params, "transfers", async () => {
    const selected = new Set(params.locations.map((location) => location.id));
    const location = params.locations.length === 1 ? params.locations[0] : null;
    const rows = location
      ? await Promise.all([
          ctx.db
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
            .take(MAX_ROWS + 1),
          ctx.db
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
            .take(MAX_ROWS + 1),
        ]).then(([sent, received]) =>
          [...new Map([...sent, ...received].map((row) => [row._id, row])).values()]
            .sort(
              (left, right) =>
                left.transferredAt - right.transferredAt ||
                left._creationTime - right._creationTime,
            ),
        )
      : await ctx.db
          .query("transfers")
          .withIndex("by_organizationId_and_transferredAt", (q) =>
            q
              .eq("organizationId", params.organizationId)
              .gte("transferredAt", params.previousFrom)
              .lt("transferredAt", params.to),
          )
          .take(MAX_ROWS + 1);
    return {
      rows: rows
        .filter(
          (row) =>
            selected.has(row.fromLocationId) || selected.has(row.toLocationId),
        )
        .slice(0, MAX_ROWS),
      truncated: rows.length > MAX_ROWS,
    };
  });
}

const transfers: MetricComputer = async (ctx, params) => {
  const result = await transferRows(ctx, params);
  return seriesResult(
    "count",
    result.rows.map((row) => ({
      timestamp: row.transferredAt,
      locationId: row.fromLocationId,
      value: 1,
    })),
    params,
    { truncated: result.truncated || undefined },
  );
};

async function transferItems(
  ctx: QueryCtx,
  params: DashboardMetricParams,
  transfers: Doc<"transfers">[],
) {
  return await cached(params, "transfer-items", async () => {
    const selected = transfers.slice(0, MAX_TRANSFER_DETAILS);
    const parts = await Promise.all(
      selected.map((transfer) =>
        ctx.db
          .query("transferItems")
          .withIndex("by_organizationId_and_transferId", (q) =>
            q
              .eq("organizationId", transfer.organizationId)
              .eq("transferId", transfer._id),
          )
          .take(201),
      ),
    );
    const rows = parts.flat();
    return {
      rows: rows.slice(0, MAX_ROWS),
      truncated:
        transfers.length > selected.length ||
        parts.some((part) => part.length > 200) ||
        rows.length > MAX_ROWS,
    };
  });
}

const itemsMoved: MetricComputer = async (ctx, params) => {
  const transferResult = await transferRows(ctx, params);
  const itemResult = await transferItems(ctx, params, transferResult.rows);
  const byTransfer = new Map(transferResult.rows.map((row) => [row._id, row]));
  const rows = itemResult.rows.flatMap((item) => {
    const transfer = byTransfer.get(item.transferId);
    return transfer
      ? [
          {
            timestamp: transfer.transferredAt,
            locationId: transfer.fromLocationId,
            value: item.quantity * (item.factorToDefault ?? 1),
          },
        ]
      : [];
  });
  return seriesResult("quantity", rows, params, {
    truncated: transferResult.truncated || itemResult.truncated || undefined,
  });
};

const topTransferredProducts: MetricComputer = async (ctx, params) => {
  const transferResult = await transferRows(ctx, params);
  const itemResult = await transferItems(ctx, params, transferResult.rows);
  const byTransfer = new Map(transferResult.rows.map((row) => [row._id, row]));
  const values = new Map<string, { label: string; value: number }>();
  const rows: TimedValue[] = [];
  for (const item of itemResult.rows) {
    const transfer = byTransfer.get(item.transferId);
    if (!transfer) continue;
    const value = item.quantity * (item.factorToDefault ?? 1);
    rows.push({
      timestamp: transfer.transferredAt,
      locationId: transfer.fromLocationId,
      value,
    });
    if (transfer.transferredAt >= params.from) {
      const entry = values.get(item.productId) ?? {
        label: item.productName,
        value: 0,
      };
      entry.value += value;
      values.set(item.productId, entry);
    }
  }
  return seriesResult("quantity", rows, params, {
    breakdown: [...values.entries()]
      .map(([key, item]) => ({
        key,
        label: item.label,
        value: rounded(item.value),
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
    truncated: transferResult.truncated || itemResult.truncated || undefined,
  });
};

async function staffFoodRows(ctx: QueryCtx, params: DashboardMetricParams) {
  return await cached(params, "staff-food", async () => {
    const selected = new Set(params.locations.map((location) => location.id));
    const location = params.locations.length === 1 ? params.locations[0] : null;
    const rows = location
      ? await ctx.db
          .query("staffFoodRegistrations")
          .withIndex(
            "by_organizationId_and_locationId_and_registeredAt",
            (q) =>
              q
                .eq("organizationId", params.organizationId)
                .eq("locationId", location.id)
                .gte("registeredAt", params.previousFrom)
                .lt("registeredAt", params.to),
          )
          .filter((q) => q.eq(q.field("status"), "active"))
          .take(MAX_ROWS + 1)
      : await ctx.db
          .query("staffFoodRegistrations")
          .withIndex("by_organizationId_and_registeredAt", (q) =>
            q
              .eq("organizationId", params.organizationId)
              .gte("registeredAt", params.previousFrom)
              .lt("registeredAt", params.to),
          )
          .take(MAX_ROWS + 1);
    return {
      rows: rows
        .filter(
          (row) => row.status === "active" && selected.has(row.locationId),
        )
        .slice(0, MAX_ROWS),
      truncated: rows.length > MAX_ROWS,
    };
  });
}

const staffFoodRegistrations: MetricComputer = async (ctx, params) => {
  const result = await staffFoodRows(ctx, params);
  return seriesResult(
    "count",
    result.rows.map((row) => ({
      timestamp: row.registeredAt,
      locationId: row.locationId,
      value: 1,
    })),
    params,
    { truncated: result.truncated || undefined },
  );
};

const staffFoodPerEmployee: MetricComputer = async (ctx, params) => {
  const result = await staffFoodRows(ctx, params);
  const values = new Map<string, { label: string; value: number }>();
  for (const row of result.rows.filter(
    (row) => row.registeredAt >= params.from,
  )) {
    const item = values.get(row.employeeId) ?? {
      label: row.employeeName,
      value: 0,
    };
    item.value += 1;
    values.set(row.employeeId, item);
  }
  return seriesResult(
    "count",
    result.rows.map((row) => ({
      timestamp: row.registeredAt,
      locationId: row.locationId,
      value: 1,
    })),
    params,
    {
      breakdown: [...values.entries()]
        .map(([key, item]) => ({ key, ...item }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
      truncated: result.truncated || undefined,
    },
  );
};

async function shiftRows(
  ctx: QueryCtx,
  params: DashboardMetricParams,
  from = params.previousFrom,
  to = params.to,
) {
  return await cached(params, `shifts:${from}:${to}`, async () => {
    const selected = new Set(params.locations.map((location) => location.id));
    const location = params.locations.length === 1 ? params.locations[0] : null;
    const rows = location
      ? await ctx.db
          .query("scheduledShifts")
          .withIndex(
            "by_organizationId_and_locationId_and_startsAt",
            (q) =>
              q
                .eq("organizationId", params.organizationId)
                .eq("locationId", location.id)
                .gte("startsAt", from)
                .lt("startsAt", to),
          )
          .take(MAX_ROWS + 1)
      : await ctx.db
          .query("scheduledShifts")
          .withIndex("by_organizationId_and_startsAt", (q) =>
            q
              .eq("organizationId", params.organizationId)
              .gte("startsAt", from)
              .lt("startsAt", to),
          )
          .take(MAX_ROWS + 1);
    return {
      rows: rows
        .filter((row) => selected.has(row.locationId))
        .slice(0, MAX_ROWS),
      truncated: rows.length > MAX_ROWS,
    };
  });
}

const scheduledHours: MetricComputer = async (ctx, params) => {
  const result = await shiftRows(ctx, params);
  return seriesResult(
    "hours",
    result.rows.map((row) => ({
      timestamp: row.startsAt,
      locationId: row.locationId,
      value: Math.max(0, row.endsAt - row.startsAt) / 3_600_000,
    })),
    params,
    { truncated: result.truncated || undefined },
  );
};

const headcountToday: MetricComputer = async (ctx, params) => {
  const today = dateKey(params.now, params.timeZone);
  const from = zonedStart(today, params.timeZone);
  const to = zonedStart(addDays(today, 1), params.timeZone);
  const result = await shiftRows(ctx, params, from - DAY_MS * 2, to);
  const groups = params.compare
    ? params.locations
    : [{ id: "all" as const, name: aggregateLocationLabel(params) }];
  const employees = await Promise.all(
    [...new Set(result.rows.map((row) => row.employeeId))].map((id) =>
      ctx.db.get("employees", id),
    ),
  );
  const names = new Map(
    employees.flatMap((employee) =>
      employee ? [[employee._id, employee.displayName] as const] : [],
    ),
  );
  const active = result.rows.filter(
    (row) => row.startsAt < to && row.endsAt > from,
  );
  return {
    unit: "count",
    series: groups.map((group) => {
      const rows = params.compare
        ? active.filter((row) => row.locationId === group.id)
        : active;
      const total = new Set(rows.map((row) => row.employeeId)).size;
      return {
        key: String(group.id),
        label: group.name,
        points: [{ t: from, value: total }],
        total,
        previousTotal: null,
      };
    }),
    breakdown: [...new Set(active.map((row) => row.employeeId))]
      .slice(0, 10)
      .map((id) => ({
        key: id,
        label: names.get(id) ?? "Ukendt medarbejder",
        value: 1,
      })),
    truncated: result.truncated || undefined,
  };
};

const locationComparison: MetricComputer = async (ctx, params) => {
  const comparisonParams =
    params.accessGranularity === "anonymous" && params.anonymousLocations
      ? {
          ...params,
          locations: params.anonymousLocations,
          comparisonGroups: params.anonymousComparisonGroups,
          compare: true,
          cache: new Map<string, Promise<unknown>>(),
        }
      : { ...params, compare: true };
  const [waste, deliveries, transferResult, staffFood] = await Promise.all([
    wasteRows(ctx, comparisonParams),
    badDeliveryRows(ctx, comparisonParams),
    transferRows(ctx, comparisonParams),
    staffFoodRows(ctx, comparisonParams),
  ]);
  const rows: TimedValue[] = [
    ...waste.rows.map((row) => ({
      timestamp: row.registeredAt,
      locationId: row.locationId,
      value: 1,
    })),
    ...deliveries.rows.map((row) => ({
      timestamp: row.registeredAt,
      locationId: row.locationId,
      value: 1,
    })),
    ...transferResult.rows.map((row) => ({
      timestamp: row.transferredAt,
      locationId: row.fromLocationId,
      value: 1,
    })),
    ...staffFood.rows.map((row) => ({
      timestamp: row.registeredAt,
      locationId: row.locationId,
      value: 1,
    })),
  ];
  const compared = seriesResult(
    "count",
    rows,
    comparisonParams,
    {
      truncated:
        waste.truncated ||
        deliveries.truncated ||
        transferResult.truncated ||
        staffFood.truncated ||
        comparisonParams.anonymousScopeTruncated ||
        undefined,
    },
    comparisonParams.comparisonGroups,
  );
  return {
    ...compared,
    breakdown: compared.series
      .map((series) => ({
        key: series.key,
        label: series.label,
        value: series.total,
      }))
      .sort((a, b) => b.value - a.value),
  };
};

async function salesDailyRows(ctx: QueryCtx, params: DashboardMetricParams) {
  return await cached(params, "sales-daily", async () => {
    const rows: Doc<"salesDaily">[] = [];
    let truncated = false;
    for (const location of params.locations) {
      const remaining = MAX_ROWS - rows.length;
      if (remaining === 0) {
        truncated = true;
        break;
      }
      const locationRows = await ctx.db
        .query("salesDaily")
        .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
          q
            .eq("organizationId", params.organizationId)
            .eq("locationId", location.id)
            .gte("dayStart", params.previousFrom)
            .lt("dayStart", params.to),
        )
        .take(remaining + 1);
      rows.push(...locationRows.slice(0, remaining));
      if (locationRows.length > remaining) {
        truncated = true;
        break;
      }
    }
    return { rows, truncated };
  });
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
    { ...currencyOptions(params), truncated: result.truncated || undefined },
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
  const currencies = currencyOptions(params);
  const groups = params.compare
    ? params.locations.map((location) => ({
        key: location.id,
        label: location.name,
      }))
    : [{ key: "all" as const, label: aggregateLocationLabel(params) }];
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
      (row) =>
        row.dayStart >= params.previousFrom && row.dayStart < params.previousTo,
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
    const previousOrders = previous.reduce(
      (sum, row) => sum + row.orderCount,
      0,
    );
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
          value: rounded(
            entry && entry.orders > 0 ? entry.revenue / 100 / entry.orders : 0,
          ),
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
    ...currencies,
    truncated: result.truncated || undefined,
    ...(currencies.mixedCurrency
      ? {}
      : {
          headlineTotal: rounded(
            headlineOrders > 0 ? headlineRevenue / 100 / headlineOrders : 0,
          ),
          headlinePrevious: rounded(
            headlinePreviousOrders > 0
              ? headlinePreviousRevenue / 100 / headlinePreviousOrders
              : 0,
          ),
        }),
  };
};

function nonLocationBreakdown(result: MetricResult) {
  const seriesKeys = new Set(result.series.map((series) => series.key));
  return result.breakdown?.filter((item) => !seriesKeys.has(item.key));
}

function aggregateResult(
  result: MetricResult,
  params: DashboardMetricParams,
): MetricResult {
  if (result.series.length <= 1) {
    return { ...result, breakdown: nonLocationBreakdown(result) };
  }
  const total =
    result.headlineTotal ??
    result.series.reduce((sum, series) => sum + series.total, 0);
  const previousValues = result.series.map((series) => series.previousTotal);
  const previousTotal =
    result.headlinePrevious !== undefined
      ? result.headlinePrevious
      : previousValues.some((value) => value === null)
        ? null
        : previousValues.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const byTime = new Map<number, number>();
  if (result.headlineTotal === undefined) {
    for (const series of result.series) {
      for (const point of series.points) {
        byTime.set(point.t, (byTime.get(point.t) ?? 0) + point.value);
      }
    }
  }
  return {
    ...result,
    breakdown: nonLocationBreakdown(result),
    series: [
      {
        key: "all",
        label: aggregateLocationLabel(params),
        points: [...byTime.entries()]
          .sort(([left], [right]) => left - right)
          .map(([t, value]) => ({ t, value: rounded(value) })),
        total: rounded(total),
        previousTotal: previousTotal === null ? null : rounded(previousTotal),
      },
    ],
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
  return `Lokation ${label}`;
}

async function anonymousAliases(params: DashboardMetricParams) {
  if (params.ownLocationIds === null)
    return new Map<string, { key: string; label: string }>();
  const locations = params.anonymousLocations ?? params.locations;
  const comparisonGroups =
    params.anonymousComparisonGroups ?? params.comparisonGroups;
  const keys = new Set<string>();
  for (const location of locations) {
    if (!params.ownLocationIds.has(location.id)) keys.add(location.id);
  }
  for (const group of comparisonGroups ?? []) {
    if (group.locationIds.some((id) => !params.ownLocationIds?.has(id))) {
      keys.add(group.key);
    }
  }
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
  return new Map(
    scored.map(({ key }, index) => [
      key,
      { key: `restaurant-${index + 1}`, label: restaurantLabel(index) },
    ]),
  );
}

async function applyAccessGranularity(
  result: MetricResult,
  params: DashboardMetricParams,
) {
  if (params.accessGranularity === "detail") return result;
  if (params.accessGranularity === "aggregate") {
    return aggregateResult(result, params);
  }
  const aliases = await anonymousAliases(params);
  if (!aliases.size) return result;
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

function withAccessGranularity(
  metricId: MetricId,
  computer: MetricComputer,
): MetricComputer {
  return async (ctx, params) => {
    const effectiveParams =
      metricRegistry[metricId].sensitive && !params.salesDetailAllowed
        ? { ...params, accessGranularity: "aggregate" as const }
        : params;
    return await applyAccessGranularity(
      await computer(ctx, effectiveParams),
      effectiveParams,
    );
  };
}

function withMetricMetadata(
  metricId: MetricId,
  computer: MetricComputer,
): MetricComputer {
  const accessAware = withAccessGranularity(metricId, computer);
  const source = metricRegistry[metricId].source;
  if (source === "internal") return accessAware;
  return async (ctx, params) => ({
    ...(await accessAware(ctx, params)),
    freshness: await integrationFreshness(ctx, params, source),
  });
}

export const dashboardMetricComputers: Record<MetricId, MetricComputer> = {
  wasteQuantity: withMetricMetadata("wasteQuantity", wasteQuantity),
  wasteRegistrations: withMetricMetadata(
    "wasteRegistrations",
    wasteRegistrations,
  ),
  topWastedProducts: withMetricMetadata("topWastedProducts", topWastedProducts),
  wasteByCategory: withMetricMetadata("wasteByCategory", wasteByCategory),
  badDeliveries: withMetricMetadata("badDeliveries", badDeliveries),
  countCompliance: withMetricMetadata("countCompliance", countCompliance),
  openCounts: withMetricMetadata("openCounts", openCounts),
  transfers: withMetricMetadata("transfers", transfers),
  itemsMoved: withMetricMetadata("itemsMoved", itemsMoved),
  topTransferredProducts: withMetricMetadata(
    "topTransferredProducts",
    topTransferredProducts,
  ),
  staffFoodRegistrations: withMetricMetadata(
    "staffFoodRegistrations",
    staffFoodRegistrations,
  ),
  staffFoodPerEmployee: withMetricMetadata(
    "staffFoodPerEmployee",
    staffFoodPerEmployee,
  ),
  scheduledHours: withMetricMetadata("scheduledHours", scheduledHours),
  headcountToday: withMetricMetadata("headcountToday", headcountToday),
  locationComparison: withMetricMetadata(
    "locationComparison",
    locationComparison,
  ),
  salesRevenue: withMetricMetadata("salesRevenue", salesRevenue),
  salesOrderCount: withMetricMetadata("salesOrderCount", salesOrderCount),
  averageBasket: withMetricMetadata("averageBasket", averageBasket),
};
