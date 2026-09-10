import { ConvexError, v } from "convex/values";
import { hasPermission } from "../lib/auth-permissions";
import {
  kpiCell, kpiCutoff, kpiMonths, kpiVariance, previousKpiMonth,
  ratioKpiCells, sumKpiCells, validateKpiMonth,
  type MonthlyKpiCell, type MonthlyKpiRow,
} from "../lib/dashboard/monthly-kpi";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type QueryCtx } from "./_generated/server";
import {
  requireBudgetManager, requireFinancialReportViewer, requireHumanPrincipal,
  requireLocationAccess, type OrganizationAuth,
} from "./lib/auth";
import { recordAudit } from "./lib/audit";
import { requireOrganizationLocation } from "./lib/locations";
import { resolveLocationCurrency } from "./lib/masterData";
import { rateLimiter } from "./lib/rateLimits";
import { resolveTimeZone } from "./lib/timeZone";
import { queueFinancialRange, readFinancialMonths } from "./onlinePosFinancial";
import { queueLaborMonth, readLaborMonths } from "./workfeedLabor";

const locationIdsValidator = v.union(v.array(v.id("locations")), v.null());
const nullableNumber = v.union(v.number(), v.null());
const nullableString = v.union(v.string(), v.null());
const cellValidator = v.object({ value: nullableNumber, reason: nullableString, estimated: v.boolean() });
const rowValidator = v.object({
  id: v.union(v.literal("salesRevenue"), v.literal("salesOrderCount"), v.literal("averageBasket"), v.literal("estimatedLabourPercent")),
  label: v.string(),
  unit: v.union(v.literal("currency"), v.literal("count"), v.literal("percent")),
  actual: cellValidator, budget: cellValidator, variance: cellValidator, lastMonth: cellValidator, ytd: cellValidator,
});

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
    timeZone: v.string(), canManageBudgets: v.boolean(), canSync: v.boolean(),
  }),
  handler: async (ctx) => {
    const auth = await requireFinancialReportViewer(ctx);
    const locations = await selectedLocations(ctx, auth, null);
    return {
      locations: locations.map(({ id, name, currency }) => ({ id, name, currency })),
      timeZone: await resolveTimeZone(ctx, auth.organizationId),
      canManageBudgets: auth.principalKind === "user" && hasPermission(auth.role, auth.permissions, "dashboard.manageBudgets"),
      canSync: auth.principalKind === "user" && hasPermission(auth.role, auth.permissions, "integrations.manage"),
    };
  },
});

export const getReport = query({
  args: { month: v.string(), locationIds: locationIdsValidator, now: v.number() },
  returns: v.object({ month: v.string(), through: nullableString, currency: nullableString, rows: v.array(rowValidator), updatedAt: nullableNumber }),
  handler: async (ctx, args) => {
    const auth = await requireFinancialReportViewer(ctx);
    const month = requireMonth(args.month);
    if (!Number.isFinite(new Date(args.now).getTime())) throw new ConvexError("Tidspunktet er ugyldigt");
    const locations = await selectedLocations(ctx, auth, args.locationIds);
    const timeZone = await resolveTimeZone(ctx, auth.organizationId);
    const timeZones = [timeZone, ...locations.map((location) => location.timeZone)];
    const months = kpiMonths(month);
    const requests = months.flatMap((period) => {
      const through = commonCutoff(period, args.now, timeZones);
      return through === null ? [] : [{ month: period, through }];
    });
    const currencies = new Set(locations.map((location) => location.currency));
    const currency = currencies.size === 1 ? locations[0].currency : null;
    const entries = await Promise.all(locations.map(async (location) => {
      const sourceArgs = { organizationId: auth.organizationId, locationId: location.id, months: requests };
      const [sales, labour, budget] = await Promise.all([
        readFinancialMonths(ctx, sourceArgs), readLaborMonths(ctx, sourceArgs),
        latestBudget(ctx, auth.organizationId, location.id, month),
      ]);
      const sourceCell = (amount: number | null, reason: string | null, sourceCurrency: string | null, monetary = true) => {
        if (amount === null) return kpiCell(null, `${location.name}: ${reason ?? "Data mangler"}`);
        if (monetary && (currency === null || sourceCurrency !== currency)) {
          return kpiCell(null, currency === null ? "Vælg lokationer med samme valuta" : `${location.name}: Valutaen skal kontrolleres`);
        }
        return kpiCell(amount, amount === null ? `${location.name}: ${reason ?? "Data mangler"}` : null);
      };
      const periods = requests.map((request, index) => ({
        month: request.month,
        sales: sourceCell(sales[index].netRevenue, sales[index].reason, sales[index].currency),
        transactions: sourceCell(sales[index].transactionCount, sales[index].reason, sales[index].currency, false),
        labour: sourceCell(labour[index].amount, labour[index].reason, labour[index].currency),
      }));
      const budgetCell = (value: number | null, monetary = true) => sourceCell(
        value, "Budget mangler", budget?.currency ?? location.currency, monetary,
      );
      return {
        periods,
        budget: {
          sales: budgetCell(budget?.sales ?? null),
          transactions: budgetCell(budget?.transactions ?? null, false),
          labour: budgetCell(budget?.labour ?? null),
        },
        syncedAt: [...sales.map((item) => item.syncedAt), ...labour.map((item) => item.syncedAt)],
      };
    }));
    type Component = "sales" | "transactions" | "labour";
    const total = (component: Component, includedMonths: string[]) => includedMonths.length === 0
      ? kpiCell(null, "Perioden har endnu ingen afsluttede dage")
      : sumKpiCells(entries.flatMap((entry) =>
        includedMonths.map((period) => entry.periods.find((item) => item.month === period)?.[component]
          ?? kpiCell(null, "Perioden har endnu ingen afsluttede dage"))));
    const totalsFor = (includedMonths: string[]) => ({
      sales: total("sales", includedMonths),
      transactions: total("transactions", includedMonths),
      labour: total("labour", includedMonths),
    });
    const actual = totalsFor([month]);
    const previous = totalsFor([previousKpiMonth(month)]);
    const year = totalsFor(requests.map((period) => period.month).filter((period) => period.slice(0, 4) === month.slice(0, 4)));
    const budget = {
      sales: sumKpiCells(entries.map((entry) => entry.budget.sales)),
      transactions: sumKpiCells(entries.map((entry) => entry.budget.transactions)),
      labour: sumKpiCells(entries.map((entry) => entry.budget.labour)),
    };
    const money = (cell: MonthlyKpiCell) => kpiCell(cell.value === null ? null : cell.value / 100, cell.reason);
    const row = (id: MonthlyKpiRow["id"], label: string, unit: MonthlyKpiRow["unit"],
      compute: (amounts: typeof actual, isBudget: boolean) => MonthlyKpiCell): MonthlyKpiRow => {
      const actualCell = compute(actual, false);
      const budgetResult = compute(budget, true);
      return { id, label, unit, actual: actualCell, budget: budgetResult,
        variance: kpiVariance(actualCell, budgetResult), lastMonth: compute(previous, false), ytd: compute(year, false) };
    };
    const rows = [
      row("salesRevenue", "Nettoomsætning", "currency", (amounts) => money(amounts.sales)),
      row("salesOrderCount", "Transaktioner", "count", (amounts) => amounts.transactions),
      row("averageBasket", "Gennemsnitlig kurv", "currency", (amounts) => ratioKpiCells(amounts.sales, amounts.transactions, 0.01)),
      row("estimatedLabourPercent", "Lønprocent, estimat", "percent", (amounts, isBudget) => ratioKpiCells(amounts.labour, amounts.sales, 100, !isBudget)),
    ];
    const syncedAt = entries.flatMap((entry) => entry.syncedAt).filter((value): value is number => value !== null);
    return { month, through: commonCutoff(month, args.now, timeZones), currency, rows,
      updatedAt: syncedAt.length ? Math.min(...syncedAt) : null };
  },
});

export const getBudget = query({
  args: { month: v.string(), locationId: v.id("locations") },
  returns: v.object({ sales: nullableNumber, transactions: nullableNumber, labour: nullableNumber, currency: v.string(), revision: v.number() }),
  handler: async (ctx, args) => {
    const auth = await requireBudgetManager(ctx);
    requireMonth(args.month);
    requireLocationAccess(auth, args.locationId);
    const location = await requireOrganizationLocation(ctx, auth.organizationId, args.locationId);
    const currency = await resolveLocationCurrency(ctx, auth.organizationId, location);
    const budget = await latestBudget(ctx, auth.organizationId, args.locationId, args.month);
    const sameCurrency = budget?.currency === currency;
    return { sales: sameCurrency ? budget.sales : null, transactions: budget?.transactions ?? null,
      labour: sameCurrency ? budget.labour : null, currency, revision: budget?.revision ?? 0 };
  },
});

export const saveBudget = mutation({
  args: { month: v.string(), locationId: v.id("locations"), sales: nullableNumber, transactions: nullableNumber,
    labour: nullableNumber, expectedRevision: v.number(), expectedCurrency: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireBudgetManager(ctx);
    requireMonth(args.month);
    requireLocationAccess(auth, args.locationId);
    const location = await requireOrganizationLocation(ctx, auth.organizationId, args.locationId);
    for (const value of [args.sales, args.transactions, args.labour, args.expectedRevision]) {
      if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw new ConvexError("Budgettal skal være positive heltal eller nul");
    }
    const previous = await latestBudget(ctx, auth.organizationId, args.locationId, args.month);
    if ((previous?.revision ?? 0) !== args.expectedRevision) throw new ConvexError("Budgettet er ændret. Indlæs det igen, før du gemmer");
    const currency = await resolveLocationCurrency(ctx, auth.organizationId, location);
    if (currency !== args.expectedCurrency) throw new ConvexError("Valutaen er ændret. Indlæs budgettet igen, før du gemmer");
    if (previous && previous.currency === currency && previous.sales === args.sales
      && previous.transactions === args.transactions && previous.labour === args.labour) return null;
    const id = await ctx.db.insert("monthlyKpiBudgets", {
      organizationId: auth.organizationId, locationId: args.locationId, month: args.month, currency,
      sales: args.sales, transactions: args.transactions, labour: args.labour,
      revision: args.expectedRevision + 1, updatedAt: Date.now(), updatedBy: auth.userId,
    });
    await recordAudit(ctx, auth, { action: "monthlyKpi.budgetSaved", entityTable: "monthlyKpiBudgets", entityId: id,
      locationId: args.locationId, summary: `Månedsbudget for ${args.month} er gemt, revision ${args.expectedRevision + 1}` });
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
