import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getUserSession, isApiKeyIdentity } from "./auth";

export type PlatformRole = "owner" | "support";

export async function getPlatformMember(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || isApiKeyIdentity(identity)) return null;
  const session = await getUserSession(ctx, identity);
  if (!session) return null;
  const member = await ctx.db
    .query("platformMembers")
    .withIndex("by_userId", (q) => q.eq("userId", session.userId))
    .unique();
  if (!member) return null;
  return {
    userId: member.userId,
    role: member.role,
    userName: identity.name?.trim() || identity.email || "Ukendt bruger",
  };
}

// Owners can do everything support can, plus change entitlements and suspend.
export async function requirePlatformMember(
  ctx: QueryCtx | MutationCtx,
  role: PlatformRole = "support",
) {
  const member = await getPlatformMember(ctx);
  if (!member || (role === "owner" && member.role !== "owner")) {
    throw new ConvexError("Du har ikke adgang");
  }
  return member;
}
