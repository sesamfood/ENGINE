import { attachmentValidator, documentationRevisionValidator as revisionValidator, documentationHistoryPageValidator, revisionBatch, revisionDto, attachmentsForValues } from "./lib/ownCheckRecords";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireLocationAccess, requireOwnCheckExporter } from "./lib/auth";
import { recordAudit } from "./lib/audit";
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
  historyNextRevision: v.union(v.number(), v.null()),
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

async function documentationSnapshot(ctx: QueryCtx, entry: Doc<"ownCheckEntries">, generatedAt: number) {
  const snapshot = await ctx.db.query("ownCheckEntryRevisions")
    .withIndex("by_organizationId_and_entryId_and_at_and_revision", (q) => q.eq("organizationId", entry.organizationId).eq("entryId", entry._id).lte("at", generatedAt))
    .order("desc").first();
  if (!snapshot) throw new ConvexError("Egenkontrolrevisionen blev ikke fundet");
  return snapshot;
}

async function recordForDocumentation(ctx: QueryCtx, entry: Doc<"ownCheckEntries">, organizationId: string, timeZone: string, generatedAt: number) {
  const version = await ctx.db.get("ownCheckTemplateVersions", entry.templateVersionId);
  if (!version || version.organizationId !== organizationId) throw new ConvexError("Egenkontrolversionen blev ikke fundet");
  const snapshot = await documentationSnapshot(ctx, entry, generatedAt);
  const history = await revisionBatch(ctx, organizationId, entry._id, 0, snapshot.revision, 1);
  const first = history.revisions[0];
  if (!first) throw new ConvexError("Egenkontrolrevisionen blev ikke fundet");
  return {
    id: entry._id, locationName: entry.locationName, dueDateKey: entry.dueDateKey,
    dueAt: entry.dueAt, performedAt: entry.performedAt, name: entry.name,
    controlType: entry.controlType, status: snapshot.status,
    hasDeviation: snapshot.hasDeviation, followUp: snapshot.followUp,
    performedByName: first.actorName, fields: version.fields, values: snapshot.values,
    note: snapshot.note ?? null, deviation: snapshot.deviation ?? null,
    correctiveAction: snapshot.correctiveAction ?? null,
    approvedByName: snapshot.status === "approved" ? snapshot.actorName : null,
    attachments: await attachmentsForValues(ctx, organizationId, entry._id, history.revisions.map((revision) => revision.values), snapshot.revision),
    revisions: history.revisions.map(revisionDto),
    historyNextRevision: history.nextRevision,
    timeZone,
  };
}

export const listDocumentationHistory = query({
  args: { entryId: v.id("ownCheckEntries"), generatedAt: v.number(), afterRevision: v.number() },
  returns: documentationHistoryPageValidator,
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckExporter(ctx);
    requireFiniteNow(args.generatedAt);
    const entry = await ctx.db.get("ownCheckEntries", args.entryId);
    if (!entry || entry.organizationId !== auth.organizationId || entry.performedAt > args.generatedAt) throw new ConvexError("Egenkontrollen blev ikke fundet");
    requireLocationAccess(auth, entry.locationId);
    const snapshot = await documentationSnapshot(ctx, entry, args.generatedAt);
    const history = await revisionBatch(ctx, auth.organizationId, entry._id, args.afterRevision, snapshot.revision);
    return {
      revisions: history.revisions.map(revisionDto),
      attachments: await attachmentsForValues(ctx, auth.organizationId, entry._id, history.revisions.map((revision) => revision.values), snapshot.revision),
      nextRevision: history.nextRevision,
    };
  },
});

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
      .paginate({
        ...args.paginationOpts,
        maximumRowsRead: Math.min(args.paginationOpts.maximumRowsRead ?? 5, 5),
        maximumBytesRead: Math.min(args.paginationOpts.maximumBytesRead ?? 128 * 1024, 128 * 1024),
      });
    return { ...page, page: await Promise.all(page.page.map((entry) => recordForDocumentation(ctx, entry, auth.organizationId, timeZone, args.generatedAt))) };
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
    await recordAudit(ctx, auth, {
      action: "ownChecks.documentationPrepared",
      entityTable: "locations",
      entityId: location._id,
      locationId: location._id,
      summary: `Kontroldokumentation for ${location.name} blev klargjort for perioden ${args.fromDateKey} til ${args.toDateKey}`,
    });
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
