import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { addDays, dateKey, parseDateKey, zonedStart } from "../lib/date";
import {
  requireLocationAccess,
  requireTransferManager,
  type OrganizationAuth,
} from "./lib/auth";
import { normalizeStock } from "./lib/stock";
import { resolveTimeZone } from "./lib/timeZone";
import { getInternalSupplier } from "./internalOrders";

const PAGE = "transfers.prepplan";
const MAX_SUPPLIERS = 200;
const MAX_ORDERS = 200;
const MAX_ORDER_LINES = 200;
const MAX_RECIPE_ROWS = 200;
const MAX_RECIPE_DEPTH = 20;
const MAX_CHECKS = 2000;

function canAccess(auth: OrganizationAuth, locationId: Id<"locations">) {
  return (
    !(auth.isKioskAccount && auth.kioskLocationId !== locationId) &&
    (auth.locationScope.all || auth.locationScope.ids.has(locationId))
  );
}

function weekday(date: string) {
  return parseDateKey(date).getUTCDay();
}

// The first prep day on or after `from`. A prep day follows an order window.
function nextPlanDate(from: string, orderWindows: number[]) {
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDays(from, offset);
    if (orderWindows.includes(weekday(addDays(date, -1)))) return date;
  }
  return from;
}

const ingredientValidator = v.object({
  productName: v.string(),
  quantity: v.number(),
  unitName: v.string(),
});

const itemValidator = v.object({
  productId: v.id("products"),
  productName: v.string(),
  unitId: v.id("units"),
  unitName: v.string(),
  total: v.number(),
  stores: v.array(
    v.object({
      locationId: v.id("locations"),
      locationName: v.string(),
      quantity: v.number(),
    }),
  ),
  leadTimeHours: v.union(v.number(), v.null()),
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
              locationName: v.string(),
              createdByName: v.string(),
              createdAt: v.number(),
              comment: v.optional(v.string()),
            }),
          ),
          items: v.array(itemValidator),
          unavailableLineCount: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const auth = await requireTransferManager(ctx, PAGE);
    // Planned orders are internal orders, which belong to Bestilling.
    if (auth.disabledFeatures.has("ordering")) return null;
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
      supplier,
      date,
      timeZone,
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
    return {
      suppliers,
      plan: {
        locationId: supplier.locationId,
        date,
        today,
        orders: await Promise.all(
          orders.map(async (order) => ({
            id: order._id,
            locationName:
              (await ctx.db.get("locations", order.locationId))?.name ??
              order.locationName,
            createdByName: order.createdByName,
            createdAt: order.createdAt,
            ...(order.comment ? { comment: order.comment } : {}),
          })),
        ),
        items: items.map((item) => {
          const check = checked.get(`${item.productId}:${item.unitId}`);
          return {
            ...item,
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
  supplier: { locationId: Id<"locations">; orderWindowWeekdays: number[] },
  date: string,
  timeZone: string,
) {
  const orderDate = addDays(date, -1);
  const orders = supplier.orderWindowWeekdays.includes(weekday(orderDate))
    ? await listWindowOrders(
        ctx,
        organizationId,
        supplier.locationId,
        zonedStart(orderDate, timeZone),
        zonedStart(date, timeZone),
      )
    : [];
  return { orders, ...(await buildItems(ctx, organizationId, orders)) };
}

async function listWindowOrders(
  ctx: QueryCtx,
  organizationId: string,
  locationId: Id<"locations">,
  from: number,
  to: number,
) {
  const byStatus = (status: "open" | "transferred") =>
    ctx.db
      .query("orders")
      .withIndex("by_org_fulfillmentStatus_fulfillingLocation_createdAt", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("fulfillmentStatus", status)
          .eq("fulfillingLocationId", locationId)
          .gte("createdAt", from)
          .lt("createdAt", to),
      )
      .take(MAX_ORDERS);
  const orders = (
    await Promise.all([byStatus("open"), byStatus("transferred")])
  ).flat();
  return orders
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, MAX_ORDERS);
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
  const unitNames = new Map<Id<"units">, string>();
  const unitName = async (id: Id<"units">, fallback: string) => {
    if (!unitNames.has(id)) {
      const unit = await ctx.db.get("units", id);
      unitNames.set(
        id,
        unit?.organizationId === organizationId ? unit.name : fallback,
      );
    }
    return unitNames.get(id)!;
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
    result.push({
      productId: product._id,
      productName: product.name,
      unitId: item.unitId,
      unitName: item.unitName,
      total: normalizeStock(item.total),
      stores: [...item.stores]
        .map(([locationId, store]) => ({
          locationId,
          locationName: store.locationName,
          quantity: normalizeStock(store.quantity),
        }))
        .sort((a, b) => a.locationName.localeCompare(b.locationName, "da")),
      leadTimeHours: product.prepLeadTimeHours ?? null,
      method: product.prepMethod ?? null,
      ingredients: await scaledIngredients(item),
    });
  }
  return { items: result, unavailableLineCount };

  async function scaledIngredients(item: Item) {
    const rows = await getRecipe(item.product._id);
    if (!rows.length) return [];
    const { product } = item;
    const yieldFactor = product.recipeYield
      ? await factorToDefault(product, product.recipeYield.unitId)
      : 1;
    if (item.unitId !== product.defaultUnitId || yieldFactor === null) {
      return null;
    }
    const recipeYield = (product.recipeYield?.quantity ?? 1) * yieldFactor;
    const batches = item.total / recipeYield;
    return await Promise.all(
      rows.map(async (row) => ({
        productName:
          (await getProduct(row.ingredientProductId))?.name ??
          "Ukendt produkt",
        quantity: normalizeStock(row.quantity * batches),
        unitName: await unitName(row.unitId, ""),
      })),
    );
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
    const auth = await requireTransferManager(ctx, PAGE);
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
    if (auth.disabledFeatures.has("ordering") || supplier?.active === false) {
      throw new ConvexError("Prepplanen er ikke længere tilgængelig");
    }
    const { items } = await loadPlan(
      ctx,
      organizationId,
      {
        locationId: args.locationId,
        orderWindowWeekdays: supplier?.orderWindowWeekdays ?? [],
      },
      args.date,
      await resolveTimeZone(ctx, organizationId, args.locationId),
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
