import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireTransferManager } from "./lib/auth";

const MAX_NAME_LENGTH = 100;
const MAX_LOCATIONS = 200;

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
  handler: async (ctx) => {
    const { organizationId } = await requireTransferManager(ctx);
    const locations = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_LOCATIONS);

    return await Promise.all(
      locations.map(async (location) => ({
        id: location._id,
        name: location.name,
        inUse: Boolean(
          (await ctx.db
            .query("transfers")
            .withIndex("by_organizationId_and_fromLocationId", (q) =>
              q
                .eq("organizationId", organizationId)
                .eq("fromLocationId", location._id),
            )
            .first()) ||
            (await ctx.db
              .query("transfers")
              .withIndex("by_organizationId_and_toLocationId", (q) =>
                q
                  .eq("organizationId", organizationId)
                  .eq("toLocationId", location._id),
              )
              .first()),
        ),
      })),
    );
  },
});

export const createLocation = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const { organizationId } = await requireTransferManager(ctx);
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
    await ctx.db.delete("locations", location._id);
    return null;
  },
});
