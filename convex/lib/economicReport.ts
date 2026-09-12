import { ConvexError, type Infer } from "convex/values";
import { economicBudgetComponents, kpiCell, kpiMonthEnd, type MonthlyKpiCell, type MonthlyKpiInputs } from "../../lib/dashboard/monthly-kpi";
import type { Doc, Id } from "../_generated/dataModel";
import type { fetchEconomicReportData } from "./economicApi";
import { economicFingerprint } from "./economicCrypto";
import type { economicCategoryValidator } from "./economicValidators";

export type EconomicCategory = Infer<typeof economicCategoryValidator>;
export const economicCategories: readonly EconomicCategory[] = economicBudgetComponents;
export const economicCategoryLabels: Record<EconomicCategory, string> = {
  sales: "Nettoomsætning", cogs: "Vareforbrug", labour: "Løn", rent: "Husleje",
  utilities: "Forsyning", other: "Øvrige driftsomkostninger",
};
export type EconomicReportConnection = {
  connection: Doc<"economicConnections">;
  mappings: { locationId: Id<"locations">; dimensionKey: number | null }[];
};
export type EconomicApprovalCandidate = {
  connectionId: Id<"economicConnections">;
  locationId: Id<"locations">;
  locationName: string;
  month: string;
  category: EconomicCategory;
  kind: "actual" | "budget";
  amountMinor: number;
  currency: string;
  fingerprint: string;
  approved: boolean;
  approvalRevision: number;
  source: string;
};
type EconomicData = Awaited<ReturnType<typeof fetchEconomicReportData>>;
type Amount = { value: number; references: Array<[number, string | null, number]>; incomplete: boolean };

function minorUnits(value: number) {
  const result = Math.sign(value) * Math.round(Math.abs(value) * 100 + 1e-7);
  if (!Number.isSafeInteger(result)) throw new ConvexError("Beløbet fra e-conomic er for stort");
  return result;
}

function allocate(amount: number, allocations: NonNullable<EconomicData["entries"][number]["allocations"]>) {
  const absolute = Math.abs(amount);
  const parts = allocations.map((allocation) => {
    const exact = absolute * allocation.percent / 100;
    return { dimensionKey: allocation.dimensionKey, value: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = absolute - parts.reduce((total, part) => total + part.value, 0);
  if (remaining < 0 || remaining > parts.length) throw new ConvexError("Fordelingen fra e-conomic kunne ikke afstemmes");
  parts.sort((left, right) => right.remainder - left.remainder || left.dimensionKey - right.dimensionKey);
  for (const part of parts) {
    if (remaining > 0) { part.value += 1; remaining -= 1; }
    part.value *= Math.sign(amount);
  }
  return parts;
}

function periodCovered(data: EconomicData, from: string, through: string) {
  let next = from;
  for (const period of data.periods) {
    if (period.toDate < next) continue;
    if (period.fromDate > next) return false;
    if (period.toDate >= through) return true;
    const end = new Date(`${period.toDate}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    next = end.toISOString().slice(0, 10);
  }
  return false;
}

export function unavailableEconomicInputs(inputs: MonthlyKpiInputs, item: EconomicReportConnection, reason: string) {
  const selected = new Set(item.mappings.map((mapping) => mapping.locationId));
  for (const location of inputs.locations) {
    if (!selected.has(location.id)) continue;
    for (const period of location.periods) {
      for (const category of economicCategories) {
        if (category === "sales" || category === "labour" || (category === "cogs" && period.cogs.status === "approved")) continue;
        period[category] = kpiCell(null, `${location.name}: ${reason}`, false, "e-conomic");
      }
    }
    for (const category of location.economicBudgetCategories) location.budget[category] = kpiCell(null, `${location.name}: ${reason}`, false, "e-conomic");
  }
}

export async function applyEconomicData(args: {
  inputs: MonthlyKpiInputs;
  item: EconomicReportConnection;
  data: EconomicData;
  approvals: Doc<"economicApprovals">[];
}): Promise<EconomicApprovalCandidate[]> {
  const { inputs, item, data, approvals } = args;
  const { connection, mappings } = item;
  const categories = new Map(connection.accountMappings.map((mapping) => [mapping.accountNumber, mapping.category]));
  const selected = inputs.locations.filter((location) => mappings.some((mapping) => mapping.locationId === location.id));
  const knownDimensions = new Map(mappings.flatMap((mapping) => mapping.dimensionKey === null ? [] : [[mapping.dimensionKey, mapping.locationId] as const]));
  const actualAmounts = new Map<string, Amount>();
  const budgetAmounts = new Map<string, Amount>();
  const key = (locationId: string, month: string, category: string) => `${locationId}:${month}:${category}`;
  const get = (amounts: Map<string, Amount>, locationId: string, month: string, category: string) => {
    const id = key(locationId, month, category);
    let amount = amounts.get(id);
    if (!amount) { amount = { value: 0, references: [], incomplete: false }; amounts.set(id, amount); }
    return amount;
  };
  const add = (amount: Amount, value: number, number: number, version: string | null) => {
    amount.value += value;
    if (!Number.isSafeInteger(amount.value)) throw new ConvexError("Rapportens samlede beløb er for stort");
    amount.references.push([number, version, value]);
  };
  const distribute = (
    amounts: Map<string, Amount>, month: string, category: EconomicCategory,
    value: number, number: number, version: string | null,
    allocations: EconomicData["entries"][number]["allocations"], incomplete = false,
  ) => {
    if (connection.dimensionNumber === null) {
      if (mappings.length !== 1) throw new ConvexError("En hel e-conomic-aftale skal være knyttet til én lokation");
      const target = selected.find((location) => location.id === mappings[0].locationId);
      if (target) {
        const amount = get(amounts, target.id, month, category);
        add(amount, value, number, version);
        amount.incomplete ||= incomplete;
      }
      return;
    }
    const unassigned = allocations === null || allocations.some((allocation) => allocation.percent > 0 && !knownDimensions.has(allocation.dimensionKey));
    if (unassigned) {
      for (const location of selected) get(amounts, location.id, month, category).incomplete = true;
    }
    if (allocations === null) return;
    for (const part of allocate(value, allocations.filter((allocation) => allocation.percent > 0))) {
      const locationId = knownDimensions.get(part.dimensionKey);
      if (!locationId || !selected.some((location) => location.id === locationId)) continue;
      const amount = get(amounts, locationId, month, category);
      add(amount, part.value, number, version);
      amount.incomplete ||= incomplete;
    }
  };
  for (const entry of data.entries) {
    const category = categories.get(entry.accountNumber);
    const month = entry.date.slice(0, 7);
    const period = inputs.periods.find((period) => period.month === month);
    if (!category || category === "sales" || !period || entry.date > period.through) continue;
    distribute(actualAmounts, month, category, minorUnits(entry.amountInBaseCurrency), entry.entryNumber, entry.objectVersion, entry.allocations);
  }
  if (selected.some((location) => location.economicBudgetCategories.length > 0)) {
    for (const budget of data.budgets) {
      const category = categories.get(budget.accountNumber);
      if (!category || budget.fromDate > kpiMonthEnd(inputs.month) || budget.toDate < `${inputs.month}-01`) continue;
      const spansMonths = budget.fromDate < `${inputs.month}-01` || budget.toDate > kpiMonthEnd(inputs.month);
      distribute(budgetAmounts, inputs.month, category, minorUnits(budget.amountDefaultCurrency) * (category === "sales" ? -1 : 1),
        budget.number, budget.objectVersion, budget.allocations, spansMonths);
    }
  }
  const candidates: EconomicApprovalCandidate[] = [];
  const cell = async (location: MonthlyKpiInputs["locations"][number], month: string, category: EconomicCategory, kind: "actual" | "budget"): Promise<MonthlyKpiCell> => {
    const amount = get(kind === "actual" ? actualAmounts : budgetAmounts, location.id, month, category);
    const monthStart = `${month}-01`;
    const through = inputs.periods.find((period) => period.month === month)?.through ?? monthStart;
    const source = `e-conomic ${connection.agreementNumber} · ${economicCategoryLabels[category]} · ${month}`;
    if (connection.currency !== location.currency || inputs.currency === null) return kpiCell(null, "Vælg lokationer med samme valuta som e-conomic-aftalen", false, source);
    if (!connection.accountMappings.some((mapping) => mapping.category === category)) return kpiCell(null, `${location.name}: Kontokobling for ${economicCategoryLabels[category].toLowerCase()} mangler`, false, source);
    if (kind === "actual" && !periodCovered(data, monthStart, through)) return kpiCell(null, `${location.name}: Regnskabsperiodens dækning kunne ikke bekræftes`, false, source);
    if (amount.incomplete) return kpiCell(null, `${location.name}: ${kind === "budget" ? "Budgettet har uafklaret lokationsfordeling eller dækker flere måneder" : "Der er beløb uden en fuldstændig lokationsfordeling"}`, false, source);
    if (kind === "budget" && amount.references.length === 0) return kpiCell(null, `${location.name}: Budget mangler i e-conomic`, false, source);
    const previous = approvals.find((approval) => approval.organizationId === inputs.organizationId && approval.locationId === location.id && approval.month === month);
    amount.references.sort((left, right) => left[0] - right[0]);
    const fingerprint = await economicFingerprint({
      version: 1, connectionId: connection._id, connectionRevision: connection.revision,
      locationId: location.id, month, through: kind === "budget" ? kpiMonthEnd(month) : through,
      category, kind, currency: connection.currency, amount: amount.value, references: amount.references,
    });
    const approved = previous?.connectionId === connection._id && previous.items.some((item) => item.kind === kind && item.category === category && item.fingerprint === fingerprint);
    const isFullMonth = through === kpiMonthEnd(month);
    const cogsReady = category !== "cogs" || kind === "budget" || connection.cogsStockAdjusted;
    if (month === inputs.month && cogsReady && (kind === "budget" || isFullMonth)) {
      candidates.push({ connectionId: connection._id, locationId: location.id, locationName: location.name,
        month, category, kind, amountMinor: amount.value, currency: connection.currency, fingerprint,
        approved, approvalRevision: previous?.revision ?? 0, source });
    }
    if (!cogsReady) return kpiCell(null, `${location.name}: Lagerreguleret vareforbrug er ikke bekræftet`, false, source);
    if (kind === "actual" && amount.references.length === 0 && !approved) return kpiCell(null, `${location.name}: Bogførte beløb eller et godkendt nulbeløb mangler`, false, source);
    if (kind === "budget" && !approved) return kpiCell(null, `${location.name}: Budgettet fra e-conomic afventer godkendelse`, false, source);
    const periodOpen = kind === "actual" && data.periods.some((period) => period.fromDate <= through && period.toDate >= monthStart && !period.isClosed);
    const reason = approved && isFullMonth ? null : periodOpen
      ? "Bogførte beløb i en åben regnskabsperiode. Afstem og godkend den afsluttede måned."
      : "Beløbet er ikke afstemt og godkendt for måneden";
    return kpiCell(amount.value, kind === "budget" ? null : reason, false,
      approved ? `${source} · godkendt grundlag, revision ${previous.revision}` : source,
      approved && (kind === "budget" || isFullMonth) ? "approved" : "provisional");
  };
  for (const location of selected) {
    for (const period of location.periods) {
      for (const category of economicCategories) {
        if (category === "sales") continue;
        const result = await cell(location, period.month, category, "actual");
        if (category === "labour" && result.status !== "approved") {
          if (period.labour.value === null) period.labour = kpiCell(null, result.reason ?? "Bogført løn afventer godkendelse", false, result.source);
        } else if (category !== "cogs" || result.status === "approved" || period.cogs.status !== "approved") {
          period[category] = result;
        }
      }
    }
    for (const category of location.economicBudgetCategories) location.budget[category] = await cell(location, inputs.month, category, "budget");
  }
  return candidates;
}
