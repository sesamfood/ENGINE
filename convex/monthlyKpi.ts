import { ConvexError, v } from "convex/values";
import { hasPermission } from "../lib/auth-permissions";
import {
  buildMonthlyKpiReport, kpiCell, kpiCutoff, kpiMonthEnd, kpiMonths, previousKpiMonth,
  validateKpiMonth, type MonthlyKpiInputs,
} from "../lib/dashboard/monthly-kpi";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import {
  requireBudgetManager, requireFinancialReportViewer, requireHumanPrincipal,
  requireLocationAccess, type OrganizationAuth,
} from "./lib/auth";
import { recordAudit } from "./lib/audit";
import { requireOrganizationLocation } from "./lib/locations";
import { resolveLocationCurrency } from "./lib/masterData";
import { rateLimiter } from "./lib/rateLimits";
import {
  monthlyKpiInputsValidator, monthlyKpiReportValidator,
  nullableKpiNumber as nullableNumber,
} from "./lib/monthlyKpiValidators";
import { resolveTimeZone } from "./lib/timeZone";
import { queueFinancialRange, readFinancialMonths } from "./onlinePosFinancial";
import { queueLaborMonth, readLaborMonths } from "./workfeedLabor";

const locationIdsValidator = v.union(v.array(v.id("locations")), v.null());
function requireMonth(month: string) {
  try {
    if (month < "1900-01" || month > "9998-12") throw new Error("Invalid reporting year");
    return validateKpiMonth(month);
  }
  catch { throw new ConvexError("Vælg en gyldig måned"); }
}

async function selectedLocations(ctx: QueryCtx, auth: OrganizationAuth, locationIds: Id<"locations">[] | null) {
  const ids = locationIds === null && !auth.locationScope.all ? [...auth.locationScope.ids] : locationIds;
  if (ids && ids.length > 200) throw new ConvexError("Vælg højst 200 lokationer");
  const locations = ids === null
    ? await ctx.db.query("locations").withIndex("by_organizationId_and_normalizedName", (q) => q.eq("organizationId", auth.organizationId)).take(201)
    : await Promise.all([...new Set(ids)].map(async (id) => {
      requireLocationAccess(auth, id);
      return requireOrganizationLocation(ctx, auth.organizationId, id);
    }));
  if (locations.length > 200) throw new ConvexError("Vælg højst 200 lokationer");
  return Promise.all(locations.map(async (location) => ({
    id: location._id,
    name: location.name,
    currency: await resolveLocationCurrency(ctx, auth.organizationId, location),
    timeZone: await resolveTimeZone(ctx, auth.organizationId, location._id),
  })));
}

async function latestBudget(ctx: QueryCtx, organizationId: string, locationId: Id<"locations">, month: string) {
  return ctx.db.query("monthlyKpiBudgets")
    .withIndex("by_organizationId_and_locationId_and_month_and_revision", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", locationId).eq("month", month))
    .order("desc").first();
}

function commonCutoff(month: string, now: number, timeZones: string[]) {
  const cutoffs = timeZones.map((timeZone) => kpiCutoff(month, now, timeZone));
  if (cutoffs.some((cutoff) => cutoff === null)) return null;
  return cutoffs.reduce<string | null>((earliest, cutoff) =>
    cutoff !== null && (earliest === null || cutoff < earliest) ? cutoff : earliest, null);
}

export const getContext = query({
  args: {},
  returns: v.object({
    locations: v.array(v.object({ id: v.id("locations"), name: v.string(), currency: v.string() })),
    organizationId: v.string(), timeZone: v.string(), canManageBudgets: v.boolean(), canSync: v.boolean(),
  }),
  handler: async (ctx) => {
    const auth = await requireFinancialReportViewer(ctx);
    const locations = await selectedLocations(ctx, auth, null);
    return {
      locations: locations.map(({ id, name, currency }) => ({ id, name, currency })),
      organizationId: auth.organizationId,
      timeZone: await resolveTimeZone(ctx, auth.organizationId),
      canManageBudgets: auth.principalKind === "user" && hasPermission(auth.role, auth.permissions, "dashboard.manageBudgets"),
      canSync: auth.principalKind === "user" && hasPermission(auth.role, auth.permissions, "integrations.manage"),
    };
  },
});

export async function readInputs(ctx: QueryCtx, args: { month: string; locationIds: Id<"locations">[] | null; now: number }): Promise<MonthlyKpiInputs> {
  const auth = await requireFinancialReportViewer(ctx);
  const month = requireMonth(args.month);
  if (!Number.isFinite(new Date(args.now).getTime())) throw new ConvexError("Tidspunktet er ugyldigt");
  const now = args.now;
  const locations = await selectedLocations(ctx, auth, args.locationIds);
  const timeZone = await resolveTimeZone(ctx, auth.organizationId);
  const timeZones = [timeZone, ...locations.map((location) => location.timeZone)];
  const requests = kpiMonths(month).flatMap((period) => {
    const through = commonCutoff(period, now, timeZones);
    return through === null ? [] : [{ month: period, through }];
  });
  const currencies = new Set(locations.map((location) => location.currency));
  const currency = currencies.size === 1 ? locations[0].currency : null;
  const entries = await Promise.all(locations.map(async (location) => {
    const sourceArgs = { organizationId: auth.organizationId, locationId: location.id, months: requests };
    const [sales, labour, budget, actuals] = await Promise.all([
      readFinancialMonths(ctx, sourceArgs), readLaborMonths(ctx, sourceArgs),
      latestBudget(ctx, auth.organizationId, location.id, month),
      Promise.all(requests.map((request) => latestActuals(ctx, auth.organizationId, location.id, request.month))),
    ]);
    const sourceCell = (amount: number | null, reason: string | null, sourceCurrency: string | null,
      source: string, estimated = false, approved = false, monetary = true) => {
      if (amount === null) return kpiCell(null, `${location.name}: ${reason ?? "Data mangler"}`, estimated, source);
      if (monetary && (currency === null || sourceCurrency !== currency)) {
        return kpiCell(null, currency === null ? "Vælg lokationer med samme valuta" : `${location.name}: Valutaen skal kontrolleres`, estimated, source);
      }
      return kpiCell(amount, null, estimated, source, approved ? "approved" : "ready");
    };
    const periods = requests.map((request, index) => {
      const actual = request.through === kpiMonthEnd(request.month) ? actuals[index] : null;
      const manualSource = actual ? `Manuelle månedstal: ${location.name}, ${request.month}, revision ${actual.revision}` : "Manuelle månedstal";
      return {
        month: request.month,
        sales: sourceCell(sales[index].netRevenue, sales[index].reason, sales[index].currency, "POS"),
        transactions: sourceCell(sales[index].transactionCount, sales[index].reason, sales[index].currency, "POS", false, false, false),
        labour: sourceCell(labour[index].amount, labour[index].reason, labour[index].currency, "Workfeed", true),
        cogs: sourceCell(actual?.cogs ?? null, "Godkendt, lagerreguleret vareforbrug mangler", actual?.currency ?? null, manualSource, false, true),
        waste: sourceCell(actual?.waste ?? null, "Godkendt registreret Waste-beløb mangler", actual?.currency ?? null, manualSource, false, true),
        rent: kpiCell(null, "Husleje fra e-conomic mangler", false, "e-conomic"),
        utilities: kpiCell(null, "Forbrug fra e-conomic mangler", false, "e-conomic"),
        other: kpiCell(null, "Øvrige driftsomkostninger fra e-conomic mangler", false, "e-conomic"),
      };
    });
    const budgetSource = budget ? `Manuelt budget: ${location.name}, ${month}, revision ${budget.revision}` : "Manuelt budget";
    const budgetCell = (value: number | null, monetary = true) => sourceCell(value, "Budget mangler", budget?.currency ?? location.currency, budgetSource, false, true, monetary);
    return {
      id: location.id, name: location.name, currency: location.currency, periods,
      budget: {
        sales: budgetCell(budget?.sales ?? null), transactions: budgetCell(budget?.transactions ?? null, false),
        labour: budgetCell(budget?.labour ?? null), cogs: budgetCell(budget?.cogs ?? null),
        waste: budgetCell(budget?.waste ?? null), rent: budgetCell(budget?.rent ?? null),
        utilities: budgetCell(budget?.utilities ?? null), other: budgetCell(budget?.other ?? null),
        guestScore: budgetCell(budget?.guestScore ?? null, false),
      },
      syncedAt: [...sales.map((item) => item.syncedAt), ...labour.map((item) => item.syncedAt)],
    };
  }));
  const syncedAt = entries.flatMap((entry) => entry.syncedAt).filter((value): value is number => value !== null);
  const inputs = {
    organizationId: auth.organizationId, month, through: commonCutoff(month, now, timeZones), currency,
    periods: requests, locations: entries.map(({ id, name, currency, periods, budget }) => ({ id, name, currency, periods, budget })),
    updatedAt: syncedAt.length ? Math.min(...syncedAt) : null,
  };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(inputs)));
  const revision = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { ...inputs, revision };
}

const reportArgs = { month: v.string(), locationIds: locationIdsValidator, now: v.number() };
export const getInputs = internalQuery({
  args: reportArgs, returns: monthlyKpiInputsValidator,
  handler: readInputs,
});

export const getReport = query({
  args: reportArgs, returns: monthlyKpiReportValidator,
  handler: async (ctx, args) => buildMonthlyKpiReport(await readInputs(ctx, args)),
});

const budgetValues = {
  sales: nullableNumber, transactions: nullableNumber, labour: nullableNumber, cogs: nullableNumber,
  waste: nullableNumber, rent: nullableNumber, utilities: nullableNumber, other: nullableNumber, guestScore: nullableNumber,
};

export const getBudget = query({
  args: { month: v.string(), locationId: v.id("locations") },
  returns: v.object({ ...budgetValues, sourceNote: v.string(), currency: v.string(), revision: v.number() }),
  handler: async (ctx, args) => {
    const auth = await requireBudgetManager(ctx);
    requireMonth(args.month);
    requireLocationAccess(auth, args.locationId);
    const location = await requireOrganizationLocation(ctx, auth.organizationId, args.locationId);
    const currency = await resolveLocationCurrency(ctx, auth.organizationId, location);
    const budget = await latestBudget(ctx, auth.organizationId, args.locationId, args.month);
    const sameCurrency = budget?.currency === currency;
    return { sales: sameCurrency ? budget.sales : null, transactions: budget?.transactions ?? null,
      labour: sameCurrency ? budget.labour : null, cogs: sameCurrency ? budget.cogs ?? null : null,
      waste: sameCurrency ? budget.waste ?? null : null, rent: sameCurrency ? budget.rent ?? null : null,
      utilities: sameCurrency ? budget.utilities ?? null : null, other: sameCurrency ? budget.other ?? null : null,
      guestScore: budget?.guestScore ?? null, sourceNote: budget?.sourceNote ?? "", currency, revision: budget?.revision ?? 0 };
  },
});

function requireSourceNote(note: string) {
  const trimmed = note.trim();
  if (!trimmed || trimmed.length > 1000) throw new ConvexError("Angiv en kilde eller reference på højst 1.000 tegn");
  return trimmed;
}

function requireRevision(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) throw new ConvexError("Revisionen er ugyldig");
}

export const saveBudget = mutation({
  args: { month: v.string(), locationId: v.id("locations"), ...budgetValues,
    sourceNote: v.string(), expectedRevision: v.number(), expectedCurrency: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireBudgetManager(ctx);
    requireMonth(args.month);
    requireLocationAccess(auth, args.locationId);
    const location = await requireOrganizationLocation(ctx, auth.organizationId, args.locationId);
    for (const value of [args.sales, args.transactions, args.labour, args.cogs, args.waste, args.rent, args.utilities, args.other]) {
      if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw new ConvexError("Budgettal skal være positive heltal eller nul");
    }
    if (args.guestScore !== null && (!Number.isFinite(args.guestScore) || args.guestScore < 1 || args.guestScore > 5)) throw new ConvexError("Guest Score-målet skal være mellem 1 og 5");
    requireRevision(args.expectedRevision);
    const sourceNote = requireSourceNote(args.sourceNote);
    const previous = await latestBudget(ctx, auth.organizationId, args.locationId, args.month);
    if ((previous?.revision ?? 0) !== args.expectedRevision) throw new ConvexError("Budgettet er ændret. Indlæs det igen, før du gemmer");
    const currency = await resolveLocationCurrency(ctx, auth.organizationId, location);
    if (currency !== args.expectedCurrency) throw new ConvexError("Valutaen er ændret. Indlæs budgettet igen, før du gemmer");
    const id = await ctx.db.insert("monthlyKpiBudgets", {
      organizationId: auth.organizationId, locationId: args.locationId, month: args.month, currency, sourceNote,
      sales: args.sales, transactions: args.transactions, labour: args.labour, cogs: args.cogs,
      waste: args.waste, rent: args.rent, utilities: args.utilities, other: args.other, guestScore: args.guestScore,
      revision: args.expectedRevision + 1, updatedAt: Date.now(), updatedBy: auth.userId,
    });
    await recordAudit(ctx, auth, { action: "monthlyKpi.budgetSaved", entityTable: "monthlyKpiBudgets", entityId: id,
      locationId: args.locationId, summary: `Månedsbudget for ${args.month} er gemt, revision ${args.expectedRevision + 1}`, reason: sourceNote });
    return null;
  },
});

async function latestActuals(ctx: QueryCtx, organizationId: string, locationId: Id<"locations">, month: string) {
  return ctx.db.query("monthlyKpiActuals")
    .withIndex("by_organizationId_and_locationId_and_month_and_revision", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", locationId).eq("month", month))
    .order("desc").first();
}

const actualValues = { cogs: nullableNumber, waste: nullableNumber };
const actualRevisionValidator = v.object({
  ...actualValues, currency: v.string(), sourceNote: v.string(), revision: v.number(), approvedAt: v.number(),
});

export const getActuals = query({
  args: { month: v.string(), locationId: v.id("locations"), now: v.number() },
  returns: v.object({ ...actualValues, sourceNote: v.string(), currency: v.string(), revision: v.number(),
    canApprove: v.boolean(), history: v.array(actualRevisionValidator), hasMoreHistory: v.boolean() }),
  handler: async (ctx, args) => {
    const auth = await requireBudgetManager(ctx);
    const month = requireMonth(args.month);
    if (!Number.isFinite(new Date(args.now).getTime())) throw new ConvexError("Tidspunktet er ugyldigt");
    requireLocationAccess(auth, args.locationId);
    const location = await requireOrganizationLocation(ctx, auth.organizationId, args.locationId);
    const currency = await resolveLocationCurrency(ctx, auth.organizationId, location);
    const rows = await ctx.db.query("monthlyKpiActuals")
      .withIndex("by_organizationId_and_locationId_and_month_and_revision", (q) =>
        q.eq("organizationId", auth.organizationId).eq("locationId", args.locationId).eq("month", month))
      .order("desc").take(21);
    const latest = rows[0];
    const through = commonCutoff(month, args.now, [await resolveTimeZone(ctx, auth.organizationId), await resolveTimeZone(ctx, auth.organizationId, args.locationId)]);
    return { cogs: latest?.currency === currency ? latest.cogs : null, waste: latest?.currency === currency ? latest.waste : null,
      sourceNote: latest?.sourceNote ?? "", currency, revision: latest?.revision ?? 0,
      canApprove: through === kpiMonthEnd(month), hasMoreHistory: rows.length > 20,
      history: rows.slice(0, 20).map(({ cogs, waste, currency, sourceNote, revision, approvedAt }) => ({ cogs, waste, currency, sourceNote, revision, approvedAt })) };
  },
});

export const approveActuals = mutation({
  args: { month: v.string(), locationId: v.id("locations"), ...actualValues,
    sourceNote: v.string(), expectedRevision: v.number(), expectedCurrency: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireBudgetManager(ctx);
    const month = requireMonth(args.month);
    requireLocationAccess(auth, args.locationId);
    const location = await requireOrganizationLocation(ctx, auth.organizationId, args.locationId);
    const through = commonCutoff(month, Date.now(), [await resolveTimeZone(ctx, auth.organizationId), await resolveTimeZone(ctx, auth.organizationId, args.locationId)]);
    if (through !== kpiMonthEnd(month)) throw new ConvexError("Godkendelse kræver en afsluttet kalendermåned");
    for (const value of [args.cogs, args.waste]) {
      if (value !== null && !Number.isSafeInteger(value)) throw new ConvexError("Beløb skal være et helt antal øre");
    }
    requireRevision(args.expectedRevision);
    const sourceNote = requireSourceNote(args.sourceNote);
    const previous = await latestActuals(ctx, auth.organizationId, args.locationId, month);
    if ((previous?.revision ?? 0) !== args.expectedRevision) throw new ConvexError("Tallene er ændret. Indlæs dem igen, før du godkender");
    const currency = await resolveLocationCurrency(ctx, auth.organizationId, location);
    if (currency !== args.expectedCurrency) throw new ConvexError("Valutaen er ændret. Indlæs tallene igen, før du godkender");
    const id = await ctx.db.insert("monthlyKpiActuals", {
      organizationId: auth.organizationId, locationId: args.locationId, month, currency,
      cogs: args.cogs, waste: args.waste, sourceNote, revision: args.expectedRevision + 1,
      approvedAt: Date.now(), approvedBy: auth.userId,
    });
    await recordAudit(ctx, auth, { action: "monthlyKpi.actualsApproved", entityTable: "monthlyKpiActuals", entityId: id,
      locationId: args.locationId, summary: `Manuelle månedstal for ${month} er godkendt, revision ${args.expectedRevision + 1}`, reason: sourceNote });
    return null;
  },
});

export const requestSync = mutation({
  args: { month: v.string(), locationIds: locationIdsValidator },
  returns: v.object({ queued: v.number() }),
  handler: async (ctx, args) => {
    const auth = requireHumanPrincipal(await requireFinancialReportViewer(ctx));
    if (!hasPermission(auth.role, auth.permissions, "integrations.manage")) throw new ConvexError("Du har ikke adgang til at opdatere integrationerne");
    requireMonth(args.month);
    const locations = await selectedLocations(ctx, auth, args.locationIds);
    if (!locations.length) return { queued: 0 };
    const now = Date.now();
    const timeZone = await resolveTimeZone(ctx, auth.organizationId);
    const timeZones = [timeZone, ...locations.map((location) => location.timeZone)];
    const through = commonCutoff(args.month, now, timeZones)
      ?? commonCutoff(previousKpiMonth(args.month), now, timeZones);
    if (through === null) throw new ConvexError("Måneden har endnu ingen afsluttede dage");
    const limited = await rateLimiter.limit(ctx, "monthlyKpiSync", { key: auth.organizationId });
    if (!limited.ok) throw new ConvexError("Opdateringen er startet for nylig. Prøv igen om fem minutter");
    await ctx.scheduler.runAfter(0, internal.monthlyKpi.dispatchSync, {
      organizationId: auth.organizationId, locationIds: locations.map((location) => location.id),
      month: args.month, through, offset: 0,
    });
    return { queued: locations.length };
  },
});

export const dispatchSync = internalMutation({
  args: { organizationId: v.string(), locationIds: v.array(v.id("locations")), month: v.string(), through: v.string(), offset: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const locationId = args.locationIds[args.offset];
    if (!locationId) return null;
    const location = await ctx.db.get("locations", locationId);
    if (location?.organizationId === args.organizationId) {
      const months = kpiMonths(args.month);
      await queueFinancialRange(ctx, { organizationId: args.organizationId, locationId,
        fromMonth: months[0], toMonth: args.month, through: args.through });
      const timeZone = await resolveTimeZone(ctx, args.organizationId);
      for (const month of months) {
        if (month > args.through.slice(0, 7)) continue;
        const through = month === args.through.slice(0, 7) ? args.through : kpiCutoff(month, Date.now(), timeZone);
        if (through !== null) await queueLaborMonth(ctx, { organizationId: args.organizationId, locationId, month, through });
      }
    }
    if (args.offset + 1 < args.locationIds.length) {
      await ctx.scheduler.runAfter(0, internal.monthlyKpi.dispatchSync, { ...args, offset: args.offset + 1 });
    }
    return null;
  },
});
