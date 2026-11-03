import { getOnlinePosOrganizationSettings } from "./integrations/onlinepos/lib/connections";
import {
  getGsSupplyLink,
  getGsSupplySupplierId,
  getProductUnitFactor,
  getProductUnitFactors,
} from "./integrations/gssupply/lib/links";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v, type Infer } from "convex/values";
import {
  addDays,
  DEFAULT_TIME_ZONE,
  parseDateKey,
  zonedStart,
} from "../lib/date";
import {
  MAX_ORDER_QUANTITY,
  ORDER_HISTORY_DAYS,
  orderDate,
  shiftOrderDate,
  validForecastSettings,
} from "../lib/ordering-forecast";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  requireKioskDestination,
  requireLocationAccess,
  requirePermission,
} from "./lib/auth";
import { recordAudit } from "./lib/audit";
import schema from "./schema";
import {
  getLocationProductAccess,
  locationHasProduct,
} from "./lib/locationProducts";
import { catalogPaginationOptions } from "./lib/productCatalog";
import { resolveTimeZone } from "./lib/timeZone";
import { getForecastOpeningHours } from "./lib/forecastOpeningHours";
import { canOrderFrom, getInternalSupplier } from "./internalOrders";
import {
  forecastSettings,
  forecastSettingsFields,
} from "./lib/orderForecastSettings";
import { createForecastConsumptionResolver } from "./lib/forecastConsumption";
import {
  forecastConditionValidator,
  forecastOpeningDayValidator,
  FORECAST_WEATHER_PROVIDER,
  usesGoogleForecastLocation,
} from "./lib/forecastValidators";

async function requireOrdering(ctx: QueryCtx | MutationCtx) {
  const auth = await requirePermission(ctx, "ordering.plan");
  await requireKioskDestination(ctx, auth, ["ordering.new", "ordering.history"]);
  return auth;
}

async function requirePlanner(
  ctx: QueryCtx | MutationCtx,
  locationId: Id<"locations">,
) {
  const auth = await requireOrdering(ctx);
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
  imageUrl: v.union(v.string(), v.null()),
  category: v.string(),
  unitId: v.id("units"),
  unitName: v.string(),
  // All units the Produkt can be ordered in, default first. Used by internal orders.
  units: v.array(
    v.object({ id: v.id("units"), name: v.string(), factor: v.number() }),
  ),
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
    const { organizationId, disabledFeatures } = await requirePlanner(
      ctx,
      args.locationId,
    );
    const showStock = !disabledFeatures.has("count");
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
    const products = result.page.filter((product) =>
      locationHasProduct(access, product._id),
    );
    return {
      ...result,
      page: await Promise.all(
        products.map(async (product) => {
          const [unit, category, ingredient, stock, imageUrl, units] =
            await Promise.all([
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
              showStock
                ? ctx.db
                    .query("locationStock")
                    .withIndex(
                      "by_organizationId_and_locationId_and_productId",
                      (q) =>
                        q
                          .eq("organizationId", organizationId)
                          .eq("locationId", args.locationId)
                          .eq("productId", product._id),
                    )
                    .unique()
                : null,
              product.imageStorageId
                ? ctx.storage.getUrl(product.imageStorageId)
                : null,
              getProductUnitFactors(ctx, product).then((factors) =>
                Promise.all(
                  [...factors]
                    .filter(([unitId]) => unitId !== product.defaultUnitId)
                    .map(async ([unitId, factor]) => {
                      const item = await ctx.db.get("units", unitId);
                      return item && { ...item, factor };
                    }),
                ),
              ),
            ]);
          if (!unit || unit.organizationId !== organizationId)
            throw new ConvexError("Produktets enhed blev ikke fundet");
          return {
            id: product._id,
            name: product.name,
            imageUrl,
            category:
              category?.organizationId === organizationId
                ? category.name
                : "Uden kategori",
            unitId: unit._id,
            unitName: unit.name,
            units: [{ ...unit, factor: 1 }, ...units].flatMap((item) =>
              item?.organizationId === organizationId
                ? [{ id: item._id, name: item.name, factor: item.factor }]
                : [],
            ),
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
    openingDays: v.array(forecastOpeningDayValidator),
    environment: v.object({
      conditions: v.array(forecastConditionValidator),
      message: v.string(),
      updatedAt: v.union(v.number(), v.null()),
    }),
  }),
  handler: async (ctx, args) => {
    const { organizationId, location } = await requirePlanner(
      ctx,
      args.locationId,
    );
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
      getOnlinePosOrganizationSettings(ctx, organizationId),
      ctx.db
        .query("onlinePosLocationIntegrations")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("locationId", args.locationId),
        )
        .unique(),
    ]);
    const forecast = await ctx.db
      .query("locationForecasts")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", args.locationId),
      )
      .unique();
    const usable =
      forecast?.timeZone === timeZone &&
      location.googlePlaceId &&
      usesGoogleForecastLocation(forecast.profile) &&
      forecast.weatherProvider === FORECAST_WEATHER_PROVIDER &&
      forecast.weatherUpdatedAt &&
      args.asOf - forecast.weatherUpdatedAt < 26 * 3_600_000;
    const conditions = usable
      ? forecast.conditions.filter((day) => day.date >= historyFrom)
      : [];
    const openingHours = await getForecastOpeningHours(
      ctx,
      location,
      today,
      historyFrom,
      shiftOrderDate(today, 27),
    );
    const message = !forecast
      ? "Vejr og helligdage er ikke sat op. Aktivér dem under lokationens oplysninger i Administration."
      : !usable
        ? "Vejr og helligdage afventer opdatering. Forslag bruger produkternes ugedagsmønster og åbningstider."
        : "Vejr og helligdage tilpasser hvert produkts forbrug, når der er nok historik. Dage uden vejrudsigt bruger produktets ugedagsmønster og åbningstider.";
    // Fetch a day either side, then use local calendar dates to handle DST.
    return {
      today,
      historyFrom,
      timeZone,
      openingDays: openingHours.days,
      environment: {
        conditions,
        message: [message, forecast?.warning].filter(Boolean).join(" "),
        updatedAt: forecast?.weatherUpdatedAt ?? null,
      },
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
      throw new ConvexError("Vælg højst 90 dages forbrugshistorik");
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
    // Sales entries already contain the recipe used when the sale was synced.
    const resolve = createForecastConsumptionResolver(ctx, organizationId, {
      expandRecipes: false,
    });
    const page = [];
    for (const row of result.page) {
      if (row.fingerprint === "") continue;
      let unmappedQuantity = row.unmappedQuantity;
      const entries = [];
      for (const entry of row.entries) {
        const converted = await resolve(
          entry.productId,
          entry.unitId,
          entry.quantity,
        );
        if (converted === null) {
          unmappedQuantity += Math.abs(entry.quantity);
          continue;
        }
        entries.push(
          ...converted.map((value) => ({
            ...value,
            date: orderDate(entry.occurredAt, timeZone),
          })),
        );
      }
      page.push({
        date: orderDate(row.dayStart, timeZone),
        unmappedQuantity,
        entries,
      });
    }
    return { ...result, page };
  },
});

export const listOperationalConsumption = query({
  args: {
    locationId: v.id("locations"),
    from: v.number(),
    to: v.number(),
    source: v.union(v.literal("staffFood"), v.literal("waste")),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      date: v.string(),
      unresolvedCount: v.number(),
      entries: v.array(
        v.object({
          productId: v.id("products"),
          unitId: v.id("units"),
          quantity: v.number(),
          date: v.string(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const { organizationId } = await requirePlanner(ctx, args.locationId);
    if (
      !Number.isFinite(args.from) ||
      !Number.isFinite(args.to) ||
      args.to <= args.from ||
      args.to - args.from > (ORDER_HISTORY_DAYS + 3) * 86_400_000
    )
      throw new ConvexError("Vælg højst 90 dages forbrugshistorik");
    const timeZone = await resolveTimeZone(
      ctx,
      organizationId,
      args.locationId,
    );
    const pagination = catalogPaginationOptions(args.paginationOpts, 20);
    const result =
      args.source === "staffFood"
        ? await ctx.db
            .query("staffFoodRegistrations")
            .withIndex(
              "by_organizationId_and_locationId_and_registeredAt",
              (q) =>
                q
                  .eq("organizationId", organizationId)
                  .eq("locationId", args.locationId)
                  .gte("registeredAt", args.from)
                  .lt("registeredAt", args.to),
            )
            .paginate(pagination)
        : await ctx.db
            .query("wasteRegistrations")
            .withIndex("by_org_location_status_time", (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("locationId", args.locationId)
                .eq("status", "active")
                .gte("registeredAt", args.from)
                .lt("registeredAt", args.to),
            )
            .paginate(pagination);
    const resolve = createForecastConsumptionResolver(ctx, organizationId);
    const page = [];
    for (const row of result.page) {
      if (row.status !== "active") continue;
      const date =
        "workDate" in row
          ? row.workDate
          : orderDate(row.registeredAt, timeZone);
      const entries = await resolve(
        row.productId,
        row.defaultUnitId,
        row.defaultQuantity,
      );
      page.push({
        date,
        unresolvedCount: entries === null ? 1 : 0,
        entries: (entries ?? []).map((entry) => ({ ...entry, date })),
      });
    }
    return { ...result, page };
  },
});

const orderInputValidator = v.object({
  locationId: v.id("locations"),
  supplierId: v.optional(v.id("suppliers")),
  // Internal orders name the location that fulfils them with a Transfer.
  fulfillingLocationId: v.optional(v.id("locations")),
  // Catalog items without a linked product, ordered in whole packs.
  catalogLines: v.optional(
    v.array(
      v.object({
        productNumber: v.string(),
        productName: v.string(),
        quantity: v.number(),
      }),
    ),
  ),
  lines: v.array(
    v.object({
      productId: v.id("products"),
      unitId: v.id("units"),
      quantity: v.number(),
    }),
  ),
});

const orderRowValidator = schema
  .doc("orderLines")
  .pick(
    "productId",
    "productName",
    "unitId",
    "unitName",
    "quantity",
    "supplierProductNumber",
  );
const historySummaryValidator = schema
  .doc("orders")
  .pick(
    "_id",
    "locationName",
    "createdAt",
    "createdByName",
    "fromDate",
    "toDate",
    "bufferPercent",
    "itemCount",
    "supplierName",
    "email",
    "fulfillingLocationId",
    "fulfillmentStatus",
  );
const historyDetailValidator = historySummaryValidator.extend({
  locationId: v.id("locations"),
  rows: v.array(orderRowValidator),
});

async function requireInternalSupplier(
  ctx: QueryCtx | MutationCtx,
  auth: Awaited<ReturnType<typeof requirePlanner>>,
  fulfillingLocationId: Id<"locations">,
) {
  const [supplier, location] = await Promise.all([
    getInternalSupplier(ctx, auth.organizationId, fulfillingLocationId),
    ctx.db.get("locations", fulfillingLocationId),
  ]);
  if (
    !supplier ||
    !canOrderFrom(supplier, auth.location._id) ||
    location?.organizationId !== auth.organizationId
  ) {
    throw new ConvexError(
      "Lokationen kan ikke længere bestille internt herfra. Opdatér siden.",
    );
  }
  return { location, productIds: new Set(supplier.productIds) };
}

export const listInternalSuppliers = query({
  args: { locationId: v.id("locations") },
  returns: v.array(
    v.object({
      locationId: v.id("locations"),
      name: v.string(),
      productIds: v.array(v.id("products")),
      ...forecastSettingsFields,
    }),
  ),
  handler: async (ctx, args) => {
    const auth = await requirePlanner(ctx, args.locationId);
    const suppliers = await ctx.db
      .query("internalSuppliers")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .take(200);
    const allowed = suppliers.filter((supplier) =>
      canOrderFrom(supplier, args.locationId),
    );
    const locations = await Promise.all(
      allowed.map((supplier) => ctx.db.get("locations", supplier.locationId)),
    );
    return allowed.flatMap((supplier, index) => {
      const location = locations[index];
      return location?.organizationId === auth.organizationId
        ? [
            {
              locationId: supplier.locationId,
              name: location.name,
              productIds: supplier.productIds,
              ...forecastSettings(supplier),
            },
          ]
        : [];
    });
  },
});

// The unit each Produkt was last ordered in on the location's recent internal orders.
export const listRecentInternalUnits = query({
  args: { locationId: v.id("locations") },
  returns: v.array(
    v.object({ productId: v.id("products"), unitId: v.id("units") }),
  ),
  handler: async (ctx, args) => {
    const { organizationId } = await requirePlanner(ctx, args.locationId);
    const orders = (
      await ctx.db
        .query("orders")
        .withIndex("by_organizationId_and_locationId_and_createdAt", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("locationId", args.locationId),
        )
        .order("desc")
        .take(50)
    )
      .filter((order) => order.fulfillingLocationId)
      .slice(0, 10);
    const lines = await Promise.all(
      orders.map((order) =>
        ctx.db
          .query("orderLines")
          .withIndex("by_organizationId_and_orderId", (q) =>
            q.eq("organizationId", organizationId).eq("orderId", order._id),
          )
          .take(200),
      ),
    );
    const units = new Map<Id<"products">, Id<"units">>();
    for (const line of lines.flat()) {
      if (line.productId && line.unitId && !units.has(line.productId)) {
        units.set(line.productId, line.unitId);
      }
    }
    return [...units].map(([productId, unitId]) => ({ productId, unitId }));
  },
});

async function prepareOrder(
  ctx: QueryCtx | MutationCtx,
  args: Infer<typeof orderInputValidator>,
) {
  const auth = await requirePlanner(ctx, args.locationId);
  const { organizationId } = auth;
  const catalogLines = args.catalogLines ?? [];
  const lineCount = args.lines.length + catalogLines.length;
  const internalSupplier = args.fulfillingLocationId
    ? await requireInternalSupplier(ctx, auth, args.fulfillingLocationId)
    : null;
  if (internalSupplier && (args.supplierId || catalogLines.length)) {
    throw new ConvexError("Vælg enten en leverandør eller en lokation");
  }
  // Internal orders become one Transfer, which has a lower line limit.
  if (internalSupplier && lineCount > 200) {
    throw new ConvexError(
      "Vælg højst 200 produktlinjer i en intern bestilling",
    );
  }
  // Internal orders may list a Produkt once per unit.
  if (
    lineCount === 0 ||
    lineCount > 500 ||
    new Set(args.lines.map((line) => `${line.productId}:${line.unitId}`))
      .size !== args.lines.length
  ) {
    throw new ConvexError("Vælg mellem 1 og 500 forskellige produkter");
  }
  const access = await getLocationProductAccess(
    ctx,
    organizationId,
    args.locationId,
  );
  const supplier = args.supplierId
    ? await ctx.db.get("suppliers", args.supplierId)
    : null;
  if (args.supplierId && supplier?.organizationId !== organizationId) {
    throw new ConvexError("Leverandøren blev ikke fundet. Opdatér siden.");
  }
  const catalogSupplier =
    supplier !== null &&
    supplier._id === (await getGsSupplySupplierId(ctx, organizationId));
  const rows: Infer<typeof orderRowValidator>[] = await Promise.all(
    args.lines.map(async (line) => {
      if (
        !Number.isFinite(line.quantity) ||
        line.quantity <= 0 ||
        line.quantity > MAX_ORDER_QUANTITY ||
        Number(line.quantity.toFixed(6)) !== line.quantity
      ) {
        throw new ConvexError("Bestillingsmængden er ugyldig");
      }
      const product = await ctx.db.get("products", line.productId);
      if (
        !product ||
        product.organizationId !== organizationId ||
        product.status !== "active" ||
        !locationHasProduct(access, product._id)
      ) {
        throw new ConvexError(
          "Et produkt er ikke længere tilgængeligt på lokationen. Opdatér planen.",
        );
      }
      if (internalSupplier && !internalSupplier.productIds.has(product._id)) {
        throw new ConvexError(
          `${product.name} kan ikke længere bestilles hos ${internalSupplier.location.name}. Opdatér planen.`,
        );
      }
      if (
        internalSupplier &&
        (await getProductUnitFactor(ctx, product, line.unitId)) === null
      ) {
        throw new ConvexError(
          `${product.name} kan ikke bestilles i den valgte enhed. Opdatér planen.`,
        );
      }
      // Catalog suppliers use the linked unit, internal orders any unit, others the default unit.
      const link = catalogSupplier
        ? await getGsSupplyLink(ctx, organizationId, product._id)
        : null;
      const unitId = internalSupplier
        ? line.unitId
        : (link?.unitId ?? product.defaultUnitId);
      if (
        (catalogSupplier && !link) ||
        line.unitId !== unitId ||
        (link && (await getProductUnitFactor(ctx, product, unitId)) === null)
      ) {
        throw new ConvexError(
          "Et produkt er ikke længere koblet til leverandøren. Opdatér planen.",
        );
      }
      if (link && !Number.isInteger(line.quantity)) {
        throw new ConvexError("Bestil hele pakker hos leverandøren");
      }
      const unit = await ctx.db.get("units", unitId);
      if (!unit || unit.organizationId !== organizationId)
        throw new ConvexError("Produktets enhed blev ikke fundet");
      return {
        productId: product._id,
        productName: product.name,
        unitId: unit._id,
        unitName: unit.name,
        quantity: line.quantity,
        ...(link ? { supplierProductNumber: link.productNumber } : {}),
      };
    }),
  );
  if (catalogLines.length && !catalogSupplier) {
    throw new ConvexError("Leverandøren har intet katalog. Opdatér planen.");
  }
  for (const line of catalogLines) {
    const productNumber = line.productNumber.trim();
    const productName = line.productName.trim().slice(0, 300);
    if (
      !/^[\w.-]{1,50}$/.test(productNumber) ||
      !productName ||
      !Number.isInteger(line.quantity) ||
      line.quantity <= 0 ||
      line.quantity > MAX_ORDER_QUANTITY
    ) {
      throw new ConvexError("En katalogvare er ugyldig. Opdatér planen.");
    }
    rows.push({
      productName,
      unitName: "Pakke",
      quantity: line.quantity,
      supplierProductNumber: productNumber,
    });
  }
  const numbers = rows.flatMap((row) =>
    row.supplierProductNumber ? [row.supplierProductNumber] : [],
  );
  if (new Set(numbers).size !== numbers.length) {
    throw new ConvexError("En vare er med flere gange. Opdatér planen.");
  }
  return {
    auth,
    supplier,
    supplierName: supplier?.name ?? internalSupplier?.location.name,
    fulfillingLocationId: internalSupplier?.location._id,
    rows,
  };
}

export const prepareExport = query({
  args: orderInputValidator.fields,
  returns: v.object({
    locationName: v.string(),
    supplierName: v.optional(v.string()),
    rows: v.array(orderRowValidator),
  }),
  handler: async (ctx, args) => {
    await requirePermission(ctx, "ordering.export");
    const { auth, supplierName, rows } = await prepareOrder(ctx, args);
    return {
      locationName: auth.location.name,
      ...(supplierName ? { supplierName } : {}),
      rows,
    };
  },
});

function historySummary(order: Doc<"orders">) {
  return {
    _id: order._id,
    locationName: order.locationName,
    createdAt: order.createdAt,
    createdByName: order.createdByName,
    fromDate: order.fromDate,
    toDate: order.toDate,
    bufferPercent: order.bufferPercent,
    itemCount: order.itemCount,
    supplierName: order.supplierName,
    email: order.email,
    fulfillingLocationId: order.fulfillingLocationId,
    fulfillmentStatus: order.fulfillmentStatus,
  };
}

export const placeOrder = mutation({
  args: orderInputValidator.extend({
    fromDate: v.string(),
    coverageDays: v.number(),
    bufferPercent: v.number(),
    sendEmail: v.optional(v.boolean()),
  }).fields,
  returns: v.id("orders"),
  handler: async (ctx, args) => {
    await requirePermission(ctx, "ordering.place");
    const { auth, supplier, supplierName, fulfillingLocationId, rows } =
      await prepareOrder(ctx, args);
    if (args.sendEmail && !supplier?.email) {
      throw new ConvexError("Leverandøren har ingen e-mailadresse");
    }
    if (!validForecastSettings(args.coverageDays, args.bufferPercent)) {
      throw new ConvexError("Dækning eller buffer er ugyldig");
    }
    try {
      parseDateKey(args.fromDate);
    } catch {
      throw new ConvexError("Datoen er ugyldig");
    }
    const order = {
      organizationId: auth.organizationId,
      locationId: args.locationId,
      locationName: auth.location.name,
      createdAt: Date.now(),
      createdBy: auth.userIdentifier,
      createdByName: auth.userName,
      fromDate: args.fromDate,
      toDate: shiftOrderDate(args.fromDate, args.coverageDays - 1),
      bufferPercent: args.bufferPercent,
      itemCount: rows.length,
      ...(supplier ? { supplierId: supplier._id } : {}),
      ...(supplierName ? { supplierName } : {}),
      ...(fulfillingLocationId
        ? { fulfillingLocationId, fulfillmentStatus: "open" as const }
        : {}),
      ...(args.sendEmail && supplier?.email
        ? { email: { to: supplier.email, status: "pending" as const } }
        : {}),
      // Only product lines can be received into stock. Internal orders are
      // received through their Transfer instead.
      ...(!fulfillingLocationId && rows.some((row) => row.productId)
        ? { receiptStatus: "pending" as const }
        : {}),
    };
    const orderId = await ctx.db.insert("orders", order);
    for (const row of rows) {
      await ctx.db.insert("orderLines", {
        organizationId: auth.organizationId,
        orderId,
        ...row,
      });
    }
    await recordAudit(ctx, auth, {
      action: "ordering.place",
      entityTable: "orders",
      entityId: orderId,
      locationId: args.locationId,
      summary: `Bestilling afgivet med ${rows.length} produkter${supplierName ? ` hos ${supplierName}` : ""}`,
    });
    if (order.email) {
      await ctx.scheduler.runAfter(0, internal.orderEmails.send, { orderId });
    }
    return orderId;
  },
});

export const listHistory = query({
  args: {
    locationId: v.id("locations"),
    range: v.optional(v.object({ fromDate: v.string(), toDate: v.string() })),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(historySummaryValidator),
  handler: async (ctx, args) => {
    const { organizationId } = await requirePlanner(ctx, args.locationId);
    let range: { from: number; to: number } | undefined;
    if (args.range) {
      const { fromDate, toDate } = args.range;
      try {
        range = {
          from: zonedStart(fromDate, DEFAULT_TIME_ZONE),
          to: zonedStart(addDays(toDate, 1), DEFAULT_TIME_ZONE),
        };
      } catch {
        throw new ConvexError("Datoerne er ugyldige");
      }
      if (fromDate > toDate) {
        throw new ConvexError(
          "Startdatoen skal være før eller samme dag som slutdatoen",
        );
      }
    }
    const result = await ctx.db
      .query("orders")
      .withIndex("by_organizationId_and_locationId_and_createdAt", (q) => {
        const byLocation = q
          .eq("organizationId", organizationId)
          .eq("locationId", args.locationId);
        return range
          ? byLocation.gte("createdAt", range.from).lt("createdAt", range.to)
          : byLocation;
      })
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...result, page: result.page.map(historySummary) };
  },
});

async function readHistory(ctx: QueryCtx, orderId: Id<"orders">) {
  const auth = await requireOrdering(ctx);
  const order = await ctx.db.get("orders", orderId);
  if (!order || order.organizationId !== auth.organizationId) return null;
  requireLocationAccess(auth, order.locationId);
  const lines = await ctx.db
    .query("orderLines")
    .withIndex("by_organizationId_and_orderId", (q) =>
      q.eq("organizationId", auth.organizationId).eq("orderId", orderId),
    )
    .take(500);
  return {
    ...historySummary(order),
    locationId: order.locationId,
    rows: lines.map(
      ({
        productId,
        productName,
        unitName,
        quantity,
        supplierProductNumber,
      }) => ({
        productId,
        productName,
        unitName,
        quantity,
        supplierProductNumber,
      }),
    ),
  };
}

export const getHistory = query({
  args: { orderId: v.id("orders") },
  returns: v.union(historyDetailValidator, v.null()),
  handler: async (ctx, args) => await readHistory(ctx, args.orderId),
});

// An open internal order, loaded into the planner for editing.
export const getEditableOrder = query({
  args: { orderId: v.id("orders") },
  returns: v.union(
    v.object({
      id: v.id("orders"),
      locationId: v.id("locations"),
      fulfillingLocationId: v.id("locations"),
      lines: v.array(
        v.object({
          productId: v.id("products"),
          unitId: v.id("units"),
          quantity: v.number(),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const auth = await requireOrdering(ctx);
    const order = await ctx.db.get("orders", args.orderId);
    if (
      !order ||
      order.organizationId !== auth.organizationId ||
      !order.fulfillingLocationId ||
      order.fulfillmentStatus !== "open"
    ) {
      return null;
    }
    requireLocationAccess(auth, order.locationId);
    const lines = await ctx.db
      .query("orderLines")
      .withIndex("by_organizationId_and_orderId", (q) =>
        q.eq("organizationId", auth.organizationId).eq("orderId", order._id),
      )
      .take(500);
    return {
      id: order._id,
      locationId: order.locationId,
      fulfillingLocationId: order.fulfillingLocationId,
      lines: lines.flatMap(({ productId, unitId, quantity }) =>
        productId && unitId ? [{ productId, unitId, quantity }] : [],
      ),
    };
  },
});

export const updateInternalOrder = mutation({
  args: {
    orderId: v.id("orders"),
    lines: orderInputValidator.fields.lines,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requirePermission(ctx, "ordering.place");
    const order = await ctx.db.get("orders", args.orderId);
    if (
      !order ||
      order.organizationId !== auth.organizationId ||
      !order.fulfillingLocationId
    ) {
      throw new ConvexError("Bestillingen blev ikke fundet");
    }
    if (order.fulfillmentStatus === "cancelled") {
      throw new ConvexError("Bestillingen er annulleret");
    }
    if (order.fulfillmentStatus !== "open") {
      throw new ConvexError(
        "Der er allerede oprettet en transfer for bestillingen, så den kan ikke ændres",
      );
    }
    // Checks location access and that the supplier still offers each Produkt.
    const { rows } = await prepareOrder(ctx, {
      locationId: order.locationId,
      fulfillingLocationId: order.fulfillingLocationId,
      lines: args.lines,
    });
    const existing = await ctx.db
      .query("orderLines")
      .withIndex("by_organizationId_and_orderId", (q) =>
        q.eq("organizationId", auth.organizationId).eq("orderId", order._id),
      )
      .take(500);
    for (const line of existing) await ctx.db.delete("orderLines", line._id);
    for (const row of rows) {
      await ctx.db.insert("orderLines", {
        organizationId: auth.organizationId,
        orderId: order._id,
        ...row,
      });
    }
    await ctx.db.patch("orders", order._id, {
      itemCount: rows.length,
      editedAt: Date.now(),
    });
    await recordAudit(ctx, auth, {
      action: "ordering.update",
      entityTable: "orders",
      entityId: order._id,
      locationId: order.locationId,
      summary: `Intern bestilling ændret til ${rows.length} produkter${order.supplierName ? ` hos ${order.supplierName}` : ""}`,
    });
    return null;
  },
});

export const cancelInternalOrder = mutation({
  args: { orderId: v.id("orders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requirePermission(ctx, "ordering.place");
    const order = await ctx.db.get("orders", args.orderId);
    if (
      !order ||
      order.organizationId !== auth.organizationId ||
      !order.fulfillingLocationId
    ) {
      throw new ConvexError("Bestillingen blev ikke fundet");
    }
    requireLocationAccess(auth, order.locationId);
    if (order.fulfillmentStatus === "cancelled") return null;
    if (order.fulfillmentStatus !== "open") {
      throw new ConvexError(
        "Der er allerede oprettet en transfer for bestillingen, så den kan ikke annulleres",
      );
    }
    await ctx.db.patch("orders", order._id, { fulfillmentStatus: "cancelled" });
    await recordAudit(ctx, auth, {
      action: "ordering.cancel",
      entityTable: "orders",
      entityId: order._id,
      locationId: order.locationId,
      summary: `Intern bestilling annulleret${order.supplierName ? ` hos ${order.supplierName}` : ""}`,
    });
    return null;
  },
});

export const reopenInternalOrder = mutation({
  args: { orderId: v.id("orders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requirePermission(ctx, "ordering.place");
    const order = await ctx.db.get("orders", args.orderId);
    if (
      !order ||
      order.organizationId !== auth.organizationId ||
      !order.fulfillingLocationId
    ) {
      throw new ConvexError("Bestillingen blev ikke fundet");
    }
    requireLocationAccess(auth, order.locationId);
    if (order.fulfillmentStatus !== "cancelled") return null;
    await ctx.db.patch("orders", order._id, { fulfillmentStatus: "open" });
    await recordAudit(ctx, auth, {
      action: "ordering.reopen",
      entityTable: "orders",
      entityId: order._id,
      locationId: order.locationId,
      summary: `Intern bestilling genåbnet${order.supplierName ? ` hos ${order.supplierName}` : ""}`,
    });
    return null;
  },
});

export const exportHistory = query({
  args: { orderId: v.id("orders") },
  returns: historyDetailValidator,
  handler: async (ctx, args) => {
    await requirePermission(ctx, "ordering.export");
    const order = await readHistory(ctx, args.orderId);
    if (!order) throw new ConvexError("Bestillingen blev ikke fundet");
    return order;
  },
});
