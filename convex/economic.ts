import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, env, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import schema from "./schema";
import { recordAudit } from "./lib/audit";
import { requireAllLocationAccess, requireHumanPrincipal, requireIntegrationManager } from "./lib/auth";
import { getEconomicCatalog, getEconomicSelf, type EconomicCredentials } from "./lib/economicApi";
import { decryptEconomicToken, economicAppSecret, encryptEconomicToken } from "./lib/economicCrypto";
import { economicLocationMappingValidator, economicMappingFields } from "./lib/economicValidators";
import { requireOrganizationLocation } from "./lib/locations";
import { resolveLocationCurrency } from "./lib/masterData";

const MAX_CONNECTIONS = 200;
const MAX_LOCATIONS = 200;
const MAX_ACCOUNTS = 200;
const catalogValidator = v.object({
  accounts: v.array(v.object({ number: v.number(), name: v.string(), type: v.number() })),
  dimensions: v.array(v.object({ number: v.number(), name: v.string() })),
  values: v.array(v.object({ dimensionNumber: v.number(), number: v.number(), name: v.string() })),
  dimensionsAvailable: v.boolean(),
});
const connectionArgs = { connectionId: v.id("economicConnections"), expectedRevision: v.number() };
const mappingsArgs = { ...connectionArgs, ...economicMappingFields, locationMappings: v.array(economicLocationMappingValidator) };

async function requireManager(ctx: QueryCtx | MutationCtx) {
  const auth = requireHumanPrincipal(await requireIntegrationManager(ctx));
  requireAllLocationAccess(auth);
  return auth;
}

async function requireConnection(ctx: QueryCtx | MutationCtx, connectionId: Id<"economicConnections">) {
  const auth = await requireManager(ctx);
  const connection = await ctx.db.get("economicConnections", connectionId);
  if (!connection || connection.organizationId !== auth.organizationId) {
    throw new ConvexError("e-conomic-aftalen blev ikke fundet");
  }
  return { auth, connection };
}

function requireRevision(actual: number, expected: number) {
  if (!Number.isSafeInteger(expected) || actual !== expected) {
    throw new ConvexError("e-conomic-opsætningen er ændret. Indlæs den igen, før du gemmer");
  }
}

export const getSettings = query({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    connections: v.array(v.object({
      id: v.id("economicConnections"), agreementNumber: v.number(), name: v.string(),
      currency: v.string(), enabled: v.boolean(), revision: v.number(),
      ...economicMappingFields, locationMappings: v.array(economicLocationMappingValidator),
    })),
    locations: v.array(v.object({ id: v.id("locations"), name: v.string(), currency: v.string() })),
  }),
  handler: async (ctx) => {
    const auth = await requireManager(ctx);
    const [connections, locations] = await Promise.all([
      ctx.db.query("economicConnections").withIndex("by_organizationId", (q) => q.eq("organizationId", auth.organizationId)).take(MAX_CONNECTIONS + 1),
      ctx.db.query("locations").withIndex("by_organizationId_and_normalizedName", (q) => q.eq("organizationId", auth.organizationId)).take(MAX_LOCATIONS + 1),
    ]);
    if (connections.length > MAX_CONNECTIONS || locations.length > MAX_LOCATIONS) {
      throw new ConvexError("e-conomic-opsætningen understøtter højst 200 aftaler og lokationer");
    }
    return {
      configured: Boolean(env.ECONOMIC_APP_SECRET_TOKEN?.trim() && env.ECONOMIC_ENCRYPTION_KEY?.trim()),
      connections: await Promise.all(connections.map(async (connection) => {
        const mappings = await ctx.db.query("economicLocationMappings").withIndex("by_connectionId", (q) => q.eq("connectionId", connection._id)).take(MAX_LOCATIONS + 1);
        if (mappings.length > MAX_LOCATIONS) throw new ConvexError("Aftalen har for mange lokationskoblinger");
        return {
          id: connection._id, agreementNumber: connection.agreementNumber, name: connection.name,
          currency: connection.currency, enabled: connection.enabled, revision: connection.revision,
          dimensionNumber: connection.dimensionNumber, budgetSource: connection.budgetSource,
          cogsStockAdjusted: connection.cogsStockAdjusted, accountMappings: connection.accountMappings,
          locationMappings: mappings.map(({ locationId, dimensionKey }) => ({ locationId, dimensionKey })),
        };
      })),
      locations: await Promise.all(locations.map(async (location) => ({
        id: location._id, name: location.name, currency: await resolveLocationCurrency(ctx, auth.organizationId, location),
      }))),
    };
  },
});

export const getPrivateConnection = internalQuery({
  args: { connectionId: v.id("economicConnections") },
  returns: schema.doc("economicConnections"),
  handler: async (ctx, args) => (await requireConnection(ctx, args.connectionId)).connection,
});

export const saveConnection = internalMutation({
  args: {
    organizationId: v.string(), connectionId: v.optional(v.id("economicConnections")),
    expectedRevision: v.union(v.number(), v.null()), agreementNumber: v.number(),
    name: v.string(), currency: v.string(), encryptedToken: v.string(),
  },
  returns: v.id("economicConnections"),
  handler: async (ctx, args) => {
    const auth = await requireManager(ctx);
    if (auth.organizationId !== args.organizationId) throw new ConvexError("Organisationen er ændret. Opret forbindelsen igen");
    const duplicate = await ctx.db.query("economicConnections")
      .withIndex("by_organizationId_and_agreementNumber", (q) => q.eq("organizationId", auth.organizationId).eq("agreementNumber", args.agreementNumber)).unique();
    const now = Date.now();
    let id: Id<"economicConnections">;
    if (args.connectionId) {
      const { connection } = await requireConnection(ctx, args.connectionId);
      requireRevision(connection.revision, args.expectedRevision ?? -1);
      if (connection.agreementNumber !== args.agreementNumber || (duplicate && duplicate._id !== connection._id)) {
        throw new ConvexError("Nøglen tilhører en anden aftale. Tilføj den som en ny aftale");
      }
      if (connection.currency !== args.currency) throw new ConvexError("Aftalens valuta er ændret. Kontrollér lokationskoblingerne, før aftalen tilsluttes igen");
      id = connection._id;
      await ctx.db.patch("economicConnections", id, {
        encryptedToken: args.encryptedToken, name: args.name, enabled: true,
        revision: connection.revision + 1, updatedAt: now,
      });
    } else {
      if (duplicate) throw new ConvexError("Aftalen er allerede forbundet");
      const existing = await ctx.db.query("economicConnections").withIndex("by_organizationId", (q) => q.eq("organizationId", auth.organizationId)).take(MAX_CONNECTIONS);
      if (existing.length >= MAX_CONNECTIONS) throw new ConvexError("Organisationen har allerede 200 aftaler");
      id = await ctx.db.insert("economicConnections", {
        organizationId: auth.organizationId, agreementNumber: args.agreementNumber,
        name: args.name, currency: args.currency, encryptedToken: args.encryptedToken,
        enabled: true, dimensionNumber: null, budgetSource: "manual", cogsStockAdjusted: false,
        accountMappings: [], revision: 1, connectedAt: now, updatedAt: now,
      });
    }
    await recordAudit(ctx, auth, { action: "economic.connected", entityTable: "economicConnections", entityId: id, summary: `e-conomic-aftale ${args.agreementNumber} er forbundet` });
    return id;
  },
});

export const connect = action({
  args: { agreementGrantToken: v.string(), connectionId: v.optional(v.id("economicConnections")) },
  returns: v.id("economicConnections"),
  handler: async (ctx, args): Promise<Id<"economicConnections">> => {
    const auth = requireHumanPrincipal(await requireIntegrationManager(ctx));
    requireAllLocationAccess(auth);
    const grant = args.agreementGrantToken.trim();
    if (!grant || grant.length > 1000) throw new ConvexError("Indtast en gyldig e-conomic-aftalenøgle");
    const current = args.connectionId ? await ctx.runQuery(internal.economic.getPrivateConnection, { connectionId: args.connectionId }) : null;
    const credentials: EconomicCredentials = { appSecretToken: economicAppSecret(), agreementGrantToken: grant };
    const self = await getEconomicSelf(credentials);
    const encryptedToken = await encryptEconomicToken(grant);
    return ctx.runMutation(internal.economic.saveConnection, {
      organizationId: auth.organizationId, connectionId: args.connectionId,
      expectedRevision: current?.revision ?? null, agreementNumber: self.agreementNumber,
      name: self.name, currency: self.currency, encryptedToken,
    });
  },
});

export const setEnabled = mutation({
  args: { ...connectionArgs, enabled: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const { auth, connection } = await requireConnection(ctx, args.connectionId);
    requireRevision(connection.revision, args.expectedRevision);
    if (connection.enabled === args.enabled) return null;
    await ctx.db.patch("economicConnections", connection._id, { enabled: args.enabled, revision: connection.revision + 1, updatedAt: Date.now() });
    await recordAudit(ctx, auth, { action: "economic.enabledChanged", entityTable: "economicConnections", entityId: connection._id, summary: `e-conomic-aftale ${connection.agreementNumber} er ${args.enabled ? "aktiveret" : "deaktiveret"}` });
    return null;
  },
});

export const disconnect = mutation({
  args: connectionArgs, returns: v.null(),
  handler: async (ctx, args) => {
    const { auth, connection } = await requireConnection(ctx, args.connectionId);
    requireRevision(connection.revision, args.expectedRevision);
    const mappings = await ctx.db.query("economicLocationMappings").withIndex("by_connectionId", (q) => q.eq("connectionId", connection._id)).take(MAX_LOCATIONS + 1);
    if (mappings.length > MAX_LOCATIONS) throw new ConvexError("Aftalen har for mange lokationskoblinger");
    for (const mapping of mappings) await ctx.db.delete("economicLocationMappings", mapping._id);
    await ctx.db.delete("economicConnections", connection._id);
    await recordAudit(ctx, auth, { action: "economic.disconnected", entityTable: "economicConnections", entityId: connection._id, summary: `e-conomic-aftale ${connection.agreementNumber} er afbrudt` });
    return null;
  },
});

export const getCatalog = action({
  args: { connectionId: v.id("economicConnections") }, returns: catalogValidator,
  handler: async (ctx, args): Promise<Infer<typeof catalogValidator>> => {
    const before = await ctx.runQuery(internal.economic.getPrivateConnection, args);
    const catalog = await getEconomicCatalog({ appSecretToken: economicAppSecret(), agreementGrantToken: await decryptEconomicToken(before.encryptedToken) });
    const after = await ctx.runQuery(internal.economic.getPrivateConnection, args);
    requireRevision(after.revision, before.revision);
    return catalog;
  },
});

export const saveMappingsInternal = internalMutation({
  args: mappingsArgs, returns: v.null(),
  handler: async (ctx, args) => {
    const { auth, connection } = await requireConnection(ctx, args.connectionId);
    requireRevision(connection.revision, args.expectedRevision);
    if (args.accountMappings.length > MAX_ACCOUNTS || args.locationMappings.length > MAX_LOCATIONS) {
      throw new ConvexError("Vælg højst 200 konti og 200 lokationer");
    }
    const locations = new Set(args.locationMappings.map((mapping) => mapping.locationId));
    const dimensions = new Set(args.locationMappings.map((mapping) => mapping.dimensionKey));
    const accounts = new Set(args.accountMappings.map((mapping) => mapping.accountNumber));
    if (locations.size !== args.locationMappings.length || dimensions.size !== args.locationMappings.length || accounts.size !== args.accountMappings.length) {
      throw new ConvexError("En lokation, afdeling eller konto må kun tilknyttes én gang");
    }
    if (args.dimensionNumber === null && (args.locationMappings.length !== 1 || args.locationMappings.some((mapping) => mapping.dimensionKey !== null))) {
      throw new ConvexError("En hel aftale kan kun knyttes til én lokation");
    }
    if (args.dimensionNumber !== null && args.locationMappings.some((mapping) => mapping.dimensionKey === null)) {
      throw new ConvexError("Vælg en afdeling for hver lokation");
    }
    for (const mapping of args.locationMappings) {
      const location = await requireOrganizationLocation(ctx, auth.organizationId, mapping.locationId);
      if (await resolveLocationCurrency(ctx, auth.organizationId, location) !== connection.currency) {
        throw new ConvexError(`${location.name}: Lokationens valuta skal svare til aftalens grundvaluta`);
      }
      const current = await ctx.db.query("economicLocationMappings").withIndex("by_organizationId_and_locationId", (q) => q.eq("organizationId", auth.organizationId).eq("locationId", mapping.locationId)).unique();
      if (current && current.connectionId !== connection._id) throw new ConvexError(`${location.name} er allerede knyttet til en anden e-conomic-aftale`);
    }
    const old = await ctx.db.query("economicLocationMappings").withIndex("by_connectionId", (q) => q.eq("connectionId", connection._id)).take(MAX_LOCATIONS + 1);
    if (old.length > MAX_LOCATIONS) throw new ConvexError("Aftalen har for mange lokationskoblinger");
    for (const mapping of old) await ctx.db.delete("economicLocationMappings", mapping._id);
    for (const mapping of args.locationMappings) await ctx.db.insert("economicLocationMappings", { ...mapping, organizationId: auth.organizationId, connectionId: connection._id });
    await ctx.db.patch("economicConnections", connection._id, {
      dimensionNumber: args.dimensionNumber, budgetSource: args.budgetSource,
      cogsStockAdjusted: args.cogsStockAdjusted, accountMappings: args.accountMappings,
      revision: connection.revision + 1, updatedAt: Date.now(),
    });
    await recordAudit(ctx, auth, { action: "economic.mappingsSaved", entityTable: "economicConnections", entityId: connection._id, summary: `Konto- og lokationskoblinger for e-conomic-aftale ${connection.agreementNumber} er gemt` });
    return null;
  },
});

export const saveMappings = action({
  args: mappingsArgs, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const before = await ctx.runQuery(internal.economic.getPrivateConnection, { connectionId: args.connectionId });
    requireRevision(before.revision, args.expectedRevision);
    const catalog = await getEconomicCatalog({ appSecretToken: economicAppSecret(), agreementGrantToken: await decryptEconomicToken(before.encryptedToken) });
    for (const mapping of args.accountMappings) {
      const account = catalog.accounts.find((item) => item.number === mapping.accountNumber);
      if (!account || account.type !== 1) throw new ConvexError("Vælg en gyldig driftskonto fra aftalens kontoplan");
    }
    if (args.dimensionNumber !== null) {
      if (!catalog.dimensionsAvailable || !catalog.dimensions.some((item) => item.number === args.dimensionNumber)) throw new ConvexError("Den valgte dimension er ikke tilgængelig på aftalen");
      for (const mapping of args.locationMappings) {
        if (!catalog.values.some((value) => value.dimensionNumber === args.dimensionNumber && value.number === mapping.dimensionKey)) {
          throw new ConvexError("Den valgte afdeling findes ikke i aftalens dimension");
        }
      }
    }
    return ctx.runMutation(internal.economic.saveMappingsInternal, args);
  },
});
