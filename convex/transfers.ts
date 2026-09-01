import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, type Infer, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { getDatabaseAdapter } from "./auth";
import {
  requireTransferManager,
  requireTransferViewer,
} from "./lib/auth";
import { requireOtherFeaturesUnlocked } from "./lib/countLock";
import { addStock, normalizeStock, toDefaultUnit } from "./lib/stock";
import { searchActiveProductOptions } from "./lib/productCatalog";
import {
  dashboardSummaryTimeZone,
  reconcileDashboardSummary,
} from "./lib/dashboardSummaries";
import { transferAggregates } from "./lib/transferAggregates";
import { requestDashboardSummaryRebuild } from "./dashboardSummaries";

const MAX_TRANSFER_ITEMS = 200;
const MAX_COMMENT_LENGTH = 500;
const MAX_PRODUCT_UNITS = 200;
const EXPORT_PAGE_SIZE = 5;
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;
const MAX_PUBLIC_PAGE_SIZE = 100;

function requirePageSize(numItems: number, maximum: number) {
  if (!Number.isInteger(numItems) || numItems <= 0 || numItems > maximum) {
    throw new ConvexError("Siden er for stor");
  }
}

async function requireLocationsUnlocked(
  ctx: MutationCtx,
  organizationId: string,
  locationIds: Id<"locations">[],
) {
  for (const locationId of new Set(locationIds)) {
    await requireOtherFeaturesUnlocked(ctx, organizationId, locationId);
  }
}

const transferItemInputValidator = v.object({
  productId: v.id("products"),
  unitId: v.id("units"),
  quantity: v.number(),
});

const productTemperatureInputValidator = v.object({
  productId: v.id("products"),
  temperatureCelsius: v.number(),
});

const confirmedTemperatureDeviationValidator = v.object({
  productId: v.id("products"),
  maxTemperatureCelsius: v.number(),
});

const transferArgsValidator = v.object({
  fromLocationId: v.id("locations"),
  toLocationId: v.id("locations"),
  responsibleUserId: v.string(),
  comment: v.optional(v.string()),
  transferredAt: v.number(),
  items: v.array(transferItemInputValidator),
  productTemperatures: v.optional(v.array(productTemperatureInputValidator)),
  confirmedTemperatureDeviations: v.optional(
    v.array(confirmedTemperatureDeviationValidator),
  ),
});

const transferHeaderValidator = v.object({
  id: v.id("transfers"),
  transferredAt: v.number(),
  fromLocationName: v.string(),
  toLocationName: v.string(),
  responsibleName: v.string(),
  comment: v.union(v.string(), v.null()),
  itemCount: v.number(),
  totalQuantity: v.number(),
  hasTemperatureDeviation: v.boolean(),
  receiptStatus: v.union(
    v.literal("pending"),
    v.literal("registered"),
    v.null(),
  ),
});

const transferDetailValidator = transferHeaderValidator.extend({
  fromLocationId: v.id("locations"),
  toLocationId: v.id("locations"),
  responsibleUserId: v.string(),
  items: v.array(
    v.object({
      id: v.id("transferItems"),
      productId: v.id("products"),
      productName: v.string(),
      unitId: v.id("units"),
      unitName: v.string(),
      quantity: v.number(),
      temperatureCelsius: v.union(v.number(), v.null()),
      maxTemperatureCelsius: v.union(v.number(), v.null()),
      receivedQuantity: v.union(v.number(), v.null()),
    }),
  ),
});

const productSearchOptionValidator = v.object({
  id: v.id("products"),
  name: v.string(),
});

const responsibleUserValidator = v.object({
  id: v.string(),
  name: v.string(),
});

const productOptionValidator = productSearchOptionValidator.extend({
  imageUrl: v.union(v.string(), v.null()),
  defaultUnitId: v.id("units"),
  maxTemperatureCelsius: v.union(v.number(), v.null()),
  units: v.array(
    v.object({
      id: v.id("units"),
      name: v.string(),
    }),
  ),
});

const exportRowValidator = v.object({
  transferredAt: v.number(),
  fromLocationName: v.string(),
  toLocationName: v.string(),
  responsibleName: v.string(),
  productName: v.string(),
  unitName: v.string(),
  quantity: v.number(),
  temperatureCelsius: v.union(v.number(), v.null()),
  maxTemperatureCelsius: v.union(v.number(), v.null()),
  temperatureDeviation: v.boolean(),
  comment: v.union(v.string(), v.null()),
});

const exportTransferValidator = v.object({
  rows: v.array(exportRowValidator),
});

type TransferInput = Infer<typeof transferArgsValidator>;

type TemperatureSnapshot = {
  temperatureCelsius?: number;
  maxTemperatureCelsius?: number;
};

async function locationName(
  ctx: QueryCtx,
  locationId: Id<"locations">,
): Promise<string> {
  const location = await ctx.db.get("locations", locationId);
  return location?.name ?? "Ukendt lokation";
}

async function hydrateTransferHeader(
  ctx: QueryCtx,
  transfer: Doc<"transfers">,
  existingItems?: Doc<"transferItems">[],
  locationNames?: ReadonlyMap<Id<"locations">, string>,
) {
  const aggregates =
    transfer.itemCount !== undefined &&
    transfer.totalQuantity !== undefined &&
    transfer.hasTemperatureDeviation !== undefined
      ? {
          itemCount: transfer.itemCount,
          totalQuantity: transfer.totalQuantity,
          hasTemperatureDeviation: transfer.hasTemperatureDeviation,
        }
      : transferAggregates(
          existingItems ??
            (await ctx.db
              .query("transferItems")
              .withIndex("by_organizationId_and_transferId", (q) =>
                q
                  .eq("organizationId", transfer.organizationId)
                  .eq("transferId", transfer._id),
              )
              .take(MAX_TRANSFER_ITEMS)),
        );

  const [fromLocationName, toLocationName] = await Promise.all([
    locationNames?.get(transfer.fromLocationId) ??
      locationName(ctx, transfer.fromLocationId),
    locationNames?.get(transfer.toLocationId) ??
      locationName(ctx, transfer.toLocationId),
  ]);

  return {
    id: transfer._id,
    transferredAt: transfer.transferredAt,
    fromLocationName,
    toLocationName,
    responsibleName: transfer.responsibleName,
    comment: transfer.comment ?? null,
    ...aggregates,
    receiptStatus: transfer.receiptStatus ?? null,
  };
}

function requireTemperature(value: number) {
  if (
    !Number.isFinite(value) ||
    value < -100 ||
    value > 100 ||
    !Number.isInteger(value * 10)
  ) {
    throw new ConvexError(
      "Temperaturen skal være mellem -100 og 100 med højst én decimal",
    );
  }
}

async function resolveResponsibleName(
  ctx: MutationCtx,
  organizationId: string,
  responsibleUserId: string,
) {
  const adapter = getDatabaseAdapter(ctx);
  const member = await adapter.findOne<{ userId: string }>({
    model: "member",
    where: [
      { field: "organizationId", value: organizationId },
      { field: "userId", value: responsibleUserId },
    ],
  });
  if (!member) {
    throw new ConvexError("Den ansvarlige er ikke bruger i organisationen");
  }
  const user = await adapter.findOne<{ name?: string | null; email: string }>({
    model: "user",
    where: [{ field: "id", value: member.userId }],
  });
  if (!user)
    throw new ConvexError("Den ansvarlige er ikke bruger i organisationen");
  return user.name?.trim() || user.email;
}

async function prepareTransfer(
  ctx: MutationCtx,
  organizationId: string,
  args: TransferInput,
  existingTransfer?: Doc<"transfers">,
  existingItems: Doc<"transferItems">[] = [],
) {
  if (args.fromLocationId === args.toLocationId) {
    throw new ConvexError("Fra- og til-lokation skal være forskellige");
  }
  if (!Number.isFinite(args.transferredAt) || args.transferredAt <= 0) {
    throw new ConvexError("Transferdatoen er ugyldig");
  }
  if (args.transferredAt > Date.now() + MAX_FUTURE_SKEW_MS) {
    throw new ConvexError("Transferdatoen er ugyldig");
  }
  if (args.items.length === 0) {
    throw new ConvexError("Tilføj mindst én produktlinje");
  }
  if (args.items.length > MAX_TRANSFER_ITEMS) {
    throw new ConvexError("Transferen har for mange produktlinjer");
  }

  const submittedProductIds = new Set(args.items.map((item) => item.productId));
  const productTemperatures = new Map<Id<"products">, number>();
  for (const temperature of args.productTemperatures ?? []) {
    if (productTemperatures.has(temperature.productId)) {
      throw new ConvexError(
        "Et produkt må kun have én temperaturmåling",
      );
    }
    if (!submittedProductIds.has(temperature.productId)) {
      throw new ConvexError(
        "En temperaturmåling tilhører ikke transferen",
      );
    }
    requireTemperature(temperature.temperatureCelsius);
    productTemperatures.set(
      temperature.productId,
      temperature.temperatureCelsius,
    );
  }

  const confirmedDeviations = new Map<Id<"products">, number>();
  for (const confirmation of args.confirmedTemperatureDeviations ?? []) {
    if (confirmedDeviations.has(confirmation.productId)) {
      throw new ConvexError(
        "Et produkts temperaturafvigelse må kun bekræftes én gang",
      );
    }
    if (!submittedProductIds.has(confirmation.productId)) {
      throw new ConvexError(
        "En temperaturbekræftelse tilhører ikke transferen",
      );
    }
    confirmedDeviations.set(
      confirmation.productId,
      confirmation.maxTemperatureCelsius,
    );
  }

  const [fromLocation, toLocation] = await Promise.all([
    ctx.db.get("locations", args.fromLocationId),
    ctx.db.get("locations", args.toLocationId),
  ]);
  if (!fromLocation || fromLocation.organizationId !== organizationId) {
    throw new ConvexError("Lokationen blev ikke fundet");
  }
  if (!toLocation || toLocation.organizationId !== organizationId) {
    throw new ConvexError("Lokationen blev ikke fundet");
  }

  const existingByPair = new Map(
    existingItems.map((item) => [`${item.productId}:${item.unitId}`, item]),
  );
  const existingMaximumByProduct = new Map<Id<"products">, number | undefined>();
  for (const item of existingItems) {
    const existingMaximum = existingMaximumByProduct.get(item.productId);
    if (
      existingMaximumByProduct.has(item.productId) &&
      existingMaximum !== item.maxTemperatureCelsius
    ) {
      throw new ConvexError("Transferens temperaturdata er ugyldige");
    }
    existingMaximumByProduct.set(
      item.productId,
      item.maxTemperatureCelsius,
    );
  }
  const pairKeys = new Set<string>();
  const resolvedItems: Array<{
    productId: Id<"products">;
    productName: string;
    unitId: Id<"units">;
    unitName: string;
    quantity: number;
    factorToDefault?: number;
    temperatureCelsius?: number;
    maxTemperatureCelsius?: number;
  }> = [];

  for (const item of args.items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new ConvexError("Mængden skal være større end nul");
    }
    const pairKey = `${item.productId}:${item.unitId}`;
    if (pairKeys.has(pairKey)) {
      throw new ConvexError("Hver produktlinje kan kun tilføjes én gang");
    }
    pairKeys.add(pairKey);

    const product = await ctx.db.get("products", item.productId);
    const productUnit =
      product?.organizationId === organizationId && product.status === "active"
        ? await ctx.db
            .query("productUnits")
            .withIndex("by_organizationId_and_productId_and_unitId", (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("productId", item.productId)
                .eq("unitId", item.unitId),
            )
            .unique()
        : null;
    const unit = productUnit ? await ctx.db.get("units", item.unitId) : null;
    const existingItem = existingByPair.get(pairKey);
    const hasExistingProduct = existingMaximumByProduct.has(item.productId);

    if (
      product &&
      product.organizationId === organizationId &&
      product.status === "active" &&
      productUnit &&
      unit &&
      unit.organizationId === organizationId
    ) {
      resolvedItems.push({
        productId: product._id,
        productName: product.name,
        unitId: unit._id,
        unitName: unit.name,
        quantity: item.quantity,
        factorToDefault: productUnit.factorToDefault,
        temperatureCelsius: productTemperatures.get(product._id),
        maxTemperatureCelsius:
          hasExistingProduct
            ? existingMaximumByProduct.get(item.productId)
            : product.maxTemperatureCelsius,
      });
    } else if (existingItem) {
      resolvedItems.push({
        productId: existingItem.productId,
        productName: existingItem.productName,
        unitId: existingItem.unitId,
        unitName: existingItem.unitName,
        quantity: item.quantity,
        factorToDefault: existingItem.factorToDefault,
        temperatureCelsius: productTemperatures.get(item.productId),
        maxTemperatureCelsius: existingMaximumByProduct.get(item.productId),
      });
    } else {
      throw new ConvexError("Produktet eller enheden blev ikke fundet");
    }
  }

  const temperaturesByProduct = new Map<Id<"products">, TemperatureSnapshot>();
  for (const item of resolvedItems) {
    temperaturesByProduct.set(item.productId, {
      temperatureCelsius: item.temperatureCelsius,
      maxTemperatureCelsius: item.maxTemperatureCelsius,
    });
  }
  const deviatingProducts = new Map<Id<"products">, number>();
  for (const [productId, snapshot] of temperaturesByProduct) {
    if (
      snapshot.maxTemperatureCelsius !== undefined &&
      snapshot.temperatureCelsius === undefined
    ) {
      throw new ConvexError(
        "Temperaturen skal udfyldes for alle temperatursporede produkter",
      );
    }
    if (
      snapshot.temperatureCelsius !== undefined &&
      snapshot.maxTemperatureCelsius !== undefined &&
      snapshot.temperatureCelsius > snapshot.maxTemperatureCelsius
    ) {
      deviatingProducts.set(productId, snapshot.maxTemperatureCelsius);
    }
  }

  let comment: string | undefined;
  if (args.comment !== undefined) {
    const trimmed = args.comment.trim();
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      throw new ConvexError(
        `Kommentaren må højst være ${MAX_COMMENT_LENGTH} tegn`,
      );
    }
    comment = trimmed || undefined;
  }

  if (deviatingProducts.size > 0 && comment === undefined) {
    throw new ConvexError(
      "Tilføj en kommentar til temperaturafvigelsen",
    );
  }
  for (const [productId, confirmedMaximum] of confirmedDeviations) {
    const actualMaximum = deviatingProducts.get(productId);
    if (actualMaximum === undefined) {
      throw new ConvexError("Temperaturbekræftelsen er ikke længere gyldig");
    }
    if (confirmedMaximum !== actualMaximum) {
      throw new ConvexError(
        "Maksimumtemperaturen er ændret. Gennemgå afvigelsen igen",
      );
    }
  }
  for (const productId of deviatingProducts.keys()) {
    if (!confirmedDeviations.has(productId)) {
      throw new ConvexError("Bekræft alle temperaturafvigelser");
    }
  }

  const responsibleName =
    existingTransfer?.responsibleUserId === args.responsibleUserId
      ? existingTransfer.responsibleName
      : await resolveResponsibleName(
          ctx,
          organizationId,
          args.responsibleUserId,
        );

  return { comment, responsibleName, resolvedItems };
}

async function applyTransferStock(
  ctx: MutationCtx,
  organizationId: string,
  fromLocationId: Id<"locations">,
  toLocationId: Id<"locations">,
  items: Array<{
    productId: Id<"products">;
    quantity: number;
    factorToDefault?: number;
  }>,
  direction: 1 | -1,
) {
  for (const item of items) {
    const product = await ctx.db.get("products", item.productId);
    if (!product || product.organizationId !== organizationId) continue;
    if (item.factorToDefault === undefined) {
      throw new ConvexError("Transferens lageromregning mangler");
    }
    const delta = normalizeStock(
      item.quantity * item.factorToDefault * direction,
    );
    await addStock(ctx, organizationId, fromLocationId, item.productId, -delta);
    await addStock(ctx, organizationId, toLocationId, item.productId, delta);
  }
}

function validateDateRange(startAt: number, endAt: number) {
  if (
    !Number.isFinite(startAt) ||
    !Number.isFinite(endAt) ||
    startAt <= 0 ||
    endAt <= 0 ||
    startAt > endAt
  ) {
    throw new ConvexError("Perioden er ugyldig");
  }
}

export const createTransfer = mutation({
  args: transferArgsValidator.fields,
  returns: v.id("transfers"),
  handler: async (ctx, args) => {
    const { organizationId, userIdentifier } = await requireTransferManager(
      ctx,
      "transfers.new",
    );
    await requireLocationsUnlocked(ctx, organizationId, [
      args.fromLocationId,
      args.toLocationId,
    ]);
    const { comment, responsibleName, resolvedItems } = await prepareTransfer(
      ctx,
      organizationId,
      args,
    );
    const summaryTimeZone = await dashboardSummaryTimeZone(ctx, organizationId);
    const aggregates = transferAggregates(resolvedItems);

    const transferId = await ctx.db.insert("transfers", {
      organizationId,
      fromLocationId: args.fromLocationId,
      toLocationId: args.toLocationId,
      responsibleUserId: args.responsibleUserId,
      responsibleName,
      comment,
      transferredAt: args.transferredAt,
      createdBy: userIdentifier,
      stockApplied: false,
      receiptStatus: "pending",
      ...aggregates,
      dashboardSummaryTimeZone: summaryTimeZone,
    });

    for (const item of resolvedItems) {
      await ctx.db.insert("transferItems", {
        organizationId,
        transferId,
        productId: item.productId,
        productName: item.productName,
        unitId: item.unitId,
        unitName: item.unitName,
        quantity: item.quantity,
        factorToDefault: item.factorToDefault,
        temperatureCelsius: item.temperatureCelsius,
        maxTemperatureCelsius: item.maxTemperatureCelsius,
      });
    }

    const transfer = await ctx.db.get("transfers", transferId);
    if (transfer) {
      await reconcileDashboardSummary(
        ctx,
        "transfers",
        null,
        transfer,
        summaryTimeZone,
        undefined,
        resolvedItems,
      );
    }

    return transferId;
  },
});

export const updateTransfer = mutation({
  args: {
    transferId: v.id("transfers"),
    ...transferArgsValidator.fields,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireTransferManager(
      ctx,
      "transfers.history",
    );
    const transfer = await ctx.db.get("transfers", args.transferId);
    if (!transfer || transfer.organizationId !== organizationId) {
      throw new ConvexError("Transferen blev ikke fundet");
    }
    if (transfer.receiptStatus === "registered") {
      throw new ConvexError(
        "Transferen er modtaget og kan ikke redigeres",
      );
    }
    await requireLocationsUnlocked(ctx, organizationId, [
      transfer.fromLocationId,
      transfer.toLocationId,
      args.fromLocationId,
      args.toLocationId,
    ]);

    const existingItems = await ctx.db
      .query("transferItems")
      .withIndex("by_organizationId_and_transferId", (q) =>
        q.eq("organizationId", organizationId).eq("transferId", transfer._id),
      )
      .take(MAX_TRANSFER_ITEMS + 1);
    if (existingItems.length > MAX_TRANSFER_ITEMS) {
      throw new ConvexError("Transferen har for mange produktlinjer");
    }

    const { comment, responsibleName, resolvedItems } = await prepareTransfer(
      ctx,
      organizationId,
      args,
      transfer,
      existingItems,
    );
    const summaryTimeZone = await dashboardSummaryTimeZone(ctx, organizationId);
    const aggregates = transferAggregates(resolvedItems);

    // ponytail: pre-ledger transfers stay neutral; the next submitted count establishes their baseline.
    if (transfer.stockApplied) {
      await applyTransferStock(
        ctx,
        organizationId,
        transfer.fromLocationId,
        transfer.toLocationId,
        existingItems,
        -1,
      );
      await applyTransferStock(
        ctx,
        organizationId,
        args.fromLocationId,
        args.toLocationId,
        resolvedItems,
        1,
      );
    }

    await ctx.db.patch("transfers", transfer._id, {
      fromLocationId: args.fromLocationId,
      toLocationId: args.toLocationId,
      responsibleUserId: args.responsibleUserId,
      responsibleName,
      comment,
      transferredAt: args.transferredAt,
      ...aggregates,
      dashboardSummaryTimeZone: summaryTimeZone,
    });
    for (const item of existingItems) {
      await ctx.db.delete("transferItems", item._id);
    }
    for (const item of resolvedItems) {
      await ctx.db.insert("transferItems", {
        organizationId,
        transferId: transfer._id,
        productId: item.productId,
        productName: item.productName,
        unitId: item.unitId,
        unitName: item.unitName,
        quantity: item.quantity,
        factorToDefault: item.factorToDefault,
        temperatureCelsius: item.temperatureCelsius,
        maxTemperatureCelsius: item.maxTemperatureCelsius,
      });
    }

    await reconcileDashboardSummary(
      ctx,
      "transfers",
      transfer,
      {
        ...transfer,
        fromLocationId: args.fromLocationId,
        toLocationId: args.toLocationId,
        responsibleUserId: args.responsibleUserId,
        responsibleName,
        comment,
        transferredAt: args.transferredAt,
        ...aggregates,
        dashboardSummaryTimeZone: summaryTimeZone,
      },
      summaryTimeZone,
      existingItems,
      resolvedItems,
    );

    return null;
  },
});

export const deleteTransfer = mutation({
  args: { transferId: v.id("transfers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireTransferManager(
      ctx,
      "transfers.history",
    );
    const transfer = await ctx.db.get("transfers", args.transferId);
    if (!transfer || transfer.organizationId !== organizationId) {
      throw new ConvexError("Transferen blev ikke fundet");
    }
    if (transfer.receiptStatus === "registered") {
      throw new ConvexError("Transferen er modtaget og kan ikke slettes");
    }
    await requireLocationsUnlocked(ctx, organizationId, [
      transfer.fromLocationId,
      transfer.toLocationId,
    ]);

    const items = await ctx.db
      .query("transferItems")
      .withIndex("by_organizationId_and_transferId", (q) =>
        q.eq("organizationId", organizationId).eq("transferId", transfer._id),
      )
      .take(MAX_TRANSFER_ITEMS + 1);
    if (items.length > MAX_TRANSFER_ITEMS) {
      throw new ConvexError("Transferen har for mange produktlinjer");
    }
    await reconcileDashboardSummary(
      ctx,
      "transfers",
      transfer,
      null,
      transfer.dashboardSummaryTimeZone ?? "Europe/Copenhagen",
      items,
    );
    if (transfer.stockApplied) {
      await applyTransferStock(
        ctx,
        organizationId,
        transfer.fromLocationId,
        transfer.toLocationId,
        items,
        -1,
      );
    }
    for (const item of items) {
      await ctx.db.delete("transferItems", item._id);
    }
    await ctx.db.delete("transfers", transfer._id);
    return null;
  },
});

export const requestAggregateBackfill = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { organizationId } = await requireTransferViewer(
      ctx,
      "transfers.history",
    );
    await requestDashboardSummaryRebuild(ctx, organizationId, ["transfers"]);
    return null;
  },
});

export const listTransfers = query({
  args: {
    paginationOpts: paginationOptsValidator,
    startAt: v.number(),
    endAt: v.number(),
  },
  returns: paginationResultValidator(transferHeaderValidator),
  handler: async (ctx, args) => {
    const { organizationId } = await requireTransferViewer(
      ctx,
      "transfers.history",
    );
    validateDateRange(args.startAt, args.endAt);
    requirePageSize(args.paginationOpts.numItems, MAX_PUBLIC_PAGE_SIZE);
    const results = await ctx.db
      .query("transfers")
      .withIndex("by_organizationId_and_transferredAt", (q) =>
        q
          .eq("organizationId", organizationId)
          .gte("transferredAt", args.startAt)
          .lte("transferredAt", args.endAt),
      )
      .order("desc")
      .paginate(args.paginationOpts);
    const locationIds = [
      ...new Set(
        results.page.flatMap((transfer) => [
          transfer.fromLocationId,
          transfer.toLocationId,
        ]),
      ),
    ];
    const locations = await Promise.all(
      locationIds.map((locationId) => ctx.db.get("locations", locationId)),
    );
    const locationNames = new Map(
      locationIds.map((locationId, index) => [
        locationId,
        locations[index]?.name ?? "Ukendt lokation",
      ] as const),
    );

    return {
      ...results,
      page: await Promise.all(
        results.page.map((transfer) =>
          hydrateTransferHeader(ctx, transfer, undefined, locationNames),
        ),
      ),
    };
  },
});

export const getTransfer = query({
  args: { transferId: v.id("transfers") },
  returns: v.union(transferDetailValidator, v.null()),
  handler: async (ctx, args) => {
    const { organizationId } = await requireTransferViewer(
      ctx,
      "transfers.history",
    );
    const transfer = await ctx.db.get("transfers", args.transferId);
    if (!transfer || transfer.organizationId !== organizationId) return null;

    const items = await ctx.db
      .query("transferItems")
      .withIndex("by_organizationId_and_transferId", (q) =>
        q.eq("organizationId", organizationId).eq("transferId", transfer._id),
      )
      .take(MAX_TRANSFER_ITEMS);

    const header = await hydrateTransferHeader(ctx, transfer, items);
    return {
      ...header,
      fromLocationId: transfer.fromLocationId,
      toLocationId: transfer.toLocationId,
      responsibleUserId: transfer.responsibleUserId,
      items: items.map((item) => ({
        id: item._id,
        productId: item.productId,
        productName: item.productName,
        unitId: item.unitId,
        unitName: item.unitName,
        quantity: item.quantity,
        temperatureCelsius: item.temperatureCelsius ?? null,
        maxTemperatureCelsius: item.maxTemperatureCelsius ?? null,
        receivedQuantity: item.receivedQuantity ?? null,
      })),
    };
  },
});

export const searchTransferProducts = query({
  args: { search: v.string() },
  returns: v.array(productSearchOptionValidator),
  handler: async (ctx, args) => {
    const { organizationId } = await requireTransferManager(
      ctx,
      "transfers.new",
    );
    const search = args.search.trim();
    if (search.length > 100) {
      throw new ConvexError("Søgningen er for lang");
    }

    return await searchActiveProductOptions(ctx, organizationId, search);
  },
});

export const listResponsibleUsers = query({
  args: {},
  returns: v.array(responsibleUserValidator),
  handler: async (ctx) => {
    const { organizationId } = await requireTransferManager(
      ctx,
      "transfers.new",
    );
    const adapter = getDatabaseAdapter(ctx);
    const members = await adapter.findMany<{ userId: string }>({
      model: "member",
      where: [{ field: "organizationId", value: organizationId }],
      limit: 100,
    });
    const users = await Promise.all(
      members.map((member) =>
        adapter.findOne<{ id: string; name?: string | null; email: string }>({
          model: "user",
          where: [{ field: "id", value: member.userId }],
        }),
      ),
    );
    return members.flatMap((member, index) => {
      const user = users[index];
      return user
        ? [{ id: member.userId, name: user.name?.trim() || user.email }]
        : [];
    });
  },
});

export const getTransferProductOption = query({
  args: { productId: v.id("products") },
  returns: v.union(productOptionValidator, v.null()),
  handler: async (ctx, args) => {
    const { organizationId } = await requireTransferManager(ctx, [
      "transfers.new",
      "transfers.history",
    ]);
    const product = await ctx.db.get("products", args.productId);
    if (
      !product ||
      product.organizationId !== organizationId ||
      product.status !== "active"
    ) {
      return null;
    }

    const productUnits = await ctx.db
      .query("productUnits")
      .withIndex("by_organizationId_and_productId", (q) =>
        q.eq("organizationId", organizationId).eq("productId", product._id),
      )
      .take(MAX_PRODUCT_UNITS + 1);
    if (productUnits.length > MAX_PRODUCT_UNITS) {
      throw new ConvexError("Produktet har for mange enheder");
    }

    const units = await Promise.all(
      productUnits.map((productUnit) =>
        ctx.db.get("units", productUnit.unitId),
      ),
    );
    const imageUrl = product.imageStorageId
      ? await ctx.storage.getUrl(product.imageStorageId)
      : null;

    return {
      id: product._id,
      name: product.name,
      imageUrl,
      defaultUnitId: product.defaultUnitId,
      maxTemperatureCelsius: product.maxTemperatureCelsius ?? null,
      units: productUnits.flatMap((productUnit, index) => {
        const unit = units[index];
        return unit?.organizationId === organizationId
          ? [{ id: unit._id, name: unit.name }]
          : [];
      }),
    };
  },
});

export const exportTransfers = query({
  args: {
    paginationOpts: paginationOptsValidator,
    startAt: v.number(),
    endAt: v.number(),
    inDefaultUnit: v.optional(v.boolean()),
  },
  returns: paginationResultValidator(exportTransferValidator),
  handler: async (ctx, args) => {
    const auth = await requireTransferViewer(ctx, "transfers.history");
    if (!auth.permissions.has("transfers.export")) {
      throw new ConvexError("Du har ikke adgang");
    }
    const { organizationId } = auth;
    validateDateRange(args.startAt, args.endAt);
    requirePageSize(args.paginationOpts.numItems, EXPORT_PAGE_SIZE);
    if (
      args.paginationOpts.numItems !== EXPORT_PAGE_SIZE ||
      args.paginationOpts.maximumRowsRead !== EXPORT_PAGE_SIZE
    ) {
      throw new ConvexError("Eksportsiden er for stor");
    }
    const factors = new Map<string, number | null>();
    const defaultUnitNames = new Map<Id<"products">, string | null>();

    // Falls back to the snapshotted unit when the product or its unit row is gone.
    async function inDefaultUnit(item: Doc<"transferItems">) {
      const pairKey = `${item.productId}:${item.unitId}`;
      let factor = factors.get(pairKey);
      if (factor === undefined) {
        factor = await toDefaultUnit(
          ctx,
          organizationId,
          item.productId,
          item.unitId,
          1,
        );
        factors.set(pairKey, factor);
      }

      let unitName = defaultUnitNames.get(item.productId);
      if (unitName === undefined) {
        const product = await ctx.db.get("products", item.productId);
        const unit = product
          ? await ctx.db.get("units", product.defaultUnitId)
          : null;
        unitName = unit?.name ?? null;
        defaultUnitNames.set(item.productId, unitName);
      }

      if (factor === null || unitName === null) {
        return { unitName: item.unitName, quantity: item.quantity };
      }
      return {
        unitName,
        quantity: Math.round(item.quantity * factor * 1e6) / 1e6,
      };
    }

    const transfers = await ctx.db
      .query("transfers")
      .withIndex("by_organizationId_and_transferredAt", (q) =>
        q
          .eq("organizationId", organizationId)
          .gte("transferredAt", args.startAt)
          .lte("transferredAt", args.endAt),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...transfers,
      page: await Promise.all(
        transfers.page.map(async (transfer) => {
          const [fromLocationName, toLocationName, items] = await Promise.all([
            locationName(ctx, transfer.fromLocationId),
            locationName(ctx, transfer.toLocationId),
            ctx.db
              .query("transferItems")
              .withIndex("by_organizationId_and_transferId", (q) =>
                q
                  .eq("organizationId", organizationId)
                  .eq("transferId", transfer._id),
              )
              .take(MAX_TRANSFER_ITEMS),
          ]);

          return {
            rows: await Promise.all(
              items.map(async (item) => {
                const measured = args.inDefaultUnit
                  ? await inDefaultUnit(item)
                  : { unitName: item.unitName, quantity: item.quantity };
                return {
                  transferredAt: transfer.transferredAt,
                  fromLocationName,
                  toLocationName,
                  responsibleName: transfer.responsibleName,
                  productName: item.productName,
                  unitName: measured.unitName,
                  quantity: measured.quantity,
                  temperatureCelsius: item.temperatureCelsius ?? null,
                  maxTemperatureCelsius:
                    item.maxTemperatureCelsius ?? null,
                  temperatureDeviation:
                    item.temperatureCelsius !== undefined &&
                    item.maxTemperatureCelsius !== undefined &&
                    item.temperatureCelsius > item.maxTemperatureCelsius,
                  comment: transfer.comment ?? null,
                };
              }),
            ),
          };
        }),
      ),
    };
  },
});
