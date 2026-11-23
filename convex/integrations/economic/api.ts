import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc } from "../../_generated/dataModel";
import { action, internalMutation, mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "../../_generated/server";
import { decryptCredential, encryptCredential, ensureOrganizationCredentialKey } from "../credentials";
import { requireIntegrationEnabled } from "../state";
import { recordAudit } from "../../lib/audit";
import { requireAllLocationAccess, requireHumanPrincipal, requireIntegrationManager } from "../../lib/auth";
import { DEFAULT_CURRENCY } from "../../../lib/dashboard/types";
import { getEconomicSelf, listEconomicJournals, type EconomicCredentials } from "./lib/api";

export const DEFAULT_BANK_ACCOUNT_NUMBER = 5820;

async function requireManager(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const auth = requireHumanPrincipal(await requireIntegrationManager(ctx));
  requireAllLocationAccess(auth);
  await requireIntegrationEnabled(ctx, auth.organizationId, "economic");
  return auth;
}

export function economicSettingsFor(ctx: QueryCtx | MutationCtx, organizationId: string) {
  return ctx.db.query("economicSettings").withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId)).unique();
}

function requireAccountNumber(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) throw new ConvexError(`${label} skal være et positivt heltal`);
  return value;
}

export const getSettings = query({
  args: {},
  returns: v.object({
    organizationId: v.string(),
    connection: v.union(v.null(), v.object({
      agreementNumber: v.union(v.number(), v.null()), companyName: v.string(), currency: v.string(), connectedAt: v.number(),
      journalNumber: v.union(v.number(), v.null()), bankAccountNumber: v.number(),
    })),
  }),
  handler: async (ctx) => {
    const auth = await requireManager(ctx);
    const settings = await economicSettingsFor(ctx, auth.organizationId);
    return {
      organizationId: auth.organizationId,
      connection: settings && {
        agreementNumber: settings.agreementNumber, companyName: settings.companyName, currency: settings.currency, connectedAt: settings.connectedAt,
        journalNumber: settings.journalNumber, bankAccountNumber: settings.bankAccountNumber,
      },
    };
  },
});

export const saveConnection = internalMutation({
  args: {
    organizationId: v.string(), encryptedAppSecretToken: v.string(), encryptedAgreementGrantToken: v.string(),
    agreementNumber: v.union(v.number(), v.null()), companyName: v.string(), currency: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireManager(ctx);
    if (auth.organizationId !== args.organizationId) throw new ConvexError("Organisationen er ændret. Forbind e-conomic igen");
    const current = await economicSettingsFor(ctx, auth.organizationId);
    const now = Date.now();
    const { organizationId, ...connection } = args;
    // Journal and balance belong to the agreement, so a different agreement starts over.
    // Without an agreement number the keys may belong to another agreement, so keep nothing.
    const sameAgreement = args.agreementNumber !== null && current?.agreementNumber === args.agreementNumber;
    const id = current
      ? (await ctx.db.patch("economicSettings", current._id, {
        ...connection, updatedAt: now,
        ...(sameAgreement ? {} : { journalNumber: null, bankAccountNumber: DEFAULT_BANK_ACCOUNT_NUMBER, manualBankBalance: undefined, connectedAt: now }),
      }), current._id)
      : await ctx.db.insert("economicSettings", {
        organizationId, ...connection, journalNumber: null, bankAccountNumber: DEFAULT_BANK_ACCOUNT_NUMBER, connectedAt: now, updatedAt: now,
      });
    await recordAudit(ctx, auth, { action: "economic.connected", entityTable: "economicSettings", entityId: id, summary: args.agreementNumber === null ? "e-conomic er forbundet" : `e-conomic-aftale ${args.agreementNumber} er forbundet` });
    return null;
  },
});

export const connect = action({
  args: { expectedOrganizationId: v.string(), appSecretToken: v.string(), agreementGrantToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const auth = await requireManager(ctx);
    if (auth.organizationId !== args.expectedOrganizationId) throw new ConvexError("Organisationen er ændret. Forbind e-conomic igen");
    const credentials = { appSecretToken: args.appSecretToken.trim(), agreementGrantToken: args.agreementGrantToken.trim() };
    if (!credentials.appSecretToken || credentials.appSecretToken.length > 1000) throw new ConvexError("Indtast en gyldig appnøgle");
    if (!credentials.agreementGrantToken || credentials.agreementGrantToken.length > 1000) throw new ConvexError("Indtast en gyldig aftalenøgle");
    const self = await getEconomicSelf(credentials);
    const key = await ctx.runMutation(internal.integrations.credentials.ensureKey, { organizationId: auth.organizationId });
    const [encryptedAppSecretToken, encryptedAgreementGrantToken] = await Promise.all([
      encryptCredential(credentials.appSecretToken, auth.organizationId, key),
      encryptCredential(credentials.agreementGrantToken, auth.organizationId, key),
    ]);
    await ctx.runMutation(internal.economic.saveConnection, {
      organizationId: auth.organizationId, encryptedAppSecretToken, encryptedAgreementGrantToken,
      ...(self ?? { agreementNumber: null, companyName: "e-conomic", currency: DEFAULT_CURRENCY }),
    });
    return null;
  },
});

function requireExpectedOrganization(organizationId: string, expected: string) {
  if (organizationId !== expected) throw new ConvexError("Organisationen er ændret. Indlæs siden igen");
}

export const saveOptions = mutation({
  args: { expectedOrganizationId: v.string(), journalNumber: v.union(v.number(), v.null()), bankAccountNumber: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireManager(ctx);
    requireExpectedOrganization(auth.organizationId, args.expectedOrganizationId);
    const settings = await economicSettingsFor(ctx, auth.organizationId);
    if (!settings) throw new ConvexError("Forbind e-conomic først");
    const journalNumber = args.journalNumber === null ? null : requireAccountNumber(args.journalNumber, "Kassekladden");
    const bankAccountNumber = requireAccountNumber(args.bankAccountNumber, "Bankkontoen");
    // A manual balance belongs to the account it was entered for.
    await ctx.db.patch("economicSettings", settings._id, {
      journalNumber, bankAccountNumber, updatedAt: Date.now(),
      ...(bankAccountNumber !== settings.bankAccountNumber ? { manualBankBalance: undefined } : {}),
    });
    await recordAudit(ctx, auth, { action: "economic.optionsSaved", entityTable: "economicSettings", entityId: settings._id, summary: "e-conomic-indstillingerne for Økonomi er gemt" });
    return null;
  },
});

export const disconnect = mutation({
  args: { expectedOrganizationId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireManager(ctx);
    requireExpectedOrganization(auth.organizationId, args.expectedOrganizationId);
    const settings = await economicSettingsFor(ctx, auth.organizationId);
    if (!settings) return null;
    await ctx.db.delete("economicSettings", settings._id);
    await recordAudit(ctx, auth, { action: "economic.disconnected", entityTable: "economicSettings", entityId: settings._id, summary: "Forbindelsen til e-conomic er fjernet" });
    return null;
  },
});

export async function decryptEconomicCredentials(settings: Doc<"economicSettings">, key: string | null): Promise<EconomicCredentials> {
  const [appSecretToken, agreementGrantToken] = await Promise.all([
    decryptCredential(settings.encryptedAppSecretToken, settings.organizationId, key),
    decryptCredential(settings.encryptedAgreementGrantToken, settings.organizationId, key),
  ]);
  return { appSecretToken, agreementGrantToken };
}

export const getManagerCredentials = internalMutation({
  args: {},
  returns: v.object({ appSecretToken: v.string(), agreementGrantToken: v.string() }),
  handler: async (ctx) => {
    const auth = await requireManager(ctx);
    const settings = await economicSettingsFor(ctx, auth.organizationId);
    if (!settings) throw new ConvexError("Forbind e-conomic først");
    return decryptEconomicCredentials(settings, await ensureOrganizationCredentialKey(ctx, auth.organizationId));
  },
});

export const listJournals = action({
  args: {},
  returns: v.array(v.object({ journalNumber: v.number(), name: v.string() })),
  handler: async (ctx): Promise<Array<{ journalNumber: number; name: string }>> => {
    const credentials: EconomicCredentials = await ctx.runMutation(internal.economic.getManagerCredentials, {});
    return listEconomicJournals(credentials);
  },
});
