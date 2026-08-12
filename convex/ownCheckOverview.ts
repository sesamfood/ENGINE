import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getDatabaseAdapter } from "./auth";
import {
  isMultiLocationFilter,
  isSingleLocationFilter,
  requireLocationAccess,
  requireOwnCheckViewer,
  resolveLocationFilter,
} from "./lib/auth";
import {
  dateKeyDifference,
  loadTemplateVersions,
  MAX_OVERVIEW_ROWS,
  occurrenceKey,
  planItem,
  requireLocation,
  versionInput,
} from "./lib/ownChecks";
import { resolveTimeZone } from "./lib/timeZone";
import { ownCheckControlTypeValidator, ownCheckFieldValidator, ownCheckNoteValidator, ownCheckValueValidator } from "./lib/ownCheckValidators";
import { addDateKey, expandOccurrences, zonedTimestamp } from "../lib/own-checks";

const statusFilterValidator = v.union(
  v.literal("notCompleted"),
  v.literal("completed"),
  v.literal("approved"),
  v.literal("deviation"),
);

const overviewRowValidator = v.object({
  locationId: v.id("locations"),
  locationName: v.string(),
  templateId: v.id("ownCheckTemplates"),
  templateVersionId: v.id("ownCheckTemplateVersions"),
  templateVersion: v.number(),
  name: v.string(),
  controlType: ownCheckControlTypeValidator,
  description: v.string(),
  fields: v.array(ownCheckFieldValidator),
  responsibleRole: v.union(v.string(), v.null()),
  dueDateKey: v.string(),
  startsAt: v.union(v.number(), v.null()),
  dueAt: v.number(),
  overdue: v.boolean(),
  status: v.union(v.literal("notCompleted"), v.literal("completed"), v.literal("approved"), v.literal("deviation")),
  entry: v.union(v.object({
    id: v.id("ownCheckEntries"),
    status: v.union(v.literal("completed"), v.literal("deviation"), v.literal("approved")),
    hasDeviation: v.boolean(),
    followUp: v.union(v.literal("none"), v.literal("open"), v.literal("resolved")),
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
  }), v.null()),
});

const recordEntryValidator = v.object({
  id: v.id("ownCheckEntries"),
  organizationId: v.string(),
  locationId: v.id("locations"),
  locationName: v.string(),
  templateId: v.id("ownCheckTemplates"),
  templateVersionId: v.id("ownCheckTemplateVersions"),
  templateVersion: v.number(),
  name: v.string(),
  controlType: ownCheckControlTypeValidator,
  dueDateKey: v.string(),
  dueAt: v.number(),
  status: v.union(v.literal("completed"), v.literal("deviation"), v.literal("approved")),
  hasDeviation: v.boolean(),
  followUp: v.union(v.literal("none"), v.literal("open"), v.literal("resolved")),
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
  updatedAt: v.number(),
});

const attachmentValidator = v.object({
  id: v.id("ownCheckAttachments"),
  fieldKey: v.string(),
  storageId: v.id("_storage"),
  url: v.union(v.string(), v.null()),
  contentType: v.string(),
  fileSize: v.number(),
  addedAtRevision: v.number(),
  removedAtRevision: v.union(v.number(), v.null()),
});

const revisionValidator = v.object({
  id: v.id("ownCheckEntryRevisions"),
  revision: v.number(),
  kind: v.union(v.literal("submitted"), v.literal("edited"), v.literal("deviationRecorded"), v.literal("correctiveActionRecorded"), v.literal("approved")),
  values: v.array(ownCheckValueValidator),
  status: v.union(v.literal("completed"), v.literal("deviation"), v.literal("approved")),
  hasDeviation: v.boolean(),
  followUp: v.union(v.literal("none"), v.literal("open"), v.literal("resolved")),
  compliant: v.boolean(),
  note: v.union(v.string(), v.null()),
  deviation: v.union(ownCheckNoteValidator, v.null()),
  correctiveAction: v.union(ownCheckNoteValidator, v.null()),
  changes: v.array(v.object({ field: v.string(), label: v.string(), from: v.union(v.string(), v.null()), to: v.union(v.string(), v.null()) })),
  reason: v.union(v.string(), v.null()),
  at: v.number(),
  actorUserId: v.string(),
  actorName: v.string(),
});

const locationIdsValidator = v.optional(v.id("locations"));

function withinStatus(
  item: ReturnType<typeof planItem>,
  filter: "notCompleted" | "completed" | "approved" | "deviation" | undefined,
) {
  if (!filter) return true;
  if (filter === "notCompleted") return !item.entry;
  if (!item.entry) return false;
  if (filter === "deviation") return item.entry.hasDeviation;
  return item.status === filter;
}

async function locationRows(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  locationIds: Id<"locations">[],
  fromDateKey: string,
  toDateKey: string,
  controlType: Doc<"ownCheckTemplateVersions">["controlType"] | undefined,
  status: "notCompleted" | "completed" | "approved" | "deviation" | undefined,
  performedBy: string | undefined,
  performedRole: string | undefined,
) {
  const rows: Array<ReturnType<typeof planItem> & { locationId: Id<"locations">; locationName: string }> = [];
  let truncated = false;
  for (const locationId of locationIds) {
    if (rows.length >= MAX_OVERVIEW_ROWS) {
      truncated = true;
      break;
    }
    const location = await requireLocation(ctx, organizationId, locationId);
    const timeZone = await resolveTimeZone(ctx, organizationId, locationId);
    const versions = await loadTemplateVersions(ctx, organizationId, fromDateKey, toDateKey, timeZone);
    const occurrences = expandOccurrences({ versions: versions.map(versionInput), locationId, fromDateKey, toDateKey, timeZone });
    const startAt = zonedTimestamp(fromDateKey, 0, timeZone);
    const endAt = zonedTimestamp(addDateKey(toDateKey, 1), 0, timeZone);
    const entries = await ctx.db
      .query("ownCheckEntries")
      .withIndex("by_organizationId_and_locationId_and_dueAt", (q) => q.eq("organizationId", organizationId).eq("locationId", locationId).gte("dueAt", startAt).lt("dueAt", endAt))
      .take(MAX_OVERVIEW_ROWS);
    if (entries.length >= MAX_OVERVIEW_ROWS) truncated = true;
    const entriesByKey = new Map(entries.map((entry) => [occurrenceKey(entry.templateId, entry.dueDateKey), entry]));
    const versionsById = new Map(versions.map((version) => [version._id, version]));
    for (const occurrence of occurrences) {
      if (controlType && occurrence.controlType !== controlType) continue;
      const version = versionsById.get(occurrence.templateVersionId as Id<"ownCheckTemplateVersions">);
      if (!version) continue;
      const entry = entriesByKey.get(occurrenceKey(version.templateId, occurrence.dueDateKey)) ?? null;
      if (performedBy && entry && entry.performedBy !== performedBy) continue;
      if (performedBy && !entry && (!version.responsibleRole || version.responsibleRole !== performedRole)) continue;
      const item = planItem(occurrence, version, entry, Date.now());
      if (!withinStatus(item, status)) continue;
      rows.push({ ...item, locationId, locationName: location.name });
      if (rows.length >= MAX_OVERVIEW_ROWS) {
        truncated = true;
        return { rows, truncated };
      }
    }
  }
  return { rows, truncated };
}

async function entryRows(
  ctx: QueryCtx,
  organizationId: string,
  filter: { locationId: Id<"locations"> } | { locationIds: Id<"locations">[] } | "all",
  fromDateKey: string,
  toDateKey: string,
  controlType: Doc<"ownCheckTemplateVersions">["controlType"] | undefined,
  status: "completed" | "approved" | "deviation",
  performedBy: string | undefined,
  paginationOpts: { numItems: number; cursor: string | null },
) {
  const timeZone = isSingleLocationFilter(filter)
    ? await resolveTimeZone(ctx, organizationId, filter.locationId)
    : undefined;
  const startAt = timeZone
    ? zonedTimestamp(fromDateKey, 0, timeZone)
    : new Date(`${fromDateKey}T00:00:00Z`).getTime() - 86_400_000;
  const endAt = timeZone
    ? zonedTimestamp(addDateKey(toDateKey, 1), 0, timeZone)
    : new Date(`${addDateKey(toDateKey, 1)}T00:00:00Z`).getTime() + 86_400_000;
  const page = isSingleLocationFilter(filter)
    ? await ctx.db.query("ownCheckEntries")
      .withIndex("by_organizationId_and_locationId_and_dueAt", (q) => q.eq("organizationId", organizationId).eq("locationId", filter.locationId).gte("dueAt", startAt).lt("dueAt", endAt!))
      .order("asc")
      .paginate({ ...paginationOpts, numItems: Math.min(paginationOpts.numItems, MAX_OVERVIEW_ROWS) })
    : await ctx.db.query("ownCheckEntries")
      .withIndex("by_organizationId_and_dueAt", (q) => q.eq("organizationId", organizationId).gte("dueAt", startAt).lt("dueAt", endAt))
      .order("asc")
      .paginate({ ...paginationOpts, numItems: Math.min(paginationOpts.numItems, MAX_OVERVIEW_ROWS) });
  const allowedLocationIds = isMultiLocationFilter(filter) ? new Set(filter.locationIds) : null;
  const rows = [] as Array<ReturnType<typeof planItem> & { locationId: Id<"locations">; locationName: string }>;
  for (const entry of page.page) {
    if (allowedLocationIds && !allowedLocationIds.has(entry.locationId)) continue;
    if (status === "deviation" ? !entry.hasDeviation : entry.status !== status) continue;
    if (controlType && entry.controlType !== controlType) continue;
    if (performedBy && entry.performedBy !== performedBy) continue;
    const version = await ctx.db.get("ownCheckTemplateVersions", entry.templateVersionId);
    if (!version || version.organizationId !== organizationId) continue;
    const entryTimeZone = timeZone ?? await resolveTimeZone(ctx, organizationId, entry.locationId);
    const occurrence = {
      templateId: entry.templateId,
      templateVersionId: entry.templateVersionId,
      templateVersion: entry.templateVersion,
      name: entry.name,
      controlType: entry.controlType,
      dueDateKey: entry.dueDateKey,
      startsAt: version.startMinuteOfDay === undefined ? null : zonedTimestamp(entry.dueDateKey, version.startMinuteOfDay, entryTimeZone),
      dueAt: entry.dueAt,
    };
    rows.push({ ...planItem(occurrence, version, entry, Date.now()), locationId: entry.locationId, locationName: entry.locationName });
  }
  rows.sort((a, b) => a.dueAt - b.dueAt || Number(Boolean(b.entry?.followUp === "open")) - Number(Boolean(a.entry?.followUp === "open")) || a.name.localeCompare(b.name, "da"));
  return { ...page, page: rows, ...(page.isDone ? {} : { pageStatus: "SplitRecommended" as const }) };
}

export const listOwnChecks = query({
  args: {
    paginationOpts: paginationOptsValidator,
    fromDateKey: v.string(),
    toDateKey: v.string(),
    locationId: locationIdsValidator,
    controlType: v.optional(ownCheckControlTypeValidator),
    status: v.optional(statusFilterValidator),
    performedBy: v.optional(v.string()),
  },
  returns: paginationResultValidator(overviewRowValidator),
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckViewer(ctx);
    const range = dateKeyDifference(args.fromDateKey, args.toDateKey);
    if (range < 0 || range + 1 > 92) throw new ConvexError("Vælg højst 92 dage i oversigten");
    const filter = resolveLocationFilter(auth, args.locationId);
    const locationIds = isSingleLocationFilter(filter)
      ? [filter.locationId]
      : isMultiLocationFilter(filter)
        ? filter.locationIds
        : (await ctx.db.query("locations").withIndex("by_organizationId_and_normalizedName", (q) => q.eq("organizationId", auth.organizationId)).take(200)).map((location) => location._id);
    if (args.status && args.status !== "notCompleted") {
      return await entryRows(ctx, auth.organizationId, filter, args.fromDateKey, args.toDateKey, args.controlType, args.status, args.performedBy, args.paginationOpts);
    }
    const performedRole = args.performedBy
      ? (await getDatabaseAdapter(ctx).findOne<{ role?: string }>({
          model: "member",
          where: [
            { field: "organizationId", value: auth.organizationId },
            { field: "userId", value: args.performedBy },
          ],
        }))?.role
      : undefined;
    const result = await locationRows(ctx, auth.organizationId, locationIds, args.fromDateKey, args.toDateKey, args.controlType, args.status, args.performedBy, performedRole);
    const rows = result.rows;
    rows.sort((a, b) => a.dueAt - b.dueAt || Number(Boolean(b.entry?.followUp === "open")) - Number(Boolean(a.entry?.followUp === "open")) || a.name.localeCompare(b.name, "da"));
    return { page: rows, isDone: true, continueCursor: "", ...(result.truncated ? { pageStatus: "SplitRecommended" as const } : {}) };
  },
});

export const getOwnCheckRecord = query({
  args: { entryId: v.id("ownCheckEntries") },
  returns: v.union(v.object({ entry: recordEntryValidator, fields: v.array(ownCheckFieldValidator), description: v.string(), attachments: v.array(attachmentValidator), revisions: v.array(revisionValidator), timeZone: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckViewer(ctx);
    const entry = await ctx.db.get("ownCheckEntries", args.entryId);
    if (!entry || entry.organizationId !== auth.organizationId) return null;
    requireLocationAccess(auth, entry.locationId);
    const version = await ctx.db.get("ownCheckTemplateVersions", entry.templateVersionId);
    if (!version || version.organizationId !== auth.organizationId) throw new ConvexError("Egenkontrolversionen blev ikke fundet");
    const timeZone = await resolveTimeZone(ctx, auth.organizationId, entry.locationId);
    const [attachments, revisions] = await Promise.all([
      ctx.db.query("ownCheckAttachments").withIndex("by_organizationId_and_entryId", (q) => q.eq("organizationId", auth.organizationId).eq("entryId", entry._id)).collect(),
      ctx.db.query("ownCheckEntryRevisions").withIndex("by_organizationId_and_entryId_and_revision", (q) => q.eq("organizationId", auth.organizationId).eq("entryId", entry._id)).collect(),
    ]);
    return {
      entry: {
        id: entry._id,
        organizationId: entry.organizationId,
        locationId: entry.locationId,
        locationName: entry.locationName,
        templateId: entry.templateId,
        templateVersionId: entry.templateVersionId,
        templateVersion: entry.templateVersion,
        name: entry.name,
        controlType: entry.controlType,
        dueDateKey: entry.dueDateKey,
        dueAt: entry.dueAt,
        status: entry.status,
        hasDeviation: entry.hasDeviation,
        followUp: entry.followUp,
        compliant: entry.compliant,
        values: entry.values,
        note: entry.note ?? null,
        deviation: entry.deviation ?? null,
        correctiveAction: entry.correctiveAction ?? null,
        performedAt: entry.performedAt,
        performedBy: entry.performedBy,
        performedByName: entry.performedByName,
        approvedAt: entry.approvedAt ?? null,
        approvedBy: entry.approvedBy ?? null,
        approvedByName: entry.approvedByName ?? null,
        revision: entry.revision,
        updatedAt: entry.updatedAt,
      },
      fields: version.fields,
      description: version.description,
      attachments: await Promise.all(attachments.map(async (attachment) => ({
        id: attachment._id,
        fieldKey: attachment.fieldKey,
        storageId: attachment.storageId,
        url: await ctx.storage.getUrl(attachment.storageId),
        contentType: attachment.contentType,
        fileSize: attachment.fileSize,
        addedAtRevision: attachment.addedAtRevision,
        removedAtRevision: attachment.removedAtRevision ?? null,
      }))),
      revisions: revisions.sort((a, b) => a.revision - b.revision).map((revision) => ({
        id: revision._id,
        revision: revision.revision,
        kind: revision.kind,
        values: revision.values,
        status: revision.status,
        hasDeviation: revision.hasDeviation,
        followUp: revision.followUp,
        compliant: revision.compliant,
        note: revision.note ?? null,
        deviation: revision.deviation ?? null,
        correctiveAction: revision.correctiveAction ?? null,
        changes: revision.changes,
        reason: revision.reason ?? null,
        at: revision.at,
        actorUserId: revision.actorUserId,
        actorName: revision.actorName,
      })),
      timeZone,
    };
  },
});
