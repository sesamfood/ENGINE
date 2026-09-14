import {
  getOnlinePosMaster,
  onlinePosCatalogId,
} from "./lib/onlinePosConnections";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { requireHumanPrincipal, requireIntegrationManager } from "./lib/auth";
import { recordAudit } from "./lib/audit";
import { invalidateSalesStockMappings } from "./lib/salesStock";
import { menuGroupInputValidator, menuGroups } from "./lib/menuGroups";
import type { Infer } from "convex/values";
import {
  requestProducts,
  type OnlinePosProduct,
  type OnlinePosSettings,
} from "./lib/onlinePosApi";

const MAX_MENUS = 100;
const MAX_MENU_PRODUCTS = 100;
const MAX_PRODUCT_MAPPINGS = 500;
const MAX_ONLINE_POS_PRODUCTS = 2_000;
const MAX_PRODUCT_NAME_LENGTH = 200;
const MAX_MENU_NAME_LENGTH = 100;
const MAX_MENU_GROUPS = 20;

const onlinePosProductValidator = v.object({
  onlinePosProductId: v.number(),
  name: v.string(),
  groupName: v.string(),
});

const menuProductValidator = v.object({
  id: v.id("products"),
  name: v.string(),
  mapped: v.boolean(),
});

const menuValidator = v.object({
  id: v.id("onlinePosMenus"),
  onlinePosProductId: v.number(),
  name: v.string(),
  onlinePosProductName: v.string(),
  groupName: v.string(),
  groups: v.array(menuGroupInputValidator),
  products: v.array(menuProductValidator),
});

const onlinePosProductOptionValidator = v.object({
  id: v.number(),
  name: v.string(),
  groupName: v.string(),
});

function validateProduct(product: OnlinePosProduct) {
  if (
    !Number.isSafeInteger(product.id) ||
    product.id <= 0 ||
    !product.name.trim() ||
    product.name.length > MAX_PRODUCT_NAME_LENGTH ||
    product.groupName.length > MAX_PRODUCT_NAME_LENGTH
  ) {
    throw new ConvexError("OnlinePOS returnerede et ugyldigt produkt");
  }
  return {
    id: product.id,
    name: product.name.trim(),
    groupName: product.groupName.trim(),
  };
}

function normalizeProducts(products: OnlinePosProduct[]) {
  const productsById = new Map<number, ReturnType<typeof validateProduct>>();
  for (const product of products) {
    const normalized = validateProduct(product);
    productsById.set(normalized.id, normalized);
  }
  if (productsById.size > MAX_ONLINE_POS_PRODUCTS) {
    throw new ConvexError("Der er for mange OnlinePOS-produkter");
  }
  return [...productsById.values()].sort(
    (left, right) =>
      left.groupName.localeCompare(right.groupName, "da") ||
      left.name.localeCompare(right.name, "da"),
  );
}

function normalizeMenuName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new ConvexError("Giv menuen et navn");
  if (name.length > MAX_MENU_NAME_LENGTH) {
    throw new ConvexError(`Navnet må højst være ${MAX_MENU_NAME_LENGTH} tegn`);
  }
  return name;
}

function normalizeMenuGroups(groups: Infer<typeof menuGroupInputValidator>[]) {
  if (groups.length === 0 || groups.length > MAX_MENU_GROUPS) {
    throw new ConvexError("Tilføj mellem 1 og 20 produktgrupper");
  }
  const ids = new Set<string>();
  const normalized = groups.map((group) => {
    if (!group.id.trim() || group.id.length > 100 || ids.has(group.id)) {
      throw new ConvexError("Produktgruppen har et ugyldigt ID");
    }
    ids.add(group.id);
    const title = group.title.trim().replace(/\s+/g, " ");
    if (!title || title.length > 100) {
      throw new ConvexError(
        "Giv hver produktgruppe en titel på højst 100 tegn",
      );
    }
    if (
      !Number.isSafeInteger(group.quantity) ||
      group.quantity < 1 ||
      group.quantity > 100
    ) {
      throw new ConvexError(
        "Antallet i en produktgruppe skal være et helt tal mellem 1 og 100",
      );
    }
    if (group.productIds.length === 0) {
      throw new ConvexError("Vælg mindst ét produkt i hver gruppe");
    }
    return { ...group, title };
  });
  const productIds = normalized.flatMap((group) => group.productIds);
  if (normalized.reduce((total, group) => total + group.quantity, 0) > 100) {
    throw new ConvexError("En menu må højst kræve 100 valg i alt");
  }
  if (productIds.length > MAX_MENU_PRODUCTS) {
    throw new ConvexError("Vælg højst 100 produkter til menuen");
  }
  if (new Set(productIds).size !== productIds.length) {
    throw new ConvexError("Et produkt kan kun vælges én gang i menuen");
  }
  return normalized;
}

async function enabledSettings(
  ctx: ActionCtx,
  organizationId: string,
  integrationId?: Id<"onlinePosIntegrations">,
): Promise<{
  integrationId: Id<"onlinePosIntegrations">;
  settings: OnlinePosSettings;
}> {
  const settings = await ctx.runQuery(internal.onlinePos.getPrivateSettings, {
    organizationId,
    integrationId,
  });
  if (!settings?.enabled) {
    throw new ConvexError("OnlinePOS-integrationen er ikke aktiveret");
  }
  return {
    integrationId: settings.integrationId,
    settings,
  };
}

export const list = query({
  args: { integrationId: v.optional(v.id("onlinePosIntegrations")) },
  returns: v.object({
    connected: v.boolean(),
    enabled: v.boolean(),
    menus: v.array(menuValidator),
  }),
  handler: async (ctx, args) => {
    const { organizationId } = await requireIntegrationManager(ctx);
    const integration = await getOnlinePosMaster(
      ctx,
      organizationId,
      args.integrationId,
    );
    const [menus, mappings] = await Promise.all([
      ctx.db
        .query("onlinePosMenus")
        .withIndex("by_organizationId_and_integrationId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("integrationId", onlinePosCatalogId(integration)),
        )
        .take(MAX_MENUS + 1),
      ctx.db
        .query("onlinePosProductMappings")
        .withIndex("by_organizationId_and_integrationId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("integrationId", onlinePosCatalogId(integration)),
        )
        .take(MAX_PRODUCT_MAPPINGS + 1),
    ]);
    if (menus.length > MAX_MENUS) {
      throw new ConvexError("Der er for mange OnlinePOS-menuer");
    }
    if (mappings.length > MAX_PRODUCT_MAPPINGS) {
      throw new ConvexError("Der er for mange produktkoblinger");
    }
    const mappedProductIds = new Set(
      mappings.map((mapping) => mapping.productId),
    );
    return {
      connected: integration !== null,
      enabled: integration?.enabled === true,
      menus: menus
        .map((menu) => ({
          id: menu._id,
          onlinePosProductId: menu.onlinePosProductId,
          name: menu.name,
          onlinePosProductName: menu.onlinePosProductName ?? menu.name,
          groupName: menu.groupName,
          groups: menuGroups(menu),
          products: menu.products.map((product) => ({
            id: product.productId,
            name: product.name,
            mapped: mappedProductIds.has(product.productId),
          })),
        }))
        .sort((left, right) => left.name.localeCompare(right.name, "da")),
    };
  },
});

export const listOnlinePosProducts = action({
  args: { integrationId: v.optional(v.id("onlinePosIntegrations")) },
  returns: v.array(onlinePosProductOptionValidator),
  handler: async (ctx, args): Promise<OnlinePosProduct[]> => {
    const { organizationId } = await requireIntegrationManager(ctx);
    const { settings } = await enabledSettings(
      ctx,
      organizationId,
      args.integrationId,
    );
    return normalizeProducts(await requestProducts(settings));
  },
});

export const saveConfiguration = internalMutation({
  args: {
    organizationId: v.string(),
    menuId: v.union(v.id("onlinePosMenus"), v.null()),
    integrationId: v.id("onlinePosIntegrations"),
    companyId: v.number(),
    name: v.string(),
    menuProduct: onlinePosProductValidator,
    groups: v.array(menuGroupInputValidator),
    actorUserId: v.string(),
    actorName: v.string(),
  },
  returns: v.id("onlinePosMenus"),
  handler: async (ctx, args) => {
    const name = normalizeMenuName(args.name);
    const groups = normalizeMenuGroups(args.groups);
    const productIds = groups.flatMap((group) => group.productIds);
    const integration = await getOnlinePosMaster(
      ctx,
      args.organizationId,
      args.integrationId,
    );
    const [current, duplicateMenus, menus, products, mappings] =
      await Promise.all([
        args.menuId === null
          ? Promise.resolve(null)
          : ctx.db.get("onlinePosMenus", args.menuId),
        ctx.db
          .query("onlinePosMenus")
          .withIndex(
            "by_organizationId_and_integrationId_and_onlinePosProductId",
            (q) =>
              q
                .eq("organizationId", args.organizationId)
                .eq("integrationId", onlinePosCatalogId(integration))
                .eq("onlinePosProductId", args.menuProduct.onlinePosProductId),
          )
          .take(2),
        ctx.db
          .query("onlinePosMenus")
          .withIndex("by_organizationId_and_integrationId", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("integrationId", onlinePosCatalogId(integration)),
          )
          .take(MAX_MENUS + 1),
        Promise.all(
          productIds.map((productId) => ctx.db.get("products", productId)),
        ),
        ctx.db
          .query("onlinePosProductMappings")
          .withIndex("by_organizationId_and_integrationId", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("integrationId", onlinePosCatalogId(integration)),
          )
          .take(MAX_PRODUCT_MAPPINGS + 1),
      ]);
    if (
      !integration ||
      !integration.enabled ||
      integration._id !== args.integrationId ||
      integration.companyId !== args.companyId
    ) {
      throw new ConvexError(
        "OnlinePOS-forbindelsen blev ændret. Opdatér produktlisten og prøv igen.",
      );
    }
    if (
      args.menuId !== null &&
      (!current ||
        current.organizationId !== args.organizationId ||
        current.integrationId !== onlinePosCatalogId(integration))
    ) {
      throw new ConvexError("Menuen blev ikke fundet");
    }
    if (menus.length > MAX_MENUS || (!current && menus.length === MAX_MENUS)) {
      throw new ConvexError("Der kan højst oprettes 100 OnlinePOS-menuer");
    }
    if (duplicateMenus.some((menu) => menu._id !== args.menuId)) {
      throw new ConvexError("OnlinePOS-produktet bruges allerede som menu");
    }
    const groupByProductId = new Map(
      groups.flatMap((group) =>
        group.productIds.map((productId) => [productId, group.id] as const),
      ),
    );
    const menuProducts: Array<{
      groupId: string;
      productId: Id<"products">;
      name: string;
    }> = [];
    for (const product of products) {
      if (!product || product.organizationId !== args.organizationId) {
        throw new ConvexError("Et af produkterne blev ikke fundet");
      }
      const groupId = groupByProductId.get(product._id);
      if (!groupId) throw new ConvexError("Produktgruppen blev ikke fundet");
      menuProducts.push({
        groupId,
        productId: product._id,
        name: product.name,
      });
    }
    if (mappings.length > MAX_PRODUCT_MAPPINGS) {
      throw new ConvexError("Der er for mange produktkoblinger");
    }
    const mappingByProductId = new Map(
      mappings.map((mapping) => [mapping.productId, mapping]),
    );
    const menuProductIds = new Set(
      menus
        .filter((menu) => menu._id !== args.menuId)
        .map((menu) => menu.onlinePosProductId),
    );
    menuProductIds.add(args.menuProduct.onlinePosProductId);
    if (
      productIds.some((productId) => {
        const mapping = mappingByProductId.get(productId);
        return mapping && menuProductIds.has(mapping.onlinePosProductId);
      })
    ) {
      throw new ConvexError(
        "Et produkt i menuen bruges også som menu i OnlinePOS",
      );
    }

    const updatedAt = Date.now();
    const values = {
      integrationId: onlinePosCatalogId(integration),
      onlinePosProductId: args.menuProduct.onlinePosProductId,
      name,
      onlinePosProductName: args.menuProduct.name,
      groupName: args.menuProduct.groupName,
      groups: groups.map(({ id, title, quantity }) => ({
        id,
        title,
        quantity,
      })),
      products: menuProducts,
      updatedAt,
    };
    const menuId: Id<"onlinePosMenus"> = current
      ? current._id
      : await ctx.db.insert("onlinePosMenus", {
          organizationId: args.organizationId,
          ...values,
        });
    if (current) await ctx.db.patch(current._id, values);
    if (
      !current ||
      current.onlinePosProductId !== values.onlinePosProductId ||
      current.products.length !== productIds.length ||
      current.products.some(
        (product) => !productIds.includes(product.productId),
      )
    ) {
      await invalidateSalesStockMappings(ctx, args.organizationId);
    }

    await recordAudit(
      ctx,
      {
        organizationId: args.organizationId,
        userId: args.actorUserId,
        userName: args.actorName,
      },
      {
        action: current ? "onlinePos.menuUpdated" : "onlinePos.menuCreated",
        entityTable: "onlinePosMenus",
        entityId: menuId,
        summary: current
          ? `OnlinePOS-menuen ${name} blev opdateret`
          : `OnlinePOS-menuen ${name} blev oprettet`,
      },
    );
    return menuId;
  },
});

export const save = action({
  args: {
    integrationId: v.optional(v.id("onlinePosIntegrations")),
    menuId: v.union(v.id("onlinePosMenus"), v.null()),
    name: v.string(),
    onlinePosProductId: v.number(),
    groups: v.array(menuGroupInputValidator),
  },
  returns: v.id("onlinePosMenus"),
  handler: async (ctx, args): Promise<Id<"onlinePosMenus">> => {
    const auth = requireHumanPrincipal(await requireIntegrationManager(ctx));
    const name = normalizeMenuName(args.name);
    if (
      !Number.isSafeInteger(args.onlinePosProductId) ||
      args.onlinePosProductId <= 0
    ) {
      throw new ConvexError("Vælg et gyldigt OnlinePOS-produkt til menuen");
    }
    const groups = normalizeMenuGroups(args.groups);

    const connection = await enabledSettings(
      ctx,
      auth.organizationId,
      args.integrationId,
    );
    const onlinePosProducts = normalizeProducts(
      await requestProducts(connection.settings),
    );
    const onlinePosProductsById = new Map(
      onlinePosProducts.map((product) => [product.id, product]),
    );
    const menuProduct = onlinePosProductsById.get(args.onlinePosProductId);
    if (!menuProduct) {
      throw new ConvexError(
        "Menuen findes ikke længere i OnlinePOS. Opdatér listen og prøv igen.",
      );
    }

    const menuId: Id<"onlinePosMenus"> = await ctx.runMutation(
      internal.onlinePosMenus.saveConfiguration,
      {
        organizationId: auth.organizationId,
        menuId: args.menuId,
        integrationId: connection.integrationId,
        companyId: connection.settings.companyId,
        name,
        menuProduct: {
          onlinePosProductId: menuProduct.id,
          name: menuProduct.name,
          groupName: menuProduct.groupName,
        },
        groups,
        actorUserId: auth.userId,
        actorName: auth.userName,
      },
    );
    return menuId;
  },
});

export const removeProductReferences = internalMutation({
  args: {
    organizationId: v.string(),
    productId: v.id("products"),
    cursor: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("onlinePosMenus")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .paginate({ numItems: MAX_MENUS, cursor: args.cursor ?? null });
    const menus = page.page;
    const updatedAt = Date.now();
    let changed = false;
    for (const menu of menus) {
      const products = menu.products.filter(
        (product) => product.productId !== args.productId,
      );
      if (products.length !== menu.products.length) {
        await ctx.db.patch(menu._id, { products, updatedAt });
        changed = true;
      }
    }
    if (changed) await invalidateSalesStockMappings(ctx, args.organizationId);
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.onlinePosMenus.removeProductReferences, {
        ...args, cursor: page.continueCursor,
      });
    }
    return null;
  },
});

export const remove = mutation({
  args: { menuId: v.id("onlinePosMenus") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = requireHumanPrincipal(await requireIntegrationManager(ctx));
    const menu = await ctx.db.get("onlinePosMenus", args.menuId);
    if (!menu || menu.organizationId !== auth.organizationId) {
      throw new ConvexError("Menuen blev ikke fundet");
    }
    await ctx.db.delete(menu._id);
    await invalidateSalesStockMappings(ctx, auth.organizationId);
    await recordAudit(ctx, auth, {
      action: "onlinePos.menuRemoved",
      entityTable: "onlinePosMenus",
      entityId: menu._id,
      summary: `OnlinePOS-menuen ${menu.name} blev fjernet`,
    });
    return null;
  },
});
