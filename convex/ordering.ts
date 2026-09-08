import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import {
  MAX_ORDER_QUANTITY,
  ORDER_HISTORY_DAYS,
  orderDate,
  shiftOrderDate,
} from "../lib/ordering-forecast";
import { query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireLocationAccess, requirePermission } from "./lib/auth";
import { getLocationProductAccess } from "./lib/locationProducts";
import { catalogPaginationOptions } from "./lib/productCatalog";
import { resolveTimeZone } from "./lib/timeZone";

async function requirePlanner(ctx: QueryCtx, locationId: Id<"locations">) {
  const auth = await requirePermission(ctx, "ordering.plan");
  if (auth.kioskModeEnabled)
    throw new ConvexError("Du har ikke adgang til bestilling i kiosktilstand");
  requireLocationAccess(auth, locationId);
  const location = await ctx.db.get("locations", locationId);
  if (!location || location.organizationId !== auth.organizationId) {
    throw new ConvexError("Lokationen blev ikke fundet");
  }
  return { ...auth, location };
}

const productValidator = v.object({
  id: v.id("products"),
  name: v.string(),
  category: v.string(),
  unitId: v.id("units"),
  unitName: v.string(),
  hasIngredients: v.boolean(),
  stock: v.union(v.number(), v.null()),
  lastCountedAt: v.union(v.number(), v.null()),
});

export const listProducts = query({
  args: {
    locationId: v.id("locations"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(productValidator),
  handler: async (ctx, args) => {
    const { organizationId } = await requirePlanner(ctx, args.locationId);
    const access = await getLocationProductAccess(
      ctx,
      organizationId,
      args.locationId,
    );
    const result = await ctx.db
      .query("products")
      .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId).eq("status", "active"),
      )
      .paginate(catalogPaginationOptions(args.paginationOpts, 25));
    const products = result.page.filter(
      (product) =>
        access.kind === "all" || access.effectiveProductIds.has(product._id),
    );
    return {
      ...result,
      page: await Promise.all(
        products.map(async (product) => {
          const [unit, category, ingredient, stock] = await Promise.all([
            ctx.db.get("units", product.defaultUnitId),
            ctx.db.get("categories", product.categoryId),
            ctx.db
              .query("productIngredients")
              .withIndex("by_organizationId_and_productId", (q) =>
                q
                  .eq("organizationId", organizationId)
                  .eq("productId", product._id),
              )
              .first(),
            ctx.db
              .query("locationStock")
              .withIndex(
                "by_organizationId_and_locationId_and_productId",
                (q) =>
                  q
                    .eq("organizationId", organizationId)
                    .eq("locationId", args.locationId)
                    .eq("productId", product._id),
              )
              .unique(),
          ]);
          if (!unit || unit.organizationId !== organizationId)
            throw new ConvexError("Produktets enhed blev ikke fundet");
          return {
            id: product._id,
            name: product.name,
            category:
              category?.organizationId === organizationId
                ? category.name
                : "Uden kategori",
            unitId: unit._id,
            unitName: unit.name,
            hasIngredients: ingredient !== null,
            stock: stock?.quantity ?? null,
            lastCountedAt: stock?.lastCountedAt ?? null,
          };
        }),
      ),
    };
  },
});

export const getContext = query({
  args: { locationId: v.id("locations"), asOf: v.number() },
  returns: v.object({
    today: v.string(),
    historyFrom: v.string(),
    timeZone: v.string(),
    historyStartAt: v.number(),
    historyEndAt: v.number(),
    warning: v.union(v.string(), v.null()),
    environment: v.object({
      factors: v.array(v.object({ date: v.string(), multiplier: v.number() })),
      message: v.string(),
      updatedAt: v.union(v.number(), v.null()),
    }),
  }),
  handler: async (ctx, args) => {
    const { organizationId } = await requirePlanner(ctx, args.locationId);
    if (!Number.isFinite(args.asOf) || Math.abs(args.asOf) > 8e12)
      throw new ConvexError("Datoen er ugyldig");
    const timeZone = await resolveTimeZone(
      ctx,
      organizationId,
      args.locationId,
    );
    const today = orderDate(args.asOf, timeZone);
    const historyFrom = shiftOrderDate(today, -ORDER_HISTORY_DAYS);
    const [status, integration, connection] = await Promise.all([
      ctx.db
        .query("onlinePosStockSyncStatus")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("locationId", args.locationId),
        )
        .unique(),
      ctx.db
        .query("onlinePosIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .unique(),
      ctx.db
        .query("onlinePosLocationIntegrations")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("locationId", args.locationId),
        )
        .unique(),
    ]);
    const forecast = await ctx.db.query("locationForecasts").withIndex("by_organizationId_and_locationId", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", args.locationId)).unique();
    const usable = forecast?.timeZone === timeZone && forecast.updatedAt && Date.now() - forecast.updatedAt < 26 * 3_600_000 &&
      forecast.snapshot?.points.some((point) => point.date === today);
    const factors = usable ? forecast.snapshot?.points.map(({ date, multiplier }) => ({ date, multiplier })) ?? [] : [];
    const learned = [forecast?.snapshot?.weatherLearned ? "vejr" : null, forecast?.snapshot?.holidaysLearned ? "helligdage" : null].filter(Boolean);
    const message = !forecast
      ? "Vejr og helligdage er ikke sat op. Aktivér dem under lokationens oplysninger i Administration."
      : !usable ? "Vejr- og helligdagsprognosen afventer opdatering. Forslag bruger det hidtidige ugedagsmønster."
      : learned.length ? `Forslag tilpasses efter ${learned.join(" og ")} ud fra lokationens salgshistorik. Dage uden vejrudsigt bruger ugedagsmønstret.`
      : "Der er endnu ikke nok historik til at lære vejr- og helligdagseffekter. Forslag bruger ugedagsmønstret.";
    // Fetch a day either side, then use local calendar dates to handle DST.
    return {
      today,
      historyFrom,
      timeZone,
      environment: { factors, message: [message, forecast?.warning].filter(Boolean).join(" "), updatedAt: forecast?.updatedAt ?? null },
      historyStartAt: Date.parse(
        `${shiftOrderDate(historyFrom, -1)}T00:00:00Z`,
      ),
      historyEndAt: Date.parse(`${shiftOrderDate(today, 1)}T00:00:00Z`),
      warning:
        !integration?.enabled ||
        !integration.stockSyncEnabled ||
        !connection ||
        !status?.syncedThroughAt ||
        status.activationAt !== integration.stockSyncStartedAt
          ? "Forslag kræver synkroniseret salgsforbrug. Du kan stadig planlægge mængder manuelt."
          : status.state !== "idle" ||
              orderDate(status.syncedThroughAt, timeZone) < today
            ? "Forslag er sat på pause, indtil salgsforbruget er synkroniseret. Du kan stadig planlægge mængder manuelt."
            : null,
    };
  },
});

const consumptionValidator = v.object({
  date: v.string(),
  unmappedQuantity: v.number(),
  entries: v.array(
    v.object({
      productId: v.id("products"),
      unitId: v.id("units"),
      quantity: v.number(),
      date: v.string(),
    }),
  ),
});

export const listConsumption = query({
  args: {
    locationId: v.id("locations"),
    from: v.number(),
    to: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(consumptionValidator),
  handler: async (ctx, args) => {
    const { organizationId } = await requirePlanner(ctx, args.locationId);
    if (
      !Number.isFinite(args.from) ||
      !Number.isFinite(args.to) ||
      args.to <= args.from ||
      args.to - args.from > (ORDER_HISTORY_DAYS + 3) * 86_400_000
    ) {
      throw new ConvexError("Vælg højst otte ugers salgshistorik");
    }
    const timeZone = await resolveTimeZone(
      ctx,
      organizationId,
      args.locationId,
    );
    const result = await ctx.db
      .query("salesStockApplications")
      .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", args.locationId)
          .gte("dayStart", args.from)
          .lt("dayStart", args.to),
      )
      .paginate(catalogPaginationOptions(args.paginationOpts));
    return {
      ...result,
      page: result.page
        .filter((row) => row.fingerprint !== "")
        .map((row) => ({
          date: orderDate(row.dayStart, timeZone),
          unmappedQuantity: row.unmappedQuantity,
          entries: row.entries.map((entry) => ({
            productId: entry.productId,
            unitId: entry.unitId,
            quantity: entry.quantity,
            date: orderDate(entry.occurredAt, timeZone),
          })),
        })),
    };
  },
});

export const prepareExport = query({
  args: {
    locationId: v.id("locations"),
    lines: v.array(
      v.object({
        productId: v.id("products"),
        unitId: v.id("units"),
        quantity: v.number(),
      }),
    ),
  },
  returns: v.object({
    locationName: v.string(),
    rows: v.array(
      v.object({
        productId: v.id("products"),
        productName: v.string(),
        unitName: v.string(),
        quantity: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const { organizationId, location } = await requirePlanner(
      ctx,
      args.locationId,
    );
    await requirePermission(ctx, "ordering.export");
    if (
      args.lines.length === 0 ||
      args.lines.length > 500 ||
      new Set(args.lines.map((line) => line.productId)).size !==
        args.lines.length
    ) {
      throw new ConvexError("Eksportér mellem 1 og 500 forskellige produkter");
    }
    const access = await getLocationProductAccess(
      ctx,
      organizationId,
      args.locationId,
    );
    const rows = await Promise.all(
      args.lines.map(async (line) => {
        if (
          !Number.isFinite(line.quantity) ||
          line.quantity <= 0 ||
          line.quantity > MAX_ORDER_QUANTITY
        ) {
          throw new ConvexError("Bestillingsmængden er ugyldig");
        }
        const product = await ctx.db.get("products", line.productId);
        if (
          !product ||
          product.organizationId !== organizationId ||
          product.status !== "active" ||
          product.defaultUnitId !== line.unitId ||
          (access.kind === "selected" &&
            !access.effectiveProductIds.has(product._id))
        ) {
          throw new ConvexError(
            "Et produkt er ikke længere tilgængeligt på lokationen. Opdatér planen.",
          );
        }
        const unit = await ctx.db.get("units", product.defaultUnitId);
        if (!unit || unit.organizationId !== organizationId)
          throw new ConvexError("Produktets enhed blev ikke fundet");
        return {
          productId: product._id,
          productName: product.name,
          unitName: unit.name,
          quantity: line.quantity,
        };
      }),
    );
    return { locationName: location.name, rows };
  },
});
