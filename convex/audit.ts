import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const RETENTION_MS = 400 * 24 * 60 * 60 * 1_000;
const PAGE_SIZE = 100;

export const prune = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - RETENTION_MS;
    const rows = await ctx.db
      .query("auditLog")
      .withIndex("by_at", (q) => q.lt("at", cutoff))
      .take(PAGE_SIZE);
    for (const row of rows) await ctx.db.delete("auditLog", row._id);
    if (rows.length === PAGE_SIZE) {
      await ctx.scheduler.runAfter(0, internal.audit.prune, {});
    }
    return null;
  },
});
