import { ConvexError, v, type Infer } from "convex/values";
import { addDays, dateKey, parseDateKey } from "../lib/date";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { resolveLocationCurrency } from "./lib/masterData";
import { resolveTimeZone } from "./lib/timeZone";
import {
  parseDepartmentStats,
  requestWorkfeed,
  workfeedErrorMessage,
} from "./lib/workfeedApi";

const REFRESH_MS = 6 * 60 * 60 * 1_000;
const LEASE_MS = 5 * 60 * 1_000;
const MAX_REPORT_MONTHS = 13;

type MonthRequest = {
  organizationId: string;
  locationId: Id<"locations">;
  month: string;
  through: string;
};

type LaborMonthResult = {
  amount: number | null;
  currency: string | null;
  reason: string | null;
  syncedAt: number | null;
};

const sourceValidator = v.object({
  apiKey: v.string(),
  companyId: v.string(),
  departmentId: v.string(),
  currency: v.string(),
  timeZone: v.string(),
  sourceKey: v.string(),
});
type SourceResult =
  | { kind: "ready"; source: Infer<typeof sourceValidator> }
  | { kind: "unavailable"; reason: string };

const runArgs = {
  statusId: v.id("workfeedLaborSyncStatus"),
  runToken: v.string(),
};
const syncContextValidator = v.object({
  source: sourceValidator,
  from: v.string(),
  through: v.string(),
});
const dayValidator = v.object({ date: v.string(), laborCostMinor: v.number() });

function monthStart(month: string, through: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new ConvexError("Måneden er ugyldig");
  }
  const from = `${month}-01`;
  try {
    parseDateKey(from);
    parseDateKey(through);
  } catch {
    throw new ConvexError("Workfeed-perioden er ugyldig");
  }
  if (!through.startsWith(`${month}-`) || through < from) {
    throw new ConvexError("Workfeed-perioden skal ligge i den valgte måned");
  }
  return from;
}

async function currentSource(
  ctx: QueryCtx,
  organizationId: string,
  locationId: Id<"locations">,
): Promise<SourceResult> {
  const [integration, mapping, location] = await Promise.all([
    ctx.db.query("workfeedIntegrations")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .unique(),
    ctx.db.query("workfeedLocationMappings")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", locationId),
      ).unique(),
    ctx.db.get("locations", locationId),
  ]);
  if (!location || location.organizationId !== organizationId) {
    return { kind: "unavailable", reason: "Lokationen blev ikke fundet" };
  }
  if (!integration?.enabled) {
    return { kind: "unavailable", reason: "Workfeed er ikke tilsluttet eller aktiveret" };
  }
  if (!mapping) {
    return { kind: "unavailable", reason: "Lokationen er ikke koblet til en Workfeed-afdeling" };
  }
  // The API omits currency and timezone; use the app's configured assumptions.
  const [currency, timeZone] = await Promise.all([
    resolveLocationCurrency(ctx, organizationId, location),
    resolveTimeZone(ctx, organizationId),
  ]);
  return {
    kind: "ready",
    source: {
      apiKey: integration.apiKey,
      companyId: integration.companyId,
      departmentId: mapping.departmentId,
      currency,
      timeZone,
      sourceKey: JSON.stringify([
        integration._id, integration.connectedAt, integration.companyId,
        mapping._id, mapping.updatedAt, mapping.departmentId, currency, timeZone,
      ]),
    },
  };
}

async function monthStatus(ctx: QueryCtx, args: Omit<MonthRequest, "through">) {
  return ctx.db.query("workfeedLaborSyncStatus")
    .withIndex("by_organizationId_and_locationId_and_month", (q) =>
      q.eq("organizationId", args.organizationId)
        .eq("locationId", args.locationId)
        .eq("month", args.month),
    ).unique();
}

export async function queueLaborMonth(ctx: MutationCtx, args: MonthRequest): Promise<boolean> {
  monthStart(args.month, args.through);
  const sourceResult = await currentSource(ctx, args.organizationId, args.locationId);
  if (sourceResult.kind === "unavailable") return false;
  const { source } = sourceResult;
  const now = Date.now();
  if (args.through >= dateKey(now, source.timeZone)) {
    throw new ConvexError("Workfeed-løndata kan kun hentes for afsluttede dage");
  }
  const status = await monthStatus(ctx, args);
  const sameRequest = status?.sourceKey === source.sourceKey &&
    status.requestedThrough === args.through;
  if (status?.sourceKey === source.sourceKey && status.requestedThrough >= args.through && (
    (status.state === "ready" && status.coveredThrough === status.requestedThrough &&
      Number.isSafeInteger(status.laborCostMinor) &&
      now - (status.lastSuccessAt ?? 0) < REFRESH_MS) ||
    (status.state !== "ready" && now - status.lastAttemptAt < LEASE_MS)
  )) return false;

  const runToken = crypto.randomUUID();
  const values = {
    organizationId: args.organizationId,
    locationId: args.locationId,
    month: args.month,
    sourceKey: source.sourceKey,
    currency: source.currency,
    timeZone: source.timeZone,
    state: "queued" as const,
    runToken,
    requestedThrough: args.through,
    coveredThrough: undefined,
    laborCostMinor: undefined,
    lastAttemptAt: now,
    lastSuccessAt: sameRequest ? status.lastSuccessAt : undefined,
    lastError: undefined,
  };
  const statusId = status
    ? status._id
    : await ctx.db.insert("workfeedLaborSyncStatus", values);
  if (status) await ctx.db.patch("workfeedLaborSyncStatus", status._id, values);
  await ctx.scheduler.runAfter(0, internal.workfeedLabor.syncMonth, { statusId, runToken });
  return true;
}

async function readStatus(
  ctx: QueryCtx,
  status: Doc<"workfeedLaborSyncStatus"> | null,
  sourceResult: SourceResult,
  through: string,
): Promise<LaborMonthResult> {
  if (sourceResult.kind === "unavailable") {
    return { amount: null, currency: null, reason: sourceResult.reason, syncedAt: null };
  }
  const { source } = sourceResult;
  const unavailable = (reason: string): LaborMonthResult => ({
    amount: null,
    currency: source.currency,
    reason,
    syncedAt: status?.lastSuccessAt ?? null,
  });
  if (through >= dateKey(Date.now(), source.timeZone)) {
    return unavailable("Løndata omfatter kun afsluttede dage");
  }
  if (!status) return unavailable("Workfeed-løndata er ikke hentet for perioden");
  if (status.sourceKey !== source.sourceKey || status.currency !== source.currency ||
    status.timeZone !== source.timeZone) {
    return unavailable("Workfeed-opsætningen er ændret. Opdatér løndata");
  }
  if (status.state === "error") {
    return unavailable(status.lastError ?? "Workfeed-løndata kunne ikke hentes");
  }
  if (status.state === "queued" || status.state === "running") {
    return unavailable(Date.now() - status.lastAttemptAt >= LEASE_MS
      ? "Workfeed-synkroniseringen er udløbet. Prøv igen"
      : "Workfeed-løndata hentes");
  }
  if (!status.coveredThrough || status.coveredThrough < through ||
    status.requestedThrough !== status.coveredThrough ||
    status.laborCostMinor === undefined || !Number.isSafeInteger(status.laborCostMinor) ||
    status.lastSuccessAt === undefined) {
    return unavailable("Workfeed-løndata dækker ikke hele perioden");
  }
  let amount = status.laborCostMinor;
  if (status.coveredThrough !== through) {
    const from = monthStart(status.month, through);
    const rows = await ctx.db.query("workfeedLaborDaily")
      .withIndex("by_organizationId_and_locationId_and_date", (q) =>
        q.eq("organizationId", status.organizationId).eq("locationId", status.locationId)
          .gte("date", from).lte("date", through),
      ).take(32);
    if (rows.length !== Number(through.slice(-2)) || rows.some((row, index) =>
      row.date !== addDays(from, index) || row.sourceKey !== status.sourceKey ||
      row.currency !== status.currency || row.updatedAt !== status.lastSuccessAt ||
      !Number.isSafeInteger(row.laborCostMinor),
    )) return unavailable("Workfeed-løndata dækker ikke hele perioden");
    amount = rows.reduce((sum, row) => sum + row.laborCostMinor, 0);
    if (!Number.isSafeInteger(amount)) return unavailable("Lønbeløbet er for stort");
  }
  return {
    amount,
    currency: status.currency,
    reason: null,
    syncedAt: status.lastSuccessAt ?? null,
  };
}

export async function readLaborMonths(
  ctx: QueryCtx,
  args: Pick<MonthRequest, "organizationId" | "locationId"> & {
    months: Array<Pick<MonthRequest, "month" | "through">>;
  },
): Promise<LaborMonthResult[]> {
  if (args.months.length > MAX_REPORT_MONTHS) {
    throw new ConvexError("Vælg højst 13 måneder ad gangen");
  }
  if (!args.months.length) return [];
  for (const month of args.months) monthStart(month.month, month.through);
  const sourceResult = await currentSource(ctx, args.organizationId, args.locationId);
  if (sourceResult.kind === "unavailable") {
    return args.months.map(() => ({
      amount: null, currency: null, reason: sourceResult.reason, syncedAt: null,
    }));
  }
  return Promise.all(args.months.map(async (month) => readStatus(
    ctx, await monthStatus(ctx, { ...args, month: month.month }), sourceResult, month.through,
  )));
}

export async function readLaborMonth(ctx: QueryCtx, args: MonthRequest): Promise<LaborMonthResult> {
  const [result] = await readLaborMonths(ctx, {
    ...args, months: [{ month: args.month, through: args.through }],
  });
  return result;
}

export const beginMonth = internalMutation({
  args: runArgs,
  returns: v.union(syncContextValidator, v.null()),
  handler: async (ctx, args): Promise<Infer<typeof syncContextValidator> | null> => {
    const status = await ctx.db.get("workfeedLaborSyncStatus", args.statusId);
    if (!status || status.runToken !== args.runToken || status.state !== "queued") return null;
    const sourceResult = await currentSource(ctx, status.organizationId, status.locationId);
    if (sourceResult.kind === "unavailable" || sourceResult.source.sourceKey !== status.sourceKey) {
      await ctx.db.patch("workfeedLaborSyncStatus", status._id, {
        state: "error",
        lastError: sourceResult.kind === "unavailable"
          ? sourceResult.reason : "Workfeed-opsætningen er ændret. Opdatér løndata",
      });
      return null;
    }
    await ctx.db.patch("workfeedLaborSyncStatus", status._id, {
      state: "running", lastAttemptAt: Date.now(),
    });
    return {
      source: sourceResult.source,
      from: monthStart(status.month, status.requestedThrough),
      through: status.requestedThrough,
    };
  },
});

export const storeMonth = internalMutation({
  args: { ...runArgs, rows: v.array(dayValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await ctx.db.get("workfeedLaborSyncStatus", args.statusId);
    if (!status || status.runToken !== args.runToken || status.state !== "running") return null;
    const sourceResult = await currentSource(ctx, status.organizationId, status.locationId);
    if (sourceResult.kind === "unavailable" || sourceResult.source.sourceKey !== status.sourceKey) {
      await ctx.db.patch("workfeedLaborSyncStatus", status._id, {
        state: "error",
        lastError: "Workfeed-opsætningen er ændret. Opdatér løndata",
      });
      return null;
    }
    const from = monthStart(status.month, status.requestedThrough);
    const days = Number(status.requestedThrough.slice(-2));
    if (args.rows.length !== days || args.rows.some((row, index) =>
      row.date !== addDays(from, index) || !Number.isSafeInteger(row.laborCostMinor),
    )) throw new ConvexError("Workfeed-løndata dækker ikke alle dage i perioden");
    const laborCostMinor = args.rows.reduce((sum, row) => sum + row.laborCostMinor, 0);
    if (!Number.isSafeInteger(laborCostMinor)) throw new ConvexError("Lønbeløbet er for stort");
    const now = Date.now();
    for (const row of args.rows) {
      const existing = await ctx.db.query("workfeedLaborDaily")
        .withIndex("by_organizationId_and_locationId_and_date", (q) =>
          q.eq("organizationId", status.organizationId)
            .eq("locationId", status.locationId).eq("date", row.date),
        ).unique();
      const values = {
        organizationId: status.organizationId,
        locationId: status.locationId,
        ...row,
        currency: status.currency,
        sourceKey: status.sourceKey,
        updatedAt: now,
      };
      if (existing) await ctx.db.replace("workfeedLaborDaily", existing._id, values);
      else await ctx.db.insert("workfeedLaborDaily", values);
    }
    await ctx.db.patch("workfeedLaborSyncStatus", status._id, {
      state: "ready",
      coveredThrough: status.requestedThrough,
      laborCostMinor,
      lastSuccessAt: now,
      lastError: undefined,
    });
    return null;
  },
});

export const failMonth = internalMutation({
  args: { ...runArgs, error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await ctx.db.get("workfeedLaborSyncStatus", args.statusId);
    if (!status || status.runToken !== args.runToken ||
      (status.state !== "running" && status.state !== "queued")) return null;
    await ctx.db.patch("workfeedLaborSyncStatus", status._id, {
      state: "error", lastError: args.error.slice(0, 500), lastAttemptAt: Date.now(),
    });
    return null;
  },
});

export const syncMonth = internalAction({
  args: runArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const context: Infer<typeof syncContextValidator> | null =
        await ctx.runMutation(internal.workfeedLabor.beginMonth, args);
      if (!context) return null;
      const payload = await requestWorkfeed(
        `/departments/${encodeURIComponent(context.source.departmentId)}/stats`,
        context.source,
        { from: context.from, to: context.through },
      );
      const rows = parseDepartmentStats(payload, context);
      await ctx.runMutation(internal.workfeedLabor.storeMonth, { ...args, rows });
    } catch (error) {
      await ctx.runMutation(internal.workfeedLabor.failMonth, {
        ...args, error: workfeedErrorMessage(error),
      });
    }
    return null;
  },
});

export const dispatchCurrent = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("workfeedLocationMappings")
      .withIndex("by_organizationId")
      .paginate({ numItems: 20, cursor: args.cursor });
    for (const mapping of page.page) {
      const timeZone = await resolveTimeZone(ctx, mapping.organizationId);
      const today = dateKey(Date.now(), timeZone);
      const month = today.slice(0, 7);
      const previousEnd = addDays(`${month}-01`, -1);
      const months = [{ month: previousEnd.slice(0, 7), through: previousEnd }];
      if (!today.endsWith("-01")) months.push({ month, through: addDays(today, -1) });
      for (const range of months) await queueLaborMonth(ctx, { ...mapping, ...range });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.workfeedLabor.dispatchCurrent, {
      cursor: page.continueCursor,
    });
    return null;
  },
});
