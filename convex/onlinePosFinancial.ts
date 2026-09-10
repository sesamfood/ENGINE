import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalAction, internalMutation } from "./_generated/server";
import { addDays, dateKey, parseDateKey, zonedStart } from "../lib/date";
import { resolveLocationCurrency } from "./lib/masterData";
import { onlinePosErrorMessage } from "./lib/onlinePosApi";
import { requestFinancialDays } from "./lib/onlinePosFinancialApi";
import { resolveTimeZone } from "./lib/timeZone";

const LEASE_MS = 30 * 60_000;
const MAX_MONTHS = 13;

const contextValidator = v.object({
  sourceKey: v.string(),
  currency: v.string(),
  timeZone: v.string(),
  settings: v.object({ token: v.string(), companyId: v.number() }),
});

type FinancialContext = Infer<typeof contextValidator>;

type LocationArgs = { organizationId: string; locationId: Id<"locations"> };

export type FinancialMonthResult = {
  netRevenue: number | null;
  transactionCount: number | null;
  currency: string | null;
  reason: string | null;
  syncedAt: number | null;
};

async function financialContext(ctx: QueryCtx, args: LocationArgs): Promise<
  { ready: true; value: FinancialContext } | { ready: false; reason: string }
> {
  const location = await ctx.db.get("locations", args.locationId);
  if (!location || location.organizationId !== args.organizationId) {
    return { ready: false, reason: "Lokationen blev ikke fundet" };
  }
  const [master, connection, reset, sync, timeZone, currency] = await Promise.all([
    ctx.db.query("onlinePosIntegrations").withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId)).unique(),
    ctx.db.query("onlinePosLocationIntegrations").withIndex("by_organizationId_and_locationId", (q) => q.eq("organizationId", args.organizationId).eq("locationId", args.locationId)).unique(),
    ctx.db.query("onlinePosSalesResets").withIndex("by_organizationId_and_locationId", (q) => q.eq("organizationId", args.organizationId).eq("locationId", args.locationId)).unique(),
    ctx.db.query("onlinePosSyncStatus").withIndex("by_organizationId_and_locationId", (q) => q.eq("organizationId", args.organizationId).eq("locationId", args.locationId)).unique(),
    resolveTimeZone(ctx, args.organizationId, args.locationId),
    resolveLocationCurrency(ctx, args.organizationId, location),
  ]);
  if (!master?.enabled || !connection) return { ready: false, reason: "Lokationen er ikke forbundet til en aktiv OnlinePOS-integration" };
  if (reset || sync?.dayStartRerollToken) return { ready: false, reason: "Lokationens salgsdata er ved at blive genopbygget" };
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([
    connection._id, connection.companyId, connection.token, connection.connectedAt,
    connection.updatedAt, master._id, timeZone, currency,
  ])));
  const sourceKey = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  return {
    ready: true,
    value: { sourceKey, currency, timeZone, settings: { token: connection.token, companyId: connection.companyId } },
  };
}

function requireMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new ConvexError("Måneden er ugyldig");
  try { parseDateKey(`${month}-01`); } catch { throw new ConvexError("Måneden er ugyldig"); }
}

function nextMonth(month: string) {
  requireMonth(month);
  const date = parseDateKey(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
}

function requireDate(date: string) {
  try { parseDateKey(date); } catch { throw new ConvexError("Rapportens slutdato er ugyldig"); }
}

function monthThrough(month: string, through: string) {
  requireMonth(month);
  requireDate(through);
  return through < `${nextMonth(month)}-01` ? through : addDays(`${nextMonth(month)}-01`, -1);
}

function monthRange(fromMonth: string, toMonth: string, through: string) {
  requireMonth(fromMonth);
  requireMonth(toMonth);
  requireDate(through);
  if (fromMonth > toMonth) throw new ConvexError("Rapportperioden er ugyldig");
  const months: string[] = [];
  let visited = 0;
  for (let month = fromMonth; month <= toMonth; month = nextMonth(month)) {
    if (++visited > MAX_MONTHS) throw new ConvexError("Der kan højst hentes 13 måneder ad gangen");
    if (`${month}-01` <= through) months.push(month);
  }
  return months;
}

function getMonth(ctx: QueryCtx, args: LocationArgs & { month: string }) {
  return ctx.db.query("onlinePosFinancialMonths")
    .withIndex("by_organizationId_and_locationId_and_month", (q) => q.eq("organizationId", args.organizationId).eq("locationId", args.locationId).eq("month", args.month))
    .unique();
}

function unavailable(reason: string, currency: string | null = null, syncedAt: number | null = null): FinancialMonthResult {
  return { netRevenue: null, transactionCount: null, currency, reason, syncedAt };
}

export async function readFinancialMonths(ctx: QueryCtx, args: LocationArgs & {
  months: Array<{ month: string; through: string }>;
}): Promise<FinancialMonthResult[]> {
  if (args.months.length > MAX_MONTHS) throw new ConvexError("Der kan højst læses 13 måneder ad gangen");
  for (const period of args.months) { requireMonth(period.month); requireDate(period.through); }
  const context = await financialContext(ctx, args);
  if (!context.ready) return args.months.map(() => unavailable(context.reason));
  const { sourceKey, currency } = context.value;
  return Promise.all(args.months.map(async (period) => {
    const expectedThrough = monthThrough(period.month, period.through);
    if (expectedThrough < `${period.month}-01`) return unavailable("Perioden har ingen afsluttede salgsdage", currency);
    const record = await getMonth(ctx, { ...args, month: period.month });
    const snapshot = record?.snapshot;
    if (!record || record.sourceKey !== sourceKey || (snapshot && snapshot.sourceKey !== sourceKey)) {
      return unavailable("Nettoomsætningen er ikke hentet for den aktuelle OnlinePOS-forbindelse", currency);
    }
    if (record.state === "error") return unavailable(record.lastError ?? "OnlinePOS-synkroniseringen mislykkedes", currency, snapshot?.syncedAt ?? null);
    if (!snapshot || snapshot.through < expectedThrough) {
      return unavailable(record.state === "queued" || record.state === "running" ? "Nettoomsætningen bliver hentet" : "Nettoomsætningen dækker ikke hele perioden", currency, snapshot?.syncedAt ?? null);
    }
    const included = snapshot.days.filter((day) => day.date <= expectedThrough);
    return { netRevenue: included.reduce((sum, day) => sum + day.netRevenue, 0),
      transactionCount: included.reduce((sum, day) => sum + day.transactionCount, 0),
      currency, reason: null, syncedAt: snapshot.syncedAt };
  }));
}

export async function readFinancialMonth(ctx: QueryCtx, args: LocationArgs & { month: string; through: string }): Promise<FinancialMonthResult> {
  const [result] = await readFinancialMonths(ctx, { ...args, months: [{ month: args.month, through: args.through }] });
  return result;
}

const rangeArgs = {
  organizationId: v.string(),
  locationId: v.id("locations"),
  months: v.array(v.string()),
  through: v.string(),
  sourceKey: v.string(),
  runToken: v.string(),
};

export async function queueFinancialRange(ctx: MutationCtx, args: LocationArgs & {
  fromMonth: string;
  toMonth: string;
  through: string;
}): Promise<boolean> {
  const months = monthRange(args.fromMonth, args.toMonth, args.through);
  if (months.length === 0) return false;
  const context = await financialContext(ctx, args);
  if (!context.ready) return false;
  const now = Date.now();
  if (args.through >= dateKey(now, context.value.timeZone)) throw new ConvexError("OnlinePOS-rapporten kan kun hente afsluttede dage");
  const records = await Promise.all(months.map((month) => getMonth(ctx, { ...args, month })));
  const runToken = crypto.randomUUID();
  const queued: string[] = [];
  for (let index = 0; index < months.length; index += 1) {
    const month = months[index];
    const record = records[index];
    if (record && record.sourceKey === context.value.sourceKey &&
      (record.state === "queued" || record.state === "running") && now - record.updatedAt < LEASE_MS) continue;
    const values = { sourceKey: context.value.sourceKey, state: "queued" as const, runToken,
      requestedThrough: monthThrough(month, args.through), lastError: undefined, updatedAt: now };
    if (record) await ctx.db.patch(record._id, values);
    else await ctx.db.insert("onlinePosFinancialMonths", { organizationId: args.organizationId, locationId: args.locationId, month, ...values });
    queued.push(month);
  }
  if (queued.length === 0) return false;
  await ctx.scheduler.runAfter(0, internal.onlinePosFinancial.syncRange, {
    organizationId: args.organizationId, locationId: args.locationId, months: queued,
    through: args.through, sourceKey: context.value.sourceKey, runToken,
  });
  return true;
}

export const startRange = internalMutation({
  args: rangeArgs,
  returns: v.union(contextValidator, v.null()),
  handler: async (ctx, args): Promise<FinancialContext | null> => {
    const context = await financialContext(ctx, args);
    if (!context.ready || context.value.sourceKey !== args.sourceKey) return null;
    let active = false;
    for (const month of args.months) {
      const record = await getMonth(ctx, { ...args, month });
      if (record?.runToken !== args.runToken || record.sourceKey !== args.sourceKey) continue;
      await ctx.db.patch(record._id, { state: "running", updatedAt: Date.now() });
      active = true;
    }
    return active ? context.value : null;
  },
});

export const publishMonth = internalMutation({
  args: {
    ...rangeArgs,
    month: v.string(),
    days: v.array(v.object({ date: v.string(), netRevenue: v.number(), transactionCount: v.number() })),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const record = await getMonth(ctx, args);
    if (record?.runToken !== args.runToken || record.sourceKey !== args.sourceKey) return false;
    const context = await financialContext(ctx, args);
    if (!context.ready || context.value.sourceKey !== args.sourceKey) throw new ConvexError("OnlinePOS-forbindelsen er ændret. Hent salgsdata igen");
    const through = monthThrough(args.month, args.through);
    if (through !== record.requestedThrough || through >= dateKey(Date.now(), context.value.timeZone)) throw new ConvexError("Salgsdata har en forkert slutdato");
    const expected: string[] = [];
    for (let date = `${args.month}-01`; date <= through; date = addDays(date, 1)) expected.push(date);
    if (args.days.length !== expected.length || args.days.length === 0 || args.days.length > 31) throw new ConvexError("Salgsdata mangler afsluttede dage");
    let netRevenue = 0;
    let transactionCount = 0;
    const syncedAt = Date.now();
    for (let index = 0; index < expected.length; index += 1) {
      const day = args.days[index];
      if (day.date !== expected[index] || !Number.isSafeInteger(day.netRevenue) || !Number.isSafeInteger(day.transactionCount) || day.transactionCount < 0) throw new ConvexError("Salgsdata indeholder en ugyldig dagsopgørelse");
      netRevenue += day.netRevenue;
      transactionCount += day.transactionCount;
      if (!Number.isSafeInteger(netRevenue) || !Number.isSafeInteger(transactionCount)) throw new ConvexError("Salgsrapportens beløb er for store");
      const dayStart = zonedStart(day.date, context.value.timeZone);
      const daily = await ctx.db.query("salesDaily")
        .withIndex("by_organizationId_and_locationId_and_dayStart", (q) => q.eq("organizationId", args.organizationId).eq("locationId", args.locationId).eq("dayStart", dayStart))
        .unique();
      const financial = { netRevenue: day.netRevenue, transactionCount: day.transactionCount,
        currency: context.value.currency, timeZone: context.value.timeZone, syncedAt, sourceKey: args.sourceKey, version: 1 as const };
      if (daily) await ctx.db.patch(daily._id, { financial });
    }
    await ctx.db.patch(record._id, { state: "idle", runToken: undefined, lastError: undefined, updatedAt: syncedAt,
      snapshot: { netRevenue, transactionCount, currency: context.value.currency, timeZone: context.value.timeZone,
        through, syncedAt, sourceKey: args.sourceKey, version: 1, days: args.days } });
    return true;
  },
});

export const failRange = internalMutation({
  args: { ...rangeArgs, message: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const month of args.months) {
      const record = await getMonth(ctx, { ...args, month });
      if (record?.runToken !== args.runToken || record.sourceKey !== args.sourceKey) continue;
      await ctx.db.patch(record._id, { state: "error", runToken: undefined, lastError: args.message, updatedAt: Date.now() });
    }
    return null;
  },
});

export const syncRange = internalAction({
  args: rangeArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const context: FinancialContext | null = await ctx.runMutation(internal.onlinePosFinancial.startRange, args);
      if (!context) throw new ConvexError("OnlinePOS-forbindelsen er ændret. Hent salgsdata igen");
      const firstMonth = args.months[0];
      const lastMonth = args.months[args.months.length - 1];
      if (!firstMonth || !lastMonth || args.months.length > MAX_MONTHS) throw new ConvexError("Rapportperioden er ugyldig");
      const days = await requestFinancialDays({ settings: context.settings, from: `${firstMonth}-01`,
        through: monthThrough(lastMonth, args.through), timeZone: context.timeZone });
      for (const month of args.months) {
        await ctx.runMutation(internal.onlinePosFinancial.publishMonth, { ...args, month,
          days: days.filter((day) => day.date.startsWith(`${month}-`)) });
      }
    } catch (error) {
      await ctx.runMutation(internal.onlinePosFinancial.failRange, { ...args, message: onlinePosErrorMessage(error) });
    }
    return null;
  },
});

export const refreshRecentMonths = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("onlinePosLocationIntegrations")
      .withIndex("by_organizationId").paginate({ cursor: args.cursor, numItems: 10 });
    for (const connection of page.page) {
      const location = await ctx.db.get("locations", connection.locationId);
      if (location?.organizationId !== connection.organizationId) continue;
      const timeZone = await resolveTimeZone(ctx, connection.organizationId, connection.locationId);
      const today = dateKey(Date.now(), timeZone);
      const currentMonth = today.slice(0, 7);
      const previousMonth = addDays(`${currentMonth}-01`, -1).slice(0, 7);
      await queueFinancialRange(ctx, { organizationId: connection.organizationId, locationId: connection.locationId,
        fromMonth: previousMonth, toMonth: currentMonth, through: addDays(today, -1) });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.onlinePosFinancial.refreshRecentMonths, { cursor: page.continueCursor });
    return null;
  },
});
