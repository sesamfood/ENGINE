import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import {
  requireAllLocationAccess,
  requireLocationManager,
  type OrganizationAuth,
} from "../lib/auth";
import { recordAudit } from "../lib/audit";
import { runIdempotent } from "../lib/idempotency";
import { requireRestApiMutation } from "./lib";
import {
  normalizeMasterDataName,
  optionalText,
  requireCurrency,
} from "../lib/masterData";
import {
  requireTimeZone,
  resolveTimeZone,
  scheduleLocationDayStartReroll,
} from "../lib/timeZone";

const MAX_PAGE_SIZE = 100;
const MAX_LOCATION_ROWS = 200;
const MAX_MEMBER_ACCESS_ROWS = 1_000;

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

const marketCreateInputValidator = v.object({
  name: v.string(),
  currency: v.optional(v.union(v.string(), v.null())),
  timeZone: v.optional(v.union(v.string(), v.null())),
});

const marketPatchInputValidator = v.object({
  name: v.optional(v.string()),
  currency: v.optional(v.union(v.string(), v.null())),
  timeZone: v.optional(v.union(v.string(), v.null())),
});

const legalEntityCreateInputValidator = v.object({
  name: v.string(),
  registrationNumber: v.optional(v.union(v.string(), v.null())),
});

const legalEntityPatchInputValidator = v.object({
  name: v.optional(v.string()),
  registrationNumber: v.optional(v.union(v.string(), v.null())),
});

const operatorCreateInputValidator = v.object({
  name: v.string(),
  legalEntityId: v.optional(v.union(v.string(), v.null())),
  contactEmail: v.optional(v.union(v.string(), v.null())),
  status: v.optional(operatorStatusValidator),
});

const operatorPatchInputValidator = v.object({
  name: v.optional(v.string()),
  legalEntityId: v.optional(v.union(v.string(), v.null())),
  contactEmail: v.optional(v.union(v.string(), v.null())),
  status: v.optional(operatorStatusValidator),
});

const idempotentResponseValidator = v.object({
  status: v.number(),
  json: v.string(),
  replayed: v.boolean(),
});

type MarketDto = {
  id: Id<"markets">;
  name: string;
  currency: string | null;
  timeZone: string | null;
};

type LegalEntityDto = {
  id: Id<"legalEntities">;
  name: string;
  registrationNumber: string | null;
};

type OperatorDto = {
  id: Id<"operators">;
  name: string;
  legalEntityId: Id<"legalEntities"> | null;
  contactEmail: string | null;
  status: "active" | "inactive";
};

type ResourceName = "market" | "legal_entity" | "operator";

function restError(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

function requirePageSize(numItems: number) {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > MAX_PAGE_SIZE) {
    restError(
      "page_size_invalid",
      "Page size must be an integer between 1 and 100.",
    );
  }
}

function normalizeName(value: string, resource: ResourceName) {
  const labels: Record<ResourceName, string> = {
    market: "Markedsnavnet",
    legal_entity: "Navnet på den juridiske enhed",
    operator: "Operatørnavnet",
  };
  try {
    return normalizeMasterDataName(value, labels[resource]);
  } catch {
    restError(
      `${resource}_name_invalid`,
      "Name is required and must be at most 100 characters.",
    );
  }
}

function normalizeCurrency(value: string | null | undefined) {
  try {
    return requireCurrency(value);
  } catch {
    restError(
      "market_currency_invalid",
      "Currency must be a three-letter ISO 4217 code.",
    );
  }
}

function normalizeTimeZone(value: string | null | undefined) {
  try {
    return requireTimeZone(value);
  } catch {
    restError("market_timezone_invalid", "Time zone is invalid.");
  }
}

function normalizeContactEmail(value: string | null | undefined) {
  const email = optionalText(value);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    restError("operator_contact_email_invalid", "Contact email is invalid.");
  }
  return email;
}

function requireApiKeyPrincipal(auth: OrganizationAuth) {
  if (auth.principalKind !== "apiKey" || !auth.apiKeyId) {
    restError("api_key_required", "An API key is required for this operation.");
  }
}

function toMarketDto(row: Doc<"markets">): MarketDto {
  return {
    id: row._id,
    name: row.name,
    currency: row.currency ?? null,
    timeZone: row.timeZone ?? null,
  };
}

function toLegalEntityDto(row: Doc<"legalEntities">): LegalEntityDto {
  return {
    id: row._id,
    name: row.name,
    registrationNumber: row.registrationNumber ?? null,
  };
}

function toOperatorDto(row: Doc<"operators">): OperatorDto {
  return {
    id: row._id,
    name: row.name,
    legalEntityId: row.legalEntityId ?? null,
    contactEmail: row.contactEmail ?? null,
    status: row.status,
  };
}

async function requireLegalEntity(
  ctx: MutationCtx,
  organizationId: string,
  legalEntityId: string | null | undefined,
) {
  if (!legalEntityId) return undefined;
  const id = ctx.db.normalizeId("legalEntities", legalEntityId);
  const legalEntity = id ? await ctx.db.get("legalEntities", id) : null;
  if (!legalEntity || legalEntity.organizationId !== organizationId) {
    restError(
      "legal_entity_reference_invalid",
      "Legal entity was not found.",
    );
  }
  return legalEntity._id;
}

async function findMarket(
  ctx: MutationCtx,
  organizationId: string,
  publicId: string,
) {
  const id = ctx.db.normalizeId("markets", publicId);
  if (!id) restError("market_not_found", "Market was not found.");
  const market = await ctx.db.get("markets", id);
  if (!market || market.organizationId !== organizationId) {
    restError("market_not_found", "Market was not found.");
  }
  return market;
}

async function findLegalEntity(
  ctx: MutationCtx,
  organizationId: string,
  publicId: string,
) {
  const id = ctx.db.normalizeId("legalEntities", publicId);
  if (!id) restError("legal_entity_not_found", "Legal entity was not found.");
  const legalEntity = await ctx.db.get("legalEntities", id);
  if (!legalEntity || legalEntity.organizationId !== organizationId) {
    restError("legal_entity_not_found", "Legal entity was not found.");
  }
  return legalEntity;
}

async function findOperator(
  ctx: MutationCtx,
  organizationId: string,
  publicId: string,
) {
  const id = ctx.db.normalizeId("operators", publicId);
  if (!id) restError("operator_not_found", "Operator was not found.");
  const operator = await ctx.db.get("operators", id);
  if (!operator || operator.organizationId !== organizationId) {
    restError("operator_not_found", "Operator was not found.");
  }
  return operator;
}

export const listMarkets = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(marketValidator),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireApiKeyPrincipal(auth);
    requirePageSize(args.paginationOpts.numItems);
    const result = await ctx.db
      .query("markets")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map(toMarketDto),
    };
  },
});

export const getMarket = query({
  args: { id: v.string() },
  returns: v.union(marketValidator, v.null()),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireApiKeyPrincipal(auth);
    const id = ctx.db.normalizeId("markets", args.id);
    const market = id ? await ctx.db.get("markets", id) : null;
    return market && market.organizationId === auth.organizationId
      ? toMarketDto(market)
      : null;
  },
});

export const createMarket = mutation({
  args: {
    idempotencyKey: v.string(),
    requestHash: v.string(),
    input: marketCreateInputValidator,
  },
  returns: idempotentResponseValidator,
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireApiKeyPrincipal(auth);
    requireAllLocationAccess(auth);
    await requireRestApiMutation(ctx, auth);
    return await runIdempotent(
      ctx,
      auth,
      {
        operationId: "markets.create",
        key: args.idempotencyKey,
        requestHash: args.requestHash,
      },
      async () => {
        const { name, normalizedName } = normalizeName(
          args.input.name,
          "market",
        );
        const existing = await ctx.db
          .query("markets")
          .withIndex("by_organizationId_and_normalizedName", (q) =>
            q
              .eq("organizationId", auth.organizationId)
              .eq("normalizedName", normalizedName),
          )
          .unique();
        if (existing) {
          restError(
            "market_name_taken",
            "A market with this name already exists.",
          );
        }
        const currency = normalizeCurrency(args.input.currency);
        const timeZone = normalizeTimeZone(args.input.timeZone);
        const id = await ctx.db.insert("markets", {
          organizationId: auth.organizationId,
          name,
          normalizedName,
          currency,
          timeZone,
        });
        await recordAudit(ctx, auth, {
          action: "masterData.marketCreated",
          entityTable: "markets",
          entityId: id,
          summary: `Markedet ${name} blev oprettet`,
        });
        const data: MarketDto = {
          id,
          name,
          currency: currency ?? null,
          timeZone: timeZone ?? null,
        };
        return {
          status: 201,
          json: JSON.stringify({ data }),
        };
      },
    );
  },
});

export const updateMarket = mutation({
  args: {
    id: v.string(),
    input: marketPatchInputValidator,
  },
  returns: marketValidator,
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireApiKeyPrincipal(auth);
    requireAllLocationAccess(auth);
    await requireRestApiMutation(ctx, auth);
    const market = await findMarket(ctx, auth.organizationId, args.id);
    const nextName =
      args.input.name === undefined
        ? { name: market.name, normalizedName: market.normalizedName }
        : normalizeName(args.input.name, "market");
    const existing = await ctx.db
      .query("markets")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("normalizedName", nextName.normalizedName),
      )
      .unique();
    if (existing && existing._id !== market._id) {
      restError("market_name_taken", "A market with this name already exists.");
    }

    const locations = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_marketId", (q) =>
        q.eq("organizationId", auth.organizationId).eq("marketId", market._id),
      )
      .take(MAX_LOCATION_ROWS + 1);
    if (locations.length > MAX_LOCATION_ROWS) {
      restError(
        "market_has_too_many_locations",
        "The market has too many locations to update.",
      );
    }
    const inheritedLocations = locations.filter(
      (location) => !location.timeZone,
    );
    const previousTimeZones = await Promise.all(
      inheritedLocations.map((location) =>
        resolveTimeZone(ctx, auth.organizationId, location._id),
      ),
    );
    const timeZone =
      args.input.timeZone === undefined
        ? market.timeZone
        : normalizeTimeZone(args.input.timeZone);
    const currency =
      args.input.currency === undefined
        ? market.currency
        : normalizeCurrency(args.input.currency);
    await ctx.db.patch("markets", market._id, {
      name: nextName.name,
      normalizedName: nextName.normalizedName,
      currency,
      timeZone,
    });
    for (const [index, location] of inheritedLocations.entries()) {
      const nextTimeZone = await resolveTimeZone(
        ctx,
        auth.organizationId,
        location._id,
      );
      if (nextTimeZone !== previousTimeZones[index]) {
        await scheduleLocationDayStartReroll(
          ctx,
          auth.organizationId,
          location._id,
          nextTimeZone,
        );
      }
    }
    await recordAudit(ctx, auth, {
      action: "masterData.marketUpdated",
      entityTable: "markets",
      entityId: market._id,
      summary: `Markedet ${nextName.name} blev ændret`,
    });
    return {
      id: market._id,
      name: nextName.name,
      currency: currency ?? null,
      timeZone: timeZone ?? null,
    } satisfies MarketDto;
  },
});

export const deleteMarket = mutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireApiKeyPrincipal(auth);
    requireAllLocationAccess(auth);
    await requireRestApiMutation(ctx, auth);
    const market = await findMarket(ctx, auth.organizationId, args.id);
    const location = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_marketId", (q) =>
        q.eq("organizationId", auth.organizationId).eq("marketId", market._id),
      )
      .first();
    if (location) {
      restError(
        "market_in_use",
        "The market is used by a location and cannot be deleted.",
      );
    }
    await recordAudit(ctx, auth, {
      action: "masterData.marketDeleted",
      entityTable: "markets",
      entityId: market._id,
      summary: `Markedet ${market.name} blev slettet`,
    });
    await ctx.db.delete("markets", market._id);
    return null;
  },
});

export const listLegalEntities = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(legalEntityValidator),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireApiKeyPrincipal(auth);
    requirePageSize(args.paginationOpts.numItems);
    const result = await ctx.db
      .query("legalEntities")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map(toLegalEntityDto),
    };
  },
});

export const getLegalEntity = query({
  args: { id: v.string() },
  returns: v.union(legalEntityValidator, v.null()),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireApiKeyPrincipal(auth);
    const id = ctx.db.normalizeId("legalEntities", args.id);
    const legalEntity = id ? await ctx.db.get("legalEntities", id) : null;
    return legalEntity && legalEntity.organizationId === auth.organizationId
      ? toLegalEntityDto(legalEntity)
      : null;
  },
});

export const createLegalEntity = mutation({
  args: {
    idempotencyKey: v.string(),
    requestHash: v.string(),
    input: legalEntityCreateInputValidator,
  },
  returns: idempotentResponseValidator,
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireApiKeyPrincipal(auth);
    requireAllLocationAccess(auth);
    await requireRestApiMutation(ctx, auth);
    return await runIdempotent(
      ctx,
      auth,
      {
        operationId: "legalEntities.create",
        key: args.idempotencyKey,
        requestHash: args.requestHash,
      },
      async () => {
        const { name, normalizedName } = normalizeName(
          args.input.name,
          "legal_entity",
        );
        const existing = await ctx.db
          .query("legalEntities")
          .withIndex("by_organizationId_and_normalizedName", (q) =>
            q
              .eq("organizationId", auth.organizationId)
              .eq("normalizedName", normalizedName),
          )
          .unique();
        if (existing) {
          restError(
            "legal_entity_name_taken",
            "A legal entity with this name already exists.",
          );
        }
        const registrationNumber = optionalText(args.input.registrationNumber);
        const id = await ctx.db.insert("legalEntities", {
          organizationId: auth.organizationId,
          name,
          normalizedName,
          registrationNumber,
        });
        await recordAudit(ctx, auth, {
          action: "masterData.legalEntityCreated",
          entityTable: "legalEntities",
          entityId: id,
          summary: `Den juridiske enhed ${name} blev oprettet`,
        });
        const data: LegalEntityDto = {
          id,
          name,
          registrationNumber: registrationNumber ?? null,
        };
        return {
          status: 201,
          json: JSON.stringify({ data }),
        };
      },
    );
  },
});

export const updateLegalEntity = mutation({
  args: {
    id: v.string(),
    input: legalEntityPatchInputValidator,
  },
  returns: legalEntityValidator,
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireApiKeyPrincipal(auth);
    requireAllLocationAccess(auth);
    await requireRestApiMutation(ctx, auth);
    const legalEntity = await findLegalEntity(
      ctx,
      auth.organizationId,
      args.id,
    );
    const nextName =
      args.input.name === undefined
        ? { name: legalEntity.name, normalizedName: legalEntity.normalizedName }
        : normalizeName(args.input.name, "legal_entity");
    const existing = await ctx.db
      .query("legalEntities")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("normalizedName", nextName.normalizedName),
      )
      .unique();
    if (existing && existing._id !== legalEntity._id) {
      restError(
        "legal_entity_name_taken",
        "A legal entity with this name already exists.",
      );
    }
    const registrationNumber =
      args.input.registrationNumber === undefined
        ? legalEntity.registrationNumber
        : optionalText(args.input.registrationNumber);
    await ctx.db.patch("legalEntities", legalEntity._id, {
      name: nextName.name,
      normalizedName: nextName.normalizedName,
      registrationNumber,
    });
    await recordAudit(ctx, auth, {
      action: "masterData.legalEntityUpdated",
      entityTable: "legalEntities",
      entityId: legalEntity._id,
      summary: `Den juridiske enhed ${nextName.name} blev ændret`,
    });
    return {
      id: legalEntity._id,
      name: nextName.name,
      registrationNumber: registrationNumber ?? null,
    } satisfies LegalEntityDto;
  },
});

export const deleteLegalEntity = mutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireApiKeyPrincipal(auth);
    requireAllLocationAccess(auth);
    await requireRestApiMutation(ctx, auth);
    const legalEntity = await findLegalEntity(
      ctx,
      auth.organizationId,
      args.id,
    );
    const [location, operator] = await Promise.all([
      ctx.db
        .query("locations")
        .withIndex("by_organizationId_and_legalEntityId", (q) =>
          q
            .eq("organizationId", auth.organizationId)
            .eq("legalEntityId", legalEntity._id),
        )
        .first(),
      ctx.db
        .query("operators")
        .withIndex("by_organizationId_and_legalEntityId", (q) =>
          q
            .eq("organizationId", auth.organizationId)
            .eq("legalEntityId", legalEntity._id),
        )
        .first(),
    ]);
    if (location || operator) {
      restError(
        "legal_entity_in_use",
        "The legal entity is in use and cannot be deleted.",
      );
    }
    await recordAudit(ctx, auth, {
      action: "masterData.legalEntityDeleted",
      entityTable: "legalEntities",
      entityId: legalEntity._id,
      summary: `Den juridiske enhed ${legalEntity.name} blev slettet`,
    });
    await ctx.db.delete("legalEntities", legalEntity._id);
    return null;
  },
});

export const listOperators = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(operatorValidator),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireApiKeyPrincipal(auth);
    requirePageSize(args.paginationOpts.numItems);
    const result = await ctx.db
      .query("operators")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map(toOperatorDto),
    };
  },
});

export const getOperator = query({
  args: { id: v.string() },
  returns: v.union(operatorValidator, v.null()),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireApiKeyPrincipal(auth);
    const id = ctx.db.normalizeId("operators", args.id);
    const operator = id ? await ctx.db.get("operators", id) : null;
    return operator && operator.organizationId === auth.organizationId
      ? toOperatorDto(operator)
      : null;
  },
});

export const createOperator = mutation({
  args: {
    idempotencyKey: v.string(),
    requestHash: v.string(),
    input: operatorCreateInputValidator,
  },
  returns: idempotentResponseValidator,
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireApiKeyPrincipal(auth);
    requireAllLocationAccess(auth);
    await requireRestApiMutation(ctx, auth);
    return await runIdempotent(
      ctx,
      auth,
      {
        operationId: "operators.create",
        key: args.idempotencyKey,
        requestHash: args.requestHash,
      },
      async () => {
        const { name, normalizedName } = normalizeName(
          args.input.name,
          "operator",
        );
        const existing = await ctx.db
          .query("operators")
          .withIndex("by_organizationId_and_normalizedName", (q) =>
            q
              .eq("organizationId", auth.organizationId)
              .eq("normalizedName", normalizedName),
          )
          .unique();
        if (existing) {
          restError(
            "operator_name_taken",
            "An operator with this name already exists.",
          );
        }
        const legalEntityId = await requireLegalEntity(
          ctx,
          auth.organizationId,
          args.input.legalEntityId,
        );
        const contactEmail = normalizeContactEmail(args.input.contactEmail);
        const status = args.input.status ?? "active";
        const id = await ctx.db.insert("operators", {
          organizationId: auth.organizationId,
          name,
          normalizedName,
          legalEntityId,
          contactEmail,
          status,
        });
        await recordAudit(ctx, auth, {
          action: "masterData.operatorCreated",
          entityTable: "operators",
          entityId: id,
          summary: `Operatøren ${name} blev oprettet`,
        });
        const data: OperatorDto = {
          id,
          name,
          legalEntityId: legalEntityId ?? null,
          contactEmail: contactEmail ?? null,
          status,
        };
        return {
          status: 201,
          json: JSON.stringify({ data }),
        };
      },
    );
  },
});

export const updateOperator = mutation({
  args: {
    id: v.string(),
    input: operatorPatchInputValidator,
  },
  returns: operatorValidator,
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireApiKeyPrincipal(auth);
    requireAllLocationAccess(auth);
    await requireRestApiMutation(ctx, auth);
    const operator = await findOperator(ctx, auth.organizationId, args.id);
    const nextName =
      args.input.name === undefined
        ? { name: operator.name, normalizedName: operator.normalizedName }
        : normalizeName(args.input.name, "operator");
    const existing = await ctx.db
      .query("operators")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("normalizedName", nextName.normalizedName),
      )
      .unique();
    if (existing && existing._id !== operator._id) {
      restError(
        "operator_name_taken",
        "An operator with this name already exists.",
      );
    }
    const legalEntityId =
      args.input.legalEntityId === undefined
        ? operator.legalEntityId
        : await requireLegalEntity(
            ctx,
            auth.organizationId,
            args.input.legalEntityId,
          );
    const contactEmail =
      args.input.contactEmail === undefined
        ? operator.contactEmail
        : normalizeContactEmail(args.input.contactEmail);
    const status = args.input.status ?? operator.status;
    await ctx.db.patch("operators", operator._id, {
      name: nextName.name,
      normalizedName: nextName.normalizedName,
      legalEntityId,
      contactEmail,
      status,
    });
    await recordAudit(ctx, auth, {
      action: "masterData.operatorUpdated",
      entityTable: "operators",
      entityId: operator._id,
      summary: `Operatøren ${nextName.name} blev ændret`,
    });
    return {
      id: operator._id,
      name: nextName.name,
      legalEntityId: legalEntityId ?? null,
      contactEmail: contactEmail ?? null,
      status,
    } satisfies OperatorDto;
  },
});

export const deleteOperator = mutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireApiKeyPrincipal(auth);
    requireAllLocationAccess(auth);
    await requireRestApiMutation(ctx, auth);
    const operator = await findOperator(ctx, auth.organizationId, args.id);
    const location = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_operatorId", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("operatorId", operator._id),
      )
      .first();
    if (location) {
      restError(
        "operator_in_use",
        "The operator is used by a location and cannot be deleted.",
      );
    }
    const apiKeyPolicies = await ctx.db
      .query("apiKeyPolicies")
      .withIndex("by_organizationId_and_status_and_expiresAt", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("status", "active")
          .gt("expiresAt", Date.now()),
      )
      .collect();
    if (
      apiKeyPolicies.some(
        (policy) =>
          policy.locationPolicy.kind === "operator" &&
          policy.locationPolicy.operatorId === operator._id,
      )
    ) {
      restError(
        "operator_api_key_dependency",
        "The operator is used by an active API key and cannot be deleted.",
      );
    }
    const accessRows = await ctx.db
      .query("memberLocationAccess")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .take(MAX_MEMBER_ACCESS_ROWS + 1);
    if (accessRows.length > MAX_MEMBER_ACCESS_ROWS) {
      restError(
        "operator_access_cleanup_too_large",
        "There are too many location access rules to update safely.",
      );
    }
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
    await recordAudit(ctx, auth, {
      action: "masterData.operatorDeleted",
      entityTable: "operators",
      entityId: operator._id,
      summary: `Operatøren ${operator.name} blev slettet`,
    });
    await ctx.db.delete("operators", operator._id);
    return null;
  },
});
