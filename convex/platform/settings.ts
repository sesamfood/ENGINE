import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import {
  getDefaultUnavailableDisplay,
  unavailableDisplayValidator,
} from "../lib/features";
import { recordPlatformAudit, requirePlatformMember } from "../lib/platformAuth";

export const get = query({
  args: {},
  returns: v.object({ unavailableDisplay: unavailableDisplayValidator }),
  handler: async (ctx) => {
    await requirePlatformMember(ctx);
    return { unavailableDisplay: await getDefaultUnavailableDisplay(ctx) };
  },
});

export const setUnavailableDisplay = mutation({
  args: { unavailableDisplay: unavailableDisplayValidator },
  returns: v.null(),
  handler: async (ctx, { unavailableDisplay }) => {
    const actor = await requirePlatformMember(ctx, "owner");
    const current = await ctx.db.query("platformSettings").first();
    if (current) {
      await ctx.db.patch("platformSettings", current._id, { unavailableDisplay });
    } else {
      await ctx.db.insert("platformSettings", { unavailableDisplay });
    }
    await recordPlatformAudit(ctx, actor, {
      action: "settings.unavailableDisplay",
      summary: `Standard for funktioner uden for abonnementet: ${unavailableDisplay === "hidden" ? "skjul" : "vis nedtonet"}`,
    });
    return null;
  },
});
