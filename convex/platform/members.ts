import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { getDatabaseAdapter } from "../auth";
import {
  getPlatformMember,
  recordPlatformAudit,
  requirePlatformMember,
} from "../lib/platformAuth";
import { findUserId } from "../platformMembers";

const roleValidator = v.union(v.literal("owner"), v.literal("support"));
const roleLabels = { owner: "ejer", support: "support" };

export const me = query({
  args: {},
  returns: v.union(v.object({ role: roleValidator }), v.null()),
  handler: async (ctx) => {
    const member = await getPlatformMember(ctx);
    return member ? { role: member.role } : null;
  },
});

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("platformMembers"),
      name: v.string(),
      email: v.string(),
      role: roleValidator,
      isCurrentUser: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const actor = await requirePlatformMember(ctx);
    const members = await ctx.db.query("platformMembers").take(200);
    const adapter = getDatabaseAdapter(ctx);
    const users = await Promise.all(
      members.map((member) =>
        adapter.findOne<{ name?: string | null; email: string }>({
          model: "user",
          where: [{ field: "id", value: member.userId }],
        }),
      ),
    );
    return members.map((member, index) => {
      const user = users[index];
      return {
        id: member._id,
        name: user?.name?.trim() || user?.email || "Ukendt bruger",
        email: user?.email ?? "",
        role: member.role,
        isCurrentUser: member.userId === actor.userId,
      };
    });
  },
});

// Owners cannot change their own access, so at least one owner always remains.
async function requireOtherMember(ctx: MutationCtx, memberId: Id<"platformMembers">) {
  const actor = await requirePlatformMember(ctx, "owner");
  const member = await ctx.db.get("platformMembers", memberId);
  if (!member) throw new ConvexError("Platformbrugeren blev ikke fundet");
  if (member.userId === actor.userId) {
    throw new ConvexError("Du kan ikke ændre din egen platformadgang");
  }
  const user = await getDatabaseAdapter(ctx).findOne<{ email: string }>({
    model: "user",
    where: [{ field: "id", value: member.userId }],
  });
  return { actor, member, email: user?.email ?? member.userId };
}

export const add = mutation({
  args: { email: v.string(), role: roleValidator },
  returns: v.null(),
  handler: async (ctx, { email, role }) => {
    const actor = await requirePlatformMember(ctx, "owner");
    const userId = await findUserId(ctx, email);
    const current = await ctx.db
      .query("platformMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (current) throw new ConvexError("Brugeren har allerede platformadgang");
    await ctx.db.insert("platformMembers", { userId, role, createdAt: Date.now() });
    await recordPlatformAudit(ctx, actor, {
      action: "members.add",
      summary: `Platformadgang givet til ${email.trim()} som ${roleLabels[role]}`,
    });
    return null;
  },
});

export const setRole = mutation({
  args: { memberId: v.id("platformMembers"), role: roleValidator },
  returns: v.null(),
  handler: async (ctx, { memberId, role }) => {
    const { actor, member, email } = await requireOtherMember(ctx, memberId);
    await ctx.db.patch("platformMembers", member._id, { role });
    await recordPlatformAudit(ctx, actor, {
      action: "members.setRole",
      summary: `Platformrolle ændret til ${roleLabels[role]} for ${email}`,
    });
    return null;
  },
});

export const remove = mutation({
  args: { memberId: v.id("platformMembers") },
  returns: v.null(),
  handler: async (ctx, { memberId }) => {
    const { actor, member, email } = await requireOtherMember(ctx, memberId);
    await ctx.db.delete("platformMembers", member._id);
    await recordPlatformAudit(ctx, actor, {
      action: "members.remove",
      summary: `Platformadgang fjernet for ${email}`,
    });
    return null;
  },
});
