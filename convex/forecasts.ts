import { ConvexError, v } from "convex/values";
import { getEntitlements } from "./lib/features";
import {
  paginationOptsValidator,
  paginationResultValidator,
  type FunctionReturnType,
} from "convex/server";
import { internal } from "./_generated/api";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { requireLocationAccess, requirePermission } from "./lib/auth";
import { resolveTimeZone } from "./lib/timeZone";
import { fetchForecastConditions } from "./lib/forecastProviders";
import { readGooglePoint } from "./lib/googlePlaces";
import { rateLimiter } from "./lib/rateLimits";
import { setForecastProfile } from "./lib/forecastSettings";
import {
  forecastConditionValidator,
  forecastSnapshotValidator,
  forecastOpeningDayValidator,
  forecastRegionValidator,
  FORECAST_WEATHER_PROVIDER,
  usesGoogleForecastLocation,
} from "./lib/forecastValidators";
import { getForecastOpeningHours } from "./lib/forecastOpeningHours";
import { orderDate, shiftOrderDate } from "../lib/ordering-forecast";
import { zonedStart } from "../lib/date";
import {
  forecastSalesMix,
  FORECAST_MODEL_VERSION,
  PRODUCT_FORECAST_HISTORY_DAYS,
  type ProductDailySales,
  SALES_FORECAST_HISTORY_DAYS,
  SALES_FORECAST_DAYS,
} from "../lib/sales-forecast";

async function requireUnchangedSales(
  ctx: QueryCtx,
  forecast: Doc<"locationForecasts">,
  salesRunToken: string,
) {
  const status = await ctx.db
    .query("onlinePosSyncStatus")
    .withIndex("by_organizationId_and_locationId", (q) =>
      q
        .eq("organizationId", forecast.organizationId)
        .eq("locationId", forecast.locationId),
    )
    .unique();
  if (
    status?.state !== "idle" ||
    status.runToken !== salesRunToken ||
    status.dayStartRerollToken ||
    status.pendingReconcileDayStart !== undefined
  )
    throw new ConvexError(
      "Salgshistorikken blev ændret under prognosen. Prøv igen.",
    );
}

export const requestRefresh = mutation({
  args: { locationId: v.id("locations") },
  returns: v.null(),
  handler: async (ctx, { locationId }) => {
    const auth = await requirePermission(ctx, "ordering.plan");
    if (auth.kioskModeEnabled)
      throw new ConvexError(
        "Du har ikke adgang til bestilling i kiosktilstand",
      );
    requireLocationAccess(auth, locationId);
    const location = await ctx.db.get("locations", locationId);
    if (!location || location.organizationId !== auth.organizationId)
      throw new ConvexError("Lokationen blev ikke fundet");
    const forecast = await ctx.db
      .query("locationForecasts")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("locationId", locationId),
      )
      .unique();
    if (forecast)
      await ctx.scheduler.runAfter(0, internal.forecasts.refreshLocation, {
        forecastId: forecast._id,
      });
    return null;
  },
});

export const dispatch = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Set FORECAST_DISPATCH_DISABLED=1 on dev deployments to stop paying
    // for forecast refreshes against test data.
    if (env.FORECAST_DISPATCH_DISABLED === "1") return null;
    const page = await ctx.db
      .query("locationForecasts")
      .withIndex("by_creation_time")
      .paginate({
        cursor: args.cursor,
        numItems: 25,
        maximumBytesRead: 1_000_000,
      });
    for (let index = 0; index < page.page.length; index++) {
      await ctx.scheduler.runAfter(
        index * 1000,
        internal.forecasts.refreshLocation,
        { forecastId: page.page[index]._id },
      );
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(30_000, internal.forecasts.dispatch, {
        cursor: page.continueCursor,
      });
    return null;
  },
});

export const claim = internalMutation({
  args: { forecastId: v.id("locationForecasts") },
  returns: v.union(schema.doc("locationForecasts"), v.null()),
  handler: async (ctx, { forecastId }) => {
    const forecast = await ctx.db.get("locationForecasts", forecastId);
    if (!forecast) return null;
    const location = await ctx.db.get("locations", forecast.locationId);
    if (!location || location.organizationId !== forecast.organizationId) {
      await ctx.db.delete("locationForecasts", forecastId);
      return null;
    }
    if ((await getEntitlements(ctx, forecast.organizationId))?.status === "suspended") {
      return null;
    }
    const now = Date.now();
    if (forecast.runStartedAt && now - forecast.runStartedAt < 15 * 60_000)
      return null;
    const timeZone = await resolveTimeZone(
      ctx,
      forecast.organizationId,
      forecast.locationId,
    );
    const changedZone = timeZone !== forecast.timeZone;
    const changedProvider =
      forecast.weatherProvider !== FORECAST_WEATHER_PROVIDER;
    const changedProfile = !usesGoogleForecastLocation(forecast.profile);
    if (
      !changedZone &&
      !changedProvider &&
      !changedProfile &&
      forecast.snapshot?.modelVersion === FORECAST_MODEL_VERSION &&
      forecast.updatedAt &&
      now - forecast.updatedAt < 10 * 60_000
    )
      return null;
    // Nothing to recompute when sales are unchanged since the snapshot and
    // the cached weather is still inside its reuse window.
    if (
      !changedZone &&
      !changedProvider &&
      !changedProfile &&
      forecast.snapshot?.modelVersion === FORECAST_MODEL_VERSION &&
      forecast.snapshotSalesRunToken &&
      forecast.weatherUpdatedAt &&
      now - forecast.weatherUpdatedAt < 5 * 3_600_000 &&
      orderDate(forecast.weatherUpdatedAt, timeZone) === orderDate(now, timeZone)
    ) {
      const status = await ctx.db
        .query("onlinePosSyncStatus")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q
            .eq("organizationId", forecast.organizationId)
            .eq("locationId", forecast.locationId),
        )
        .unique();
      if (
        status?.state === "idle" &&
        status.runToken === forecast.snapshotSalesRunToken &&
        !status.dayStartRerollToken &&
        status.pendingReconcileDayStart === undefined
      )
        return null;
    }
    const changes = {
      runStartedAt: now,
      ...(changedZone || changedProvider || changedProfile
        ? {
            profile: { source: "google" },
            timeZone,
            weatherProvider: FORECAST_WEATHER_PROVIDER,
            revision: forecast.revision + 1,
            conditions: [],
            archiveThrough: undefined,
            weatherUpdatedAt: undefined,
            weatherWarning: undefined,
            snapshot: undefined,
            snapshotSalesRunToken: undefined,
            updatedAt: undefined,
            warning: undefined,
          }
        : {}),
    } satisfies Partial<Doc<"locationForecasts">>;
    await ctx.db.patch("locationForecasts", forecastId, changes);
    return { ...forecast, ...changes };
  },
});

export const trainingData = internalQuery({
  args: { forecastId: v.id("locationForecasts"), today: v.string() },
  returns: v.object({
    observations: v.array(v.object({ date: v.string(), value: v.number() })),
    warning: v.string(),
    openingDays: v.array(forecastOpeningDayValidator),
    openingHoursKey: v.string(),
    salesRunToken: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { forecastId, today }) => {
    const forecast = await ctx.db.get("locationForecasts", forecastId);
    if (!forecast)
      return {
        observations: [],
        warning: "Prognosen er deaktiveret.",
        openingDays: [],
        openingHoursKey: "",
        salesRunToken: null,
      };
    const { organizationId, locationId, timeZone } = forecast;
    const location = await ctx.db.get("locations", locationId);
    if (!location || location.organizationId !== organizationId)
      return {
        observations: [],
        warning: "Lokationen findes ikke længere.",
        openingDays: [],
        openingHoursKey: "",
        salesRunToken: null,
      };
    const opening = await getForecastOpeningHours(
      ctx,
      location,
      today,
      shiftOrderDate(today, -SALES_FORECAST_HISTORY_DAYS),
      shiftOrderDate(today, 27),
    );
    const openingData = {
      openingDays: opening.days,
      openingHoursKey: opening.key,
      salesRunToken: null,
    };
    const status = await ctx.db
      .query("onlinePosSyncStatus")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", locationId),
      )
      .unique();
    // Keep the previous snapshot while a sales sync is still in progress.
    if (status?.state === "running" || status?.state === "queued")
      throw new ConvexError("Prognosen afventer synkroniseret salgshistorik.");
    if (
      status?.state !== "idle" ||
      !status.runToken ||
      !status.syncedThroughAt ||
      orderDate(status.syncedThroughAt, timeZone) < today ||
      status.dayStartRerollToken ||
      status.pendingReconcileDayStart !== undefined
    ) {
      return {
        ...openingData,
        observations: [],
        warning: "Prognosen afventer synkroniseret salgshistorik.",
      };
    }
    const historyFrom = shiftOrderDate(today, -SALES_FORECAST_HISTORY_DAYS);
    const rows = await ctx.db
      .query("salesDaily")
      .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", locationId)
          .gte(
            "dayStart",
            Date.parse(`${shiftOrderDate(historyFrom, -1)}T00:00:00Z`),
          )
          .lt("dayStart", Date.parse(`${shiftOrderDate(today, 1)}T00:00:00Z`)),
      )
      .take(SALES_FORECAST_HISTORY_DAYS + 3);
    if (!rows.length || rows.length > SALES_FORECAST_HISTORY_DAYS + 2)
      return {
        ...openingData,
        observations: [],
        warning: "Der er ikke tilstrækkelig sammenhængende salgshistorik.",
      };
    const coverageAt = Math.max(
      status.dailyHistoryFrom ?? 0,
      status.backfillThroughAt ?? rows[0].dayStart,
    );
    // Skip the coverage edge: the first synchronized day can be partial.
    const from = [
      historyFrom,
      shiftOrderDate(orderDate(coverageAt, timeZone), 1),
    ]
      .sort()
      .at(-1)!;
    const byDate = new Map<string, number>();
    for (const row of rows)
      byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.revenue);
    const observations = [];
    for (let date = from; date < today; date = shiftOrderDate(date, 1)) {
      observations.push({ date, value: Math.max(0, byDate.get(date) ?? 0) });
    }
    return {
      ...openingData,
      observations,
      salesRunToken: status.runToken,
      warning:
        observations.length < 14
          ? "Prognosen kræver mindst 14 hele dage med salgshistorik."
          : "",
    };
  },
});

const productSalesValidator = v.object({
  key: v.string(),
  date: v.string(),
  quantity: v.number(),
  revenue: v.number(),
});

export const productSalesPage = internalQuery({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    timeZone: v.string(),
    from: v.string(),
    today: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    result: paginationResultValidator(productSalesValidator),
    rowsRead: v.number(),
    rolledUp: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const fromDayStart = zonedStart(args.from, args.timeZone);
    const status = await ctx.db
      .query("onlinePosSyncStatus")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("locationId", args.locationId),
      )
      .unique();
    if (
      status?.productDailyFrom !== undefined &&
      status.productDailyFrom <= fromDayStart
    ) {
      const result = await ctx.db
        .query("salesProductDaily")
        .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("locationId", args.locationId)
            .gte("dayStart", fromDayStart)
            .lt("dayStart", zonedStart(args.today, args.timeZone)),
        )
        .paginate({
          ...args.paginationOpts,
          maximumRowsRead: 1000,
          maximumBytesRead: 512 * 1024,
        });
      return {
        result: {
          ...result,
          page: result.page.map((row) => ({
            key: JSON.stringify([row.source, row.externalProductId]),
            date: row.date,
            quantity: row.quantity,
            revenue: row.revenue,
          })),
        },
        rowsRead: result.page.length,
        rolledUp: true,
      };
    }
    // Stable history arguments keep weather refreshes from invalidating these reads.
    const result = await ctx.db
      .query("salesLines")
      .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("locationId", args.locationId)
          .gte("occurredAt", zonedStart(args.from, args.timeZone))
          .lt("occurredAt", zonedStart(args.today, args.timeZone)),
      )
      .paginate({
        ...args.paginationOpts,
        maximumRowsRead: 1000,
        maximumBytesRead: 512 * 1024,
      });
    const daily = new Map<string, ProductDailySales>();
    for (const row of result.page) {
      const date = orderDate(row.occurredAt, args.timeZone);
      const key = JSON.stringify([row.source, row.externalProductId]);
      const bucket = JSON.stringify([key, date]);
      const current = daily.get(bucket) ?? {
        key,
        date,
        quantity: 0,
        revenue: 0,
      };
      current.quantity += row.quantity;
      current.revenue += row.revenue;
      daily.set(bucket, current);
    }
    return {
      result: { ...result, page: [...daily.values()] },
      rowsRead: result.page.length,
      rolledUp: false,
    };
  },
});

const seedArgs = {
  organizationId: v.string(),
  locationId: v.id("locations"),
  timeZone: v.string(),
  from: v.string(),
  today: v.string(),
  salesRunToken: v.string(),
  forecastId: v.id("locationForecasts"),
  revision: v.number(),
  runStartedAt: v.number(),
};

type SeedArgs = {
  organizationId: string;
  locationId: Id<"locations">;
  salesRunToken: string;
  forecastId: Id<"locationForecasts">;
  revision: number;
  runStartedAt: number;
};

async function seedStatus(ctx: MutationCtx, args: SeedArgs) {
  // Only the forecast run that still owns the location may seed; a newer
  // claim (or an opening-hours invalidation) revokes stale seed steps.
  const forecast = await ctx.db.get("locationForecasts", args.forecastId);
  if (
    !forecast ||
    forecast.organizationId !== args.organizationId ||
    forecast.locationId !== args.locationId ||
    forecast.revision !== args.revision ||
    forecast.runStartedAt !== args.runStartedAt
  )
    return null;
  const status = await ctx.db
    .query("onlinePosSyncStatus")
    .withIndex("by_organizationId_and_locationId", (q) =>
      q
        .eq("organizationId", args.organizationId)
        .eq("locationId", args.locationId),
    )
    .unique();
  if (
    !status ||
    status.state !== "idle" ||
    status.runToken !== args.salesRunToken ||
    status.dayStartRerollToken ||
    status.pendingReconcileDayStart !== undefined
  )
    return null;
  return status;
}

// Seeding is chunked from refreshLocation after a fallback line scan. Every
// step revalidates the sales token, so a sync landing mid-seed aborts it and
// leaves the coverage marker unset (the next refresh rescans and reseeds).
export const beginProductDailySeed = internalMutation({
  args: seedArgs,
  returns: v.object({ active: v.boolean(), cleared: v.boolean() }),
  handler: async (ctx, args) => {
    const status = await seedStatus(ctx, args);
    if (!status) return { active: false, cleared: false };
    // Invalidate any pending reroll cleanup so it cannot delete seeded rows.
    await ctx.db.patch("onlinePosSyncStatus", status._id, {
      productDailyFrom: undefined,
      productDailyGeneration: (status.productDailyGeneration ?? 0) + 1,
    });
    const rows = await ctx.db
      .query("salesProductDaily")
      .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("locationId", args.locationId)
          .gte("dayStart", zonedStart(args.from, args.timeZone))
          .lt("dayStart", zonedStart(args.today, args.timeZone)),
      )
      .take(500);
    for (const row of rows) await ctx.db.delete(row._id);
    return { active: true, cleared: rows.length < 500 };
  },
});

export const appendProductDailySeed = internalMutation({
  args: { ...seedArgs, rows: v.array(productSalesValidator) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (args.rows.length > 500) throw new Error("Seed chunk too large");
    const status = await seedStatus(ctx, args);
    if (!status) return false;
    const now = Date.now();
    for (const row of args.rows) {
      if (row.quantity === 0 && row.revenue === 0) continue;
      const parsed: unknown = JSON.parse(row.key);
      if (
        !Array.isArray(parsed) ||
        parsed.length !== 2 ||
        typeof parsed[0] !== "string" ||
        typeof parsed[1] !== "string"
      )
        throw new Error("Invalid product sales key");
      const dayStart = zonedStart(row.date, args.timeZone);
      // Upsert absolute totals so a retried chunk cannot duplicate a bucket.
      const existing = await ctx.db
        .query("salesProductDaily")
        .withIndex("by_org_location_dayStart_source_externalProductId", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("locationId", args.locationId)
            .eq("dayStart", dayStart)
            .eq("source", parsed[0] as string)
            .eq("externalProductId", parsed[1] as string),
        )
        .unique();
      if (existing) {
        await ctx.db.patch("salesProductDaily", existing._id, {
          date: row.date,
          quantity: row.quantity,
          revenue: row.revenue,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("salesProductDaily", {
          organizationId: args.organizationId,
          locationId: args.locationId,
          dayStart,
          date: row.date,
          source: parsed[0],
          externalProductId: parsed[1],
          quantity: row.quantity,
          revenue: row.revenue,
          updatedAt: now,
        });
      }
    }
    return true;
  },
});

export const finishProductDailySeed = internalMutation({
  args: seedArgs,
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const status = await seedStatus(ctx, args);
    if (!status) return false;
    await ctx.db.patch("onlinePosSyncStatus", status._id, {
      productDailyFrom: zonedStart(args.from, args.timeZone),
    });
    return true;
  },
});

export const cacheConditions = internalMutation({
  args: {
    forecastId: v.id("locationForecasts"),
    revision: v.number(),
    runStartedAt: v.number(),
    conditions: v.array(forecastConditionValidator),
    archiveThrough: v.optional(v.string()),
    warning: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const current = await ctx.db.get("locationForecasts", args.forecastId);
    if (
      !current ||
      current.revision !== args.revision ||
      current.runStartedAt !== args.runStartedAt
    )
      return false;
    if (args.conditions.length > 428)
      throw new Error("Forecast exceeds bounded storage");
    await ctx.db.patch("locationForecasts", current._id, {
      conditions: args.conditions,
      archiveThrough: args.archiveThrough,
      weatherProvider: FORECAST_WEATHER_PROVIDER,
      weatherUpdatedAt: Date.now(),
      weatherWarning: args.warning || undefined,
      warning: args.warning || undefined,
    });
    return true;
  },
});

export const finish = internalMutation({
  args: {
    forecastId: v.id("locationForecasts"),
    revision: v.number(),
    runStartedAt: v.number(),
    salesRunToken: v.union(v.string(), v.null()),
    snapshot: forecastSnapshotValidator,
    warning: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await ctx.db.get("locationForecasts", args.forecastId);
    if (
      !current ||
      current.revision !== args.revision ||
      current.runStartedAt !== args.runStartedAt
    )
      return null;
    if (args.salesRunToken !== null)
      await requireUnchangedSales(ctx, current, args.salesRunToken);
    if (args.snapshot.points.length > 28)
      throw new Error("Forecast exceeds bounded storage");
    await ctx.db.patch("locationForecasts", current._id, {
      snapshot: args.snapshot,
      snapshotSalesRunToken: args.salesRunToken ?? undefined,
      warning: args.warning || undefined,
      runStartedAt: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const fail = internalMutation({
  args: {
    forecastId: v.id("locationForecasts"),
    revision: v.number(),
    runStartedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await ctx.db.get("locationForecasts", args.forecastId);
    if (
      current?.revision === args.revision &&
      current.runStartedAt === args.runStartedAt
    ) {
      await ctx.db.patch("locationForecasts", current._id, {
        runStartedAt: undefined,
        warning: "Prognosen kunne ikke opdateres. Prøv igen senere.",
      });
    }
    return null;
  },
});

export const googleForecastPlace = internalQuery({
  args: { forecastId: v.id("locationForecasts"), revision: v.number() },
  returns: v.union(v.object({ placeId: v.string(), organizationId: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const forecast = await ctx.db.get("locationForecasts", args.forecastId);
    if (!forecast || forecast.revision !== args.revision) return null;
    const location = await ctx.db.get("locations", forecast.locationId);
    if (!location || location.organizationId !== forecast.organizationId || !location.googlePlaceId) return null;
    return { placeId: location.googlePlaceId, organizationId: location.organizationId };
  },
});

export const cacheRegion = internalMutation({
  args: {
    forecastId: v.id("locationForecasts"),
    revision: v.number(),
    region: forecastRegionValidator,
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const forecast = await ctx.db.get("locationForecasts", args.forecastId);
    if (!forecast || forecast.revision !== args.revision) return false;
    const location = await ctx.db.get("locations", forecast.locationId);
    if (!location || location.organizationId !== forecast.organizationId ||
      location.googlePlaceId !== args.region.googlePlaceId) return false;
    await setForecastProfile(ctx, forecast.organizationId, forecast.locationId, { source: "google" }, false, args.region);
    return true;
  },
});

export const refreshLocation = internalAction({
  args: { forecastId: v.id("locationForecasts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const forecast = await ctx.runMutation(internal.forecasts.claim, args);
    if (!forecast?.runStartedAt) return null;
    const run = {
      ...args,
      revision: forecast.revision,
      runStartedAt: forecast.runStartedAt,
    };
    try {
      const today = orderDate(Date.now(), forecast.timeZone);
      const weatherDates = new Set(
        forecast.conditions
          .filter((day) => day.temperature !== null && day.precipitation !== null)
          .map((day) => day.date),
      );
      const reuseWeather =
        forecast.weatherUpdatedAt !== undefined &&
        Date.now() - forecast.weatherUpdatedAt < 5 * 3_600_000 &&
        orderDate(forecast.weatherUpdatedAt, forecast.timeZone) === today &&
        forecast.archiveThrough === shiftOrderDate(today, -1) &&
        Array.from({ length: SALES_FORECAST_DAYS + 1 }, (_, index) =>
          shiftOrderDate(today, index - 1),
        ).every((date) => weatherDates.has(date));
      let environment: Awaited<ReturnType<typeof fetchForecastConditions>> = {
        conditions: forecast.conditions,
        archiveThrough: forecast.archiveThrough,
        warning: forecast.weatherWarning ?? "",
      };
      if (!reuseWeather) {
        if (!env.GOOGLE_PLACES_API_KEY?.trim()) throw new Error("Google Places is not configured");
        const connection = await ctx.runQuery(internal.forecasts.googleForecastPlace, { forecastId: args.forecastId, revision: forecast.revision });
        if (!connection) throw new Error("Forecast location changed");
        const organizationLimit = await rateLimiter.limit(ctx, "googlePlacesReadOrganization", { key: connection.organizationId });
        if (!organizationLimit.ok) throw new Error("Forecast location limit reached");
        const dailyLimit = await rateLimiter.limit(ctx, "googlePlacesDaily", { key: "deployment" });
        if (!dailyLimit.ok) throw new Error("Forecast location limit reached");
        const point = await readGooglePoint(connection.placeId);
        const region = forecast.region;
        const subdivisionCode = region?.googlePlaceId === connection.placeId &&
          region.latitude === point.latitude && region.longitude === point.longitude &&
          region.countryCode === point.countryCode ? region.subdivisionCode : null;
        environment = await fetchForecastConditions({
          profile: { ...point, ...(subdivisionCode ? { subdivisionCode } : {}) },
          timeZone: forecast.timeZone,
          today,
          cached: forecast.conditions,
          archiveThrough: forecast.archiveThrough,
        });
      }
      // Keep paid weather reads even when sales change before the forecast finishes.
      if (!reuseWeather) {
        const cached: boolean = await ctx.runMutation(
          internal.forecasts.cacheConditions,
          { ...run, ...environment },
        );
        if (!cached) return null;
      }
      const training = await ctx.runQuery(internal.forecasts.trainingData, {
        ...args,
        today,
      });
      const productSales = new Map<string, ProductDailySales>();
      let cursor: string | null = null;
      let rowsRead = 0;
      const calibrationFrom = shiftOrderDate(today, -28);
      const recentRevenue = training.observations
        .filter((row) => row.date >= calibrationFrom && row.date < today)
        .reduce((sum, row) => sum + row.value, 0);
      let productsComplete =
        !training.warning && training.salesRunToken !== null && recentRevenue > 0;
      const productHistoryFrom = [
        shiftOrderDate(today, -PRODUCT_FORECAST_HISTORY_DAYS),
        training.observations[0]?.date ?? today,
      ].sort().at(-1)!;
      let rolledUp = true;
      if (productsComplete)
        for (let pageNumber = 0; ; pageNumber++) {
          const page: FunctionReturnType<
            typeof internal.forecasts.productSalesPage
          > = await ctx.runQuery(internal.forecasts.productSalesPage, {
            organizationId: forecast.organizationId,
            locationId: forecast.locationId,
            timeZone: forecast.timeZone,
            from: productHistoryFrom,
            today,
            paginationOpts: { cursor, numItems: 1000 },
          });
          rolledUp = page.rolledUp;
          rowsRead += page.rowsRead;
          for (const row of page.result.page) {
            const key = JSON.stringify([row.key, row.date]);
            const current = productSales.get(key) ?? {
              ...row,
              quantity: 0,
              revenue: 0,
            };
            current.quantity += row.quantity;
            current.revenue += row.revenue;
            productSales.set(key, current);
          }
          if (rowsRead > 250_000 || productSales.size > 90_000) {
            productsComplete = false;
            break;
          }
          if (page.result.isDone) break;
          if (pageNumber >= 500) {
            productsComplete = false;
            break;
          }
          cursor = page.result.continueCursor;
        }
      // Seed the product rollup from this scan so later refreshes skip the
      // raw line scan. A token change mid-seed aborts via the seed guards.
      // Seeding is best-effort: the scan above already produced a valid
      // forecast, so a failed seed must not fail the run.
      if (productsComplete && !rolledUp && training.salesRunToken) {
        try {
          const seed = {
            organizationId: forecast.organizationId,
            locationId: forecast.locationId,
            timeZone: forecast.timeZone,
            from: productHistoryFrom,
            today: shiftOrderDate(today, 1),
            salesRunToken: training.salesRunToken,
            forecastId: args.forecastId,
            revision: run.revision,
            runStartedAt: run.runStartedAt,
          };
          // Include today's lines so far: coverage is open-ended once the
          // marker is set, and ingest deltas only apply from that point.
          const seedSales = new Map(productSales);
          let todayCursor: string | null = null;
          for (let pageNumber = 0; ; pageNumber++) {
            const page: FunctionReturnType<
              typeof internal.forecasts.productSalesPage
            > = await ctx.runQuery(internal.forecasts.productSalesPage, {
              organizationId: forecast.organizationId,
              locationId: forecast.locationId,
              timeZone: forecast.timeZone,
              from: today,
              today: shiftOrderDate(today, 1),
              paginationOpts: { cursor: todayCursor, numItems: 1000 },
            });
            for (const row of page.result.page) {
              const key = JSON.stringify([row.key, row.date]);
              const current = seedSales.get(key) ?? {
                ...row,
                quantity: 0,
                revenue: 0,
              };
              current.quantity += row.quantity;
              current.revenue += row.revenue;
              seedSales.set(key, current);
            }
            if (page.result.isDone) break;
            if (pageNumber >= 500) throw new Error("Seed scan did not finish");
            todayCursor = page.result.continueCursor;
          }
          for (let attempt = 0; ; attempt++) {
            const begun: { active: boolean; cleared: boolean } =
              await ctx.runMutation(
                internal.forecasts.beginProductDailySeed,
                seed,
              );
            if (!begun.active) throw new Error("Sales changed during seed");
            if (begun.cleared) break;
            if (attempt >= 200) throw new Error("Seed clear did not finish");
          }
          const seedRows = [...seedSales.values()];
          for (let offset = 0; offset < seedRows.length; offset += 500) {
            const appended: boolean = await ctx.runMutation(
              internal.forecasts.appendProductDailySeed,
              { ...seed, rows: seedRows.slice(offset, offset + 500) },
            );
            if (!appended) throw new Error("Sales changed during seed");
          }
          const seeded: boolean = await ctx.runMutation(
            internal.forecasts.finishProductDailySeed,
            seed,
          );
          if (!seeded) throw new Error("Sales changed during seed");
        } catch {
          // Reseeded on a later refresh; the marker stays unset meanwhile.
        }
      }
      const snapshot = {
        ...forecastSalesMix({
          productSales: productsComplete ? [...productSales.values()] : [],
          observations: training.observations,
          conditions: environment.conditions,
          openingDays: training.openingDays,
          today,
        }),
        modelVersion: FORECAST_MODEL_VERSION,
        openingHoursKey: training.openingHoursKey,
      };
      if (training.warning) snapshot.points = [];
      await ctx.runMutation(internal.forecasts.finish, {
        ...run,
        salesRunToken: training.salesRunToken,
        snapshot,
        warning: [
          training.warning,
          environment.warning,
          !training.warning && !snapshot.productMixApplied
            ? "Produktmængderne dækker ikke prognosen. Omsætning beregnes fra lokationens samlede salg og åbningstider."
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
    } catch {
      // Provider errors can contain credential-bearing URLs. Persist only safe copy.
      await ctx.runMutation(internal.forecasts.fail, run);
    }
    return null;
  },
});
