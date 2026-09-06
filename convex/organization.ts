import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalQuery, mutation, query } from "./_generated/server";
import { getDatabaseAdapter } from "./auth";
import { claimStorageForOrganization, preserveStorageOwnership } from "./lib/storageOwnership";
import { requireOrganization, requireOrganizationAdmin } from "./lib/auth";
import {
  getOrganizationThemeError,
  normalizeOrganizationTheme,
  organizationThemeValidator,
} from "./lib/organizationTheme";

const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const organizationBrandingValidator = v.object({
  wideLogoUrl: v.union(v.string(), v.null()),
  theme: v.union(organizationThemeValidator, v.null()),
});

async function requireValidLogo(ctx: MutationCtx, storageId: Id<"_storage">) {
  const metadata = await ctx.db.system.get("_storage", storageId);
  if (!metadata) throw new ConvexError("Logouploaden blev ikke fundet");
  if (
    !metadata.contentType ||
    !ALLOWED_LOGO_TYPES.has(metadata.contentType) ||
    metadata.size > MAX_LOGO_SIZE
  ) {
    throw new ConvexError(
      "Brug et logo i JPEG-, PNG- eller WebP-format på højst 2 MB",
    );
  }
}

export const getBranding = query({
  args: {},
  returns: organizationBrandingValidator,
  handler: async (ctx) => {
    const { organizationId } = await requireOrganization(ctx);
    const asset = await ctx.db
      .query("organizationAssets")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", organizationId),
      )
      .unique();
    const wideLogoUrl = asset?.wideLogoStorageId
      ? await ctx.storage.getUrl(asset.wideLogoStorageId)
      : null;
    return { wideLogoUrl, theme: asset?.theme ?? null };
  },
});

export const getBrandingForEmail = internalQuery({
  args: { organizationId: v.string() },
  returns: organizationBrandingValidator,
  handler: async (ctx, args) => {
    const asset = await ctx.db
      .query("organizationAssets")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", args.organizationId),
      )
      .unique();
    const wideLogoUrl = asset?.wideLogoStorageId
      ? await ctx.storage.getUrl(asset.wideLogoStorageId)
      : null;
    return { wideLogoUrl, theme: asset?.theme ?? null };
  },
});

export const setTheme = mutation({
  args: { theme: organizationThemeValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const theme = normalizeOrganizationTheme(args.theme);
    const error = getOrganizationThemeError(theme);
    if (error) throw new ConvexError(error);

    const asset = await ctx.db
      .query("organizationAssets")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", organizationId),
      )
      .unique();
    if (asset) {
      await ctx.db.patch("organizationAssets", asset._id, { theme });
    } else {
      await ctx.db.insert("organizationAssets", { organizationId, theme });
    }
    return null;
  },
});

export const generateLogoUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireOrganizationAdmin(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const setLogo = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.string(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    await requireValidLogo(ctx, args.storageId);
    await claimStorageForOrganization(ctx, organizationId, args.storageId);

    const logoUrl = await ctx.storage.getUrl(args.storageId);
    if (!logoUrl) throw new ConvexError("Logoet kunne ikke indlæses");

    await getDatabaseAdapter(ctx).update({
      model: "organization",
      where: [{ field: "id", value: organizationId }],
      update: { logo: logoUrl, updatedAt: new Date() },
    });

    const currentAsset = await ctx.db
      .query("organizationAssets")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", organizationId),
      )
      .unique();

    if (currentAsset) {
      if (currentAsset.logoStorageId !== args.storageId) {
        await preserveStorageOwnership(ctx, organizationId, currentAsset.logoStorageId);
        await ctx.db.patch("organizationAssets", currentAsset._id, {
          logoStorageId: args.storageId,
        });
      }
    } else {
      await ctx.db.insert("organizationAssets", {
        organizationId,
        logoStorageId: args.storageId,
      });
    }

    return logoUrl;
  },
});

export const removeLogo = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    await getDatabaseAdapter(ctx).update({
      model: "organization",
      where: [{ field: "id", value: organizationId }],
      update: { logo: null, updatedAt: new Date() },
    });

    const currentAsset = await ctx.db
      .query("organizationAssets")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", organizationId),
      )
      .unique();
    if (currentAsset) {
      await preserveStorageOwnership(ctx, organizationId, currentAsset.logoStorageId);
      if (currentAsset.wideLogoStorageId || currentAsset.theme) {
        await ctx.db.patch("organizationAssets", currentAsset._id, {
          logoStorageId: undefined,
        });
      } else {
        await ctx.db.delete("organizationAssets", currentAsset._id);
      }
    }

    return null;
  },
});

export const setWideLogo = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.string(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    await requireValidLogo(ctx, args.storageId);
    await claimStorageForOrganization(ctx, organizationId, args.storageId);

    const logoUrl = await ctx.storage.getUrl(args.storageId);
    if (!logoUrl) throw new ConvexError("Logoet kunne ikke indlæses");

    const currentAsset = await ctx.db
      .query("organizationAssets")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", organizationId),
      )
      .unique();

    if (currentAsset) {
      if (currentAsset.wideLogoStorageId !== args.storageId) {
        await preserveStorageOwnership(ctx, organizationId, currentAsset.wideLogoStorageId);
        await ctx.db.patch("organizationAssets", currentAsset._id, {
          wideLogoStorageId: args.storageId,
        });
      }
    } else {
      await ctx.db.insert("organizationAssets", {
        organizationId,
        wideLogoStorageId: args.storageId,
      });
    }

    return logoUrl;
  },
});

export const removeWideLogo = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const currentAsset = await ctx.db
      .query("organizationAssets")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", organizationId),
      )
      .unique();

    if (currentAsset) {
      await preserveStorageOwnership(ctx, organizationId, currentAsset.wideLogoStorageId);
      if (currentAsset.logoStorageId || currentAsset.theme) {
        await ctx.db.patch("organizationAssets", currentAsset._id, {
          wideLogoStorageId: undefined,
        });
      } else {
        await ctx.db.delete("organizationAssets", currentAsset._id);
      }
    }

    return null;
  },
});
