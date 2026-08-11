import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const RETENTION_MS = 400 * 24 * 60 * 60 * 1_000;
const PAGE_SIZE = 100;

export const prune = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cutoff = Date.now() - RETENTION_MS;
    const page = await ctx.db
      .query("auditLog")
      .withIndex("by_organizationId_and_at")
      .paginate({ cursor: args.cursor, numItems: PAGE_SIZE });
    for (const row of page.page) {
      if (row.at < cutoff) await ctx.db.delete("auditLog", row._id);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.audit.prune, {
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});
