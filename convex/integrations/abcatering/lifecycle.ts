import type { MutationCtx } from "../../_generated/server";
import type { AuditActor } from "../../lib/audit";
import { ensureCatalogSupplier } from "../supplierCatalog";

// AB Catering was added after integration switches existed, so it starts disabled.
export async function legacyAbCateringEnabled() {
  return false;
}

export async function applyAbCateringInstallation(
  ctx: MutationCtx,
  actor: AuditActor,
  organizationId: string,
  enabled: boolean,
) {
  if (enabled) {
    await ensureCatalogSupplier(ctx, actor, "abcatering", organizationId);
  }
}
