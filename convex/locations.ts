import { ConvexError, v } from "convex/values";
import { DEFAULT_WEEKLY_OPENING_HOURS, MAX_SPECIAL_OPENING_DATES } from "../lib/count-window";
import { internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  requireLocationAccess,
  requireLocationManager,
  requireTransferManager,
} from "./lib/auth";
import {
  openingHoursModeValidator,
  specialOpeningHoursValidator,
  weeklyOpeningHoursValidator,
} from "./lib/openingHours";
import {
  deleteLocationWithAuth,
  locationDeletionMessage,
} from "./lib/locationDeletion";
import {
  createLocationWithAuth,
  setOpeningHoursWithAuth,
  throwHumanLocationMutationError,
  updateLocationWithAuth,
} from "./lib/locationMutations";

const MAX_LOCATIONS = 200;
// Bounded batch so deleteLocation can finish without blowing the mutation budget;
// self-reschedules until salesOrders/salesLines/salesDaily are gone.
const LOCATION_SALES_CLEANUP_BATCH = 500;

const locationOptionValidator = v.object({
  id: v.id("locations"),
  name: v.string(),
});

const locationAdminValidator = locationOptionValidator.extend({
  inUse: v.boolean(),
});

export async function listScopedLocationOptions(
  ctx: QueryCtx,
  organizationId: string,
  locationScope: { all: boolean; ids: ReadonlySet<Id<"locations">> },
) {
  const locations = await ctx.db
    .query("locations")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q.eq("organizationId", organizationId),
    )
    .take(MAX_LOCATIONS);

  return locations
    .filter(
      (location) =>
        locationScope.all || locationScope.ids.has(location._id),
    )
    .map((location) => ({
      id: location._id,
      name: location.name,
    }));
}

const openingHoursSettingsValidator = v.object({
  mode: openingHoursModeValidator,
  weekly: v.array(weeklyOpeningHoursValidator),
  specials: v.array(specialOpeningHoursValidator),
});

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

const locationDetailsValidator = v.object({
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

export const listLocations = query({
  args: {},
  returns: v.array(locationAdminValidator),
  handler: async (ctx) => {
    const auth = await requireLocationManager(ctx);
    const { organizationId } = auth;
    const locations = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_LOCATIONS);

    return await Promise.all(
      locations
        .filter(
          (location) =>
            auth.locationScope.all || auth.locationScope.ids.has(location._id),
        )
        .map(async (location) => {
          const [usedAsFrom, usedAsTo, count, stock] = await Promise.all([
            ctx.db
              .query("transfers")
              .withIndex("by_organizationId_and_fromLocationId", (q) =>
                q
                  .eq("organizationId", organizationId)
                  .eq("fromLocationId", location._id),
              )
              .first(),
            ctx.db
              .query("transfers")
              .withIndex("by_organizationId_and_toLocationId", (q) =>
                q
                  .eq("organizationId", organizationId)
                  .eq("toLocationId", location._id),
              )
              .first(),
            ctx.db
              .query("counts")
              .withIndex(
                "by_organizationId_and_locationId_and_periodKey",
                (q) =>
                  q
                    .eq("organizationId", organizationId)
                    .eq("locationId", location._id),
              )
              .first(),
            ctx.db
              .query("locationStock")
              .withIndex(
                "by_organizationId_and_locationId_and_productId",
                (q) =>
                  q
                    .eq("organizationId", organizationId)
                    .eq("locationId", location._id),
              )
              .first(),
          ]);
          return {
            id: location._id,
            name: location.name,
            inUse: Boolean(usedAsFrom || usedAsTo || count || stock),
          };
        }),
    );
  },
});

export const listAllLocationOptions = query({
  args: {},
  returns: v.array(locationOptionValidator),
  handler: async (ctx) => {
    const { organizationId } = await requireTransferManager(
      ctx,
      "transfers.new",
    );
    const locations = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_LOCATIONS);
    return locations.map((location) => ({
      id: location._id,
      name: location.name,
    }));
  },
});

export const getLocationDetails = query({
  args: { locationId: v.id("locations") },
  returns: locationDetailsValidator,
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    const location = await ctx.db.get("locations", args.locationId);
    if (!location || location.organizationId !== organizationId) {
      throw new ConvexError("Lokationen blev ikke fundet");
    }
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
  },
});

export const getOpeningHours = query({
  args: { locationId: v.id("locations") },
  returns: openingHoursSettingsValidator,
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    const location = await ctx.db.get("locations", args.locationId);
    if (!location || location.organizationId !== organizationId) {
      throw new ConvexError("Lokationen blev ikke fundet");
    }
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
      throw new ConvexError("Lokationen har for mange særlige åbningstider");
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
  },
});

export const setOpeningHours = mutation({
  args: {
    locationId: v.id("locations"),
    mode: openingHoursModeValidator,
    weekly: v.array(weeklyOpeningHoursValidator),
    specials: v.array(specialOpeningHoursValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    try {
      await setOpeningHoursWithAuth(ctx, auth, {
        locationId: args.locationId,
        mode: args.mode,
        weekly: args.weekly,
        specials: args.specials,
      });
    } catch (error) {
      throwHumanLocationMutationError(error);
    }
    return null;
  },
});

export const createLocation = mutation({
  args: { name: v.string() },
  returns: v.id("locations"),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    try {
      return await createLocationWithAuth(ctx, auth, { name: args.name });
    } catch (error) {
      throwHumanLocationMutationError(error);
    }
  },
});

export const renameLocation = mutation({
  args: { locationId: v.id("locations"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    try {
      await updateLocationWithAuth(ctx, auth, {
        locationId: args.locationId,
        name: args.name,
      });
    } catch (error) {
      throwHumanLocationMutationError(error);
    }
    return null;
  },
});

export const updateLocation = mutation({
  args: {
    locationId: v.id("locations"),
    marketId: v.union(v.id("markets"), v.null()),
    legalEntityId: v.union(v.id("legalEntities"), v.null()),
    operatorId: v.union(v.id("operators"), v.null()),
    ownershipType: v.union(ownershipTypeValidator, v.null()),
    conceptVersion: v.union(v.string(), v.null()),
    openedAt: v.union(v.number(), v.null()),
    currency: v.union(v.string(), v.null()),
    timeZone: v.union(v.string(), v.null()),
    status: v.union(locationStatusValidator, v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    try {
      await updateLocationWithAuth(ctx, auth, { ...args });
    } catch (error) {
      throwHumanLocationMutationError(error);
    }
    return null;
  },
});

export const deleteLocation = mutation({
  args: { locationId: v.id("locations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    const result = await deleteLocationWithAuth(ctx, auth, args.locationId);
    if (result.kind === "notFound") {
      throw new ConvexError("Lokationen blev ikke fundet");
    }
    if (result.kind === "blocked") {
      throw new ConvexError(locationDeletionMessage(result.reason));
    }
    return null;
  },
});

export const cleanupLocationSales = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Refuse to wipe sales for a location that still exists — scheduler args
    // alone are not proof the deleteLocation path ran.
    const location = await ctx.db.get("locations", args.locationId);
    if (location) return null;
    const lines = await ctx.db
      .query("salesLines")
      .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("locationId", args.locationId),
      )
      .take(LOCATION_SALES_CLEANUP_BATCH);
    for (const row of lines) {
      await ctx.db.delete("salesLines", row._id);
    }
    if (lines.length === LOCATION_SALES_CLEANUP_BATCH) {
      await ctx.scheduler.runAfter(
        0,
        internal.locations.cleanupLocationSales,
        args,
      );
      return null;
    }

    const orders = await ctx.db
      .query("salesOrders")
      .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("locationId", args.locationId),
      )
      .take(LOCATION_SALES_CLEANUP_BATCH);
    for (const row of orders) {
      await ctx.db.delete("salesOrders", row._id);
    }
    if (orders.length === LOCATION_SALES_CLEANUP_BATCH) {
      await ctx.scheduler.runAfter(
        0,
        internal.locations.cleanupLocationSales,
        args,
      );
      return null;
    }

    const daily = await ctx.db
      .query("salesDaily")
      .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("locationId", args.locationId),
      )
      .take(LOCATION_SALES_CLEANUP_BATCH);
    for (const row of daily) {
      await ctx.db.delete("salesDaily", row._id);
    }
    if (daily.length === LOCATION_SALES_CLEANUP_BATCH) {
      await ctx.scheduler.runAfter(
        0,
        internal.locations.cleanupLocationSales,
        args,
      );
    }
    return null;
  },
});
