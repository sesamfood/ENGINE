import { v } from "convex/values";
import { query } from "../_generated/server";
import { getPlatformMember } from "../lib/platformAuth";

export const me = query({
  args: {},
  returns: v.union(
    v.object({ role: v.union(v.literal("owner"), v.literal("support")) }),
    v.null(),
  ),
  handler: async (ctx) => {
    const member = await getPlatformMember(ctx);
    return member ? { role: member.role } : null;
  },
});
