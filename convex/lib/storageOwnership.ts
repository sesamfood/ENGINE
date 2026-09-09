import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function getStorageReferences(
  ctx: QueryCtx | MutationCtx,
  storageId: Id<"_storage">,
) {
  return await Promise.all([
    ctx.db.query("organizationAssets")
      .withIndex("by_logoStorageId", (q) => q.eq("logoStorageId", storageId))
      .take(2),
    ctx.db.query("organizationAssets")
      .withIndex("by_wideLogoStorageId", (q) => q.eq("wideLogoStorageId", storageId))
      .take(2),
    ctx.db.query("products")
      .withIndex("by_imageStorageId", (q) => q.eq("imageStorageId", storageId))
      .take(2),
    ctx.db.query("badDeliveryAttachments")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .take(2),
    ctx.db.query("ownCheckAttachments")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .take(2),
    // Check photos always have an owner row; one version reference keeps them alive.
    ctx.db.query("ownCheckTemplateVersions")
      .withIndex("by_imageStorageId", (q) => q.eq("imageStorageId", storageId))
      .take(1),
    ctx.db.query("feedbackSubmissions")
      .withIndex("by_screenshotStorageId", (q) => q.eq("screenshotStorageId", storageId))
      .take(2),
    ctx.db.query("transfers")
      .withIndex("by_deliveryNoteStorageId", (q) => q.eq("deliveryNoteStorageId", storageId))
      .take(2),
    ctx.db.query("manualGoodsReceipts")
      .withIndex("by_deliveryNoteStorageId", (q) => q.eq("deliveryNoteStorageId", storageId))
      .take(2),
  ]);
}

export async function claimStorageForOrganization(
  ctx: MutationCtx,
  organizationId: string,
  storageId: Id<"_storage">,
) {
  const [owner, references] = await Promise.all([
    ctx.db.query("storageOwners")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .unique(),
    getStorageReferences(ctx, storageId),
  ]);
  // Legacy files have no owner row. Check every feature before the first claim.
  if (
    (owner && owner.organizationId !== organizationId) ||
    references.some((rows) =>
      rows.length > 1 || rows.some((row) => row.organizationId !== organizationId),
    )
  ) {
    throw new ConvexError("Filen blev ikke fundet");
  }
  if (!owner) {
    await ctx.db.insert("storageOwners", { organizationId, storageId });
  }
}

export async function preserveStorageOwnership(
  ctx: MutationCtx,
  organizationId: string,
  storageId: Id<"_storage"> | undefined,
) {
  if (storageId && await ctx.db.system.get("_storage", storageId)) {
    await claimStorageForOrganization(ctx, organizationId, storageId);
  }
}
