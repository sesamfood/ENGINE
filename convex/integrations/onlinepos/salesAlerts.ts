import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server";
import {
  requireCatalogManager,
  requireIntegrationManager,
} from "../../lib/auth";
import { MAX_MODIFIER_DEFAULTS } from "../../lib/salesStock";
import { isIntegrationEnabled } from "../state";
import {
  getOnlinePosLocationMaster,
  onlinePosCatalogId,
  MAX_MASTER_CONNECTIONS,
} from "./lib/connections";

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
