import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { systemRoleKeys } from "../lib/auth-permissions";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  ownCheckControlTypeValidator,
  ownCheckFieldValidator,
  ownCheckScheduleValidator,
} from "./lib/ownCheckValidators";
import { requireLocationAccess, requireOwnCheckManager } from "./lib/auth";
import { recordAudit, requireAuditReason } from "./lib/audit";
import { getOwnCheckConfiguration } from "./lib/ownCheckSettings";
import { MAX_TEMPLATE_VERSIONS, ownCheckDateContext, requireLocation } from "./lib/ownChecks";

const MAX_ACTIVE_TEMPLATES = 200;
const MAX_TEMPLATE_PAGE_SIZE = 100;
type TemplateContext = QueryCtx | MutationCtx;

function requirePageSize(numItems: number) {
  if (!Number.isInteger(numItems) || numItems <= 0 || numItems > MAX_TEMPLATE_PAGE_SIZE) {
    throw new ConvexError("Siden er for stor");
  }
}

const versionFieldsValidator = v.object({
  name: v.string(),
  description: v.string(),
  controlType: ownCheckControlTypeValidator,
  schedule: ownCheckScheduleValidator,
  startMinuteOfDay: v.optional(v.number()),
  dueMinuteOfDay: v.optional(v.number()),
  fields: v.array(ownCheckFieldValidator),
  allLocations: v.boolean(),
  locationIds: v.array(v.id("locations")),
  responsibleRole: v.optional(v.string()),
});

const templateSummaryValidator = v.object({
  id: v.id("ownCheckTemplates"),
  name: v.string(),
  status: v.union(v.literal("active"), v.literal("archived")),
  currentVersion: v.number(),
  updatedAt: v.number(),
  archivedAt: v.union(v.number(), v.null()),
  version: v.number(),
  description: v.string(),
  controlType: ownCheckControlTypeValidator,
  schedule: ownCheckScheduleValidator,
  startMinuteOfDay: v.union(v.number(), v.null()),
  dueMinuteOfDay: v.union(v.number(), v.null()),
  fields: v.array(ownCheckFieldValidator),
  allLocations: v.boolean(),
  locationIds: v.array(v.id("locations")),
  responsibleRole: v.union(v.string(), v.null()),
  validFrom: v.number(),
  validTo: v.union(v.number(), v.null()),
  createdByName: v.string(),
});

const versionOutputValidator = v.object({
  id: v.id("ownCheckTemplateVersions"),
  version: v.number(),
  name: v.string(),
  description: v.string(),
  controlType: ownCheckControlTypeValidator,
  schedule: ownCheckScheduleValidator,
  startMinuteOfDay: v.union(v.number(), v.null()),
  dueMinuteOfDay: v.union(v.number(), v.null()),
  fields: v.array(ownCheckFieldValidator),
  allLocations: v.boolean(),
  locationIds: v.array(v.id("locations")),
  responsibleRole: v.union(v.string(), v.null()),
  validFrom: v.number(),
  validTo: v.union(v.number(), v.null()),
  createdAt: v.number(),
  createdBy: v.string(),
  createdByName: v.string(),
});

const templateInput = versionFieldsValidator;
const templateUpdateInput = templateInput.extend({
  templateId: v.id("ownCheckTemplates"),
  reason: v.string(),
  removedFieldKeys: v.optional(v.array(v.string())),
});

function normalizeName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new ConvexError("Navnet skal udfyldes");
  if (name.length > 100) throw new ConvexError("Navnet må højst være 100 tegn");
  return { name, normalizedName: name.toLocaleLowerCase("da") };
}

function requireDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new ConvexError("Datoen er ugyldig");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    throw new ConvexError("Datoen er ugyldig");
  }
}

function requireMinute(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 1_439) {
    throw new ConvexError("Tidspunktet er ugyldigt");
  }
}

function validateFields(fields: Array<Doc<"ownCheckTemplateVersions">["fields"][number]>) {
  if (fields.length < 1 || fields.length > 30) {
    throw new ConvexError("Tilføj mellem 1 og 30 felter");
  }
  const keys = new Set<string>();
  for (const field of fields) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(field.key)) {
      throw new ConvexError("Feltets nøgle skal være en slug");
    }
    if (keys.has(field.key)) throw new ConvexError("Feltets nøgler skal være unikke");
    keys.add(field.key);
    if (!field.label.trim() || field.label.length > 200) {
      throw new ConvexError("Feltets label skal udfyldes og må højst være 200 tegn");
    }
    if (field.type === "number") {
      if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
        throw new ConvexError("Minimum skal være mindre end eller lig med maksimum");
      }
      if (field.decimals !== undefined && (!Number.isInteger(field.decimals) || field.decimals < 0 || field.decimals > 3)) {
        throw new ConvexError("Antal decimaler skal være mellem 0 og 3");
      }
    }
    if (field.type === "choice") {
      if (field.options.length < 2 || field.options.length > 20) {
        throw new ConvexError("Tilføj mellem 2 og 20 valgmuligheder");
      }
      if (!field.options.some((option) => option.compliant)) {
        throw new ConvexError("Mindst én valgmulighed skal være i orden");
      }
      const optionValues = new Set(field.options.map((option) => option.value));
      if (optionValues.size !== field.options.length || field.options.some((option) => !option.value.trim() || !option.label.trim())) {
        throw new ConvexError("Valgmulighederne skal have unikke værdier og labels");
      }
    }
    if (field.type === "text" && field.maxLength !== undefined && (!Number.isInteger(field.maxLength) || field.maxLength < 1 || field.maxLength > 2_000)) {
      throw new ConvexError("Maksimal tekstlængde skal være mellem 1 og 2.000 tegn");
    }
    if (field.type === "attachment" && (!Number.isInteger(field.maxFiles) || field.maxFiles < 1 || field.maxFiles > 5)) {
      throw new ConvexError("Antal filer skal være mellem 1 og 5");
    }
  }
}

function validateSchedule(schedule: Doc<"ownCheckTemplateVersions">["schedule"]) {
  if (schedule.type === "weekly") {
    if (schedule.weekdays.length < 1 || schedule.weekdays.length > 7 || new Set(schedule.weekdays).size !== schedule.weekdays.length || schedule.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      throw new ConvexError("Vælg mellem 1 og 7 forskellige ugedage");
    }
  } else if (schedule.type === "monthly") {
    if (schedule.days.length < 1 || schedule.days.length > 29 || new Set(schedule.days).size !== schedule.days.length || schedule.days.some((day) => !Number.isInteger(day) || day < 0 || day > 28)) {
      throw new ConvexError("Månedsdagene er ugyldige");
    }
  } else if (schedule.type === "interval") {
    if (!Number.isInteger(schedule.intervalDays) || schedule.intervalDays < 1 || schedule.intervalDays > 365) {
      throw new ConvexError("Intervallet skal være mellem 1 og 365 dage");
    }
    requireDate(schedule.anchorDate);
  }
}

type VersionFields = {
  name: string;
  description: string;
  controlType: Doc<"ownCheckTemplateVersions">["controlType"];
  schedule: Doc<"ownCheckTemplateVersions">["schedule"];
  startMinuteOfDay?: number;
  dueMinuteOfDay?: number;
  fields: Doc<"ownCheckTemplateVersions">["fields"];
  allLocations: boolean;
  locationIds: Id<"locations">[];
  responsibleRole?: string;
};

async function validateVersionFields(
  ctx: TemplateContext,
  organizationId: string,
  input: VersionFields,
) {
  const { name, normalizedName } = normalizeName(input.name);
  const description = input.description.trim();
  if (description.length > 1_000) throw new ConvexError("Beskrivelsen må højst være 1.000 tegn");
  validateFields(input.fields);
  validateSchedule(input.schedule);
  if (input.startMinuteOfDay !== undefined) requireMinute(input.startMinuteOfDay);
  if (input.dueMinuteOfDay !== undefined) requireMinute(input.dueMinuteOfDay);
  if (input.startMinuteOfDay !== undefined && input.dueMinuteOfDay !== undefined && input.startMinuteOfDay >= input.dueMinuteOfDay) {
    throw new ConvexError("Starttidspunktet skal være før sluttidspunktet");
  }
  if (!input.allLocations && input.locationIds.length === 0) {
    throw new ConvexError("Vælg mindst én lokation");
  }
  const locations = await Promise.all(input.locationIds.map((id) => ctx.db.get("locations", id)));
  if (locations.some((location) => !location || location.organizationId !== organizationId)) {
    throw new ConvexError("En lokation tilhører ikke organisationen");
  }
  const responsibleRole = input.responsibleRole?.trim() || undefined;
  if (responsibleRole && !systemRoleKeys.includes(responsibleRole as never)) {
    const role = await ctx.db
      .query("roles")
      .withIndex("by_organizationId_and_key", (q) => q.eq("organizationId", organizationId).eq("key", responsibleRole))
      .unique();
    if (!role) throw new ConvexError("Den ansvarlige rolle findes ikke");
  }
  return { name, normalizedName, description, responsibleRole };
}

async function currentVersion(
  ctx: TemplateContext,
  organizationId: string,
  templateId: Id<"ownCheckTemplates">,
  version: number,
) {
  const row = await ctx.db
    .query("ownCheckTemplateVersions")
    .withIndex("by_organizationId_and_templateId_and_version", (q) => q.eq("organizationId", organizationId).eq("templateId", templateId).eq("version", version))
    .unique();
  if (!row) throw new ConvexError("Egenkontrollen blev ikke fundet");
  return row;
}

function versionOutput(row: Doc<"ownCheckTemplateVersions">) {
  return {
    id: row._id,
    version: row.version,
    name: row.name,
    description: row.description,
    controlType: row.controlType,
    schedule: row.schedule,
    startMinuteOfDay: row.startMinuteOfDay ?? null,
    dueMinuteOfDay: row.dueMinuteOfDay ?? null,
    fields: row.fields,
    allLocations: row.allLocations,
    locationIds: row.locationIds,
    responsibleRole: row.responsibleRole ?? null,
    validFrom: row.validFrom,
    validTo: row.validTo ?? null,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    createdByName: row.createdByName,
  };
}

function summaryOutput(
  template: Doc<"ownCheckTemplates">,
  version: Doc<"ownCheckTemplateVersions">,
) {
  return {
    id: template._id,
    name: template.name,
    status: template.status,
    currentVersion: template.currentVersion,
    updatedAt: template.updatedAt,
    archivedAt: template.archivedAt ?? null,
    version: version.version,
    description: version.description,
    controlType: version.controlType,
    schedule: version.schedule,
    startMinuteOfDay: version.startMinuteOfDay ?? null,
    dueMinuteOfDay: version.dueMinuteOfDay ?? null,
    fields: version.fields,
    allLocations: version.allLocations,
    locationIds: version.locationIds,
    responsibleRole: version.responsibleRole ?? null,
    validFrom: version.validFrom,
    validTo: version.validTo ?? null,
    createdByName: version.createdByName,
  };
}

async function ensureUniqueName(
  ctx: TemplateContext,
  organizationId: string,
  normalizedName: string,
  exceptId?: Id<"ownCheckTemplates">,
) {
  const existing = await ctx.db
    .query("ownCheckTemplates")
    .withIndex("by_organizationId_and_status_and_normalizedName", (q) => q.eq("organizationId", organizationId).eq("status", "active").eq("normalizedName", normalizedName))
    .unique();
  if (existing && existing._id !== exceptId) throw new ConvexError("Navnet bruges allerede");
}

export const listTemplates = query({
  args: {
    status: v.union(v.literal("active"), v.literal("archived")),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(templateSummaryValidator),
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckManager(ctx);
    requirePageSize(args.paginationOpts.numItems);
    const page = await ctx.db
      .query("ownCheckTemplates")
      .withIndex("by_organizationId_and_status_and_normalizedName", (q) => q.eq("organizationId", auth.organizationId).eq("status", args.status))
      .paginate(args.paginationOpts);
    const hydrated = await Promise.all(page.page.map(async (template) => summaryOutput(template, await currentVersion(ctx, auth.organizationId, template._id, template.currentVersion))));
    return { ...page, page: hydrated };
  },
});

export const getTemplate = query({
  args: { templateId: v.id("ownCheckTemplates") },
  returns: v.union(v.object({ template: templateSummaryValidator, versions: v.array(versionOutputValidator) }), v.null()),
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckManager(ctx);
    const template = await ctx.db.get("ownCheckTemplates", args.templateId);
    if (!template || template.organizationId !== auth.organizationId) return null;
    const versions = await ctx.db
      .query("ownCheckTemplateVersions")
      .withIndex("by_organizationId_and_templateId_and_version", (q) => q.eq("organizationId", auth.organizationId).eq("templateId", template._id))
      .take(MAX_TEMPLATE_VERSIONS + 1);
    if (versions.length > MAX_TEMPLATE_VERSIONS) throw new ConvexError("Der er for mange egenkontrolversioner");
    const current = versions.find((version) => version.version === template.currentVersion);
    if (!current) throw new ConvexError("Egenkontrollen mangler sin aktuelle version");
    return {
      template: summaryOutput(template, current),
      versions: versions.sort((a, b) => b.version - a.version).map(versionOutput),
    };
  },
});

export const createTemplate = mutation({
  args: templateInput.fields,
  returns: v.id("ownCheckTemplates"),
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckManager(ctx);
    const activeCount = await ctx.db
      .query("ownCheckTemplates")
      .withIndex("by_organizationId_and_status_and_normalizedName", (q) => q.eq("organizationId", auth.organizationId).eq("status", "active"))
      .take(MAX_ACTIVE_TEMPLATES + 1);
    if (activeCount.length >= MAX_ACTIVE_TEMPLATES) throw new ConvexError("Organisationen må højst have 200 aktive egenkontroller");
    const validated = await validateVersionFields(ctx, auth.organizationId, args);
    await ensureUniqueName(ctx, auth.organizationId, validated.normalizedName);
    const now = Date.now();
    const templateId = await ctx.db.insert("ownCheckTemplates", {
      organizationId: auth.organizationId,
      name: validated.name,
      normalizedName: validated.normalizedName,
      currentVersion: 1,
      status: "active",
      createdBy: auth.userId,
      updatedAt: now,
    });
    await ctx.db.insert("ownCheckTemplateVersions", {
      organizationId: auth.organizationId,
      templateId,
      version: 1,
      name: validated.name,
      description: validated.description,
      controlType: args.controlType,
      schedule: args.schedule,
      ...(args.startMinuteOfDay === undefined ? {} : { startMinuteOfDay: args.startMinuteOfDay }),
      ...(args.dueMinuteOfDay === undefined ? {} : { dueMinuteOfDay: args.dueMinuteOfDay }),
      fields: args.fields,
      allLocations: args.allLocations,
      locationIds: args.locationIds,
      ...(validated.responsibleRole === undefined ? {} : { responsibleRole: validated.responsibleRole }),
      validFrom: now,
      createdAt: now,
      createdBy: auth.userId,
      createdByName: auth.userName,
    });
    await recordAudit(ctx, auth, {
      action: "ownChecks.templateCreated",
      entityTable: "ownCheckTemplates",
      entityId: templateId,
      summary: `Egenkontrollen ${validated.name} blev oprettet`,
    });
    return templateId;
  },
});

export const updateTemplate = mutation({
  args: templateUpdateInput.fields,
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckManager(ctx);
    const template = await ctx.db.get("ownCheckTemplates", args.templateId);
    if (!template || template.organizationId !== auth.organizationId || template.status !== "active") throw new ConvexError("Egenkontrollen blev ikke fundet");
    const current = await currentVersion(ctx, auth.organizationId, template._id, template.currentVersion);
    const validated = await validateVersionFields(ctx, auth.organizationId, args);
    await ensureUniqueName(ctx, auth.organizationId, validated.normalizedName, template._id);
    const currentKeys = new Set(current.fields.map((field) => field.key));
    const nextFieldsByKey = new Map(args.fields.map((field) => [field.key, field]));
    const removedFieldKeys = args.removedFieldKeys ?? [];
    if (new Set(removedFieldKeys).size !== removedFieldKeys.length || removedFieldKeys.some((key) => !currentKeys.has(key))) {
      throw new ConvexError("De slettede felter er ugyldige");
    }
    for (const oldField of current.fields) {
      const nextField = nextFieldsByKey.get(oldField.key);
      if (removedFieldKeys.includes(oldField.key)) {
        if (nextField) throw new ConvexError("Et felt kan ikke både slettes og bevares");
      } else if (!nextField) {
        throw new ConvexError("Angiv slettede felter eksplicit, så felternes nøgler forbliver stabile");
      }
    }
    const reason = requireAuditReason(args.reason);
    const now = Math.max(Date.now(), current.validFrom + 1);
    await ctx.db.patch("ownCheckTemplateVersions", current._id, { validTo: now });
    await ctx.db.insert("ownCheckTemplateVersions", {
      organizationId: auth.organizationId,
      templateId: template._id,
      version: current.version + 1,
      name: validated.name,
      description: validated.description,
      controlType: args.controlType,
      schedule: args.schedule,
      ...(args.startMinuteOfDay === undefined ? {} : { startMinuteOfDay: args.startMinuteOfDay }),
      ...(args.dueMinuteOfDay === undefined ? {} : { dueMinuteOfDay: args.dueMinuteOfDay }),
      fields: args.fields,
      allLocations: args.allLocations,
      locationIds: args.locationIds,
      ...(validated.responsibleRole === undefined ? {} : { responsibleRole: validated.responsibleRole }),
      validFrom: now,
      createdAt: now,
      createdBy: auth.userId,
      createdByName: auth.userName,
    });
    await ctx.db.patch(template._id, {
      name: validated.name,
      normalizedName: validated.normalizedName,
      currentVersion: current.version + 1,
      updatedAt: now,
    });
    await recordAudit(ctx, auth, {
      action: "ownChecks.templateUpdated",
      entityTable: "ownCheckTemplates",
      entityId: template._id,
      summary: `Egenkontrollen ${validated.name} blev opdateret`,
      reason,
    });
    return null;
  },
});

export const archiveTemplate = mutation({
  args: { templateId: v.id("ownCheckTemplates"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckManager(ctx);
    const template = await ctx.db.get("ownCheckTemplates", args.templateId);
    if (!template || template.organizationId !== auth.organizationId || template.status !== "active") throw new ConvexError("Egenkontrollen blev ikke fundet");
    const current = await currentVersion(ctx, auth.organizationId, template._id, template.currentVersion);
    const reason = requireAuditReason(args.reason);
    const now = Math.max(Date.now(), current.validFrom + 1);
    await ctx.db.patch("ownCheckTemplateVersions", current._id, { validTo: now });
    await ctx.db.patch("ownCheckTemplates", template._id, { status: "archived", archivedAt: now, updatedAt: now });
    await recordAudit(ctx, auth, {
      action: "ownChecks.templateArchived",
      entityTable: "ownCheckTemplates",
      entityId: template._id,
      summary: `Egenkontrollen ${template.name} blev arkiveret`,
      reason,
    });
    return null;
  },
});

export const restoreTemplate = mutation({
  args: { templateId: v.id("ownCheckTemplates"), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckManager(ctx);
    const template = await ctx.db.get("ownCheckTemplates", args.templateId);
    if (!template || template.organizationId !== auth.organizationId || template.status !== "archived") throw new ConvexError("Egenkontrollen blev ikke fundet");
    await ensureUniqueName(ctx, auth.organizationId, template.normalizedName, template._id);
    const current = await currentVersion(ctx, auth.organizationId, template._id, template.currentVersion);
    const reason = requireAuditReason(args.reason);
    const now = Math.max(Date.now(), current.validTo ?? current.validFrom + 1);
    await ctx.db.insert("ownCheckTemplateVersions", {
      organizationId: auth.organizationId,
      templateId: template._id,
      version: current.version + 1,
      name: current.name,
      description: current.description,
      controlType: current.controlType,
      schedule: current.schedule,
      ...(current.startMinuteOfDay === undefined ? {} : { startMinuteOfDay: current.startMinuteOfDay }),
      ...(current.dueMinuteOfDay === undefined ? {} : { dueMinuteOfDay: current.dueMinuteOfDay }),
      fields: current.fields,
      allLocations: current.allLocations,
      locationIds: current.locationIds,
      ...(current.responsibleRole === undefined ? {} : { responsibleRole: current.responsibleRole }),
      validFrom: now,
      createdAt: now,
      createdBy: auth.userId,
      createdByName: auth.userName,
    });
    await ctx.db.patch("ownCheckTemplates", template._id, { status: "active", archivedAt: undefined, currentVersion: current.version + 1, updatedAt: now });
    await recordAudit(ctx, auth, {
      action: "ownChecks.templateRestored",
      entityTable: "ownCheckTemplates",
      entityId: template._id,
      summary: `Egenkontrollen ${template.name} blev gendannet`,
      reason,
    });
    return null;
  },
});

const settingsOutputValidator = v.object({
  lateSubmissionDays: v.number(),
  requireSecondPersonApproval: v.boolean(),
  blockDuringCount: v.boolean(),
});

export const getSettings = query({
  args: {},
  returns: settingsOutputValidator,
  handler: async (ctx) => {
    const auth = await requireOwnCheckManager(ctx);
    return await getOwnCheckConfiguration(ctx, auth.organizationId);
  },
});

export const getTemplateDateContext = query({
  args: { locationId: v.id("locations"), now: v.number() },
  returns: v.object({ timeZone: v.string(), todayDateKey: v.string() }),
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckManager(ctx);
    requireLocationAccess(auth, args.locationId);
    await requireLocation(ctx, auth.organizationId, args.locationId);
    return await ownCheckDateContext(ctx, auth.organizationId, args.locationId, args.now);
  },
});

export const saveSettings = mutation({
  args: {
    lateSubmissionDays: v.number(),
    requireSecondPersonApproval: v.boolean(),
    blockDuringCount: v.boolean(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireOwnCheckManager(ctx);
    if (!Number.isInteger(args.lateSubmissionDays) || args.lateSubmissionDays < 0 || args.lateSubmissionDays > 30) {
      throw new ConvexError("Fristen skal være mellem 0 og 30 dage");
    }
    const reason = requireAuditReason(args.reason);
    const existing = await ctx.db
      .query("ownCheckSettings")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", auth.organizationId))
      .unique();
    const now = Date.now();
    let settingsId: Id<"ownCheckSettings">;
    if (existing) {
      settingsId = existing._id;
      await ctx.db.patch(existing._id, {
        lateSubmissionDays: args.lateSubmissionDays,
        requireSecondPersonApproval: args.requireSecondPersonApproval,
        blockDuringCount: args.blockDuringCount,
        updatedAt: now,
      });
    } else {
      settingsId = await ctx.db.insert("ownCheckSettings", {
        organizationId: auth.organizationId,
        lateSubmissionDays: args.lateSubmissionDays,
        requireSecondPersonApproval: args.requireSecondPersonApproval,
        blockDuringCount: args.blockDuringCount,
        updatedAt: now,
      });
    }
    await recordAudit(ctx, auth, {
      action: "ownChecks.settingsChanged",
      entityTable: "ownCheckSettings",
      entityId: settingsId,
      summary: "Egenkontrolindstillingerne blev ændret",
      reason,
    });
    return null;
  },
});
