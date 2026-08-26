import { ConvexError } from "convex/values";
import {
  DEFAULT_WEEKLY_OPENING_HOURS,
  MAX_SPECIAL_OPENING_DATES,
} from "../../lib/count-window";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  requireAllLocationAccess,
  requireLocationAccess,
  type OrganizationAuth,
} from "./auth";
import { recordAudit } from "./audit";
import {
  requireTimeZone,
  resolveTimeZone,
  scheduleLocationDayStartReroll,
} from "./timeZone";

const MAX_NAME_LENGTH = 100;
const MAX_LOCATIONS = 200;

type OwnershipType = "owned" | "franchise" | "jointVenture" | "license";
type LocationStatus = "planned" | "open" | "temporarilyClosed" | "closed";
type LocationReference = string | null | undefined;

export type LocationOpeningHours = {
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

export type LocationCreateInput = {
  name: string;
  marketId?: LocationReference;
  legalEntityId?: LocationReference;
  operatorId?: LocationReference;
  ownershipType?: OwnershipType | null;
  conceptVersion?: string | null;
  openedAt?: number | null;
  currency?: string | null;
  timeZone?: string | null;
  status?: LocationStatus | null;
};

export type LocationUpdateInput = {
  locationId: Id<"locations">;
  name?: string;
  marketId?: LocationReference;
  legalEntityId?: LocationReference;
  operatorId?: LocationReference;
  ownershipType?: OwnershipType | null;
  conceptVersion?: string | null;
  openedAt?: number | null;
  currency?: string | null;
  timeZone?: string | null;
  status?: LocationStatus | null;
};

export type LocationMutationErrorCode =
  | "locationNotFound"
  | "locationLimitReached"
  | "locationNameInvalid"
  | "locationNameTaken"
  | "marketReferenceInvalid"
  | "legalEntityReferenceInvalid"
  | "operatorReferenceInvalid"
  | "locationOpenedAtInvalid"
  | "locationConceptVersionInvalid"
  | "locationCurrencyInvalid"
  | "locationTimeZoneInvalid"
  | "openingHoursWeeklyInvalid"
  | "openingHoursMinuteInvalid"
  | "openingHoursDifferentInvalid"
  | "openingHoursAllClosed"
  | "openingHoursSameEveryDayInvalid"
  | "openingHoursTooManySpecialDates"
  | "openingHoursStoredTooManySpecialDates"
  | "openingHoursDuplicateSpecialDate"
  | "openingHoursDateInvalid";

export class LocationMutationError extends Error {
  constructor(
    readonly code: LocationMutationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LocationMutationError";
    Object.setPrototypeOf(this, LocationMutationError.prototype);
  }
}

function fail(code: LocationMutationErrorCode, message: string): never {
  throw new LocationMutationError(code, message);
}

export function throwHumanLocationMutationError(error: unknown): never {
  if (!(error instanceof LocationMutationError)) throw error;
  throw new ConvexError(error.message);
}

export function throwRestLocationMutationError(error: unknown): never {
  if (!(error instanceof LocationMutationError)) throw error;
  const rest = {
    locationNotFound: {
      code: "location_not_found",
      message: "Location was not found.",
    },
    locationLimitReached: {
      code: "location_limit_reached",
      message: `An organization may have at most ${MAX_LOCATIONS} locations.`,
    },
    locationNameInvalid: {
      code: "location_name_invalid",
      message: "Name is required and must be at most 100 characters.",
    },
    locationNameTaken: {
      code: "location_name_taken",
      message: "A location with this name already exists.",
    },
    marketReferenceInvalid: {
      code: "market_reference_invalid",
      message: "Market was not found.",
    },
    legalEntityReferenceInvalid: {
      code: "legal_entity_reference_invalid",
      message: "Legal entity was not found.",
    },
    operatorReferenceInvalid: {
      code: "operator_reference_invalid",
      message: "Operator was not found.",
    },
    locationOpenedAtInvalid: {
      code: "location_opened_at_invalid",
      message: "Opened at must be a valid timestamp.",
    },
    locationConceptVersionInvalid: {
      code: "location_concept_version_invalid",
      message: "Concept version must be at most 100 characters.",
    },
    locationCurrencyInvalid: {
      code: "location_currency_invalid",
      message: "Currency must be a three-letter ISO 4217 code.",
    },
    locationTimeZoneInvalid: {
      code: "location_timezone_invalid",
      message: "Time zone is invalid.",
    },
    openingHoursWeeklyInvalid: {
      code: "opening_hours_invalid",
      message: "Weekly opening hours are invalid.",
    },
    openingHoursMinuteInvalid: {
      code: "opening_hours_invalid",
      message: "Opening and closing times must be valid minutes of the day.",
    },
    openingHoursDifferentInvalid: {
      code: "opening_hours_invalid",
      message: "Opening and closing times must be different for an open day.",
    },
    openingHoursAllClosed: {
      code: "opening_hours_invalid",
      message: "At least one weekday must be open.",
    },
    openingHoursSameEveryDayInvalid: {
      code: "opening_hours_invalid",
      message:
        "All weekdays must have the same opening hours in sameEveryDay mode.",
    },
    openingHoursTooManySpecialDates: {
      code: "opening_hours_invalid",
      message: `At most ${MAX_SPECIAL_OPENING_DATES} special opening dates may be supplied.`,
    },
    openingHoursStoredTooManySpecialDates: {
      code: "opening_hours_invalid",
      message: "The location has too many special opening hours.",
    },
    openingHoursDuplicateSpecialDate: {
      code: "opening_hours_invalid",
      message: "Each special opening date may only be supplied once.",
    },
    openingHoursDateInvalid: {
      code: "opening_hours_invalid",
      message: "Special dates are invalid.",
    },
  } satisfies Record<
    LocationMutationErrorCode,
    { code: string; message: string }
  >;
  const mapped = rest[error.code];
  throw new ConvexError(mapped);
}

function normalizeName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) {
    fail("locationNameInvalid", "Navnet på locationen skal udfyldes");
  }
  if (name.length > MAX_NAME_LENGTH) {
    fail(
      "locationNameInvalid",
      `Navnet på locationen må højst være ${MAX_NAME_LENGTH} tegn`,
    );
  }
  return { name, normalizedName: name.toLocaleLowerCase("da") };
}

function normalizeConceptVersion(value: string | null | undefined) {
  const conceptVersion = value?.trim() || undefined;
  if (conceptVersion && conceptVersion.length > MAX_NAME_LENGTH) {
    fail(
      "locationConceptVersionInvalid",
      `Konceptversionen må højst være ${MAX_NAME_LENGTH} tegn`,
    );
  }
  return conceptVersion;
}

function normalizeOpenedAt(value: number | null | undefined) {
  if (value === null || value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) {
    fail("locationOpenedAtInvalid", "Åbningsdatoen er ugyldig");
  }
  return value;
}

function normalizeCurrency(value: string | null | undefined) {
  if (!value) return undefined;
  const currency = value.trim();
  if (!/^[A-Z]{3}$/.test(currency)) {
    fail(
      "locationCurrencyInvalid",
      "Valuta skal være en ISO 4217-kode med tre store bogstaver",
    );
  }
  return currency;
}

function normalizeTimeZone(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    return requireTimeZone(value);
  } catch {
    fail("locationTimeZoneInvalid", "Tidszonen er ugyldig");
  }
}

async function resolveMarketId(
  ctx: MutationCtx,
  organizationId: string,
  value: LocationReference,
) {
  if (value === null || value === undefined) return undefined;
  const id = ctx.db.normalizeId("markets", value);
  const market = id ? await ctx.db.get("markets", id) : null;
  if (!market || market.organizationId !== organizationId) {
    fail("marketReferenceInvalid", "Markedet blev ikke fundet");
  }
  return market._id;
}

async function resolveLegalEntityId(
  ctx: MutationCtx,
  organizationId: string,
  value: LocationReference,
) {
  if (value === null || value === undefined) return undefined;
  const id = ctx.db.normalizeId("legalEntities", value);
  const legalEntity = id ? await ctx.db.get("legalEntities", id) : null;
  if (!legalEntity || legalEntity.organizationId !== organizationId) {
    fail("legalEntityReferenceInvalid", "Den juridiske enhed blev ikke fundet");
  }
  return legalEntity._id;
}

async function resolveOperatorId(
  ctx: MutationCtx,
  organizationId: string,
  value: LocationReference,
) {
  if (value === null || value === undefined) return undefined;
  const id = ctx.db.normalizeId("operators", value);
  const operator = id ? await ctx.db.get("operators", id) : null;
  if (!operator || operator.organizationId !== organizationId) {
    fail("operatorReferenceInvalid", "Operatøren blev ikke fundet");
  }
  return operator._id;
}

async function requireOwnedLocation(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  locationId: Id<"locations">,
) {
  const location = await ctx.db.get("locations", locationId);
  if (!location || location.organizationId !== auth.organizationId) {
    fail("locationNotFound", "Lokationen blev ikke fundet");
  }
  requireLocationAccess(auth, location._id);
  return location;
}

function requireMinuteOfDay(value: number) {
  if (!Number.isInteger(value) || value < 0 || value >= 24 * 60) {
    fail(
      "openingHoursMinuteInvalid",
      "Tidspunktet er ugyldigt",
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
    fail(
      "openingHoursDifferentInvalid",
      "Åbnings- og lukketid skal være forskellige",
    );
  }
}

function requireDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) fail("openingHoursDateInvalid", "Datoen er ugyldig");
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    fail("openingHoursDateInvalid", "Datoen er ugyldig");
  }
}

function validateOpeningHours(input: LocationOpeningHours) {
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
    fail("openingHoursWeeklyInvalid", "Ugens åbningstider er ugyldige");
  }
  for (const hours of input.weekly) requireHours(hours);
  if (input.weekly.every((hours) => hours.closed)) {
    fail("openingHoursAllClosed", "Mindst én ugedag skal være åben");
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
      fail(
        "openingHoursSameEveryDayInvalid",
        "Alle dage skal have samme åbningstid",
      );
    }
  }
  if (input.specials.length > MAX_SPECIAL_OPENING_DATES) {
    fail(
      "openingHoursTooManySpecialDates",
      `Der kan højst tilføjes ${MAX_SPECIAL_OPENING_DATES} særlige datoer`,
    );
  }
  if (
    new Set(input.specials.map((hours) => hours.date)).size !==
    input.specials.length
  ) {
    fail(
      "openingHoursDuplicateSpecialDate",
      "Hver særlig dato må kun tilføjes én gang",
    );
  }
  for (const hours of input.specials) {
    requireDate(hours.date);
    requireHours(hours);
  }
}

export async function createLocationWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  input: LocationCreateInput,
): Promise<Id<"locations">> {
  requireAllLocationAccess(auth);
  const locations = await ctx.db
    .query("locations")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q.eq("organizationId", auth.organizationId),
    )
    .take(MAX_LOCATIONS + 1);
  if (locations.length >= MAX_LOCATIONS) {
    fail(
      "locationLimitReached",
      `Organisationen kan højst have ${MAX_LOCATIONS} locations`,
    );
  }

  const { name, normalizedName } = normalizeName(input.name);
  const existing = await ctx.db
    .query("locations")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q
        .eq("organizationId", auth.organizationId)
        .eq("normalizedName", normalizedName),
    )
    .unique();
  if (existing) {
    fail("locationNameTaken", "Lokationen findes allerede");
  }
  const marketId = await resolveMarketId(
    ctx,
    auth.organizationId,
    input.marketId,
  );
  const legalEntityId = await resolveLegalEntityId(
    ctx,
    auth.organizationId,
    input.legalEntityId,
  );
  const operatorId = await resolveOperatorId(
    ctx,
    auth.organizationId,
    input.operatorId,
  );
  const conceptVersion = normalizeConceptVersion(input.conceptVersion);
  const openedAt = normalizeOpenedAt(input.openedAt);
  const currency = normalizeCurrency(input.currency);
  const timeZone = normalizeTimeZone(input.timeZone);
  const locationId = await ctx.db.insert("locations", {
    organizationId: auth.organizationId,
    name,
    normalizedName,
    marketId,
    legalEntityId,
    operatorId,
    ownershipType: input.ownershipType ?? undefined,
    conceptVersion,
    openedAt,
    currency,
    timeZone,
    status: input.status ?? undefined,
    openingHoursMode: "sameEveryDay",
    weeklyOpeningHours: DEFAULT_WEEKLY_OPENING_HOURS,
  });
  await recordAudit(ctx, auth, {
    action: "locations.created",
    entityTable: "locations",
    entityId: locationId,
    summary: `Lokationen ${name} blev oprettet`,
    locationId,
  });
  return locationId;
}

export async function updateLocationWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  input: LocationUpdateInput,
): Promise<Id<"locations">> {
  const location = await requireOwnedLocation(ctx, auth, input.locationId);
  const nextName =
    input.name === undefined
      ? { name: location.name, normalizedName: location.normalizedName }
      : normalizeName(input.name);
  if (input.name !== undefined) {
    const existing = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("normalizedName", nextName.normalizedName),
      )
      .unique();
    if (existing && existing._id !== location._id) {
      fail("locationNameTaken", "Lokationen findes allerede");
    }
  }

  const previousTimeZone = await resolveTimeZone(
    ctx,
    auth.organizationId,
    location._id,
  );
  const marketId = await resolveMarketId(
    ctx,
    auth.organizationId,
    input.marketId === undefined ? location.marketId : input.marketId,
  );
  const legalEntityId = await resolveLegalEntityId(
    ctx,
    auth.organizationId,
    input.legalEntityId === undefined
      ? location.legalEntityId
      : input.legalEntityId,
  );
  const operatorId = await resolveOperatorId(
    ctx,
    auth.organizationId,
    input.operatorId === undefined ? location.operatorId : input.operatorId,
  );
  const conceptVersion = normalizeConceptVersion(
    input.conceptVersion === undefined
      ? location.conceptVersion
      : input.conceptVersion,
  );
  const openedAt = normalizeOpenedAt(
    input.openedAt === undefined ? location.openedAt : input.openedAt,
  );
  const currency = normalizeCurrency(
    input.currency === undefined ? location.currency : input.currency,
  );
  const timeZone = normalizeTimeZone(
    input.timeZone === undefined ? location.timeZone : input.timeZone,
  );
  await ctx.db.patch("locations", location._id, {
    name: nextName.name,
    normalizedName: nextName.normalizedName,
    marketId,
    legalEntityId,
    operatorId,
    ownershipType:
      input.ownershipType === undefined
        ? location.ownershipType
        : input.ownershipType ?? undefined,
    conceptVersion,
    openedAt,
    currency,
    timeZone,
    status:
      input.status === undefined
        ? location.status
        : input.status ?? undefined,
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
  return location._id;
}

export async function setOpeningHoursWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  input: LocationOpeningHours & { locationId: Id<"locations"> },
): Promise<LocationOpeningHours> {
  const location = await requireOwnedLocation(ctx, auth, input.locationId);
  validateOpeningHours(input);
  const currentSpecials = await ctx.db
    .query("locationSpecialOpeningHours")
    .withIndex("by_organizationId_and_locationId_and_date", (q) =>
      q.eq("organizationId", auth.organizationId).eq("locationId", location._id),
    )
    .take(MAX_SPECIAL_OPENING_DATES + 1);
  if (currentSpecials.length > MAX_SPECIAL_OPENING_DATES) {
    fail(
      "openingHoursStoredTooManySpecialDates",
      "Lokationen har for mange særlige åbningstider",
    );
  }

  const weekly = [...input.weekly].sort(
    (left, right) => left.weekday - right.weekday,
  );
  const specials = [...input.specials].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
  await ctx.db.patch("locations", location._id, {
    openingHoursMode: input.mode,
    weeklyOpeningHours: weekly,
  });

  const currentByDate = new Map(
    currentSpecials.map((hours) => [hours.date, hours]),
  );
  for (const hours of specials) {
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
        organizationId: auth.organizationId,
        locationId: location._id,
        date: hours.date,
        closed: hours.closed,
        openMinuteOfDay: hours.openMinuteOfDay,
        closeMinuteOfDay: hours.closeMinuteOfDay,
      });
    }
  }
  for (const current of currentByDate.values()) {
    await ctx.db.delete("locationSpecialOpeningHours", current._id);
  }
  await recordAudit(ctx, auth, {
    action: "locations.openingHoursUpdated",
    entityTable: "locations",
    entityId: location._id,
    summary: `Åbningstiderne for ${location.name} blev ændret`,
    locationId: location._id,
  });
  return { mode: input.mode, weekly, specials };
}
