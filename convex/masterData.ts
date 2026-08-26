import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  requireAllLocationAccess,
  requireLocationManager,
  type OrganizationAuth,
} from "./lib/auth";
import { recordAudit } from "./lib/audit";
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
const MAX_MEMBER_ACCESS_ROWS = 1_000;

export type MasterDataResource = "market" | "legalEntity" | "operator";
export type MasterDataErrorKind =
  | "invalidName"
  | "nameTaken"
  | "notFound"
  | "invalidCurrency"
  | "invalidTimeZone"
  | "tooManyLocations"
  | "inUse"
  | "invalidReference"
  | "invalidContactEmail"
  | "apiKeyDependency"
  | "accessCleanupTooLarge";

export class MasterDataError extends Error {
  constructor(
    readonly resource: MasterDataResource,
    readonly kind: MasterDataErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "MasterDataError";
  }
}

type MarketInput = {
  name: string;
  currency?: string | null;
  timeZone?: string | null;
};

type LegalEntityInput = {
  name: string;
  registrationNumber?: string | null;
};

type OperatorInput = {
  name: string;
  legalEntityId?: Id<"legalEntities"> | null;
  contactEmail?: string | null;
  status: "active" | "inactive";
};
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
    throw new MasterDataError(
      "legalEntity",
      "invalidReference",
      "Den juridiske enhed blev ikke fundet",
    );
  }
  return legalEntity._id;
}

function normalizeName(
  value: string,
  label: string,
  resource: MasterDataResource,
) {
  try {
    return normalizeMasterDataName(value, label);
  } catch (error) {
    if (error instanceof ConvexError) {
      throw new MasterDataError(resource, "invalidName", String(error.data));
    }
    throw error;
  }
}

function normalizeCurrency(value: string | null | undefined) {
  try {
    return requireCurrency(value);
  } catch (error) {
    if (error instanceof ConvexError) {
      throw new MasterDataError("market", "invalidCurrency", String(error.data));
    }
    throw error;
  }
}

function normalizeTimeZone(value: string | null | undefined) {
  try {
    return requireTimeZone(value);
  } catch (error) {
    if (error instanceof ConvexError) {
      throw new MasterDataError("market", "invalidTimeZone", String(error.data));
    }
    throw error;
  }
}

function requireContactEmail(value: string | null | undefined) {
  const email = optionalText(value);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new MasterDataError(
      "operator",
      "invalidContactEmail",
      "Kontaktmailen er ugyldig",
    );
  }
  return email;
}

export function requireMasterDataWriteAccess(auth: OrganizationAuth) {
  requireAllLocationAccess(auth);
}

function masterDataErrorForHuman(error: unknown): never {
  if (error instanceof MasterDataError) {
    throw new ConvexError(error.message);
  }
  throw error;
}

async function runHumanMasterDataMutation<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    return masterDataErrorForHuman(error);
  }
}

export async function createMarketWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  args: MarketInput,
) {
  requireMasterDataWriteAccess(auth);
  const { organizationId } = auth;
  const { name, normalizedName } = normalizeName(
    args.name,
    "Markedsnavnet",
    "market",
  );
  const existing = await ctx.db
    .query("markets")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q.eq("organizationId", organizationId).eq("normalizedName", normalizedName),
    )
    .unique();
  if (existing) {
    throw new MasterDataError(
      "market",
      "nameTaken",
      "Markedet findes allerede",
    );
  }
  const currency = normalizeCurrency(args.currency);
  const timeZone = normalizeTimeZone(args.timeZone);
  const id = await ctx.db.insert("markets", {
    organizationId,
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
  return id;
}

export async function updateMarketWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  args: MarketInput & { marketId: Id<"markets"> },
) {
  requireMasterDataWriteAccess(auth);
  const { organizationId } = auth;
  const market = await ctx.db.get("markets", args.marketId);
  if (!market || market.organizationId !== organizationId) {
    throw new MasterDataError(
      "market",
      "notFound",
      "Markedet blev ikke fundet",
    );
  }
  const { name, normalizedName } = normalizeName(
    args.name,
    "Markedsnavnet",
    "market",
  );
  const existing = await ctx.db
    .query("markets")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q.eq("organizationId", organizationId).eq("normalizedName", normalizedName),
    )
    .unique();
  if (existing && existing._id !== market._id) {
    throw new MasterDataError(
      "market",
      "nameTaken",
      "Markedet findes allerede",
    );
  }
  const locations = await ctx.db
    .query("locations")
    .withIndex("by_organizationId_and_marketId", (q) =>
      q.eq("organizationId", organizationId).eq("marketId", market._id),
    )
    .take(MAX_ROWS + 1);
  if (locations.length > MAX_ROWS) {
    throw new MasterDataError(
      "market",
      "tooManyLocations",
      "Markedet har for mange lokationer",
    );
  }
  const inheritedLocations = locations.filter(
    (location) => !location.timeZone,
  );
  const previousTimeZones = await Promise.all(
    inheritedLocations.map((location) =>
      resolveTimeZone(ctx, organizationId, location._id),
    ),
  );
  const timeZone = normalizeTimeZone(args.timeZone);
  const currency = normalizeCurrency(args.currency);
  await ctx.db.patch("markets", market._id, {
    name,
    normalizedName,
    currency,
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
  await recordAudit(ctx, auth, {
    action: "masterData.marketUpdated",
    entityTable: "markets",
    entityId: market._id,
    summary: `Markedet ${name} blev ændret`,
  });
  return market._id;
}

export async function deleteMarketWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  marketId: Id<"markets">,
) {
  requireMasterDataWriteAccess(auth);
  const { organizationId } = auth;
  const market = await ctx.db.get("markets", marketId);
  if (!market || market.organizationId !== organizationId) {
    throw new MasterDataError(
      "market",
      "notFound",
      "Markedet blev ikke fundet",
    );
  }
  const location = await ctx.db
    .query("locations")
    .withIndex("by_organizationId_and_marketId", (q) =>
      q.eq("organizationId", organizationId).eq("marketId", market._id),
    )
    .first();
  if (location) {
    throw new MasterDataError(
      "market",
      "inUse",
      "Markedet bruges af en lokation og kan ikke slettes",
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
}

export async function createLegalEntityWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  args: LegalEntityInput,
) {
  requireMasterDataWriteAccess(auth);
  const { organizationId } = auth;
  const { name, normalizedName } = normalizeName(
    args.name,
    "Navnet på den juridiske enhed",
    "legalEntity",
  );
  const existing = await ctx.db
    .query("legalEntities")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q.eq("organizationId", organizationId).eq("normalizedName", normalizedName),
    )
    .unique();
  if (existing) {
    throw new MasterDataError(
      "legalEntity",
      "nameTaken",
      "Den juridiske enhed findes allerede",
    );
  }
  const registrationNumber = optionalText(args.registrationNumber);
  const id = await ctx.db.insert("legalEntities", {
    organizationId,
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
  return id;
}

export async function updateLegalEntityWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  args: LegalEntityInput & { legalEntityId: Id<"legalEntities"> },
) {
  requireMasterDataWriteAccess(auth);
  const { organizationId } = auth;
  const legalEntity = await ctx.db.get("legalEntities", args.legalEntityId);
  if (!legalEntity || legalEntity.organizationId !== organizationId) {
    throw new MasterDataError(
      "legalEntity",
      "notFound",
      "Den juridiske enhed blev ikke fundet",
    );
  }
  const { name, normalizedName } = normalizeName(
    args.name,
    "Navnet på den juridiske enhed",
    "legalEntity",
  );
  const existing = await ctx.db
    .query("legalEntities")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q.eq("organizationId", organizationId).eq("normalizedName", normalizedName),
    )
    .unique();
  if (existing && existing._id !== legalEntity._id) {
    throw new MasterDataError(
      "legalEntity",
      "nameTaken",
      "Den juridiske enhed findes allerede",
    );
  }
  await ctx.db.patch("legalEntities", legalEntity._id, {
    name,
    normalizedName,
    registrationNumber: optionalText(args.registrationNumber),
  });
  await recordAudit(ctx, auth, {
    action: "masterData.legalEntityUpdated",
    entityTable: "legalEntities",
    entityId: legalEntity._id,
    summary: `Den juridiske enhed ${name} blev ændret`,
  });
  return legalEntity._id;
}

export async function deleteLegalEntityWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  legalEntityId: Id<"legalEntities">,
) {
  requireMasterDataWriteAccess(auth);
  const { organizationId } = auth;
  const legalEntity = await ctx.db.get("legalEntities", legalEntityId);
  if (!legalEntity || legalEntity.organizationId !== organizationId) {
    throw new MasterDataError(
      "legalEntity",
      "notFound",
      "Den juridiske enhed blev ikke fundet",
    );
  }
  const [location, operator] = await Promise.all([
    ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_legalEntityId", (q) =>
        q.eq("organizationId", organizationId).eq("legalEntityId", legalEntity._id),
      )
      .first(),
    ctx.db
      .query("operators")
      .withIndex("by_organizationId_and_legalEntityId", (q) =>
        q.eq("organizationId", organizationId).eq("legalEntityId", legalEntity._id),
      )
      .first(),
  ]);
  if (location || operator) {
    throw new MasterDataError(
      "legalEntity",
      "inUse",
      "Den juridiske enhed er i brug og kan ikke slettes",
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
}

export async function createOperatorWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  args: OperatorInput,
) {
  requireMasterDataWriteAccess(auth);
  const { organizationId } = auth;
  const { name, normalizedName } = normalizeName(
    args.name,
    "Operatørnavnet",
    "operator",
  );
  const existing = await ctx.db
    .query("operators")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q.eq("organizationId", organizationId).eq("normalizedName", normalizedName),
    )
    .unique();
  if (existing) {
    throw new MasterDataError(
      "operator",
      "nameTaken",
      "Operatøren findes allerede",
    );
  }
  const legalEntityId = await requireLegalEntity(
    ctx,
    organizationId,
    args.legalEntityId,
  );
  const contactEmail = requireContactEmail(args.contactEmail);
  const id = await ctx.db.insert("operators", {
    organizationId,
    name,
    normalizedName,
    legalEntityId,
    contactEmail,
    status: args.status,
  });
  await recordAudit(ctx, auth, {
    action: "masterData.operatorCreated",
    entityTable: "operators",
    entityId: id,
    summary: `Operatøren ${name} blev oprettet`,
  });
  return id;
}

export async function updateOperatorWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  args: OperatorInput & { operatorId: Id<"operators"> },
) {
  requireMasterDataWriteAccess(auth);
  const { organizationId } = auth;
  const operator = await ctx.db.get("operators", args.operatorId);
  if (!operator || operator.organizationId !== organizationId) {
    throw new MasterDataError(
      "operator",
      "notFound",
      "Operatøren blev ikke fundet",
    );
  }
  const { name, normalizedName } = normalizeName(
    args.name,
    "Operatørnavnet",
    "operator",
  );
  const existing = await ctx.db
    .query("operators")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q.eq("organizationId", organizationId).eq("normalizedName", normalizedName),
    )
    .unique();
  if (existing && existing._id !== operator._id) {
    throw new MasterDataError(
      "operator",
      "nameTaken",
      "Operatøren findes allerede",
    );
  }
  const legalEntityId = await requireLegalEntity(
    ctx,
    organizationId,
    args.legalEntityId,
  );
  const contactEmail = requireContactEmail(args.contactEmail);
  await ctx.db.patch("operators", operator._id, {
    name,
    normalizedName,
    legalEntityId,
    contactEmail,
    status: args.status,
  });
  await recordAudit(ctx, auth, {
    action: "masterData.operatorUpdated",
    entityTable: "operators",
    entityId: operator._id,
    summary: `Operatøren ${name} blev ændret`,
  });
  return operator._id;
}

export async function deleteOperatorWithAuth(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  operatorId: Id<"operators">,
) {
  requireMasterDataWriteAccess(auth);
  const { organizationId } = auth;
  const operator = await ctx.db.get("operators", operatorId);
  if (!operator || operator.organizationId !== organizationId) {
    throw new MasterDataError(
      "operator",
      "notFound",
      "Operatøren blev ikke fundet",
    );
  }
  const location = await ctx.db
    .query("locations")
    .withIndex("by_organizationId_and_operatorId", (q) =>
      q.eq("organizationId", organizationId).eq("operatorId", operator._id),
    )
    .first();
  if (location) {
    throw new MasterDataError(
      "operator",
      "inUse",
      "Operatøren bruges af en lokation og kan ikke slettes",
    );
  }
  const apiKeyPolicies = await ctx.db
    .query("apiKeyPolicies")
    .withIndex("by_organizationId_and_status_and_expiresAt", (q) =>
      q
        .eq("organizationId", organizationId)
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
    throw new MasterDataError(
      "operator",
      "apiKeyDependency",
      "Operatøren bruges af en aktiv API-nøgle og kan ikke slettes",
    );
  }
  const accessRows = await ctx.db
    .query("memberLocationAccess")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .take(MAX_MEMBER_ACCESS_ROWS + 1);
  if (accessRows.length > MAX_MEMBER_ACCESS_ROWS) {
    throw new MasterDataError(
      "operator",
      "accessCleanupTooLarge",
      "Der er for mange adgangsbegrænsninger",
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
    const auth = await requireLocationManager(ctx);
    return await runHumanMasterDataMutation(() =>
      createMarketWithAuth(ctx, auth, args),
    );
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
    const auth = await requireLocationManager(ctx);
    await runHumanMasterDataMutation(() =>
      updateMarketWithAuth(ctx, auth, args),
    );
    return null;
  },
});

export const deleteMarket = mutation({
  args: { marketId: v.id("markets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    return await runHumanMasterDataMutation(() =>
      deleteMarketWithAuth(ctx, auth, args.marketId),
    );
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
    const auth = await requireLocationManager(ctx);
    return await runHumanMasterDataMutation(() =>
      createLegalEntityWithAuth(ctx, auth, args),
    );
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
    const auth = await requireLocationManager(ctx);
    await runHumanMasterDataMutation(() =>
      updateLegalEntityWithAuth(ctx, auth, args),
    );
    return null;
  },
});

export const deleteLegalEntity = mutation({
  args: { legalEntityId: v.id("legalEntities") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    return await runHumanMasterDataMutation(() =>
      deleteLegalEntityWithAuth(ctx, auth, args.legalEntityId),
    );
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
    const auth = await requireLocationManager(ctx);
    return await runHumanMasterDataMutation(() =>
      createOperatorWithAuth(ctx, auth, args),
    );
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
    const auth = await requireLocationManager(ctx);
    await runHumanMasterDataMutation(() =>
      updateOperatorWithAuth(ctx, auth, args),
    );
    return null;
  },
});

export const deleteOperator = mutation({
  args: { operatorId: v.id("operators") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    return await runHumanMasterDataMutation(() =>
      deleteOperatorWithAuth(ctx, auth, args.operatorId),
    );
  },
});
