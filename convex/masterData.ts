import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireLocationManager } from "./lib/auth";
import {
  normalizeMasterDataName,
  optionalText,
  requireCurrency,
} from "./lib/masterData";
import {
  requireTimeZone,
  resolveTimeZone,
  scheduleLocationDayStartReroll,
} from "./lib/timeZone";

const MAX_ROWS = 200;
const operatorStatusValidator = v.union(
  v.literal("active"),
  v.literal("inactive"),
);

const marketValidator = v.object({
  id: v.id("markets"),
  name: v.string(),
  currency: v.union(v.string(), v.null()),
  timeZone: v.union(v.string(), v.null()),
});

const legalEntityValidator = v.object({
  id: v.id("legalEntities"),
  name: v.string(),
  registrationNumber: v.union(v.string(), v.null()),
});

const operatorValidator = v.object({
  id: v.id("operators"),
  name: v.string(),
  legalEntityId: v.union(v.id("legalEntities"), v.null()),
  contactEmail: v.union(v.string(), v.null()),
  status: operatorStatusValidator,
});

async function requireLegalEntity(
  ctx: MutationCtx,
  organizationId: string,
  legalEntityId: Id<"legalEntities"> | null | undefined,
) {
  if (!legalEntityId) return undefined;
  const legalEntity = await ctx.db.get("legalEntities", legalEntityId);
  if (!legalEntity || legalEntity.organizationId !== organizationId) {
    throw new ConvexError("Den juridiske enhed blev ikke fundet");
  }
  return legalEntity._id;
}

function requireContactEmail(value: string | null | undefined) {
  const email = optionalText(value);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ConvexError("Kontaktmailen er ugyldig");
  }
  return email;
}

export const listMarkets = query({
  args: {},
  returns: v.array(marketValidator),
  handler: async (ctx) => {
    const { organizationId } = await requireLocationManager(ctx);
    const rows = await ctx.db
      .query("markets")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_ROWS);
    return rows.map((row) => ({
      id: row._id,
      name: row.name,
      currency: row.currency ?? null,
      timeZone: row.timeZone ?? null,
    }));
  },
});

export const createMarket = mutation({
  args: {
    name: v.string(),
    currency: v.optional(v.union(v.string(), v.null())),
    timeZone: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.id("markets"),
  handler: async (ctx, args) => {
    const { organizationId } = await requireLocationManager(ctx);
    const { name, normalizedName } = normalizeMasterDataName(
      args.name,
      "Markedsnavnet",
    );
    const existing = await ctx.db
      .query("markets")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("normalizedName", normalizedName),
      )
      .unique();
    if (existing) throw new ConvexError("Markedet findes allerede");
    return await ctx.db.insert("markets", {
      organizationId,
      name,
      normalizedName,
      currency: requireCurrency(args.currency),
      timeZone: requireTimeZone(args.timeZone),
    });
  },
});

export const updateMarket = mutation({
  args: {
    marketId: v.id("markets"),
    name: v.string(),
    currency: v.optional(v.union(v.string(), v.null())),
    timeZone: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireLocationManager(ctx);
    const market = await ctx.db.get("markets", args.marketId);
    if (!market || market.organizationId !== organizationId) {
      throw new ConvexError("Markedet blev ikke fundet");
    }
    const { name, normalizedName } = normalizeMasterDataName(
      args.name,
      "Markedsnavnet",
    );
    const existing = await ctx.db
      .query("markets")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("normalizedName", normalizedName),
      )
      .unique();
    if (existing && existing._id !== market._id) {
      throw new ConvexError("Markedet findes allerede");
    }
    const locations = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_marketId", (q) =>
        q.eq("organizationId", organizationId).eq("marketId", market._id),
      )
      .take(MAX_ROWS + 1);
    if (locations.length > MAX_ROWS) {
      throw new ConvexError("Markedet har for mange lokationer");
    }
    const inheritedLocations = locations.filter(
      (location) => !location.timeZone,
    );
    const previousTimeZones = await Promise.all(
      inheritedLocations.map((location) =>
        resolveTimeZone(ctx, organizationId, location._id),
      ),
    );
    const timeZone = requireTimeZone(args.timeZone);
    await ctx.db.patch("markets", market._id, {
      name,
      normalizedName,
      currency: requireCurrency(args.currency),
      timeZone,
    });
    for (const [index, location] of inheritedLocations.entries()) {
      const nextTimeZone = await resolveTimeZone(
        ctx,
        organizationId,
        location._id,
      );
      if (nextTimeZone !== previousTimeZones[index]) {
        await scheduleLocationDayStartReroll(
          ctx,
          organizationId,
          location._id,
          nextTimeZone,
        );
      }
    }
    return null;
  },
});

export const deleteMarket = mutation({
  args: { marketId: v.id("markets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireLocationManager(ctx);
    const market = await ctx.db.get("markets", args.marketId);
    if (!market || market.organizationId !== organizationId) {
      throw new ConvexError("Markedet blev ikke fundet");
    }
    const location = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_marketId", (q) =>
        q.eq("organizationId", organizationId).eq("marketId", market._id),
      )
      .first();
    if (location) {
      throw new ConvexError(
        "Markedet bruges af en lokation og kan ikke slettes",
      );
    }
    await ctx.db.delete("markets", market._id);
    return null;
  },
});

export const listLegalEntities = query({
  args: {},
  returns: v.array(legalEntityValidator),
  handler: async (ctx) => {
    const { organizationId } = await requireLocationManager(ctx);
    const rows = await ctx.db
      .query("legalEntities")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_ROWS);
    return rows.map((row) => ({
      id: row._id,
      name: row.name,
      registrationNumber: row.registrationNumber ?? null,
    }));
  },
});

export const createLegalEntity = mutation({
  args: {
    name: v.string(),
    registrationNumber: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.id("legalEntities"),
  handler: async (ctx, args) => {
    const { organizationId } = await requireLocationManager(ctx);
    const { name, normalizedName } = normalizeMasterDataName(
      args.name,
      "Navnet på den juridiske enhed",
    );
    const existing = await ctx.db
      .query("legalEntities")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("normalizedName", normalizedName),
      )
      .unique();
    if (existing) throw new ConvexError("Den juridiske enhed findes allerede");
    return await ctx.db.insert("legalEntities", {
      organizationId,
      name,
      normalizedName,
      registrationNumber: optionalText(args.registrationNumber),
    });
  },
});

export const updateLegalEntity = mutation({
  args: {
    legalEntityId: v.id("legalEntities"),
    name: v.string(),
    registrationNumber: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireLocationManager(ctx);
    const legalEntity = await ctx.db.get("legalEntities", args.legalEntityId);
    if (!legalEntity || legalEntity.organizationId !== organizationId) {
      throw new ConvexError("Den juridiske enhed blev ikke fundet");
    }
    const { name, normalizedName } = normalizeMasterDataName(
      args.name,
      "Navnet på den juridiske enhed",
    );
    const existing = await ctx.db
      .query("legalEntities")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("normalizedName", normalizedName),
      )
      .unique();
    if (existing && existing._id !== legalEntity._id) {
      throw new ConvexError("Den juridiske enhed findes allerede");
    }
    await ctx.db.patch("legalEntities", legalEntity._id, {
      name,
      normalizedName,
      registrationNumber: optionalText(args.registrationNumber),
    });
    return null;
  },
});

export const deleteLegalEntity = mutation({
  args: { legalEntityId: v.id("legalEntities") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireLocationManager(ctx);
    const legalEntity = await ctx.db.get("legalEntities", args.legalEntityId);
    if (!legalEntity || legalEntity.organizationId !== organizationId) {
      throw new ConvexError("Den juridiske enhed blev ikke fundet");
    }
    const [location, operator] = await Promise.all([
      ctx.db
        .query("locations")
        .withIndex("by_organizationId_and_legalEntityId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("legalEntityId", legalEntity._id),
        )
        .first(),
      ctx.db
        .query("operators")
        .withIndex("by_organizationId_and_legalEntityId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("legalEntityId", legalEntity._id),
        )
        .first(),
    ]);
    if (location || operator) {
      throw new ConvexError(
        "Den juridiske enhed er i brug og kan ikke slettes",
      );
    }
    await ctx.db.delete("legalEntities", legalEntity._id);
    return null;
  },
});

export const listOperators = query({
  args: {},
  returns: v.array(operatorValidator),
  handler: async (ctx) => {
    const { organizationId } = await requireLocationManager(ctx);
    const rows = await ctx.db
      .query("operators")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_ROWS);
    return rows.map((row) => ({
      id: row._id,
      name: row.name,
      legalEntityId: row.legalEntityId ?? null,
      contactEmail: row.contactEmail ?? null,
      status: row.status,
    }));
  },
});

export const createOperator = mutation({
  args: {
    name: v.string(),
    legalEntityId: v.optional(v.union(v.id("legalEntities"), v.null())),
    contactEmail: v.optional(v.union(v.string(), v.null())),
    status: operatorStatusValidator,
  },
  returns: v.id("operators"),
  handler: async (ctx, args) => {
    const { organizationId } = await requireLocationManager(ctx);
    const { name, normalizedName } = normalizeMasterDataName(
      args.name,
      "Operatørnavnet",
    );
    const existing = await ctx.db
      .query("operators")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("normalizedName", normalizedName),
      )
      .unique();
    if (existing) throw new ConvexError("Operatøren findes allerede");
    return await ctx.db.insert("operators", {
      organizationId,
      name,
      normalizedName,
      legalEntityId: await requireLegalEntity(
        ctx,
        organizationId,
        args.legalEntityId,
      ),
      contactEmail: requireContactEmail(args.contactEmail),
      status: args.status,
    });
  },
});

export const updateOperator = mutation({
  args: {
    operatorId: v.id("operators"),
    name: v.string(),
    legalEntityId: v.optional(v.union(v.id("legalEntities"), v.null())),
    contactEmail: v.optional(v.union(v.string(), v.null())),
    status: operatorStatusValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireLocationManager(ctx);
    const operator = await ctx.db.get("operators", args.operatorId);
    if (!operator || operator.organizationId !== organizationId) {
      throw new ConvexError("Operatøren blev ikke fundet");
    }
    const { name, normalizedName } = normalizeMasterDataName(
      args.name,
      "Operatørnavnet",
    );
    const existing = await ctx.db
      .query("operators")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("normalizedName", normalizedName),
      )
      .unique();
    if (existing && existing._id !== operator._id) {
      throw new ConvexError("Operatøren findes allerede");
    }
    await ctx.db.patch("operators", operator._id, {
      name,
      normalizedName,
      legalEntityId: await requireLegalEntity(
        ctx,
        organizationId,
        args.legalEntityId,
      ),
      contactEmail: requireContactEmail(args.contactEmail),
      status: args.status,
    });
    return null;
  },
});

export const deleteOperator = mutation({
  args: { operatorId: v.id("operators") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireLocationManager(ctx);
    const operator = await ctx.db.get("operators", args.operatorId);
    if (!operator || operator.organizationId !== organizationId) {
      throw new ConvexError("Operatøren blev ikke fundet");
    }
    const location = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_operatorId", (q) =>
        q.eq("organizationId", organizationId).eq("operatorId", operator._id),
      )
      .first();
    if (location) {
      throw new ConvexError(
        "Operatøren bruges af en lokation og kan ikke slettes",
      );
    }
    const accessRows = await ctx.db
      .query("memberLocationAccess")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect();
    for (const row of accessRows) {
      if (row.scope !== "operator" || row.operatorId !== operator._id) {
        continue;
      }
      await ctx.db.patch("memberLocationAccess", row._id, {
        scope: "selected",
        locationIds: [],
        operatorId: undefined,
        updatedAt: Date.now(),
      });
    }
    await ctx.db.delete("operators", operator._id);
    return null;
  },
});
