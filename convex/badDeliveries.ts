import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import {
  requireKioskLocation,
  requireWasteRegistrar,
  requireWasteReporter,
} from "./lib/auth";
import {
  DEFAULT_BAD_DELIVERY_EMAIL_BODY,
  DEFAULT_BAD_DELIVERY_EMAIL_SUBJECT,
  validateBadDeliveryRecipients,
} from "./lib/badDeliverySettings";
import { requireOtherFeaturesUnlocked } from "./lib/countLock";
import { addStock, normalizeStock } from "./lib/stock";

const MAX_ITEMS = 200;
const MAX_PRODUCT_OPTIONS = 50;
const MAX_PRODUCT_UNITS = 200;
const MAX_COMMENT_LENGTH = 500;
const MAX_QUANTITY = 1_000_000;
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const EXPORT_PAGE_SIZE = 10;
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const noticeStatusValidator = v.union(
  v.literal("notConfigured"),
  v.literal("pending"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("skipped"),
);
const recordStatusValidator = v.union(
  v.literal("active"),
  v.literal("voided"),
);
const noticeKindValidator = v.union(
  v.literal("initial"),
  v.literal("cancellation"),
);
const attachmentKindValidator = v.union(
  v.literal("badProducts"),
  v.literal("deliveryNote"),
);
const itemInputValidator = v.object({
  productId: v.id("products"),
  unitId: v.id("units"),
  quantity: v.number(),
});
const productSearchValidator = v.object({
  id: v.id("products"),
  name: v.string(),
});
const productOptionValidator = productSearchValidator.extend({
  imageUrl: v.union(v.string(), v.null()),
  defaultUnitId: v.id("units"),
  units: v.array(
    v.object({
      id: v.id("units"),
      name: v.string(),
      factorToDefault: v.number(),
    }),
  ),
});
const headerValidator = v.object({
  id: v.id("badDeliveries"),
  registeredAt: v.number(),
  locationId: v.id("locations"),
  locationName: v.string(),
  registeredByName: v.string(),
  itemCount: v.number(),
  deductFromStock: v.boolean(),
  initialNoticeStatus: noticeStatusValidator,
  cancellationNoticeStatus: noticeStatusValidator,
  status: recordStatusValidator,
});
const itemValidator = v.object({
  id: v.id("badDeliveryItems"),
  productId: v.id("products"),
  productName: v.string(),
  unitId: v.id("units"),
  unitName: v.string(),
  quantity: v.number(),
  factorToDefault: v.number(),
  defaultUnitId: v.id("units"),
  defaultUnitName: v.string(),
  defaultQuantity: v.number(),
});
const attachmentValidator = v.object({
  kind: attachmentKindValidator,
  url: v.union(v.string(), v.null()),
  contentType: v.string(),
  fileSize: v.number(),
});
const noticeAuditValidator = v.object({
  status: noticeStatusValidator,
  attemptedAt: v.union(v.number(), v.null()),
  sentAt: v.union(v.number(), v.null()),
  providerId: v.union(v.string(), v.null()),
  failureMessage: v.union(v.string(), v.null()),
});
const detailValidator = headerValidator.extend({
  comment: v.union(v.string(), v.null()),
  to: v.array(v.string()),
  cc: v.array(v.string()),
  bcc: v.array(v.string()),
  items: v.array(itemValidator),
  attachments: v.array(attachmentValidator),
  initialNotice: noticeAuditValidator,
  cancellationNotice: noticeAuditValidator,
  voidedAt: v.union(v.number(), v.null()),
  voidedByName: v.union(v.string(), v.null()),
});
const exportRowValidator = v.object({
  badDeliveryId: v.id("badDeliveries"),
  registeredAt: v.number(),
  locationName: v.string(),
  registeredByName: v.string(),
  productName: v.string(),
  quantity: v.number(),
  unitName: v.string(),
  deductFromStock: v.boolean(),
  comment: v.union(v.string(), v.null()),
  status: recordStatusValidator,
  initialNoticeStatus: noticeStatusValidator,
  to: v.array(v.string()),
  cc: v.array(v.string()),
  bcc: v.array(v.string()),
  voidedAt: v.union(v.number(), v.null()),
  voidedByName: v.union(v.string(), v.null()),
  cancellationNoticeStatus: noticeStatusValidator,
});
const noticePayloadValidator = v.object({
  id: v.id("badDeliveries"),
  kind: noticeKindValidator,
  locationName: v.string(),
  registeredAt: v.number(),
  registeredByName: v.string(),
  comment: v.union(v.string(), v.null()),
  deductFromStock: v.boolean(),
  to: v.array(v.string()),
  cc: v.array(v.string()),
  bcc: v.array(v.string()),
  emailSubject: v.string(),
  emailBody: v.string(),
  timeZone: v.string(),
  items: v.array(
    v.object({
      productName: v.string(),
      quantity: v.number(),
      unitName: v.string(),
    }),
  ),
  attachments: v.array(
    v.object({
      kind: attachmentKindValidator,
      storageId: v.id("_storage"),
      contentType: v.string(),
    }),
  ),
  voidedAt: v.union(v.number(), v.null()),
  voidedByName: v.union(v.string(), v.null()),
});

type ReadContext = QueryCtx | MutationCtx;

async function requireLocation(
  ctx: ReadContext,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const location = await ctx.db.get("locations", locationId);
  if (!location || location.organizationId !== organizationId) {
    throw new ConvexError("Locationen blev ikke fundet");
  }
  return location;
}

async function settingsFor(ctx: ReadContext, organizationId: string) {
  const settings = await ctx.db
    .query("wasteSettings")
    .withIndex("by_org", (q) => q.eq("organizationId", organizationId))
    .unique();
  return {
    deductFromStock: settings?.badDeliveryDeductFromStock ?? true,
    showStockChoice: settings?.badDeliveryShowStockChoice ?? true,
    to: settings?.badDeliveryTo ?? [],
    cc: settings?.badDeliveryCc ?? [],
    bcc: settings?.badDeliveryBcc ?? [],
    emailSubject:
      settings?.badDeliveryEmailSubject ?? DEFAULT_BAD_DELIVERY_EMAIL_SUBJECT,
    emailBody:
      settings?.badDeliveryEmailBody ?? DEFAULT_BAD_DELIVERY_EMAIL_BODY,
  };
}

function requireRange(startAt: number, endAt: number) {
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

function header(delivery: Doc<"badDeliveries">) {
  return {
    id: delivery._id,
    registeredAt: delivery.registeredAt,
    locationId: delivery.locationId,
    locationName: delivery.locationName,
    registeredByName: delivery.registeredByName,
    itemCount: delivery.itemCount,
    deductFromStock: delivery.deductFromStock,
    initialNoticeStatus: delivery.initialNoticeStatus,
    cancellationNoticeStatus: delivery.cancellationNoticeStatus,
    status: delivery.status,
  };
}

function noticeAudit(
  delivery: Doc<"badDeliveries">,
  kind: "initial" | "cancellation",
) {
  return kind === "initial"
    ? {
        status: delivery.initialNoticeStatus,
        attemptedAt: delivery.initialNoticeAttemptedAt ?? null,
        sentAt: delivery.initialNoticeSentAt ?? null,
        providerId: delivery.initialNoticeProviderId ?? null,
        failureMessage: delivery.initialNoticeFailureMessage ?? null,
      }
    : {
        status: delivery.cancellationNoticeStatus,
        attemptedAt: delivery.cancellationNoticeAttemptedAt ?? null,
        sentAt: delivery.cancellationNoticeSentAt ?? null,
        providerId: delivery.cancellationNoticeProviderId ?? null,
        failureMessage: delivery.cancellationNoticeFailureMessage ?? null,
      };
}

export const getRegistrationConfig = query({
  args: { locationId: v.id("locations") },
  returns: v.object({
    deductFromStock: v.boolean(),
    showStockChoice: v.boolean(),
    hasPrimaryRecipients: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const auth = await requireWasteRegistrar(ctx, "waste.badDelivery");
    const { organizationId } = auth;
    requireKioskLocation(auth, args.locationId);
    await requireLocation(ctx, organizationId, args.locationId);
    const settings = await settingsFor(ctx, organizationId);
    return {
      deductFromStock: settings.deductFromStock,
      showStockChoice: settings.showStockChoice,
      hasPrimaryRecipients: settings.to.length > 0,
    };
  },
});

export const searchProducts = query({
  args: { search: v.string() },
  returns: v.array(productSearchValidator),
  handler: async (ctx, args) => {
    const { organizationId } = await requireWasteRegistrar(
      ctx,
      "waste.badDelivery",
    );
    const search = args.search.trim();
    if (search.length > 100) throw new ConvexError("Søgningen er for lang");
    const products = search
      ? await ctx.db
          .query("products")
          .withSearchIndex("search_name", (q) =>
            q
              .search("name", search)
              .eq("organizationId", organizationId)
              .eq("status", "active"),
          )
          .take(MAX_PRODUCT_OPTIONS)
      : await ctx.db
          .query("products")
          .withIndex(
            "by_organizationId_and_status_and_normalizedName",
            (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("status", "active"),
          )
          .take(MAX_PRODUCT_OPTIONS);
    return products.map((product) => ({ id: product._id, name: product.name }));
  },
});

export const getProductOption = query({
  args: { productId: v.id("products") },
  returns: v.union(productOptionValidator, v.null()),
  handler: async (ctx, args) => {
    const { organizationId } = await requireWasteRegistrar(
      ctx,
      "waste.badDelivery",
    );
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
      productUnits.map((row) => ctx.db.get("units", row.unitId)),
    );
    return {
      id: product._id,
      name: product.name,
      imageUrl: product.imageStorageId
        ? await ctx.storage.getUrl(product.imageStorageId)
        : null,
      defaultUnitId: product.defaultUnitId,
      units: productUnits.flatMap((row, index) => {
        const unit = units[index];
        return unit?.organizationId === organizationId
          ? [{ id: unit._id, name: unit.name, factorToDefault: row.factorToDefault }]
          : [];
      }),
    };
  },
});

export const generatePhotoUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireWasteRegistrar(ctx, "waste.badDelivery");
    return await ctx.storage.generateUploadUrl();
  },
});

export const registerBadDelivery = mutation({
  args: {
    locationId: v.id("locations"),
    comment: v.optional(v.string()),
    deductFromStock: v.optional(v.boolean()),
    badProductsPhotoStorageId: v.id("_storage"),
    deliveryNotePhotoStorageId: v.id("_storage"),
    items: v.array(itemInputValidator),
  },
  returns: v.object({
    badDeliveryId: v.id("badDeliveries"),
    initialNoticeStatus: noticeStatusValidator,
  }),
  handler: async (ctx, args) => {
    const auth = await requireWasteRegistrar(ctx, "waste.badDelivery");
    const { organizationId, userIdentifier, userName } = auth;
    requireKioskLocation(auth, args.locationId);
    await requireOtherFeaturesUnlocked(ctx, organizationId, args.locationId);
    const location = await requireLocation(ctx, organizationId, args.locationId);
    if (args.items.length < 1 || args.items.length > MAX_ITEMS) {
      throw new ConvexError("Tilføj mellem 1 og 200 varelinjer");
    }
    const comment = args.comment?.trim() || undefined;
    if (comment && comment.length > MAX_COMMENT_LENGTH) {
      throw new ConvexError("Kommentaren må højst være 500 tegn");
    }
    if (args.badProductsPhotoStorageId === args.deliveryNotePhotoStorageId) {
      throw new ConvexError("De to billeder skal være forskellige");
    }
    const storageIds = [
      args.badProductsPhotoStorageId,
      args.deliveryNotePhotoStorageId,
    ];
    const [metadata, existingAttachments] = await Promise.all([
      Promise.all(storageIds.map((id) => ctx.db.system.get("_storage", id))),
      Promise.all(
        storageIds.map((id) =>
          ctx.db
            .query("badDeliveryAttachments")
            .withIndex("by_storageId", (q) => q.eq("storageId", id))
            .unique(),
        ),
      ),
    ]);
    if (existingAttachments.some(Boolean)) {
      throw new ConvexError("Et billede er allerede knyttet til en registrering");
    }
    for (const file of metadata) {
      if (
        !file?.contentType ||
        !IMAGE_TYPES.has(file.contentType) ||
        file.size > MAX_PHOTO_SIZE
      ) {
        throw new ConvexError(
          "Brug JPEG-, PNG-, WebP- eller AVIF-billeder på højst 10 MB",
        );
      }
    }

    const pairs = new Set<string>();
    const resolvedItems: Array<{
      productId: Id<"products">;
      productName: string;
      unitId: Id<"units">;
      unitName: string;
      quantity: number;
      factorToDefault: number;
      defaultUnitId: Id<"units">;
      defaultUnitName: string;
      defaultQuantity: number;
    }> = [];
    for (const item of args.items) {
      const quantity = normalizeStock(item.quantity);
      if (
        !Number.isFinite(item.quantity) ||
        quantity <= 0 ||
        quantity > MAX_QUANTITY
      ) {
        throw new ConvexError(
          `Mængden skal være større end nul og højst ${MAX_QUANTITY}`,
        );
      }
      const pair = `${item.productId}:${item.unitId}`;
      if (pairs.has(pair)) {
        throw new ConvexError("Hver produkt- og enhedskombination må kun bruges én gang");
      }
      pairs.add(pair);
      const product = await ctx.db.get("products", item.productId);
      if (
        !product ||
        product.organizationId !== organizationId ||
        product.status !== "active"
      ) {
        throw new ConvexError("Produktet blev ikke fundet");
      }
      const [productUnit, unit, defaultUnit] = await Promise.all([
        ctx.db
          .query("productUnits")
          .withIndex("by_organizationId_and_productId_and_unitId", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("productId", product._id)
              .eq("unitId", item.unitId),
          )
          .unique(),
        ctx.db.get("units", item.unitId),
        ctx.db.get("units", product.defaultUnitId),
      ]);
      if (
        !productUnit ||
        !unit ||
        unit.organizationId !== organizationId ||
        !defaultUnit ||
        defaultUnit.organizationId !== organizationId
      ) {
        throw new ConvexError("Produktets enhed blev ikke fundet");
      }
      resolvedItems.push({
        productId: product._id,
        productName: product.name,
        unitId: unit._id,
        unitName: unit.name,
        quantity,
        factorToDefault: productUnit.factorToDefault,
        defaultUnitId: defaultUnit._id,
        defaultUnitName: defaultUnit.name,
        defaultQuantity: normalizeStock(quantity * productUnit.factorToDefault),
      });
    }

    const settings = await settingsFor(ctx, organizationId);
    const recipients = validateBadDeliveryRecipients(settings);
    const deductFromStock = settings.showStockChoice
      ? (args.deductFromStock ?? settings.deductFromStock)
      : settings.deductFromStock;
    const initialNoticeStatus = recipients.to.length
      ? ("pending" as const)
      : ("notConfigured" as const);
    const now = Date.now();
    const badDeliveryId = await ctx.db.insert("badDeliveries", {
      organizationId,
      locationId: location._id,
      locationName: location.name,
      registeredAt: now,
      registeredBy: userIdentifier,
      registeredByName: userName,
      comment,
      deductFromStock,
      itemCount: resolvedItems.length,
      status: "active",
      to: recipients.to,
      cc: recipients.cc,
      bcc: recipients.bcc,
      emailSubject: settings.emailSubject,
      emailBody: settings.emailBody,
      initialNoticeStatus,
      cancellationNoticeStatus: "skipped",
    });
    for (const item of resolvedItems) {
      await ctx.db.insert("badDeliveryItems", {
        organizationId,
        badDeliveryId,
        ...item,
      });
      if (deductFromStock) {
        await addStock(
          ctx,
          organizationId,
          location._id,
          item.productId,
          -item.defaultQuantity,
        );
      }
    }
    for (const [index, storageId] of storageIds.entries()) {
      const file = metadata[index]!;
      await ctx.db.insert("badDeliveryAttachments", {
        organizationId,
        badDeliveryId,
        kind: index === 0 ? "badProducts" : "deliveryNote",
        storageId,
        contentType: file!.contentType!,
        fileSize: file!.size,
      });
    }
    if (initialNoticeStatus === "pending") {
      await ctx.scheduler.runAfter(0, internal.badDeliveryNotices.sendNotice, {
        badDeliveryId,
        kind: "initial",
      });
    }
    return { badDeliveryId, initialNoticeStatus };
  },
});

export const listBadDeliveries = query({
  args: {
    paginationOpts: paginationOptsValidator,
    startAt: v.number(),
    endAt: v.number(),
    locationId: v.optional(v.id("locations")),
  },
  returns: paginationResultValidator(headerValidator),
  handler: async (ctx, args) => {
    const auth = await requireWasteReporter(ctx);
    const { organizationId } = auth;
    const locationId = auth.kioskLocationId ?? args.locationId;
    requireRange(args.startAt, args.endAt);
    if (args.locationId) {
      requireKioskLocation(auth, args.locationId);
      await requireLocation(ctx, organizationId, args.locationId);
    }
    const result = locationId
      ? await ctx.db
          .query("badDeliveries")
          .withIndex(
            "by_organizationId_and_locationId_and_registeredAt",
            (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("locationId", locationId)
                .gte("registeredAt", args.startAt)
                .lte("registeredAt", args.endAt),
          )
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("badDeliveries")
          .withIndex("by_organizationId_and_registeredAt", (q) =>
            q
              .eq("organizationId", organizationId)
              .gte("registeredAt", args.startAt)
              .lte("registeredAt", args.endAt),
          )
          .order("desc")
          .paginate(args.paginationOpts);
    return { ...result, page: result.page.map(header) };
  },
});

export const getBadDelivery = query({
  args: { badDeliveryId: v.id("badDeliveries") },
  returns: v.union(detailValidator, v.null()),
  handler: async (ctx, args) => {
    const auth = await requireWasteReporter(ctx);
    const { organizationId } = auth;
    const delivery = await ctx.db.get("badDeliveries", args.badDeliveryId);
    if (!delivery || delivery.organizationId !== organizationId) return null;
    requireKioskLocation(auth, delivery.locationId);
    const [items, attachments] = await Promise.all([
      ctx.db
        .query("badDeliveryItems")
        .withIndex("by_organizationId_and_badDeliveryId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("badDeliveryId", delivery._id),
        )
        .take(MAX_ITEMS + 1),
      ctx.db
        .query("badDeliveryAttachments")
        .withIndex("by_organizationId_and_badDeliveryId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("badDeliveryId", delivery._id),
        )
        .take(3),
    ]);
    if (items.length > MAX_ITEMS || attachments.length !== 2) {
      throw new ConvexError("Registreringens data er ugyldige");
    }
    return {
      ...header(delivery),
      comment: delivery.comment ?? null,
      to: delivery.to,
      cc: delivery.cc,
      bcc: delivery.bcc,
      items: items.map((item) => ({
        id: item._id,
        productId: item.productId,
        productName: item.productName,
        unitId: item.unitId,
        unitName: item.unitName,
        quantity: item.quantity,
        factorToDefault: item.factorToDefault,
        defaultUnitId: item.defaultUnitId,
        defaultUnitName: item.defaultUnitName,
        defaultQuantity: item.defaultQuantity,
      })),
      attachments: await Promise.all(
        attachments.map(async (attachment) => ({
          kind: attachment.kind,
          url: await ctx.storage.getUrl(attachment.storageId),
          contentType: attachment.contentType,
          fileSize: attachment.fileSize,
        })),
      ),
      initialNotice: noticeAudit(delivery, "initial"),
      cancellationNotice: noticeAudit(delivery, "cancellation"),
      voidedAt: delivery.voidedAt ?? null,
      voidedByName: delivery.voidedByName ?? null,
    };
  },
});

export const exportBadDeliveries = query({
  args: {
    paginationOpts: paginationOptsValidator,
    startAt: v.number(),
    endAt: v.number(),
    locationId: v.optional(v.id("locations")),
  },
  returns: paginationResultValidator(
    v.object({ rows: v.array(exportRowValidator) }),
  ),
  handler: async (ctx, args) => {
    const auth = await requireWasteReporter(ctx);
    const { organizationId } = auth;
    const locationId = auth.kioskLocationId ?? args.locationId;
    requireRange(args.startAt, args.endAt);
    if (
      args.paginationOpts.numItems !== EXPORT_PAGE_SIZE ||
      args.paginationOpts.maximumRowsRead !== EXPORT_PAGE_SIZE
    ) {
      throw new ConvexError("Eksportsiden er for stor");
    }
    if (args.locationId) {
      requireKioskLocation(auth, args.locationId);
      await requireLocation(ctx, organizationId, args.locationId);
    }
    const result = locationId
      ? await ctx.db
          .query("badDeliveries")
          .withIndex(
            "by_organizationId_and_locationId_and_registeredAt",
            (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("locationId", locationId)
                .gte("registeredAt", args.startAt)
                .lte("registeredAt", args.endAt),
          )
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db
          .query("badDeliveries")
          .withIndex("by_organizationId_and_registeredAt", (q) =>
            q
              .eq("organizationId", organizationId)
              .gte("registeredAt", args.startAt)
              .lte("registeredAt", args.endAt),
          )
          .order("desc")
          .paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (delivery) => {
          const items = await ctx.db
            .query("badDeliveryItems")
            .withIndex("by_organizationId_and_badDeliveryId", (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("badDeliveryId", delivery._id),
            )
            .take(MAX_ITEMS + 1);
          if (items.length > MAX_ITEMS) {
            throw new ConvexError("Registreringen har for mange varelinjer");
          }
          return {
            rows: items.map((item) => ({
              badDeliveryId: delivery._id,
              registeredAt: delivery.registeredAt,
              locationName: delivery.locationName,
              registeredByName: delivery.registeredByName,
              productName: item.productName,
              quantity: item.quantity,
              unitName: item.unitName,
              deductFromStock: delivery.deductFromStock,
              comment: delivery.comment ?? null,
              status: delivery.status,
              initialNoticeStatus: delivery.initialNoticeStatus,
              to: delivery.to,
              cc: delivery.cc,
              bcc: delivery.bcc,
              voidedAt: delivery.voidedAt ?? null,
              voidedByName: delivery.voidedByName ?? null,
              cancellationNoticeStatus: delivery.cancellationNoticeStatus,
            })),
          };
        }),
      ),
    };
  },
});

export const voidBadDelivery = mutation({
  args: { badDeliveryId: v.id("badDeliveries") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireWasteReporter(ctx);
    const { organizationId, userIdentifier, userName } = auth;
    const delivery = await ctx.db.get("badDeliveries", args.badDeliveryId);
    if (!delivery || delivery.organizationId !== organizationId) {
      throw new ConvexError("Registreringen blev ikke fundet");
    }
    requireKioskLocation(auth, delivery.locationId);
    if (delivery.status !== "active") {
      throw new ConvexError("Registreringen er allerede annulleret");
    }
    await requireOtherFeaturesUnlocked(ctx, organizationId, delivery.locationId);
    const items = await ctx.db
      .query("badDeliveryItems")
      .withIndex("by_organizationId_and_badDeliveryId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("badDeliveryId", delivery._id),
      )
      .take(MAX_ITEMS + 1);
    if (items.length > MAX_ITEMS) {
      throw new ConvexError("Registreringen har for mange varelinjer");
    }
    if (delivery.deductFromStock) {
      for (const item of items) {
        await addStock(
          ctx,
          organizationId,
          delivery.locationId,
          item.productId,
          item.defaultQuantity,
        );
      }
    }
    const now = Date.now();
    const shouldCancel = delivery.initialNoticeStatus === "sent";
    await ctx.db.patch("badDeliveries", delivery._id, {
      status: "voided",
      voidedAt: now,
      voidedBy: userIdentifier,
      voidedByName: userName,
      cancellationNoticeStatus: shouldCancel ? "pending" : "skipped",
      cancellationNoticeInFlight: false,
    });
    if (shouldCancel) {
      await ctx.scheduler.runAfter(0, internal.badDeliveryNotices.sendNotice, {
        badDeliveryId: delivery._id,
        kind: "cancellation",
      });
    }
    return null;
  },
});

export const retryBadDeliveryNotice = mutation({
  args: {
    badDeliveryId: v.id("badDeliveries"),
    kind: noticeKindValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireWasteReporter(ctx);
    const { organizationId } = auth;
    const delivery = await ctx.db.get("badDeliveries", args.badDeliveryId);
    if (!delivery || delivery.organizationId !== organizationId) {
      throw new ConvexError("Registreringen blev ikke fundet");
    }
    requireKioskLocation(auth, delivery.locationId);
    if (args.kind === "initial") {
      if (
        delivery.status !== "active" ||
        !["failed", "notConfigured"].includes(delivery.initialNoticeStatus)
      ) {
        throw new ConvexError("Den oprindelige meddelelse kan ikke sendes nu");
      }
      let recipients = {
        to: delivery.to,
        cc: delivery.cc,
        bcc: delivery.bcc,
      };
      if (delivery.initialNoticeStatus === "notConfigured") {
        const currentSettings = await settingsFor(ctx, organizationId);
        recipients = validateBadDeliveryRecipients(currentSettings);
        if (!recipients.to.length) {
          throw new ConvexError("Organisationen har ingen modtagere i Til");
        }
        await ctx.db.patch("badDeliveries", delivery._id, {
          emailSubject: delivery.emailSubject ?? currentSettings.emailSubject,
          emailBody: delivery.emailBody ?? currentSettings.emailBody,
        });
      }
      await ctx.db.patch("badDeliveries", delivery._id, {
        ...recipients,
        initialNoticeStatus: "pending",
        initialNoticeFailureMessage: undefined,
        initialNoticeInFlight: false,
      });
    } else {
      if (
        delivery.status !== "voided" ||
        delivery.initialNoticeStatus !== "sent" ||
        delivery.cancellationNoticeStatus !== "failed"
      ) {
        throw new ConvexError("Annulleringsmeddelelsen kan ikke sendes nu");
      }
      await ctx.db.patch("badDeliveries", delivery._id, {
        cancellationNoticeStatus: "pending",
        cancellationNoticeFailureMessage: undefined,
        cancellationNoticeInFlight: false,
      });
    }
    await ctx.scheduler.runAfter(0, internal.badDeliveryNotices.sendNotice, {
      badDeliveryId: delivery._id,
      kind: args.kind,
    });
    return null;
  },
});

export const claimNotice = internalMutation({
  args: {
    badDeliveryId: v.id("badDeliveries"),
    kind: noticeKindValidator,
  },
  returns: v.union(noticePayloadValidator, v.null()),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get("badDeliveries", args.badDeliveryId);
    if (!delivery) return null;
    if (args.kind === "initial") {
      if (
        delivery.initialNoticeStatus !== "pending" ||
        delivery.initialNoticeInFlight
      ) {
        return null;
      }
      if (delivery.status === "voided") {
        await ctx.db.patch("badDeliveries", delivery._id, {
          initialNoticeStatus: "skipped",
          initialNoticeInFlight: false,
          cancellationNoticeStatus: "skipped",
        });
        return null;
      }
      await ctx.db.patch("badDeliveries", delivery._id, {
        initialNoticeInFlight: true,
        initialNoticeAttemptedAt: Date.now(),
        initialNoticeFailureMessage: undefined,
      });
    } else {
      if (
        delivery.status !== "voided" ||
        delivery.cancellationNoticeStatus !== "pending" ||
        delivery.cancellationNoticeInFlight
      ) {
        return null;
      }
      await ctx.db.patch("badDeliveries", delivery._id, {
        cancellationNoticeInFlight: true,
        cancellationNoticeAttemptedAt: Date.now(),
        cancellationNoticeFailureMessage: undefined,
      });
    }
    const [items, attachments, scheduleSettings] = await Promise.all([
      ctx.db
        .query("badDeliveryItems")
        .withIndex("by_organizationId_and_badDeliveryId", (q) =>
          q
            .eq("organizationId", delivery.organizationId)
            .eq("badDeliveryId", delivery._id),
        )
        .take(MAX_ITEMS + 1),
      ctx.db
        .query("badDeliveryAttachments")
        .withIndex("by_organizationId_and_badDeliveryId", (q) =>
          q
            .eq("organizationId", delivery.organizationId)
            .eq("badDeliveryId", delivery._id),
        )
        .take(3),
      ctx.db
        .query("organizationScheduleSettings")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", delivery.organizationId),
        )
        .unique(),
    ]);
    if (items.length > MAX_ITEMS || attachments.length !== 2) {
      throw new ConvexError("Registreringens data er ugyldige");
    }
    return {
      id: delivery._id,
      kind: args.kind,
      locationName: delivery.locationName,
      registeredAt: delivery.registeredAt,
      registeredByName: delivery.registeredByName,
      comment: delivery.comment ?? null,
      deductFromStock: delivery.deductFromStock,
      to: delivery.to,
      cc: delivery.cc,
      bcc: delivery.bcc,
      emailSubject:
        delivery.emailSubject ?? DEFAULT_BAD_DELIVERY_EMAIL_SUBJECT,
      emailBody: delivery.emailBody ?? DEFAULT_BAD_DELIVERY_EMAIL_BODY,
      timeZone: scheduleSettings?.timeZone ?? "Europe/Copenhagen",
      items: items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        unitName: item.unitName,
      })),
      attachments: attachments.map((attachment) => ({
        kind: attachment.kind,
        storageId: attachment.storageId,
        contentType: attachment.contentType,
      })),
      voidedAt: delivery.voidedAt ?? null,
      voidedByName: delivery.voidedByName ?? null,
    };
  },
});

export const completeNotice = internalMutation({
  args: {
    badDeliveryId: v.id("badDeliveries"),
    kind: noticeKindValidator,
    success: v.boolean(),
    providerId: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get("badDeliveries", args.badDeliveryId);
    if (!delivery) return null;
    const inFlight =
      args.kind === "initial"
        ? delivery.initialNoticeInFlight
        : delivery.cancellationNoticeInFlight;
    const status =
      args.kind === "initial"
        ? delivery.initialNoticeStatus
        : delivery.cancellationNoticeStatus;
    if (!inFlight || status !== "pending") return null;
    const now = Date.now();
    if (args.kind === "initial") {
      await ctx.db.patch("badDeliveries", delivery._id, {
        initialNoticeStatus: args.success ? "sent" : "failed",
        initialNoticeInFlight: false,
        initialNoticeSentAt: args.success ? now : undefined,
        initialNoticeProviderId: args.success ? args.providerId : undefined,
        initialNoticeFailureMessage: args.success
          ? undefined
          : args.failureMessage,
        ...(args.success && delivery.status === "voided"
          ? { cancellationNoticeStatus: "pending" as const }
          : {}),
      });
      if (args.success && delivery.status === "voided") {
        await ctx.scheduler.runAfter(0, internal.badDeliveryNotices.sendNotice, {
          badDeliveryId: delivery._id,
          kind: "cancellation",
        });
      }
    } else {
      await ctx.db.patch("badDeliveries", delivery._id, {
        cancellationNoticeStatus: args.success ? "sent" : "failed",
        cancellationNoticeInFlight: false,
        cancellationNoticeSentAt: args.success ? now : undefined,
        cancellationNoticeProviderId: args.success ? args.providerId : undefined,
        cancellationNoticeFailureMessage: args.success
          ? undefined
          : args.failureMessage,
      });
    }
    return null;
  },
});
