import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const PAGE_SIZE = 50;
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

export const removeOrphans = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const page = await ctx.db.system
      .query("_storage")
      .order("asc")
      .paginate({ cursor: args.cursor, numItems: PAGE_SIZE });
    const cutoff = Date.now() - ORPHAN_GRACE_MS;

    for (const file of page.page) {
      if (file._creationTime > cutoff) continue;
      const [logo, wideLogo, product, attachment] = await Promise.all([
        ctx.db
          .query("organizationAssets")
          .withIndex("by_logoStorageId", (q) =>
            q.eq("logoStorageId", file._id),
          )
          .first(),
        ctx.db
          .query("organizationAssets")
          .withIndex("by_wideLogoStorageId", (q) =>
            q.eq("wideLogoStorageId", file._id),
          )
          .first(),
        ctx.db
          .query("products")
          .withIndex("by_imageStorageId", (q) =>
            q.eq("imageStorageId", file._id),
          )
          .first(),
        ctx.db
          .query("badDeliveryAttachments")
          .withIndex("by_storageId", (q) => q.eq("storageId", file._id))
          .first(),
      ]);
      if (!logo && !wideLogo && !product && !attachment) {
        await ctx.storage.delete(file._id);
      }
    }

    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.storageCleanup.removeOrphans, {
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});
