import { ConvexError, v } from "convex/values";
import {
  DEFAULT_WEEKLY_OPENING_HOURS,
  MAX_SPECIAL_OPENING_DATES,
} from "../lib/count-window";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import {
  requireCatalogManager,
  requireOrganization,
} from "./lib/auth";
import {
  openingHoursModeValidator,
  specialOpeningHoursValidator,
  weeklyOpeningHoursValidator,
} from "./lib/openingHours";

const MAX_NAME_LENGTH = 100;
const MAX_LOCATIONS = 200;
// Bounded batch so deleteLocation can finish without blowing the mutation budget;
// self-reschedules until salesOrders/salesLines/salesDaily are gone.
const LOCATION_SALES_CLEANUP_BATCH = 50;

const locationOptionValidator = v.object({
  id: v.id("locations"),
  name: v.string(),
});

const locationAdminValidator = locationOptionValidator.extend({
  inUse: v.boolean(),
});

const openingHoursSettingsValidator = v.object({
  mode: openingHoursModeValidator,
  weekly: v.array(weeklyOpeningHoursValidator),
  specials: v.array(specialOpeningHoursValidator),
});

function normalizeName(value: string, label: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new ConvexError(`${label} skal udfyldes`);
  if (name.length > MAX_NAME_LENGTH) {
    throw new ConvexError(
      `${label} må højst være ${MAX_NAME_LENGTH} tegn`,
    );
  }
  return { name, normalizedName: name.toLocaleLowerCase("da") };
}

function requireMinuteOfDay(value: number) {
  if (!Number.isInteger(value) || value < 0 || value >= 24 * 60) {
    throw new ConvexError("Tidspunktet er ugyldigt");
  }
}

function requireHours(hours: {
  closed: boolean;
  openMinuteOfDay: number;
  closeMinuteOfDay: number;
}) {
  requireMinuteOfDay(hours.openMinuteOfDay);
  requireMinuteOfDay(hours.closeMinuteOfDay);
  if (
    !hours.closed &&
    hours.openMinuteOfDay === hours.closeMinuteOfDay
  ) {
    throw new ConvexError("Åbnings- og lukketid skal være forskellige");
  }
}

function requireDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new ConvexError("Datoen er ugyldig");
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    throw new ConvexError("Datoen er ugyldig");
  }
}

function requireOpeningHours(
  mode: "sameEveryDay" | "byWeekday",
  weekly: Array<{
    weekday: number;
    closed: boolean;
    openMinuteOfDay: number;
    closeMinuteOfDay: number;
  }>,
  specials: Array<{
    date: string;
    closed: boolean;
    openMinuteOfDay: number;
    closeMinuteOfDay: number;
  }>,
) {
  if (
    weekly.length !== 7 ||
    new Set(weekly.map((hours) => hours.weekday)).size !== 7 ||
    weekly.some(
      (hours) =>
        !Number.isInteger(hours.weekday) ||
        hours.weekday < 0 ||
        hours.weekday > 6,
    )
  ) {
    throw new ConvexError("Ugens åbningstider er ugyldige");
  }
  for (const hours of weekly) requireHours(hours);
  if (weekly.every((hours) => hours.closed)) {
    throw new ConvexError("Mindst én ugedag skal være åben");
  }
  if (mode === "sameEveryDay") {
    const first = weekly[0];
    if (
      weekly.some(
        (hours) =>
          hours.closed !== first.closed ||
          hours.openMinuteOfDay !== first.openMinuteOfDay ||
          hours.closeMinuteOfDay !== first.closeMinuteOfDay,
      )
    ) {
      throw new ConvexError("Alle dage skal have samme åbningstid");
    }
  }
  if (specials.length > MAX_SPECIAL_OPENING_DATES) {
    throw new ConvexError(
      `Der kan højst tilføjes ${MAX_SPECIAL_OPENING_DATES} særlige datoer`,
    );
  }
  if (new Set(specials.map((hours) => hours.date)).size !== specials.length) {
    throw new ConvexError("Hver særlig dato må kun tilføjes én gang");
  }
  for (const hours of specials) {
    requireDate(hours.date);
    requireHours(hours);
  }
}

export const listLocations = query({
  args: {},
  returns: v.array(locationAdminValidator),
  handler: async (ctx) => {
    const { organizationId } = await requireCatalogManager(ctx);
    const locations = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_LOCATIONS);

    return await Promise.all(
      locations.map(async (location) => {
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
            .withIndex("by_organizationId_and_locationId_and_periodKey", (q) =>
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

export const listLocationOptions = query({
  args: {},
  returns: v.array(locationOptionValidator),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganization(ctx);
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

export const getOpeningHours = query({
  args: { locationId: v.id("locations") },
  returns: openingHoursSettingsValidator,
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
    const location = await ctx.db.get("locations", args.locationId);
    if (!location || location.organizationId !== organizationId) {
      throw new ConvexError("Locationen blev ikke fundet");
    }
    const [specials, legacySettings] = await Promise.all([
      ctx.db
        .query("locationSpecialOpeningHours")
        .withIndex("by_organizationId_and_locationId_and_date", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("locationId", location._id),
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
      throw new ConvexError("Locationen har for mange særlige åbningstider");
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
    const { organizationId } = await requireCatalogManager(ctx);
    const location = await ctx.db.get("locations", args.locationId);
    if (!location || location.organizationId !== organizationId) {
      throw new ConvexError("Locationen blev ikke fundet");
    }
    requireOpeningHours(args.mode, args.weekly, args.specials);

    const currentSpecials = await ctx.db
      .query("locationSpecialOpeningHours")
      .withIndex("by_organizationId_and_locationId_and_date", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", location._id),
      )
      .take(MAX_SPECIAL_OPENING_DATES + 1);
    if (currentSpecials.length > MAX_SPECIAL_OPENING_DATES) {
      throw new ConvexError("Locationen har for mange særlige åbningstider");
    }

    await ctx.db.patch("locations", location._id, {
      openingHoursMode: args.mode,
      weeklyOpeningHours: [...args.weekly].sort(
        (left, right) => left.weekday - right.weekday,
      ),
    });

    const currentByDate = new Map(
      currentSpecials.map((hours) => [hours.date, hours]),
    );
    for (const hours of args.specials) {
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
    return null;
  },
});

export const createLocation = mutation({
  args: { name: v.string() },
  returns: v.id("locations"),
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
    const locations = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_LOCATIONS);
    if (locations.length >= MAX_LOCATIONS) {
      throw new ConvexError(
        `Organisationen kan højst have ${MAX_LOCATIONS} locations`,
      );
    }

    const { name, normalizedName } = normalizeName(
      args.name,
      "Navnet på locationen",
    );
    const existing = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("normalizedName", normalizedName),
      )
      .unique();
    if (existing) throw new ConvexError("Locationen findes allerede");
    return await ctx.db.insert("locations", {
      organizationId,
      name,
      normalizedName,
      openingHoursMode: "sameEveryDay",
      weeklyOpeningHours: DEFAULT_WEEKLY_OPENING_HOURS,
    });
  },
});

export const renameLocation = mutation({
  args: { locationId: v.id("locations"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
    const location = await ctx.db.get("locations", args.locationId);
    if (!location || location.organizationId !== organizationId) {
      throw new ConvexError("Locationen blev ikke fundet");
    }
    const { name, normalizedName } = normalizeName(
      args.name,
      "Navnet på locationen",
    );
    const existing = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("normalizedName", normalizedName),
      )
      .unique();
    if (existing && existing._id !== location._id) {
      throw new ConvexError("Locationen findes allerede");
    }
    await ctx.db.patch("locations", location._id, { name, normalizedName });
    return null;
  },
});

export const deleteLocation = mutation({
  args: { locationId: v.id("locations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireCatalogManager(ctx);
    const location = await ctx.db.get("locations", args.locationId);
    if (!location || location.organizationId !== organizationId) {
      throw new ConvexError("Locationen blev ikke fundet");
    }
    const usedAsFrom = await ctx.db
      .query("transfers")
      .withIndex("by_organizationId_and_fromLocationId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("fromLocationId", location._id),
      )
      .first();
    const usedAsTo = usedAsFrom
      ? null
      : await ctx.db
          .query("transfers")
          .withIndex("by_organizationId_and_toLocationId", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("toLocationId", location._id),
          )
          .first();
    if (usedAsFrom || usedAsTo) {
      throw new ConvexError("Locationen er stadig i brug");
    }
    const count = await ctx.db
      .query("counts")
      .withIndex("by_organizationId_and_locationId_and_periodKey", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", location._id),
      )
      .first();
    const stock = count
      ? null
      : await ctx.db
          .query("locationStock")
          .withIndex(
            "by_organizationId_and_locationId_and_productId",
            (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("locationId", location._id),
          )
          .first();
    if (count || stock) {
      throw new ConvexError("Locationen har counts eller lagerbeholdning");
    }
    const specialOpeningHours = await ctx.db
      .query("locationSpecialOpeningHours")
      .withIndex("by_organizationId_and_locationId_and_date", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", location._id),
      )
      .take(MAX_SPECIAL_OPENING_DATES + 1);
    if (specialOpeningHours.length > MAX_SPECIAL_OPENING_DATES) {
      throw new ConvexError("Locationen har for mange særlige åbningstider");
    }
    for (const hours of specialOpeningHours) {
      await ctx.db.delete("locationSpecialOpeningHours", hours._id);
    }
    const onlinePosConnection = await ctx.db
      .query("onlinePosLocationIntegrations")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", location._id),
      )
      .unique();
    if (onlinePosConnection) {
      await ctx.db.delete(
        "onlinePosLocationIntegrations",
        onlinePosConnection._id,
      );
    }
    const workfeedMapping = await ctx.db
      .query("workfeedLocationMappings")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", location._id),
      )
      .unique();
    if (workfeedMapping) {
      await ctx.db.delete("workfeedLocationMappings", workfeedMapping._id);
    }
    const syncStatus = await ctx.db
      .query("onlinePosSyncStatus")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", location._id),
      )
      .unique();
    if (syncStatus) {
      await ctx.db.delete("onlinePosSyncStatus", syncStatus._id);
    }
    // Sales tables can exceed one mutation; finish asynchronously so orphans
    // cannot keep feeding the dashboard. Modeled on waste.cleanupProductData.
    await ctx.scheduler.runAfter(0, internal.locations.cleanupLocationSales, {
      organizationId,
      locationId: location._id,
    });
    await ctx.db.delete("locations", location._id);
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
