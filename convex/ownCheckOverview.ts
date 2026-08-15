import {
  type FilterBuilder,
  type GenericTableInfo,
  type PaginationOptions,
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
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
  expandOwnCheckOccurrences,
  loadTemplateVersionsUntil,
  MAX_OVERVIEW_ROWS,
  occurrenceKey,
  occurrenceForEntry,
  planItem,
  ownCheckDateContext,
  requireLocation,
  versionInput,
} from "./lib/ownChecks";
import { resolveLocationTimeZones, resolveTimeZone } from "./lib/timeZone";
import { ownCheckControlTypeValidator, ownCheckFieldValidator, ownCheckNoteValidator, ownCheckValueValidator } from "./lib/ownCheckValidators";
import { addDateKey, ownCheckStatus, zonedTimestamp } from "../lib/own-checks";

const MAX_OVERVIEW_PAGE_SIZE = 100;

function requirePageSize(numItems: number) {
  if (!Number.isInteger(numItems) || numItems <= 0 || numItems > MAX_OVERVIEW_PAGE_SIZE) {
    throw new ConvexError("Siden er for stor");
  }
}

const overviewRowValidator = v.object({
  locationId: v.id("locations"),
  locationName: v.string(),
  templateId: v.id("ownCheckTemplates"),
  templateVersionId: v.id("ownCheckTemplateVersions"),
  templateVersion: v.number(),
  name: v.string(),
  controlType: ownCheckControlTypeValidator,
  dueDateKey: v.string(),
  startsAt: v.union(v.number(), v.null()),
  dueAt: v.number(),
  timeZone: v.string(),
  status: v.union(v.literal("notCompleted"), v.literal("completed"), v.literal("approved"), v.literal("deviation")),
  entry: v.union(v.object({
    id: v.id("ownCheckEntries"),
    status: v.union(v.literal("completed"), v.literal("deviation"), v.literal("approved")),
    hasDeviation: v.boolean(),
    followUp: v.union(v.literal("none"), v.literal("open"), v.literal("resolved")),
    performedBy: v.string(),
    performedByName: v.string(),
  }), v.null()),
});

const overviewPlanValidator = v.object({
  rows: v.array(overviewRowValidator),
  truncated: v.boolean(),
});

const overviewEntriesPaginationValidator = v.object({
  ...paginationResultValidator(overviewRowValidator).fields,
  truncated: v.boolean(),
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

type OverviewFilter = ReturnType<typeof resolveLocationFilter>;
type OverviewEntry = {
  id: Id<"ownCheckEntries">;
  status: "completed" | "deviation" | "approved";
  hasDeviation: boolean;
  followUp: "none" | "open" | "resolved";
  performedBy: string;
  performedByName: string;
};
type OverviewRow = {
  locationId: Id<"locations">;
  locationName: string;
  templateId: Id<"ownCheckTemplates">;
  templateVersionId: Id<"ownCheckTemplateVersions">;
  templateVersion: number;
  name: string;
  controlType: Doc<"ownCheckTemplateVersions">["controlType"];
  dueDateKey: string;
  startsAt: number | null;
  dueAt: number;
  timeZone: string;
  status: "notCompleted" | "completed" | "approved" | "deviation";
  entry: OverviewEntry | null;
};

const MAX_OVERVIEW_LOCATIONS = 200;

function withinStatus(
  item: ReturnType<typeof planItem>,
  filter: "notCompleted" | "completed" | "approved" | "deviation" | undefined,
) {
  if (!filter) return true;
  if (filter === "notCompleted") return !item.entry;
  if (!item.entry) return false;
  if (filter === "deviation") return item.entry.hasDeviation;
  return ownCheckStatus(item.entry) === filter;
}

function locationFilter(
  q: FilterBuilder<GenericTableInfo>,
  locationIds: ReadonlySet<Id<"locations">>,
) {
  return q.or(...[...locationIds].map((locationId) => q.eq(q.field("locationId"), locationId)));
}

function overviewEntryKey(locationId: Id<"locations">, templateId: string, dueDateKey: string) {
  return `${locationId}:${occurrenceKey(templateId, dueDateKey)}`;
}

async function resolveOverviewLocations(ctx: QueryCtx, organizationId: string, filter: OverviewFilter) {
  const locationIds = isSingleLocationFilter(filter)
    ? [filter.locationId]
    : isMultiLocationFilter(filter)
      ? [...new Set(filter.locationIds)].slice(0, MAX_OVERVIEW_LOCATIONS)
      : (await ctx.db
          .query("locations")
          .withIndex("by_organizationId_and_normalizedName", (q) => q.eq("organizationId", organizationId))
          .take(MAX_OVERVIEW_LOCATIONS)).map((location) => location._id);
  return await Promise.all(locationIds.map((locationId) => requireLocation(ctx, organizationId, locationId)));
}

function slimOverviewRow(
  item: ReturnType<typeof planItem>,
  locationId: Id<"locations">,
  locationName: string,
  timeZone: string,
): OverviewRow {
  return {
    locationId,
    locationName,
    templateId: item.templateId as Id<"ownCheckTemplates">,
    templateVersionId: item.templateVersionId as Id<"ownCheckTemplateVersions">,
    templateVersion: item.templateVersion,
    name: item.name,
    controlType: item.controlType,
    dueDateKey: item.dueDateKey,
    startsAt: item.startsAt,
    dueAt: item.dueAt,
    timeZone,
    status: item.status,
    entry: item.entry
      ? {
          id: item.entry.id,
          status: item.entry.status,
          hasDeviation: item.entry.hasDeviation,
          followUp: item.entry.followUp,
          performedBy: item.entry.performedBy,
          performedByName: item.entry.performedByName,
        }
      : null,
  };
}

async function resolveOverviewVersion(
  ctx: QueryCtx,
  organizationId: string,
  versionsById: Map<Id<"ownCheckTemplateVersions">, Doc<"ownCheckTemplateVersions">>,
  versionId: Id<"ownCheckTemplateVersions">,
  templateId: Id<"ownCheckTemplates">,
) {
  let version = versionsById.get(versionId);
  if (!version) {
    version = await ctx.db.get("ownCheckTemplateVersions", versionId) ?? undefined;
    if (version) versionsById.set(version._id, version);
  }
  if (!version || version.organizationId !== organizationId || version.templateId !== templateId) {
    throw new ConvexError("Egenkontrolversionen blev ikke fundet");
  }
  return version;
}

async function locationRows(
  ctx: QueryCtx,
  organizationId: string,
  locations: Doc<"locations">[],
  fromDateKey: string,
  toDateKey: string,
  versions: Doc<"ownCheckTemplateVersions">[],
  timeZones: Map<Id<"locations">, string>,
  entries: Doc<"ownCheckEntries">[],
  entriesTruncated: boolean,
  controlType: Doc<"ownCheckTemplateVersions">["controlType"] | undefined,
  status: "notCompleted" | "completed" | "approved" | "deviation" | undefined,
  performedBy: string | undefined,
  performedRole: string | undefined,
) {
  const rows: OverviewRow[] = [];
  let truncated = entriesTruncated;
  const versionsById = new Map(versions.map((version) => [version._id, version]));
  const locationsById = new Map(locations.map((location) => [location._id, location]));
  const entriesByKey = new Map(entries.map((entry) => [overviewEntryKey(entry.locationId, entry.templateId, entry.dueDateKey), entry]));
  const consumedKeys = new Set<string>();

  for (const location of locations) {
    if (rows.length >= MAX_OVERVIEW_ROWS) {
      truncated = true;
      break;
    }
    const locationId = location._id;
    const timeZone = timeZones.get(locationId);
    if (!timeZone) continue;
    const occurrences = expandOwnCheckOccurrences({ versions: versions.map(versionInput), locationId, fromDateKey, toDateKey, timeZone });
    for (const occurrence of occurrences) {
      const key = overviewEntryKey(locationId, occurrence.templateId, occurrence.dueDateKey);
      consumedKeys.add(key);
      const entry = entriesByKey.get(key) ?? null;

      const currentVersion = await resolveOverviewVersion(
        ctx,
        organizationId,
        versionsById,
        occurrence.templateVersionId as Id<"ownCheckTemplateVersions">,
        occurrence.templateId as Id<"ownCheckTemplates">,
      );
      const version = entry
        ? await resolveOverviewVersion(ctx, organizationId, versionsById, entry.templateVersionId, entry.templateId)
        : currentVersion;
      const rowOccurrence = entry ? occurrenceForEntry(entry, version, timeZone) : occurrence;
      if (controlType && rowOccurrence.controlType !== controlType) continue;
      if (performedBy && entry && entry.performedBy !== performedBy) continue;
      if (performedBy && !entry && (!version.responsibleRole || version.responsibleRole !== performedRole)) continue;
      const item = planItem(rowOccurrence, version, entry);
      if (!withinStatus(item, status)) continue;
      rows.push(slimOverviewRow(item, locationId, location.name, timeZone));
      if (rows.length >= MAX_OVERVIEW_ROWS) {
        truncated = true;
        break;
      }
    }
  }

  if (status !== "notCompleted" && rows.length < MAX_OVERVIEW_ROWS) {
    for (const entry of entries) {
      const key = overviewEntryKey(entry.locationId, entry.templateId, entry.dueDateKey);
      if (consumedKeys.has(key)) continue;
      const location = locationsById.get(entry.locationId);
      const timeZone = timeZones.get(entry.locationId);
      if (!location || !timeZone) continue;
      const version = await resolveOverviewVersion(ctx, organizationId, versionsById, entry.templateVersionId, entry.templateId);
      const occurrence = occurrenceForEntry(entry, version, timeZone);
      if (controlType && occurrence.controlType !== controlType) continue;
      if (performedBy && entry.performedBy !== performedBy) continue;
      const item = planItem(occurrence, version, entry);
      if (!withinStatus(item, status)) continue;
      rows.push(slimOverviewRow(item, entry.locationId, location.name, timeZone));
      if (rows.length >= MAX_OVERVIEW_ROWS) {
        truncated = true;
        break;
      }
    }
  }
  return { rows, truncated };
}

async function entryRows(
  ctx: QueryCtx,
  organizationId: string,
  filter: OverviewFilter,
  locations: Doc<"locations">[],
  timeZones: Map<Id<"locations">, string>,
  versions: Doc<"ownCheckTemplateVersions">[],
  fromDateKey: string,
  toDateKey: string,
  controlType: Doc<"ownCheckTemplateVersions">["controlType"] | undefined,
  status: "completed" | "approved" | "deviation",
  performedBy: string | undefined,
  paginationOpts: PaginationOptions,
) {
  if (!locations.length) return { page: [], isDone: true, continueCursor: "", truncated: false };
  const versionsById = new Map(versions.map((version) => [version._id, version]));
  const locationsById = new Map(locations.map((location) => [location._id, location]));
  const allowedLocationIds = new Set(locations.map((location) => location._id));
  const startDate = fromDateKey;
  const endDate = toDateKey;
  const page = isSingleLocationFilter(filter)
    ? status === "deviation"
      ? await ctx.db.query("ownCheckEntries")
        .withIndex("by_org_location_hasDeviation_dueDateKey_dueAt", (q) => q.eq("organizationId", organizationId).eq("locationId", filter.locationId).eq("hasDeviation", true).gte("dueDateKey", startDate).lte("dueDateKey", endDate))
        .filter((q) => q.and(...(controlType ? [q.eq(q.field("controlType"), controlType)] : []), ...(performedBy ? [q.eq(q.field("performedBy"), performedBy)] : [])))
        .paginate(paginationOpts)
      : await ctx.db.query("ownCheckEntries")
        .withIndex("by_org_location_status_dueDateKey_dueAt", (q) => q.eq("organizationId", organizationId).eq("locationId", filter.locationId).eq("status", status).gte("dueDateKey", startDate).lte("dueDateKey", endDate))
        .filter((q) => q.and(...(controlType ? [q.eq(q.field("controlType"), controlType)] : []), ...(performedBy ? [q.eq(q.field("performedBy"), performedBy)] : []), ...(status === "completed" ? [q.eq(q.field("hasDeviation"), false), q.neq(q.field("followUp"), "open")] : [])))
        .paginate(paginationOpts)
    : status === "deviation"
      ? await ctx.db.query("ownCheckEntries")
        .withIndex("by_org_dueDateKey_dueAt", (q) => q.eq("organizationId", organizationId).gte("dueDateKey", startDate).lte("dueDateKey", endDate))
        .filter((q) => q.and(locationFilter(q, allowedLocationIds), q.eq(q.field("hasDeviation"), true), ...(controlType ? [q.eq(q.field("controlType"), controlType)] : []), ...(performedBy ? [q.eq(q.field("performedBy"), performedBy)] : [])))
        .paginate(paginationOpts)
      : await ctx.db.query("ownCheckEntries")
        .withIndex("by_org_dueDateKey_dueAt", (q) => q.eq("organizationId", organizationId).gte("dueDateKey", startDate).lte("dueDateKey", endDate))
        .filter((q) => q.and(locationFilter(q, allowedLocationIds), q.eq(q.field("status"), status), ...(controlType ? [q.eq(q.field("controlType"), controlType)] : []), ...(performedBy ? [q.eq(q.field("performedBy"), performedBy)] : []), ...(status === "completed" ? [q.eq(q.field("hasDeviation"), false), q.neq(q.field("followUp"), "open")] : [])))
        .paginate(paginationOpts);
  const rows: OverviewRow[] = [];
  for (const entry of page.page) {
    const location = locationsById.get(entry.locationId);
    const entryTimeZone = timeZones.get(entry.locationId);
    if (!location || !entryTimeZone) continue;
    const version = await resolveOverviewVersion(ctx, organizationId, versionsById, entry.templateVersionId, entry.templateId);
    const occurrence = occurrenceForEntry(entry, version, entryTimeZone);
    rows.push(slimOverviewRow(planItem(occurrence, version, entry), entry.locationId, location.name, entryTimeZone));
  }
  return { ...page, page: rows, truncated: false };
}

export const listOwnCheckPlan = query({
  args: {
    fromDateKey: v.string(),
    toDateKey: v.string(),
    locationId: locationIdsValidator,
    controlType: v.optional(ownCheckControlTypeValidator),
    status: v.optional(v.literal("notCompleted")),
    performedBy: v.optional(v.string()),
  },
  returns: overviewPlanValidator,
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckViewer(ctx);
    const range = dateKeyDifference(args.fromDateKey, args.toDateKey);
    if (range < 0 || range + 1 > 92) throw new ConvexError("Vælg højst 92 dage i oversigten");
    const filter = resolveLocationFilter(auth, args.locationId);
    const locations = await resolveOverviewLocations(ctx, auth.organizationId, filter);
    if (!locations.length) return { rows: [], truncated: false };
    const timeZones = await resolveLocationTimeZones(ctx, auth.organizationId, locations);
    const latestEndExclusive = Math.max(...locations.map((location) => zonedTimestamp(addDateKey(args.toDateKey, 1), 0, timeZones.get(location._id)!)));
    const versions = await loadTemplateVersionsUntil(ctx, auth.organizationId, latestEndExclusive);
    const performedRole = args.performedBy
      ? (await getDatabaseAdapter(ctx).findOne<{ role?: string }>({
          model: "member",
          where: [
            { field: "organizationId", value: auth.organizationId },
            { field: "userId", value: args.performedBy },
          ],
        }))?.role
      : undefined;
    const allowedLocationIds = new Set(locations.map((location) => location._id));
    const entries = await ctx.db
      .query("ownCheckEntries")
      .withIndex("by_org_dueDateKey_dueAt", (q) => q.eq("organizationId", auth.organizationId).gte("dueDateKey", args.fromDateKey).lte("dueDateKey", args.toDateKey))
      .filter((q) => locationFilter(q, allowedLocationIds))
      .take(MAX_OVERVIEW_ROWS + 1);
    const result = await locationRows(ctx, auth.organizationId, locations, args.fromDateKey, args.toDateKey, versions, timeZones, entries, entries.length > MAX_OVERVIEW_ROWS, args.controlType, args.status, args.performedBy, performedRole);
    const rows = result.rows;
    rows.sort((a, b) => a.dueAt - b.dueAt || Number(Boolean(b.entry?.followUp === "open")) - Number(Boolean(a.entry?.followUp === "open")) || a.name.localeCompare(b.name, "da"));
    return { rows, truncated: result.truncated };
  },
});

export const listOwnCheckEntries = query({
  args: {
    paginationOpts: paginationOptsValidator,
    fromDateKey: v.string(),
    toDateKey: v.string(),
    locationId: locationIdsValidator,
    controlType: v.optional(ownCheckControlTypeValidator),
    status: v.union(v.literal("completed"), v.literal("approved"), v.literal("deviation")),
    performedBy: v.optional(v.string()),
  },
  returns: overviewEntriesPaginationValidator,
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckViewer(ctx);
    requirePageSize(args.paginationOpts.numItems);
    const range = dateKeyDifference(args.fromDateKey, args.toDateKey);
    if (range < 0 || range + 1 > 92) throw new ConvexError("Vælg højst 92 dage i oversigten");
    const filter = resolveLocationFilter(auth, args.locationId);
    const locations = await resolveOverviewLocations(ctx, auth.organizationId, filter);
    if (!locations.length) return { page: [], isDone: true, continueCursor: "", truncated: false };
    const timeZones = await resolveLocationTimeZones(ctx, auth.organizationId, locations);
    const latestEndExclusive = Math.max(...locations.map((location) => zonedTimestamp(addDateKey(args.toDateKey, 1), 0, timeZones.get(location._id)!)));
    const versions = await loadTemplateVersionsUntil(ctx, auth.organizationId, latestEndExclusive);
    return await entryRows(ctx, auth.organizationId, filter, locations, timeZones, versions, args.fromDateKey, args.toDateKey, args.controlType, args.status, args.performedBy, args.paginationOpts);
  },
});

export const getOverviewDateContext = query({
  args: { locationId: v.id("locations"), now: v.number() },
  returns: v.object({ timeZone: v.string(), todayDateKey: v.string() }),
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckViewer(ctx);
    requireLocationAccess(auth, args.locationId);
    await requireLocation(ctx, auth.organizationId, args.locationId);
    return await ownCheckDateContext(ctx, auth.organizationId, args.locationId, args.now);
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
