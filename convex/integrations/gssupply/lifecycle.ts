import type { Doc } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { recordAudit, type AuditActor } from "../../lib/audit";
import { normalizeMasterDataName } from "../../lib/masterData";
import { getGsSupplyConnection } from "./lib/links";

// GS Supply was added after integration switches existed, so it starts disabled.
export async function legacyGsSupplyEnabled() {
  return false;
}

/** Orders through GS Supply need a supplier, so a connected catalog gets one automatically. */
export async function ensureGsSupplySupplier(
  ctx: MutationCtx,
  actor: AuditActor,
  connection: Doc<"gsSupplyConnections">,
) {
  if (
    connection.supplierId &&
    (await ctx.db.get("suppliers", connection.supplierId))
  ) {
    return;
  }
  const { name, normalizedName } = normalizeMasterDataName(
    "GS Supply",
    "Navnet",
  );
  const existing = await ctx.db
    .query("suppliers")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q
        .eq("organizationId", connection.organizationId)
        .eq("normalizedName", normalizedName),
    )
    .first();
  const supplierId =
    existing?._id ??
    (await ctx.db.insert("suppliers", {
      organizationId: connection.organizationId,
      name,
      normalizedName,
      updatedAt: Date.now(),
    }));
  if (!existing) {
    await recordAudit(ctx, actor, {
      action: "supplier.created",
      entityTable: "suppliers",
      entityId: supplierId,
      summary: `Leverandøren ${name} er oprettet`,
    });
  }
  await ctx.db.patch("gsSupplyConnections", connection._id, {
    supplierId,
    updatedAt: Date.now(),
  });
}

export async function applyGsSupplyInstallation(
  ctx: MutationCtx,
  actor: AuditActor,
  organizationId: string,
  enabled: boolean,
) {
  if (!enabled) return;
  const connection = await getGsSupplyConnection(ctx, organizationId);
  if (connection) await ensureGsSupplySupplier(ctx, actor, connection);
}
