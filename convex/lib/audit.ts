import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type AuditActor = {
  organizationId: string;
  userId: string;
  userName: string;
};

type AuditData = {
  action: string;
  entityTable: string;
  entityId: string;
  summary: string;
  locationId?: Id<"locations">;
  reason?: string;
};

export function requireAuditReason(reason: string) {
  const value = reason.trim();
  if (!value) throw new ConvexError("Angiv en begrundelse");
  if (value.length > 1_000) {
    throw new ConvexError("Begrundelsen må højst være 1.000 tegn");
  }
  return value;
}

export async function recordAudit(
  ctx: MutationCtx,
  actor: AuditActor,
  data: AuditData,
) {
  const summary = data.summary.trim();
  if (!summary) throw new ConvexError("Auditbeskrivelsen skal udfyldes");
  await ctx.db.insert("auditLog", {
    organizationId: actor.organizationId,
    actorUserId: actor.userId,
    actorName: actor.userName,
    action: data.action,
    entityTable: data.entityTable,
    entityId: data.entityId,
    summary,
    at: Date.now(),
    ...(data.locationId ? { locationId: data.locationId } : {}),
    ...(data.reason === undefined
      ? {}
      : { reason: requireAuditReason(data.reason) }),
  });
}
