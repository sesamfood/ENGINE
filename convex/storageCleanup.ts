import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { getStorageReferences } from "./lib/storageOwnership";

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
      const references = await getStorageReferences(ctx, file._id);
      if (references.every((rows) => rows.length === 0)) {
        await ctx.storage.delete(file._id);
        const owner = await ctx.db.query("storageOwners")
          .withIndex("by_storageId", (q) => q.eq("storageId", file._id))
          .unique();
        if (owner) await ctx.db.delete("storageOwners", owner._id);
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
