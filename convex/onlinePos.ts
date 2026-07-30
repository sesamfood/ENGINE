import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireOrganizationAdmin } from "./lib/auth";

const API_URL = "https://api.onlinepos.dk/api";
const MAX_PRODUCTS = 500;
const MAX_SALES = 500;
const MAX_SALES_RANGE_MS = 31 * 24 * 60 * 60 * 1000;

const privateSettingsValidator = v.union(
  v.object({
    token: v.string(),
    companyId: v.number(),
    enabled: v.boolean(),
  }),
  v.null(),
);

const onlinePosProductValidator = v.object({
  id: v.number(),
  name: v.string(),
  groupName: v.string(),
});

const saleValidator = v.object({
  id: v.number(),
  checkNumber: v.number(),
  date: v.string(),
  time: v.string(),
  onlinePosProductId: v.number(),
  onlinePosProductName: v.string(),
  localProductName: v.union(v.string(), v.null()),
  amount: v.number(),
  price: v.string(),
  paymentType: v.string(),
  department: v.string(),
});

type OnlinePosProduct = {
  id: number;
  name: string;
  groupName: string;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function string(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function requireCompanyId(companyId: number) {
  if (!Number.isSafeInteger(companyId) || companyId <= 0) {
    throw new ConvexError("Firma-id skal være et positivt heltal");
  }
}

function requireToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed || trimmed.length > 500) {
    throw new ConvexError("Indtast et gyldigt OnlinePOS-token");
  }
  return trimmed;
}

async function requestOnlinePos(
  path: string,
  settings: { token: string; companyId: number },
  init?: RequestInit,
) {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        token: settings.token,
        firmaid: String(settings.companyId),
        ...init?.headers,
      },
    });
  } catch {
    throw new ConvexError("OnlinePOS kunne ikke kontaktes");
  }

  if (response.status === 403) {
    throw new ConvexError("OnlinePOS afviste firma-id eller token");
  }
  if (!response.ok) {
    throw new ConvexError(`OnlinePOS svarede med status ${response.status}`);
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ConvexError("OnlinePOS returnerede et ugyldigt svar");
  }
}

function parseProducts(payload: unknown): OnlinePosProduct[] {
  if (!Array.isArray(payload)) {
    throw new ConvexError("OnlinePOS returnerede en ugyldig produktliste");
  }

  return payload.flatMap((value) => {
    const product = object(value);
    const id = number(product?.ID);
    const name = string(product?.name).trim();
    if (id === null || !name) return [];
    return [{ id, name, groupName: string(product?.groupname).trim() }];
  });
}

async function requireEnabledSettings(ctx: ActionCtx): Promise<{
  organizationId: string;
  settings: { token: string; companyId: number; enabled: boolean };
}> {
  const { organizationId } = await requireOrganizationAdmin(ctx);
  const settings: {
    token: string;
    companyId: number;
    enabled: boolean;
  } | null = await ctx.runQuery(internal.onlinePos.getPrivateSettings, {
    organizationId,
  });
  if (!settings?.enabled) {
    throw new ConvexError("OnlinePOS-integrationen er ikke aktiv");
  }
  return { organizationId, settings };
}

export const getSettings = query({
  args: {},
  returns: v.object({
    connected: v.boolean(),
    enabled: v.boolean(),
    companyId: v.union(v.number(), v.null()),
    connectedAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const settings = await ctx.db
      .query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();
    return {
      connected: Boolean(settings),
      enabled: settings?.enabled ?? false,
      companyId: settings?.companyId ?? null,
      connectedAt: settings?.connectedAt ?? null,
    };
  },
});

export const getPrivateSettings = internalQuery({
  args: { organizationId: v.string() },
  returns: privateSettingsValidator,
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    return settings
      ? {
          token: settings.token,
          companyId: settings.companyId,
          enabled: settings.enabled,
        }
      : null;
  },
});

export const getSalesContext = internalQuery({
  args: { organizationId: v.string() },
  returns: v.object({
    settings: privateSettingsValidator,
    mappings: v.array(
      v.object({ onlinePosProductId: v.number(), productName: v.string() }),
    ),
  }),
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    const rows = await ctx.db
      .query("onlinePosProductMappings")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .take(MAX_PRODUCTS);
    const mappings = await Promise.all(
      rows.map(async (row) => {
        const product = await ctx.db.get("products", row.productId);
        return product?.organizationId === args.organizationId
          ? {
              onlinePosProductId: row.onlinePosProductId,
              productName: product.name,
            }
          : null;
      }),
    );

    return {
      settings: settings
        ? {
            token: settings.token,
            companyId: settings.companyId,
            enabled: settings.enabled,
          }
        : null,
      mappings: mappings.filter((mapping) => mapping !== null),
    };
  },
});

export const saveConnection = internalMutation({
  args: {
    organizationId: v.string(),
    token: v.string(),
    companyId: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await ctx.db
      .query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    const now = Date.now();

    if (current && current.companyId !== args.companyId) {
      const mappings = await ctx.db
        .query("onlinePosProductMappings")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .take(MAX_PRODUCTS + 1);
      if (mappings.length > MAX_PRODUCTS) {
        throw new ConvexError("Der er for mange produktkoblinger");
      }
      for (const mapping of mappings) await ctx.db.delete(mapping._id);
    }

    if (current) {
      await ctx.db.patch(current._id, {
        token: args.token,
        companyId: args.companyId,
        enabled: true,
        connectedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("onlinePosIntegrations", {
        organizationId: args.organizationId,
        token: args.token,
        companyId: args.companyId,
        enabled: true,
        connectedAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});

export const setEnabledInternal = internalMutation({
  args: { organizationId: v.string(), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    if (!settings) throw new ConvexError("OnlinePOS er ikke forbundet");
    await ctx.db.patch(settings._id, {
      enabled: args.enabled,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const connect = action({
  args: { token: v.string(), companyId: v.number() },
  returns: v.object({ productCount: v.number() }),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    requireCompanyId(args.companyId);
    const token = requireToken(args.token);
    const products = parseProducts(
      await requestOnlinePos("/getProducts", {
        token,
        companyId: args.companyId,
      }),
    );
    await ctx.runMutation(internal.onlinePos.saveConnection, {
      organizationId,
      token,
      companyId: args.companyId,
    });
    return { productCount: products.length };
  },
});

export const setEnabled = action({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const settings: {
      token: string;
      companyId: number;
      enabled: boolean;
    } | null = await ctx.runQuery(internal.onlinePos.getPrivateSettings, {
      organizationId,
    });
    if (!settings) throw new ConvexError("OnlinePOS er ikke forbundet");
    if (args.enabled) {
      parseProducts(await requestOnlinePos("/getProducts", settings));
    }
    await ctx.runMutation(internal.onlinePos.setEnabledInternal, {
      organizationId,
      enabled: args.enabled,
    });
    return null;
  },
});

export const disconnect = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const [settings, mappings] = await Promise.all([
      ctx.db
        .query("onlinePosIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .unique(),
      ctx.db
        .query("onlinePosProductMappings")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_PRODUCTS + 1),
    ]);
    if (mappings.length > MAX_PRODUCTS) {
      throw new ConvexError("Der er for mange produktkoblinger");
    }
    for (const mapping of mappings) await ctx.db.delete(mapping._id);
    if (settings) await ctx.db.delete(settings._id);
    return null;
  },
});

export const listProducts = action({
  args: {},
  returns: v.array(onlinePosProductValidator),
  handler: async (ctx): Promise<OnlinePosProduct[]> => {
    const { settings } = await requireEnabledSettings(ctx);
    return parseProducts(await requestOnlinePos("/getProducts", settings));
  },
});

export const listMappingOptions = query({
  args: {},
  returns: v.union(
    v.object({
      products: v.array(
        v.object({
          id: v.id("products"),
          name: v.string(),
          onlinePosProductId: v.union(v.number(), v.null()),
        }),
      ),
      limitReached: v.boolean(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const settings = await ctx.db
      .query("onlinePosIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();
    if (!settings?.enabled) return null;

    const [products, mappings] = await Promise.all([
      ctx.db
        .query("products")
        .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
          q.eq("organizationId", organizationId).eq("status", "active"),
        )
        .take(MAX_PRODUCTS + 1),
      ctx.db
        .query("onlinePosProductMappings")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_PRODUCTS),
    ]);
    const byProductId = new Map(
      mappings.map((mapping) => [
        mapping.productId,
        mapping.onlinePosProductId,
      ]),
    );

    return {
      products: products.slice(0, MAX_PRODUCTS).map((product) => ({
        id: product._id,
        name: product.name,
        onlinePosProductId: byProductId.get(product._id) ?? null,
      })),
      limitReached: products.length > MAX_PRODUCTS,
    };
  },
});

export const saveProductMapping = internalMutation({
  args: {
    organizationId: v.string(),
    productId: v.id("products"),
    onlinePosProductId: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [settings, product, current] = await Promise.all([
      ctx.db
        .query("onlinePosIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .unique(),
      ctx.db.get("products", args.productId),
      ctx.db
        .query("onlinePosProductMappings")
        .withIndex("by_organizationId_and_productId", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("productId", args.productId),
        )
        .unique(),
    ]);
    if (!settings?.enabled) {
      throw new ConvexError("OnlinePOS-integrationen er ikke aktiv");
    }
    if (!product || product.organizationId !== args.organizationId) {
      throw new ConvexError("Produktet blev ikke fundet");
    }
    if (
      args.onlinePosProductId !== null &&
      (!Number.isSafeInteger(args.onlinePosProductId) ||
        args.onlinePosProductId <= 0)
    ) {
      throw new ConvexError("OnlinePOS-produktet er ugyldigt");
    }

    if (args.onlinePosProductId === null) {
      if (current) await ctx.db.delete(current._id);
    } else if (current) {
      await ctx.db.patch(current._id, {
        onlinePosProductId: args.onlinePosProductId,
      });
    } else {
      await ctx.db.insert("onlinePosProductMappings", {
        organizationId: args.organizationId,
        productId: args.productId,
        onlinePosProductId: args.onlinePosProductId,
      });
    }
    return null;
  },
});

export const setProductMapping = action({
  args: {
    productId: v.id("products"),
    onlinePosProductId: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId, settings } = await requireEnabledSettings(ctx);

    if (args.onlinePosProductId !== null) {
      const products = parseProducts(
        await requestOnlinePos("/getProducts", settings),
      );
      if (!products.some((product) => product.id === args.onlinePosProductId)) {
        throw new ConvexError(
          "Produktet findes ikke længere i OnlinePOS. Opdatér produktlisten og prøv igen.",
        );
      }
    }

    await ctx.runMutation(internal.onlinePos.saveProductMapping, {
      organizationId,
      productId: args.productId,
      onlinePosProductId: args.onlinePosProductId,
    });
    return null;
  },
});

export const listSales = action({
  args: { from: v.number(), to: v.number() },
  returns: v.object({
    sales: v.array(saleValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (
      !Number.isFinite(args.from) ||
      !Number.isFinite(args.to) ||
      args.from >= args.to ||
      args.to - args.from > MAX_SALES_RANGE_MS
    ) {
      throw new ConvexError("Vælg en periode på højst 31 dage");
    }

    const { organizationId } = await requireOrganizationAdmin(ctx);
    const context: {
      settings: { token: string; companyId: number; enabled: boolean } | null;
      mappings: { onlinePosProductId: number; productName: string }[];
    } = await ctx.runQuery(internal.onlinePos.getSalesContext, {
      organizationId,
    });
    if (!context.settings?.enabled) {
      throw new ConvexError("OnlinePOS-integrationen er ikke aktiv");
    }

    const body = new URLSearchParams({
      from: String(Math.floor(args.from / 1000)),
      to: String(Math.floor(args.to / 1000)),
    });
    const payload = object(
      await requestOnlinePos("/exportSales", context.settings, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }),
    );
    if (!Array.isArray(payload?.sales)) {
      throw new ConvexError("OnlinePOS returnerede en ugyldig salgsliste");
    }

    const names = new Map(
      context.mappings.map((mapping) => [
        mapping.onlinePosProductId,
        mapping.productName,
      ]),
    );
    const parsed = payload.sales.flatMap((value) => {
      const line = object(object(value)?.line);
      const id = number(line?.id);
      const checkNumber = number(line?.chk);
      const productId = number(line?.product_id);
      const amount = number(line?.amount);
      if (
        id === null ||
        checkNumber === null ||
        productId === null ||
        amount === null
      ) {
        return [];
      }
      return [
        {
          id,
          checkNumber,
          date: string(line?.date),
          time: string(line?.time),
          onlinePosProductId: productId,
          onlinePosProductName: string(line?.product),
          localProductName: names.get(productId) ?? null,
          amount,
          price: string(line?.price),
          paymentType: string(line?.payment_type),
          department: string(line?.department),
        },
      ];
    });

    return {
      sales: parsed.slice(0, MAX_SALES),
      truncated: parsed.length > MAX_SALES,
    };
  },
});
