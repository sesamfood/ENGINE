import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireLocationAccess, requirePermission } from "./lib/auth";
import {
  countCombinedWarning,
  resolveCountSalesSource,
} from "./lib/countSalesSource";
import { resolveWoltMapping } from "./lib/woltMappings";
import { normalizeStock } from "./lib/stock";
import {
  salesSourceValidator,
  woltConnectionStateValidator,
} from "./lib/woltValidators";

const MAX_LOCATIONS = 200;
const MAX_MAPPINGS = 500;
const MAX_WASTE_SALES_LINES = 5_000;
const MAX_WOLT_SALES_LINES = 5_000;

const onlinePosStateValidator = v.union(
  v.literal("idle"),
  v.literal("queued"),
  v.literal("running"),
  v.literal("error"),
);

const nullableNumber = v.union(v.number(), v.null());
const nullableString = v.union(v.string(), v.null());

const onlinePosHealthValidator = v.object({
  connected: v.boolean(),
  usable: v.boolean(),
  covered: v.boolean(),
  state: v.union(onlinePosStateValidator, v.null()),
  reason: nullableString,
  lastSuccessAt: nullableNumber,
  syncedThroughAt: nullableNumber,
  backfillThroughAt: nullableNumber,
  freshnessAt: nullableNumber,
});

const woltHealthValidator = v.object({
  connected: v.boolean(),
  usable: v.boolean(),
  covered: v.boolean(),
  state: v.union(woltConnectionStateValidator, v.null()),
  reason: nullableString,
  activatedAt: nullableNumber,
  lastWebhookAt: nullableNumber,
  lastSuccessAt: nullableNumber,
  freshnessAt: nullableNumber,
});

const sourceHealthValidator = v.object({
  onlinePos: onlinePosHealthValidator,
  wolt: woltHealthValidator,
});

const settingLocationValidator = v.object({
  id: v.id("locations"),
  name: v.string(),
  connected: v.object({
    onlinePos: v.boolean(),
    wolt: v.boolean(),
  }),
  onlinePosConnected: v.boolean(),
  woltConnected: v.boolean(),
  savedSource: v.union(salesSourceValidator, v.null()),
  effectiveSource: salesSourceValidator,
  health: sourceHealthValidator,
});

const settingsResultValidator = v.object({
  locations: v.array(settingLocationValidator),
});

const wasteReportRowValidator = v.object({
  productName: v.string(),
  defaultUnitName: v.string(),
  expectedQuantity: v.number(),
  salesQuantity: v.number(),
  countedQuantity: v.number(),
  wasteQuantity: v.number(),
});

const wasteReportResultValidator = v.object({
  locationName: v.string(),
  submittedAt: v.number(),
  hasBaseline: v.boolean(),
  salesIncluded: v.boolean(),
  salesOmittedReason: nullableString,
  rows: v.array(wasteReportRowValidator),
  salesSource: salesSourceValidator,
  combinedWarning: nullableString,
  sourceHealth: sourceHealthValidator,
  unmappedSalesQuantity: v.number(),
});

type SalesSource = Doc<"countSalesSourceSettings">["salesSource"];
type ReportContext = {
  organizationId: string;
  locationId: Id<"locations">;
  locationName: string;
  submittedAt: number;
  rows: Array<{
    productId: Id<"products">;
    productName: string;
    defaultUnitName: string;
    expectedQuantity: number;
    countedQuantity: number;
    expectedSinceAt: number;
  }>;
};

type OnlinePosHealth = {
  connected: boolean;
  usable: boolean;
  covered: boolean;
  state: Doc<"onlinePosSyncStatus">["state"] | null;
  reason: string | null;
  lastSuccessAt: number | null;
  syncedThroughAt: number | null;
  backfillThroughAt: number | null;
  freshnessAt: number | null;
};

type WoltHealth = {
  connected: boolean;
  usable: boolean;
  covered: boolean;
  state: Doc<"woltVenueConnections">["state"] | null;
  reason: string | null;
  activatedAt: number | null;
  lastWebhookAt: number | null;
  lastSuccessAt: number | null;
  freshnessAt: number | null;
};

type SourceHealth = {
  onlinePos: OnlinePosHealth;
  wolt: WoltHealth;
};

type SalesByProduct = Map<Id<"products">, number>;

type ProviderLoad<Health extends OnlinePosHealth | WoltHealth> = {
  health: Health;
  salesByProduct: SalesByProduct;
  unmappedSalesQuantity: number;
};

function addQuantity(
  salesByProduct: SalesByProduct,
  productId: Id<"products">,
  quantity: number,
) {
  salesByProduct.set(
    productId,
    (salesByProduct.get(productId) ?? 0) + quantity,
  );
}

function reportSourceHealth(
  onlinePos: OnlinePosHealth,
  wolt: WoltHealth,
): SourceHealth {
  return { onlinePos, wolt };
}

async function loadOnlinePos(
  ctx: QueryCtx,
  report: ReportContext,
  from: number,
  to: number,
): Promise<ProviderLoad<OnlinePosHealth>> {
  const [master, connection, status, mappings] = await Promise.all([
    ctx.db
      .query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", report.organizationId),
      )
      .unique(),
    ctx.db
      .query("onlinePosLocationIntegrations")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q
          .eq("organizationId", report.organizationId)
          .eq("locationId", report.locationId),
      )
      .unique(),
    ctx.db
      .query("onlinePosSyncStatus")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q
          .eq("organizationId", report.organizationId)
          .eq("locationId", report.locationId),
      )
      .unique(),
    ctx.db
      .query("onlinePosProductMappings")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", report.organizationId),
      )
      .take(MAX_MAPPINGS + 1),
  ]);

  const historyStart =
    status?.backfillThroughAt ?? status?.syncedThroughAt ?? null;
  const connected = master?.enabled === true && connection !== null;
  const covered =
    connected &&
    status?.syncedThroughAt != null &&
    status.syncedThroughAt >= to &&
    historyStart != null &&
    historyStart <= from;
  const duplicateMappingCount =
    mappings.length > MAX_MAPPINGS
      ? 0
      : mappings.length -
        new Set(mappings.map((mapping) => mapping.onlinePosProductId)).size;
  const freshnessAt = status?.lastSuccessAt ?? null;
  let reason: string | null = null;
  if (!connected) {
    reason = "lokationen er ikke forbundet til OnlinePOS";
  } else if (!covered) {
    reason = "synkroniserede salg dækker ikke count-perioden";
  } else if (mappings.length > MAX_MAPPINGS) {
    reason = "der er for mange produktkoblinger til at beregne sikkert";
  } else if (duplicateMappingCount > 0) {
    reason = "et OnlinePOS-produkt er koblet til flere produkter";
  }

  const health: OnlinePosHealth = {
    connected,
    usable: reason === null,
    covered,
    state: status?.state ?? null,
    reason,
    lastSuccessAt: freshnessAt,
    syncedThroughAt: status?.syncedThroughAt ?? null,
    backfillThroughAt: status?.backfillThroughAt ?? null,
    freshnessAt,
  };
  const salesByProduct: SalesByProduct = new Map();
  if (!health.usable) {
    return { health, salesByProduct, unmappedSalesQuantity: 0 };
  }

  const productByExternalId = new Map(
    mappings.map((mapping) => [
      String(mapping.onlinePosProductId),
      mapping.productId,
    ]),
  );
  const rowByProduct = new Map(report.rows.map((row) => [row.productId, row]));
  const lines = await ctx.db
    .query("salesLines")
    .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
      q
        .eq("organizationId", report.organizationId)
        .eq("locationId", report.locationId)
        .gte("occurredAt", from)
        .lte("occurredAt", to),
    )
    .take(MAX_WASTE_SALES_LINES + 1);
  if (lines.length > MAX_WASTE_SALES_LINES) {
    health.usable = false;
    health.reason = "der er for mange salgslinjer til at beregne sikkert";
    return { health, salesByProduct, unmappedSalesQuantity: 0 };
  }

  for (const line of lines) {
    // salesLines is provider-agnostic. Count's OnlinePOS branch must not
    // consume rows written by another provider.
    if (line.source !== "onlinePos") continue;
    const productId = productByExternalId.get(line.externalProductId);
    const row = productId ? rowByProduct.get(productId) : null;
    if (
      !productId ||
      !row ||
      line.occurredAt < row.expectedSinceAt ||
      line.occurredAt > report.submittedAt
    ) {
      continue;
    }
    addQuantity(salesByProduct, productId, line.quantity);
  }
  return { health, salesByProduct, unmappedSalesQuantity: 0 };
}

async function loadWolt(
  ctx: QueryCtx,
  report: ReportContext,
  from: number,
  to: number,
): Promise<ProviderLoad<WoltHealth>> {
  const [connection, mappings, pendingEvent, processingEvent, deadLetterEvent] =
    await Promise.all([
      ctx.db
        .query("woltVenueConnections")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q
            .eq("organizationId", report.organizationId)
            .eq("locationId", report.locationId),
        )
        .unique(),
      ctx.db
        .query("woltProductMappings")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", report.organizationId),
        )
        .take(MAX_MAPPINGS + 1),
      ...(["pending", "processing", "deadLetter"] as const).map((state) =>
        ctx.db
          .query("woltWebhookEvents")
          .withIndex("by_organizationId_and_locationId_and_state", (q) =>
            q
              .eq("organizationId", report.organizationId)
              .eq("locationId", report.locationId)
              .eq("state", state),
          )
          .first(),
      ),
    ]);

  const connected = connection?.state === "ready";
  const covered =
    connected &&
    connection.activatedAt <= from;
  const freshnessAt = connection?.lastSuccessAt ?? connection?.lastWebhookAt ?? null;
  let reason: string | null = null;
  if (!connected) {
    reason = "lokationen er ikke klar til Wolt-salg";
  } else if (!covered) {
    reason = "Wolt-data dækker ikke count-perioden";
  } else if (deadLetterEvent) {
    reason = "Wolt-events kræver manuel genkørsel";
  } else if (pendingEvent || processingEvent) {
    reason = "Wolt-events venter stadig på behandling";
  } else if (mappings.length > MAX_MAPPINGS) {
    reason = "der er for mange Wolt-produktkoblinger til at beregne sikkert";
  }

  const health: WoltHealth = {
    connected,
    usable: reason === null,
    covered,
    state: connection?.state ?? null,
    reason,
    activatedAt: connection?.activatedAt ?? null,
    lastWebhookAt: connection?.lastWebhookAt ?? null,
    lastSuccessAt: connection?.lastSuccessAt ?? null,
    freshnessAt,
  };
  const salesByProduct: SalesByProduct = new Map();
  if (!health.usable) {
    return { health, salesByProduct, unmappedSalesQuantity: 0 };
  }

  const rowByProduct = new Map(report.rows.map((row) => [row.productId, row]));
  const items = await ctx.db
    .query("woltOrderItems")
    .withIndex("by_organizationId_and_locationId_and_status_and_occurredAt", (q) =>
      q
        .eq("organizationId", report.organizationId)
        .eq("locationId", report.locationId)
        .eq("status", "delivered")
        .gte("occurredAt", from)
        .lte("occurredAt", to),
    )
    .take(MAX_WOLT_SALES_LINES + 1);
  if (items.length > MAX_WOLT_SALES_LINES) {
    health.usable = false;
    health.reason = "der er for mange Wolt-ordrelinjer til at beregne sikkert";
    return { health, salesByProduct, unmappedSalesQuantity: 0 };
  }

  let unmappedSalesQuantity = 0;
  for (const item of items) {
    const resolution = resolveWoltMapping(mappings, report.locationId, item);
    if (resolution.kind !== "mapped") {
      // Keep unmapped and conflicting quantities visible. They are not
      // silently treated as a mapped zero.
      unmappedSalesQuantity += item.quantity;
      continue;
    }
    const row = rowByProduct.get(resolution.mapping.productId);
    if (!row || item.occurredAt < row.expectedSinceAt) continue;
    addQuantity(salesByProduct, resolution.mapping.productId, item.quantity);
  }
  return { health, salesByProduct, unmappedSalesQuantity };
}

function healthWarnings(
  source: SalesSource,
  health: SourceHealth,
): string[] {
  const providers: Array<[string, OnlinePosHealth | WoltHealth]> =
    source === "combined"
      ? [
          ["OnlinePOS", health.onlinePos],
          ["Wolt", health.wolt],
        ]
      : source === "onlinePos"
        ? [["OnlinePOS", health.onlinePos]]
        : [["Wolt", health.wolt]];
  return providers.flatMap(([name, provider]) =>
    provider.reason ? [`${name}: ${provider.reason}`] : [],
  );
}

function combineSales(
  source: SalesSource,
  onlinePos: ProviderLoad<OnlinePosHealth>,
  wolt: ProviderLoad<WoltHealth>,
): { salesByProduct: SalesByProduct; salesIncluded: boolean } {
  const selected =
    source === "combined"
      ? [onlinePos, wolt]
      : [source === "onlinePos" ? onlinePos : wolt];
  const salesIncluded = selected.every((provider) => provider.health.usable);
  if (!salesIncluded) return { salesByProduct: new Map(), salesIncluded };
  const salesByProduct: SalesByProduct = new Map();
  for (const provider of selected) {
    for (const [productId, quantity] of provider.salesByProduct) {
      addQuantity(salesByProduct, productId, quantity);
    }
  }
  return { salesByProduct, salesIncluded };
}

async function settingsForLocation(
  ctx: QueryCtx,
  organizationId: string,
  locationId: Id<"locations">,
) {
  return await ctx.db
    .query("countSalesSourceSettings")
    .withIndex("by_organizationId_and_locationId", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", locationId),
    )
    .unique();
}

export const getSettings = query({
  args: {},
  returns: settingsResultValidator,
  handler: async (ctx) => {
    const auth = await requirePermission(ctx, "count.settings");
    const { organizationId } = auth;
    const [locations, master, locationConnections, statuses, woltIntegration, woltConnections, saved] =
      await Promise.all([
        ctx.db
          .query("locations")
          .withIndex("by_organizationId_and_normalizedName", (q) =>
            q.eq("organizationId", organizationId),
          )
          .take(MAX_LOCATIONS + 1),
        ctx.db
          .query("onlinePosIntegrations")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", organizationId),
          )
          .unique(),
        ctx.db
          .query("onlinePosLocationIntegrations")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", organizationId),
          )
          .take(MAX_LOCATIONS + 1),
        ctx.db
          .query("onlinePosSyncStatus")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", organizationId),
          )
          .take(MAX_LOCATIONS + 1),
        ctx.db
          .query("woltIntegrations")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", organizationId),
          )
          .unique(),
        ctx.db
          .query("woltVenueConnections")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", organizationId),
          )
          .take(MAX_LOCATIONS + 1),
        ctx.db
          .query("countSalesSourceSettings")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", organizationId),
          )
          .take(MAX_LOCATIONS + 1),
      ]);
    if (locations.length > MAX_LOCATIONS) {
      throw new ConvexError("Der er for mange lokationer til at vise Count-kilder");
    }
    if (
      locationConnections.length > MAX_LOCATIONS ||
      statuses.length > MAX_LOCATIONS ||
      woltConnections.length > MAX_LOCATIONS ||
      saved.length > MAX_LOCATIONS
    ) {
      throw new ConvexError("Der er for mange integrationer til at vise Count-kilder");
    }

    const visibleLocations = locations.filter(
      (location) =>
        auth.locationScope.all || auth.locationScope.ids.has(location._id),
    );
    const locationConnectionById = new Map(
      locationConnections.map((connection) => [connection.locationId, connection]),
    );
    const statusByLocationId = new Map(
      statuses.map((status) => [status.locationId, status]),
    );
    const woltByLocationId = new Map(
      woltConnections.map((connection) => [connection.locationId, connection]),
    );
    const savedByLocationId = new Map(
      saved.map((setting) => [setting.locationId, setting]),
    );

    return {
      locations: visibleLocations.map((location) => {
        const locationConnection = locationConnectionById.get(location._id);
        const status = statusByLocationId.get(location._id);
        const wolt = woltByLocationId.get(location._id);
        const onlinePosConnected = master?.enabled === true && Boolean(locationConnection);
        const woltConnected =
          woltIntegration?.enabled !== false && wolt?.state === "ready";
        const historyStart = status?.backfillThroughAt ?? status?.syncedThroughAt ?? null;
        const onlinePosHealth: OnlinePosHealth = {
          connected: onlinePosConnected,
          usable: onlinePosConnected && status?.syncedThroughAt != null,
          covered: onlinePosConnected && status?.syncedThroughAt != null && historyStart != null,
          state: status?.state ?? null,
          reason: onlinePosConnected ? null : "lokationen er ikke forbundet til OnlinePOS",
          lastSuccessAt: status?.lastSuccessAt ?? null,
          syncedThroughAt: status?.syncedThroughAt ?? null,
          backfillThroughAt: status?.backfillThroughAt ?? null,
          freshnessAt: status?.lastSuccessAt ?? null,
        };
        const woltHealth: WoltHealth = {
          connected: woltConnected,
          usable: woltConnected,
          covered: woltConnected,
          state: wolt?.state ?? null,
          reason: woltConnected ? null : "lokationen er ikke klar til Wolt-salg",
          activatedAt: wolt?.activatedAt ?? null,
          lastWebhookAt: wolt?.lastWebhookAt ?? null,
          lastSuccessAt: wolt?.lastSuccessAt ?? null,
          freshnessAt: wolt?.lastSuccessAt ?? wolt?.lastWebhookAt ?? null,
        };
        const savedSource = savedByLocationId.get(location._id)?.salesSource ?? null;
        return {
          id: location._id,
          name: location.name,
          connected: { onlinePos: onlinePosConnected, wolt: woltConnected },
          onlinePosConnected,
          woltConnected,
          savedSource,
          effectiveSource: resolveCountSalesSource(
            savedSource,
            onlinePosConnected,
            woltConnected,
          ),
          health: reportSourceHealth(onlinePosHealth, woltHealth),
        };
      }),
    };
  },
});

export const setSource = mutation({
  args: {
    locationId: v.id("locations"),
    salesSource: salesSourceValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requirePermission(ctx, "count.settings");
    if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
    requireLocationAccess(auth, args.locationId);
    const location = await ctx.db.get("locations", args.locationId);
    if (!location || location.organizationId !== auth.organizationId) {
      throw new ConvexError("Lokationen blev ikke fundet");
    }
    const existing = await settingsForLocation(
      ctx,
      auth.organizationId,
      args.locationId,
    );
    if (existing) {
      await ctx.db.patch("countSalesSourceSettings", existing._id, {
        salesSource: args.salesSource,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("countSalesSourceSettings", {
        organizationId: auth.organizationId,
        locationId: args.locationId,
        salesSource: args.salesSource,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const buildCountWasteReport = query({
  args: { countId: v.id("counts") },
  returns: wasteReportResultValidator,
  handler: async (ctx, args) => {
    const report: ReportContext = await ctx.runQuery(
      internal.count.getWasteReportContext,
      { countId: args.countId },
    );
    const saved = await settingsForLocation(
      ctx,
      report.organizationId,
      report.locationId,
    );
    const [master, locationConnection, status, woltIntegration, woltConnection] = await Promise.all([
      ctx.db
        .query("onlinePosIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", report.organizationId),
        )
        .unique(),
      ctx.db
        .query("onlinePosLocationIntegrations")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q
            .eq("organizationId", report.organizationId)
            .eq("locationId", report.locationId),
        )
        .unique(),
      ctx.db
        .query("onlinePosSyncStatus")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q
            .eq("organizationId", report.organizationId)
            .eq("locationId", report.locationId),
        )
        .unique(),
      ctx.db
        .query("woltIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", report.organizationId),
        )
        .unique(),
      ctx.db
        .query("woltVenueConnections")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q
            .eq("organizationId", report.organizationId)
            .eq("locationId", report.locationId),
        )
        .unique(),
    ]);
    const onlinePosConnected = master?.enabled === true && Boolean(locationConnection);
    const woltConnected =
      woltIntegration?.enabled !== false && woltConnection?.state === "ready";
    const selectedSource = resolveCountSalesSource(
      saved?.salesSource ?? null,
      onlinePosConnected,
      woltConnected,
    );
    if (report.rows.length === 0) {
      const onlinePosHealth: OnlinePosHealth = {
        connected: onlinePosConnected,
        usable: false,
        covered: false,
        state: status?.state ?? null,
        reason: "Counten har ingen afstemningslinjer",
        lastSuccessAt: status?.lastSuccessAt ?? null,
        syncedThroughAt: status?.syncedThroughAt ?? null,
        backfillThroughAt: status?.backfillThroughAt ?? null,
        freshnessAt: status?.lastSuccessAt ?? null,
      };
      const woltHealth: WoltHealth = {
        connected: woltConnected,
        usable: false,
        covered: false,
        state: woltConnection?.state ?? null,
        reason: "Counten har ingen afstemningslinjer",
        activatedAt: woltConnection?.activatedAt ?? null,
        lastWebhookAt: woltConnection?.lastWebhookAt ?? null,
        lastSuccessAt: woltConnection?.lastSuccessAt ?? null,
        freshnessAt: woltConnection?.lastSuccessAt ?? woltConnection?.lastWebhookAt ?? null,
      };
      return {
        locationName: report.locationName,
        submittedAt: report.submittedAt,
        hasBaseline: false,
        salesIncluded: false,
        salesOmittedReason: null,
        rows: [],
        salesSource: selectedSource,
        combinedWarning: countCombinedWarning(selectedSource),
        sourceHealth: reportSourceHealth(onlinePosHealth, woltHealth),
        unmappedSalesQuantity: 0,
      };
    }

    const from = Math.min(...report.rows.map((row) => row.expectedSinceAt));
    const to = report.submittedAt;
    const [onlinePos, wolt] = await Promise.all([
      loadOnlinePos(ctx, report, from, to),
      loadWolt(ctx, report, from, to),
    ]);
    const sourceHealth = reportSourceHealth(onlinePos.health, wolt.health);
    const combined = combineSales(selectedSource, onlinePos, wolt);
    const warnings = healthWarnings(selectedSource, sourceHealth);
    const salesOmittedReason = combined.salesIncluded
      ? null
      : warnings.length > 0
        ? warnings.join("; ")
        : "salg fra den valgte kilde dækker ikke count-perioden";
    const unmappedSalesQuantity =
      selectedSource === "onlinePos" ? 0 : wolt.unmappedSalesQuantity;
    return {
      locationName: report.locationName,
      submittedAt: report.submittedAt,
      hasBaseline: true,
      salesIncluded: combined.salesIncluded,
      salesOmittedReason,
      rows: report.rows.flatMap((row) => {
        const salesQuantity = combined.salesIncluded
          ? normalizeStock(combined.salesByProduct.get(row.productId) ?? 0)
          : 0;
        const wasteQuantity = normalizeStock(
          row.expectedQuantity - salesQuantity - row.countedQuantity,
        );
        return Math.abs(wasteQuantity) < 1e-6
          ? []
          : [
              {
                productName: row.productName,
                defaultUnitName: row.defaultUnitName,
                expectedQuantity: row.expectedQuantity,
                salesQuantity,
                countedQuantity: row.countedQuantity,
                wasteQuantity,
              },
            ];
      }),
      salesSource: selectedSource,
      combinedWarning: countCombinedWarning(selectedSource),
      sourceHealth,
      unmappedSalesQuantity,
    };
  },
});
