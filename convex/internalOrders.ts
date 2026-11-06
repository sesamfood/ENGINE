import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { recordAudit } from "./lib/audit";
import { listProductUnitOptions } from "./lib/productUnits";
import {
  forecastSettings,
  forecastSettingsFields,
  requireForecastSettings,
} from "./lib/orderForecastSettings";
import {
  requireLocationAccess,
  requireOrganizationAdmin,
  requireTransferManager,
  resolveLocationFilter,
  type OrganizationAuth,
} from "./lib/auth";

const MAX_LOCATIONS = 200;
const MAX_SUPPLIER_PRODUCTS = 2000;
const MAX_OPEN_ORDERS = 100;
const MAX_ORDER_LINES = 200;

export function getInternalSupplier(
  ctx: QueryCtx,
  organizationId: string,
  locationId: Id<"locations">,
) {
  return ctx.db
    .query("internalSuppliers")
    .withIndex("by_organizationId_and_locationId", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", locationId),
    )
    .unique();
}

export function canOrderFrom(
  supplier: Doc<"internalSuppliers">,
  locationId: Id<"locations">,
) {
  return (
    supplier.active !== false &&
    supplier.locationId !== locationId &&
    (supplier.allLocations !== false ||
      supplier.orderingLocationIds.includes(locationId))
  );
}

async function listLocations(ctx: QueryCtx, organizationId: string) {
  return await ctx.db
    .query("locations")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q.eq("organizationId", organizationId),
    )
    .take(MAX_LOCATIONS);
}

export const getSettings = query({
  args: {},
  returns: v.object({
    locations: v.array(v.object({ id: v.id("locations"), name: v.string() })),
    suppliers: v.array(
      v.object({
        locationId: v.id("locations"),
        active: v.boolean(),
        allLocations: v.boolean(),
        orderingLocationIds: v.array(v.id("locations")),
        productIds: v.array(v.id("products")),
        ...forecastSettingsFields,
      }),
    ),
  }),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const [locations, suppliers] = await Promise.all([
      listLocations(ctx, organizationId),
      ctx.db
        .query("internalSuppliers")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_LOCATIONS),
    ]);
    const locationIds = new Set(locations.map((location) => location._id));
    return {
      locations: locations.map((location) => ({
        id: location._id,
        name: location.name,
      })),
      // Deleted locations drop out here and are removed on the next save.
      suppliers: suppliers.flatMap((supplier) =>
        locationIds.has(supplier.locationId)
          ? [
              {
                locationId: supplier.locationId,
                active: supplier.active !== false,
                allLocations: supplier.allLocations !== false,
                orderingLocationIds: supplier.orderingLocationIds.filter((id) =>
                  locationIds.has(id),
                ),
                productIds: supplier.productIds,
                ...forecastSettings(supplier),
              },
            ]
          : [],
      ),
    };
  },
});

export const saveSupplier = mutation({
  args: {
    locationId: v.id("locations"),
    active: v.boolean(),
    allLocations: v.boolean(),
    orderingLocationIds: v.array(v.id("locations")),
    productIds: v.array(v.id("products")),
    ...forecastSettingsFields,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireOrganizationAdmin(ctx);
    const { organizationId } = auth;
    const orderingLocationIds = [...new Set(args.orderingLocationIds)];
    const productIds = [...new Set(args.productIds)];
    if (orderingLocationIds.length > MAX_LOCATIONS) {
      throw new ConvexError("Der er valgt for mange lokationer");
    }
    if (productIds.length > MAX_SUPPLIER_PRODUCTS) {
      throw new ConvexError(
        `Vælg højst ${MAX_SUPPLIER_PRODUCTS} Produkter pr. lokation`,
      );
    }
    if (orderingLocationIds.includes(args.locationId)) {
      throw new ConvexError("En lokation kan ikke bestille hos sig selv");
    }
    for (const locationId of [args.locationId, ...orderingLocationIds]) {
      const location = await ctx.db.get("locations", locationId);
      if (location?.organizationId !== organizationId) {
        throw new ConvexError("Lokationen blev ikke fundet. Opdatér siden.");
      }
    }
    for (const productId of productIds) {
      const product = await ctx.db.get("products", productId);
      if (
        product?.organizationId !== organizationId ||
        product.status !== "active"
      ) {
        throw new ConvexError("Et Produkt blev ikke fundet. Opdatér siden.");
      }
    }
    const current = await getInternalSupplier(
      ctx,
      organizationId,
      args.locationId,
    );
    const next = {
      active: args.active,
      allLocations: args.allLocations,
      orderingLocationIds,
      productIds,
      ...requireForecastSettings(args),
      updatedAt: Date.now(),
    };
    const id = current
      ? (await ctx.db.patch("internalSuppliers", current._id, next),
        current._id)
      : await ctx.db.insert("internalSuppliers", {
          organizationId,
          locationId: args.locationId,
          ...next,
        });
    await recordAudit(ctx, auth, {
      action: "internalOrders.supplierSaved",
      entityTable: "internalSuppliers",
      entityId: id,
      locationId: args.locationId,
      summary: `Intern leverandør gemt med ${productIds.length} Produkter og ${args.allLocations ? "alle" : orderingLocationIds.length} lokationer`,
    });
    return null;
  },
});

export const removeSupplier = mutation({
  args: { locationId: v.id("locations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireOrganizationAdmin(ctx);
    const current = await getInternalSupplier(
      ctx,
      auth.organizationId,
      args.locationId,
    );
    if (!current) return null;
    // Open orders stay visible under Transfer, so they can still be fulfilled.
    await ctx.db.delete("internalSuppliers", current._id);
    await recordAudit(ctx, auth, {
      action: "internalOrders.supplierRemoved",
      entityTable: "internalSuppliers",
      entityId: current._id,
      locationId: args.locationId,
      summary: "Intern leverandør fjernet",
    });
    return null;
  },
});

async function locationName(ctx: QueryCtx, locationId: Id<"locations">) {
  return (await ctx.db.get("locations", locationId))?.name ?? "Ukendt lokation";
}

async function openOrderSummary(ctx: QueryCtx, order: Doc<"orders">) {
  const fulfillingLocationId = order.fulfillingLocationId;
  if (!fulfillingLocationId)
    throw new ConvexError("Bestillingen er ikke intern");
  return {
    id: order._id,
    locationId: order.locationId,
    locationName: await locationName(ctx, order.locationId),
    fulfillingLocationId,
    fulfillingLocationName: await locationName(ctx, fulfillingLocationId),
    createdAt: order.createdAt,
    createdByName: order.createdByName,
    itemCount: order.itemCount,
  };
}

const openOrderValidator = v.object({
  id: v.id("orders"),
  locationId: v.id("locations"),
  locationName: v.string(),
  fulfillingLocationId: v.id("locations"),
  fulfillingLocationName: v.string(),
  createdAt: v.number(),
  createdByName: v.string(),
  itemCount: v.number(),
});

// Null when internal orders are not in use, so the Transfer page can hide the tab.
export const listOpenOrders = query({
  args: {},
  returns: v.union(v.array(openOrderValidator), v.null()),
  handler: async (ctx) => {
    const auth = await requireTransferManager(ctx, "transfers.new");
    if (auth.disabledFeatures.has("ordering")) return null;
    const filter = resolveLocationFilter(auth);
    const open = (locationId?: Id<"locations">) =>
      ctx.db
        .query("orders")
        .withIndex(
          "by_org_fulfillmentStatus_fulfillingLocation_createdAt",
          (q) => {
            const byStatus = q
              .eq("organizationId", auth.organizationId)
              .eq("fulfillmentStatus", "open");
            return locationId
              ? byStatus.eq("fulfillingLocationId", locationId)
              : byStatus;
          },
        )
        .take(MAX_OPEN_ORDERS);
    const orders =
      filter === "all"
        ? await open()
        : (
            await Promise.all(
              ("locationId" in filter
                ? [filter.locationId]
                : filter.locationIds
              ).map((locationId) => open(locationId)),
            )
          ).flat();
    if (
      !orders.length &&
      !(await ctx.db
        .query("internalSuppliers")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q.eq("organizationId", auth.organizationId),
        )
        .first())
    ) {
      return null;
    }
    orders.sort((left, right) => left.createdAt - right.createdAt);
    return await Promise.all(
      orders
        .slice(0, MAX_OPEN_ORDERS)
        .map((order) => openOrderSummary(ctx, order)),
    );
  },
});

async function getInternalOrder(
  ctx: QueryCtx,
  auth: OrganizationAuth,
  orderId: Id<"orders">,
) {
  const order = await ctx.db.get("orders", orderId);
  if (
    !order ||
    order.organizationId !== auth.organizationId ||
    !order.fulfillingLocationId
  ) {
    throw new ConvexError("Bestillingen blev ikke fundet");
  }
  requireLocationAccess(auth, order.fulfillingLocationId);
  return { ...order, fulfillingLocationId: order.fulfillingLocationId };
}

export function orderVersion(order: Doc<"orders">) {
  return order.editedAt ?? order.createdAt;
}

export async function requireOpenOrder(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  orderId: Id<"orders">,
  version: number | undefined,
) {
  const order = await getInternalOrder(ctx, auth, orderId);
  if (order.fulfillmentStatus === "cancelled") {
    throw new ConvexError("Bestillingen er annulleret");
  }
  if (order.fulfillmentStatus !== "open") {
    throw new ConvexError(
      "Der er allerede oprettet en transfer for bestillingen",
    );
  }
  if (version !== orderVersion(order)) {
    throw new ConvexError(
      "Bestillingen er blevet ændret. Åbn den igen under Bestillinger.",
    );
  }
  return order;
}

async function resolveOrderLine(
  ctx: QueryCtx,
  auth: OrganizationAuth,
  line: {
    productId: Id<"products">;
    productName: string;
    unitId: Id<"units">;
    unitName: string;
    quantity: number;
  },
) {
  const { productName, unitName, quantity } = line;
  const product = await ctx.db.get("products", line.productId);
  if (
    product?.organizationId !== auth.organizationId ||
    product.status !== "active"
  ) {
    return { unavailable: { productName, unitName, quantity } };
  }
  const units = await listProductUnitOptions(ctx, product);
  // A deleted or merged unit is replaced when the Produkt has one with the same name.
  const normalizedName = unitName.toLocaleLowerCase("da");
  const unit =
    units.find(({ id }) => id === line.unitId) ??
    units.find(({ name }) => name.toLocaleLowerCase("da") === normalizedName);
  return {
    item: {
      productId: product._id,
      productName,
      unitId: unit?.id ?? line.unitId,
      unitName: unit?.name ?? unitName,
      quantity,
      maxTemperatureCelsius: product.maxTemperatureCelsius ?? null,
      units,
    },
  };
}

export const getOpenOrder = query({
  args: { orderId: v.id("orders") },
  returns: v.union(
    openOrderValidator.extend({
      version: v.number(),
      items: v.array(
        v.object({
          productId: v.id("products"),
          productName: v.string(),
          unitId: v.id("units"),
          unitName: v.string(),
          quantity: v.number(),
          maxTemperatureCelsius: v.union(v.number(), v.null()),
          units: v.array(v.object({ id: v.id("units"), name: v.string() })),
        }),
      ),
      unavailableItems: v.array(
        v.object({
          productName: v.string(),
          unitName: v.string(),
          quantity: v.number(),
        }),
      ),
    }),
    v.literal("cancelled"),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const auth = await requireTransferManager(ctx, "transfers.new");
    const order = await getInternalOrder(ctx, auth, args.orderId);
    if (order.fulfillmentStatus === "cancelled") return "cancelled";
    if (order.fulfillmentStatus !== "open") return null;
    const lines = await ctx.db
      .query("orderLines")
      .withIndex("by_organizationId_and_orderId", (q) =>
        q.eq("organizationId", auth.organizationId).eq("orderId", order._id),
      )
      .take(MAX_ORDER_LINES);
    const resolved = await Promise.all(
      lines.flatMap(({ productId, unitId, ...line }) =>
        productId && unitId
          ? [resolveOrderLine(ctx, auth, { ...line, productId, unitId })]
          : [],
      ),
    );
    return {
      ...(await openOrderSummary(ctx, order)),
      version: orderVersion(order),
      items: resolved.flatMap((line) => (line.item ? [line.item] : [])),
      unavailableItems: resolved.flatMap((line) =>
        line.unavailable ? [line.unavailable] : [],
      ),
    };
  },
});
