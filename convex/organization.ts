import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { requireOrganization, requireOrganizationAdmin } from "./lib/auth";

const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

async function requireUnusedByAnotherOrganization(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  organizationId: string,
) {
  const [squareAsset, wideAsset] = await Promise.all([
    ctx.db
      .query("organizationAssets")
      .withIndex("by_logoStorageId", (query) =>
        query.eq("logoStorageId", storageId),
      )
      .unique(),
    ctx.db
      .query("organizationAssets")
      .withIndex("by_wideLogoStorageId", (query) =>
        query.eq("wideLogoStorageId", storageId),
      )
      .unique(),
  ]);
  if (
    [squareAsset, wideAsset].some(
      (asset) => asset && asset.organizationId !== organizationId,
    )
  ) {
    throw new ConvexError("Logouploaden blev ikke fundet");
  }
}

export const getBranding = query({
  args: {},
  returns: v.object({ wideLogoUrl: v.union(v.string(), v.null()) }),
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
    return { wideLogoUrl };
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
    await requireUnusedByAnotherOrganization(
      ctx,
      args.storageId,
      organizationId,
    );

    const logoUrl = await ctx.storage.getUrl(args.storageId);
    if (!logoUrl) throw new ConvexError("Logoet kunne ikke indlæses");

    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    await auth.api.updateOrganization({
      headers,
      body: {
        organizationId,
        data: { logo: logoUrl },
      },
    });

    const currentAsset = await ctx.db
      .query("organizationAssets")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", organizationId),
      )
      .unique();

    if (currentAsset) {
      if (currentAsset.logoStorageId !== args.storageId) {
        if (
          currentAsset.logoStorageId &&
          currentAsset.logoStorageId !== currentAsset.wideLogoStorageId
        ) {
          const oldLogo = await ctx.db.system.get(
            "_storage",
            currentAsset.logoStorageId,
          );
          if (oldLogo) await ctx.storage.delete(currentAsset.logoStorageId);
        }
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
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    await auth.api.updateOrganization({
      headers,
      body: {
        organizationId,
        data: { logo: null },
      },
    });

    const currentAsset = await ctx.db
      .query("organizationAssets")
      .withIndex("by_organizationId", (query) =>
        query.eq("organizationId", organizationId),
      )
      .unique();
    if (currentAsset) {
      if (
        currentAsset.logoStorageId &&
        currentAsset.logoStorageId !== currentAsset.wideLogoStorageId
      ) {
        const logo = await ctx.db.system.get(
          "_storage",
          currentAsset.logoStorageId,
        );
        if (logo) await ctx.storage.delete(currentAsset.logoStorageId);
      }
      if (currentAsset.wideLogoStorageId) {
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
    await requireUnusedByAnotherOrganization(
      ctx,
      args.storageId,
      organizationId,
    );

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
        if (
          currentAsset.wideLogoStorageId &&
          currentAsset.wideLogoStorageId !== currentAsset.logoStorageId
        ) {
          const oldLogo = await ctx.db.system.get(
            "_storage",
            currentAsset.wideLogoStorageId,
          );
          if (oldLogo) await ctx.storage.delete(currentAsset.wideLogoStorageId);
        }
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
      if (
        currentAsset.wideLogoStorageId &&
        currentAsset.wideLogoStorageId !== currentAsset.logoStorageId
      ) {
        const logo = await ctx.db.system.get(
          "_storage",
          currentAsset.wideLogoStorageId,
        );
        if (logo) await ctx.storage.delete(currentAsset.wideLogoStorageId);
      }
      if (currentAsset.logoStorageId) {
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
