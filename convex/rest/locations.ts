import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { MAX_SPECIAL_OPENING_DATES, DEFAULT_WEEKLY_OPENING_HOURS } from "../../lib/count-window";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { getDatabaseAdapter } from "../auth";
import {
  requireAllLocationAccess,
  requireLocationAccess,
  requireLocationManager,
  type OrganizationAuth,
} from "../lib/auth";
import { runIdempotent } from "../lib/idempotency";
import { recordAudit } from "../lib/audit";
import { requireRestApiMutation } from "./lib";
import { normalizeMasterDataName, optionalText, requireCurrency } from "../lib/masterData";
import {
  openingHoursModeValidator,
  specialOpeningHoursValidator,
  weeklyOpeningHoursValidator,
} from "../lib/openingHours";
import {
  requireTimeZone,
  resolveTimeZone,
  scheduleLocationDayStartReroll,
} from "../lib/timeZone";

const MAX_NAME_LENGTH = 100;
const MAX_LOCATIONS = 200;
const MAX_PAGE_SIZE = 100;

const ownershipTypeValidator = v.union(
  v.literal("owned"),
  v.literal("franchise"),
  v.literal("jointVenture"),
  v.literal("license"),
);

const locationStatusValidator = v.union(
  v.literal("planned"),
  v.literal("open"),
  v.literal("temporarilyClosed"),
  v.literal("closed"),
);

const locationValidator = v.object({
  id: v.id("locations"),
  name: v.string(),
  marketId: v.union(v.id("markets"), v.null()),
  legalEntityId: v.union(v.id("legalEntities"), v.null()),
  operatorId: v.union(v.id("operators"), v.null()),
  ownershipType: v.union(ownershipTypeValidator, v.null()),
  conceptVersion: v.union(v.string(), v.null()),
  openedAt: v.union(v.number(), v.null()),
  currency: v.union(v.string(), v.null()),
  timeZone: v.union(v.string(), v.null()),
  status: v.union(locationStatusValidator, v.null()),
});

const openingHoursValidator = v.object({
  mode: openingHoursModeValidator,
  weekly: v.array(weeklyOpeningHoursValidator),
  specials: v.array(specialOpeningHoursValidator),
});

const locationCreateInputValidator = v.object({
  name: v.string(),
  marketId: v.optional(v.union(v.string(), v.null())),
  legalEntityId: v.optional(v.union(v.string(), v.null())),
  operatorId: v.optional(v.union(v.string(), v.null())),
  ownershipType: v.optional(v.union(ownershipTypeValidator, v.null())),
  conceptVersion: v.optional(v.union(v.string(), v.null())),
  openedAt: v.optional(v.union(v.number(), v.null())),
  currency: v.optional(v.union(v.string(), v.null())),
  timeZone: v.optional(v.union(v.string(), v.null())),
  status: v.optional(v.union(locationStatusValidator, v.null())),
});

const locationPatchInputValidator = v.object({
  name: v.optional(v.string()),
  marketId: v.optional(v.union(v.string(), v.null())),
  legalEntityId: v.optional(v.union(v.string(), v.null())),
  operatorId: v.optional(v.union(v.string(), v.null())),
  ownershipType: v.optional(v.union(ownershipTypeValidator, v.null())),
  conceptVersion: v.optional(v.union(v.string(), v.null())),
  openedAt: v.optional(v.union(v.number(), v.null())),
  currency: v.optional(v.union(v.string(), v.null())),
  timeZone: v.optional(v.union(v.string(), v.null())),
  status: v.optional(v.union(locationStatusValidator, v.null())),
});

const openingHoursInputValidator = v.object({
  mode: openingHoursModeValidator,
  weekly: v.array(weeklyOpeningHoursValidator),
  specials: v.array(specialOpeningHoursValidator),
});

const idempotentResponseValidator = v.object({
  status: v.number(),
  json: v.string(),
  replayed: v.boolean(),
});

type OpeningHours = {
  mode: "sameEveryDay" | "byWeekday";
  weekly: Array<{
    weekday: number;
    closed: boolean;
    openMinuteOfDay: number;
    closeMinuteOfDay: number;
  }>;
  specials: Array<{
    date: string;
    closed: boolean;
    openMinuteOfDay: number;
    closeMinuteOfDay: number;
  }>;
};

type LocationDto = {
  id: Id<"locations">;
  name: string;
  marketId: Id<"markets"> | null;
  legalEntityId: Id<"legalEntities"> | null;
  operatorId: Id<"operators"> | null;
  ownershipType: "owned" | "franchise" | "jointVenture" | "license" | null;
  conceptVersion: string | null;
  openedAt: number | null;
  currency: string | null;
  timeZone: string | null;
  status: "planned" | "open" | "temporarilyClosed" | "closed" | null;
};

type LocationContext = QueryCtx | MutationCtx;

function restError(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

function requireApiKeyPrincipal(auth: OrganizationAuth) {
  if (auth.principalKind !== "apiKey" || !auth.apiKeyId) {
    restError("api_key_required", "An API key is required for this operation.");
  }
}

async function requireLocationApiKey(ctx: LocationContext) {
  const auth = await requireLocationManager(ctx);
  requireApiKeyPrincipal(auth);
  return auth;
}

function requirePageSize(numItems: number) {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > MAX_PAGE_SIZE) {
    restError(
      "page_size_invalid",
      "Page size must be an integer between 1 and 100.",
    );
  }
}

function normalizeName(value: string) {
  try {
    return normalizeMasterDataName(value, "Location name");
  } catch {
    restError(
      "location_name_invalid",
      "Name is required and must be at most 100 characters.",
    );
  }
}

function normalizeConceptVersion(value: string | null | undefined) {
  const conceptVersion = optionalText(value);
  if (conceptVersion && conceptVersion.length > MAX_NAME_LENGTH) {
    restError(
      "location_concept_version_invalid",
      "Concept version must be at most 100 characters.",
    );
  }
  return conceptVersion;
}

function normalizeOpenedAt(value: number | null | undefined) {
  if (value === null || value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) {
    restError("location_opened_at_invalid", "Opened at must be a valid timestamp.");
  }
  return value;
}

function normalizeCurrency(value: string | null | undefined) {
  try {
    return requireCurrency(value);
  } catch {
    restError(
      "location_currency_invalid",
      "Currency must be a three-letter ISO 4217 code.",
    );
  }
}

function normalizeTimeZone(value: string | null | undefined) {
  try {
    return requireTimeZone(value);
  } catch {
    restError("location_timezone_invalid", "Time zone is invalid.");
  }
}

async function resolveMarketId(
  ctx: MutationCtx,
  organizationId: string,
  publicId: string | null | undefined,
) {
  if (publicId === null || publicId === undefined) return undefined;
  const id = ctx.db.normalizeId("markets", publicId);
  const market = id ? await ctx.db.get("markets", id) : null;
  if (!market || market.organizationId !== organizationId) {
    restError("market_reference_invalid", "Market was not found.");
  }
  return market._id;
}

async function resolveLegalEntityId(
  ctx: MutationCtx,
  organizationId: string,
  publicId: string | null | undefined,
) {
  if (publicId === null || publicId === undefined) return undefined;
  const id = ctx.db.normalizeId("legalEntities", publicId);
  const legalEntity = id ? await ctx.db.get("legalEntities", id) : null;
  if (!legalEntity || legalEntity.organizationId !== organizationId) {
    restError(
      "legal_entity_reference_invalid",
      "Legal entity was not found.",
    );
  }
  return legalEntity._id;
}

async function resolveOperatorId(
  ctx: MutationCtx,
  organizationId: string,
  publicId: string | null | undefined,
) {
  if (publicId === null || publicId === undefined) return undefined;
  const id = ctx.db.normalizeId("operators", publicId);
  const operator = id ? await ctx.db.get("operators", id) : null;
  if (!operator || operator.organizationId !== organizationId) {
    restError("operator_reference_invalid", "Operator was not found.");
  }
  return operator._id;
}

function toLocationDto(location: Doc<"locations">): LocationDto {
  return {
    id: location._id,
    name: location.name,
    marketId: location.marketId ?? null,
    legalEntityId: location.legalEntityId ?? null,
    operatorId: location.operatorId ?? null,
    ownershipType: location.ownershipType ?? null,
    conceptVersion: location.conceptVersion ?? null,
    openedAt: location.openedAt ?? null,
    currency: location.currency ?? null,
    timeZone: location.timeZone ?? null,
    status: location.status ?? null,
  };
}

async function findOwnedLocation(
  ctx: MutationCtx,
  organizationId: string,
  publicId: string,
) {
  const id = ctx.db.normalizeId("locations", publicId);
  if (!id) restError("location_not_found", "Location was not found.");
  const location = await ctx.db.get("locations", id);
  if (!location || location.organizationId !== organizationId) {
    restError("location_not_found", "Location was not found.");
  }
  return location;
}

async function readOpeningHours(
  ctx: LocationContext,
  organizationId: string,
  location: Doc<"locations">,
): Promise<OpeningHours> {
  const [specials, legacySettings] = await Promise.all([
    ctx.db
      .query("locationSpecialOpeningHours")
      .withIndex("by_organizationId_and_locationId_and_date", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", location._id),
      )
      .take(MAX_SPECIAL_OPENING_DATES + 1),
    location.weeklyOpeningHours
      ? null
      : ctx.db
          .query("countSettings")
          .withIndex("by_organizationId", (q) =>
            q.eq("organizationId", organizationId),
          )
          .unique(),
  ]);
  if (specials.length > MAX_SPECIAL_OPENING_DATES) {
    restError(
      "opening_hours_invalid",
      "The location has too many special opening hours.",
    );
  }
  return {
    mode: location.openingHoursMode ?? "sameEveryDay",
    weekly:
      location.weeklyOpeningHours ??
      DEFAULT_WEEKLY_OPENING_HOURS.map((hours) => ({
        ...hours,
        openMinuteOfDay:
          legacySettings?.openMinuteOfDay ?? hours.openMinuteOfDay,
        closeMinuteOfDay:
          legacySettings?.closeMinuteOfDay ?? hours.closeMinuteOfDay,
      })),
    specials: specials.map(
      ({ date, closed, openMinuteOfDay, closeMinuteOfDay }) => ({
        date,
        closed,
        openMinuteOfDay,
        closeMinuteOfDay,
      }),
    ),
  };
}

function requireMinuteOfDay(value: number) {
  if (!Number.isInteger(value) || value < 0 || value >= 24 * 60) {
    restError(
      "opening_hours_invalid",
      "Opening and closing times must be valid minutes of the day.",
    );
  }
}

function requireHours(hours: {
  closed: boolean;
  openMinuteOfDay: number;
  closeMinuteOfDay: number;
}) {
  requireMinuteOfDay(hours.openMinuteOfDay);
  requireMinuteOfDay(hours.closeMinuteOfDay);
  if (!hours.closed && hours.openMinuteOfDay === hours.closeMinuteOfDay) {
    restError(
      "opening_hours_invalid",
      "Opening and closing times must be different for an open day.",
    );
  }
}

function requireDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) restError("opening_hours_invalid", "Special dates are invalid.");
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    restError("opening_hours_invalid", "Special dates are invalid.");
  }
}

function requireOpeningHours(input: OpeningHours) {
  if (
    input.weekly.length !== 7 ||
    new Set(input.weekly.map((hours) => hours.weekday)).size !== 7 ||
    input.weekly.some(
      (hours) =>
        !Number.isInteger(hours.weekday) ||
        hours.weekday < 0 ||
        hours.weekday > 6,
    )
  ) {
    restError("opening_hours_invalid", "Weekly opening hours are invalid.");
  }
  for (const hours of input.weekly) requireHours(hours);
  if (input.weekly.every((hours) => hours.closed)) {
    restError(
      "opening_hours_invalid",
      "At least one weekday must be open.",
    );
  }
  if (input.mode === "sameEveryDay") {
    const first = input.weekly[0];
    if (
      input.weekly.some(
        (hours) =>
          hours.closed !== first.closed ||
          hours.openMinuteOfDay !== first.openMinuteOfDay ||
          hours.closeMinuteOfDay !== first.closeMinuteOfDay,
      )
    ) {
      restError(
        "opening_hours_invalid",
        "All weekdays must have the same opening hours in sameEveryDay mode.",
      );
    }
  }
  if (input.specials.length > MAX_SPECIAL_OPENING_DATES) {
    restError(
      "opening_hours_invalid",
      `At most ${MAX_SPECIAL_OPENING_DATES} special opening dates may be supplied.`,
    );
  }
  if (
    new Set(input.specials.map((hours) => hours.date)).size !==
    input.specials.length
  ) {
    restError(
      "opening_hours_invalid",
      "Each special opening date may only be supplied once.",
    );
  }
  for (const hours of input.specials) {
    requireDate(hours.date);
    requireHours(hours);
  }
}

async function applyOpeningHours(
  ctx: MutationCtx,
  organizationId: string,
  location: Doc<"locations">,
  input: OpeningHours,
) {
  requireOpeningHours(input);
  const currentSpecials = await ctx.db
    .query("locationSpecialOpeningHours")
    .withIndex("by_organizationId_and_locationId_and_date", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", location._id),
    )
    .take(MAX_SPECIAL_OPENING_DATES + 1);
  if (currentSpecials.length > MAX_SPECIAL_OPENING_DATES) {
    restError(
      "opening_hours_invalid",
      "The location has too many special opening hours.",
    );
  }
  await ctx.db.patch("locations", location._id, {
    openingHoursMode: input.mode,
    weeklyOpeningHours: [...input.weekly].sort(
      (left, right) => left.weekday - right.weekday,
    ),
  });
  const currentByDate = new Map(
    currentSpecials.map((hours) => [hours.date, hours]),
  );
  for (const hours of input.specials) {
    const current = currentByDate.get(hours.date);
    if (current) {
      await ctx.db.patch("locationSpecialOpeningHours", current._id, {
        closed: hours.closed,
        openMinuteOfDay: hours.openMinuteOfDay,
        closeMinuteOfDay: hours.closeMinuteOfDay,
      });
      currentByDate.delete(hours.date);
    } else {
      await ctx.db.insert("locationSpecialOpeningHours", {
        organizationId,
        locationId: location._id,
        ...hours,
      });
    }
  }
  for (const current of currentByDate.values()) {
    await ctx.db.delete("locationSpecialOpeningHours", current._id);
  }
  const saved = await ctx.db.get("locations", location._id);
  if (!saved) restError("location_not_found", "Location was not found.");
  return await readOpeningHours(ctx, organizationId, saved);
}

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(locationValidator),
  handler: async (ctx, args) => {
    const auth = await requireLocationApiKey(ctx);
    requirePageSize(args.paginationOpts.numItems);
    const result = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page
        .filter(
          (location) =>
            auth.locationScope.all || auth.locationScope.ids.has(location._id),
        )
        .map(toLocationDto),
    };
  },
});

export const get = query({
  args: { id: v.string() },
  returns: v.union(locationValidator, v.null()),
  handler: async (ctx, args) => {
    const auth = await requireLocationApiKey(ctx);
    const id = ctx.db.normalizeId("locations", args.id);
    const location = id ? await ctx.db.get("locations", id) : null;
    if (!location || location.organizationId !== auth.organizationId) return null;
    requireLocationAccess(auth, location._id);
    return toLocationDto(location);
  },
});

export const getOpeningHours = query({
  args: { id: v.string() },
  returns: v.union(openingHoursValidator, v.null()),
  handler: async (ctx, args) => {
    const auth = await requireLocationApiKey(ctx);
    const id = ctx.db.normalizeId("locations", args.id);
    const location = id ? await ctx.db.get("locations", id) : null;
    if (!location || location.organizationId !== auth.organizationId) return null;
    requireLocationAccess(auth, location._id);
    return await readOpeningHours(ctx, auth.organizationId, location);
  },
});

export const create = mutation({
  args: {
    idempotencyKey: v.string(),
    requestHash: v.string(),
    input: locationCreateInputValidator,
  },
  returns: idempotentResponseValidator,
  handler: async (ctx, args) => {
    const auth = await requireLocationApiKey(ctx);
    requireAllLocationAccess(auth);
    await requireRestApiMutation(ctx, auth);
    return await runIdempotent(
      ctx,
      auth,
      {
        operationId: "locations.create",
        key: args.idempotencyKey,
        requestHash: args.requestHash,
      },
      async () => {
        const locations = await ctx.db
          .query("locations")
          .withIndex("by_organizationId_and_normalizedName", (q) =>
            q.eq("organizationId", auth.organizationId),
          )
          .take(MAX_LOCATIONS);
        if (locations.length >= MAX_LOCATIONS) {
          restError(
            "location_limit_reached",
            `An organization may have at most ${MAX_LOCATIONS} locations.`,
          );
        }
        const { name, normalizedName } = normalizeName(args.input.name);
        const existing = await ctx.db
          .query("locations")
          .withIndex("by_organizationId_and_normalizedName", (q) =>
            q
              .eq("organizationId", auth.organizationId)
              .eq("normalizedName", normalizedName),
          )
          .unique();
        if (existing) {
          restError(
            "location_name_taken",
            "A location with this name already exists.",
          );
        }
        const marketId = await resolveMarketId(
          ctx,
          auth.organizationId,
          args.input.marketId,
        );
        const legalEntityId = await resolveLegalEntityId(
          ctx,
          auth.organizationId,
          args.input.legalEntityId,
        );
        const operatorId = await resolveOperatorId(
          ctx,
          auth.organizationId,
          args.input.operatorId,
        );
        const conceptVersion = normalizeConceptVersion(args.input.conceptVersion);
        const openedAt = normalizeOpenedAt(args.input.openedAt);
        const currency = normalizeCurrency(args.input.currency);
        const timeZone = normalizeTimeZone(args.input.timeZone);
        const ownershipType = args.input.ownershipType ?? undefined;
        const status = args.input.status ?? undefined;
        const id = await ctx.db.insert("locations", {
          organizationId: auth.organizationId,
          name,
          normalizedName,
          marketId,
          legalEntityId,
          operatorId,
          ownershipType,
          conceptVersion,
          openedAt,
          currency,
          timeZone,
          status,
          openingHoursMode: "sameEveryDay",
          weeklyOpeningHours: DEFAULT_WEEKLY_OPENING_HOURS,
        });
        await recordAudit(ctx, auth, {
          action: "locations.created",
          entityTable: "locations",
          entityId: id,
          summary: `Lokationen ${name} blev oprettet`,
          locationId: id,
        });
        const data = {
          id,
          name,
          marketId: marketId ?? null,
          legalEntityId: legalEntityId ?? null,
          operatorId: operatorId ?? null,
          ownershipType: ownershipType ?? null,
          conceptVersion: conceptVersion ?? null,
          openedAt: openedAt === undefined ? null : new Date(openedAt).toISOString(),
          currency: currency ?? null,
          timeZone: timeZone ?? null,
          status: status ?? null,
        };
        return { status: 201, json: JSON.stringify({ data }) };
      },
    );
  },
});

export const update = mutation({
  args: { id: v.string(), input: locationPatchInputValidator },
  returns: locationValidator,
  handler: async (ctx, args) => {
    const auth = await requireLocationApiKey(ctx);
    await requireRestApiMutation(ctx, auth);
    const locationId = ctx.db.normalizeId("locations", args.id);
    if (!locationId) restError("location_not_found", "Location was not found.");
    const location = await ctx.db.get("locations", locationId);
    if (!location || location.organizationId !== auth.organizationId) {
      restError("location_not_found", "Location was not found.");
    }
    requireLocationAccess(auth, location._id);
    const nextName =
      args.input.name === undefined
        ? { name: location.name, normalizedName: location.normalizedName }
        : normalizeName(args.input.name);
    const existing = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("normalizedName", nextName.normalizedName),
      )
      .unique();
    if (existing && existing._id !== location._id) {
      restError(
        "location_name_taken",
        "A location with this name already exists.",
      );
    }
    const previousTimeZone = await resolveTimeZone(
      ctx,
      auth.organizationId,
      location._id,
    );
    const marketId =
      args.input.marketId === undefined
        ? location.marketId
        : await resolveMarketId(ctx, auth.organizationId, args.input.marketId);
    const legalEntityId =
      args.input.legalEntityId === undefined
        ? location.legalEntityId
        : await resolveLegalEntityId(
            ctx,
            auth.organizationId,
            args.input.legalEntityId,
          );
    const operatorId =
      args.input.operatorId === undefined
        ? location.operatorId
        : await resolveOperatorId(
            ctx,
            auth.organizationId,
            args.input.operatorId,
          );
    const conceptVersion =
      args.input.conceptVersion === undefined
        ? location.conceptVersion
        : normalizeConceptVersion(args.input.conceptVersion);
    const openedAt =
      args.input.openedAt === undefined
        ? location.openedAt
        : normalizeOpenedAt(args.input.openedAt);
    const currency =
      args.input.currency === undefined
        ? location.currency
        : normalizeCurrency(args.input.currency);
    const timeZone =
      args.input.timeZone === undefined
        ? location.timeZone
        : normalizeTimeZone(args.input.timeZone);
    const ownershipType =
      args.input.ownershipType === undefined
        ? location.ownershipType
        : args.input.ownershipType ?? undefined;
    const status =
      args.input.status === undefined
        ? location.status
        : args.input.status ?? undefined;
    await ctx.db.patch("locations", location._id, {
      name: nextName.name,
      normalizedName: nextName.normalizedName,
      marketId,
      legalEntityId,
      operatorId,
      ownershipType,
      conceptVersion,
      openedAt,
      currency,
      timeZone,
      status,
    });
    const effectiveTimeZone = await resolveTimeZone(
      ctx,
      auth.organizationId,
      location._id,
    );
    if (effectiveTimeZone !== previousTimeZone) {
      await scheduleLocationDayStartReroll(
        ctx,
        auth.organizationId,
        location._id,
        effectiveTimeZone,
      );
    }
    await recordAudit(ctx, auth, {
      action: "locations.updated",
      entityTable: "locations",
      entityId: location._id,
      summary: `Lokationen ${nextName.name} blev ændret`,
      locationId: location._id,
    });
    const updated = await ctx.db.get("locations", location._id);
    if (!updated) restError("location_not_found", "Location was not found.");
    return toLocationDto(updated);
  },
});

export const deleteLocation = mutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireLocationApiKey(ctx);
    await requireRestApiMutation(ctx, auth);
    const locationId = ctx.db.normalizeId("locations", args.id);
    if (!locationId) restError("location_not_found", "Location was not found.");
    const location = await ctx.db.get("locations", locationId);
    if (!location || location.organizationId !== auth.organizationId) {
      restError("location_not_found", "Location was not found.");
    }
    requireLocationAccess(auth, location._id);
    const dependencies = await Promise.all([
      ctx.db
        .query("transfers")
        .withIndex("by_organizationId_and_fromLocationId", (q) =>
          q
            .eq("organizationId", auth.organizationId)
            .eq("fromLocationId", location._id),
        )
        .first(),
      ctx.db
        .query("transfers")
        .withIndex("by_organizationId_and_toLocationId", (q) =>
          q
            .eq("organizationId", auth.organizationId)
            .eq("toLocationId", location._id),
        )
        .first(),
      ctx.db
        .query("counts")
        .withIndex("by_organizationId_and_locationId_and_periodKey", (q) =>
          q.eq("organizationId", auth.organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("locationStock")
        .withIndex("by_organizationId_and_locationId_and_productId", (q) =>
          q.eq("organizationId", auth.organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("employeeLocationAssignments")
        .withIndex("by_organizationId_and_locationId_and_employeeId", (q) =>
          q.eq("organizationId", auth.organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("scheduledShifts")
        .withIndex("by_organizationId_and_locationId_and_startsAt", (q) =>
          q.eq("organizationId", auth.organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("staffFoodSessions")
        .withIndex("by_org_location_employee_date_source", (q) =>
          q.eq("organizationId", auth.organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("staffFoodRegistrations")
        .withIndex("by_organizationId_and_locationId_and_registeredAt", (q) =>
          q.eq("organizationId", auth.organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("wasteRegistrations")
        .withIndex("by_org_location_time", (q) =>
          q.eq("organizationId", auth.organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("badDeliveries")
        .withIndex("by_organizationId_and_locationId_and_registeredAt", (q) =>
          q.eq("organizationId", auth.organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("wasteProductStats")
        .withIndex("by_org_location_product", (q) =>
          q.eq("organizationId", auth.organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("wasteAmountStats")
        .withIndex("by_org_location_product_unit_qty", (q) =>
          q.eq("organizationId", auth.organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("wasteProductConfigs")
        .withIndex("by_org_location_product", (q) =>
          q.eq("organizationId", auth.organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("salesOrders")
        .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
          q.eq("organizationId", auth.organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("salesLines")
        .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
          q.eq("organizationId", auth.organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("salesDaily")
        .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
          q.eq("organizationId", auth.organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("onlinePosLocationIntegrations")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q.eq("organizationId", auth.organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("workfeedLocationMappings")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q.eq("organizationId", auth.organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("onlinePosSyncStatus")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q.eq("organizationId", auth.organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("onlinePosSalesResets")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q.eq("organizationId", auth.organizationId).eq("locationId", location._id),
        )
        .first(),
    ]);
    const kioskMembers = await getDatabaseAdapter(ctx).findMany<{
      kioskLocationId?: string | null;
    }>({
      model: "member",
      where: [{ field: "organizationId", value: auth.organizationId }],
      limit: 100,
    });
    if (
      kioskMembers.some(
        (member) => member.kioskLocationId === String(location._id),
      )
    ) {
      restError(
        "location_kiosk_dependency",
        "The location is linked to a kiosk account. Move or delete the kiosk account first.",
      );
    }
    if (dependencies.some(Boolean)) {
      restError(
        "location_in_use",
        "The location has operational data, history, or integrations and cannot be deleted.",
      );
    }
    const specialOpeningHours = await ctx.db
      .query("locationSpecialOpeningHours")
      .withIndex("by_organizationId_and_locationId_and_date", (q) =>
        q.eq("organizationId", auth.organizationId).eq("locationId", location._id),
      )
      .take(MAX_SPECIAL_OPENING_DATES + 1);
    if (specialOpeningHours.length > MAX_SPECIAL_OPENING_DATES) {
      restError(
        "opening_hours_invalid",
        "The location has too many special opening hours.",
      );
    }
    const memberLocationRows = await ctx.db
      .query("memberLocationAccess")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .take(1000);
    for (const row of memberLocationRows) {
      if (row.scope !== "selected" || !row.locationIds.includes(location._id)) {
        continue;
      }
      await ctx.db.patch("memberLocationAccess", row._id, {
        scope: "selected",
        locationIds: row.locationIds.filter((id) => id !== location._id),
        updatedAt: Date.now(),
      });
    }
    for (const hours of specialOpeningHours) {
      await ctx.db.delete("locationSpecialOpeningHours", hours._id);
    }
    await ctx.scheduler.runAfter(
      0,
      internal.dashboard.cleanupDeletedLocationDashboards,
      { organizationId: auth.organizationId, locationId: location._id },
    );
    await ctx.scheduler.runAfter(
      0,
      internal.dashboard.cleanupDeletedLocationShares,
      { organizationId: auth.organizationId, locationId: location._id },
    );
    await recordAudit(ctx, auth, {
      action: "locations.deleted",
      entityTable: "locations",
      entityId: location._id,
      summary: `Lokationen ${location.name} blev slettet`,
      locationId: location._id,
    });
    await ctx.db.delete("locations", location._id);
    return null;
  },
});

export const replaceOpeningHours = mutation({
  args: { id: v.string(), input: openingHoursInputValidator },
  returns: openingHoursValidator,
  handler: async (ctx, args) => {
    const auth = await requireLocationApiKey(ctx);
    await requireRestApiMutation(ctx, auth);
    const location = await findOwnedLocation(ctx, auth.organizationId, args.id);
    requireLocationAccess(auth, location._id);
    const openingHours = await applyOpeningHours(
      ctx,
      auth.organizationId,
      location,
      args.input,
    );
    await recordAudit(ctx, auth, {
      action: "locations.openingHoursUpdated",
      entityTable: "locations",
      entityId: location._id,
      summary: `Åbningstiderne for ${location.name} blev ændret`,
      locationId: location._id,
    });
    return openingHours;
  },
});
