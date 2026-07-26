import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { requireTransferManager } from "./lib/auth";

const MAX_TRANSFER_ITEMS = 200;
const MAX_COMMENT_LENGTH = 500;
const MAX_EXPORT_TRANSFERS = 1000;
const MAX_EXPORT_ROWS = 5000;
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

async function locationName(
  ctx: QueryCtx,
  locationId: Id<"locations">,
): Promise<string> {
  const location = await ctx.db.get("locations", locationId);
  return location?.name ?? "Ukendt butik";
}

async function hydrateTransferHeader(
  ctx: QueryCtx,
  transfer: Doc<"transfers">,
) {
  const items = await ctx.db
    .query("transferItems")
    .withIndex("by_organizationId_and_transferId", (q) =>
      q
        .eq("organizationId", transfer.organizationId)
        .eq("transferId", transfer._id),
    )
    .take(MAX_TRANSFER_ITEMS);

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
  const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
  const result = await auth.api.listMembers({
    headers,
    query: { organizationId, limit: 200 },
  });
  const member = result.members.find(
    (entry) => entry.userId === responsibleUserId,
  );
  if (!member) {
    throw new ConvexError("Den ansvarlige er ikke medlem af organisationen");
  }
  return member.user.name?.trim() || member.user.email;
}

export const createTransfer = mutation({
  args: {
    fromLocationId: v.id("locations"),
    toLocationId: v.id("locations"),
    responsibleUserId: v.string(),
    comment: v.optional(v.string()),
    transferredAt: v.number(),
    items: v.array(
      v.object({
        productId: v.id("products"),
        unitId: v.id("units"),
        quantity: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { organizationId, userIdentifier } =
      await requireTransferManager(ctx);

    if (args.fromLocationId === args.toLocationId) {
      throw new ConvexError("Fra- og til-butik skal være forskellige");
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
      throw new ConvexError("Butikken blev ikke fundet");
    }
    if (!toLocation || toLocation.organizationId !== organizationId) {
      throw new ConvexError("Butikken blev ikke fundet");
    }

    const pairKeys = new Set<string>();
    const resolvedItems: Array<{
      productId: Id<"products">;
      productName: string;
      unitId: Id<"units">;
      unitName: string;
      quantity: number;
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
      if (
        !product ||
        product.organizationId !== organizationId ||
        product.status !== "active"
      ) {
        throw new ConvexError("Produktet blev ikke fundet");
      }

      const productUnit = await ctx.db
        .query("productUnits")
        .withIndex("by_organizationId_and_productId_and_unitId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("productId", item.productId)
            .eq("unitId", item.unitId),
        )
        .unique();
      if (!productUnit) {
        throw new ConvexError(
          "Vælg en enhed, der er konfigureret for produktet",
        );
      }

      const unit = await ctx.db.get("units", item.unitId);
      if (!unit || unit.organizationId !== organizationId) {
        throw new ConvexError("Enheden blev ikke fundet");
      }

      resolvedItems.push({
        productId: product._id,
        productName: product.name,
        unitId: unit._id,
        unitName: unit.name,
        quantity: item.quantity,
      });
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

    const responsibleName = await resolveResponsibleName(
      ctx,
      organizationId,
      args.responsibleUserId,
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
      });
    }

    return transferId;
  },
});

export const listTransfers = query({
  args: {
    paginationOpts: paginationOptsValidator,
    startAt: v.number(),
    endAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { organizationId } = await requireTransferManager(ctx);
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
  handler: async (ctx, args) => {
    const { organizationId } = await requireTransferManager(ctx);
    const transfer = await ctx.db.get("transfers", args.transferId);
    if (!transfer || transfer.organizationId !== organizationId) return null;

    const items = await ctx.db
      .query("transferItems")
      .withIndex("by_organizationId_and_transferId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("transferId", transfer._id),
      )
      .take(MAX_TRANSFER_ITEMS);

    const header = await hydrateTransferHeader(ctx, transfer);
    return {
      ...header,
      items: items.map((item) => ({
        id: item._id,
        productName: item.productName,
        unitName: item.unitName,
        quantity: item.quantity,
      })),
    };
  },
});

export const exportTransfers = query({
  args: {
    startAt: v.number(),
    endAt: v.number(),
    inDefaultUnit: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { organizationId } = await requireTransferManager(ctx);
    const factors = new Map<string, number | null>();
    const defaultUnitNames = new Map<Id<"products">, string | null>();

    // Falls back to the snapshotted unit when the product or its unit row is gone.
    async function inDefaultUnit(item: Doc<"transferItems">) {
      const pairKey = `${item.productId}:${item.unitId}`;
      let factor = factors.get(pairKey);
      if (factor === undefined) {
        const productUnit = await ctx.db
          .query("productUnits")
          .withIndex("by_organizationId_and_productId_and_unitId", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("productId", item.productId)
              .eq("unitId", item.unitId),
          )
          .unique();
        factor = productUnit?.factorToDefault ?? null;
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

    // ponytail: caps at 1000 transfers / 5000 flat rows; upgrade to a server-streamed export when tenants outgrow this.
    const transfers = await ctx.db
      .query("transfers")
      .withIndex("by_organizationId_and_transferredAt", (q) =>
        q
          .eq("organizationId", organizationId)
          .gte("transferredAt", args.startAt)
          .lte("transferredAt", args.endAt),
      )
      .order("desc")
      .take(MAX_EXPORT_TRANSFERS);

    const rows: Array<{
      transferredAt: number;
      fromLocationName: string;
      toLocationName: string;
      responsibleName: string;
      productName: string;
      unitName: string;
      quantity: number;
      comment: string | null;
    }> = [];

    for (const transfer of transfers) {
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

      for (const item of items) {
        if (rows.length >= MAX_EXPORT_ROWS) return rows;
        const measured = args.inDefaultUnit
          ? await inDefaultUnit(item)
          : { unitName: item.unitName, quantity: item.quantity };
        rows.push({
          transferredAt: transfer.transferredAt,
          fromLocationName,
          toLocationName,
          responsibleName: transfer.responsibleName,
          productName: item.productName,
          unitName: measured.unitName,
          quantity: measured.quantity,
          comment: transfer.comment ?? null,
        });
      }
    }

    return rows;
  },
});
