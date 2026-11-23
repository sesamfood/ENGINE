import { ConvexError, v, type Infer } from "convex/values";
import { hasPermission } from "../../../lib/auth-permissions";
import { dateKey } from "../../../lib/date";
import { internal } from "../../_generated/api";
import { action, internalMutation, mutation, query, type ActionCtx, type MutationCtx, type QueryCtx } from "../../_generated/server";
import { ensureOrganizationCredentialKey } from "../credentials";
import { requireIntegrationEnabled } from "../state";
import { recordAudit } from "../../lib/audit";
import { requireAllLocationAccess, requireHumanPrincipal, requirePermission } from "../../lib/auth";
import { resolveTimeZone } from "../../lib/timeZone";
import { decryptEconomicCredentials, economicSettingsFor } from "./api";
import { getEconomicFinanceData } from "./lib/api";

// Økonomi shows organization-wide bank data, so it needs access to every location.
async function requireFinance(ctx: QueryCtx | MutationCtx | ActionCtx, permission: "finance.view" | "finance.editBankBalance" = "finance.view") {
  const auth = requireHumanPrincipal(await requirePermission(ctx, permission));
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  requireAllLocationAccess(auth);
  await requireIntegrationEnabled(ctx, auth.organizationId, "economic");
  return auth;
}

const paymentValidator = v.object({
  entryNumber: v.number(), supplierName: v.string(), date: v.string(), dueDate: v.union(v.string(), v.null()),
  text: v.string(), voucherNumber: v.union(v.number(), v.null()), amount: v.number(),
});
const journalEntryValidator = v.object({
  key: v.string(), date: v.string(), dueDate: v.union(v.string(), v.null()), text: v.string(),
  voucherNumber: v.union(v.number(), v.null()), accountNumber: v.union(v.number(), v.null()),
  supplierName: v.union(v.string(), v.null()), amount: v.number(),
});

export const getOverview = query({
  args: {},
  returns: v.object({
    organizationId: v.string(),
    connection: v.union(v.null(), v.object({
      agreementNumber: v.union(v.number(), v.null()), companyName: v.string(), currency: v.string(), connectedAt: v.number(),
      journalNumber: v.union(v.number(), v.null()), bankAccountNumber: v.number(),
      manualBankBalance: v.union(v.null(), v.object({ amount: v.number(), enteredAt: v.number(), enteredByName: v.string() })),
    })),
    canEditBankBalance: v.boolean(),
  }),
  handler: async (ctx) => {
    const auth = await requireFinance(ctx);
    const settings = await economicSettingsFor(ctx, auth.organizationId);
    return {
      organizationId: auth.organizationId,
      connection: settings && {
        agreementNumber: settings.agreementNumber, companyName: settings.companyName, currency: settings.currency, connectedAt: settings.connectedAt,
        journalNumber: settings.journalNumber, bankAccountNumber: settings.bankAccountNumber,
        manualBankBalance: settings.manualBankBalance ?? null,
      },
      canEditBankBalance: hasPermission(auth.role, auth.permissions, "finance.editBankBalance"),
    };
  },
});

const readContextValidator = v.object({
  credentials: v.object({ appSecretToken: v.string(), agreementGrantToken: v.string() }),
  today: v.string(), journalNumber: v.union(v.number(), v.null()), bankAccountNumber: v.number(),
});

export const getReadContext = internalMutation({
  args: {},
  returns: readContextValidator,
  handler: async (ctx) => {
    const auth = await requireFinance(ctx);
    const settings = await economicSettingsFor(ctx, auth.organizationId);
    if (!settings) throw new ConvexError("e-conomic er ikke forbundet. En Administrator kan forbinde den under Integrationer.");
    return {
      credentials: await decryptEconomicCredentials(settings, await ensureOrganizationCredentialKey(ctx, auth.organizationId)),
      today: dateKey(Date.now(), await resolveTimeZone(ctx, auth.organizationId)),
      journalNumber: settings.journalNumber, bankAccountNumber: settings.bankAccountNumber,
    };
  },
});

// Reads e-conomic on each request. Provider data is not stored.
const financeDataValidator = v.object({
  fetchedAt: v.number(),
  today: v.string(),
  payments: v.array(paymentValidator),
  journalEntries: v.union(v.null(), v.array(journalEntryValidator)),
  journalError: v.union(v.string(), v.null()),
  bankBalance: v.union(v.number(), v.null()),
  bankAccountError: v.union(v.string(), v.null()),
});

export const fetchData = action({
  args: {},
  returns: financeDataValidator,
  handler: async (ctx): Promise<Infer<typeof financeDataValidator>> => {
    const { credentials, ...options }: Infer<typeof readContextValidator> = await ctx.runMutation(internal.economicFinance.getReadContext, {});
    const data = await getEconomicFinanceData(credentials, options);
    return { fetchedAt: Date.now(), today: options.today, ...data };
  },
});

export const setManualBankBalance = mutation({
  args: { expectedOrganizationId: v.string(), expectedBankAccountNumber: v.number(), expectedConnectedAt: v.number(), amount: v.union(v.number(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireFinance(ctx, "finance.editBankBalance");
    if (auth.organizationId !== args.expectedOrganizationId) throw new ConvexError("Organisationen er ændret. Indlæs siden igen");
    const settings = await economicSettingsFor(ctx, auth.organizationId);
    if (!settings) throw new ConvexError("Forbind e-conomic først");
    if (settings.bankAccountNumber !== args.expectedBankAccountNumber || settings.connectedAt !== args.expectedConnectedAt) throw new ConvexError("Forbindelsen eller bankkontoen er ændret. Indlæs siden igen");
    if (args.amount !== null && (!Number.isSafeInteger(args.amount) || Math.abs(args.amount) > 100_000_000_000_00)) {
      throw new ConvexError("Angiv en gyldig banksaldo");
    }
    await ctx.db.patch("economicSettings", settings._id, {
      manualBankBalance: args.amount === null ? undefined : { amount: args.amount, enteredAt: Date.now(), enteredByName: auth.userName },
      updatedAt: Date.now(),
    });
    await recordAudit(ctx, auth, {
      action: "economic.bankBalanceSet", entityTable: "economicSettings", entityId: settings._id,
      summary: args.amount === null ? "Den indtastede banksaldo er fjernet" : "Banksaldoen er indtastet",
    });
    return null;
  },
});
