import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { normalizeStock, toDefaultUnit } from "./stock";

type ReadCtx = QueryCtx | MutationCtx;
export type StockSale = Pick<
  Doc<"salesStockApplications">["entries"][number],
  "externalId" | "occurredAt" | "productId" | "unitId" | "quantity" | "isRefund"
>;
type SaleLine = Pick<
  Doc<"salesLines">,
  "externalId" | "externalProductId" | "quantity" | "occurredAt"
>;

export function stockSalesFingerprint(lines: SaleLine[]) {
  return JSON.stringify(
    lines
      .map((line) => [
        line.externalId,
        line.externalProductId,
        line.quantity,
        line.occurredAt,
      ])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  );
}

export function createSalesStockResolver(ctx: ReadCtx, organizationId: string) {
  const products = new Map<Id<"products">, Doc<"products">>();
  const recipes = new Map<Id<"products">, Doc<"productIngredients">[]>();
  const additions = new Map<
    Id<"products">,
    Doc<"productIngredientAdditions">[]
  >();
  const mapped = new Map<string, Id<"products"> | null>();
  const menus = new Map<string, Doc<"onlinePosMenus"> | null>();
  let fullCatalogLoaded = false;
  let integration: Promise<Doc<"onlinePosIntegrations"> | null> | undefined;

  async function loadCatalog(externalId: string) {
    if (mapped.has(externalId)) return;
    const onlinePosProductId = Number(externalId);
    if (
      !Number.isFinite(onlinePosProductId) ||
      String(onlinePosProductId) !== externalId
    ) {
      mapped.set(externalId, null);
      menus.set(externalId, null);
      return;
    }
    const [mappings, menu] = await Promise.all([
      ctx.db
        .query("onlinePosProductMappings")
        .withIndex("by_organizationId_and_onlinePosProductId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("onlinePosProductId", onlinePosProductId),
        )
        .take(2),
      ctx.db
        .query("onlinePosMenus")
        .withIndex("by_organizationId_and_onlinePosProductId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("onlinePosProductId", onlinePosProductId),
        )
        .first(),
    ]);
    if (mappings.length > 1)
      throw new ConvexError("Et OnlinePOS-produkt er koblet til flere Produkter");
    mapped.set(externalId, mappings[0]?.productId ?? null);
    menus.set(externalId, menu);
  }

  async function product(id: Id<"products">) {
    const cached = products.get(id);
    if (cached) return cached;
    const row = await ctx.db.get("products", id);
    if (!row || row.organizationId !== organizationId)
      throw new ConvexError(
        "Et salgsprodukts lagerkobling findes ikke længere",
      );
    products.set(id, row);
    return row;
  }

  async function recipe(id: Id<"products">) {
    const cached = recipes.get(id);
    if (cached) return cached;
    const rows = await ctx.db
      .query("productIngredients")
      .withIndex("by_organizationId_and_productId", (q) =>
        q.eq("organizationId", organizationId).eq("productId", id),
      )
      .take(201);
    if (rows.length > 200)
      throw new ConvexError(
        "Opskriften har for mange ingredienser til lagersynkronisering",
      );
    recipes.set(id, rows);
    return rows;
  }

  async function expand(
    id: Id<"products">,
    quantity: number,
    path: Set<Id<"products">>,
  ): Promise<
    Array<{ productId: Id<"products">; unitId: Id<"units">; quantity: number }>
  > {
    if (path.has(id) || path.size >= 20)
      throw new ConvexError(
        "Opskriften er cirkulær eller for dyb til lagersynkronisering",
      );
    const row = await product(id);
    const ingredients = await recipe(id);
    if (!ingredients.length)
      return [
        {
          productId: id,
          unitId: row.defaultUnitId,
          quantity: normalizeStock(quantity),
        },
      ];
    const nextPath = new Set(path).add(id);
    const result = [];
    for (const ingredient of ingredients) {
      const converted = await toDefaultUnit(
        ctx,
        organizationId,
        ingredient.ingredientProductId,
        ingredient.unitId,
        ingredient.quantity * quantity,
      );
      if (converted === null)
        throw new ConvexError(
          "En ingrediens mangler en gyldig enhedsomregning",
        );
      result.push(
        ...(await expand(ingredient.ingredientProductId, converted, nextPath)),
      );
      if (result.length > 1_000)
        throw new ConvexError("Opskriften giver for mange lagerlinjer");
    }
    return result;
  }

  return async (
    lines: SaleLine[],
  ): Promise<{ entries: StockSale[]; unmappedQuantity: number }> => {
    if (!fullCatalogLoaded) {
      const missingIds = [
        ...new Set(lines.map((line) => line.externalProductId)),
      ].filter((id) => !mapped.has(id));
      // Large batches use two bounded scans to stay within the index-read limit.
      if (mapped.size + missingIds.length > 100) {
        const [allMappings, allMenus] = await Promise.all([
          ctx.db
            .query("onlinePosProductMappings")
            .withIndex("by_organizationId", (q) =>
              q.eq("organizationId", organizationId),
            )
            .take(501),
          ctx.db
            .query("onlinePosMenus")
            .withIndex("by_organizationId", (q) =>
              q.eq("organizationId", organizationId),
            )
            .take(101),
        ]);
        if (allMappings.length > 500 || allMenus.length > 100)
          throw new ConvexError(
            "Der er for mange OnlinePOS-koblinger til lagersynkronisering",
          );
        mapped.clear();
        menus.clear();
        for (const row of allMappings) {
          const id = String(row.onlinePosProductId);
          if (mapped.has(id))
            throw new ConvexError(
              "Et OnlinePOS-produkt er koblet til flere Produkter",
            );
          mapped.set(id, row.productId);
        }
        for (const menu of allMenus) {
          const id = String(menu.onlinePosProductId);
          if (!menus.has(id)) menus.set(id, menu);
        }
        fullCatalogLoaded = true;
      } else {
        await Promise.all(missingIds.map(loadCatalog));
      }
    }
    const soldIds = new Set(
      lines.flatMap((line) => {
        const id = mapped.get(line.externalProductId);
        return id && !menus.get(line.externalProductId) ? [id] : [];
      }),
    );
    const settings = soldIds.size
      ? await (integration ??= ctx.db
          .query("onlinePosIntegrations")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", organizationId),
          )
          .unique())
      : null;
    const modifiers = new Map<
      string,
      Array<{
        productId: Id<"products">;
        quantity: number;
        unitId: Id<"units">;
      }>
    >();
    function addModifier(
      externalId: number,
      rule: {
        productId: Id<"products">;
        quantity: number;
        unitId: Id<"units">;
      },
    ) {
      const rules = modifiers.get(String(externalId)) ?? [];
      if (
        !rules.some(
          (existing) =>
            existing.productId === rule.productId &&
            existing.quantity === rule.quantity &&
            existing.unitId === rule.unitId,
        )
      )
        rules.push(rule);
      modifiers.set(String(externalId), rules);
    }
    for (const id of soldIds) {
      for (const ingredient of await recipe(id)) {
        if (
          ingredient.removable &&
          ingredient.onlinePosRemovalProductId !== undefined &&
          settings &&
          ingredient.onlinePosRemovalIntegrationId === settings._id &&
          ingredient.onlinePosRemovalCompanyId === settings.companyId
        ) {
          addModifier(ingredient.onlinePosRemovalProductId, {
            productId: ingredient.ingredientProductId,
            quantity: -ingredient.quantity,
            unitId: ingredient.unitId,
          });
        }
      }
      let rows = additions.get(id);
      if (!rows) {
        rows = await ctx.db
          .query("productIngredientAdditions")
          .withIndex("by_organizationId_and_productId", (q) =>
            q.eq("organizationId", organizationId).eq("productId", id),
          )
          .take(201);
        if (rows.length > 200)
          throw new ConvexError(
            "Produktet har for mange tilvalg til lagersynkronisering",
          );
        additions.set(id, rows);
      }
      for (const row of rows) {
        if (
          row.onlinePosAdditionProductId !== undefined &&
          lines.some(
            (line) =>
              line.externalProductId === String(row.onlinePosAdditionProductId),
          ) &&
          settings &&
          row.onlinePosAdditionIntegrationId === settings._id &&
          row.onlinePosAdditionCompanyId === settings.companyId
        ) {
          if (row.quantity === undefined || row.unitId === undefined)
            throw new ConvexError(
              "Et OnlinePOS-tilvalg mangler mængde eller enhed",
            );
          addModifier(row.onlinePosAdditionProductId, {
            productId: row.ingredientProductId,
            quantity: row.quantity,
            unitId: row.unitId,
          });
        }
      }
    }
    const entries: StockSale[] = [];
    let unmappedQuantity = 0;
    for (const line of lines) {
      const menu = menus.get(line.externalProductId);
      if (menu) {
        if (!menu.products.some((row) => soldIds.has(row.productId)))
          unmappedQuantity += Math.abs(line.quantity);
        continue;
      }
      const rules = modifiers.get(line.externalProductId);
      let values;
      if (rules) {
        if (rules.length !== 1)
          throw new ConvexError(
            "Et tilvalg eller fravalg har flere mulige lagerkoblinger på samme ordre",
          );
        const rule = rules[0];
        const quantity = await toDefaultUnit(
          ctx,
          organizationId,
          rule.productId,
          rule.unitId,
          rule.quantity * line.quantity,
        );
        if (quantity === null)
          throw new ConvexError(
            "Et tilvalg eller fravalg mangler en gyldig enhedsomregning",
          );
        values = await expand(rule.productId, quantity, new Set());
      } else {
        const id = mapped.get(line.externalProductId);
        if (!id) {
          unmappedQuantity += Math.abs(line.quantity);
          continue;
        }
        values = await expand(id, line.quantity, new Set());
      }
      for (const value of values)
        entries.push({
          ...value,
          isRefund: line.quantity < 0,
          externalId: line.externalId,
          occurredAt: line.occurredAt,
        });
      if (entries.length > 1_000)
        throw new ConvexError("Salgsordren giver for mange lagerlinjer");
    }
    return { entries, unmappedQuantity };
  };
}

export async function stockApplication(
  ctx: ReadCtx,
  order: Pick<
    Doc<"salesOrders">,
    "organizationId" | "locationId" | "externalId"
  >,
  companyId: number,
) {
  return ctx.db
    .query("salesStockApplications")
    .withIndex("by_organizationId_and_locationId_and_externalId", (q) =>
      q
        .eq("organizationId", order.organizationId)
        .eq("locationId", order.locationId)
        .eq("externalId", `${companyId}:${order.externalId}`),
    )
    .unique();
}
