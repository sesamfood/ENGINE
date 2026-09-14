import { internal } from "../../_generated/api";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

export async function legacyWorkfeedEnabled(ctx: QueryCtx, organizationId: string) {
  const connection = await ctx.db.query("workfeedIntegrations")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId)).unique();
  return connection?.enabled ?? false;
}

export async function applyWorkfeedInstallation(ctx: MutationCtx, organizationId: string, enabled: boolean, updatedAt: number) {
  const connection = await ctx.db.query("workfeedIntegrations")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId)).unique();
  if (connection) await ctx.db.patch(connection._id, { enabled, updatedAt });
  if (!enabled) {
    const status = await ctx.db.query("workfeedSyncStatus")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId)).unique();
    if (status) await ctx.db.patch(status._id, {
      state: "idle", runToken: undefined, runKind: undefined, pendingShiftChunks: undefined, updatedAt,
    });
  } else if (connection) {
    await ctx.scheduler.runAfter(0, internal.workfeedSync.enqueueOrganizationSync, { organizationId, kind: "employees", force: true });
  }
}
