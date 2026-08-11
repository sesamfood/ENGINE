import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { getDatabaseAdapter } from "./auth";
import {
  requireKioskTransfer,
  requirePermission,
  requireTransferManager,
  requireTransferViewer,
  resolveLocationFilter,
} from "./lib/auth";
import { requireOtherFeaturesUnlocked } from "./lib/countLock";
import { addStock, normalizeStock, toDefaultUnit } from "./lib/stock";

const MAX_TRANSFER_ITEMS = 200;
const MAX_COMMENT_LENGTH = 500;
const MAX_PRODUCT_OPTIONS = 50;
const MAX_PRODUCT_UNITS = 200;
const EXPORT_PAGE_SIZE = 5;
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;
const MAX_PUBLIC_PAGE_SIZE = 100;

function requirePageSize(numItems: number, maximum: number) {
  if (
    !Number.isInteger(numItems) ||
    numItems <= 0 ||
    numItems > maximum
  ) {
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

const transferFields = {
  fromLocationId: v.id("locations"),
  toLocationId: v.id("locations"),
  responsibleUserId: v.string(),
  comment: v.optional(v.string()),
  transferredAt: v.number(),
  items: v.array(transferItemInputValidator),
};

const transferHeaderValidator = v.object({
  id: v.id("transfers"),
  transferredAt: v.number(),
  fromLocationName: v.string(),
  toLocationName: v.string(),
  responsibleName: v.string(),
  comment: v.union(v.string(), v.null()),
  itemCount: v.number(),
  totalQuantity: v.number(),
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
  comment: v.union(v.string(), v.null()),
});

const exportTransferValidator = v.object({
  rows: v.array(exportRowValidator),
});

type TransferInput = {
  fromLocationId: Id<"locations">;
  toLocationId: Id<"locations">;
  responsibleUserId: string;
  comment?: string;
  transferredAt: number;
  items: Array<{
    productId: Id<"products">;
    unitId: Id<"units">;
    quantity: number;
  }>;
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
) {
  const items =
    existingItems ??
    (await ctx.db
      .query("transferItems")
      .withIndex("by_organizationId_and_transferId", (q) =>
        q
          .eq("organizationId", transfer.organizationId)
          .eq("transferId", transfer._id),
      )
      .take(MAX_TRANSFER_ITEMS));

  const [fromLocationName, toLocationName] = await Promise.all([
    locationName(ctx, transfer.fromLocationId),
    locationName(ctx, transfer.toLocationId),
  ]);

  return {
    id: transfer._id,
    transferredAt: transfer.transferredAt,
    fromLocationName,
    toLocationName,
    responsibleName: transfer.responsibleName,
    comment: transfer.comment ?? null,
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
  };
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
    throw new ConvexError("Den ansvarlige er ikke medlem af organisationen");
  }
  const user = await adapter.findOne<{ name?: string | null; email: string }>({
    model: "user",
    where: [{ field: "id", value: member.userId }],
  });
  if (!user) throw new ConvexError("Den ansvarlige er ikke medlem af organisationen");
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
    throw new ConvexError("Overførselsdatoen er ugyldig");
  }
  if (args.transferredAt > Date.now() + MAX_FUTURE_SKEW_MS) {
    throw new ConvexError("Overførselsdatoen er ugyldig");
  }
  if (args.items.length === 0) {
    throw new ConvexError("Tilføj mindst én varelinje");
  }
  if (args.items.length > MAX_TRANSFER_ITEMS) {
    throw new ConvexError("Overførslen har for mange varelinjer");
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
    existingItems.map((item) => [
      `${item.productId}:${item.unitId}`,
      item,
    ]),
  );
  const pairKeys = new Set<string>();
  const resolvedItems: Array<{
    productId: Id<"products">;
    productName: string;
    unitId: Id<"units">;
    unitName: string;
    quantity: number;
    factorToDefault?: number;
  }> = [];

  for (const item of args.items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new ConvexError("Mængden skal være større end nul");
    }
    const pairKey = `${item.productId}:${item.unitId}`;
    if (pairKeys.has(pairKey)) {
      throw new ConvexError("Hver varelinje kan kun tilføjes én gang");
    }
    pairKeys.add(pairKey);

    const product = await ctx.db.get("products", item.productId);
    const productUnit =
      product?.organizationId === organizationId &&
      product.status === "active"
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
      });
    } else if (existingItem) {
      resolvedItems.push({
        productId: existingItem.productId,
        productName: existingItem.productName,
        unitId: existingItem.unitId,
        unitName: existingItem.unitName,
        quantity: item.quantity,
        factorToDefault: existingItem.factorToDefault,
      });
    } else {
      throw new ConvexError("Produktet eller enheden blev ikke fundet");
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
      throw new ConvexError("Flytningens lageromregning mangler");
    }
    const delta = normalizeStock(
      item.quantity * item.factorToDefault * direction,
    );
    await addStock(
      ctx,
      organizationId,
      fromLocationId,
      item.productId,
      -delta,
    );
    await addStock(
      ctx,
      organizationId,
      toLocationId,
      item.productId,
      delta,
    );
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
  args: transferFields,
  returns: v.id("transfers"),
  handler: async (ctx, args) => {
    const auth = await requireTransferManager(ctx, "transfers.new");
    const { organizationId, userIdentifier } = auth;
    requireKioskTransfer(auth, args.fromLocationId, args.toLocationId);
    await requireLocationsUnlocked(ctx, organizationId, [
      args.fromLocationId,
      args.toLocationId,
    ]);
    const { comment, responsibleName, resolvedItems } = await prepareTransfer(
      ctx,
      organizationId,
      args,
    );

    const transferId = await ctx.db.insert("transfers", {
      organizationId,
      fromLocationId: args.fromLocationId,
      toLocationId: args.toLocationId,
      responsibleUserId: args.responsibleUserId,
      responsibleName,
      comment,
      transferredAt: args.transferredAt,
      createdBy: userIdentifier,
      stockApplied: true,
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
      });
    }

    await applyTransferStock(
      ctx,
      organizationId,
      args.fromLocationId,
      args.toLocationId,
      resolvedItems,
      1,
    );

    return transferId;
  },
});

export const updateTransfer = mutation({
  args: { transferId: v.id("transfers"), ...transferFields },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireTransferManager(ctx, "transfers.history");
    const { organizationId } = auth;
    const transfer = await ctx.db.get("transfers", args.transferId);
    if (!transfer || transfer.organizationId !== organizationId) {
      throw new ConvexError("Flytningen blev ikke fundet");
    }
    requireKioskTransfer(auth, transfer.fromLocationId, transfer.toLocationId);
    requireKioskTransfer(auth, args.fromLocationId, args.toLocationId);
    await requireLocationsUnlocked(ctx, organizationId, [
      transfer.fromLocationId,
      transfer.toLocationId,
      args.fromLocationId,
      args.toLocationId,
    ]);

    const existingItems = await ctx.db
      .query("transferItems")
      .withIndex("by_organizationId_and_transferId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("transferId", transfer._id),
      )
      .take(MAX_TRANSFER_ITEMS + 1);
    if (existingItems.length > MAX_TRANSFER_ITEMS) {
      throw new ConvexError("Flytningen har for mange varelinjer");
    }

    const { comment, responsibleName, resolvedItems } = await prepareTransfer(
      ctx,
      organizationId,
      args,
      transfer,
      existingItems,
    );

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
      });
    }

    return null;
  },
});

export const deleteTransfer = mutation({
  args: { transferId: v.id("transfers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireTransferManager(ctx, "transfers.history");
    const { organizationId } = auth;
    const transfer = await ctx.db.get("transfers", args.transferId);
    if (!transfer || transfer.organizationId !== organizationId) {
      throw new ConvexError("Flytningen blev ikke fundet");
    }
    requireKioskTransfer(auth, transfer.fromLocationId, transfer.toLocationId);
    await requireLocationsUnlocked(ctx, organizationId, [
      transfer.fromLocationId,
      transfer.toLocationId,
    ]);

    const items = await ctx.db
      .query("transferItems")
      .withIndex("by_organizationId_and_transferId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("transferId", transfer._id),
      )
      .take(MAX_TRANSFER_ITEMS + 1);
    if (items.length > MAX_TRANSFER_ITEMS) {
      throw new ConvexError("Flytningen har for mange varelinjer");
    }
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

export const listTransfers = query({
  args: {
    paginationOpts: paginationOptsValidator,
    startAt: v.number(),
    endAt: v.number(),
  },
  returns: paginationResultValidator(transferHeaderValidator),
  handler: async (ctx, args) => {
    const auth = await requireTransferViewer(ctx, "transfers.history");
    const { organizationId } = auth;
    const locationFilter = resolveLocationFilter(auth);
    const locationIds =
      locationFilter === "all"
        ? null
        : "locationId" in locationFilter
          ? [locationFilter.locationId]
          : locationFilter.locationIds;
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
      .filter((q) =>
        locationIds
          ? locationIds.length
            ? q.or(
                ...locationIds.flatMap((locationId) => [
                  q.eq(q.field("fromLocationId"), locationId),
                  q.eq(q.field("toLocationId"), locationId),
                ]),
              )
            : q.neq(q.field("organizationId"), organizationId)
          : true,
      )
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...results,
      page: await Promise.all(
        results.page.map((transfer) => hydrateTransferHeader(ctx, transfer)),
      ),
    };
  },
});

export const getTransfer = query({
  args: { transferId: v.id("transfers") },
  returns: v.union(transferDetailValidator, v.null()),
  handler: async (ctx, args) => {
    const auth = await requireTransferViewer(ctx, "transfers.history");
    const { organizationId } = auth;
    const transfer = await ctx.db.get("transfers", args.transferId);
    if (!transfer || transfer.organizationId !== organizationId) return null;
    requireKioskTransfer(auth, transfer.fromLocationId, transfer.toLocationId);

    const items = await ctx.db
      .query("transferItems")
      .withIndex("by_organizationId_and_transferId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("transferId", transfer._id),
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
      })),
    };
  },
});

export const searchTransferProducts = query({
  args: { search: v.string() },
  returns: v.array(productSearchOptionValidator),
  handler: async (ctx, args) => {
    const { organizationId } = await requireTransferManager(ctx, "transfers.new");
    const search = args.search.trim();
    if (search.length > 100) {
      throw new ConvexError("Søgningen er for lang");
    }

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

    return products.map((product) => ({
      id: product._id,
      name: product.name,
    }));
  },
});

export const listResponsibleUsers = query({
  args: {},
  returns: v.array(responsibleUserValidator),
  handler: async (ctx) => {
    const { organizationId } = await requireTransferManager(ctx, "transfers.new");
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
        q
          .eq("organizationId", organizationId)
          .eq("productId", product._id),
      )
      .take(MAX_PRODUCT_UNITS + 1);
    if (productUnits.length > MAX_PRODUCT_UNITS) {
      throw new ConvexError("Produktet har for mange enheder");
    }

    const units = await Promise.all(
      productUnits.map((productUnit) => ctx.db.get("units", productUnit.unitId)),
    );
    const imageUrl = product.imageStorageId
      ? await ctx.storage.getUrl(product.imageStorageId)
      : null;

    return {
      id: product._id,
      name: product.name,
      imageUrl,
      defaultUnitId: product.defaultUnitId,
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
    const auth = await requirePermission(ctx, "transfers.export");
    const { organizationId } = auth;
    const locationFilter = resolveLocationFilter(auth);
    const locationIds =
      locationFilter === "all"
        ? null
        : "locationId" in locationFilter
          ? [locationFilter.locationId]
          : locationFilter.locationIds;
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
      .filter((q) =>
        locationIds
          ? locationIds.length
            ? q.or(
                ...locationIds.flatMap((locationId) => [
                  q.eq(q.field("fromLocationId"), locationId),
                  q.eq(q.field("toLocationId"), locationId),
                ]),
              )
            : q.neq(q.field("organizationId"), organizationId)
          : true,
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
