import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import {
  requireAllLocationAccess,
  requireIntegrationManager,
  requireLocationAccess,
} from "./lib/auth";
import { recordAudit } from "./lib/audit";
import {
  createSalesStockResolver,
  stockApplication,
  stockSalesFingerprint,
  type StockSale,
} from "./lib/salesStock";
import { addStock, normalizeStock, toDefaultUnit } from "./lib/stock";
import { dayStartOf } from "./lib/salesRollup";
import { resolveTimeZone } from "./lib/timeZone";
import { reconcileOnlinePosWaste } from "./waste";

const locationArgs = {
  organizationId: v.string(),
  locationId: v.id("locations"),
};
const pageArgs = {
  ...locationArgs,
  token: v.string(),
  salesToken: v.string(),
  activationAt: v.number(),
  from: v.number(),
  phase: v.union(v.literal("orders"), v.literal("removed")),
  cursor: v.union(v.string(), v.null()),
};

async function integration(ctx: MutationCtx, organizationId: string) {
  return ctx.db
    .query("onlinePosIntegrations")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .unique();
}

export async function queueStockSync(
  ctx: MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
  reconcileFrom?: number,
  full = false,
) {
  const settings = await integration(ctx, organizationId);
  if (
    !settings?.enabled ||
    !settings.stockSyncEnabled ||
    settings.stockSyncStartedAt === undefined
  )
    return;
  const [sales, connection, stocks, previous] = await Promise.all([
    ctx.db
      .query("onlinePosSyncStatus")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", locationId),
      )
      .unique(),
    ctx.db
      .query("onlinePosLocationIntegrations")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", locationId),
      )
      .unique(),
    ctx.db
      .query("locationStock")
      .withIndex("by_organizationId_and_locationId_and_productId", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", locationId),
      )
      .take(501),
    ctx.db
      .query("onlinePosStockSyncStatus")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", locationId),
      )
      .unique(),
  ]);
  if (
    !connection ||
    sales?.state !== "idle" ||
    sales.pendingReconcileDayStart !== undefined ||
    sales.dayStartRerollToken !== undefined ||
    !sales.runToken
  )
    return;
  const token = crypto.randomUUID();
  const now = Date.now();
  const activationAt = settings.stockSyncStartedAt;
  const earliestCount = Math.min(
    activationAt,
    ...stocks.map((row) => row.lastCountedAt ?? activationAt),
  );
  const historyStart = sales.backfillThroughAt ?? sales.syncedThroughAt ?? now;
  const error =
    stocks.length > 500
      ? "Lokationen har for mange lagerprodukter"
      : settings.stockSyncSinceLastCount && earliestCount < historyStart
        ? "Salgshistorikken dækker ikke seneste Count for alle Produkter. Registrér en ny Count, eller aktivér kun fremtidige salg."
        : undefined;
  const value = {
    organizationId,
    locationId,
    runToken: token,
    activationAt,
    state: error ? ("error" as const) : ("running" as const),
    updatedAt: now,
    lastError: error,
    unmappedQuantity: 0,
  };
  if (previous) await ctx.db.patch(previous._id, value);
  else await ctx.db.insert("onlinePosStockSyncStatus", value);
  if (error) return;
  const firstRun =
    full ||
    previous?.activationAt !== activationAt ||
    previous.lastSuccessAt === undefined;
  const since = firstRun
    ? Math.min(earliestCount, settings.stockSyncHistoryStartAt ?? activationAt)
    : Math.min(
        (previous.syncedThroughAt ?? previous.lastSuccessAt!) -
          2 * 60 * 60 * 1_000,
        reconcileFrom ?? now,
      );
  const timeZone = await resolveTimeZone(ctx, organizationId, locationId);
  await ctx.scheduler.runAfter(0, internal.onlinePosStock.runPage, {
    organizationId,
    locationId,
    token,
    salesToken: sales.runToken,
    activationAt: settings.stockSyncStartedAt,
    from: dayStartOf(Math.max(historyStart, since), timeZone),
    phase: "orders",
    cursor: null,
  });
}

async function applyOrder(
  ctx: MutationCtx,
  settings: Doc<"onlinePosIntegrations">,
  connection: Doc<"onlinePosLocationIntegrations">,
  order: Pick<
    Doc<"salesOrders">,
    | "organizationId"
    | "locationId"
    | "externalId"
    | "dayStart"
    | "orderNumber"
    | "department"
  >,
  previous: Doc<"salesStockApplications"> | null,
  entries: StockSale[],
  fingerprint: string,
  unmappedQuantity: number,
) {
  const activationAt = settings.stockSyncStartedAt;
  if (activationAt === undefined) return;
  const previousWaste: Doc<"wasteRegistrations">[] = [];
  for (const id of previous?.wasteRegistrationIds ?? []) {
    const row = await ctx.db.get("wasteRegistrations", id);
    if (!row || row.organizationId !== order.organizationId || row.locationId !== order.locationId || row.source !== "onlinePos")
      throw new ConvexError("Refunderingens Waste-registrering blev ikke fundet");
    previousWaste.push(row);
  }
  const refunds: Array<{ productId: Id<"products">; quantity: number; registeredAt: number }> = [];
  const previousRefundPolicy = new Map(previous?.entries.filter(entry => entry.isRefund !== false).map(entry => [entry.externalId, entry.refundToWaste ?? false]));
  const productIds = new Set([
    ...entries.map((entry) => entry.productId),
    ...previousWaste.map((entry) => entry.productId),
    ...(previous?.applied.map((entry) => entry.productId) ?? []),
  ]);
  const previousEligible = new Set(
    previous?.entries
      .filter((entry) => entry.eligible)
      .map((entry) => entry.externalId),
  );
  const nextEntries: Doc<"salesStockApplications">["entries"] = [];
  const applied: Doc<"salesStockApplications">["applied"] = [];
  for (const productId of productIds) {
    const [product, stock] = await Promise.all([
      ctx.db.get("products", productId),
      ctx.db
        .query("locationStock")
        .withIndex("by_organizationId_and_locationId_and_productId", (q) =>
          q
            .eq("organizationId", order.organizationId)
            .eq("locationId", order.locationId)
            .eq("productId", productId),
        )
        .unique(),
    ]);
    if (!product || product.organizationId !== order.organizationId) {
      if (entries.some((entry) => entry.productId === productId))
        throw new ConvexError(
          "Et salgsprodukts lagerkobling findes ikke længere",
        );
      continue;
    }
    const countedAt = stock?.lastCountedAt ?? null;
    let before = 0;
    for (const entry of previous?.applied ?? []) {
      if (entry.productId !== productId || entry.countedAt !== countedAt)
        continue;
      const converted = await toDefaultUnit(
        ctx,
        order.organizationId,
        productId,
        entry.unitId,
        entry.quantity,
      );
      if (converted === null)
        throw new ConvexError("En tidligere lagerenhed mangler sin omregning");
      before += converted;
    }
    let after = 0;
    const refundQuantities = new Map<number, number>();
    for (const entry of entries) {
      if (entry.productId !== productId) continue;
      const start =
        settings.stockSyncSinceLastCount &&
        activationAt >= connection.connectedAt
          ? (countedAt ?? activationAt)
          : Math.max(activationAt, connection.connectedAt);
      const eligible =
        previousEligible.has(entry.externalId) || entry.occurredAt >= start;
      const refundToWaste = entry.isRefund === true &&
        (previousRefundPolicy.get(entry.externalId) ?? settings.stockRefundsToWaste ?? false);
      nextEntries.push({ ...entry, eligible, refundToWaste });
      if (!eligible) continue;
      const converted = await toDefaultUnit(
        ctx,
        order.organizationId,
        productId,
        entry.unitId,
        entry.quantity,
      );
      if (converted === null)
        throw new ConvexError("En lagerenhed mangler sin omregning");
      if (refundToWaste) refundQuantities.set(entry.occurredAt,
        (refundQuantities.get(entry.occurredAt) ?? 0) - converted);
      if (countedAt === null || entry.occurredAt >= countedAt) after += converted;
    }
    let wasteAfter = 0;
    let wasteBefore = 0;
    for (const [registeredAt, quantity] of refundQuantities) {
      const amount = Math.max(0, normalizeStock(quantity));
      if (amount === 0) continue;
      refunds.push({ productId, registeredAt, quantity: amount });
      if (countedAt === null || registeredAt >= countedAt) wasteAfter += amount;
    }
    for (const row of previousWaste) {
      if (row.productId !== productId || row.status !== "active" ||
        (countedAt !== null && row.registeredAt < countedAt)) continue;
      const converted = await toDefaultUnit(ctx, order.organizationId, productId, row.defaultUnitId, row.defaultQuantity);
      if (converted === null) throw new ConvexError("En tidligere Waste-enhed mangler sin omregning");
      wasteBefore += converted;
    }
    const wasteDelta = normalizeStock(wasteAfter - wasteBefore);
    after = normalizeStock(after);
    const delta = normalizeStock(after - before);
    if (delta !== 0 || wasteDelta !== 0) {
      await addStock(
        ctx,
        order.organizationId,
        order.locationId,
        productId,
        -delta - wasteDelta,
      );
      const updatedStock = await ctx.db
        .query("locationStock")
        .withIndex("by_organizationId_and_locationId_and_productId", (q) =>
          q
            .eq("organizationId", order.organizationId)
            .eq("locationId", order.locationId)
            .eq("productId", productId),
        )
        .unique();
      if (updatedStock)
        await ctx.db.patch(updatedStock._id, {
          onlinePosSalesQuantity: normalizeStock(
            (stock?.onlinePosSalesQuantity ?? 0) + delta,
          ),
        });
    }
    if (after !== 0)
      applied.push({
        productId,
        unitId: product.defaultUnitId,
        quantity: after,
        countedAt,
      });
  }
  const wasteRegistrationIds = previousWaste.length || refunds.length
    ? await reconcileOnlinePosWaste(ctx, order.organizationId, order.locationId, previousWaste, refunds)
    : [];
  const value = {
    wasteRegistrationIds,
    organizationId: order.organizationId,
    locationId: order.locationId,
    source: "onlinePos" as const,
    connectionId: connection._id,
    externalId:
      previous?.externalId ?? `${connection.companyId}:${order.externalId}`,
    dayStart: order.dayStart,
    orderNumber: order.orderNumber,
    department: order.department,
    fingerprint,
    activationAt,
    unmappedQuantity,
    entries: fingerprint === "" ? (previous?.entries ?? []) : nextEntries,
    applied,
  };
  if (previous) await ctx.db.replace(previous._id, value);
  else await ctx.db.insert("salesStockApplications", value);
}

export const applyPage = internalMutation({
  args: pageArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const [settings, status, sales, location, connection] = await Promise.all([
      integration(ctx, args.organizationId),
      ctx.db
        .query("onlinePosStockSyncStatus")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("locationId", args.locationId),
        )
        .unique(),
      ctx.db
        .query("onlinePosSyncStatus")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("locationId", args.locationId),
        )
        .unique(),
      ctx.db.get("locations", args.locationId),
      ctx.db
        .query("onlinePosLocationIntegrations")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("locationId", args.locationId),
        )
        .unique(),
    ]);
    if (
      !settings?.enabled ||
      !settings.stockSyncEnabled ||
      settings.stockSyncStartedAt !== args.activationAt ||
      status?.runToken !== args.token ||
      !connection ||
      location?.organizationId !== args.organizationId
    )
      return null;
    if (
      sales?.state !== "idle" ||
      sales.runToken !== args.salesToken ||
      sales.pendingReconcileDayStart !== undefined ||
      sales.dayStartRerollToken !== undefined
    )
      return null;
    let done: boolean;
    let cursor: string;
    let unmappedQuantity = status.unmappedQuantity;
    if (args.phase === "orders") {
      const page = await ctx.db
        .query("salesOrders")
        .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("locationId", args.locationId)
            .gte("occurredAt", args.from),
        )
        .paginate({ numItems: 5, cursor: args.cursor });
      const resolve = createSalesStockResolver(ctx, args.organizationId);
      for (const order of page.page) {
        if (order.occurredAt < Date.now() - 400 * 86_400_000) continue;
        if (order.source !== "onlinePos") continue;
        const lines = await ctx.db
          .query("salesLines")
          .withIndex("by_organizationId_and_orderId", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("orderId", order._id),
          )
          .take(501);
        if (lines.length > 500)
          throw new ConvexError(
            "En salgsordre har for mange linjer til lagersynkronisering",
          );
        if (
          lines.some(
            (line) =>
              line.locationId !== args.locationId ||
              line.source !== "onlinePos",
          )
        )
          throw new ConvexError("Salgsordrens lagerlinjer er ugyldige");
        const previous = await stockApplication(
          ctx,
          order,
          connection.companyId,
        );
        const fingerprint = stockSalesFingerprint(lines);
        if (
          previous?.fingerprint === fingerprint &&
          previous.activationAt === args.activationAt &&
          previous.connectionId === connection._id &&
          previous.unmappedQuantity === 0
        )
          continue;
        const result =
          previous?.fingerprint === fingerprint &&
          previous.unmappedQuantity === 0
            ? { entries: previous.entries, unmappedQuantity: 0 }
            : await resolve(lines);
        await applyOrder(
          ctx,
          settings,
          connection,
          order,
          previous,
          result.entries,
          fingerprint,
          result.unmappedQuantity,
        );
        unmappedQuantity += result.unmappedQuantity;
      }
      done = page.isDone;
      cursor = page.continueCursor;
    } else {
      const page = await ctx.db
        .query("salesStockApplications")
        .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("locationId", args.locationId)
            .gte("dayStart", args.from - 86_400_000),
        )
        .paginate({ numItems: 10, cursor: args.cursor });
      for (const previous of page.page) {
        if (previous.dayStart < Date.now() - 400 * 86_400_000) continue;
        if (
          (previous.applied.length === 0 && !previous.wasteRegistrationIds?.length) ||
          previous.connectionId !== connection._id
        )
          continue;
        const order = await ctx.db
          .query("salesOrders")
          .withIndex("by_org_location_day_order_department", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("locationId", args.locationId)
              .eq("dayStart", previous.dayStart)
              .eq("orderNumber", previous.orderNumber)
              .eq("department", previous.department),
          )
          .unique();
        if (!order)
          await applyOrder(
            ctx,
            settings,
            connection,
            previous,
            previous,
            [],
            "",
            0,
          );
      }
      done = page.isDone;
      cursor = page.continueCursor;
    }
    const complete = done && args.phase === "removed";
    const now = Date.now();
    await ctx.db.patch(status._id, {
      unmappedQuantity,
      updatedAt: now,
      ...(complete
        ? {
            state: unmappedQuantity ? ("error" as const) : ("idle" as const),
            lastError: unmappedQuantity
              ? `${unmappedQuantity} solgte enheder mangler en produktkobling. Tilføj koblingerne, og synkronisér igen.`
              : undefined,
            ...(unmappedQuantity
              ? {}
              : { lastSuccessAt: now, syncedThroughAt: sales.syncedThroughAt }),
          }
        : {}),
    });
    if (!complete)
      await ctx.scheduler.runAfter(0, internal.onlinePosStock.runPage, {
        ...args,
        phase: done ? "removed" : args.phase,
        cursor: done ? null : cursor,
      });
    return null;
  },
});

export const runPage = internalAction({
  args: pageArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(internal.onlinePosStock.applyPage, args);
    } catch (error) {
      await ctx.runMutation(internal.onlinePosStock.fail, {
        organizationId: args.organizationId,
        locationId: args.locationId,
        token: args.token,
        message:
          error instanceof ConvexError && typeof error.data === "string"
            ? error.data
            : "Lagersynkroniseringen mislykkedes. Prøv igen.",
      });
    }
    return null;
  },
});

export const fail = internalMutation({
  args: { ...locationArgs, token: v.string(), message: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await ctx.db
      .query("onlinePosStockSyncStatus")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("locationId", args.locationId),
      )
      .unique();
    if (status?.runToken === args.token)
      await ctx.db.patch(status._id, {
        state: "error",
        lastError: args.message.slice(0, 500),
        updatedAt: Date.now(),
      });
    return null;
  },
});

export const setEnabled = mutation({
  args: { enabled: v.boolean(), syncSinceLastCount: v.boolean(), refundsToWaste: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireIntegrationManager(ctx);
    requireAllLocationAccess(auth);
    const settings = await integration(ctx, auth.organizationId);
    if (!settings || (args.enabled && !settings.enabled))
      throw new ConvexError("Aktivér OnlinePOS-integrationen først");
    if ((settings.stockSyncEnabled ?? false) === args.enabled) return null;
    const now = Date.now();
    await ctx.db.patch(settings._id, {
      stockSyncEnabled: args.enabled,
      ...(args.enabled
        ? {
            stockRefundsToWaste: args.refundsToWaste ?? settings.stockRefundsToWaste ?? false,
            stockSyncStartedAt: now,
            stockSyncHistoryStartAt: settings.stockSyncHistoryStartAt ?? now,
            stockSyncSinceLastCount: args.syncSinceLastCount,
          }
        : {}),
      updatedAt: now,
    });
    if (args.enabled)
      await ctx.scheduler.runAfter(
        0,
        internal.onlinePosSync.enqueueOrganizationSync,
        { organizationId: auth.organizationId },
      );
    await recordAudit(ctx, auth, {
      action: "integration.stockSyncChanged",
      entityTable: "onlinePosIntegrations",
      entityId: settings._id,
      summary: args.enabled
        ? args.syncSinceLastCount
          ? "OnlinePOS-lagersynkronisering aktiveret med salg siden seneste Count"
          : "OnlinePOS-lagersynkronisering aktiveret fra nu"
        : "OnlinePOS-lagersynkronisering deaktiveret",
    });
    return null;
  },
});

export const setRefundsToWaste = mutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireIntegrationManager(ctx);
    requireAllLocationAccess(auth);
    const settings = await integration(ctx, auth.organizationId);
    if (!settings?.enabled || !settings.stockSyncEnabled)
      throw new ConvexError("Aktivér lagersynkronisering først");
    await ctx.db.patch(settings._id, { stockRefundsToWaste: args.enabled, updatedAt: Date.now() });
    await recordAudit(ctx, auth, {
      action: "integration.stockRefundsToWasteChanged",
      entityTable: "onlinePosIntegrations", entityId: settings._id,
      summary: args.enabled ? "Nye OnlinePOS-refunderinger registreres som Waste" : "Nye OnlinePOS-refunderinger føres tilbage på lageret",
    });
    return null;
  },
});

export const retry = mutation({
  args: { locationId: v.id("locations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireIntegrationManager(ctx);
    requireLocationAccess(auth, args.locationId);
    await queueStockSync(
      ctx,
      auth.organizationId,
      args.locationId,
      undefined,
      true,
    );
    await ctx.scheduler.runAfter(
      0,
      internal.onlinePosSync.enqueueLocationSync,
      { organizationId: auth.organizationId, locationId: args.locationId },
    );
    return null;
  },
});

export const getSettings = query({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    integrationEnabled: v.boolean(),
    refundsToWaste: v.boolean(),
    canManage: v.boolean(),
    locations: v.array(
      v.object({
        id: v.id("locations"),
        name: v.string(),
        state: v.union(
          v.literal("waiting"),
          v.literal("running"),
          v.literal("idle"),
          v.literal("error"),
        ),
        lastSuccessAt: v.union(v.number(), v.null()),
        lastError: v.union(v.string(), v.null()),
      }),
    ),
  }),
  handler: async (ctx) => {
    const auth = await requireIntegrationManager(ctx);
    const [settings, connections] = await Promise.all([
      ctx.db
        .query("onlinePosIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", auth.organizationId),
        )
        .unique(),
      ctx.db
        .query("onlinePosLocationIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", auth.organizationId),
        )
        .take(201),
    ]);
    if (connections.length > 200)
      throw new ConvexError("Der er for mange OnlinePOS-lokationer");
    let canManage = true;
    try {
      requireAllLocationAccess(auth);
    } catch {
      canManage = false;
    }
    const locations = [];
    for (const connection of connections) {
      try {
        requireLocationAccess(auth, connection.locationId);
      } catch {
        continue;
      }
      const [location, status] = await Promise.all([
        ctx.db.get("locations", connection.locationId),
        ctx.db
          .query("onlinePosStockSyncStatus")
          .withIndex("by_organizationId_and_locationId", (q) =>
            q
              .eq("organizationId", auth.organizationId)
              .eq("locationId", connection.locationId),
          )
          .unique(),
      ]);
      if (location?.organizationId !== auth.organizationId) continue;
      const current =
        status?.activationAt === settings?.stockSyncStartedAt ? status : null;
      locations.push({
        id: location._id,
        name: location.name,
        state: current?.state ?? ("waiting" as const),
        lastSuccessAt: current?.lastSuccessAt ?? null,
        lastError: current?.lastError ?? null,
      });
    }
    return {
      enabled: settings?.stockSyncEnabled ?? false,
      integrationEnabled: settings?.enabled ?? false,
      refundsToWaste: settings?.stockRefundsToWaste ?? false,
      canManage,
      locations,
    };
  },
});

export const prune = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 400 * 86_400_000;
    const rows = await ctx.db
      .query("salesStockApplications")
      .withIndex("by_dayStart", (q) => q.lt("dayStart", cutoff))
      .take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === 100)
      await ctx.scheduler.runAfter(0, internal.onlinePosStock.prune, {});
    return null;
  },
});
