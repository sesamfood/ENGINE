import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import {
  foodSafetyNoteValidator,
  foodSafetyProductTemperatureValidator,
  foodSafetyValueValidator,
} from "./foodSafetyValidators";

export const entrySummaryObjectValidator = v.object({
  id: v.id("foodSafetyEntries"),
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
  values: v.array(foodSafetyValueValidator),
  note: v.union(v.string(), v.null()),
  deviation: v.union(foodSafetyNoteValidator, v.null()),
  correctiveAction: v.union(foodSafetyNoteValidator, v.null()),
  performedAt: v.number(),
  startedAt: v.union(v.number(), v.null()),
  endedAt: v.union(v.number(), v.null()),
  productTemperatures: v.array(foodSafetyProductTemperatureValidator),
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
  id: v.id("foodSafetyAttachments"),
  fieldKey: v.string(),
  storageId: v.id("_storage"),
  url: v.union(v.string(), v.null()),
  contentType: v.string(),
  fileSize: v.number(),
  addedAtRevision: v.number(),
  removedAtRevision: v.union(v.number(), v.null()),
});

export const revisionValidator = v.object({
  id: v.id("foodSafetyEntryRevisions"),
  revision: v.number(),
  kind: v.union(
    v.literal("submitted"),
    v.literal("edited"),
    v.literal("deviationRecorded"),
    v.literal("correctiveActionRecorded"),
    v.literal("approved"),
  ),
  values: v.array(foodSafetyValueValidator),
  startedAt: v.union(v.number(), v.null()),
  endedAt: v.union(v.number(), v.null()),
  productTemperatures: v.array(foodSafetyProductTemperatureValidator),
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
  deviation: v.union(foodSafetyNoteValidator, v.null()),
  correctiveAction: v.union(foodSafetyNoteValidator, v.null()),
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

export function revisionDto(row: Doc<"foodSafetyEntryRevisions">) {
  return {
    id: row._id,
    revision: row.revision,
    kind: row.kind,
    values: row.values,
    startedAt: row.startedAt ?? null,
    endedAt: row.endedAt ?? null,
    productTemperatures: row.productTemperatures ?? [],
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

export function detailRevisionDto(row: Doc<"foodSafetyEntryRevisions">) {
  return { ...revisionDto(row), actorUserId: row.actorUserId };
}

export async function revisionBatch(
  ctx: QueryCtx,
  organizationId: string,
  entryId: Id<"foodSafetyEntries">,
  afterRevision: number,
  throughRevision: number,
  limit = 10,
) {
  if (!Number.isSafeInteger(afterRevision) || afterRevision < 0)
    throw new ConvexError("Revisionen er ugyldig");
  const rows = await ctx.db
    .query("foodSafetyEntryRevisions")
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
  entryId: Id<"foodSafetyEntries">,
  values: ReadonlyArray<Doc<"foodSafetyEntries">["values"]>,
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
        .query("foodSafetyAttachments")
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
  entryId: Id<"foodSafetyEntries">,
  values: ReadonlyArray<Doc<"foodSafetyEntries">["values"]>,
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
