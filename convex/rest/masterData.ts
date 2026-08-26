import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import { requireLocationManager, type OrganizationAuth } from "../lib/auth";
import { runIdempotent } from "../lib/idempotency";
import { requireRestApiMutation } from "./lib";
import {
  createLegalEntityWithAuth,
  createMarketWithAuth,
  createOperatorWithAuth,
  deleteLegalEntityWithAuth,
  deleteMarketWithAuth,
  deleteOperatorWithAuth,
  MasterDataError,
  requireMasterDataWriteAccess,
  updateLegalEntityWithAuth,
  updateMarketWithAuth,
  updateOperatorWithAuth,
} from "../masterData";

const MAX_PAGE_SIZE = 100;

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

function restError(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

function restMasterDataError(error: MasterDataError): never {
  const prefix = {
    market: "market",
    legalEntity: "legal_entity",
    operator: "operator",
  }[error.resource];
  const label = {
    market: "market",
    legalEntity: "legal entity",
    operator: "operator",
  }[error.resource];
  switch (error.kind) {
    case "invalidName":
      restError(
        `${prefix}_name_invalid`,
        "Name is required and must be at most 100 characters.",
      );
    case "nameTaken":
      restError(
        `${prefix}_name_taken`,
        `A ${label} with this name already exists.`,
      );
    case "notFound":
      restError(
        `${prefix}_not_found`,
        `${label[0].toUpperCase()}${label.slice(1)} was not found.`,
      );
    case "invalidCurrency":
      restError(
        "market_currency_invalid",
        "Currency must be a three-letter ISO 4217 code.",
      );
    case "invalidTimeZone":
      restError("market_timezone_invalid", "Time zone is invalid.");
    case "tooManyLocations":
      restError(
        "market_has_too_many_locations",
        "The market has too many locations to update.",
      );
    case "inUse":
      restError(
        `${prefix}_in_use`,
        error.resource === "market"
          ? "The market is used by a location and cannot be deleted."
          : error.resource === "operator"
            ? "The operator is used by a location and cannot be deleted."
            : "The legal entity is in use and cannot be deleted.",
      );
    case "invalidReference":
      restError(
        "legal_entity_reference_invalid",
        "Legal entity was not found.",
      );
    case "invalidContactEmail":
      restError(
        "operator_contact_email_invalid",
        "Contact email is invalid.",
      );
    case "apiKeyDependency":
      restError(
        "operator_api_key_dependency",
        "The operator is used by an active API key and cannot be deleted.",
      );
    case "accessCleanupTooLarge":
      restError(
        "operator_access_cleanup_too_large",
        "There are too many location access rules to update safely.",
      );
    default: {
      const _exhaustive: never = error.kind;
      return _exhaustive;
    }
  }
}

async function runMasterDataMutation<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof MasterDataError) {
      return restMasterDataError(error);
    }
    throw error;
  }
}

function requirePageSize(numItems: number) {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > MAX_PAGE_SIZE) {
    restError(
      "page_size_invalid",
      "Page size must be an integer between 1 and 100.",
    );
  }
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

function normalizeLegalEntityId(
  ctx: MutationCtx,
  legalEntityId: string | null | undefined,
): Id<"legalEntities"> | undefined {
  if (!legalEntityId) return undefined;
  const id = ctx.db.normalizeId("legalEntities", legalEntityId);
  if (!id) {
    restError(
      "legal_entity_reference_invalid",
      "Legal entity was not found.",
    );
  }
  return id;
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
    requireMasterDataWriteAccess(auth);
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
        const id = await runMasterDataMutation(() =>
          createMarketWithAuth(ctx, auth, args.input),
        );
        const market = await ctx.db.get("markets", id);
        if (!market) restError("market_not_found", "Market was not found.");
        const data = toMarketDto(market);
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
    requireMasterDataWriteAccess(auth);
    await requireRestApiMutation(ctx, auth);
    const market = await findMarket(ctx, auth.organizationId, args.id);
    const id = await runMasterDataMutation(() =>
      updateMarketWithAuth(ctx, auth, {
        marketId: market._id,
        name: args.input.name ?? market.name,
        currency:
          args.input.currency === undefined
            ? market.currency
            : args.input.currency,
        timeZone:
          args.input.timeZone === undefined
            ? market.timeZone
            : args.input.timeZone,
      }),
    );
    const updated = await ctx.db.get("markets", id);
    if (!updated) restError("market_not_found", "Market was not found.");
    return toMarketDto(updated);
  },
});

export const deleteMarket = mutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireApiKeyPrincipal(auth);
    requireMasterDataWriteAccess(auth);
    await requireRestApiMutation(ctx, auth);
    const market = await findMarket(ctx, auth.organizationId, args.id);
    await runMasterDataMutation(() =>
      deleteMarketWithAuth(ctx, auth, market._id),
    );
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
    requireMasterDataWriteAccess(auth);
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
        const id = await runMasterDataMutation(() =>
          createLegalEntityWithAuth(ctx, auth, args.input),
        );
        const legalEntity = await ctx.db.get("legalEntities", id);
        if (!legalEntity) {
          restError("legal_entity_not_found", "Legal entity was not found.");
        }
        const data = toLegalEntityDto(legalEntity);
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
    requireMasterDataWriteAccess(auth);
    await requireRestApiMutation(ctx, auth);
    const legalEntity = await findLegalEntity(
      ctx,
      auth.organizationId,
      args.id,
    );
    const id = await runMasterDataMutation(() =>
      updateLegalEntityWithAuth(ctx, auth, {
        legalEntityId: legalEntity._id,
        name: args.input.name ?? legalEntity.name,
        registrationNumber:
          args.input.registrationNumber === undefined
            ? legalEntity.registrationNumber
            : args.input.registrationNumber,
      }),
    );
    const updated = await ctx.db.get("legalEntities", id);
    if (!updated) {
      restError("legal_entity_not_found", "Legal entity was not found.");
    }
    return toLegalEntityDto(updated);
  },
});

export const deleteLegalEntity = mutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireApiKeyPrincipal(auth);
    requireMasterDataWriteAccess(auth);
    await requireRestApiMutation(ctx, auth);
    const legalEntity = await findLegalEntity(
      ctx,
      auth.organizationId,
      args.id,
    );
    await runMasterDataMutation(() =>
      deleteLegalEntityWithAuth(ctx, auth, legalEntity._id),
    );
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
    requireMasterDataWriteAccess(auth);
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
        const id = await runMasterDataMutation(() =>
          createOperatorWithAuth(ctx, auth, {
            name: args.input.name,
            legalEntityId: normalizeLegalEntityId(
              ctx,
              args.input.legalEntityId,
            ),
            contactEmail: args.input.contactEmail,
            status: args.input.status ?? "active",
          }),
        );
        const operator = await ctx.db.get("operators", id);
        if (!operator) restError("operator_not_found", "Operator was not found.");
        const data = toOperatorDto(operator);
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
    requireMasterDataWriteAccess(auth);
    await requireRestApiMutation(ctx, auth);
    const operator = await findOperator(ctx, auth.organizationId, args.id);
    const id = await runMasterDataMutation(() =>
      updateOperatorWithAuth(ctx, auth, {
        operatorId: operator._id,
        name: args.input.name ?? operator.name,
        legalEntityId:
          args.input.legalEntityId === undefined
            ? operator.legalEntityId
            : normalizeLegalEntityId(ctx, args.input.legalEntityId),
        contactEmail:
          args.input.contactEmail === undefined
            ? operator.contactEmail
            : args.input.contactEmail,
        status: args.input.status ?? operator.status,
      }),
    );
    const updated = await ctx.db.get("operators", id);
    if (!updated) restError("operator_not_found", "Operator was not found.");
    return toOperatorDto(updated);
  },
});

export const deleteOperator = mutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireApiKeyPrincipal(auth);
    requireMasterDataWriteAccess(auth);
    await requireRestApiMutation(ctx, auth);
    const operator = await findOperator(ctx, auth.organizationId, args.id);
    await runMasterDataMutation(() =>
      deleteOperatorWithAuth(ctx, auth, operator._id),
    );
    return null;
  },
});
