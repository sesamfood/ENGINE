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
import { getLocationProductAccess } from "./lib/locationProducts";
import {
  activeProductCatalogValidator,
  listLocationActiveProductCatalog,
} from "./lib/productCatalog";
import { addStock, normalizeStock } from "./lib/stock";

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
  productName: v.string(),
  imageUrl: v.union(v.string(), v.null()),
  unitName: v.string(),
  quantity: v.number(),
});

const receiptDetailValidator = v.union(
  v.object({
    kind: v.literal("pending"),
    transfer: pendingTransferValidator.extend({
      items: v.array(receiptItemValidator),
    }),
    settings: settingsValidator,
  }),
  v.object({ kind: v.literal("registered") }),
  v.null(),
);

const receiptItemInputValidator = v.object({
  transferItemId: v.id("transferItems"),
  quantity: v.number(),
});

const manualReceiptItemInputValidator = v.object({
  productId: v.id("products"),
  unitId: v.id("units"),
  quantity: v.number(),
});

const manualReceiptOptionsValidator = v.object({
  locationName: v.string(),
  products: v.array(activeProductCatalogValidator),
});

type GoodsReceiptCtx = QueryCtx | MutationCtx;
type ManualReceiptItemInput = Infer<typeof manualReceiptItemInputValidator>;

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

async function resolveManualReceiptItems({
  ctx,
  organizationId,
  locationId,
  items,
}: {
  ctx: MutationCtx;
  organizationId: string;
  locationId: Id<"locations">;
  items: ManualReceiptItemInput[];
}) {
  const productAccess = await getLocationProductAccess(
    ctx,
    organizationId,
    locationId,
  );
  const pairKeys = new Set<string>();
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

async function locationNames(
  ctx: QueryCtx,
  transfers: Doc<"transfers">[],
) {
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
    fromLocationName:
      names.get(transfer.fromLocationId) ?? "Ukendt lokation",
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

    const products = await Promise.all(
      [...new Set(items.map((item) => item.productId))].map((productId) =>
        ctx.db.get("products", productId),
      ),
    );
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
        items: items.map((item) => ({
          id: item._id,
          productName: item.productName,
          imageUrl: imageUrls.get(item.productId) ?? null,
          unitName: item.unitName,
          quantity: item.quantity,
        })),
      },
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
        q
          .eq("organizationId", organizationId)
          .eq("transferId", transfer._id),
      )
      .take(MAX_TRANSFER_ITEMS + 1);
    if (
      currentItems.length > MAX_TRANSFER_ITEMS ||
      args.items.length !== currentItems.length
    ) {
      throw new ConvexError(
        "Transferen er ændret. Genindlæs varemodtagelsen og prøv igen",
      );
    }

    const submitted = new Map<Id<"transferItems">, number>();
    for (const item of args.items) {
      if (submitted.has(item.transferItemId)) {
        throw new ConvexError("Hver produktlinje må kun registreres én gang");
      }
      submitted.set(item.transferItemId, item.quantity);
    }

    const receivedItems = currentItems.map((item) => {
      const submittedQuantity = submitted.get(item._id);
      if (submittedQuantity === undefined) {
        throw new ConvexError(
          "Transferen er ændret. Genindlæs varemodtagelsen og prøv igen",
        );
      }
      const quantity = normalizeStock(submittedQuantity);
      if (
        !Number.isFinite(submittedQuantity) ||
        quantity < 0 ||
        quantity > normalizeStock(item.quantity)
      ) {
        throw new ConvexError(
          `Den modtagne mængde for ${item.productName} skal være mellem 0 og ${item.quantity}`,
        );
      }
      if (item.factorToDefault === undefined) {
        throw new ConvexError("Transferens lageromregning mangler");
      }
      return {
        item,
        quantity,
        factorToDefault: item.factorToDefault,
      };
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

    for (const { item, quantity, factorToDefault } of receivedItems) {
      const product = await ctx.db.get("products", item.productId);
      if (!product || product.organizationId !== organizationId) {
        throw new ConvexError("Produktet blev ikke fundet");
      }
      const stockQuantity = normalizeStock(quantity * factorToDefault);
      if (stockQuantity !== 0) {
        await addStock(
          ctx,
          organizationId,
          transfer.fromLocationId,
          item.productId,
          -stockQuantity,
        );
        await addStock(
          ctx,
          organizationId,
          transfer.toLocationId,
          item.productId,
          stockQuantity,
        );
      }
      await ctx.db.patch("transferItems", item._id, {
        receivedQuantity: quantity,
      });
    }

    await ctx.db.patch("transfers", transfer._id, {
      stockApplied: true,
      receiptStatus: "registered",
      receiptRegisteredAt: Date.now(),
      receiptRegisteredBy: userIdentifier,
      receiptRegisteredByName: userName,
      receiptComment: comment,
      deliveryNoteStorageId: args.deliveryNoteStorageId,
    });
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
    items: v.array(manualReceiptItemInputValidator),
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

    const resolvedItems = await resolveManualReceiptItems({
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
      transferDeliveryNotePhotoEnabled:
        args.transferDeliveryNotePhotoEnabled,
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
