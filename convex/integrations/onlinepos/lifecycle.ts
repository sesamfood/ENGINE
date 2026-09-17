import { internal } from "../../_generated/api";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { MAX_MASTER_CONNECTIONS } from "./lib/connections";

export async function legacyOnlinePosEnabled(ctx: QueryCtx, organizationId: string) {
  const connection = await ctx.db.query("onlinePosIntegrations")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId)).first();
  return connection?.enabled ?? false;
}

export async function applyOnlinePosInstallation(ctx: MutationCtx, organizationId: string, enabled: boolean, updatedAt: number) {
  const connections = await ctx.db.query("onlinePosIntegrations")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId)).take(MAX_MASTER_CONNECTIONS + 1);
  for (const connection of connections) await ctx.db.patch(connection._id, { enabled, updatedAt });
  if (!enabled) {
    const [salesStatuses, stockStatuses] = await Promise.all([
      ctx.db.query("onlinePosSyncStatus").withIndex("by_organizationId_and_locationId", (q) => q.eq("organizationId", organizationId)).take(201),
      ctx.db.query("onlinePosStockSyncStatus").withIndex("by_organizationId_and_locationId", (q) => q.eq("organizationId", organizationId)).take(201),
    ]);
    for (const status of salesStatuses) await ctx.db.patch(status._id, { state: "idle", runToken: undefined, updatedAt });
    for (const status of stockStatuses) await ctx.db.patch(status._id, { state: "idle", runToken: crypto.randomUUID(), updatedAt });
  } else if (connections.length) {
    await ctx.scheduler.runAfter(0, internal.onlinePosSync.enqueueOrganizationSync, { organizationId });
  }
}
