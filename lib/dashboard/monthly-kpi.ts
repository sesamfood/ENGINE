import { addDays, dateKey, parseDateKey } from "../date";

export type MonthlyKpiCell = {
  value: number | null;
  reason: string | null;
  estimated: boolean;
};

export type MonthlyKpiRow = {
  id: "salesRevenue" | "salesOrderCount" | "averageBasket" | "estimatedLabourPercent";
  label: string;
  unit: "currency" | "count" | "percent";
  actual: MonthlyKpiCell;
  budget: MonthlyKpiCell;
  variance: MonthlyKpiCell;
  lastMonth: MonthlyKpiCell;
  ytd: MonthlyKpiCell;
};

export function validateKpiMonth(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Vælg en gyldig måned");
  }
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

export function kpiCell(value: number | null, reason: string | null = null, estimated = false): MonthlyKpiCell {
  return { value, reason: value === null ? reason ?? "Data mangler" : null, estimated };
}

export function sumKpiCells(cells: MonthlyKpiCell[]): MonthlyKpiCell {
  const missing = cells.find((cell) => cell.value === null);
  if (missing) return kpiCell(null, missing.reason);
  if (!cells.length) return kpiCell(null, "Ingen lokationer valgt");
  const total = cells.reduce((sum, cell) => sum + (cell.value ?? 0), 0);
  return Number.isSafeInteger(total) ? kpiCell(total) : kpiCell(null, "Rapportens samlede tal er for stort");
}

export function ratioKpiCells(numerator: MonthlyKpiCell, denominator: MonthlyKpiCell, multiplier: number, estimated = false) {
  if (numerator.value === null) return kpiCell(null, numerator.reason, estimated);
  if (denominator.value === null) return kpiCell(null, denominator.reason, estimated);
  if (denominator.value <= 0) return kpiCell(null, "Beregningen kræver et positivt grundlag", estimated);
  return kpiCell(numerator.value / denominator.value * multiplier, null, estimated);
}

export function kpiVariance(actual: MonthlyKpiCell, budget: MonthlyKpiCell) {
  if (actual.value === null) return kpiCell(null, actual.reason, actual.estimated);
  if (budget.value === null) return kpiCell(null, budget.reason, actual.estimated);
  return kpiCell(actual.value - budget.value, null, actual.estimated);
}
