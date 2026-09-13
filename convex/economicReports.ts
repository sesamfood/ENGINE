import { ConvexError, v, type Infer } from "convex/values";
import { hasPermission } from "../lib/auth-permissions";
import { dateKey, zonedStart } from "../lib/date";
import { metricRegistry } from "../lib/dashboard/registry";
import type { MetricResult } from "../lib/dashboard/types";
import { buildMonthlyKpiReport, kpiMonthEnd, type MonthlyKpiInputs } from "../lib/dashboard/monthly-kpi";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalMutation, internalQuery, query, type ActionCtx, type QueryCtx } from "./_generated/server";
import { readInputs } from "./monthlyKpi";
import schema from "./schema";
import { recordAudit, requireAuditReason } from "./lib/audit";
import { requireBudgetManager, requireFinancialReportViewer, requireLocationAccess } from "./lib/auth";
import { fetchEconomicReportData } from "./lib/economicApi";
import { decryptEconomicCredentials, economicFingerprint } from "./lib/economicCrypto";
import { applyEconomicData, unavailableEconomicInputs, type EconomicApprovalCandidate } from "./lib/economicReport";
import { economicApprovalItemValidator, economicCategoryValidator, economicLocationMappingValidator } from "./lib/economicValidators";
import { monthlyKpiInputsValidator, monthlyKpiReportValidator } from "./lib/monthlyKpiValidators";
import { resolveMetricParams } from "./lib/dashboardMetrics";
import { keyedMetricResultValidator, metricRequestValidator, rangeValidator, scopeValidator } from "./lib/dashboardValidators";

const reportArgs = { month: v.string(), locationIds: v.union(v.array(v.id("locations")), v.null()), now: v.number() };
type ReportArgs = { month: string; locationIds: Id<"locations">[] | null; now: number };
const reportContextValidator = v.object({
  inputs: monthlyKpiInputsValidator,
  connections: v.array(v.object({ connection: schema.doc("economicConnections"), mappings: v.array(economicLocationMappingValidator) })),
  approvals: v.array(schema.doc("economicApprovals")),
  revision: v.string(), canApprove: v.boolean(),
});
type ReportContext = Infer<typeof reportContextValidator>;
const approvalCandidateValidator = v.object({
  connectionId: v.id("economicConnections"), locationId: v.id("locations"), locationName: v.string(),
  month: v.string(), category: economicCategoryValidator, kind: v.union(v.literal("actual"), v.literal("budget")),
  amountMinor: v.number(), currency: v.string(), fingerprint: v.string(), approved: v.boolean(),
  approvalRevision: v.number(), source: v.string(),
});
export const economicReportResultValidator = v.object({
  report: monthlyKpiReportValidator, fetchedAt: v.union(v.number(), v.null()),
  errors: v.array(v.string()), approvals: v.array(approvalCandidateValidator),
});
type ReportResult = Infer<typeof economicReportResultValidator>;

async function resolveReportContext(ctx: QueryCtx, args: ReportArgs): Promise<ReportContext> {
  const auth = await requireFinancialReportViewer(ctx);
  const inputs = await readInputs(ctx, args);
  const selectedMappings = await Promise.all(inputs.locations.map((location) => ctx.db.query("economicLocationMappings")
    .withIndex("by_organizationId_and_locationId", (q) => q.eq("organizationId", auth.organizationId).eq("locationId", location.id)).unique()));
  const connectionIds = [...new Set(selectedMappings.flatMap((mapping) => mapping ? [mapping.connectionId] : []))].sort();
  const connections: ReportContext["connections"] = [];
  for (const id of connectionIds) {
    const connection = await ctx.db.get("economicConnections", id);
    if (!connection || connection.organizationId !== auth.organizationId) continue;
    const mappings = await ctx.db.query("economicLocationMappings").withIndex("by_connectionId", (q) => q.eq("connectionId", id)).take(201);
    if (mappings.length > 200 || mappings.some((mapping) => mapping.organizationId !== auth.organizationId)) {
      throw new ConvexError("e-conomic-aftalens lokationskoblinger skal kontrolleres");
    }
    connections.push({ connection, mappings: mappings.map(({ locationId, dimensionKey }) => ({ locationId, dimensionKey })) });
  }
  const approvalMonths = [...new Set([inputs.month, ...inputs.periods.map((period) => period.month)])];
  const approvals = (await Promise.all(inputs.locations.flatMap((location) => approvalMonths.map((month) =>
    ctx.db.query("economicApprovals").withIndex("by_organizationId_and_locationId_and_month_and_revision", (q) =>
      q.eq("organizationId", auth.organizationId).eq("locationId", location.id).eq("month", month)).order("desc").first(),
  )))).flatMap((approval) => approval ? [approval] : []);
  const canApprove = auth.principalKind === "user" && hasPermission(auth.role, auth.permissions, "dashboard.manageBudgets");
  const revision = await economicFingerprint({
    user: auth.userIdentifier, organizationId: auth.organizationId, inputRevision: inputs.revision,
    connections: connections.map(({ connection, mappings }) => ({ id: connection._id, revision: connection.revision, mappings })),
    approvals: approvals.map((approval) => ({ locationId: approval.locationId, month: approval.month, revision: approval.revision, items: approval.items })),
    canApprove,
  });
  return { inputs, connections, approvals, revision, canApprove };
}

export const getAuthorizedReportContext = internalQuery({
  args: reportArgs, returns: reportContextValidator, handler: resolveReportContext,
});

export const getReportState = query({
  args: reportArgs,
  returns: v.object({ report: monthlyKpiReportValidator, revision: v.string(), connected: v.boolean(), canApprove: v.boolean() }),
  handler: async (ctx, args) => {
    const context = await resolveReportContext(ctx, args);
    for (const item of context.connections) unavailableEconomicInputs(context.inputs, item,
      item.connection.enabled ? "Hent e-conomic for at se de aktuelle regnskabstal" : "e-conomic-aftalen er deaktiveret");
    context.inputs.revision = context.revision;
    return { report: buildMonthlyKpiReport(context.inputs), revision: context.revision,
      connected: context.connections.some((item) => item.connection.enabled), canApprove: context.canApprove };
  },
});

async function loadEconomicInputs(ctx: ActionCtx, args: ReportArgs & { expectedRevision?: string }) {
  if (!Number.isFinite(args.now)) throw new ConvexError("Tidspunktet er ugyldigt");
  const queryArgs = { month: args.month, locationIds: args.locationIds, now: Math.min(args.now, Date.now()) };
  const before: ReportContext = await ctx.runQuery(internal.economicReports.getAuthorizedReportContext, queryArgs);
  if (args.expectedRevision && args.expectedRevision !== before.revision) throw new ConvexError("Rapportens datagrundlag er ændret. Hent rapporten igen");
  const inputs: MonthlyKpiInputs = structuredClone(before.inputs);
  const approvals: EconomicApprovalCandidate[] = [];
  const errors: string[] = [];
  let fetchedAt: number | null = null;
  const first = inputs.periods[0];
  const last = inputs.periods.at(-1);
  const deadline = Date.now() + 180_000;
  for (const item of before.connections) {
    const candidates = await (async () => {
      const connection = item.connection;
      if (!connection.enabled) {
        unavailableEconomicInputs(inputs, item, "e-conomic-aftalen er deaktiveret");
        return [];
      }
      if (!first || !last) return [];
      try {
        if (Date.now() >= deadline) throw new ConvexError("Rapporten tog for lang tid. Vælg færre lokationer og prøv igen");
        if (!connection.accountMappings.length) throw new ConvexError("Konto- og lokationskoblinger skal færdiggøres i Administration");
        const locationIds = new Set(item.mappings.map((mapping) => mapping.locationId));
        const selectedLocations = inputs.locations.filter((location) => locationIds.has(location.id));
        const data = await fetchEconomicReportData({
          credentials: await decryptEconomicCredentials(connection),
          accountNumbers: connection.accountMappings.map((mapping) => mapping.accountNumber),
          fromDate: `${first.month}-01`, toDate: last.through,
          budgetFromDate: `${inputs.month}-01`, budgetToDate: kpiMonthEnd(inputs.month), deadlineAt: deadline,
          dimensionNumber: connection.dimensionNumber, includeBudgets: selectedLocations.some((location) => location.economicBudgetCategories.length > 0),
        });
        const isolated: MonthlyKpiInputs = { ...inputs, locations: structuredClone(selectedLocations) };
        const candidates = await applyEconomicData({ inputs: isolated, item, data, approvals: before.approvals });
        for (const location of isolated.locations) {
          const index = inputs.locations.findIndex((original) => original.id === location.id);
          inputs.locations[index] = location;
        }
        fetchedAt = Date.now();
        return candidates;
      } catch (error) {
        const reason = error instanceof ConvexError && typeof error.data === "string" ? error.data : "Data fra e-conomic kunne ikke hentes. Prøv igen";
        unavailableEconomicInputs(inputs, item, reason);
        const name = inputs.locations.filter((location) => item.mappings.some((mapping) => mapping.locationId === location.id)).map((location) => location.name).join(", ");
        errors.push(`${name}: ${reason}`);
        return [];
      }
    })();
    approvals.push(...candidates);
  }
  const after: ReportContext = await ctx.runQuery(internal.economicReports.getAuthorizedReportContext, queryArgs);
  if (after.revision !== before.revision) throw new ConvexError("Adgangen eller rapportens datagrundlag er ændret. Hent rapporten igen");
  inputs.revision = before.revision;
  return { inputs, fetchedAt, errors, approvals: before.canApprove ? approvals : [] };
}

export async function loadEconomicReport(ctx: ActionCtx, args: ReportArgs & { expectedRevision?: string }): Promise<ReportResult> {
  const { inputs, ...result } = await loadEconomicInputs(ctx, args);
  return { ...result, report: buildMonthlyKpiReport(inputs) };
}

export const getReport = action({
  args: { ...reportArgs, expectedRevision: v.optional(v.string()) },
  returns: economicReportResultValidator,
  handler: loadEconomicReport,
});

const widgetArgs = { widgets: v.array(metricRequestValidator), scope: scopeValidator, range: rangeValidator, now: v.number() };
type WidgetArgs = { widgets: Infer<typeof metricRequestValidator>[]; scope: Infer<typeof scopeValidator>; range: Infer<typeof rangeValidator>; now: number };
const widgetContextValidator = v.object({
  organizationId: v.string(), userIdentifier: v.string(), revision: v.string(), timeZone: v.string(),
  locationIds: v.array(v.id("locations")),
  groups: v.array(v.object({ key: v.string(), label: v.string(), locationIds: v.array(v.id("locations")) })),
  months: v.array(v.object({ month: v.string(), revision: v.string() })),
  requests: v.array(v.object({ key: v.string(), metricId: v.string(), month: v.union(v.string(), v.null()), error: v.union(v.string(), v.null()) })),
});
type WidgetContext = Infer<typeof widgetContextValidator>;

async function resolveWidgetContext(ctx: QueryCtx, args: WidgetArgs): Promise<WidgetContext> {
  const auth = await requireFinancialReportViewer(ctx);
  if (args.widgets.length > 24 || new Set(args.widgets.map((widget) => widget.key)).size !== args.widgets.length) {
    throw new ConvexError("Vælg højst 24 widgets med forskellige nøgler");
  }
  if (args.scope.locationIds && args.scope.locationIds.length > 200) throw new ConvexError("Vælg højst 200 lokationer");
  const params = await resolveMetricParams(ctx, auth.organizationId, args.scope, { preset: "thisMonth" }, args.now, auth.locationScope);
  if (params.scopeTruncated) throw new ConvexError("Vælg færre lokationer for at vise alle økonomital");
  const locationIds = params.locations.map((location) => location.id).sort();
  const currentMonth = dateKey(args.now, params.timeZone).slice(0, 7);
  const requests = args.widgets.map((widget) => {
    const metricId = widget.metric.kind === "builtin" ? widget.metric.id : "";
    let error: string | null = null;
    let month: string | null = null;
    if (widget.metric.kind !== "builtin" || metricRegistry[widget.metric.id].source !== "economic") {
      error = "Målingen er ikke en regnskabsmåling";
    } else if (widget.salesSource && widget.salesSource !== "onlinePos") {
      error = "Økonomital bruger bogført nettoomsætning fra POS som grundlag";
    } else {
      const range = widget.range ? { preset: widget.range } : args.range;
      if (range.preset === "thisMonth") month = currentMonth;
      else if (range.preset === "custom" && range.from && range.to) {
        try {
          const requestedMonth = range.from.slice(0, 7);
          if (range.from === `${requestedMonth}-01` && range.to === kpiMonthEnd(requestedMonth) && requestedMonth <= currentMonth) month = requestedMonth;
        } catch { /* Invalid dates are reported as an unsupported period. */ }
      }
      if (!month) error = "Vælg Denne måned eller en hel kalendermåned for økonomital";
    }
    return { key: widget.key, metricId, month, error };
  });
  const months = [];
  for (const month of [...new Set(requests.flatMap((request) => request.month ? [request.month] : []))].sort()) {
    const context = await resolveReportContext(ctx, { month, locationIds, now: args.now });
    months.push({ month, revision: context.revision });
  }
  const groups = params.compare ? params.comparisonGroups ?? params.locations.map((location) => ({ key: location.id, label: location.name, locationIds: [location.id] }))
    : [{ key: "total", label: "Samlet", locationIds }];
  const value = { organizationId: auth.organizationId, userIdentifier: auth.userIdentifier, timeZone: params.timeZone,
    locationIds, groups: groups.map((group) => ({ ...group, locationIds: [...group.locationIds] })), months, requests };
  return { ...value, revision: await economicFingerprint(value) };
}

export const getAuthorizedWidgetContext = internalQuery({ args: widgetArgs, returns: widgetContextValidator, handler: resolveWidgetContext });
export const getWidgetContext = query({
  args: widgetArgs, returns: v.object({ organizationId: v.string(), userIdentifier: v.string(), revision: v.string() }),
  handler: async (ctx, args) => {
    const context = await resolveWidgetContext(ctx, args);
    return { organizationId: context.organizationId, userIdentifier: context.userIdentifier, revision: context.revision };
  },
});

export const getWidgetMetrics = action({
  args: { ...widgetArgs, expectedRevision: v.string() }, returns: v.array(keyedMetricResultValidator),
  handler: async (ctx, args): Promise<Array<{ key: string; result: MetricResult }>> => {
    const queryArgs = { widgets: args.widgets, scope: args.scope, range: args.range, now: Math.min(args.now, Date.now()) };
    const before: WidgetContext = await ctx.runQuery(internal.economicReports.getAuthorizedWidgetContext, queryArgs);
    if (before.revision !== args.expectedRevision) throw new ConvexError("Datagrundlaget er ændret. Hent økonomitallene igen");
    const loaded = new Map<string, Awaited<ReturnType<typeof loadEconomicInputs>>>();
    for (const month of before.months) {
      loaded.set(month.month, await loadEconomicInputs(ctx, { month: month.month, locationIds: before.locationIds, now: queryArgs.now, expectedRevision: month.revision }));
    }
    const after: WidgetContext = await ctx.runQuery(internal.economicReports.getAuthorizedWidgetContext, queryArgs);
    if (after.revision !== before.revision) throw new ConvexError("Adgangen eller datagrundlaget er ændret. Hent økonomitallene igen");
    return before.requests.map((request) => {
      const empty = (message: string): { key: string; result: MetricResult } => ({ key: request.key, result: { unit: "percent", series: [], emptyMessage: message } });
      if (request.error) return empty(request.error);
      const data = request.month ? loaded.get(request.month) : undefined;
      if (!data) return empty("Økonomitallene mangler");
      const report = buildMonthlyKpiReport(data.inputs);
      const row = report.rows.find((row) => row.id === request.metricId);
      if (!row || row.actual.value === null) return empty(row?.actual.reason ?? "Økonomitallet mangler");
      const series = before.groups.flatMap((group) => {
        const groupReport = buildMonthlyKpiReport({ ...data.inputs, locations: data.inputs.locations.filter((location) => group.locationIds.includes(location.id)) });
        const groupRow = groupReport.rows.find((row) => row.id === request.metricId);
        if (!groupRow || groupRow.actual.value === null) return [];
        return [{ key: group.key, label: group.label, points: [{ t: zonedStart(`${data.inputs.month}-01`, before.timeZone), value: groupRow.actual.value }],
          total: groupRow.actual.value, previousTotal: groupRow.lastMonth.value }];
      });
      const details = [...new Set([
        report.through ? `Til og med ${report.through}` : "Ingen afsluttede dage",
        row.actual.estimated ? "Estimat" : row.actual.status === "provisional" ? "Foreløbigt" : null,
        row.actual.source, row.actual.reason, ...data.errors,
      ].filter((value): value is string => Boolean(value)))];
      return { key: request.key, result: {
        unit: "percent", series, headlineTotal: row.actual.value, headlinePrevious: row.lastMonth.value,
        partialMessage: details.join(" · "), ...(row.budget.value !== null && row.budget.value > 0 ? { target: row.budget.value } : {}),
      } };
    });
  },
});

export const saveApproval = internalMutation({
  args: {
    connectionId: v.id("economicConnections"), locationId: v.id("locations"), month: v.string(),
    connectionRevision: v.number(), expectedApprovalRevision: v.number(),
    items: v.array(economicApprovalItemValidator), sourceNote: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireBudgetManager(ctx);
    requireLocationAccess(auth, args.locationId);
    const connection = await ctx.db.get("economicConnections", args.connectionId);
    const mapping = await ctx.db.query("economicLocationMappings").withIndex("by_organizationId_and_locationId", (q) => q.eq("organizationId", auth.organizationId).eq("locationId", args.locationId)).unique();
    if (!connection || connection.organizationId !== auth.organizationId || !connection.enabled || connection.revision !== args.connectionRevision || mapping?.connectionId !== connection._id) {
      throw new ConvexError("e-conomic-opsætningen er ændret. Hent rapporten igen før godkendelse");
    }
    const previous = await ctx.db.query("economicApprovals").withIndex("by_organizationId_and_locationId_and_month_and_revision", (q) =>
      q.eq("organizationId", auth.organizationId).eq("locationId", args.locationId).eq("month", args.month)).order("desc").first();
    if ((previous?.revision ?? 0) !== args.expectedApprovalRevision) throw new ConvexError("Godkendelsen er ændret. Hent rapporten igen");
    if (!args.items.length || args.items.length > 12) throw new ConvexError("Vælg de beløb, du vil godkende");
    const items = new Map((previous?.connectionId === connection._id ? previous.items : []).map((item) => [`${item.kind}:${item.category}`, item]));
    for (const item of args.items) {
      if (!/^[0-9a-f]{64}$/.test(item.fingerprint)) throw new ConvexError("Godkendelsens datagrundlag er ugyldigt");
      items.set(`${item.kind}:${item.category}`, item);
    }
    const sourceNote = requireAuditReason(args.sourceNote);
    const id = await ctx.db.insert("economicApprovals", {
      organizationId: auth.organizationId, connectionId: connection._id, locationId: args.locationId,
      month: args.month, items: [...items.values()], sourceNote, revision: (previous?.revision ?? 0) + 1,
      approvedAt: Date.now(), approvedBy: auth.userId,
    });
    await recordAudit(ctx, auth, { action: "economic.approved", entityTable: "economicApprovals", entityId: id, locationId: args.locationId,
      summary: `Regnskabsgrundlag for ${args.month} er godkendt, revision ${(previous?.revision ?? 0) + 1}`, reason: sourceNote });
    return null;
  },
});

export const approve = action({
  args: { month: v.string(), locationId: v.id("locations"), now: v.number(), expectedRevision: v.string(), items: v.array(economicApprovalItemValidator), sourceNote: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const auth = await requireBudgetManager(ctx);
    requireLocationAccess(auth, args.locationId);
    const sourceNote = requireAuditReason(args.sourceNote);
    if (!args.items.length || args.items.length > 12 || new Set(args.items.map((item) => `${item.kind}:${item.category}`)).size !== args.items.length) {
      throw new ConvexError("Vælg hvert beløb én gang");
    }
    const queryArgs = { month: args.month, locationIds: [args.locationId], now: Math.min(args.now, Date.now()) };
    const before: ReportContext = await ctx.runQuery(internal.economicReports.getAuthorizedReportContext, queryArgs);
    if (before.revision !== args.expectedRevision) throw new ConvexError("Rapporten er ændret. Hent og kontrollér beløbene igen");
    const result = await loadEconomicReport(ctx, { ...queryArgs, expectedRevision: args.expectedRevision });
    const selected = args.items.map((item) => {
      const candidate = result.approvals.find((candidate) => candidate.month === args.month && candidate.locationId === args.locationId && candidate.category === item.category && candidate.kind === item.kind);
      if (!candidate || candidate.fingerprint !== item.fingerprint) throw new ConvexError("Beløbene i e-conomic er ændret eller mangler. Hent og kontrollér rapporten igen");
      return candidate;
    });
    const connection = before.connections.find((item) => item.connection._id === selected[0].connectionId)?.connection;
    if (!connection || selected.some((candidate) => candidate.connectionId !== connection._id)) throw new ConvexError("Aftalens lokationskobling er ændret");
    return ctx.runMutation(internal.economicReports.saveApproval, {
      connectionId: connection._id, connectionRevision: connection.revision,
      locationId: args.locationId, month: args.month, expectedApprovalRevision: selected[0].approvalRevision,
      items: args.items, sourceNote,
    });
  },
});
