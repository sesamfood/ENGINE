import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { rateLimiter } from "./rateLimits";

export type WorkfeedEmployeeSyncResult = {
  accepted: boolean;
  state: "queued" | "alreadyQueued" | "rateLimited" | "unavailable";
  retryAt: number | null;
};

export async function requestWorkfeedEmployeeSync(
  ctx: MutationCtx,
  organizationId: string,
): Promise<WorkfeedEmployeeSyncResult> {
  const [integration, status] = await Promise.all([
    ctx.db
      .query("workfeedIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique(),
    ctx.db
      .query("workfeedSyncStatus")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique(),
  ]);
  if (!integration?.enabled) {
    return { accepted: false, state: "unavailable", retryAt: null };
  }
  if (status?.state === "queued" || status?.state === "running") {
    return { accepted: false, state: "alreadyQueued", retryAt: null };
  }
  const limit = await rateLimiter.limit(ctx, "manualWorkfeedSync", {
    key: organizationId,
  });
  if (!limit.ok) {
    return {
      accepted: false,
      state: "rateLimited",
      retryAt: Date.now() + (limit.retryAfter ?? 0),
    };
  }
  const now = Date.now();
  const runToken = `employees:${now}`;
  if (status) {
    await ctx.db.patch(status._id, {
      state: "queued",
      runKind: "employees",
      runToken,
      lastEmployeeAttemptAt: now,
      lastError: undefined,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("workfeedSyncStatus", {
      organizationId,
      state: "queued",
      runKind: "employees",
      runToken,
      lastEmployeeAttemptAt: now,
      updatedAt: now,
    });
  }
  await ctx.scheduler.runAfter(0, internal.workfeedSync.syncEmployees, {
    organizationId,
    runToken,
  });
  return { accepted: true, state: "queued", retryAt: null };
}
