import { ConvexError, v } from "convex/values";
import { hasPermission } from "../lib/auth-permissions";
import { mutation, query } from "./_generated/server";
import { recordAudit } from "./lib/audit";
import { requireOrganization, requireOrganizationAdmin } from "./lib/auth";
import {
  forecastSettings,
  forecastSettingsFields,
  requireForecastSettings,
} from "./lib/orderForecastSettings";
import { normalizeMasterDataName } from "./lib/masterData";
import {
  catalogProviderIds,
  catalogProviders,
  catalogProviderValidator,
  getCatalogConnection,
  getCatalogSupplierId,
} from "./integrations/supplierCatalog";

const MAX_SUPPLIERS = 100;
const MAX_EMAIL_LENGTH = 254;

function normalizeEmail(value: string | null) {
  const email = value?.trim() ?? "";
  if (!email) return undefined;
  if (
    email.length > MAX_EMAIL_LENGTH ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new ConvexError("Indtast en gyldig e-mailadresse");
  }
  return email;
}

const supplierValidator = v.object({
  id: v.id("suppliers"),
  name: v.string(),
  email: v.union(v.string(), v.null()),
  catalog: v.union(catalogProviderValidator, v.null()),
  // Created and controlled by an integration, so it can't be deleted here.
  managed: v.boolean(),
  ...forecastSettingsFields,
});

export const list = query({
  args: {},
  returns: v.array(supplierValidator),
  handler: async (ctx) => {
    const auth = await requireOrganization(ctx);
    if (
      auth.kioskModeEnabled ||
      (!hasPermission(auth.role, auth.permissions, "ordering.plan") &&
        !hasPermission(auth.role, auth.permissions, "organization.settings"))
    ) {
      throw new ConvexError("Du har ikke adgang");
    }
    const [suppliers, providers] = await Promise.all([
      ctx.db
        .query("suppliers")
        .withIndex("by_organizationId_and_normalizedName", (q) =>
          q.eq("organizationId", auth.organizationId),
        )
        .take(MAX_SUPPLIERS),
      Promise.all(
        catalogProviderIds.map(async (provider) => ({
          provider,
          supplierId: await getCatalogSupplierId(
            ctx,
            provider,
            auth.organizationId,
          ),
          connection: await getCatalogConnection(
            ctx,
            provider,
            auth.organizationId,
          ),
        })),
      ),
    ]);
    return suppliers.map((supplier) => ({
      id: supplier._id,
      name: supplier.name,
      email: supplier.email ?? null,
      catalog:
        providers.find((row) => row.supplierId === supplier._id)?.provider ??
        null,
      managed: providers.some(
        (row) => row.connection?.supplierId === supplier._id,
      ),
      ...forecastSettings(supplier),
    }));
  },
});

const supplierInput = {
  name: v.string(),
  email: v.union(v.string(), v.null()),
  ...forecastSettingsFields,
};

export const create = mutation({
  args: supplierInput,
  returns: v.id("suppliers"),
  handler: async (ctx, args) => {
    const auth = await requireOrganizationAdmin(ctx);
    const { name, normalizedName } = normalizeMasterDataName(
      args.name,
      "Navnet",
    );
    const email = normalizeEmail(args.email);
    const existing = await ctx.db
      .query("suppliers")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .take(MAX_SUPPLIERS);
    if (existing.length >= MAX_SUPPLIERS) {
      throw new ConvexError(`Der kan højst være ${MAX_SUPPLIERS} leverandører`);
    }
    if (existing.some((supplier) => supplier.normalizedName === normalizedName)) {
      throw new ConvexError("Der findes allerede en leverandør med det navn");
    }
    const id = await ctx.db.insert("suppliers", {
      organizationId: auth.organizationId,
      name,
      normalizedName,
      email,
      ...requireForecastSettings(args),
      updatedAt: Date.now(),
    });
    await recordAudit(ctx, auth, {
      action: "supplier.created",
      entityTable: "suppliers",
      entityId: id,
      summary: `Leverandøren ${name} er oprettet`,
    });
    return id;
  },
});

export const update = mutation({
  args: { supplierId: v.id("suppliers"), ...supplierInput },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireOrganizationAdmin(ctx);
    const supplier = await ctx.db.get("suppliers", args.supplierId);
    if (!supplier || supplier.organizationId !== auth.organizationId) {
      throw new ConvexError("Leverandøren blev ikke fundet");
    }
    const { name, normalizedName } = normalizeMasterDataName(
      args.name,
      "Navnet",
    );
    const duplicate = await ctx.db
      .query("suppliers")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("normalizedName", normalizedName),
      )
      .first();
    if (duplicate && duplicate._id !== supplier._id) {
      throw new ConvexError("Der findes allerede en leverandør med det navn");
    }
    await ctx.db.patch("suppliers", supplier._id, {
      name,
      normalizedName,
      email: normalizeEmail(args.email),
      ...requireForecastSettings(args),
      updatedAt: Date.now(),
    });
    await recordAudit(ctx, auth, {
      action: "supplier.updated",
      entityTable: "suppliers",
      entityId: supplier._id,
      summary: `Leverandøren ${name} er opdateret`,
    });
    return null;
  },
});

export const remove = mutation({
  args: { supplierId: v.id("suppliers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireOrganizationAdmin(ctx);
    const supplier = await ctx.db.get("suppliers", args.supplierId);
    if (!supplier || supplier.organizationId !== auth.organizationId) {
      throw new ConvexError("Leverandøren blev ikke fundet");
    }
    for (const provider of catalogProviderIds) {
      const connection = await getCatalogConnection(
        ctx,
        provider,
        auth.organizationId,
      );
      if (connection?.supplierId === supplier._id) {
        throw new ConvexError(
          `Leverandøren styres af ${catalogProviders[provider].name}-integrationen og kan ikke slettes`,
        );
      }
    }
    // Orders keep the supplier name, so history stays readable.
    await ctx.db.delete("suppliers", supplier._id);
    await recordAudit(ctx, auth, {
      action: "supplier.deleted",
      entityTable: "suppliers",
      entityId: supplier._id,
      summary: `Leverandøren ${supplier.name} er slettet`,
    });
    return null;
  },
});
