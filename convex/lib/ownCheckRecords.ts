import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import {
  ownCheckNoteValidator,
  ownCheckValueValidator,
} from "./ownCheckValidators";

export const entrySummaryObjectValidator = v.object({
  id: v.id("ownCheckEntries"),
  status: v.union(
    v.literal("completed"),
    v.literal("deviation"),
    v.literal("approved"),
  ),
  hasDeviation: v.boolean(),
  followUp: v.union(
    v.literal("none"),
    v.literal("open"),
    v.literal("resolved"),
  ),
  compliant: v.boolean(),
  values: v.array(ownCheckValueValidator),
  note: v.union(v.string(), v.null()),
  deviation: v.union(ownCheckNoteValidator, v.null()),
  correctiveAction: v.union(ownCheckNoteValidator, v.null()),
  performedAt: v.number(),
  performedBy: v.string(),
  performedByName: v.string(),
  approvedAt: v.union(v.number(), v.null()),
  approvedBy: v.union(v.string(), v.null()),
  approvedByName: v.union(v.string(), v.null()),
  revision: v.number(),
});

export const entrySummaryValidator = v.union(
  entrySummaryObjectValidator,
  v.null(),
);

export const attachmentValidator = v.object({
  id: v.id("ownCheckAttachments"),
  fieldKey: v.string(),
  storageId: v.id("_storage"),
  url: v.union(v.string(), v.null()),
  contentType: v.string(),
  fileSize: v.number(),
  addedAtRevision: v.number(),
  removedAtRevision: v.union(v.number(), v.null()),
});

export const revisionValidator = v.object({
  id: v.id("ownCheckEntryRevisions"),
  revision: v.number(),
  kind: v.union(
    v.literal("submitted"),
    v.literal("edited"),
    v.literal("deviationRecorded"),
    v.literal("correctiveActionRecorded"),
    v.literal("approved"),
  ),
  values: v.array(ownCheckValueValidator),
  status: v.union(
    v.literal("completed"),
    v.literal("deviation"),
    v.literal("approved"),
  ),
  hasDeviation: v.boolean(),
  followUp: v.union(
    v.literal("none"),
    v.literal("open"),
    v.literal("resolved"),
  ),
  compliant: v.boolean(),
  note: v.union(v.string(), v.null()),
  deviation: v.union(ownCheckNoteValidator, v.null()),
  correctiveAction: v.union(ownCheckNoteValidator, v.null()),
  changes: v.array(
    v.object({
      field: v.string(),
      label: v.string(),
      from: v.union(v.string(), v.null()),
      to: v.union(v.string(), v.null()),
    }),
  ),
  reason: v.union(v.string(), v.null()),
  at: v.number(),
  actorUserId: v.string(),
  actorName: v.string(),
});

export const documentationRevisionValidator =
  revisionValidator.omit("actorUserId");
export const historyPageValidator = v.object({
  revisions: v.array(revisionValidator),
  attachments: v.array(attachmentValidator),
  nextRevision: v.union(v.number(), v.null()),
});
export const documentationHistoryPageValidator = historyPageValidator
  .omit("revisions")
  .extend({
    revisions: v.array(documentationRevisionValidator),
  });

export function revisionDto(row: Doc<"ownCheckEntryRevisions">) {
  return {
    id: row._id,
    revision: row.revision,
    kind: row.kind,
    values: row.values,
    status: row.status,
    hasDeviation: row.hasDeviation,
    followUp: row.followUp,
    compliant: row.compliant,
    note: row.note ?? null,
    deviation: row.deviation ?? null,
    correctiveAction: row.correctiveAction ?? null,
    changes: row.changes,
    reason: row.reason ?? null,
    at: row.at,
    actorName: row.actorName,
  };
}

export function detailRevisionDto(row: Doc<"ownCheckEntryRevisions">) {
  return { ...revisionDto(row), actorUserId: row.actorUserId };
}

export async function revisionBatch(
  ctx: QueryCtx,
  organizationId: string,
  entryId: Id<"ownCheckEntries">,
  afterRevision: number,
  throughRevision: number,
  limit = 10,
) {
  if (!Number.isSafeInteger(afterRevision) || afterRevision < 0)
    throw new ConvexError("Revisionen er ugyldig");
  const rows = await ctx.db
    .query("ownCheckEntryRevisions")
    .withIndex("by_organizationId_and_entryId_and_revision", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("entryId", entryId)
        .gt("revision", afterRevision)
        .lte("revision", throughRevision),
    )
    .take(limit + 1);
  const revisions = rows.slice(0, limit);
  return {
    revisions,
    nextRevision:
      rows.length > limit ? revisions[revisions.length - 1].revision : null,
  };
}

export async function attachmentRowsForValues(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  entryId: Id<"ownCheckEntries">,
  values: ReadonlyArray<Doc<"ownCheckEntries">["values"]>,
) {
  const storageIds = [
    ...new Set(
      values.flatMap((items) =>
        items.flatMap((value) =>
          value.type === "attachment" ? value.storageIds : [],
        ),
      ),
    ),
  ];
  return await Promise.all(
    storageIds.map(async (storageId) => {
      const rows = await ctx.db
        .query("ownCheckAttachments")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .take(2);
      const row = rows[0];
      if (
        rows.length !== 1 ||
        row.organizationId !== organizationId ||
        row.entryId !== entryId
      )
        throw new ConvexError("Dokumentationsfilen blev ikke fundet");
      return row;
    }),
  );
}

export async function attachmentsForValues(
  ctx: QueryCtx,
  organizationId: string,
  entryId: Id<"ownCheckEntries">,
  values: ReadonlyArray<Doc<"ownCheckEntries">["values"]>,
  throughRevision: number,
) {
  const rows = await attachmentRowsForValues(
    ctx,
    organizationId,
    entryId,
    values,
  );
  return await Promise.all(
    rows
      .filter((row) => row.addedAtRevision <= throughRevision)
      .map(async (row) => ({
        id: row._id,
        fieldKey: row.fieldKey,
        storageId: row.storageId,
        url: await ctx.storage.getUrl(row.storageId),
        contentType: row.contentType,
        fileSize: row.fileSize,
        addedAtRevision: row.addedAtRevision,
        removedAtRevision:
          row.removedAtRevision !== undefined &&
          row.removedAtRevision <= throughRevision
            ? row.removedAtRevision
            : null,
      })),
  );
}
