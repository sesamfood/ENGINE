import type { MutationCtx, QueryCtx } from "../../_generated/server";

export async function legacyWoltEnabled(ctx: QueryCtx, organizationId: string) {
  const connection = await ctx.db.query("woltIntegrations")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId)).unique();
  return Boolean(connection?.enabled && connection.credentials);
}

export async function applyWoltInstallation(ctx: MutationCtx, organizationId: string, enabled: boolean, updatedAt: number) {
  const connection = await ctx.db.query("woltIntegrations")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId)).unique();
  if (connection) await ctx.db.patch(connection._id, { enabled, updatedAt });
}
