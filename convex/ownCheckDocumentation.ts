import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireLocationAccess, requireOwnCheckExporter } from "./lib/auth";
import { dateKeyDifference, expandOwnCheckOccurrences, loadTemplateVersions, occurrenceKey, requireFiniteNow, versionInput } from "./lib/ownChecks";
import { requireLocation } from "./lib/ownChecks";
import { resolveTimeZone } from "./lib/timeZone";
import { addDateKey, dateKeyInZone, zonedTimestamp } from "../lib/own-checks";
import {
  ownCheckControlTypeValidator,
  ownCheckFieldValidator,
  ownCheckNoteValidator,
  ownCheckValueValidator,
} from "./lib/ownCheckValidators";

const MAX_EXPORT_PAGE_SIZE = 100;
const MAX_MISSING = 5_000;
const ownCheckStatusValidator = v.union(v.literal("completed"), v.literal("deviation"), v.literal("approved"));

const attachmentValidator = v.object({
  id: v.id("ownCheckAttachments"),
  fieldKey: v.string(),
  url: v.union(v.string(), v.null()),
  contentType: v.string(),
  fileSize: v.number(),
  storageId: v.id("_storage"),
  addedAtRevision: v.number(),
  removedAtRevision: v.union(v.number(), v.null()),
});

const revisionValidator = v.object({
  id: v.id("ownCheckEntryRevisions"),
  revision: v.number(),
  kind: v.union(v.literal("submitted"), v.literal("edited"), v.literal("deviationRecorded"), v.literal("correctiveActionRecorded"), v.literal("approved")),
  values: v.array(ownCheckValueValidator),
  status: ownCheckStatusValidator,
  hasDeviation: v.boolean(),
  followUp: v.union(v.literal("none"), v.literal("open"), v.literal("resolved")),
  compliant: v.boolean(),
  note: v.union(v.string(), v.null()),
  deviation: v.union(ownCheckNoteValidator, v.null()),
  correctiveAction: v.union(ownCheckNoteValidator, v.null()),
  changes: v.array(v.object({ field: v.string(), label: v.string(), from: v.union(v.string(), v.null()), to: v.union(v.string(), v.null()) })),
  reason: v.union(v.string(), v.null()),
  at: v.number(),
  actorName: v.string(),
});

const documentationRecordValidator = v.object({
  id: v.id("ownCheckEntries"),
  locationName: v.string(),
  dueDateKey: v.string(),
  dueAt: v.number(),
  performedAt: v.number(),
  name: v.string(),
  controlType: ownCheckControlTypeValidator,
  status: ownCheckStatusValidator,
  hasDeviation: v.boolean(),
  followUp: v.union(v.literal("none"), v.literal("open"), v.literal("resolved")),
  performedByName: v.string(),
  fields: v.array(ownCheckFieldValidator),
  values: v.array(ownCheckValueValidator),
  note: v.union(v.string(), v.null()),
  deviation: v.union(ownCheckNoteValidator, v.null()),
  correctiveAction: v.union(ownCheckNoteValidator, v.null()),
  approvedByName: v.union(v.string(), v.null()),
  attachments: v.array(attachmentValidator),
  revisions: v.array(revisionValidator),
  timeZone: v.string(),
});

const missingValidator = v.object({
  templateId: v.id("ownCheckTemplates"),
  name: v.string(),
  controlType: ownCheckControlTypeValidator,
  dueDateKey: v.string(),
  dueAt: v.number(),
  responsibleRole: v.union(v.string(), v.null()),
});

const headerValidator = v.object({
  locationId: v.id("locations"),
  locationName: v.string(),
  legalEntityName: v.union(v.string(), v.null()),
  registrationNumber: v.union(v.string(), v.null()),
  operatorName: v.union(v.string(), v.null()),
  marketName: v.union(v.string(), v.null()),
  fromDateKey: v.string(),
  toDateKey: v.string(),
  generatedAt: v.number(),
  generatedBy: v.string(),
  timeZone: v.string(),
});

function requirePageSize(numItems: number) {
  if (!Number.isInteger(numItems) || numItems <= 0 || numItems > MAX_EXPORT_PAGE_SIZE) {
    throw new ConvexError("Siden er for stor");
  }
}

async function exportContext(ctx: QueryCtx | MutationCtx, args: { fromDateKey: string; toDateKey: string; locationId: Id<"locations"> }) {
  const auth = await requireOwnCheckExporter(ctx);
  const range = dateKeyDifference(args.fromDateKey, args.toDateKey);
  if (range < 0 || range + 1 > 366) throw new ConvexError("Vælg højst 366 dage i dokumentationen");
  requireLocationAccess(auth, args.locationId);
  const location = await requireLocation(ctx, auth.organizationId, args.locationId);
  const timeZone = await resolveTimeZone(ctx, auth.organizationId, args.locationId);
  return { auth, location, timeZone };
}

const preparedDocumentationValidator = v.object({
  header: headerValidator,
  missing: v.object({ items: v.array(missingValidator), truncated: v.boolean() }),
});

async function recordForDocumentation(ctx: QueryCtx, entry: Doc<"ownCheckEntries">, organizationId: string, timeZone: string) {
  const version = await ctx.db.get("ownCheckTemplateVersions", entry.templateVersionId);
  if (!version || version.organizationId !== organizationId) throw new ConvexError("Egenkontrolversionen blev ikke fundet");
  const [attachments, revisions] = await Promise.all([
    ctx.db.query("ownCheckAttachments").withIndex("by_organizationId_and_entryId", (q) => q.eq("organizationId", organizationId).eq("entryId", entry._id)).collect(),
    ctx.db.query("ownCheckEntryRevisions").withIndex("by_organizationId_and_entryId_and_revision", (q) => q.eq("organizationId", organizationId).eq("entryId", entry._id)).collect(),
  ]);
  return {
    id: entry._id,
    locationName: entry.locationName,
    dueDateKey: entry.dueDateKey,
    dueAt: entry.dueAt,
    performedAt: entry.performedAt,
    name: entry.name,
    controlType: entry.controlType,
    status: entry.status,
    hasDeviation: entry.hasDeviation,
    followUp: entry.followUp,
    performedByName: entry.performedByName,
    fields: version.fields,
    values: entry.values,
    note: entry.note ?? null,
    deviation: entry.deviation ?? null,
    correctiveAction: entry.correctiveAction ?? null,
    approvedByName: entry.approvedByName ?? null,
    attachments: await Promise.all(attachments.map(async (attachment) => ({
      id: attachment._id,
      fieldKey: attachment.fieldKey,
      url: await ctx.storage.getUrl(attachment.storageId),
      contentType: attachment.contentType,
      fileSize: attachment.fileSize,
      storageId: attachment.storageId,
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
      actorName: revision.actorName,
    })),
    timeZone,
  };
}

export const buildDocumentation = query({
  args: {
    paginationOpts: paginationOptsValidator,
    fromDateKey: v.string(),
    toDateKey: v.string(),
    locationId: v.id("locations"),
    generatedAt: v.number(),
  },
  returns: paginationResultValidator(documentationRecordValidator),
  handler: async (ctx, args) => {
    const { auth, timeZone } = await exportContext(ctx, args);
    requireFiniteNow(args.generatedAt);
    requirePageSize(args.paginationOpts.numItems);
    const startAt = zonedTimestamp(args.fromDateKey, 0, timeZone);
    const endAt = zonedTimestamp(addDateKey(args.toDateKey, 1), 0, timeZone);
    const page = await ctx.db.query("ownCheckEntries")
      .withIndex("by_organizationId_and_locationId_and_dueAt", (q) => q.eq("organizationId", auth.organizationId).eq("locationId", args.locationId).gte("dueAt", startAt).lt("dueAt", endAt))
      .filter((q) => q.lte(q.field("performedAt"), args.generatedAt))
      .order("asc")
      .paginate(args.paginationOpts);
    return { ...page, page: await Promise.all(page.page.map((entry) => recordForDocumentation(ctx, entry, auth.organizationId, timeZone))) };
  },
});

async function documentationHeader(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  userName: string,
  location: Doc<"locations">,
  fromDateKey: string,
  toDateKey: string,
  generatedAt: number,
  timeZone: string,
) {
  const [legalEntity, operator, market] = await Promise.all([
    location.legalEntityId ? ctx.db.get("legalEntities", location.legalEntityId) : null,
    location.operatorId ? ctx.db.get("operators", location.operatorId) : null,
    location.marketId ? ctx.db.get("markets", location.marketId) : null,
  ]);
  for (const row of [legalEntity, operator, market]) {
    if (row && row.organizationId !== organizationId) throw new ConvexError("Masterdata blev ikke fundet");
  }
  return {
    locationId: location._id,
    locationName: location.name,
    legalEntityName: legalEntity?.name ?? null,
    registrationNumber: legalEntity?.registrationNumber ?? null,
    operatorName: operator?.name ?? null,
    marketName: market?.name ?? null,
    fromDateKey,
    toDateKey,
    generatedAt,
    generatedBy: userName,
    timeZone,
  };
}

async function missingDocumentation(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
  fromDateKey: string,
  toDateKey: string,
  timeZone: string,
  generatedAt: number,
) {
  const versions = await loadTemplateVersions(ctx, organizationId, fromDateKey, toDateKey, timeZone);
  const occurrences = expandOwnCheckOccurrences({ versions: versions.map(versionInput), locationId, fromDateKey, toDateKey, timeZone })
    .filter((occurrence) => occurrence.dueAt <= generatedAt);
  if (occurrences.length > MAX_MISSING) return { items: [], truncated: true };
  const startAt = zonedTimestamp(fromDateKey, 0, timeZone);
  const endAt = zonedTimestamp(addDateKey(toDateKey, 1), 0, timeZone);
  const entries = generatedAt < startAt
    ? []
    : await ctx.db.query("ownCheckEntries")
      .withIndex("by_organizationId_and_locationId_and_dueAt", (q) => q.eq("organizationId", organizationId).eq("locationId", locationId).gte("dueAt", startAt).lt("dueAt", endAt))
      .filter((q) => q.lte(q.field("performedAt"), generatedAt))
      .take(MAX_MISSING + 1);
  if (entries.length > MAX_MISSING) return { items: [], truncated: true };
  const byKey = new Set(entries.map((entry) => occurrenceKey(entry.templateId, entry.dueDateKey)));
  const versionsById = new Map(versions.map((version) => [version._id, version]));
  const items = occurrences.flatMap((occurrence) => byKey.has(occurrenceKey(occurrence.templateId, occurrence.dueDateKey)) ? [] : [{
    templateId: occurrence.templateId as Id<"ownCheckTemplates">,
    name: occurrence.name,
    controlType: occurrence.controlType,
    dueDateKey: occurrence.dueDateKey,
    dueAt: occurrence.dueAt,
    responsibleRole: versionsById.get(occurrence.templateVersionId as Id<"ownCheckTemplateVersions">)?.responsibleRole ?? null,
  }]);
  return items.length > MAX_MISSING ? { items: [], truncated: true } : { items, truncated: false };
}

export const prepareDocumentation = mutation({
  args: { fromDateKey: v.string(), toDateKey: v.string(), locationId: v.id("locations") },
  returns: preparedDocumentationValidator,
  handler: async (ctx, args) => {
    const { auth, location, timeZone } = await exportContext(ctx, args);
    const generatedAt = Date.now();
    const [header, missing] = await Promise.all([
      documentationHeader(ctx, auth.organizationId, auth.userName, location, args.fromDateKey, args.toDateKey, generatedAt, timeZone),
      missingDocumentation(ctx, auth.organizationId, args.locationId, args.fromDateKey, args.toDateKey, timeZone, generatedAt),
    ]);
    return { header, missing };
  },
});

export const getDocumentationDateContext = query({
  args: { locationId: v.id("locations"), now: v.number() },
  returns: v.object({ timeZone: v.string(), todayDateKey: v.string() }),
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckExporter(ctx);
    requireFiniteNow(args.now);
    requireLocationAccess(auth, args.locationId);
    const location = await requireLocation(ctx, auth.organizationId, args.locationId);
    const timeZone = await resolveTimeZone(ctx, auth.organizationId, location._id);
    return { timeZone, todayDateKey: dateKeyInZone(args.now, timeZone) };
  },
});

export const listMissingOwnChecks = query({
  args: { fromDateKey: v.string(), toDateKey: v.string(), locationId: v.id("locations"), generatedAt: v.number() },
  returns: v.object({ items: v.array(missingValidator), truncated: v.boolean() }),
  handler: async (ctx, args) => {
    const { auth, timeZone } = await exportContext(ctx, args);
    requireFiniteNow(args.generatedAt);
    return await missingDocumentation(ctx, auth.organizationId, args.locationId, args.fromDateKey, args.toDateKey, timeZone, args.generatedAt);
  },
});
