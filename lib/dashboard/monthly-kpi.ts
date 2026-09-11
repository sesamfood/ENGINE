import type { Id } from "../../convex/_generated/dataModel";
import { addDays, dateKey, parseDateKey } from "../date";

export type MonthlyKpiCell = {
  value: number | null;
  reason: string | null;
  estimated: boolean;
  status: "missing" | "provisional" | "approved" | "ready";
  source: string | null;
};

export type MonthlyKpiRow = {
  id: "salesRevenue" | "salesOrderCount" | "averageBasket" | "cogsPercent" | "labourPercent"
    | "grossMarginPercent" | "wastePercent" | "rentPercent" | "utilitiesPercent"
    | "primeCostPercent" | "ebitdaPercent" | "guestScore";
  label: string;
  unit: "currency" | "count" | "percent" | "score";
  actual: MonthlyKpiCell;
  budget: MonthlyKpiCell;
  variance: MonthlyKpiCell;
  lastMonth: MonthlyKpiCell;
  ytd: MonthlyKpiCell;
};

export const monthlyKpiComponents = ["sales", "transactions", "labour", "cogs", "waste", "rent", "utilities", "other"] as const;
export type MonthlyKpiComponent = typeof monthlyKpiComponents[number];
export type MonthlyKpiAmounts = Record<MonthlyKpiComponent, MonthlyKpiCell>;
export type MonthlyKpiInputs = {
  organizationId: string;
  month: string;
  through: string | null;
  currency: string | null;
  periods: { month: string; through: string }[];
  locations: {
    id: Id<"locations">;
    name: string;
    currency: string;
    periods: (MonthlyKpiAmounts & { month: string })[];
    budget: MonthlyKpiAmounts & { guestScore: MonthlyKpiCell };
  }[];
  updatedAt: number | null;
  revision: string;
};

export function validateKpiMonth(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Vælg en gyldig måned");
  parseDateKey(`${month}-01`);
  return month;
}

export function previousKpiMonth(month: string) {
  validateKpiMonth(month);
  return addDays(`${month}-01`, -1).slice(0, 7);
}

export function kpiMonthEnd(month: string) {
  validateKpiMonth(month);
  const start = parseDateKey(`${month}-01`);
  start.setUTCMonth(start.getUTCMonth() + 1);
  return addDays(start.toISOString().slice(0, 10), -1);
}

export function kpiMonths(month: string) {
  validateKpiMonth(month);
  const year = month.slice(0, 4);
  const months = Array.from({ length: Number(month.slice(5)) }, (_, index) =>
    `${year}-${String(index + 1).padStart(2, "0")}`,
  );
  return [...new Set([previousKpiMonth(month), ...months])].sort();
}

export function kpiCutoff(month: string, now: number, timeZone: string) {
  const yesterday = addDays(dateKey(now, timeZone), -1);
  if (yesterday < `${month}-01`) return null;
  return yesterday < kpiMonthEnd(month) ? yesterday : kpiMonthEnd(month);
}

export function kpiCell(
  value: number | null,
  reason: string | null = null,
  estimated = false,
  source: string | null = null,
  status: MonthlyKpiCell["status"] = estimated ? "provisional" : "ready",
): MonthlyKpiCell {
  if (value !== null && !Number.isFinite(value)) return { value: null, reason: "Tallet er ugyldigt", estimated, source, status: "missing" };
  return { value, reason: value === null ? reason ?? "Data mangler" : reason, estimated, source,
    status: value === null ? "missing" : estimated ? "provisional" : status };
}

function combinedCell(value: number | null, cells: MonthlyKpiCell[], reason: string | null = null): MonthlyKpiCell {
  const estimated = cells.some((cell) => cell.estimated);
  const status = cells.some((cell) => cell.status === "provisional") || estimated
    ? "provisional" : cells.every((cell) => cell.status === "approved") ? "approved" : "ready";
  const sources = [...new Set(cells.flatMap((cell) => cell.source ? [cell.source] : []))];
  const reasons = [...new Set(cells.flatMap((cell) => cell.reason ? [cell.reason] : []))];
  return kpiCell(value, reason ?? (reasons.join(" · ") || null), estimated, sources.join(" · ") || null, status);
}

export function sumKpiCells(cells: MonthlyKpiCell[]): MonthlyKpiCell {
  const missing = cells.find((cell) => cell.value === null);
  if (missing) return combinedCell(null, cells, missing.reason);
  if (!cells.length) return kpiCell(null, "Ingen lokationer valgt");
  let total = 0;
  for (const cell of cells) {
    if (!Number.isSafeInteger(cell.value)) return combinedCell(null, cells, "Beløbet skal være et helt antal øre");
    total += cell.value ?? 0;
    if (!Number.isSafeInteger(total)) return combinedCell(null, cells, "Rapportens samlede tal er for stort");
  }
  return combinedCell(total, cells);
}

export function ratioKpiCells(numerator: MonthlyKpiCell, denominator: MonthlyKpiCell, multiplier: number, estimated = false) {
  const cells = estimated ? [{ ...numerator, estimated: true }, denominator] : [numerator, denominator];
  if (numerator.value === null) return combinedCell(null, cells, numerator.reason);
  if (denominator.value === null) return combinedCell(null, cells, denominator.reason);
  if (denominator.value <= 0) return combinedCell(null, cells, "Beregningen kræver et positivt grundlag");
  return combinedCell(numerator.value / denominator.value * multiplier, cells);
}

export function kpiVariance(actual: MonthlyKpiCell, budget: MonthlyKpiCell) {
  if (actual.value === null) return combinedCell(null, [actual, budget], actual.reason);
  if (budget.value === null) return combinedCell(null, [actual, budget], budget.reason);
  return combinedCell(actual.value - budget.value, [actual, budget]);
}

export function buildMonthlyKpiReport(inputs: MonthlyKpiInputs) {
  const total = (component: MonthlyKpiComponent, months: string[]) => months.length === 0
    ? kpiCell(null, "Perioden har endnu ingen afsluttede dage")
    : sumKpiCells(inputs.locations.flatMap((location) => months.map((month) => {
      const value = location.periods.find((period) => period.month === month)?.[component]
        ?? kpiCell(null, "Perioden har endnu ingen afsluttede dage");
      const request = inputs.periods.find((period) => period.month === month);
      return value.value !== null && request && request.through !== kpiMonthEnd(month)
        ? { ...value, status: "provisional" as const } : value;
    })));
  const amounts = (months: string[]): MonthlyKpiAmounts => ({
    sales: total("sales", months), transactions: total("transactions", months),
    labour: total("labour", months), cogs: total("cogs", months), waste: total("waste", months),
    rent: total("rent", months), utilities: total("utilities", months), other: total("other", months),
  });
  const actual = amounts([inputs.month]);
  const previous = amounts([previousKpiMonth(inputs.month)]);
  const year = amounts(inputs.periods.map((period) => period.month).filter((month) => month.slice(0, 4) === inputs.month.slice(0, 4)));
  const budgetTotal = (component: MonthlyKpiComponent) => sumKpiCells(inputs.locations.map((location) => location.budget[component]));
  const budget: MonthlyKpiAmounts = {
    sales: budgetTotal("sales"), transactions: budgetTotal("transactions"), labour: budgetTotal("labour"),
    cogs: budgetTotal("cogs"), waste: budgetTotal("waste"), rent: budgetTotal("rent"),
    utilities: budgetTotal("utilities"), other: budgetTotal("other"),
  };
  const money = (cell: MonthlyKpiCell): MonthlyKpiCell => ({ ...cell, value: cell.value === null ? null : cell.value / 100 });
  const profit = (value: MonthlyKpiAmounts, costs: MonthlyKpiComponent[]) =>
    sumKpiCells([value.sales, ...costs.map((component) => ({ ...value[component], value: value[component].value === null ? null : -value[component].value }))]);
  const row = (id: MonthlyKpiRow["id"], label: string, unit: MonthlyKpiRow["unit"],
    compute: (value: MonthlyKpiAmounts) => MonthlyKpiCell): MonthlyKpiRow => {
    const actualCell = compute(actual);
    const budgetCell = compute(budget);
    return { id, label, unit, actual: actualCell, budget: budgetCell, variance: kpiVariance(actualCell, budgetCell),
      lastMonth: compute(previous), ytd: compute(year) };
  };
  const costRatio = (component: MonthlyKpiComponent) => (value: MonthlyKpiAmounts) => ratioKpiCells(value[component], value.sales, 100);
  const rows = [
    row("salesRevenue", "Nettoomsætning", "currency", (value) => money(value.sales)),
    row("salesOrderCount", "Transaktioner", "count", (value) => value.transactions),
    row("averageBasket", "Gennemsnitlig kurv", "currency", (value) => ratioKpiCells(value.sales, value.transactions, 0.01)),
    row("cogsPercent", "Vareforbrug", "percent", costRatio("cogs")),
    row("labourPercent", "Lønprocent", "percent", costRatio("labour")),
    row("grossMarginPercent", "Bruttoavance", "percent", (value) => ratioKpiCells(profit(value, ["cogs"]), value.sales, 100)),
    row("wastePercent", "Waste", "percent", costRatio("waste")),
    row("rentPercent", "Husleje", "percent", costRatio("rent")),
    row("utilitiesPercent", "Forbrug", "percent", costRatio("utilities")),
    row("primeCostPercent", "Primære omkostninger", "percent", (value) => ratioKpiCells(sumKpiCells([value.cogs, value.labour]), value.sales, 100)),
    row("ebitdaPercent", "Lokationens EBITDA", "percent", (value) => ratioKpiCells(profit(value, ["cogs", "labour", "rent", "utilities", "other"]), value.sales, 100)),
  ];
  const guestScore = kpiCell(null, "Google-adgang og tilladt rapportering af anmeldelser er endnu ikke afklaret", false, "Google");
  const scoreBudget = inputs.locations.length === 1 ? inputs.locations[0].budget.guestScore
    : kpiCell(null, inputs.locations.length ? "En fælles regel for lokationernes Guest Score-mål mangler" : "Ingen lokationer valgt");
  rows.push({ id: "guestScore", label: "Guest Score", unit: "score", actual: guestScore, budget: scoreBudget,
    variance: kpiVariance(guestScore, scoreBudget), lastMonth: guestScore, ytd: guestScore });
  return { month: inputs.month, through: inputs.through, currency: inputs.currency, rows,
    updatedAt: inputs.updatedAt, revision: inputs.revision };
}
