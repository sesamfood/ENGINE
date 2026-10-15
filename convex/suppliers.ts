import { ConvexError, v } from "convex/values";
import { hasPermission } from "../lib/auth-permissions";
import { mutation, query } from "./_generated/server";
import { recordAudit } from "./lib/audit";
import { requireOrganization, requireOrganizationAdmin } from "./lib/auth";
import { normalizeMasterDataName } from "./lib/masterData";
import {
  getGsSupplyConnection,
  getGsSupplySupplierId,
} from "./integrations/gssupply/lib/links";

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
  catalog: v.union(v.literal("gssupply"), v.null()),
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
    const [suppliers, gsSupplySupplierId] = await Promise.all([
      ctx.db
        .query("suppliers")
        .withIndex("by_organizationId_and_normalizedName", (q) =>
          q.eq("organizationId", auth.organizationId),
        )
        .take(MAX_SUPPLIERS),
      getGsSupplySupplierId(ctx, auth.organizationId),
    ]);
    return suppliers.map((supplier) => ({
      id: supplier._id,
      name: supplier.name,
      email: supplier.email ?? null,
      catalog:
        supplier._id === gsSupplySupplierId ? ("gssupply" as const) : null,
    }));
  },
});

const supplierInput = {
  name: v.string(),
  email: v.union(v.string(), v.null()),
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
    // Orders keep the supplier name, so history stays readable.
    const connection = await getGsSupplyConnection(ctx, auth.organizationId);
    if (connection?.supplierId === supplier._id) {
      await ctx.db.patch("gsSupplyConnections", connection._id, {
        supplierId: undefined,
        updatedAt: Date.now(),
      });
    }
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
