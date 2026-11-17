import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server";
import {
  requireCatalogManager,
  requireIntegrationManager,
} from "../../lib/auth";
import {
  invalidateSalesStockMappings,
  MAX_MODIFIER_DEFAULTS,
} from "../../lib/salesStock";
import { isIntegrationEnabled } from "../state";
import {
  getOnlinePosLocationMaster,
  onlinePosCatalogId,
  MAX_MASTER_CONNECTIONS,
} from "./lib/connections";
import {
  requestProducts,
  type OnlinePosProduct,
  type OnlinePosSettings,
} from "./lib/api";

const MAX_SOLD = 1000;
const MAX_ITEMS = 200;
const MAX_INGREDIENT_ROWS = 4000;
// Skip rewriting a row for every batch of the same busy product.
const LAST_SOLD_PRECISION_MS = 60 * 60 * 1000;

export async function recordSoldProducts(
  ctx: MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
  lines: Array<{
    externalProductId: string;
    productName: string;
    occurredAt: number;
  }>,
) {
  const latest = new Map<number, { name: string; occurredAt: number }>();
  for (const line of lines) {
    const id = Number(line.externalProductId);
    if (!Number.isSafeInteger(id) || String(id) !== line.externalProductId)
      continue;
    const current = latest.get(id);
    if (!current || line.occurredAt > current.occurredAt)
      latest.set(id, { name: line.productName, occurredAt: line.occurredAt });
  }
  if (latest.size === 0) return;
  const master = await getOnlinePosLocationMaster(
    ctx,
    organizationId,
    locationId,
  );
  if (!master) return;
  for (const [onlinePosProductId, sale] of latest) {
    const row = await ctx.db
      .query("onlinePosSoldProducts")
      .withIndex(
        "by_organizationId_and_integrationId_and_onlinePosProductId",
        (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("integrationId", master._id)
            .eq("onlinePosProductId", onlinePosProductId),
      )
      .unique();
    if (!row) {
      await ctx.db.insert("onlinePosSoldProducts", {
        organizationId,
        integrationId: master._id,
        onlinePosProductId,
        name: sale.name,
        lastSoldAt: sale.occurredAt,
      });
    } else if (
      sale.occurredAt > row.lastSoldAt + LAST_SOLD_PRECISION_MS ||
      (sale.occurredAt >= row.lastSoldAt && sale.name !== row.name)
    ) {
      await ctx.db.patch("onlinePosSoldProducts", row._id, {
        name: sale.name,
        lastSoldAt: sale.occurredAt,
      });
    }
  }
}

async function loadMasters(ctx: QueryCtx, organizationId: string) {
  if (!(await isIntegrationEnabled(ctx, organizationId, "onlinepos")))
    return [];
  return ctx.db
    .query("onlinePosIntegrations")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .take(MAX_MASTER_CONNECTIONS);
}

async function loadSold(
  ctx: QueryCtx,
  organizationId: string,
  master: Doc<"onlinePosIntegrations">,
  since: number,
) {
  return ctx.db
    .query("onlinePosSoldProducts")
    .withIndex("by_organizationId_and_integrationId_and_lastSoldAt", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("integrationId", master._id)
        .gte("lastSoldAt", since),
    )
    .order("desc")
    .take(MAX_SOLD);
}

async function loadCatalog(
  ctx: QueryCtx,
  organizationId: string,
  master: Doc<"onlinePosIntegrations">,
) {
  const catalogId = onlinePosCatalogId(master);
  const [mappings, menus] = await Promise.all([
    ctx.db
      .query("onlinePosProductMappings")
      .withIndex("by_organizationId_and_integrationId", (q) =>
        q.eq("organizationId", organizationId).eq("integrationId", catalogId),
      )
      .take(501),
    ctx.db
      .query("onlinePosMenus")
      .withIndex("by_organizationId_and_integrationId", (q) =>
        q.eq("organizationId", organizationId).eq("integrationId", catalogId),
      )
      .take(101),
  ]);
  return {
    products: new Map(
      mappings.map((row) => [row.onlinePosProductId, row.productId]),
    ),
    menus: new Map(menus.map((menu) => [menu.onlinePosProductId, menu])),
  };
}

// Mirrors the per-row id resolution in lib/salesStock.ts.
function rowModifierIds(
  master: Doc<"onlinePosIntegrations">,
  removals: Doc<"productIngredients">[],
  additions: Doc<"productIngredientAdditions">[],
) {
  const ids = new Set<number>();
  for (const row of removals) {
    if (!row.removable) continue;
    const id =
      row.onlinePosRemovalMappings?.find(
        (mapping) => mapping.integrationId === master._id,
      )?.onlinePosProductId ??
      (row.onlinePosRemovalIntegrationId === master._id &&
      row.onlinePosRemovalCompanyId === master.companyId
        ? row.onlinePosRemovalProductId
        : undefined);
    if (id !== undefined) ids.add(id);
  }
  for (const row of additions) {
    const id =
      row.onlinePosAdditionMappings?.find(
        (mapping) => mapping.integrationId === master._id,
      )?.onlinePosProductId ??
      (row.onlinePosAdditionIntegrationId === master._id &&
      row.onlinePosAdditionCompanyId === master.companyId
        ? row.onlinePosAdditionProductId
        : undefined);
    if (id !== undefined) ids.add(id);
  }
  return ids;
}

export const listSold = internalQuery({
  args: {
    organizationId: v.string(),
    integrationId: v.id("onlinePosIntegrations"),
  },
  returns: v.array(v.object({ id: v.number(), name: v.string() })),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("onlinePosSoldProducts")
      .withIndex("by_organizationId_and_integrationId_and_lastSoldAt", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("integrationId", args.integrationId),
      )
      .order("desc")
      .take(MAX_SOLD);
    return rows.map((row) => ({ id: row.onlinePosProductId, name: row.name }));
  },
});

type SoldName = { id: number; name: string };
type RemapCounts = typeof remapCountsValidator.type;

function nameKey(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("da");
}

// Sales arrive with koncern ids, while getProducts can return a shop's local
// ids for the same products. Prefer the ids seen in sales, since stock matching
// uses them, and keep unsold catalog products whose names have no sold match.
export async function requestMappableProducts(
  ctx: ActionCtx,
  organizationId: string,
  integrationId: Id<"onlinePosIntegrations">,
  settings: OnlinePosSettings,
): Promise<OnlinePosProduct[]> {
  const catalog = await requestProducts(settings);
  const sold: SoldName[] = await ctx.runQuery(
    internal.integrations.onlinepos.salesAlerts.listSold,
    { organizationId, integrationId },
  );
  const groups = new Map(
    catalog.map((product) => [nameKey(product.name), product.groupName]),
  );
  const soldIds = new Set(sold.map((product) => product.id));
  const soldNames = new Set(sold.map((product) => nameKey(product.name)));
  return [
    ...sold.map((product) => ({
      id: product.id,
      name: product.name.trim(),
      groupName: groups.get(nameKey(product.name)) ?? "",
    })),
    ...catalog.filter(
      (product) =>
        !soldIds.has(product.id) && !soldNames.has(nameKey(product.name)),
    ),
  ];
}

const soldItemValidator = v.object({
  integrationId: v.id("onlinePosIntegrations"),
  integrationName: v.string(),
  onlinePosProductId: v.number(),
  name: v.string(),
  lastSoldAt: v.number(),
});

export const getUnmappedSales = query({
  args: { since: v.number() },
  returns: v.object({
    items: v.array(soldItemValidator),
    ignored: v.array(soldItemValidator),
    multipleMasters: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { organizationId } = await requireIntegrationManager(ctx);
    const masters = await loadMasters(ctx, organizationId);
    const items: Array<typeof soldItemValidator.type> = [];
    const ignored: Array<typeof soldItemValidator.type> = [];
    let rows:
      | {
          removals: Doc<"productIngredients">[];
          additions: Doc<"productIngredientAdditions">[];
        }
      | undefined;
    for (const master of masters) {
      const sold = await loadSold(ctx, organizationId, master, args.since);
      if (sold.length === 0) continue;
      const [catalog, modifierDefaults] = await Promise.all([
        loadCatalog(ctx, organizationId, master),
        ctx.db
          .query("onlinePosModifierMappings")
          .withIndex("by_organizationId_and_integrationId", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("integrationId", master._id),
          )
          .take(MAX_MODIFIER_DEFAULTS),
      ]);
      const defaultIds = new Set(
        modifierDefaults.map((row) => row.onlinePosProductId),
      );
      let candidates = sold.filter(
        (row) =>
          !catalog.products.has(row.onlinePosProductId) &&
          !catalog.menus.has(row.onlinePosProductId) &&
          !defaultIds.has(row.onlinePosProductId),
      );
      if (candidates.length === 0) continue;
      // Per-product modifier ids have no index, so scan only when needed.
      rows ??= {
        removals: await ctx.db
          .query("productIngredients")
          .withIndex("by_organizationId_and_productId", (q) =>
            q.eq("organizationId", organizationId),
          )
          .take(MAX_INGREDIENT_ROWS),
        additions: await ctx.db
          .query("productIngredientAdditions")
          .withIndex("by_organizationId_and_productId", (q) =>
            q.eq("organizationId", organizationId),
          )
          .take(MAX_INGREDIENT_ROWS),
      };
      const rowIds = rowModifierIds(master, rows.removals, rows.additions);
      candidates = candidates.filter(
        (row) => !rowIds.has(row.onlinePosProductId),
      );
      for (const row of candidates) {
        const item = {
          integrationId: master._id,
          integrationName: master.name ?? `Firma ${master.companyId}`,
          onlinePosProductId: row.onlinePosProductId,
          name: row.name,
          lastSoldAt: row.lastSoldAt,
        };
        if (row.ignored) {
          if (ignored.length < MAX_ITEMS) ignored.push(item);
        } else if (items.length < MAX_ITEMS) items.push(item);
      }
    }
    return { items, ignored, multipleMasters: masters.length > 1 };
  },
});

export const setSoldProductIgnored = mutation({
  args: {
    integrationId: v.id("onlinePosIntegrations"),
    onlinePosProductId: v.number(),
    ignored: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireIntegrationManager(ctx);
    const row = await ctx.db
      .query("onlinePosSoldProducts")
      .withIndex(
        "by_organizationId_and_integrationId_and_onlinePosProductId",
        (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("integrationId", args.integrationId)
            .eq("onlinePosProductId", args.onlinePosProductId),
      )
      .unique();
    if (!row) throw new ConvexError("Salgsproduktet blev ikke fundet");
    await ctx.db.patch("onlinePosSoldProducts", row._id, {
      ignored: args.ignored || undefined,
    });
    return null;
  },
});

const productItemValidator = v.object({
  productId: v.id("products"),
  name: v.string(),
});

export const getProductsWithoutIngredients = query({
  args: { since: v.number() },
  returns: v.object({
    items: v.array(productItemValidator),
    ignored: v.array(productItemValidator),
  }),
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
    const masters = await loadMasters(ctx, organizationId);
    const productIds = new Set<Id<"products">>();
    for (const master of masters) {
      const sold = await loadSold(ctx, organizationId, master, args.since);
      if (sold.length === 0) continue;
      const catalog = await loadCatalog(ctx, organizationId, master);
      for (const row of sold) {
        const menu = catalog.menus.get(row.onlinePosProductId);
        if (menu) {
          for (const item of menu.products) productIds.add(item.productId);
          continue;
        }
        const productId = catalog.products.get(row.onlinePosProductId);
        if (productId) productIds.add(productId);
      }
    }
    const items: Array<typeof productItemValidator.type> = [];
    const ignored: Array<typeof productItemValidator.type> = [];
    for (const productId of productIds) {
      if (items.length >= MAX_ITEMS && ignored.length >= MAX_ITEMS) break;
      const [product, ingredients, ignore] = await Promise.all([
        ctx.db.get("products", productId),
        ctx.db
          .query("productIngredients")
          .withIndex("by_organizationId_and_productId", (q) =>
            q.eq("organizationId", organizationId).eq("productId", productId),
          )
          .take(20),
        ctx.db
          .query("missingIngredientIgnores")
          .withIndex("by_organizationId_and_productId", (q) =>
            q.eq("organizationId", organizationId).eq("productId", productId),
          )
          .first(),
      ]);
      if (
        !product ||
        product.organizationId !== organizationId ||
        product.status !== "active" ||
        ingredients.some((row) => !row.packaging)
      )
        continue;
      const item = { productId, name: product.name };
      if (ignore) {
        if (ignored.length < MAX_ITEMS) ignored.push(item);
      } else if (items.length < MAX_ITEMS) items.push(item);
    }
    const byName = (
      left: typeof productItemValidator.type,
      right: typeof productItemValidator.type,
    ) => left.name.localeCompare(right.name, "da");
    return { items: items.sort(byName), ignored: ignored.sort(byName) };
  },
});

export const setMissingIngredientsIgnored = mutation({
  args: { productId: v.id("products"), ignored: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
    const [product, current] = await Promise.all([
      ctx.db.get("products", args.productId),
      ctx.db
        .query("missingIngredientIgnores")
        .withIndex("by_organizationId_and_productId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("productId", args.productId),
        )
        .first(),
    ]);
    if (!product || product.organizationId !== organizationId)
      throw new ConvexError("Produktet blev ikke fundet");
    if (args.ignored && !current) {
      await ctx.db.insert("missingIngredientIgnores", {
        organizationId,
        productId: args.productId,
      });
    } else if (!args.ignored && current) {
      await ctx.db.delete("missingIngredientIgnores", current._id);
    }
    return null;
  },
});

const BACKFILL_DAYS = 90;
const BACKFILL_PAGE = 200;

// One-off: seed onlinePosSoldProducts from stored sales lines.
export const backfillSoldProducts = internalMutation({
  args: {
    organizationId: v.string(),
    since: v.optional(v.number()),
    locationIndex: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const since = args.since ?? Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000;
    const index = args.locationIndex ?? 0;
    const connections = await ctx.db
      .query("onlinePosLocationIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .take(201);
    const connection = connections[index];
    if (!connection) return null;
    const page = await ctx.db
      .query("salesLines")
      .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("locationId", connection.locationId)
          .gte("occurredAt", since),
      )
      .paginate({ numItems: BACKFILL_PAGE, cursor: args.cursor ?? null });
    await recordSoldProducts(
      ctx,
      args.organizationId,
      connection.locationId,
      page.page,
    );
    await ctx.scheduler.runAfter(
      0,
      internal.integrations.onlinepos.salesAlerts.backfillSoldProducts,
      page.isDone
        ? { organizationId: args.organizationId, since, locationIndex: index + 1 }
        : {
            organizationId: args.organizationId,
            since,
            locationIndex: index,
            cursor: page.continueCursor,
          },
    );
    return null;
  },
});

export const listMasterIds = internalQuery({
  args: { organizationId: v.string() },
  returns: v.array(v.id("onlinePosIntegrations")),
  handler: async (ctx, args) => {
    const masters = await ctx.db
      .query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .take(MAX_MASTER_CONNECTIONS);
    return masters.map((master) => master._id);
  },
});

const remapCountsValidator = v.object({
  products: v.number(),
  modifiers: v.number(),
  menus: v.number(),
  removals: v.number(),
  additions: v.number(),
  conflicts: v.number(),
});

export const applyIdRemap = internalMutation({
  args: {
    organizationId: v.string(),
    integrationId: v.id("onlinePosIntegrations"),
    pairs: v.array(v.object({ from: v.number(), to: v.number() })),
  },
  returns: remapCountsValidator,
  handler: async (ctx, args) => {
    const { organizationId } = args;
    const master = await ctx.db.get("onlinePosIntegrations", args.integrationId);
    if (!master || master.organizationId !== organizationId)
      throw new ConvexError("Masterforbindelsen blev ikke fundet");
    const remap = new Map(args.pairs.map((pair) => [pair.from, pair.to]));
    const catalogId = onlinePosCatalogId(master);
    const counts = {
      products: 0,
      modifiers: 0,
      menus: 0,
      removals: 0,
      additions: 0,
      conflicts: 0,
    };
    const [mappings, modifiers, menus, removals, additions] = await Promise.all([
      ctx.db
        .query("onlinePosProductMappings")
        .withIndex("by_organizationId_and_integrationId", (q) =>
          q.eq("organizationId", organizationId).eq("integrationId", catalogId),
        )
        .take(501),
      ctx.db
        .query("onlinePosModifierMappings")
        .withIndex("by_organizationId_and_integrationId", (q) =>
          q.eq("organizationId", organizationId).eq("integrationId", master._id),
        )
        .take(MAX_MODIFIER_DEFAULTS + 1),
      ctx.db
        .query("onlinePosMenus")
        .withIndex("by_organizationId_and_integrationId", (q) =>
          q.eq("organizationId", organizationId).eq("integrationId", catalogId),
        )
        .take(101),
      ctx.db
        .query("productIngredients")
        .withIndex("by_organizationId_and_productId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_INGREDIENT_ROWS),
      ctx.db
        .query("productIngredientAdditions")
        .withIndex("by_organizationId_and_productId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_INGREDIENT_ROWS),
    ]);
    // Product, modifier and menu ids must stay unique within their table.
    for (const [rows, table, key] of [
      [mappings, "onlinePosProductMappings", "products"],
      [modifiers, "onlinePosModifierMappings", "modifiers"],
      [menus, "onlinePosMenus", "menus"],
    ] as const) {
      const used = new Set(rows.map((row) => row.onlinePosProductId));
      for (const row of rows) {
        const to = remap.get(row.onlinePosProductId);
        if (to === undefined) continue;
        if (used.has(to)) {
          counts.conflicts += 1;
          continue;
        }
        used.delete(row.onlinePosProductId);
        used.add(to);
        await ctx.db.patch(table, row._id, { onlinePosProductId: to });
        counts[key] += 1;
      }
    }
    const legacy = (integrationId?: Id<"onlinePosIntegrations">, companyId?: number) =>
      integrationId === master._id && companyId === master.companyId;
    for (const row of removals) {
      const list = row.onlinePosRemovalMappings?.map((mapping) =>
        mapping.integrationId === master._id && remap.has(mapping.onlinePosProductId)
          ? { ...mapping, onlinePosProductId: remap.get(mapping.onlinePosProductId)! }
          : mapping,
      );
      const legacyTo =
        row.onlinePosRemovalProductId !== undefined &&
        legacy(row.onlinePosRemovalIntegrationId, row.onlinePosRemovalCompanyId)
          ? remap.get(row.onlinePosRemovalProductId)
          : undefined;
      const changed =
        legacyTo !== undefined ||
        list?.some((m, i) => m !== row.onlinePosRemovalMappings![i]);
      if (!changed) continue;
      await ctx.db.patch("productIngredients", row._id, {
        onlinePosRemovalMappings: list,
        ...(legacyTo !== undefined ? { onlinePosRemovalProductId: legacyTo } : {}),
      });
      counts.removals += 1;
    }
    for (const row of additions) {
      const list = row.onlinePosAdditionMappings?.map((mapping) =>
        mapping.integrationId === master._id && remap.has(mapping.onlinePosProductId)
          ? { ...mapping, onlinePosProductId: remap.get(mapping.onlinePosProductId)! }
          : mapping,
      );
      const legacyTo =
        row.onlinePosAdditionProductId !== undefined &&
        legacy(row.onlinePosAdditionIntegrationId, row.onlinePosAdditionCompanyId)
          ? remap.get(row.onlinePosAdditionProductId)
          : undefined;
      const changed =
        legacyTo !== undefined ||
        list?.some((m, i) => m !== row.onlinePosAdditionMappings![i]);
      if (!changed) continue;
      await ctx.db.patch("productIngredientAdditions", row._id, {
        onlinePosAdditionMappings: list,
        ...(legacyTo !== undefined ? { onlinePosAdditionProductId: legacyTo } : {}),
      });
      counts.additions += 1;
    }
    if (
      counts.products +
        counts.modifiers +
        counts.menus +
        counts.removals +
        counts.additions >
      0
    )
      await invalidateSalesStockMappings(ctx, organizationId);
    return counts;
  },
});

// One-off: move mappings saved with local getProducts ids to the koncern id
// that sales use, matched by exact product name. Run after backfillSoldProducts.
export const remapLocalProductIds = internalAction({
  args: { organizationId: v.string() },
  returns: v.array(remapCountsValidator),
  handler: async (ctx, args): Promise<RemapCounts[]> => {
    const ids: Id<"onlinePosIntegrations">[] = await ctx.runQuery(
      internal.integrations.onlinepos.salesAlerts.listMasterIds,
      args,
    );
    const results: RemapCounts[] = [];
    for (const integrationId of ids) {
      const settings = await ctx.runQuery(internal.onlinePos.getPrivateSettings, {
        organizationId: args.organizationId,
        integrationId,
      });
      if (!settings) continue;
      const catalog = await requestProducts(settings);
      const sold: SoldName[] = await ctx.runQuery(
        internal.integrations.onlinepos.salesAlerts.listSold,
        { organizationId: args.organizationId, integrationId },
      );
      const soldIds = new Set(sold.map((product) => product.id));
      const soldByName = new Map<string, number | null>();
      for (const product of sold) {
        const key = nameKey(product.name);
        // Ambiguous names are skipped.
        soldByName.set(key, soldByName.has(key) ? null : product.id);
      }
      const pairs = catalog.flatMap((product) => {
        const to = soldByName.get(nameKey(product.name));
        return to != null && !soldIds.has(product.id) && to !== product.id
          ? [{ from: product.id, to }]
          : [];
      });
      results.push(
        await ctx.runMutation(
          internal.integrations.onlinepos.salesAlerts.applyIdRemap,
          { organizationId: args.organizationId, integrationId, pairs },
        ),
      );
    }
    return results;
  },
});

const MAX_SETUP_PRODUCTS = 500;

// What the unmapped-sales dialog needs to set up a tilvalg or fravalg in one go.
export const getModifierSetup = query({
  args: {
    ingredientProductId: v.id("products"),
    kind: v.union(v.literal("addition"), v.literal("removal")),
  },
  returns: v.object({
    units: v.array(v.object({ id: v.id("units"), name: v.string() })),
    defaultUnitId: v.id("units"),
    standard: v.union(
      v.object({ quantity: v.number(), unitId: v.id("units") }),
      v.null(),
    ),
    products: v.array(
      v.object({
        id: v.id("products"),
        name: v.string(),
        enabled: v.boolean(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
    const ingredient = await ctx.db.get("products", args.ingredientProductId);
    if (!ingredient || ingredient.organizationId !== organizationId)
      throw new ConvexError("Ingrediensen blev ikke fundet");
    const [productUnits, standard] = await Promise.all([
      ctx.db
        .query("productUnits")
        .withIndex("by_organizationId_and_productId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("productId", ingredient._id),
        )
        .take(50),
      ctx.db
        .query("ingredientAdditionDefaults")
        .withIndex("by_organizationId_and_ingredientProductId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("ingredientProductId", ingredient._id),
        )
        .first(),
    ]);
    const units = (
      await Promise.all(
        productUnits.map(async (row) => {
          const unit = await ctx.db.get("units", row.unitId);
          return unit ? [{ id: unit._id, name: unit.name }] : [];
        }),
      )
    ).flat();

    let products: Array<{ id: Id<"products">; name: string; enabled: boolean }>;
    if (args.kind === "removal") {
      // Only products whose recipe holds the ingredient can have it removed.
      const rows = await ctx.db
        .query("productIngredients")
        .withIndex("by_organizationId_and_ingredientProductId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("ingredientProductId", ingredient._id),
        )
        .take(MAX_SETUP_PRODUCTS);
      const removable = new Map<Id<"products">, boolean>();
      for (const row of rows) {
        if (row.packaging) continue;
        removable.set(
          row.productId,
          (removable.get(row.productId) ?? false) || row.removable === true,
        );
      }
      products = (
        await Promise.all(
          [...removable].map(async ([id, enabled]) => {
            const product = await ctx.db.get("products", id);
            return product?.status === "active"
              ? [{ id, name: product.name, enabled }]
              : [];
          }),
        )
      ).flat();
    } else {
      const [catalog, additions, mappings] = await Promise.all([
        ctx.db
          .query("products")
          .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
            q.eq("organizationId", organizationId).eq("status", "active"),
          )
          .take(2000),
        ctx.db
          .query("productIngredientAdditions")
          .withIndex("by_organizationId_and_ingredientProductId", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("ingredientProductId", ingredient._id),
          )
          .take(MAX_SETUP_PRODUCTS),
        ctx.db
          .query("onlinePosProductMappings")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", organizationId),
          )
          .take(2000),
      ]);
      const addable = new Set(additions.map((row) => row.productId));
      const posLinked = new Set(mappings.map((row) => row.productId));
      // Sold products: a sales price, a POS link, or already addable.
      products = catalog
        .filter(
          (product) =>
            product._id !== ingredient._id &&
            (product.salesPrice !== undefined ||
              posLinked.has(product._id) ||
              addable.has(product._id)),
        )
        .slice(0, MAX_SETUP_PRODUCTS)
        .map((product) => ({
          id: product._id,
          name: product.name,
          enabled: addable.has(product._id),
        }));
    }
    return {
      units,
      defaultUnitId: ingredient.defaultUnitId,
      standard: standard
        ? { quantity: standard.quantity, unitId: standard.unitId }
        : null,
      products: products.sort((left, right) =>
        left.name.localeCompare(right.name, "da"),
      ),
    };
  },
});
