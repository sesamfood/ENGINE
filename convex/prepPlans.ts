import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { dateKey, parseDateKey } from "../lib/date";
import { isPrepDay, prepDaysAfter } from "../lib/prep-days";
import {
  requireLocationAccess,
  requirePermission,
  requireTransferManager,
  type OrganizationAuth,
} from "./lib/auth";
import { normalizeStock } from "./lib/stock";
import { resolveTimeZone } from "./lib/timeZone";
import {
  getInternalSupplier,
  orderVersion,
  resolveOrderLine,
} from "./internalOrders";
import { insertTransfer } from "./transfers";

const PAGE = "prepplan.view";
const MAX_SUPPLIERS = 200;
const MAX_ORDERS = 200;
const MAX_ORDER_LINES = 200;
const MAX_RECIPE_ROWS = 200;
const MAX_PRODUCT_UNITS = 50;
const MAX_RECIPE_DEPTH = 20;
const MAX_CHECKS = 2000;
const MIN_TEMPERATURE = -100;
const MAX_TEMPERATURE = 100;

function canAccess(auth: OrganizationAuth, locationId: Id<"locations">) {
  return (
    !(auth.isKioskAccount && auth.kioskLocationId !== locationId) &&
    (auth.locationScope.all || auth.locationScope.ids.has(locationId))
  );
}

// The first prep day on or after `from`.
function nextPlanDate(from: string, orderWindows: number[]) {
  if (isPrepDay(from, orderWindows)) return from;
  return prepDaysAfter(from, orderWindows, 1)[0] ?? from;
}

const ingredientValidator = v.object({
  productName: v.string(),
  // 0 for the product's own recipe, 1+ for ingredients of a sub-recipe.
  depth: v.number(),
  quantity: v.number(),
  unitName: v.string(),
});

const itemValidator = v.object({
  productId: v.id("products"),
  productName: v.string(),
  unitId: v.id("units"),
  unitName: v.string(),
  // Units the total can be shown in, including the default; empty when the
  // total isn't in the default unit.
  units: v.array(
    v.object({
      unitId: v.id("units"),
      name: v.string(),
      pluralName: v.optional(v.string()),
      factorToDefault: v.number(),
    }),
  ),
  // Null shows the largest unit the total fills.
  displayUnitId: v.union(v.id("units"), v.null()),
  total: v.number(),
  stores: v.array(
    v.object({
      locationId: v.id("locations"),
      locationName: v.string(),
      quantity: v.number(),
      packed: v.union(
        v.object({
          temperatureCelsius: v.union(v.number(), v.null()),
          packedByName: v.string(),
          packedAt: v.number(),
        }),
        v.null(),
      ),
    }),
  ),
  leadTimeHours: v.union(v.number(), v.null()),
  // Set for temperature tracked Produkter, which need a temperature to be packed.
  maxTemperatureCelsius: v.union(v.number(), v.null()),
  method: v.union(v.string(), v.null()),
  // Null when the recipe can't be scaled to the ordered unit.
  ingredients: v.union(v.array(ingredientValidator), v.null()),
  checked: v.union(
    v.object({ checkedByName: v.string(), checkedAt: v.number() }),
    v.null(),
  ),
});

export const get = query({
  args: {
    locationId: v.optional(v.id("locations")),
    date: v.optional(v.string()),
    // Sent by the client so the default day rolls over on an open page.
    now: v.optional(v.number()),
  },
  returns: v.union(
    v.null(),
    v.object({
      suppliers: v.array(
        v.object({
          locationId: v.id("locations"),
          locationName: v.string(),
          orderWindowWeekdays: v.array(v.number()),
          deliveryLocationOrder: v.array(v.id("locations")),
        }),
      ),
      plan: v.union(
        v.null(),
        v.object({
          locationId: v.id("locations"),
          date: v.string(),
          today: v.string(),
          orders: v.array(
            v.object({
              id: v.id("orders"),
              locationId: v.id("locations"),
              locationName: v.string(),
              createdByName: v.string(),
              createdAt: v.number(),
              comment: v.optional(v.string()),
              transferred: v.boolean(),
            }),
          ),
          items: v.array(itemValidator),
          unavailableLineCount: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const auth = await requirePermission(ctx, "prepplan.use", PAGE);
    const { organizationId } = auth;
    const rows = await ctx.db
      .query("internalSuppliers")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_SUPPLIERS);
    const suppliers = (
      await Promise.all(
        rows
          .filter(
            (row) =>
              row.active !== false &&
              row.orderWindowWeekdays?.length &&
              canAccess(auth, row.locationId),
          )
          .map(async (row) => {
            const location = await ctx.db.get("locations", row.locationId);
            return location?.organizationId === organizationId
              ? {
                  locationId: row.locationId,
                  locationName: location.name,
                  orderWindowWeekdays: row.orderWindowWeekdays ?? [],
                  deliveryLocationOrder: row.deliveryLocationOrder ?? [],
                }
              : null;
          }),
      )
    )
      .filter((row) => row !== null)
      .sort((a, b) => a.locationName.localeCompare(b.locationName, "da"));
    const supplier =
      suppliers.find((row) => row.locationId === args.locationId) ??
      suppliers[0];
    if (!supplier) return { suppliers, plan: null };

    const timeZone = await resolveTimeZone(
      ctx,
      organizationId,
      supplier.locationId,
    );
    const today = dateKey(args.now ?? Date.now(), timeZone);
    let date = args.date ?? nextPlanDate(today, supplier.orderWindowWeekdays);
    try {
      parseDateKey(date);
    } catch {
      date = nextPlanDate(today, supplier.orderWindowWeekdays);
    }
    const { orders, items, unavailableLineCount } = await loadPlan(
      ctx,
      organizationId,
      supplier.locationId,
      date,
    );
    const checks = await ctx.db
      .query("prepPlanChecks")
      .withIndex("by_organizationId_and_locationId_and_planDate", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", supplier.locationId)
          .eq("planDate", date),
      )
      .take(MAX_CHECKS);
    const checked = new Map(
      checks.map((row) => [`${row.productId}:${row.unitId}`, row]),
    );
    const packings = await ctx.db
      .query("prepPlanPackings")
      .withIndex("by_organizationId_and_locationId_and_planDate", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", supplier.locationId)
          .eq("planDate", date),
      )
      .take(MAX_CHECKS);
    const packed = new Map(
      packings.map((row) => [
        `${row.deliveryLocationId}:${row.productId}:${row.unitId}`,
        row,
      ]),
    );
    return {
      suppliers,
      plan: {
        locationId: supplier.locationId,
        date,
        today,
        orders: await Promise.all(
          orders.map(async (order) => ({
            id: order._id,
            locationId: order.locationId,
            locationName:
              (await ctx.db.get("locations", order.locationId))?.name ??
              order.locationName,
            createdByName: order.createdByName,
            createdAt: order.createdAt,
            transferred: order.fulfillmentStatus === "transferred",
            ...(order.comment ? { comment: order.comment } : {}),
          })),
        ),
        items: items.map((item) => {
          const check = checked.get(`${item.productId}:${item.unitId}`);
          return {
            ...item,
            stores: item.stores.map((store) => {
              const row = packed.get(
                `${store.locationId}:${item.productId}:${item.unitId}`,
              );
              return {
                ...store,
                packed:
                  row?.quantity === store.quantity
                    ? {
                        temperatureCelsius: row.temperatureCelsius ?? null,
                        packedByName: row.packedByName,
                        packedAt: row.packedAt,
                      }
                    : null,
              };
            }),
            checked:
              check?.total === item.total
              ? { checkedByName: check.checkedByName, checkedAt: check.checkedAt }
              : null,
          };
        }),
        unavailableLineCount,
      },
    };
  },
});

async function loadPlan(
  ctx: QueryCtx,
  organizationId: string,
  locationId: Id<"locations">,
  date: string,
) {
  const orders = (
    await ctx.db
      .query("orders")
      .withIndex("by_org_fulfillingLocation_planDate", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("fulfillingLocationId", locationId)
          .eq("planDate", date),
      )
      .take(MAX_ORDERS * 2)
  )
    .filter((order) => order.fulfillmentStatus !== "cancelled")
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, MAX_ORDERS);
  return { orders, ...(await buildItems(ctx, organizationId, orders)) };
}

async function buildItems(
  ctx: QueryCtx,
  organizationId: string,
  orders: Doc<"orders">[],
) {
  const products = new Map<Id<"products">, Doc<"products"> | null>();
  const getProduct = async (id: Id<"products">) => {
    if (!products.has(id)) {
      const product = await ctx.db.get("products", id);
      products.set(
        id,
        product?.organizationId === organizationId ? product : null,
      );
    }
    return products.get(id) ?? null;
  };
  const factors = new Map<string, number | null>();
  const factorToDefault = async (
    product: Doc<"products">,
    unitId: Id<"units">,
  ) => {
    if (unitId === product.defaultUnitId) return 1;
    const key = `${product._id}:${unitId}`;
    if (!factors.has(key)) {
      const row = await ctx.db
        .query("productUnits")
        .withIndex("by_organizationId_and_productId_and_unitId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("productId", product._id)
            .eq("unitId", unitId),
        )
        .unique();
      factors.set(key, row?.factorToDefault ?? null);
    }
    return factors.get(key) ?? null;
  };
  const unitDocs = new Map<Id<"units">, Doc<"units"> | null>();
  const getUnit = async (id: Id<"units">) => {
    if (!unitDocs.has(id)) {
      const unit = await ctx.db.get("units", id);
      unitDocs.set(id, unit?.organizationId === organizationId ? unit : null);
    }
    return unitDocs.get(id) ?? null;
  };
  const unitName = async (id: Id<"units">, fallback: string) =>
    (await getUnit(id))?.name ?? fallback;
  // Units the total can be shown in, only for totals summed in the default unit.
  const displayUnits = async (item: Item) => {
    const { product } = item;
    if (item.unitId !== product.defaultUnitId) return [];
    const rows = await ctx.db
      .query("productUnits")
      .withIndex("by_organizationId_and_productId", (q) =>
        q.eq("organizationId", organizationId).eq("productId", product._id),
      )
      .take(MAX_PRODUCT_UNITS);
    const units = [];
    for (const row of [
      { unitId: product.defaultUnitId, factorToDefault: 1 },
      ...rows.filter((row) => row.unitId !== product.defaultUnitId),
    ]) {
      const unit = await getUnit(row.unitId);
      if (!unit || !(row.factorToDefault > 0)) continue;
      units.push({
        unitId: row.unitId,
        name: unit.name,
        pluralName: unit.pluralName,
        factorToDefault: row.factorToDefault,
      });
    }
    return units.length > 1 ? units : [];
  };

  type Item = {
    product: Doc<"products">;
    unitId: Id<"units">;
    unitName: string;
    total: number;
    stores: Map<Id<"locations">, { locationName: string; quantity: number }>;
  };
  const items = new Map<string, Item>();
  let unavailableLineCount = 0;
  for (const order of orders) {
    const lines = await ctx.db
      .query("orderLines")
      .withIndex("by_organizationId_and_orderId", (q) =>
        q.eq("organizationId", organizationId).eq("orderId", order._id),
      )
      .take(MAX_ORDER_LINES);
    for (const line of lines) {
      const product = line.productId ? await getProduct(line.productId) : null;
      // Archived Produkter stay in the plan; deleted ones can't be made.
      if (!product || !line.unitId) {
        unavailableLineCount += 1;
        continue;
      }
      // Sum in the default unit; keep a unit that can't be converted apart.
      const factor = await factorToDefault(product, line.unitId);
      const unitId = factor === null ? line.unitId : product.defaultUnitId;
      const quantity = factor === null ? line.quantity : line.quantity * factor;
      const key = `${product._id}:${unitId}`;
      let item = items.get(key);
      if (!item) {
        item = {
          product,
          unitId,
          unitName: await unitName(unitId, line.unitName),
          total: 0,
          stores: new Map(),
        };
        items.set(key, item);
      }
      item.total += quantity;
      const store = item.stores.get(order.locationId) ?? {
        locationName: order.locationName,
        quantity: 0,
      };
      store.quantity += quantity;
      item.stores.set(order.locationId, store);
    }
  }

  const recipes = new Map<Id<"products">, Doc<"productIngredients">[]>();
  const getRecipe = async (productId: Id<"products">) => {
    let rows = recipes.get(productId);
    if (!rows) {
      rows = (
        await ctx.db
          .query("productIngredients")
          .withIndex("by_organizationId_and_productId", (q) =>
            q.eq("organizationId", organizationId).eq("productId", productId),
          )
          .take(MAX_RECIPE_ROWS)
      ).filter((row) => !row.packaging);
      recipes.set(productId, rows);
    }
    return rows;
  };
  // Every product used, directly or through a component, in each planned product.
  const components = new Map<Id<"products">, Set<Id<"products">>>();
  for (const item of items.values()) {
    if (components.has(item.product._id)) continue;
    const seen = new Set<Id<"products">>();
    let frontier = [item.product._id];
    for (let depth = 0; depth < MAX_RECIPE_DEPTH && frontier.length; depth += 1) {
      const next: Id<"products">[] = [];
      for (const productId of frontier) {
        for (const row of await getRecipe(productId)) {
          if (seen.has(row.ingredientProductId)) continue;
          seen.add(row.ingredientProductId);
          next.push(row.ingredientProductId);
        }
      }
      frontier = next;
    }
    components.set(item.product._id, seen);
  }

  const ordered = prepOrder([...items.values()], (item, other) =>
    Boolean(components.get(other.product._id)?.has(item.product._id)),
  );

  const result = [];
  for (const item of ordered) {
    const { product } = item;
    const units = await displayUnits(item);
    result.push({
      productId: product._id,
      productName: product.name,
      unitId: item.unitId,
      unitName: item.unitName,
      units,
      displayUnitId:
        units.find((unit) => unit.unitId === product.prepDisplayUnitId)
          ?.unitId ?? null,
      total: normalizeStock(item.total),
      stores: [...item.stores]
        .map(([locationId, store]) => ({
          locationId,
          locationName: store.locationName,
          quantity: normalizeStock(store.quantity),
        }))
        .sort((a, b) => a.locationName.localeCompare(b.locationName, "da")),
      leadTimeHours: product.prepLeadTimeHours ?? null,
      maxTemperatureCelsius: product.maxTemperatureCelsius ?? null,
      method: product.prepMethod ?? null,
      ingredients: await scaledIngredients(item),
    });
  }
  return { items: result, unavailableLineCount };

  async function scaledIngredients(item: Item) {
    const { product } = item;
    if (!(await getRecipe(product._id)).length) return [];
    if (item.unitId !== product.defaultUnitId) return null;
    return await recipeRows(product, item.total, 0, new Set([product._id]));
  }

  // Rows for `total` default units of `product`, with sub-recipes expanded
  // below their ingredient. Null when the yield can't be converted.
  async function recipeRows(
    product: Doc<"products">,
    total: number,
    depth: number,
    path: Set<Id<"products">>,
  ) {
    const yieldFactor = product.recipeYield
      ? await factorToDefault(product, product.recipeYield.unitId)
      : 1;
    if (yieldFactor === null) return null;
    const batches =
      total / ((product.recipeYield?.quantity ?? 1) * yieldFactor);
    const result: Array<{
      productName: string;
      depth: number;
      quantity: number;
      unitName: string;
    }> = [];
    for (const row of await getRecipe(product._id)) {
      const ingredient = await getProduct(row.ingredientProductId);
      const quantity = row.quantity * batches;
      result.push({
        productName: ingredient?.name ?? "Ukendt produkt",
        depth,
        quantity: normalizeStock(quantity),
        unitName: await unitName(row.unitId, ""),
      });
      if (!ingredient || path.has(ingredient._id) || depth >= 4) continue;
      const factor = await factorToDefault(ingredient, row.unitId);
      if (factor === null) continue;
      const children = await recipeRows(
        ingredient,
        quantity * factor,
        depth + 1,
        new Set([...path, ingredient._id]),
      );
      if (children) result.push(...children);
    }
    return result;
  }
}

// Components before the products that use them, then the longest lead time first.
function prepOrder<T extends { product: Doc<"products"> }>(
  items: T[],
  usedBy: (item: T, other: T) => boolean,
) {
  // A component is as urgent as the slowest planned product that uses it.
  const leadTime = new Map(
    items.map((item) => [
      item,
      Math.max(
        ...items
          .filter((other) => other === item || usedBy(item, other))
          .map((other) => other.product.prepLeadTimeHours ?? 0),
      ),
    ]),
  );
  const rank = (a: T, b: T) =>
    leadTime.get(b)! - leadTime.get(a)! ||
    a.product.name.localeCompare(b.product.name, "da");
  const remaining = [...items];
  const result: T[] = [];
  while (remaining.length) {
    const ready = remaining.filter(
      (item) => !remaining.some((other) => other !== item && usedBy(other, item)),
    );
    // A circular recipe falls back to plain ranking.
    const next = (ready.length ? ready : remaining).sort(rank)[0];
    result.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return result;
}

export const setChecked = mutation({
  args: {
    locationId: v.id("locations"),
    date: v.string(),
    productId: v.id("products"),
    unitId: v.id("units"),
    total: v.number(),
    checked: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requirePermission(ctx, "prepplan.use", PAGE);
    requireLocationAccess(auth, args.locationId);
    try {
      parseDateKey(args.date);
    } catch {
      throw new ConvexError("Datoen er ugyldig");
    }
    const { organizationId } = auth;
    const location = await ctx.db.get("locations", args.locationId);
    const product = await ctx.db.get("products", args.productId);
    if (
      location?.organizationId !== organizationId ||
      product?.organizationId !== organizationId
    ) {
      throw new ConvexError("Prepplanen blev ikke fundet. Opdatér siden.");
    }
    // Reject a toggle made from a stale screen, so it can't replace a newer check.
    const supplier = await getInternalSupplier(
      ctx,
      organizationId,
      args.locationId,
    );
    if (supplier?.active === false) {
      throw new ConvexError("Prepplanen er ikke længere tilgængelig");
    }
    const { items } = await loadPlan(
      ctx,
      organizationId,
      args.locationId,
      args.date,
    );
    const item = items.find(
      (row) => row.productId === args.productId && row.unitId === args.unitId,
    );
    if (item?.total !== args.total) {
      throw new ConvexError("Prepplanen er ændret. Tjek mængden igen.");
    }
    const rows = await ctx.db
      .query("prepPlanChecks")
      .withIndex("by_organizationId_and_locationId_and_planDate", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", args.locationId)
          .eq("planDate", args.date),
      )
      .take(MAX_CHECKS);
    const existing = rows.filter(
      (row) => row.productId === args.productId && row.unitId === args.unitId,
    );
    for (const row of existing) await ctx.db.delete("prepPlanChecks", row._id);
    if (!args.checked) return null;
    await ctx.db.insert("prepPlanChecks", {
      organizationId,
      locationId: args.locationId,
      planDate: args.date,
      productId: args.productId,
      unitId: args.unitId,
      total: args.total,
      checkedAt: Date.now(),
      checkedBy: auth.userIdentifier,
      checkedByName: auth.userName,
    });
    return null;
  },
});

// Remembers which unit the Prepplan shows a product's total in, for the whole organization.
export const setDisplayUnit = mutation({
  args: {
    productId: v.id("products"),
    unitId: v.union(v.id("units"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requirePermission(
      ctx,
      "prepplan.use",
      PAGE,
    );
    const product = await ctx.db.get("products", args.productId);
    if (product?.organizationId !== organizationId) {
      throw new ConvexError("Produktet blev ikke fundet");
    }
    if (args.unitId && args.unitId !== product.defaultUnitId) {
      const unitId = args.unitId;
      const row = await ctx.db
        .query("productUnits")
        .withIndex("by_organizationId_and_productId_and_unitId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("productId", product._id)
            .eq("unitId", unitId),
        )
        .unique();
      if (!row) throw new ConvexError("Enheden findes ikke på produktet");
    }
    await ctx.db.patch("products", product._id, {
      prepDisplayUnitId: args.unitId ?? undefined,
    });
    return null;
  },
});

// Remembers the order the supplier's deliveries are packed in, for future prep days.
export const setDeliveryOrder = mutation({
  args: {
    locationId: v.id("locations"),
    locationIds: v.array(v.id("locations")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requirePermission(ctx, "prepplan.use", PAGE);
    requireLocationAccess(auth, args.locationId);
    const { organizationId } = auth;
    const supplier = await getInternalSupplier(
      ctx,
      organizationId,
      args.locationId,
    );
    if (!supplier || supplier.active === false) {
      throw new ConvexError("Prepplanen er ikke længere tilgængelig");
    }
    const ids = [...new Set(args.locationIds)];
    if (ids.length > MAX_SUPPLIERS) {
      throw new ConvexError("Der er for mange lokationer");
    }
    for (const id of ids) {
      const location = await ctx.db.get("locations", id);
      if (location?.organizationId !== organizationId) {
        throw new ConvexError("Lokationen blev ikke fundet");
      }
    }
    await ctx.db.patch("internalSuppliers", supplier._id, {
      deliveryLocationOrder: ids,
    });
    return null;
  },
});

// Marks one ordering location's product as packed, optionally with its temperature.
export const setPacked = mutation({
  args: {
    locationId: v.id("locations"),
    date: v.string(),
    deliveryLocationId: v.id("locations"),
    productId: v.id("products"),
    unitId: v.id("units"),
    quantity: v.number(),
    packed: v.boolean(),
    temperatureCelsius: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requirePermission(ctx, "prepplan.use", PAGE);
    requireLocationAccess(auth, args.locationId);
    try {
      parseDateKey(args.date);
    } catch {
      throw new ConvexError("Datoen er ugyldig");
    }
    const temperature = args.temperatureCelsius;
    if (
      temperature !== undefined &&
      !(temperature >= MIN_TEMPERATURE && temperature <= MAX_TEMPERATURE)
    ) {
      throw new ConvexError(
        `Temperaturen skal være mellem ${MIN_TEMPERATURE} og ${MAX_TEMPERATURE} °C`,
      );
    }
    const { organizationId } = auth;
    const supplier = await getInternalSupplier(
      ctx,
      organizationId,
      args.locationId,
    );
    if (!supplier || supplier.active === false) {
      throw new ConvexError("Prepplanen er ikke længere tilgængelig");
    }
    // Reject a change made from a stale screen.
    const { items } = await loadPlan(
      ctx,
      organizationId,
      args.locationId,
      args.date,
    );
    const store = items
      .find(
        (row) => row.productId === args.productId && row.unitId === args.unitId,
      )
      ?.stores.find((row) => row.locationId === args.deliveryLocationId);
    if (store?.quantity !== args.quantity) {
      throw new ConvexError("Prepplanen er ændret. Tjek mængden igen.");
    }
    if (args.packed && temperature === undefined) {
      const product = await ctx.db.get("products", args.productId);
      if (product?.maxTemperatureCelsius !== undefined) {
        throw new ConvexError(`Indtast temperaturen for ${product.name}`);
      }
    }
    const rows = await ctx.db
      .query("prepPlanPackings")
      .withIndex("by_organizationId_and_locationId_and_planDate", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", args.locationId)
          .eq("planDate", args.date),
      )
      .take(MAX_CHECKS);
    for (const row of rows) {
      if (
        row.deliveryLocationId === args.deliveryLocationId &&
        row.productId === args.productId &&
        row.unitId === args.unitId
      ) {
        await ctx.db.delete("prepPlanPackings", row._id);
      }
    }
    if (!args.packed) return null;
    await ctx.db.insert("prepPlanPackings", {
      organizationId,
      locationId: args.locationId,
      planDate: args.date,
      deliveryLocationId: args.deliveryLocationId,
      productId: args.productId,
      unitId: args.unitId,
      quantity: args.quantity,
      ...(temperature !== undefined ? { temperatureCelsius: temperature } : {}),
      packedAt: Date.now(),
      packedBy: auth.userIdentifier,
      packedByName: auth.userName,
    });
    return null;
  },
});

// Creates a Transfer for every open order on a fully packed Prepplan day.
export const createTransfers = mutation({
  args: {
    locationId: v.id("locations"),
    date: v.string(),
    responsibleUserId: v.string(),
    // Required for each ordering location with a temperature above a Produkt's maximum.
    deviationComments: v.array(
      v.object({ deliveryLocationId: v.id("locations"), comment: v.string() }),
    ),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const auth = await requireTransferManager(ctx, "transfers.new");
    requireLocationAccess(auth, args.locationId);
    try {
      parseDateKey(args.date);
    } catch {
      throw new ConvexError("Datoen er ugyldig");
    }
    const { organizationId } = auth;
    const supplier = await getInternalSupplier(
      ctx,
      organizationId,
      args.locationId,
    );
    if (!supplier || supplier.active === false) {
      throw new ConvexError("Prepplanen er ikke længere tilgængelig");
    }
    const { orders, items } = await loadPlan(
      ctx,
      organizationId,
      args.locationId,
      args.date,
    );
    const packings = await ctx.db
      .query("prepPlanPackings")
      .withIndex("by_organizationId_and_locationId_and_planDate", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", args.locationId)
          .eq("planDate", args.date),
      )
      .take(MAX_CHECKS);
    const packed = new Map(
      packings.map((row) => [
        `${row.deliveryLocationId}:${row.productId}:${row.unitId}`,
        row,
      ]),
    );
    for (const item of items) {
      for (const store of item.stores) {
        const row = packed.get(
          `${store.locationId}:${item.productId}:${item.unitId}`,
        );
        if (row?.quantity !== store.quantity) {
          throw new ConvexError(
            "Alle produkter skal være pakket, før transfers kan oprettes",
          );
        }
      }
    }
    const temperatures = new Map<string, number>();
    for (const row of packings) {
      if (row.temperatureCelsius === undefined) continue;
      temperatures.set(
        `${row.deliveryLocationId}:${row.productId}`,
        row.temperatureCelsius,
      );
    }
    const comments = new Map(
      args.deviationComments.map((row) => [
        row.deliveryLocationId,
        row.comment,
      ]),
    );
    const transferredAt = Date.now();
    let created = 0;
    for (const order of orders) {
      if (order.fulfillmentStatus !== "open") continue;
      const lines = await ctx.db
        .query("orderLines")
        .withIndex("by_organizationId_and_orderId", (q) =>
          q.eq("organizationId", organizationId).eq("orderId", order._id),
        )
        .take(MAX_ORDER_LINES);
      const resolved = await Promise.all(
        lines.flatMap(({ productId, unitId, ...line }) =>
          productId && unitId
            ? [resolveOrderLine(ctx, auth, { ...line, productId, unitId })]
            : [],
        ),
      );
      // Archived Produkter can't be sent, as on the order's Transfer page.
      const lineItems = resolved.flatMap((line) =>
        line.item ? [line.item] : [],
      );
      if (!lineItems.length) continue;
      const products = new Map(
        lineItems.map((line) => [line.productId, line.maxTemperatureCelsius]),
      );
      const productTemperatures = [];
      const confirmedTemperatureDeviations = [];
      for (const [productId, maximum] of products) {
        const temperatureCelsius = temperatures.get(
          `${order.locationId}:${productId}`,
        );
        if (temperatureCelsius === undefined) continue;
        productTemperatures.push({ productId, temperatureCelsius });
        // The comment asked for in the Prepplan confirms the deviation.
        if (maximum !== null && temperatureCelsius > maximum) {
          confirmedTemperatureDeviations.push({
            productId,
            maxTemperatureCelsius: maximum,
          });
        }
      }
      const comment = comments.get(order.locationId);
      await insertTransfer(ctx, auth, {
        fromLocationId: args.locationId,
        toLocationId: order.locationId,
        responsibleUserId: args.responsibleUserId,
        ...(comment !== undefined ? { comment } : {}),
        transferredAt,
        items: lineItems.map(({ productId, unitId, quantity }) => ({
          productId,
          unitId,
          quantity,
        })),
        productTemperatures,
        confirmedTemperatureDeviations,
        orderId: order._id,
        orderVersion: orderVersion(order),
      });
      created += 1;
    }
    if (!created) {
      throw new ConvexError(
        "Der er ingen åbne bestillinger at oprette transfers for",
      );
    }
    return created;
  },
});
