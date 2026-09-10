import { entrySummaryValidator, attachmentRowsForValues } from "./lib/ownCheckRecords";
import { claimStorageForOrganization } from "./lib/storageOwnership";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  requireHumanPrincipal,
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
  allowsProductTemperatures,
  dateKeyDifference,
  entriesForDate,
  loadTemplateVersions,
  occurrenceForTemplate,
  occurrenceForEntry,
  occurrenceKey,
  expandOwnCheckOccurrences,
  ownCheckDateContext,
  planItem,
  requireLocation,
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
  ownCheckProductTemperatureInputValidator,
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

const planItemValidator = v.object({
  templateId: v.id("ownCheckTemplates"),
  templateVersionId: v.id("ownCheckTemplateVersions"),
  templateVersion: v.number(),
  name: v.string(),
  controlType: ownCheckControlTypeValidator,
  productTemperaturesEnabled: v.boolean(),
  description: v.string(),
  instructions: v.string(),
  imageStorageId: v.union(v.id("_storage"), v.null()),
  imageUrl: v.union(v.string(), v.null()),
  fields: v.array(ownCheckFieldValidator),
  responsibleRole: v.union(v.string(), v.null()),
  dueDateKey: v.string(),
  startsAt: v.union(v.number(), v.null()),
  dueAt: v.number(),
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
  const versionsById = new Map(versions.map((version) => [version._id, version]));
  const entriesByKey = new Map<string, Doc<"ownCheckEntries">[]>();
  for (const entry of entries) {
    const key = occurrenceKey(entry.templateId, entry.dueDateKey);
    const matching = entriesByKey.get(key) ?? [];
    matching.push(entry);
    entriesByKey.set(key, matching);
  }
  const consumedKeys = new Set<string>();
  const consumedEntryIds = new Set<Id<"ownCheckEntries">>();
  const resolveEntryVersion = async (entry: Doc<"ownCheckEntries">) => {
    let version = versionsById.get(entry.templateVersionId);
    if (!version) {
      version = await ctx.db.get("ownCheckTemplateVersions", entry.templateVersionId) ?? undefined;
      if (version) versionsById.set(version._id, version);
    }
    if (!version || version.organizationId !== organizationId || version.templateId !== entry.templateId) {
      throw new ConvexError("Egenkontrolversionen blev ikke fundet");
    }
    return version;
  };
  const items = [] as Array<ReturnType<typeof planItem>>;
  for (const occurrence of occurrences) {
    const version = versionsById.get(occurrence.templateVersionId as Id<"ownCheckTemplateVersions">);
    if (!version) continue;
    const key = occurrenceKey(version.templateId, dateKey);
    const entry = consumedKeys.has(key) ? undefined : entriesByKey.get(key)?.[0];
    if (!entry) {
      items.push(planItem(occurrence, version, null));
      continue;
    }
    const entryVersion = await resolveEntryVersion(entry);
    consumedKeys.add(key);
    consumedEntryIds.add(entry._id);
    items.push(planItem(occurrenceForEntry(entry, entryVersion, timeZone), entryVersion, entry));
  }
  for (const entry of entries) {
    if (consumedEntryIds.has(entry._id)) continue;
    const version = await resolveEntryVersion(entry);
    items.push(planItem(occurrenceForEntry(entry, version, timeZone), version, entry));
  }
  return items;
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

export const getTodayDateContext = query({
  args: { locationId: v.id("locations"), now: v.number() },
  returns: v.object({ timeZone: v.string(), todayDateKey: v.string() }),
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckPerformer(ctx, ["ownChecks.today", "ownChecks.overview"]);
    requireLocationAccess(auth, args.locationId);
    await requireLocation(ctx, auth.organizationId, args.locationId);
    return await ownCheckDateContext(ctx, auth.organizationId, args.locationId, args.now);
  },
});

export const listToday = query({
  args: {
    locationId: v.optional(v.id("locations")),
    dateKey: v.string(),
  },
  returns: listTodayOutput,
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckPerformer(ctx, ["ownChecks.today", "ownChecks.overview"]);
    dateKeyDifference(args.dateKey, args.dateKey);
    const locationFilter = resolveLocationFilter(auth, args.locationId);
    const locationId = await resolveLocationId(ctx, auth.organizationId, locationFilter);
    requireLocationAccess(auth, locationId);
    const location = await requireLocation(ctx, auth.organizationId, locationId);
    const timeZone = await resolveTimeZone(ctx, auth.organizationId, locationId);
    const dateKey = args.dateKey;
    const configuration = await getOwnCheckConfiguration(ctx, auth.organizationId);
    const items = await mergedPlan(ctx, auth.organizationId, locationId, dateKey, timeZone);
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
          return [planItem(occurrence, version, null)];
        });
        if (backlog.length > MAX_BACKLOG_OCCURRENCES) {
          truncated = true;
          backlog = [];
        }
      }
    }
    const imageIds = [...new Set([...items, ...backlog].flatMap((item) => item.imageStorageId ? [item.imageStorageId] : []))];
    const imageUrls = new Map(await Promise.all(imageIds.map(async (id) => [id, await ctx.storage.getUrl(id)] as const)));
    return {
      locationId,
      locationName: location.name,
      dateKey,
      timeZone,
      lateSubmissionDays: configuration.lateSubmissionDays,
      items: items.map((item) => ({ ...item, imageUrl: item.imageStorageId ? imageUrls.get(item.imageStorageId) ?? null : null })),
      backlog: backlog.map((item) => ({ ...item, imageUrl: item.imageStorageId ? imageUrls.get(item.imageStorageId) ?? null : null })),
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
      .take(2);
    if (existing.some((attachment) => attachment.removedAtRevision !== undefined)) {
      throw new ConvexError("Filen blev fjernet fra en tidligere rettelse. Upload filen igen");
    }
    if (existing.some((attachment) => attachment.organizationId !== organizationId || existingEntryId === undefined || attachment.entryId !== existingEntryId)) {
      throw new ConvexError("Filen er allerede knyttet til en egenkontrol");
    }
  }
  return metadata.map((file, index) => {
    if (!file?.contentType) throw new ConvexError("Filen blev ikke fundet");
    return { id: attachmentIds[index], contentType: file.contentType, size: file.size };
  });
}

function validateControlTimes(startedAt: number, endedAt: number) {
  if (!Number.isSafeInteger(startedAt) || !Number.isFinite(new Date(startedAt).getTime())) {
    throw new ConvexError("Angiv et gyldigt starttidspunkt");
  }
  if (!Number.isSafeInteger(endedAt) || !Number.isFinite(new Date(endedAt).getTime())) {
    throw new ConvexError("Angiv et gyldigt sluttidspunkt");
  }
  if (endedAt < startedAt) throw new ConvexError("Sluttidspunktet skal være efter eller lig med starttidspunktet");
}

async function validateProductTemperatures(
  ctx: MutationCtx,
  organizationId: string,
  version: Doc<"ownCheckTemplateVersions">,
  readings: Array<{ productId: Id<"products">; temperatureCelsius: number }>,
  previous: NonNullable<Doc<"ownCheckEntries">["productTemperatures"]> = [],
) {
  if (readings.length > 100) throw new ConvexError("Vælg højst 100 produkter");
  if (readings.length && !allowsProductTemperatures(version)) {
    throw new ConvexError("Produkttemperaturer er ikke aktiveret for denne kontrol");
  }
  const seen = new Set<Id<"products">>();
  const snapshots = new Map(previous.map((reading) => [reading.productId, reading]));
  return await Promise.all(readings.map(async (reading) => {
    if (seen.has(reading.productId)) throw new ConvexError("Et produkt er valgt flere gange");
    seen.add(reading.productId);
    const temperature = reading.temperatureCelsius;
    if (!Number.isFinite(temperature) || Math.abs(temperature) > 1_000_000_000 ||
      Math.abs(temperature * 10 - Math.round(temperature * 10)) > 0.000001) {
      throw new ConvexError("Angiv en gyldig temperatur med højst én decimal");
    }
    const snapshot = snapshots.get(reading.productId);
    const product = await ctx.db.get("products", reading.productId);
    if (product && product.organizationId !== organizationId) {
      throw new ConvexError("Produktet blev ikke fundet");
    }
    if (!snapshot && (!product || product.status !== "active")) {
      throw new ConvexError("Vælg et aktivt produkt");
    }
    const productName = snapshot?.productName ?? product?.name;
    if (!productName) throw new ConvexError("Produktet blev ikke fundet");
    return { ...reading, productName };
  }));
}

async function ensureAttachmentCanBeInserted(
  ctx: MutationCtx,
  organizationId: string,
  entryId: Id<"ownCheckEntries">,
  storageId: Id<"_storage">,
) {
  await claimStorageForOrganization(ctx, organizationId, storageId);
  const existing = await ctx.db
    .query("ownCheckAttachments")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .take(2);
  if (existing.some((attachment) => attachment.removedAtRevision !== undefined)) {
    throw new ConvexError("Filen blev fjernet fra en tidligere rettelse. Upload filen igen");
  }
  if (existing.some((attachment) => attachment.organizationId !== organizationId || attachment.entryId !== entryId)) {
    throw new ConvexError("Filen er allerede knyttet til en egenkontrol");
  }
  if (existing.length > 0) {
    throw new ConvexError("Filen er allerede knyttet til en egenkontrol");
  }
}

export const submitOwnCheck = mutation({
  args: {
    locationId: v.id("locations"),
    templateId: v.id("ownCheckTemplates"),
    templateVersionId: v.optional(v.id("ownCheckTemplateVersions")),
    dueDateKey: v.string(),
    values: v.array(ownCheckValueValidator),
    startedAt: v.number(),
    endedAt: v.number(),
    productTemperatures: v.optional(v.array(ownCheckProductTemperatureInputValidator)),
    note: v.optional(v.string()),
    deviationDescription: v.optional(v.string()),
    correctiveAction: v.optional(v.string()),
    clientRequestId: v.optional(v.string()),
  },
  returns: submitOutput,
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckPerformer(ctx);
    const human = requireHumanPrincipal(auth);
    requireLocationAccess(auth, args.locationId);
    const configuration = await getOwnCheckConfiguration(ctx, auth.organizationId);
    if (configuration.blockDuringCount) await requireOtherFeaturesUnlocked(ctx, auth.organizationId, args.locationId);
    const limit = await rateLimiter.limit(ctx, "ownCheckSubmit", { key: human.userId });
    if (!limit.ok) throw new ConvexError("For mange registreringer. Vent et øjeblik og prøv igen");
    const clientRequestId = args.clientRequestId?.trim() || undefined;
    if (clientRequestId) {
      const existingRequest = await ctx.db
        .query("ownCheckEntries")
        .withIndex("by_organizationId_and_clientRequestId", (q) => q.eq("organizationId", auth.organizationId).eq("clientRequestId", clientRequestId))
        .unique();
      if (existingRequest) {
        if (existingRequest.locationId !== args.locationId || existingRequest.templateId !== args.templateId || existingRequest.dueDateKey !== args.dueDateKey) {
          throw new ConvexError("Klientanmodningen kan ikke genbruges til en anden egenkontrol");
        }
        return { entryId: existingRequest._id, status: existingRequest.status, compliant: existingRequest.compliant };
      }
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
    if (args.templateVersionId !== undefined && args.templateVersionId !== version._id) {
      throw new ConvexError("Kontrollen er ændret. Luk den, og åbn den igen for at se de aktuelle instruktioner.");
    }
    const duplicate = await ctx.db
      .query("ownCheckEntries")
      .withIndex("by_org_location_template_dueDateKey", (q) => q.eq("organizationId", auth.organizationId).eq("locationId", args.locationId).eq("templateId", args.templateId).eq("dueDateKey", args.dueDateKey))
      .unique();
    if (duplicate) throw new ConvexError("Egenkontrollen er allerede registreret");
    validateControlTimes(args.startedAt, args.endedAt);
    const productTemperatures = await validateProductTemperatures(ctx, auth.organizationId, version, args.productTemperatures ?? []);
    await validateValues(ctx, auth.organizationId, version.fields, args.values);
    const compliance = evaluateCompliance(version.fields, args.values);
    const deviationDescription = optionalText(args.deviationDescription, "Afvigelsen");
    const correctiveAction = optionalText(args.correctiveAction, "Den korrigerende handling");
    if (!compliance.compliant && !deviationDescription) throw new ConvexError("Beskriv afvigelsen");
    if (correctiveAction && !deviationDescription) throw new ConvexError("Beskriv afvigelsen");
    const note = optionalText(args.note, "Noten");
    const hasDeviation = !compliance.compliant || Boolean(deviationDescription);
    const deviation = hasDeviation
      ? { description: deviationDescription ?? "Afvigelse registreret", recordedAt: now, recordedBy: human.userId, recordedByName: human.userName }
      : undefined;
    const corrective = correctiveAction
      ? { description: correctiveAction, recordedAt: now, recordedBy: human.userId, recordedByName: human.userName }
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
      startedAt: args.startedAt,
      endedAt: args.endedAt,
      productTemperatures,
      ...(note ? { note } : {}),
      ...(deviation ? { deviation } : {}),
      ...(corrective ? { correctiveAction: corrective } : {}),
      performedAt: now,
      performedBy: human.userId,
      performedByName: human.userName,
      revision: 1,
      updatedAt: now,
      ...(clientRequestId ? { clientRequestId } : {}),
    });
    for (const value of args.values) {
      if (value.type !== "attachment") continue;
      for (const storageId of value.storageIds) {
        await ensureAttachmentCanBeInserted(ctx, auth.organizationId, entryId, storageId);
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
          uploadedBy: human.userId,
        });
      }
    }
    await ctx.db.insert("ownCheckEntryRevisions", {
      organizationId: auth.organizationId,
      entryId,
      revision: 1,
      kind: "submitted",
      values: args.values,
      startedAt: args.startedAt,
      endedAt: args.endedAt,
      productTemperatures,
      status,
      hasDeviation,
      followUp,
      compliant: compliance.compliant,
      ...(note ? { note } : {}),
      ...(deviation ? { deviation } : {}),
      ...(corrective ? { correctiveAction: corrective } : {}),
      changes: [],
      at: now,
      actorUserId: human.userId,
      actorName: human.userName,
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
    startedAt: v.number(),
    endedAt: v.number(),
    productTemperatures: v.optional(v.array(ownCheckProductTemperatureInputValidator)),
    note: v.optional(v.string()),
    deviationDescription: v.optional(v.string()),
    correctiveAction: v.optional(v.string()),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckEditor(ctx);
    const human = requireHumanPrincipal(auth);
    const entry = await ctx.db.get("ownCheckEntries", args.entryId);
    if (!entry || entry.organizationId !== auth.organizationId) throw new ConvexError("Egenkontrollen blev ikke fundet");
    requireLocationAccess(auth, entry.locationId);
    if (entry.status === "approved") throw new ConvexError("En godkendt egenkontrol kan ikke rettes");
    const version = await ctx.db.get("ownCheckTemplateVersions", entry.templateVersionId);
    if (!version || version.organizationId !== auth.organizationId) throw new ConvexError("Egenkontrolversionen blev ikke fundet");
    validateControlTimes(args.startedAt, args.endedAt);
    const productTemperatures = await validateProductTemperatures(ctx, auth.organizationId, version, args.productTemperatures ?? entry.productTemperatures ?? [], entry.productTemperatures);
    await validateValues(ctx, auth.organizationId, version.fields, args.values, entry._id);
    const compliance = evaluateCompliance(version.fields, args.values);
    const requestedDeviation = args.deviationDescription === undefined ? undefined : optionalText(args.deviationDescription, "Afvigelsen");
    const requestedCorrectiveAction = args.correctiveAction === undefined ? undefined : optionalText(args.correctiveAction, "Den korrigerende handling");
    const amendmentAt = Date.now();
    const nextDeviation = entry.hasDeviation
      ? requestedDeviation === undefined || requestedDeviation === entry.deviation?.description
        ? entry.deviation
        : requestedDeviation
          ? { description: requestedDeviation, recordedAt: amendmentAt, recordedBy: human.userId, recordedByName: human.userName }
          : undefined
      : requestedDeviation
        ? { description: requestedDeviation, recordedAt: amendmentAt, recordedBy: human.userId, recordedByName: human.userName }
        : undefined;
    const hasDeviation = entry.hasDeviation || !compliance.compliant || Boolean(requestedDeviation);
    if (hasDeviation && !nextDeviation) throw new ConvexError("Beskriv afvigelsen");
    const nextNote = args.note === undefined ? entry.note : optionalText(args.note, "Noten");
    const nextCorrective = requestedCorrectiveAction === undefined || requestedCorrectiveAction === entry.correctiveAction?.description
      ? entry.correctiveAction
      : requestedCorrectiveAction
        ? { description: requestedCorrectiveAction, recordedAt: amendmentAt, recordedBy: human.userId, recordedByName: human.userName }
        : undefined;
    const nextStatus = hasDeviation ? "deviation" : "completed";
    const nextFollowUp = hasDeviation ? (nextCorrective ? "resolved" : "open") : "none";
    const currentAttachments = await attachmentRowsForValues(ctx, auth.organizationId, entry._id, [entry.values]);
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
        await ensureAttachmentCanBeInserted(ctx, auth.organizationId, entry._id, storageId);
        const file = await ctx.db.system.get("_storage", storageId);
        if (!file?.contentType) throw new ConvexError("Filen blev ikke fundet");
        await ctx.db.insert("ownCheckAttachments", { organizationId: auth.organizationId, entryId: entry._id, fieldKey: value.key, storageId, contentType: file.contentType, fileSize: file.size, addedAtRevision: entry.revision + 1, uploadedAt: Date.now(), uploadedBy: human.userId });
      }
    }
    await appendRevision(ctx, human, entry, {
      values: args.values,
      startedAt: args.startedAt,
      endedAt: args.endedAt,
      productTemperatures,
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
    const human = requireHumanPrincipal(auth);
    const entry = await ctx.db.get("ownCheckEntries", args.entryId);
    if (!entry || entry.organizationId !== auth.organizationId) throw new ConvexError("Egenkontrollen blev ikke fundet");
    requireLocationAccess(auth, entry.locationId);
    if (!entry.hasDeviation) throw new ConvexError("Registreringen har ingen afvigelse");
    if (entry.status === "approved") throw new ConvexError("En godkendt egenkontrol kan ikke ændres");
    const description = optionalText(args.description, "Den korrigerende handling");
    if (!description) throw new ConvexError("Beskriv den korrigerende handling");
    if (entry.correctiveAction && !args.reason) throw new ConvexError("Angiv en begrundelse");
    await appendRevision(ctx, human, {
      ...entry,
    }, {
      values: entry.values,
      status: "deviation",
      hasDeviation: true,
      followUp: "resolved",
      compliant: entry.compliant,
      ...(entry.note === undefined ? {} : { note: entry.note }),
      ...(entry.deviation === undefined ? {} : { deviation: entry.deviation }),
      correctiveAction: { description, recordedAt: Date.now(), recordedBy: human.userId, recordedByName: human.userName },
    }, "correctiveActionRecorded", args.reason);
    return null;
  },
});

export const approveOwnCheck = mutation({
  args: { entryId: v.id("ownCheckEntries") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckApprover(ctx);
    const human = requireHumanPrincipal(auth);
    const entry = await ctx.db.get("ownCheckEntries", args.entryId);
    if (!entry || entry.organizationId !== auth.organizationId) throw new ConvexError("Egenkontrollen blev ikke fundet");
    requireLocationAccess(auth, entry.locationId);
    if (entry.status === "approved") throw new ConvexError("Egenkontrollen er allerede godkendt");
    if (entry.followUp === "open") throw new ConvexError("Afvigelsen skal følges op, før kontrollen kan godkendes");
    const configuration = await getOwnCheckConfiguration(ctx, auth.organizationId);
    if (configuration.requireSecondPersonApproval && entry.performedBy === human.userId && !hasPermission(auth.role, auth.permissions, "ownChecks.manage")) {
      throw new ConvexError("En anden person skal godkende egenkontrollen");
    }
    await appendRevision(ctx, human, entry, {
      values: entry.values,
      status: "approved",
      hasDeviation: entry.hasDeviation,
      followUp: entry.followUp,
      compliant: entry.compliant,
      ...(entry.note === undefined ? {} : { note: entry.note }),
      ...(entry.deviation === undefined ? {} : { deviation: entry.deviation }),
      ...(entry.correctiveAction === undefined ? {} : { correctiveAction: entry.correctiveAction }),
      approvedAt: Date.now(),
      approvedBy: human.userId,
      approvedByName: human.userName,
    }, "approved");
    return null;
  },
});

export { getOwnCheckRecord, listOwnCheckHistory, listOwnCheckPlan, listOwnCheckEntries } from "./ownCheckOverview";
