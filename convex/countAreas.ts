import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  requireCounter,
  requireLocationAccess,
  requireLocationManager,
} from "./lib/auth";
import { recordAudit } from "./lib/audit";
import {
  getCountAreaProductOrder,
  listCountAreas,
  MAX_COUNT_AREAS,
  MAX_COUNT_AREA_PRODUCTS,
  requireCountArea,
} from "./lib/countAreas";
import { getLocationCountWindow } from "./lib/countWindow";
import { getLocationProductAccess } from "./lib/locationProducts";

const MAX_NAME_LENGTH = 100;
const MAX_COUNT_ITEMS = 5_000;

const areaValidator = v.object({
  id: v.id("countAreas"),
  name: v.string(),
});

const areaWithProductsValidator = areaValidator.extend({
  productIds: v.array(v.id("products")),
});

type CountAreaContext = QueryCtx | MutationCtx;

function normalizeName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new ConvexError("Navnet på Baren skal udfyldes");
  if (name.length > MAX_NAME_LENGTH) {
    throw new ConvexError(
      `Navnet på Baren må højst være ${MAX_NAME_LENGTH} tegn`,
    );
  }
  return { name, normalizedName: name.toLocaleLowerCase("da") };
}

async function requireLocation(
  ctx: CountAreaContext,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const location = await ctx.db.get("locations", locationId);
  if (!location || location.organizationId !== organizationId) {
    throw new ConvexError("Lokationen blev ikke fundet");
  }
  return location;
}

async function getCurrentOpenCount(
  ctx: CountAreaContext,
  organizationId: string,
  location: Doc<"locations">,
) {
  const countWindow = await getLocationCountWindow(
    ctx,
    organizationId,
    location,
    Date.now(),
  );
  const count = await ctx.db
    .query("counts")
    .withIndex("by_organizationId_and_locationId_and_periodKey", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("locationId", location._id)
        .eq("periodKey", countWindow.periodKey),
    )
    .unique();
  return count?.status === "open" ? count : null;
}

function productIsAvailable(
  access: Awaited<ReturnType<typeof getLocationProductAccess>>,
  productId: Id<"products">,
) {
  return access.kind === "all" || access.effectiveProductIds.has(productId);
}

async function filteredOrder(
  ctx: CountAreaContext,
  organizationId: string,
  locationId: Id<"locations">,
  productIds: Id<"products">[],
) {
  const access = await getLocationProductAccess(
    ctx,
    organizationId,
    locationId,
  );
  return productIds.filter((productId) =>
    productIsAvailable(access, productId),
  );
}

export const listForCount = query({
  args: { locationId: v.id("locations") },
  returns: v.array(areaWithProductsValidator),
  handler: async (ctx, args) => {
    const auth = await requireCounter(ctx, "count.register");
    requireLocationAccess(auth, args.locationId);
    await requireLocation(ctx, auth.organizationId, args.locationId);
    const [areas, access] = await Promise.all([
      listCountAreas(ctx, auth.organizationId, args.locationId),
      getLocationProductAccess(
        ctx,
        auth.organizationId,
        args.locationId,
      ),
    ]);
    return await Promise.all(
      areas.map(async (area) => {
        const order = await getCountAreaProductOrder(
          ctx,
          auth.organizationId,
          area._id,
        );
        return {
          id: area._id,
          name: area.name,
          productIds: order
            .map((row) => row.productId)
            .filter((productId) => productIsAvailable(access, productId)),
        };
      }),
    );
  },
});

export const listForManagement = query({
  args: { locationId: v.id("locations") },
  returns: v.array(areaWithProductsValidator),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireLocationAccess(auth, args.locationId);
    await requireLocation(ctx, auth.organizationId, args.locationId);
    const areas = await listCountAreas(
      ctx,
      auth.organizationId,
      args.locationId,
    );
    const access = await getLocationProductAccess(
      ctx,
      auth.organizationId,
      args.locationId,
    );
    return await Promise.all(
      areas.map(async (area) => {
        const order = await getCountAreaProductOrder(
          ctx,
          auth.organizationId,
          area._id,
        );
        return {
          id: area._id,
          name: area.name,
          productIds: order
            .map((row) => row.productId)
            .filter((productId) => productIsAvailable(access, productId)),
        };
      }),
    );
  },
});

export const getProductOrder = query({
  args: {
    locationId: v.id("locations"),
    countAreaId: v.union(v.id("countAreas"), v.null()),
  },
  returns: v.array(v.id("products")),
  handler: async (ctx, args) => {
    const auth = await requireCounter(ctx, "count.register");
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    const location = await requireLocation(
      ctx,
      organizationId,
      args.locationId,
    );
    if (!args.countAreaId) {
      const areas = await listCountAreas(ctx, organizationId, location._id);
      if (areas.length > 0) throw new ConvexError("Vælg en Bar");
      return await filteredOrder(
        ctx,
        organizationId,
        location._id,
        location.countProductOrder ?? [],
      );
    }
    const area = await requireCountArea(
      ctx,
      organizationId,
      location._id,
      args.countAreaId,
    );
    const rows = await getCountAreaProductOrder(ctx, organizationId, area._id);
    return await filteredOrder(
      ctx,
      organizationId,
      location._id,
      rows.map((row) => row.productId),
    );
  },
});

export const create = mutation({
  args: { locationId: v.id("locations"), name: v.string() },
  returns: v.id("countAreas"),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    const location = await requireLocation(
      ctx,
      organizationId,
      args.locationId,
    );
    const { name, normalizedName } = normalizeName(args.name);
    const [areas, existing] = await Promise.all([
      listCountAreas(ctx, organizationId, location._id),
      ctx.db
        .query("countAreas")
        .withIndex("by_organizationId_and_locationId_and_normalizedName", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("locationId", location._id)
            .eq("normalizedName", normalizedName),
        )
        .unique(),
    ]);
    if (areas.length >= MAX_COUNT_AREAS) {
      throw new ConvexError(
        `En lokation kan højst have ${MAX_COUNT_AREAS} Barer`,
      );
    }
    if (existing) throw new ConvexError("Baren findes allerede");
    if (areas.length === 0) {
      const currentCount = await getCurrentOpenCount(
        ctx,
        organizationId,
        location,
      );
      if (currentCount) {
        const countItem = await ctx.db
          .query("countItems")
          .withIndex("by_organizationId_and_countId", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("countId", currentCount._id),
          )
          .first();
        if (countItem) {
          throw new ConvexError(
            "Den åbne Count skal registreres, før den første Bar oprettes",
          );
        }
      }
    }

    const countAreaId = await ctx.db.insert("countAreas", {
      organizationId,
      locationId: location._id,
      name,
      normalizedName,
    });
    await recordAudit(ctx, auth, {
      action: "count.areaCreated",
      entityTable: "countAreas",
      entityId: countAreaId,
      locationId: location._id,
      summary: `Baren ${name} blev oprettet på ${location.name}`,
    });
    return countAreaId;
  },
});

export const rename = mutation({
  args: { countAreaId: v.id("countAreas"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    const { organizationId } = auth;
    const stored = await ctx.db.get("countAreas", args.countAreaId);
    if (!stored || stored.organizationId !== organizationId) {
      throw new ConvexError("Baren blev ikke fundet");
    }
    requireLocationAccess(auth, stored.locationId);
    const area = await requireCountArea(
      ctx,
      organizationId,
      stored.locationId,
      stored._id,
    );
    const { name, normalizedName } = normalizeName(args.name);
    const existing = await ctx.db
      .query("countAreas")
      .withIndex("by_organizationId_and_locationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", area.locationId)
          .eq("normalizedName", normalizedName),
      )
      .unique();
    if (existing && existing._id !== area._id) {
      throw new ConvexError("Baren findes allerede");
    }
    await ctx.db.patch("countAreas", area._id, { name, normalizedName });
    await recordAudit(ctx, auth, {
      action: "count.areaRenamed",
      entityTable: "countAreas",
      entityId: area._id,
      locationId: area.locationId,
      summary: `Baren ${area.name} blev omdøbt til ${name}`,
    });
    return null;
  },
});

export const remove = mutation({
  args: { countAreaId: v.id("countAreas") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    const { organizationId } = auth;
    const stored = await ctx.db.get("countAreas", args.countAreaId);
    if (!stored || stored.organizationId !== organizationId) {
      throw new ConvexError("Baren blev ikke fundet");
    }
    requireLocationAccess(auth, stored.locationId);
    const area = await requireCountArea(
      ctx,
      organizationId,
      stored.locationId,
      stored._id,
    );
    const location = await requireLocation(
      ctx,
      organizationId,
      area.locationId,
    );
    const currentCount = await getCurrentOpenCount(
      ctx,
      organizationId,
      location,
    );
    if (currentCount) {
      const items = await ctx.db
        .query("countItems")
        .withIndex("by_organizationId_and_countId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("countId", currentCount._id),
        )
        .take(MAX_COUNT_ITEMS + 1);
      if (items.length > MAX_COUNT_ITEMS) {
        throw new ConvexError("Count har for mange enhedslinjer");
      }
      if (items.some((item) => item.countAreaId === area._id)) {
        throw new ConvexError(
          "Baren kan ikke fjernes, mens den indgår i en åben Count",
        );
      }
      if (currentCount.completedCountAreaIds?.includes(area._id)) {
        await ctx.db.patch("counts", currentCount._id, {
          completedCountAreaIds: currentCount.completedCountAreaIds.filter(
            (countAreaId) => countAreaId !== area._id,
          ),
        });
      }
      const progress = await ctx.db
        .query("countAreaProgress")
        .withIndex(
          "by_organizationId_and_countId_and_countAreaId",
          (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("countId", currentCount._id)
              .eq("countAreaId", area._id),
        )
        .unique();
      if (progress) await ctx.db.delete("countAreaProgress", progress._id);
    }
    const order = await getCountAreaProductOrder(ctx, organizationId, area._id);
    for (const row of order) {
      await ctx.db.delete("countAreaProducts", row._id);
    }
    await ctx.db.delete("countAreas", area._id);
    await recordAudit(ctx, auth, {
      action: "count.areaDeleted",
      entityTable: "countAreas",
      entityId: area._id,
      locationId: area.locationId,
      summary: `Baren ${area.name} blev fjernet`,
    });
    return null;
  },
});

export const setProductOrder = mutation({
  args: {
    locationId: v.id("locations"),
    countAreaId: v.union(v.id("countAreas"), v.null()),
    productIds: v.array(v.id("products")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    const location = await requireLocation(
      ctx,
      organizationId,
      args.locationId,
    );
    if (
      args.productIds.length > MAX_COUNT_AREA_PRODUCTS ||
      new Set(args.productIds).size !== args.productIds.length
    ) {
      throw new ConvexError("Produktrækkefølgen er ugyldig");
    }
    const products = await Promise.all(
      args.productIds.map((productId) => ctx.db.get("products", productId)),
    );
    const access = await getLocationProductAccess(
      ctx,
      organizationId,
      location._id,
    );
    if (
      products.some(
        (product) =>
          !product ||
          product.organizationId !== organizationId ||
          product.status !== "active" ||
          !productIsAvailable(access, product._id),
      )
    ) {
      throw new ConvexError("Et Produkt er ikke tilgængeligt på lokationen");
    }

    if (!args.countAreaId) {
      const areas = await listCountAreas(ctx, organizationId, location._id);
      if (areas.length > 0) throw new ConvexError("Vælg en Bar");
      await ctx.db.patch("locations", location._id, {
        countProductOrder: args.productIds,
      });
    } else {
      const area = await requireCountArea(
        ctx,
        organizationId,
        location._id,
        args.countAreaId,
      );
      const current = await getCountAreaProductOrder(
        ctx,
        organizationId,
        area._id,
      );
      const currentCount = await getCurrentOpenCount(
        ctx,
        organizationId,
        location,
      );
      const nextProductIds = new Set(args.productIds);
      if (currentCount) {
        const countItems = await ctx.db
          .query("countItems")
          .withIndex("by_organizationId_and_countId", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("countId", currentCount._id),
          )
          .take(MAX_COUNT_ITEMS + 1);
        if (countItems.length > MAX_COUNT_ITEMS) {
          throw new ConvexError("Count har for mange enhedslinjer");
        }
        if (
          countItems.some(
            (item) =>
              item.countAreaId === area._id &&
              !nextProductIds.has(item.productId),
          )
        ) {
          throw new ConvexError(
            "Produkter med optalte mængder kan ikke fjernes fra Baren",
          );
        }
      }
      for (const row of current) {
        await ctx.db.delete("countAreaProducts", row._id);
      }
      for (const [position, productId] of args.productIds.entries()) {
        await ctx.db.insert("countAreaProducts", {
          organizationId,
          locationId: location._id,
          countAreaId: area._id,
          productId,
          position,
        });
      }
      if (currentCount?.completedCountAreaIds?.includes(area._id)) {
        await ctx.db.patch("counts", currentCount._id, {
          completedCountAreaIds: currentCount.completedCountAreaIds.filter(
            (countAreaId) => countAreaId !== area._id,
          ),
        });
      }
      if (currentCount) {
        const progress = await ctx.db
          .query("countAreaProgress")
          .withIndex(
            "by_organizationId_and_countId_and_countAreaId",
            (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("countId", currentCount._id)
                .eq("countAreaId", area._id),
          )
          .unique();
        if (progress) {
          await ctx.db.patch("countAreaProgress", progress._id, {
            countedProductIds: progress.countedProductIds.filter(
              (productId) => nextProductIds.has(productId),
            ),
          });
        }
      }
    }
    await recordAudit(ctx, auth, {
      action: "count.areaOrderChanged",
      entityTable: args.countAreaId ? "countAreas" : "locations",
      entityId: args.countAreaId ?? location._id,
      locationId: location._id,
      summary: args.countAreaId
        ? "Produktrækkefølgen for Baren blev ændret"
        : "Produktrækkefølgen for lokationen blev ændret",
    });
    return null;
  },
});
