import type { QueryCtx } from "../../_generated/server";

export async function legacyEconomicEnabled(ctx: QueryCtx, organizationId: string) {
  const connections = await ctx.db.query("economicConnections")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId)).take(201);
  return connections.some((connection) => connection.enabled);
}
