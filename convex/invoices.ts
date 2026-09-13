import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  isMultiLocationFilter,
  isSingleLocationFilter,
  requireHumanPrincipal,
  requireInvoiceManager,
  requireInvoiceViewer,
  requireLocationAccess,
  resolveLocationFilter,
} from "./lib/auth";
import { recordAudit } from "./lib/audit";
import { requireOtherFeaturesUnlocked } from "./lib/countLock";
import { requireOrganizationLocation } from "./lib/locations";
import { getLocationProductAccess } from "./lib/locationProducts";
import { createProductStockResolver } from "./lib/productStock";
import { addStock, normalizeStock, toDefaultUnit } from "./lib/stock";
import {
  claimStorageForOrganization,
  getStorageReferences,
} from "./lib/storageOwnership";
import { listScopedLocationOptions } from "./locations";
import { menuGroupInputValidator, menuGroups } from "./lib/menuGroups";

const MAX_ITEMS = 100;
const MAX_PRODUCT_UNITS = 100;
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const itemInputValidator = v.object({
  productId: v.id("products"),
  unitId: v.id("units"),
  quantity: v.number(),
  menuId: v.optional(v.id("onlinePosMenus")),
  menuGroupId: v.optional(v.string()),
  menuQuantity: v.optional(v.number()),
});

const listRowValidator = v.object({
  id: v.id("invoices"),
  title: v.string(),
  soldAt: v.number(),
  locationName: v.string(),
  registeredByName: v.string(),
  itemCount: v.number(),
  hasPhoto: v.boolean(),
});

export const listLocations = query({
  args: { page: v.union(v.literal("new"), v.literal("history")) },
  returns: v.array(v.object({ id: v.id("locations"), name: v.string() })),
  handler: async (ctx, args) => {
    const auth =
      args.page === "new"
        ? await requireInvoiceManager(ctx)
        : await requireInvoiceViewer(ctx);
    return await listScopedLocationOptions(
      ctx,
      auth.organizationId,
      auth.locationScope,
    );
  },
});

export const listMenus = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("onlinePosMenus"),
      name: v.string(),
      groups: v.array(menuGroupInputValidator),
      products: v.array(
        v.object({
          id: v.id("products"),
          name: v.string(),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const { organizationId } = await requireInvoiceManager(ctx);
    const menus = await ctx.db
      .query("onlinePosMenus")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(101);
    if (menus.length > 100) throw new ConvexError("Der er for mange menuer");
    return menus
      .map((menu) => ({
        id: menu._id,
        name: menu.name,
        groups: menuGroups(menu),
        products: menu.products.map((product) => ({
          id: product.productId,
          name: product.name,
        })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "da"));
  },
});

export const getProductAccess = query({
  args: { locationId: v.id("locations") },
  returns: v.union(v.null(), v.array(v.id("products"))),
  handler: async (ctx, args) => {
    const auth = await requireInvoiceManager(ctx);
    requireLocationAccess(auth, args.locationId);
    await requireOrganizationLocation(
      ctx,
      auth.organizationId,
      args.locationId,
    );
    const access = await getLocationProductAccess(
      ctx,
      auth.organizationId,
      args.locationId,
    );
    return access.kind === "all" ? null : [...access.effectiveProductIds];
  },
});

export const getProductOption = query({
  args: { productId: v.id("products") },
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("products"),
      name: v.string(),
      imageUrl: v.union(v.string(), v.null()),
      defaultUnitId: v.id("units"),
      units: v.array(v.object({ id: v.id("units"), name: v.string() })),
    }),
  ),
  handler: async (ctx, args) => {
    const { organizationId } = await requireInvoiceManager(ctx);
    const product = await ctx.db.get("products", args.productId);
    if (
      !product ||
      product.organizationId !== organizationId ||
      product.status !== "active"
    ) {
      return null;
    }
    const productUnits = await ctx.db
      .query("productUnits")
      .withIndex("by_organizationId_and_productId", (q) =>
        q.eq("organizationId", organizationId).eq("productId", product._id),
      )
      .take(MAX_PRODUCT_UNITS + 1);
    if (productUnits.length > MAX_PRODUCT_UNITS)
      throw new ConvexError("Produktet har for mange enheder");
    const units = await Promise.all(
      productUnits.map((unit) => ctx.db.get("units", unit.unitId)),
    );
    return {
      id: product._id,
      name: product.name,
      imageUrl: product.imageStorageId
        ? await ctx.storage.getUrl(product.imageStorageId)
        : null,
      defaultUnitId: product.defaultUnitId,
      units: units.flatMap((unit) =>
        unit?.organizationId === organizationId
          ? [{ id: unit._id, name: unit.name }]
          : [],
      ),
    };
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    requireHumanPrincipal(await requireInvoiceManager(ctx));
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    locationId: v.id("locations"),
    title: v.string(),
    soldAt: v.number(),
    comment: v.optional(v.string()),
    receiptStorageId: v.optional(v.id("_storage")),
    clientRequestId: v.string(),
    items: v.array(itemInputValidator),
  },
  returns: v.id("invoices"),
  handler: async (ctx, args) => {
    const auth = requireHumanPrincipal(await requireInvoiceManager(ctx));
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    const location = await requireOrganizationLocation(
      ctx,
      organizationId,
      args.locationId,
    );
    const title = args.title.trim();
    const comment = args.comment?.trim() || undefined;
    if (!title || title.length > 200)
      throw new ConvexError("Angiv en titel på højst 200 tegn");
    if (comment && comment.length > 2_000)
      throw new ConvexError("Kommentaren må højst være 2.000 tegn");
    if (
      !Number.isFinite(args.soldAt) ||
      args.soldAt <= 0 ||
      args.soldAt > Date.now() + 60_000
    ) {
      throw new ConvexError(
        "Angiv en gyldig salgsdato, som ikke ligger i fremtiden",
      );
    }
    if (!args.clientRequestId.trim() || args.clientRequestId.length > 100) {
      throw new ConvexError("Registreringen har et ugyldigt ID");
    }
    if (args.items.length === 0 || args.items.length > MAX_ITEMS) {
      throw new ConvexError("Tilføj mellem 1 og 100 produktlinjer");
    }
    const items = args.items.map((item) => {
      if (item.menuGroupId !== undefined && !item.menuId) {
        throw new ConvexError("Vælg en menu til produktgruppen");
      }
      if (item.menuQuantity !== undefined && !item.menuId) {
        throw new ConvexError("Vælg en menu til antallet af menuer");
      }
      if (
        item.menuQuantity !== undefined &&
        (!Number.isSafeInteger(item.menuQuantity) ||
          item.menuQuantity < 1 ||
          item.menuQuantity > 10_000)
      ) {
        throw new ConvexError(
          "Antallet af menuer skal være et helt tal mellem 1 og 10.000",
        );
      }
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        throw new ConvexError("Mængden skal være større end nul");
      }
      const quantity = normalizeStock(item.quantity);
      if (quantity <= 0) throw new ConvexError("Mængden er for lille");
      return {
        productId: item.productId,
        unitId: item.unitId,
        quantity,
        menuId: item.menuId,
        menuGroupId: item.menuGroupId,
        menuQuantity: item.menuQuantity,
      };
    });
    const requestPayload = JSON.stringify({
      locationId: args.locationId,
      title,
      soldAt: args.soldAt,
      comment,
      receiptStorageId: args.receiptStorageId,
      items,
    });
    const existing = await ctx.db
      .query("invoices")
      .withIndex(
        "by_organizationId_and_registeredBy_and_clientRequestId",
        (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("registeredBy", auth.userId)
            .eq("clientRequestId", args.clientRequestId),
      )
      .unique();
    if (existing) {
      if (existing.requestPayload !== requestPayload) {
        throw new ConvexError(
          "Registreringen er allerede gemt med andre oplysninger. Se kvitteringshistorikken.",
        );
      }
      return existing._id;
    }
    for (const item of args.items) {
      if (item.menuId && !Number.isSafeInteger(item.quantity)) {
        throw new ConvexError("Antallet af produktvalg skal være et helt tal");
      }
    }
    await requireOtherFeaturesUnlocked(ctx, organizationId, location._id);
    if (args.receiptStorageId) {
      await claimStorageForOrganization(
        ctx,
        organizationId,
        args.receiptStorageId,
      );
      const file = await ctx.db.system.get("_storage", args.receiptStorageId);
      if (
        !file?.contentType ||
        !IMAGE_TYPES.has(file.contentType) ||
        file.size > 10 * 1024 * 1024
      ) {
        throw new ConvexError(
          "Brug et JPEG-, PNG-, WebP- eller AVIF-billede på højst 10 MB",
        );
      }
      const references = await getStorageReferences(ctx, args.receiptStorageId);
      if (references.some((rows) => rows.length > 0)) {
        throw new ConvexError("Billedet er allerede i brug");
      }
    }
    const { expand } = createProductStockResolver(ctx, organizationId);
    const productAccess = await getLocationProductAccess(
      ctx,
      organizationId,
      location._id,
    );
    const deductions = new Map<Id<"products">, number>();
    const selectedMenus = new Map<
      Id<"onlinePosMenus">,
      ReturnType<typeof menuGroups>
    >();
    const selectedMenuQuantities = new Map<Id<"onlinePosMenus">, number>();
    const resolvedItems: Array<
      Omit<Doc<"invoiceItems">, "_id" | "_creationTime" | "invoiceId">
    > = [];
    for (const item of items) {
      if (
        productAccess.kind === "selected" &&
        !productAccess.effectiveProductIds.has(item.productId)
      ) {
        throw new ConvexError("Produktet bruges ikke på den valgte lokation");
      }
      const [product, unit, menu] = await Promise.all([
        ctx.db.get("products", item.productId),
        ctx.db.get("units", item.unitId),
        item.menuId ? ctx.db.get("onlinePosMenus", item.menuId) : null,
      ]);
      if (
        !product ||
        product.organizationId !== organizationId ||
        product.status !== "active"
      ) {
        throw new ConvexError("Produktet blev ikke fundet eller er arkiveret");
      }
      if (!unit || unit.organizationId !== organizationId)
        throw new ConvexError("Enheden blev ikke fundet");
      if (
        item.menuId &&
        (!menu ||
          menu.organizationId !== organizationId ||
          !menu.products.some((entry) => entry.productId === product._id))
      ) {
        throw new ConvexError("Produktet findes ikke i den valgte menu");
      }
      const groups = menu ? menuGroups(menu) : [];
      const group = groups.find((entry) => entry.id === item.menuGroupId);
      if (menu) {
        if (!group?.productIds.includes(product._id)) {
          throw new ConvexError(
            "Produktet findes ikke i den valgte produktgruppe",
          );
        }
        if (unit._id !== product.defaultUnitId) {
          throw new ConvexError(
            "Menuens produktvalg skal bruge produktets standardenhed",
          );
        }
        selectedMenus.set(menu._id, groups);
        const menuQuantity = item.menuQuantity ?? 1;
        const previousQuantity = selectedMenuQuantities.get(menu._id);
        if (
          previousQuantity !== undefined &&
          previousQuantity !== menuQuantity
        ) {
          throw new ConvexError(
            "Alle produktvalg i en menu skal have samme antal menuer",
          );
        }
        selectedMenuQuantities.set(menu._id, menuQuantity);
      }
      const totalQuantity = normalizeStock(
        item.quantity * (item.menuQuantity ?? 1),
      );
      if (!Number.isFinite(totalQuantity) || totalQuantity <= 0) {
        throw new ConvexError("Produktets samlede mængde er ugyldig");
      }
      const defaultQuantity = await toDefaultUnit(
        ctx,
        organizationId,
        product._id,
        unit._id,
        totalQuantity,
      );
      if (defaultQuantity === null || defaultQuantity <= 0) {
        throw new ConvexError("Produktet mangler en gyldig enhedsomregning");
      }
      for (const stock of await expand(product._id, defaultQuantity)) {
        if (stock.quantity <= 0)
          throw new ConvexError("Opskriften har en ugyldig lagermængde");
        deductions.set(
          stock.productId,
          normalizeStock(
            (deductions.get(stock.productId) ?? 0) + stock.quantity,
          ),
        );
      }
      if (deductions.size > 1_000)
        throw new ConvexError("Registreringen giver for mange lagerlinjer");
      resolvedItems.push({
        organizationId,
        productId: product._id,
        productName: product.name,
        unitId: unit._id,
        unitName: unit.name,
        quantity: totalQuantity,
        menuId: menu?._id,
        menuName: menu?.name,
        menuGroupId: group?.id,
        menuGroupTitle: group?.title,
        menuQuantity: menu ? (item.menuQuantity ?? 1) : undefined,
      });
    }
    for (const [menuId, groups] of selectedMenus) {
      for (const group of groups) {
        const selections = items
          .filter(
            (item) => item.menuId === menuId && item.menuGroupId === group.id,
          )
          .reduce((total, item) => total + item.quantity, 0);
        if (selections !== group.quantity) {
          throw new ConvexError(
            `Vælg præcis ${group.quantity} produkter i gruppen ${group.title}`,
          );
        }
      }
    }
    const invoiceId = await ctx.db.insert("invoices", {
      organizationId,
      locationId: location._id,
      locationName: location.name,
      title,
      soldAt: args.soldAt,
      comment,
      receiptStorageId: args.receiptStorageId,
      registeredBy: auth.userId,
      registeredByName: auth.userName,
      itemCount: resolvedItems.length,
      clientRequestId: args.clientRequestId,
      requestPayload,
    });
    for (const item of resolvedItems)
      await ctx.db.insert("invoiceItems", { ...item, invoiceId });
    for (const [productId, quantity] of deductions) {
      const stock = await ctx.db
        .query("locationStock")
        .withIndex("by_organizationId_and_locationId_and_productId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("locationId", location._id)
            .eq("productId", productId),
        )
        .unique();
      if (
        stock?.lastCountedAt !== undefined &&
        args.soldAt < stock.lastCountedAt
      )
        continue;
      await addStock(ctx, organizationId, location._id, productId, -quantity);
    }
    await recordAudit(ctx, auth, {
      action: "invoices.create",
      entityTable: "invoices",
      entityId: invoiceId,
      locationId: location._id,
      summary: `Registrerede kvitteringen ${title}`,
    });
    return invoiceId;
  },
});

export const list = query({
  args: {
    locationId: v.optional(v.id("locations")),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(listRowValidator),
  handler: async (ctx, args) => {
    const auth = await requireInvoiceViewer(ctx);
    const filter = resolveLocationFilter(auth, args.locationId);
    if (isMultiLocationFilter(filter)) {
      return { page: [], isDone: true, continueCursor: "" };
    }
    const rows = ctx.db.query("invoices");
    const page = await (
      isSingleLocationFilter(filter)
        ? rows.withIndex("by_organizationId_and_locationId_and_soldAt", (q) =>
            q
              .eq("organizationId", auth.organizationId)
              .eq("locationId", filter.locationId),
          )
        : rows.withIndex("by_organizationId_and_soldAt", (q) =>
            q.eq("organizationId", auth.organizationId),
          )
    )
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...page,
      page: page.page.map((invoice) => ({
        id: invoice._id,
        title: invoice.title,
        soldAt: invoice.soldAt,
        locationName: invoice.locationName,
        registeredByName: invoice.registeredByName,
        itemCount: invoice.itemCount,
        hasPhoto: Boolean(invoice.receiptStorageId),
      })),
    };
  },
});

export const get = query({
  args: { invoiceId: v.id("invoices") },
  returns: v.union(
    v.null(),
    listRowValidator.omit("itemCount", "hasPhoto").extend({
      comment: v.union(v.string(), v.null()),
      receiptUrl: v.union(v.string(), v.null()),
      items: v.array(
        v.object({
          id: v.id("invoiceItems"),
          productName: v.string(),
          unitName: v.string(),
          quantity: v.number(),
          menuName: v.union(v.string(), v.null()),
          menuGroupTitle: v.union(v.string(), v.null()),
          menuQuantity: v.union(v.number(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const auth = await requireInvoiceViewer(ctx);
    const invoice = await ctx.db.get("invoices", args.invoiceId);
    if (!invoice || invoice.organizationId !== auth.organizationId) return null;
    requireLocationAccess(auth, invoice.locationId);
    const items = await ctx.db
      .query("invoiceItems")
      .withIndex("by_organizationId_and_invoiceId", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("invoiceId", invoice._id),
      )
      .take(MAX_ITEMS + 1);
    if (items.length > MAX_ITEMS)
      throw new ConvexError("Kvitteringen har for mange produktlinjer");
    return {
      id: invoice._id,
      title: invoice.title,
      soldAt: invoice.soldAt,
      locationName: invoice.locationName,
      registeredByName: invoice.registeredByName,
      comment: invoice.comment ?? null,
      receiptUrl: invoice.receiptStorageId
        ? await ctx.storage.getUrl(invoice.receiptStorageId)
        : null,
      items: items.map((item) => ({
        id: item._id,
        productName: item.productName,
        unitName: item.unitName,
        quantity: item.quantity,
        menuName: item.menuName ?? null,
        menuGroupTitle: item.menuGroupTitle ?? null,
        menuQuantity: item.menuQuantity ?? null,
      })),
    };
  },
});
