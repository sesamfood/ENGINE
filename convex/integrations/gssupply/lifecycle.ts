import type { MutationCtx } from "../../_generated/server";
import type { AuditActor } from "../../lib/audit";
import { ensureCatalogSupplier } from "../supplierCatalog";

// GS Supply was added after integration switches existed, so it starts disabled.
export async function legacyGsSupplyEnabled() {
  return false;
}

export async function applyGsSupplyInstallation(
  ctx: MutationCtx,
  actor: AuditActor,
  organizationId: string,
  enabled: boolean,
) {
  if (enabled) {
    await ensureCatalogSupplier(ctx, actor, "gssupply", organizationId);
  }
}
