import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const PAGE_SIZE = 100;

export const prune = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("apiRequestIdempotency")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now()))
      .take(PAGE_SIZE);
    for (const row of expired) {
      await ctx.db.delete("apiRequestIdempotency", row._id);
    }
    if (expired.length === PAGE_SIZE) {
      await ctx.scheduler.runAfter(0, internal.apiIdempotency.prune, {});
    }
    return null;
  },
});
