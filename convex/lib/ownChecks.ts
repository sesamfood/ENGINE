import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  addDateKey,
  formatValue,
  ownCheckStatus,
  ownCheckStatusLabels,
  type OwnCheckOccurrence,
  type OwnCheckTemplateVersionInput,
} from "../../lib/own-checks";
import { dateKeyInZone, expandOccurrences, zonedTimestamp } from "../../lib/own-checks";
import { recordAudit, requireAuditReason, type AuditActor } from "./audit";
import { resolveTimeZone } from "./timeZone";

export const MAX_TEMPLATE_VERSIONS = 2_000;
export const MAX_BACKLOG_OCCURRENCES = 2_000;
export const MAX_OVERVIEW_ROWS = 2_000;

type OwnCheckContext = QueryCtx | MutationCtx;

export function dateKeyDifference(fromDateKey: string, toDateKey: string) {
  const parse = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw new ConvexError("Datoen er ugyldig");
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) throw new ConvexError("Datoen er ugyldig");
    return date.getTime();
  };
  return (parse(toDateKey) - parse(fromDateKey)) / (24 * 60 * 60 * 1_000);
}

export function versionInput(row: Doc<"ownCheckTemplateVersions">): OwnCheckTemplateVersionInput {
  return {
    templateId: row.templateId,
    templateVersionId: row._id,
    templateVersion: row.version,
    name: row.name,
    controlType: row.controlType,
    schedule: row.schedule,
    startMinuteOfDay: row.startMinuteOfDay,
    dueMinuteOfDay: row.dueMinuteOfDay,
    fields: row.fields,
    description: row.description,
    allLocations: row.allLocations,
    locationIds: row.locationIds,
    responsibleRole: row.responsibleRole,
    validFrom: row.validFrom,
    validTo: row.validTo,
  };
}

export async function loadTemplateVersions(
  ctx: OwnCheckContext,
  organizationId: string,
  fromDateKey: string,
  toDateKey: string,
  timeZone: string,
) {
  const endExclusive = zonedTimestamp(addDateKey(toDateKey, 1), 0, timeZone);
  return await loadTemplateVersionsUntil(ctx, organizationId, endExclusive);
}

export async function loadTemplateVersionsUntil(
  ctx: OwnCheckContext,
  organizationId: string,
  endExclusive: number,
) {
  const versions = await ctx.db
    .query("ownCheckTemplateVersions")
    .withIndex("by_organizationId_and_validFrom", (q) =>
      q.eq("organizationId", organizationId).lt("validFrom", endExclusive),
    )
    .take(MAX_TEMPLATE_VERSIONS + 1);
  if (versions.length > MAX_TEMPLATE_VERSIONS) {
    throw new ConvexError("Der er for mange egenkontrolversioner i perioden");
  }
  return versions;
}

export function expandOwnCheckOccurrences(input: Parameters<typeof expandOccurrences>[0]) {
  try {
    return expandOccurrences(input);
  } catch (error) {
    if (
      error instanceof Error &&
      new Set([
        "Datointervallet er ugyldigt",
        "Datointervallet er for langt",
        "Der er for mange egenkontroller i perioden",
      ]).has(error.message)
    ) {
      throw new ConvexError(error.message);
    }
    throw error;
  }
}

export function requireFiniteNow(now: number) {
  if (!Number.isFinite(now)) throw new ConvexError("Tidspunktet er ugyldigt");
}

export async function ownCheckDateContext(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
  now: number,
) {
  requireFiniteNow(now);
  const timeZone = await resolveTimeZone(ctx, organizationId, locationId);
  return { timeZone, todayDateKey: dateKeyInZone(now, timeZone) };
}

export async function requireLocation(
  ctx: OwnCheckContext,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const location = await ctx.db.get("locations", locationId);
  if (!location || location.organizationId !== organizationId) {
    throw new ConvexError("Lokationen blev ikke fundet");
  }
  return location;
}

export async function resolveLocationId(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  filter: { locationId: Id<"locations"> } | { locationIds: Id<"locations">[] } | "all",
) {
  if (typeof filter === "object" && "locationId" in filter) return filter.locationId;
  const locations = await ctx.db
    .query("locations")
    .withIndex("by_organizationId_and_normalizedName", (q) => q.eq("organizationId", organizationId))
    .take(200);
  const allowed = typeof filter === "object"
    ? locations.find((location) => filter.locationIds.includes(location._id))
    : locations[0];
  if (!allowed) throw new ConvexError("Vælg en lokation");
  return allowed._id;
}

export function occurrenceForTemplate(
  occurrences: OwnCheckOccurrence[],
  templateId: Id<"ownCheckTemplates">,
) {
  const occurrence = occurrences.find((item) => item.templateId === templateId);
  if (!occurrence) throw new ConvexError("Egenkontrollen er ikke planlagt på denne dato");
  return occurrence;
}

export async function entriesForDate(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
  dateKey: string,
) {
  const entries = await ctx.db
    .query("ownCheckEntries")
    .withIndex("by_organizationId_and_locationId_and_dueDateKey", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", locationId).eq("dueDateKey", dateKey),
    )
    .take(2_001);
  if (entries.length > 2_000) throw new ConvexError("Der er for mange registreringer på datoen");
  return entries;
}

export function occurrenceKey(templateId: string, dueDateKey: string) {
  return `${templateId}:${dueDateKey}`;
}

export function entrySummary(entry: Doc<"ownCheckEntries"> | null) {
  if (!entry) return null;
  return {
    id: entry._id,
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
  };
}

export function occurrenceForEntry(
  entry: Doc<"ownCheckEntries">,
  version: Doc<"ownCheckTemplateVersions">,
  timeZone: string,
): OwnCheckOccurrence {
  return {
    templateId: version.templateId,
    templateVersionId: version._id,
    templateVersion: version.version,
    name: version.name,
    controlType: version.controlType,
    dueDateKey: entry.dueDateKey,
    startsAt: version.startMinuteOfDay === undefined
      ? null
      : zonedTimestamp(entry.dueDateKey, version.startMinuteOfDay, timeZone),
    dueAt: entry.dueAt,
  };
}

export function planItem(
  occurrence: OwnCheckOccurrence,
  version: Doc<"ownCheckTemplateVersions">,
  entry: Doc<"ownCheckEntries"> | null,
) {
  return {
    templateId: version.templateId,
    templateVersionId: version._id,
    templateVersion: version.version,
    name: version.name,
    controlType: version.controlType,
    description: version.description,
    fields: version.fields,
    responsibleRole: version.responsibleRole ?? null,
    dueDateKey: occurrence.dueDateKey,
    startsAt: occurrence.startsAt,
    dueAt: occurrence.dueAt,
    status: ownCheckStatus(entry),
    entry: entrySummary(entry),
  };
}

export type OwnCheckEntryState = {
  values: Doc<"ownCheckEntries">["values"];
  status: Doc<"ownCheckEntries">["status"];
  hasDeviation: boolean;
  followUp: Doc<"ownCheckEntries">["followUp"];
  compliant: boolean;
  note?: string;
  deviation?: Doc<"ownCheckEntries">["deviation"];
  correctiveAction?: Doc<"ownCheckEntries">["correctiveAction"];
  approvedAt?: number;
  approvedBy?: string;
  approvedByName?: string;
};

type RevisionKind =
  | "edited"
  | "deviationRecorded"
  | "correctiveActionRecorded"
  | "approved";

function noteText(note: Doc<"ownCheckEntries">["deviation"] | Doc<"ownCheckEntries">["correctiveAction"] | undefined) {
  return note?.description ?? null;
}

function followUpLabel(value: Doc<"ownCheckEntries">["followUp"]) {
  return value === "open" ? "Åben" : value === "resolved" ? "Løst" : "Ingen opfølgning";
}

export async function appendRevision(
  ctx: MutationCtx,
  actor: AuditActor,
  entry: Doc<"ownCheckEntries">,
  next: OwnCheckEntryState,
  kind: RevisionKind,
  reason?: string,
) {
  if (entry.revision < 1 || !Number.isInteger(entry.revision)) {
    throw new ConvexError("Registreringens revisionsnummer er ugyldigt");
  }
  if (entry.hasDeviation && !next.hasDeviation) {
    throw new ConvexError("En registreret afvigelse kan ikke fjernes");
  }
  const validatedReason = kind === "edited"
    ? requireAuditReason(reason ?? "")
    : reason === undefined
      ? undefined
      : requireAuditReason(reason);
  const version = await ctx.db.get("ownCheckTemplateVersions", entry.templateVersionId);
  if (!version || version.organizationId !== actor.organizationId) {
    throw new ConvexError("Egenkontrolversionen blev ikke fundet");
  }
  const oldValues = new Map(entry.values.map((value) => [value.key, value]));
  const newValues = new Map(next.values.map((value) => [value.key, value]));
  const changes: Array<{ field: string; label: string; from: string | null; to: string | null }> = [];
  for (const field of version.fields) {
    const from = formatValue(field, oldValues.get(field.key) as never);
    const to = formatValue(field, newValues.get(field.key) as never);
    if (from !== to) changes.push({ field: field.key, label: field.label, from, to });
  }
  const addChange = (field: string, label: string, from: string | null, to: string | null) => {
    if (from !== to) changes.push({ field, label, from, to });
  };
  addChange(
    "status",
    "Status",
    ownCheckStatusLabels[ownCheckStatus(entry)],
    ownCheckStatusLabels[ownCheckStatus(next)],
  );
  addChange("followUp", "Opfølgning", followUpLabel(entry.followUp), followUpLabel(next.followUp));
  addChange("note", "Note", entry.note ?? null, next.note ?? null);
  addChange("deviation", "Afvigelse", noteText(entry.deviation), noteText(next.deviation));
  addChange("correctiveAction", "Korrigerende handling", noteText(entry.correctiveAction), noteText(next.correctiveAction));
  addChange("approvedBy", "Godkendt af", entry.approvedByName ?? null, next.approvedByName ?? null);
  const revision = entry.revision + 1;
  const now = Date.now();
  await ctx.db.insert("ownCheckEntryRevisions", {
    organizationId: actor.organizationId,
    entryId: entry._id,
    revision,
    kind,
    values: next.values,
    status: next.status,
    hasDeviation: next.hasDeviation,
    followUp: next.followUp,
    compliant: next.compliant,
    ...(next.note === undefined ? {} : { note: next.note }),
    ...(next.deviation === undefined ? {} : { deviation: next.deviation }),
    ...(next.correctiveAction === undefined ? {} : { correctiveAction: next.correctiveAction }),
    changes,
    ...(validatedReason === undefined ? {} : { reason: validatedReason }),
    at: now,
    actorUserId: actor.userId,
    actorName: actor.userName,
  });
  await ctx.db.patch("ownCheckEntries", entry._id, {
    values: next.values,
    status: next.status,
    hasDeviation: next.hasDeviation,
    followUp: next.followUp,
    compliant: next.compliant,
    note: next.note,
    deviation: next.deviation,
    correctiveAction: next.correctiveAction,
    approvedAt: next.approvedAt,
    approvedBy: next.approvedBy,
    approvedByName: next.approvedByName,
    revision,
    updatedAt: now,
  });
  const summary = kind === "approved"
    ? `${entry.name} blev godkendt`
    : kind === "correctiveActionRecorded"
      ? `Korrigerende handling blev registreret for ${entry.name}`
      : kind === "deviationRecorded"
        ? `Afvigelsen blev registreret for ${entry.name}`
        : `${entry.name} blev rettet`;
  await recordAudit(ctx, actor, {
    action: `ownChecks.${kind}`,
    entityTable: "ownCheckEntries",
    entityId: entry._id,
    locationId: entry.locationId,
    summary,
    ...(validatedReason === undefined ? {} : { reason: validatedReason }),
  });
  return revision;
}
