import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  requireLocationAccess,
  requireOwnCheckAttachmentUploader,
  requireOwnCheckApprover,
  requireOwnCheckCorrector,
  requireOwnCheckEditor,
  requireOwnCheckPerformer,
  resolveLocationFilter,
} from "./lib/auth";
import { requireOtherFeaturesUnlocked } from "./lib/countLock";
import { getOwnCheckConfiguration } from "./lib/ownCheckSettings";
import { rateLimiter } from "./lib/rateLimits";
import { resolveTimeZone } from "./lib/timeZone";
import {
  MAX_BACKLOG_OCCURRENCES,
  dateKeyDifference,
  entriesForDate,
  loadTemplateVersions,
  occurrenceForTemplate,
  occurrenceKey,
  expandOwnCheckOccurrences,
  planItem,
  requireLocation,
  requireFiniteNow,
  resolveLocationId,
  versionInput,
} from "./lib/ownChecks";
import {
  dateKeyInZone,
  evaluateCompliance,
  addDateKey,
  zonedTimestamp,
} from "../lib/own-checks";
import {
  ownCheckControlTypeValidator,
  ownCheckFieldValidator,
  ownCheckNoteValidator,
  ownCheckValueValidator,
} from "./lib/ownCheckValidators";
import { recordAudit } from "./lib/audit";
import { hasPermission } from "../lib/auth-permissions";
import { appendRevision } from "./lib/ownChecks";

const MAX_TEXT_LENGTH = 2_000;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const ATTACHMENT_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);

const ownCheckStatusValidator = v.union(
  v.literal("notCompleted"),
  v.literal("completed"),
  v.literal("approved"),
  v.literal("deviation"),
);

const entrySummaryValidator = v.union(
  v.object({
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
  }),
  v.null(),
);

const planItemValidator = v.object({
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
  status: ownCheckStatusValidator,
  entry: entrySummaryValidator,
});

const listTodayOutput = v.object({
  locationId: v.id("locations"),
  locationName: v.string(),
  dateKey: v.string(),
  timeZone: v.string(),
  lateSubmissionDays: v.number(),
  items: v.array(planItemValidator),
  backlog: v.array(planItemValidator),
  truncated: v.boolean(),
});

const submitOutput = v.object({
  entryId: v.id("ownCheckEntries"),
  status: v.union(v.literal("completed"), v.literal("deviation"), v.literal("approved")),
  compliant: v.boolean(),
});

function optionalText(value: string | undefined, label: string) {
  const text = value?.trim() || undefined;
  if (text && text.length > MAX_TEXT_LENGTH) throw new ConvexError(`${label} må højst være 2.000 tegn`);
  return text;
}

async function mergedPlan(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
  dateKey: string,
  timeZone: string,
  now: number,
) {
  const versions = await loadTemplateVersions(ctx, organizationId, dateKey, dateKey, timeZone);
  const occurrences = expandOwnCheckOccurrences({
    versions: versions.map(versionInput),
    locationId,
    fromDateKey: dateKey,
    toDateKey: dateKey,
    timeZone,
  });
  const entries = await entriesForDate(ctx, organizationId, locationId, dateKey);
  const byKey = new Map(entries.map((entry) => [occurrenceKey(entry.templateId, entry.dueDateKey), entry]));
  const versionsById = new Map(versions.map((version) => [version._id, version]));
  return occurrences.flatMap((occurrence) => {
    const version = versionsById.get(occurrence.templateVersionId as Id<"ownCheckTemplateVersions">);
    if (!version) return [];
    return [planItem(occurrence, version, byKey.get(occurrenceKey(version.templateId, dateKey)) ?? null, now)];
  });
}

export const generateAttachmentUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireOwnCheckAttachmentUploader(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getApprovalSettings = query({
  args: {},
  returns: v.object({
    requireSecondPersonApproval: v.boolean(),
  }),
  handler: async (ctx) => {
    const auth = await requireOwnCheckApprover(ctx);
    const configuration = await getOwnCheckConfiguration(ctx, auth.organizationId);
    return { requireSecondPersonApproval: configuration.requireSecondPersonApproval };
  },
});

export const listToday = query({
  args: {
    now: v.number(),
    locationId: v.optional(v.id("locations")),
    dateKey: v.optional(v.string()),
  },
  returns: listTodayOutput,
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckPerformer(ctx, ["ownChecks.today", "ownChecks.overview"]);
    requireFiniteNow(args.now);
    const locationFilter = resolveLocationFilter(auth, args.locationId);
    const locationId = await resolveLocationId(ctx, auth.organizationId, locationFilter);
    requireLocationAccess(auth, locationId);
    const location = await requireLocation(ctx, auth.organizationId, locationId);
    const timeZone = await resolveTimeZone(ctx, auth.organizationId, locationId);
    const today = dateKeyInZone(args.now, timeZone);
    const dateKey = args.dateKey ?? today;
    const offset = dateKeyDifference(today, dateKey);
    if (Math.abs(offset) > 366) throw new ConvexError("Datoen skal ligge inden for 366 dage fra i dag");
    const configuration = await getOwnCheckConfiguration(ctx, auth.organizationId);
    const now = args.now;
    const items = await mergedPlan(ctx, auth.organizationId, locationId, dateKey, timeZone, now);
    let backlog: typeof items = [];
    let truncated = false;
    if (configuration.lateSubmissionDays > 0) {
      const fromDateKey = addDateKey(dateKey, -configuration.lateSubmissionDays);
      const versions = await loadTemplateVersions(ctx, auth.organizationId, fromDateKey, addDateKey(dateKey, -1), timeZone);
      const occurrences = expandOwnCheckOccurrences({
        versions: versions.map(versionInput),
        locationId,
        fromDateKey,
        toDateKey: addDateKey(dateKey, -1),
        timeZone,
      });
      const startAt = zonedTimestamp(fromDateKey, 0, timeZone);
      const endAt = zonedTimestamp(dateKey, 0, timeZone);
      const oldEntries = await ctx.db
        .query("ownCheckEntries")
        .withIndex("by_organizationId_and_locationId_and_dueAt", (q) => q.eq("organizationId", auth.organizationId).eq("locationId", locationId).gte("dueAt", startAt).lt("dueAt", endAt))
        .take(MAX_BACKLOG_OCCURRENCES + 1);
      if (oldEntries.length > MAX_BACKLOG_OCCURRENCES || occurrences.length > MAX_BACKLOG_OCCURRENCES) {
        truncated = true;
      } else {
        const byKey = new Map(oldEntries.map((entry) => [occurrenceKey(entry.templateId, entry.dueDateKey), entry]));
        const versionsById = new Map(versions.map((version) => [version._id, version]));
        backlog = occurrences.flatMap((occurrence) => {
          const version = versionsById.get(occurrence.templateVersionId as Id<"ownCheckTemplateVersions">);
          if (!version || byKey.has(occurrenceKey(version.templateId, occurrence.dueDateKey))) return [];
          return [planItem(occurrence, version, null, now)];
        });
        if (backlog.length > MAX_BACKLOG_OCCURRENCES) {
          truncated = true;
          backlog = [];
        }
      }
    }
    return {
      locationId,
      locationName: location.name,
      dateKey,
      timeZone,
      lateSubmissionDays: configuration.lateSubmissionDays,
      items,
      backlog,
      truncated,
    };
  },
});

async function validateValues(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  fields: Doc<"ownCheckTemplateVersions">["fields"],
  values: Array<Doc<"ownCheckEntries">["values"][number]>,
  existingEntryId?: Id<"ownCheckEntries">,
) {
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  const seen = new Set<string>();
  const attachmentIds: Id<"_storage">[] = [];
  for (const value of values) {
    const field = fieldsByKey.get(value.key);
    if (!field) throw new ConvexError("Et felt findes ikke i denne egenkontrol");
    if (seen.has(value.key)) throw new ConvexError("Et felt er registreret flere gange");
    seen.add(value.key);
    if (field.type !== value.type) throw new ConvexError(`Feltet ${field.label} har en ugyldig type`);
    if (value.type === "number" && (!Number.isFinite(value.number) || Math.abs(value.number) > 1_000_000_000)) throw new ConvexError("Målingen er ugyldig");
    if (value.type === "text" && value.text.length > MAX_TEXT_LENGTH) throw new ConvexError("Teksten må højst være 2.000 tegn");
    if (field.type === "choice" && value.type === "choice" && !field.options.some((option) => option.value === value.value)) throw new ConvexError("Vælg en gyldig mulighed");
    if (field.type === "attachment" && value.type === "attachment") {
      if (value.storageIds.length > field.maxFiles) throw new ConvexError(`Feltet må højst have ${field.maxFiles} filer`);
      attachmentIds.push(...value.storageIds);
    }
  }
  for (const field of fields) {
    if (field.required && !seen.has(field.key)) throw new ConvexError(`${field.label} skal udfyldes`);
  }
  if (new Set(attachmentIds).size !== attachmentIds.length) throw new ConvexError("En fil er valgt flere gange");
  const metadata = await Promise.all(attachmentIds.map((id) => ctx.db.system.get("_storage", id)));
  for (let index = 0; index < attachmentIds.length; index += 1) {
    const file = metadata[index];
    if (!file?.contentType || !ATTACHMENT_TYPES.has(file.contentType) || file.size > MAX_ATTACHMENT_SIZE) {
      throw new ConvexError("Brug JPEG-, PNG- eller PDF-filer på højst 10 MB");
    }
    const existing = await ctx.db
      .query("ownCheckAttachments")
      .withIndex("by_storageId", (q) => q.eq("storageId", attachmentIds[index]))
      .first();
    if (existing && (existing.organizationId !== organizationId || existingEntryId === undefined || existing.entryId !== existingEntryId)) {
      throw new ConvexError("Filen er allerede knyttet til en egenkontrol");
    }
  }
  return metadata.map((file, index) => {
    if (!file?.contentType) throw new ConvexError("Filen blev ikke fundet");
    return { id: attachmentIds[index], contentType: file.contentType, size: file.size };
  });
}

export const submitOwnCheck = mutation({
  args: {
    locationId: v.id("locations"),
    templateId: v.id("ownCheckTemplates"),
    dueDateKey: v.string(),
    values: v.array(ownCheckValueValidator),
    note: v.optional(v.string()),
    deviationDescription: v.optional(v.string()),
    correctiveAction: v.optional(v.string()),
    clientRequestId: v.optional(v.string()),
  },
  returns: submitOutput,
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckPerformer(ctx);
    requireLocationAccess(auth, args.locationId);
    const configuration = await getOwnCheckConfiguration(ctx, auth.organizationId);
    if (configuration.blockDuringCount) await requireOtherFeaturesUnlocked(ctx, auth.organizationId, args.locationId);
    const limit = await rateLimiter.limit(ctx, "ownCheckSubmit", { key: auth.userId });
    if (!limit.ok) throw new ConvexError("For mange registreringer. Vent et øjeblik og prøv igen");
    const clientRequestId = args.clientRequestId?.trim() || undefined;
    if (clientRequestId) {
      const existingRequest = await ctx.db
        .query("ownCheckEntries")
        .withIndex("by_organizationId_and_clientRequestId", (q) => q.eq("organizationId", auth.organizationId).eq("clientRequestId", clientRequestId))
        .unique();
      if (existingRequest) return { entryId: existingRequest._id, status: existingRequest.status, compliant: existingRequest.compliant };
    }
    const location = await requireLocation(ctx, auth.organizationId, args.locationId);
    const timeZone = await resolveTimeZone(ctx, auth.organizationId, args.locationId);
    const now = Date.now();
    const today = dateKeyInZone(now, timeZone);
    const daysBack = dateKeyDifference(args.dueDateKey, today);
    if (daysBack < 0) throw new ConvexError("Egenkontrollen kan ikke registreres for en fremtidig dato");
    if (daysBack > configuration.lateSubmissionDays) throw new ConvexError(`Egenkontrollen kan kun registreres op til ${configuration.lateSubmissionDays} dage tilbage`);
    const versions = await loadTemplateVersions(ctx, auth.organizationId, args.dueDateKey, args.dueDateKey, timeZone);
    const occurrences = expandOwnCheckOccurrences({ versions: versions.map(versionInput), locationId: args.locationId, fromDateKey: args.dueDateKey, toDateKey: args.dueDateKey, timeZone });
    const occurrence = occurrenceForTemplate(occurrences, args.templateId);
    const version = versions.find((candidate) => candidate._id === occurrence.templateVersionId);
    if (!version || version.organizationId !== auth.organizationId) throw new ConvexError("Egenkontrolversionen blev ikke fundet");
    const duplicate = await ctx.db
      .query("ownCheckEntries")
      .withIndex("by_org_location_template_dueDateKey", (q) => q.eq("organizationId", auth.organizationId).eq("locationId", args.locationId).eq("templateId", args.templateId).eq("dueDateKey", args.dueDateKey))
      .unique();
    if (duplicate) throw new ConvexError("Egenkontrollen er allerede registreret");
    await validateValues(ctx, auth.organizationId, version.fields, args.values);
    const compliance = evaluateCompliance(version.fields, args.values);
    const deviationDescription = optionalText(args.deviationDescription, "Afvigelsen");
    const correctiveAction = optionalText(args.correctiveAction, "Den korrigerende handling");
    if (!compliance.compliant && !deviationDescription) throw new ConvexError("Beskriv afvigelsen");
    if (correctiveAction && !deviationDescription) throw new ConvexError("Beskriv afvigelsen");
    const note = optionalText(args.note, "Noten");
    const hasDeviation = !compliance.compliant || Boolean(deviationDescription);
    const deviation = hasDeviation
      ? { description: deviationDescription ?? "Afvigelse registreret", recordedAt: now, recordedBy: auth.userId, recordedByName: auth.userName }
      : undefined;
    const corrective = correctiveAction
      ? { description: correctiveAction, recordedAt: now, recordedBy: auth.userId, recordedByName: auth.userName }
      : undefined;
    const status: "deviation" | "completed" = hasDeviation ? "deviation" : "completed";
    const followUp = hasDeviation ? (corrective ? "resolved" : "open") : "none";
    const entryId = await ctx.db.insert("ownCheckEntries", {
      organizationId: auth.organizationId,
      locationId: args.locationId,
      locationName: location.name,
      templateId: args.templateId,
      templateVersionId: version._id,
      templateVersion: version.version,
      name: version.name,
      controlType: version.controlType,
      dueDateKey: args.dueDateKey,
      dueAt: occurrence.dueAt,
      status,
      hasDeviation,
      followUp,
      compliant: compliance.compliant,
      values: args.values,
      ...(note ? { note } : {}),
      ...(deviation ? { deviation } : {}),
      ...(corrective ? { correctiveAction: corrective } : {}),
      performedAt: now,
      performedBy: auth.userId,
      performedByName: auth.userName,
      revision: 1,
      updatedAt: now,
      ...(clientRequestId ? { clientRequestId } : {}),
    });
    for (const value of args.values) {
      if (value.type !== "attachment") continue;
      for (const storageId of value.storageIds) {
        const file = await ctx.db.system.get("_storage", storageId);
        if (!file?.contentType) throw new ConvexError("Filen blev ikke fundet");
        await ctx.db.insert("ownCheckAttachments", {
          organizationId: auth.organizationId,
          entryId,
          fieldKey: value.key,
          storageId,
          contentType: file.contentType,
          fileSize: file.size,
          addedAtRevision: 1,
          uploadedAt: now,
          uploadedBy: auth.userId,
        });
      }
    }
    await ctx.db.insert("ownCheckEntryRevisions", {
      organizationId: auth.organizationId,
      entryId,
      revision: 1,
      kind: "submitted",
      values: args.values,
      status,
      hasDeviation,
      followUp,
      compliant: compliance.compliant,
      ...(note ? { note } : {}),
      ...(deviation ? { deviation } : {}),
      ...(corrective ? { correctiveAction: corrective } : {}),
      changes: [],
      at: now,
      actorUserId: auth.userId,
      actorName: auth.userName,
    });
    await recordAudit(ctx, auth, {
      action: "ownChecks.submitted",
      entityTable: "ownCheckEntries",
      entityId: entryId,
      locationId: args.locationId,
      summary: `${version.name} på ${location.name} blev registreret som ${hasDeviation ? "afvigelse" : "udført"}`,
    });
    return { entryId, status, compliant: compliance.compliant };
  },
});

export const editOwnCheck = mutation({
  args: {
    entryId: v.id("ownCheckEntries"),
    values: v.array(ownCheckValueValidator),
    note: v.optional(v.string()),
    deviationDescription: v.optional(v.string()),
    correctiveAction: v.optional(v.string()),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckEditor(ctx);
    const entry = await ctx.db.get("ownCheckEntries", args.entryId);
    if (!entry || entry.organizationId !== auth.organizationId) throw new ConvexError("Egenkontrollen blev ikke fundet");
    requireLocationAccess(auth, entry.locationId);
    if (entry.status === "approved") throw new ConvexError("En godkendt egenkontrol kan ikke rettes");
    const version = await ctx.db.get("ownCheckTemplateVersions", entry.templateVersionId);
    if (!version || version.organizationId !== auth.organizationId) throw new ConvexError("Egenkontrolversionen blev ikke fundet");
    await validateValues(ctx, auth.organizationId, version.fields, args.values, entry._id);
    const compliance = evaluateCompliance(version.fields, args.values);
    const requestedDeviation = args.deviationDescription === undefined ? undefined : optionalText(args.deviationDescription, "Afvigelsen");
    const requestedCorrectiveAction = args.correctiveAction === undefined ? undefined : optionalText(args.correctiveAction, "Den korrigerende handling");
    const amendmentAt = Date.now();
    const nextDeviation = entry.hasDeviation
      ? requestedDeviation === undefined || requestedDeviation === entry.deviation?.description
        ? entry.deviation
        : requestedDeviation
          ? { description: requestedDeviation, recordedAt: amendmentAt, recordedBy: auth.userId, recordedByName: auth.userName }
          : undefined
      : requestedDeviation
        ? { description: requestedDeviation, recordedAt: amendmentAt, recordedBy: auth.userId, recordedByName: auth.userName }
        : undefined;
    const hasDeviation = entry.hasDeviation || !compliance.compliant || Boolean(requestedDeviation);
    if (hasDeviation && !nextDeviation) throw new ConvexError("Beskriv afvigelsen");
    const nextNote = args.note === undefined ? entry.note : optionalText(args.note, "Noten");
    const nextCorrective = requestedCorrectiveAction === undefined || requestedCorrectiveAction === entry.correctiveAction?.description
      ? entry.correctiveAction
      : requestedCorrectiveAction
        ? { description: requestedCorrectiveAction, recordedAt: amendmentAt, recordedBy: auth.userId, recordedByName: auth.userName }
        : undefined;
    const nextStatus = hasDeviation ? "deviation" : "completed";
    const nextFollowUp = hasDeviation ? (nextCorrective ? "resolved" : "open") : "none";
    const currentAttachments = await ctx.db.query("ownCheckAttachments").withIndex("by_organizationId_and_entryId", (q) => q.eq("organizationId", auth.organizationId).eq("entryId", entry._id)).collect();
    const nextStorageIds = new Set(args.values.flatMap((value) => value.type === "attachment" ? value.storageIds : []));
    for (const attachment of currentAttachments) {
      if (attachment.removedAtRevision === undefined && !nextStorageIds.has(attachment.storageId)) {
        await ctx.db.patch("ownCheckAttachments", attachment._id, { removedAtRevision: entry.revision + 1 });
      }
    }
    for (const value of args.values) {
      if (value.type !== "attachment") continue;
      for (const storageId of value.storageIds) {
        const current = currentAttachments.find((attachment) => attachment.storageId === storageId && attachment.removedAtRevision === undefined);
        if (current) continue;
        const file = await ctx.db.system.get("_storage", storageId);
        if (!file?.contentType) throw new ConvexError("Filen blev ikke fundet");
        await ctx.db.insert("ownCheckAttachments", { organizationId: auth.organizationId, entryId: entry._id, fieldKey: value.key, storageId, contentType: file.contentType, fileSize: file.size, addedAtRevision: entry.revision + 1, uploadedAt: Date.now(), uploadedBy: auth.userId });
      }
    }
    await appendRevision(ctx, auth, entry, {
      values: args.values,
      status: nextStatus,
      hasDeviation,
      followUp: nextFollowUp,
      compliant: compliance.compliant,
      ...(nextNote === undefined ? {} : { note: nextNote }),
      ...(nextDeviation === undefined ? {} : { deviation: nextDeviation }),
      ...(nextCorrective === undefined ? {} : { correctiveAction: nextCorrective }),
      approvedAt: undefined,
      approvedBy: undefined,
      approvedByName: undefined,
    }, "edited", args.reason);
    return null;
  },
});

export const recordCorrectiveAction = mutation({
  args: { entryId: v.id("ownCheckEntries"), description: v.string(), reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckCorrector(ctx);
    const entry = await ctx.db.get("ownCheckEntries", args.entryId);
    if (!entry || entry.organizationId !== auth.organizationId) throw new ConvexError("Egenkontrollen blev ikke fundet");
    requireLocationAccess(auth, entry.locationId);
    if (!entry.hasDeviation) throw new ConvexError("Registreringen har ingen afvigelse");
    if (entry.status === "approved") throw new ConvexError("En godkendt egenkontrol kan ikke ændres");
    const description = optionalText(args.description, "Den korrigerende handling");
    if (!description) throw new ConvexError("Beskriv den korrigerende handling");
    if (entry.correctiveAction && !args.reason) throw new ConvexError("Angiv en begrundelse");
    await appendRevision(ctx, auth, {
      ...entry,
    }, {
      values: entry.values,
      status: "deviation",
      hasDeviation: true,
      followUp: "resolved",
      compliant: entry.compliant,
      ...(entry.note === undefined ? {} : { note: entry.note }),
      ...(entry.deviation === undefined ? {} : { deviation: entry.deviation }),
      correctiveAction: { description, recordedAt: Date.now(), recordedBy: auth.userId, recordedByName: auth.userName },
    }, "correctiveActionRecorded", args.reason);
    return null;
  },
});

export const approveOwnCheck = mutation({
  args: { entryId: v.id("ownCheckEntries") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckApprover(ctx);
    const entry = await ctx.db.get("ownCheckEntries", args.entryId);
    if (!entry || entry.organizationId !== auth.organizationId) throw new ConvexError("Egenkontrollen blev ikke fundet");
    requireLocationAccess(auth, entry.locationId);
    if (entry.status === "approved") throw new ConvexError("Egenkontrollen er allerede godkendt");
    if (entry.followUp === "open") throw new ConvexError("Afvigelsen skal følges op, før kontrollen kan godkendes");
    const configuration = await getOwnCheckConfiguration(ctx, auth.organizationId);
    if (configuration.requireSecondPersonApproval && entry.performedBy === auth.userId && !hasPermission(auth.role, auth.permissions, "ownChecks.manage")) {
      throw new ConvexError("En anden person skal godkende egenkontrollen");
    }
    await appendRevision(ctx, auth, entry, {
      values: entry.values,
      status: "approved",
      hasDeviation: entry.hasDeviation,
      followUp: entry.followUp,
      compliant: entry.compliant,
      ...(entry.note === undefined ? {} : { note: entry.note }),
      ...(entry.deviation === undefined ? {} : { deviation: entry.deviation }),
      ...(entry.correctiveAction === undefined ? {} : { correctiveAction: entry.correctiveAction }),
      approvedAt: Date.now(),
      approvedBy: auth.userId,
      approvedByName: auth.userName,
    }, "approved");
    return null;
  },
});

export { getOwnCheckRecord, listOwnChecks } from "./ownCheckOverview";
