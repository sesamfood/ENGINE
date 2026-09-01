import { ConvexError, type Infer, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { recordAudit } from "./lib/audit";
import {
  requireGoodsReceiptRegistrar,
  requireGoodsReceiptSettings,
  requireLocationAccess,
} from "./lib/auth";
import { requireOtherFeaturesUnlocked } from "./lib/countLock";
import {
  dashboardSummaryTimeZone,
  reconcileDashboardSummary,
} from "./lib/dashboardSummaries";
import { getLocationProductAccess } from "./lib/locationProducts";
import {
  activeProductCatalogValidator,
  listLocationActiveProductCatalog,
} from "./lib/productCatalog";
import { addStock, normalizeStock } from "./lib/stock";
import { transferAggregates } from "./lib/transferAggregates";

const MAX_TRANSFER_ITEMS = 200;
const MAX_MANUAL_RECEIPT_ITEMS = 200;
const MAX_PENDING_TRANSFERS = 100;
const MAX_COMMENT_LENGTH = 500;
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const settingsValidator = v.object({
  transferDeliveryNotePhotoEnabled: v.boolean(),
});

const pendingTransferValidator = v.object({
  id: v.id("transfers"),
  transferredAt: v.number(),
  fromLocationName: v.string(),
  toLocationName: v.string(),
  responsibleName: v.string(),
  comment: v.union(v.string(), v.null()),
  itemCount: v.number(),
  totalQuantity: v.number(),
});

const receiptItemValidator = v.object({
  id: v.id("transferItems"),
  productId: v.id("products"),
  productName: v.string(),
  imageUrl: v.union(v.string(), v.null()),
  unitId: v.id("units"),
  unitName: v.string(),
  quantity: v.number(),
  factorToDefault: v.number(),
});

const receiptDetailValidator = v.union(
  v.object({
    kind: v.literal("pending"),
    transfer: pendingTransferValidator.extend({
      items: v.array(receiptItemValidator),
    }),
    products: v.array(activeProductCatalogValidator),
    settings: settingsValidator,
  }),
  v.object({ kind: v.literal("registered") }),
  v.null(),
);

const receiptItemInputValidator = v.object({
  transferItemId: v.id("transferItems"),
  unitId: v.id("units"),
  quantity: v.number(),
});

const catalogReceiptItemInputValidator = v.object({
  productId: v.id("products"),
  unitId: v.id("units"),
  quantity: v.number(),
});

const manualReceiptOptionsValidator = v.object({
  locationName: v.string(),
  products: v.array(activeProductCatalogValidator),
});

type GoodsReceiptCtx = QueryCtx | MutationCtx;
type CatalogReceiptItemInput = Infer<typeof catalogReceiptItemInputValidator>;
type TransferReceiptItemInput = Infer<typeof receiptItemInputValidator>;

async function settingsFor(ctx: GoodsReceiptCtx, organizationId: string) {
  const settings = await ctx.db
    .query("goodsReceiptSettings")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .unique();
  return {
    transferDeliveryNotePhotoEnabled:
      settings?.transferDeliveryNotePhotoEnabled ?? false,
  };
}

async function validateUnusedDeliveryNote(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
) {
  const [file, transfer, manualReceipt] = await Promise.all([
    ctx.db.system.get("_storage", storageId),
    ctx.db
      .query("transfers")
      .withIndex("by_deliveryNoteStorageId", (q) =>
        q.eq("deliveryNoteStorageId", storageId),
      )
      .unique(),
    ctx.db
      .query("manualGoodsReceipts")
      .withIndex("by_deliveryNoteStorageId", (q) =>
        q.eq("deliveryNoteStorageId", storageId),
      )
      .unique(),
  ]);
  if (transfer || manualReceipt) {
    throw new ConvexError("Billedet er allerede knyttet til en registrering");
  }
  if (
    !file?.contentType ||
    !IMAGE_TYPES.has(file.contentType) ||
    file.size > MAX_PHOTO_SIZE
  ) {
    throw new ConvexError(
      "Brug et JPEG-, PNG-, WebP- eller AVIF-billede på højst 10 MB",
    );
  }
}

async function resolveCatalogReceiptItems({
  ctx,
  organizationId,
  locationId,
  items,
  existingPairKeys = new Set<string>(),
}: {
  ctx: MutationCtx;
  organizationId: string;
  locationId: Id<"locations">;
  items: CatalogReceiptItemInput[];
  existingPairKeys?: ReadonlySet<string>;
}) {
  const productAccess = await getLocationProductAccess(
    ctx,
    organizationId,
    locationId,
  );
  const pairKeys = new Set(existingPairKeys);
  const resolvedItems: Array<{
    productId: Id<"products">;
    productName: string;
    unitId: Id<"units">;
    unitName: string;
    quantity: number;
    factorToDefault: number;
    defaultQuantity: number;
  }> = [];

  for (const item of items) {
    if (
      productAccess.kind === "selected" &&
      !productAccess.effectiveProductIds.has(item.productId)
    ) {
      throw new ConvexError("Produktet bruges ikke på den valgte lokation");
    }
    const quantity = normalizeStock(item.quantity);
    if (!Number.isFinite(item.quantity) || quantity <= 0) {
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
    if (
      !product ||
      product.organizationId !== organizationId ||
      product.status !== "active" ||
      !productUnit ||
      !unit ||
      unit.organizationId !== organizationId
    ) {
      throw new ConvexError("Produktet eller enheden blev ikke fundet");
    }

    const defaultQuantity = normalizeStock(
      quantity * productUnit.factorToDefault,
    );
    if (defaultQuantity <= 0) {
      throw new ConvexError("Produktets lageromregning er ugyldig");
    }
    resolvedItems.push({
      productId: product._id,
      productName: product.name,
      unitId: unit._id,
      unitName: unit.name,
      quantity,
      factorToDefault: productUnit.factorToDefault,
      defaultQuantity,
    });
  }

  return resolvedItems;
}

async function resolveTransferReceiptItems({
  ctx,
  organizationId,
  currentItems,
  items,
}: {
  ctx: MutationCtx;
  organizationId: string;
  currentItems: Doc<"transferItems">[];
  items: TransferReceiptItemInput[];
}) {
  const submitted = new Map<Id<"transferItems">, TransferReceiptItemInput>();
  for (const item of items) {
    if (submitted.has(item.transferItemId)) {
      throw new ConvexError("Hver produktlinje må kun registreres én gang");
    }
    submitted.set(item.transferItemId, item);
  }

  const pairKeys = new Set<string>();
  const resolvedItems: Array<{
    item: Doc<"transferItems">;
    unitId: Id<"units">;
    unitName: string;
    quantity: number;
    factorToDefault: number;
    defaultQuantity: number;
  }> = [];

  for (const item of currentItems) {
    const input = submitted.get(item._id);
    if (!input) {
      throw new ConvexError(
        "Transferen er ændret. Genindlæs varemodtagelsen og prøv igen",
      );
    }
    if (
      item.factorToDefault === undefined ||
      !Number.isFinite(item.factorToDefault) ||
      item.factorToDefault <= 0
    ) {
      throw new ConvexError("Transferens lageromregning mangler");
    }

    let unitId = item.unitId;
    let unitName = item.unitName;
    let factorToDefault = item.factorToDefault;
    if (input.unitId !== item.unitId) {
      const productUnit = await ctx.db
        .query("productUnits")
        .withIndex("by_organizationId_and_productId_and_unitId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("productId", item.productId)
            .eq("unitId", input.unitId),
        )
        .unique();
      const unit = productUnit ? await ctx.db.get("units", input.unitId) : null;
      if (
        !productUnit ||
        !unit ||
        unit.organizationId !== organizationId ||
        !Number.isFinite(productUnit.factorToDefault) ||
        productUnit.factorToDefault <= 0
      ) {
        throw new ConvexError("Produktet eller enheden blev ikke fundet");
      }
      unitId = unit._id;
      unitName = unit.name;
      factorToDefault = productUnit.factorToDefault;
    }

    const pairKey = `${item.productId}:${unitId}`;
    if (pairKeys.has(pairKey)) {
      throw new ConvexError("Hver produktlinje må kun registreres én gang");
    }
    pairKeys.add(pairKey);

    const quantity = normalizeStock(input.quantity);
    const sentDefaultQuantity = normalizeStock(
      item.quantity * item.factorToDefault,
    );
    const defaultQuantity = normalizeStock(quantity * factorToDefault);
    if (
      !Number.isFinite(input.quantity) ||
      quantity < 0 ||
      defaultQuantity < 0 ||
      defaultQuantity > sentDefaultQuantity
    ) {
      const maximum = normalizeStock(sentDefaultQuantity / factorToDefault);
      throw new ConvexError(
        `Den modtagne mængde for ${item.productName} skal være mellem 0 og ${maximum}`,
      );
    }

    resolvedItems.push({
      item,
      unitId,
      unitName,
      quantity,
      factorToDefault,
      defaultQuantity,
    });
  }

  return resolvedItems;
}

async function locationNames(ctx: QueryCtx, transfers: Doc<"transfers">[]) {
  const locationIds = [
    ...new Set(
      transfers.flatMap((transfer) => [
        transfer.fromLocationId,
        transfer.toLocationId,
      ]),
    ),
  ];
  const locations = await Promise.all(
    locationIds.map((locationId) => ctx.db.get("locations", locationId)),
  );
  return new Map(
    locationIds.map(
      (locationId, index) =>
        [locationId, locations[index]?.name ?? "Ukendt lokation"] as const,
    ),
  );
}

function pendingTransfer(
  transfer: Doc<"transfers">,
  names: ReadonlyMap<Id<"locations">, string>,
) {
  return {
    id: transfer._id,
    transferredAt: transfer.transferredAt,
    fromLocationName: names.get(transfer.fromLocationId) ?? "Ukendt lokation",
    toLocationName: names.get(transfer.toLocationId) ?? "Ukendt lokation",
    responsibleName: transfer.responsibleName,
    comment: transfer.comment ?? null,
    itemCount: transfer.itemCount ?? 0,
    totalQuantity: transfer.totalQuantity ?? 0,
  };
}

export const listPendingTransfers = query({
  args: { locationId: v.id("locations") },
  returns: v.object({
    transfers: v.array(pendingTransferValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const auth = await requireGoodsReceiptRegistrar(ctx);
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    const rows = await ctx.db
      .query("transfers")
      .withIndex(
        "by_organizationId_toLocationId_receiptStatus_transferredAt",
        (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("toLocationId", args.locationId)
            .eq("receiptStatus", "pending"),
      )
      .order("asc")
      .take(MAX_PENDING_TRANSFERS + 1);

    const visibleRows = rows.slice(0, MAX_PENDING_TRANSFERS);
    const names = await locationNames(ctx, visibleRows);
    return {
      transfers: visibleRows.map((transfer) =>
        pendingTransfer(transfer, names),
      ),
      truncated: rows.length > MAX_PENDING_TRANSFERS,
    };
  },
});

export const getTransferReceipt = query({
  args: { transferId: v.string() },
  returns: receiptDetailValidator,
  handler: async (ctx, args) => {
    const auth = await requireGoodsReceiptRegistrar(ctx);
    const transferId = ctx.db.normalizeId("transfers", args.transferId);
    if (!transferId) return null;

    const transfer = await ctx.db.get("transfers", transferId);
    if (!transfer || transfer.organizationId !== auth.organizationId) {
      return null;
    }
    if (transfer.receiptStatus === "registered") {
      requireLocationAccess(auth, transfer.toLocationId);
      return { kind: "registered" } as const;
    }
    if (transfer.receiptStatus !== "pending") return null;
    requireLocationAccess(auth, transfer.toLocationId);

    const items = await ctx.db
      .query("transferItems")
      .withIndex("by_organizationId_and_transferId", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("transferId", transfer._id),
      )
      .take(MAX_TRANSFER_ITEMS + 1);
    if (items.length > MAX_TRANSFER_ITEMS) {
      throw new ConvexError("Transferen har for mange produktlinjer");
    }

    const [products, productCatalog] = await Promise.all([
      Promise.all(
        [...new Set(items.map((item) => item.productId))].map((productId) =>
          ctx.db.get("products", productId),
        ),
      ),
      listLocationActiveProductCatalog(
        ctx,
        auth.organizationId,
        transfer.toLocationId,
      ),
    ]);
    const imageUrls = new Map<Id<"products">, string | null>();
    for (const product of products) {
      if (!product || product.organizationId !== auth.organizationId) continue;
      imageUrls.set(
        product._id,
        product.imageStorageId
          ? await ctx.storage.getUrl(product.imageStorageId)
          : null,
      );
    }

    const names = await locationNames(ctx, [transfer]);
    return {
      kind: "pending",
      transfer: {
        ...pendingTransfer(transfer, names),
        items: items.map((item) => {
          if (
            item.factorToDefault === undefined ||
            !Number.isFinite(item.factorToDefault) ||
            item.factorToDefault <= 0
          ) {
            throw new ConvexError("Transferens lageromregning mangler");
          }
          return {
            id: item._id,
            productId: item.productId,
            productName: item.productName,
            imageUrl: imageUrls.get(item.productId) ?? null,
            unitId: item.unitId,
            unitName: item.unitName,
            quantity: item.quantity,
            factorToDefault: item.factorToDefault,
          };
        }),
      },
      products: productCatalog,
      settings: await settingsFor(ctx, auth.organizationId),
    } as const;
  },
});

export const generatePhotoUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const { organizationId } = await requireGoodsReceiptRegistrar(ctx);
    const settings = await settingsFor(ctx, organizationId);
    if (!settings.transferDeliveryNotePhotoEnabled) {
      throw new ConvexError(
        "Billeder af følgesedler er ikke aktiveret for transfers",
      );
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const generateManualPhotoUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireGoodsReceiptRegistrar(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const registerTransferReceipt = mutation({
  args: {
    transferId: v.id("transfers"),
    items: v.array(receiptItemInputValidator),
    additionalItems: v.optional(v.array(catalogReceiptItemInputValidator)),
    comment: v.optional(v.string()),
    deliveryNoteStorageId: v.optional(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireGoodsReceiptRegistrar(ctx);
    const { organizationId, userIdentifier, userName } = auth;
    const transfer = await ctx.db.get("transfers", args.transferId);
    if (!transfer || transfer.organizationId !== organizationId) {
      throw new ConvexError("Transferen blev ikke fundet");
    }
    requireLocationAccess(auth, transfer.toLocationId);
    if (transfer.receiptStatus !== "pending" || transfer.stockApplied) {
      throw new ConvexError("Transferen er allerede modtaget");
    }
    await requireOtherFeaturesUnlocked(
      ctx,
      organizationId,
      transfer.fromLocationId,
    );
    await requireOtherFeaturesUnlocked(
      ctx,
      organizationId,
      transfer.toLocationId,
    );

    const currentItems = await ctx.db
      .query("transferItems")
      .withIndex("by_organizationId_and_transferId", (q) =>
        q.eq("organizationId", organizationId).eq("transferId", transfer._id),
      )
      .take(MAX_TRANSFER_ITEMS + 1);
    const additionalItems = args.additionalItems ?? [];
    if (
      currentItems.length > MAX_TRANSFER_ITEMS ||
      args.items.length !== currentItems.length
    ) {
      throw new ConvexError(
        "Transferen er ændret. Genindlæs varemodtagelsen og prøv igen",
      );
    }
    if (currentItems.length + additionalItems.length > MAX_TRANSFER_ITEMS) {
      throw new ConvexError("Transferen har for mange produktlinjer");
    }

    const receivedItems = await resolveTransferReceiptItems({
      ctx,
      organizationId,
      currentItems,
      items: args.items,
    });
    const resolvedAdditionalItems = await resolveCatalogReceiptItems({
      ctx,
      organizationId,
      locationId: transfer.toLocationId,
      items: additionalItems,
      existingPairKeys: new Set([
        ...currentItems.map((item) => `${item.productId}:${item.unitId}`),
        ...receivedItems.map(
          ({ item, unitId }) => `${item.productId}:${unitId}`,
        ),
      ]),
    });

    const comment = args.comment?.trim() || undefined;
    if (comment && comment.length > MAX_COMMENT_LENGTH) {
      throw new ConvexError("Kommentaren må højst være 500 tegn");
    }

    if (args.deliveryNoteStorageId) {
      const settings = await settingsFor(ctx, organizationId);
      if (!settings.transferDeliveryNotePhotoEnabled) {
        throw new ConvexError(
          "Billeder af følgesedler er ikke aktiveret for transfers",
        );
      }
      await validateUnusedDeliveryNote(ctx, args.deliveryNoteStorageId);
    }

    for (const {
      item,
      unitId,
      unitName,
      quantity,
      factorToDefault,
      defaultQuantity,
    } of receivedItems) {
      const product = await ctx.db.get("products", item.productId);
      if (!product || product.organizationId !== organizationId) {
        throw new ConvexError("Produktet blev ikke fundet");
      }
      if (defaultQuantity !== 0) {
        await addStock(
          ctx,
          organizationId,
          transfer.fromLocationId,
          item.productId,
          -defaultQuantity,
        );
        await addStock(
          ctx,
          organizationId,
          transfer.toLocationId,
          item.productId,
          defaultQuantity,
        );
      }
      await ctx.db.patch("transferItems", item._id, {
        receivedQuantity: quantity,
        receivedUnitId: unitId,
        receivedUnitName: unitName,
        receivedFactorToDefault: factorToDefault,
      });
    }

    for (const item of resolvedAdditionalItems) {
      await addStock(
        ctx,
        organizationId,
        transfer.fromLocationId,
        item.productId,
        -item.defaultQuantity,
      );
      await addStock(
        ctx,
        organizationId,
        transfer.toLocationId,
        item.productId,
        item.defaultQuantity,
      );
      await ctx.db.insert("transferItems", {
        organizationId,
        transferId: transfer._id,
        productId: item.productId,
        productName: item.productName,
        unitId: item.unitId,
        unitName: item.unitName,
        quantity: item.quantity,
        factorToDefault: item.factorToDefault,
        receivedQuantity: item.quantity,
        receivedUnitId: item.unitId,
        receivedUnitName: item.unitName,
        receivedFactorToDefault: item.factorToDefault,
      });
    }

    const receiptUpdate = {
      stockApplied: true,
      receiptStatus: "registered",
      receiptRegisteredAt: Date.now(),
      receiptRegisteredBy: userIdentifier,
      receiptRegisteredByName: userName,
      receiptComment: comment,
      deliveryNoteStorageId: args.deliveryNoteStorageId,
    } satisfies Partial<Doc<"transfers">>;

    if (resolvedAdditionalItems.length === 0) {
      await ctx.db.patch("transfers", transfer._id, receiptUpdate);
      return null;
    }

    const summaryTimeZone = await dashboardSummaryTimeZone(ctx, organizationId);
    const nextItems = [...currentItems, ...resolvedAdditionalItems];
    const aggregates = transferAggregates(nextItems);
    const nextTransfer = {
      ...transfer,
      ...receiptUpdate,
      ...aggregates,
      dashboardSummaryTimeZone: summaryTimeZone,
    };
    await ctx.db.patch("transfers", transfer._id, {
      ...receiptUpdate,
      ...aggregates,
      dashboardSummaryTimeZone: summaryTimeZone,
    });
    await reconcileDashboardSummary(
      ctx,
      "transfers",
      transfer,
      nextTransfer,
      summaryTimeZone,
      currentItems,
      nextItems,
    );
    return null;
  },
});

export const getManualReceiptOptions = query({
  args: { locationId: v.id("locations") },
  returns: manualReceiptOptionsValidator,
  handler: async (ctx, args) => {
    const auth = await requireGoodsReceiptRegistrar(ctx);
    requireLocationAccess(auth, args.locationId);
    const location = await ctx.db.get("locations", args.locationId);
    if (!location || location.organizationId !== auth.organizationId) {
      throw new ConvexError("Lokationen blev ikke fundet");
    }

    return {
      locationName: location.name,
      products: await listLocationActiveProductCatalog(
        ctx,
        auth.organizationId,
        location._id,
      ),
    };
  },
});

export const createManualReceipt = mutation({
  args: {
    locationId: v.id("locations"),
    receivedAt: v.number(),
    comment: v.optional(v.string()),
    deliveryNoteStorageId: v.optional(v.id("_storage")),
    items: v.array(catalogReceiptItemInputValidator),
  },
  returns: v.id("manualGoodsReceipts"),
  handler: async (ctx, args) => {
    const auth = await requireGoodsReceiptRegistrar(ctx);
    const { organizationId, userIdentifier, userName } = auth;
    requireLocationAccess(auth, args.locationId);

    const location = await ctx.db.get("locations", args.locationId);
    if (!location || location.organizationId !== organizationId) {
      throw new ConvexError("Lokationen blev ikke fundet");
    }
    if (
      !Number.isFinite(args.receivedAt) ||
      args.receivedAt <= 0 ||
      args.receivedAt > Date.now() + MAX_FUTURE_SKEW_MS
    ) {
      throw new ConvexError("Modtagelsestidspunktet er ugyldigt");
    }
    if (args.items.length === 0) {
      throw new ConvexError("Tilføj mindst én produktlinje");
    }
    if (args.items.length > MAX_MANUAL_RECEIPT_ITEMS) {
      throw new ConvexError("Varemodtagelsen har for mange produktlinjer");
    }

    const comment = args.comment?.trim() || undefined;
    if (comment && comment.length > MAX_COMMENT_LENGTH) {
      throw new ConvexError("Kommentaren må højst være 500 tegn");
    }
    if (args.deliveryNoteStorageId) {
      await validateUnusedDeliveryNote(ctx, args.deliveryNoteStorageId);
    }

    const resolvedItems = await resolveCatalogReceiptItems({
      ctx,
      organizationId,
      locationId: location._id,
      items: args.items,
    });

    await requireOtherFeaturesUnlocked(ctx, organizationId, location._id);

    const manualGoodsReceiptId = await ctx.db.insert("manualGoodsReceipts", {
      organizationId,
      locationId: location._id,
      locationName: location.name,
      receivedAt: args.receivedAt,
      registeredAt: Date.now(),
      registeredBy: userIdentifier,
      registeredByName: userName,
      comment,
      deliveryNoteStorageId: args.deliveryNoteStorageId,
      itemCount: resolvedItems.length,
    });

    for (const item of resolvedItems) {
      await addStock(
        ctx,
        organizationId,
        location._id,
        item.productId,
        item.defaultQuantity,
      );
      await ctx.db.insert("manualGoodsReceiptItems", {
        organizationId,
        manualGoodsReceiptId,
        ...item,
      });
    }

    await recordAudit(ctx, auth, {
      action: "goodsReceipts.manualCreated",
      entityTable: "manualGoodsReceipts",
      entityId: manualGoodsReceiptId,
      summary: `Manuel varemodtagelse registreret på ${location.name}`,
      locationId: location._id,
    });

    return manualGoodsReceiptId;
  },
});

export const getSettings = query({
  args: {},
  returns: settingsValidator,
  handler: async (ctx) => {
    const { organizationId } = await requireGoodsReceiptSettings(ctx);
    return await settingsFor(ctx, organizationId);
  },
});

export const setSettings = mutation({
  args: settingsValidator.fields,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireGoodsReceiptSettings(ctx);
    const current = await ctx.db
      .query("goodsReceiptSettings")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();
    const next = {
      transferDeliveryNotePhotoEnabled: args.transferDeliveryNotePhotoEnabled,
      updatedAt: Date.now(),
    };
    if (current) {
      await ctx.db.patch("goodsReceiptSettings", current._id, next);
    } else {
      await ctx.db.insert("goodsReceiptSettings", {
        organizationId,
        ...next,
      });
    }
    return null;
  },
});
