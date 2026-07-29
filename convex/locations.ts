import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOrganization, requireTransferManager } from "./lib/auth";

const MAX_NAME_LENGTH = 100;
const MAX_LOCATIONS = 200;

const locationOptionValidator = v.object({
  id: v.id("locations"),
  name: v.string(),
});

const locationAdminValidator = locationOptionValidator.extend({
  inUse: v.boolean(),
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

export const listLocations = query({
  args: {},
  returns: v.array(locationAdminValidator),
  handler: async (ctx) => {
    const { organizationId } = await requireTransferManager(ctx);
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

export const createLocation = mutation({
  args: { name: v.string() },
  returns: v.id("locations"),
  handler: async (ctx, args) => {
    const { organizationId } = await requireTransferManager(ctx);
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
    });
  },
});

export const renameLocation = mutation({
  args: { locationId: v.id("locations"), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireTransferManager(ctx);
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
    const { organizationId } = await requireTransferManager(ctx);
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
      throw new ConvexError("Locationen har optællinger eller lagerbeholdning");
    }
    await ctx.db.delete("locations", location._id);
    return null;
  },
});
