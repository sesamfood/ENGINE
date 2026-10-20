import { ConvexError, v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { getDatabaseAdapter } from "./auth";

// Bootstraps platform access from the CLI, for example:
// npx convex run platformMembers:grant '{"email":"a@b.dk","role":"owner"}'

export async function findUserId(ctx: MutationCtx, email: string) {
  const user = await getDatabaseAdapter(ctx).findOne<{ id: string }>({
    model: "user",
    where: [{ field: "email", value: email.trim().toLowerCase() }],
  });
  if (!user) throw new ConvexError("Brugeren blev ikke fundet");
  return user.id;
}

export const grant = internalMutation({
  args: {
    email: v.string(),
    role: v.union(v.literal("owner"), v.literal("support")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await findUserId(ctx, args.email);
    const current = await ctx.db
      .query("platformMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (current) await ctx.db.patch("platformMembers", current._id, { role: args.role });
    else {
      await ctx.db.insert("platformMembers", {
        userId,
        role: args.role,
        createdAt: Date.now(),
      });
    }
    return null;
  },
});

export const revoke = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await findUserId(ctx, args.email);
    const current = await ctx.db
      .query("platformMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (current) await ctx.db.delete("platformMembers", current._id);
    return null;
  },
});
