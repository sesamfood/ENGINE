import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  requireGoodsReceiptRegistrar,
  requireGoodsReceiptSettings,
  requireLocationAccess,
} from "./lib/auth";
import { requireOtherFeaturesUnlocked } from "./lib/countLock";
import { addStock, normalizeStock } from "./lib/stock";

const MAX_TRANSFER_ITEMS = 200;
const MAX_PENDING_TRANSFERS = 100;
const MAX_COMMENT_LENGTH = 500;
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
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

type GoodsReceiptCtx = QueryCtx | MutationCtx;

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
  args: {},
  returns: v.object({
    transfers: v.array(pendingTransferValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx) => {
    const auth = await requireGoodsReceiptRegistrar(ctx);
    const { organizationId } = auth;
    let rows: Doc<"transfers">[];

    if (auth.locationScope.all) {
      rows = await ctx.db
        .query("transfers")
        .withIndex(
          "by_organizationId_and_receiptStatus_and_transferredAt",
          (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("receiptStatus", "pending"),
        )
        .order("asc")
        .take(MAX_PENDING_TRANSFERS + 1);
    } else {
      const byLocation = await Promise.all(
        [...auth.locationScope.ids].map((locationId) =>
          ctx.db
            .query("transfers")
            .withIndex(
              "by_organizationId_toLocationId_receiptStatus_transferredAt",
              (q) =>
                q
                  .eq("organizationId", organizationId)
                  .eq("toLocationId", locationId)
                  .eq("receiptStatus", "pending"),
            )
            .order("asc")
            .take(MAX_PENDING_TRANSFERS + 1),
        ),
      );
      rows = byLocation
        .flat()
        .sort(
          (left, right) =>
            left.transferredAt - right.transferredAt ||
            left._creationTime - right._creationTime,
        );
    }

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
      const [file, existing] = await Promise.all([
        ctx.db.system.get("_storage", args.deliveryNoteStorageId),
        ctx.db
          .query("transfers")
          .withIndex("by_deliveryNoteStorageId", (q) =>
            q.eq("deliveryNoteStorageId", args.deliveryNoteStorageId),
          )
          .unique(),
      ]);
      if (existing) {
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
