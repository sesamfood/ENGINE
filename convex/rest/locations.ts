import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import {
  DEFAULT_WEEKLY_OPENING_HOURS,
  MAX_SPECIAL_OPENING_DATES,
} from "../../lib/count-window";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import {
  requireAllLocationAccess,
  requireLocationAccess,
  requireLocationManager,
  type OrganizationAuth,
} from "../lib/auth";
import { runIdempotent } from "../lib/idempotency";
import {
  deleteLocationWithAuth,
  restLocationDeletionMessage,
} from "../lib/locationDeletion";
import {
  createLocationWithAuth,
  setOpeningHoursWithAuth,
  throwRestLocationMutationError,
  updateLocationWithAuth,
  type LocationOpeningHours,
} from "../lib/locationMutations";
import { requireRestApiMutation } from "./lib";
import {
  openingHoursModeValidator,
  specialOpeningHoursValidator,
  weeklyOpeningHoursValidator,
} from "../lib/openingHours";

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

async function readOpeningHours(
  ctx: LocationContext,
  organizationId: string,
  location: Doc<"locations">,
): Promise<LocationOpeningHours> {
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
        let id: Id<"locations">;
        try {
          id = await createLocationWithAuth(ctx, auth, {
            name: args.input.name,
            marketId: args.input.marketId,
            legalEntityId: args.input.legalEntityId,
            operatorId: args.input.operatorId,
            ownershipType: args.input.ownershipType,
            conceptVersion: args.input.conceptVersion,
            openedAt: args.input.openedAt,
            currency: args.input.currency,
            timeZone: args.input.timeZone,
            status: args.input.status,
          });
        } catch (error) {
          throwRestLocationMutationError(error);
        }
        const location = await ctx.db.get("locations", id);
        if (!location) restError("location_not_found", "Location was not found.");
        const dto = toLocationDto(location);
        const data = {
          ...dto,
          openedAt:
            dto.openedAt === null ? null : new Date(dto.openedAt).toISOString(),
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
    try {
      await updateLocationWithAuth(ctx, auth, {
        locationId,
        name: args.input.name,
        marketId: args.input.marketId,
        legalEntityId: args.input.legalEntityId,
        operatorId: args.input.operatorId,
        ownershipType: args.input.ownershipType,
        conceptVersion: args.input.conceptVersion,
        openedAt: args.input.openedAt,
        currency: args.input.currency,
        timeZone: args.input.timeZone,
        status: args.input.status,
      });
    } catch (error) {
      throwRestLocationMutationError(error);
    }
    const updated = await ctx.db.get("locations", locationId);
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
    const result = await deleteLocationWithAuth(ctx, auth, locationId);
    if (result.kind === "notFound") {
      restError("location_not_found", "Location was not found.");
    }
    if (result.kind === "blocked") {
      if (result.reason === "kiosk") {
        restError(
          "location_kiosk_dependency",
          restLocationDeletionMessage(result.reason),
        );
      }
      if (result.reason === "openingHours") {
        restError(
          "opening_hours_invalid",
          restLocationDeletionMessage(result.reason),
        );
      }
      restError(
        "location_in_use",
        restLocationDeletionMessage(result.reason),
      );
    }
    return null;
  },
});

export const replaceOpeningHours = mutation({
  args: { id: v.string(), input: openingHoursInputValidator },
  returns: openingHoursValidator,
  handler: async (ctx, args) => {
    const auth = await requireLocationApiKey(ctx);
    await requireRestApiMutation(ctx, auth);
    const locationId = ctx.db.normalizeId("locations", args.id);
    if (!locationId) restError("location_not_found", "Location was not found.");
    try {
      return await setOpeningHoursWithAuth(ctx, auth, {
        locationId,
        mode: args.input.mode,
        weekly: args.input.weekly,
        specials: args.input.specials,
      });
    } catch (error) {
      throwRestLocationMutationError(error);
    }
  },
});
