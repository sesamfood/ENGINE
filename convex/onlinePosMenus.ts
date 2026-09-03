import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { requireHumanPrincipal, requireIntegrationManager } from "./lib/auth";
import { recordAudit } from "./lib/audit";
import {
  requestProducts,
  type OnlinePosProduct,
  type OnlinePosSettings,
} from "./lib/onlinePosApi";

const MAX_MENUS = 100;
const MAX_MENU_COMPONENTS = 100;
const MAX_ONLINE_POS_PRODUCTS = 2_000;
const MAX_PRODUCT_NAME_LENGTH = 200;

const menuComponentValidator = v.object({
  onlinePosProductId: v.number(),
  name: v.string(),
  groupName: v.string(),
});

const menuValidator = v.object({
  id: v.id("onlinePosMenus"),
  onlinePosProductId: v.number(),
  name: v.string(),
  groupName: v.string(),
  components: v.array(menuComponentValidator),
});

const onlinePosProductValidator = v.object({
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

async function connectedSettings(
  ctx: ActionCtx,
  organizationId: string,
): Promise<{
  integrationId: Id<"onlinePosIntegrations">;
  settings: OnlinePosSettings;
}> {
  const settings = await ctx.runQuery(internal.onlinePos.getPrivateSettings, {
    organizationId,
  });
  if (!settings) throw new ConvexError("OnlinePOS er ikke forbundet");
  return {
    integrationId: settings.integrationId,
    settings,
  };
}

export const list = query({
  args: {},
  returns: v.object({
    connected: v.boolean(),
    menus: v.array(menuValidator),
  }),
  handler: async (ctx) => {
    const { organizationId } = await requireIntegrationManager(ctx);
    const [integration, menus] = await Promise.all([
      ctx.db
        .query("onlinePosIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .unique(),
      ctx.db
        .query("onlinePosMenus")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_MENUS + 1),
    ]);
    if (menus.length > MAX_MENUS) {
      throw new ConvexError("Der er for mange OnlinePOS-menuer");
    }
    return {
      connected: integration !== null,
      menus: menus
        .map((menu) => ({
          id: menu._id,
          onlinePosProductId: menu.onlinePosProductId,
          name: menu.name,
          groupName: menu.groupName,
          components: menu.components,
        }))
        .sort((left, right) => left.name.localeCompare(right.name, "da")),
    };
  },
});

export const listProductOptions = action({
  args: {},
  returns: v.array(onlinePosProductValidator),
  handler: async (ctx): Promise<OnlinePosProduct[]> => {
    const { organizationId } = await requireIntegrationManager(ctx);
    const { settings } = await connectedSettings(ctx, organizationId);
    return normalizeProducts(await requestProducts(settings));
  },
});

export const saveConfiguration = internalMutation({
  args: {
    organizationId: v.string(),
    menuId: v.union(v.id("onlinePosMenus"), v.null()),
    integrationId: v.id("onlinePosIntegrations"),
    companyId: v.number(),
    menuProduct: menuComponentValidator,
    components: v.array(menuComponentValidator),
    actorUserId: v.string(),
    actorName: v.string(),
  },
  returns: v.id("onlinePosMenus"),
  handler: async (ctx, args) => {
    const [integration, current, duplicateMenus, menus] = await Promise.all([
      ctx.db
        .query("onlinePosIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .unique(),
      args.menuId === null
        ? Promise.resolve(null)
        : ctx.db.get("onlinePosMenus", args.menuId),
      ctx.db
        .query("onlinePosMenus")
        .withIndex("by_organizationId_and_onlinePosProductId", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("onlinePosProductId", args.menuProduct.onlinePosProductId),
        )
        .take(2),
      ctx.db
        .query("onlinePosMenus")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .take(MAX_MENUS + 1),
    ]);
    if (
      !integration ||
      integration._id !== args.integrationId ||
      integration.companyId !== args.companyId
    ) {
      throw new ConvexError(
        "OnlinePOS-forbindelsen blev ændret. Opdatér produktlisten og prøv igen.",
      );
    }
    if (
      args.menuId !== null &&
      (!current || current.organizationId !== args.organizationId)
    ) {
      throw new ConvexError("Menuen blev ikke fundet");
    }
    if (menus.length > MAX_MENUS || (!current && menus.length === MAX_MENUS)) {
      throw new ConvexError("Der kan højst oprettes 100 OnlinePOS-menuer");
    }
    if (duplicateMenus.some((menu) => menu._id !== args.menuId)) {
      throw new ConvexError("OnlinePOS-produktet bruges allerede som menu");
    }
    const otherMenus = menus.filter((menu) => menu._id !== args.menuId);
    const otherMenuProductIds = new Set(
      otherMenus.map((menu) => menu.onlinePosProductId),
    );
    if (
      args.components.some((component) =>
        otherMenuProductIds.has(component.onlinePosProductId),
      ) ||
      otherMenus.some((menu) =>
        menu.components.some(
          (component) =>
            component.onlinePosProductId ===
            args.menuProduct.onlinePosProductId,
        ),
      )
    ) {
      throw new ConvexError(
        "Et OnlinePOS-produkt kan ikke være både menu og produkt i en menu",
      );
    }

    const updatedAt = Date.now();
    const values = {
      onlinePosProductId: args.menuProduct.onlinePosProductId,
      name: args.menuProduct.name,
      groupName: args.menuProduct.groupName,
      components: args.components,
      updatedAt,
    };
    const menuId: Id<"onlinePosMenus"> = current
      ? current._id
      : await ctx.db.insert("onlinePosMenus", {
          organizationId: args.organizationId,
          ...values,
        });
    if (current) await ctx.db.patch(current._id, values);

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
          ? `OnlinePOS-menuen ${args.menuProduct.name} blev opdateret`
          : `OnlinePOS-menuen ${args.menuProduct.name} blev oprettet`,
      },
    );
    return menuId;
  },
});

export const save = action({
  args: {
    menuId: v.union(v.id("onlinePosMenus"), v.null()),
    onlinePosProductId: v.number(),
    componentProductIds: v.array(v.number()),
  },
  returns: v.id("onlinePosMenus"),
  handler: async (ctx, args): Promise<Id<"onlinePosMenus">> => {
    const auth = requireHumanPrincipal(await requireIntegrationManager(ctx));
    if (
      !Number.isSafeInteger(args.onlinePosProductId) ||
      args.onlinePosProductId <= 0
    ) {
      throw new ConvexError("Vælg et gyldigt OnlinePOS-produkt til menuen");
    }
    if (
      args.componentProductIds.length === 0 ||
      args.componentProductIds.length > MAX_MENU_COMPONENTS
    ) {
      throw new ConvexError("Vælg mellem 1 og 100 produkter til menuen");
    }
    const componentProductIds = new Set(args.componentProductIds);
    if (
      componentProductIds.size !== args.componentProductIds.length ||
      componentProductIds.has(args.onlinePosProductId) ||
      [...componentProductIds].some(
        (productId) => !Number.isSafeInteger(productId) || productId <= 0,
      )
    ) {
      throw new ConvexError("Menuens OnlinePOS-produkter er ugyldige");
    }

    const connection = await connectedSettings(ctx, auth.organizationId);
    const products = normalizeProducts(
      await requestProducts(connection.settings),
    );
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    const menuProduct = productsById.get(args.onlinePosProductId);
    if (!menuProduct) {
      throw new ConvexError(
        "Et af produkterne findes ikke længere i OnlinePOS. Opdatér produktlisten og prøv igen.",
      );
    }
    const components = args.componentProductIds.map((productId) => {
      const product = productsById.get(productId);
      if (!product) {
        throw new ConvexError(
          "Et af produkterne findes ikke længere i OnlinePOS. Opdatér produktlisten og prøv igen.",
        );
      }
      return product;
    });

    const menuId: Id<"onlinePosMenus"> = await ctx.runMutation(
      internal.onlinePosMenus.saveConfiguration,
      {
        organizationId: auth.organizationId,
        menuId: args.menuId,
        integrationId: connection.integrationId,
        companyId: connection.settings.companyId,
        menuProduct: {
          onlinePosProductId: menuProduct.id,
          name: menuProduct.name,
          groupName: menuProduct.groupName,
        },
        components: components.map((product) => ({
          onlinePosProductId: product.id,
          name: product.name,
          groupName: product.groupName,
        })),
        actorUserId: auth.userId,
        actorName: auth.userName,
      },
    );
    return menuId;
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
    await recordAudit(ctx, auth, {
      action: "onlinePos.menuRemoved",
      entityTable: "onlinePosMenus",
      entityId: menu._id,
      summary: `OnlinePOS-menuen ${menu.name} blev fjernet`,
    });
    return null;
  },
});
