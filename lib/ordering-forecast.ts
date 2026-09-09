import { shiftOrderDate } from "./forecast-dates";
import { forecastDailyDemand, type ForecastCondition } from "./sales-forecast";
import type { ForecastOpeningDay } from "./forecast-opening-hours";
export { orderDate, shiftOrderDate } from "./forecast-dates";

const DAY_MS = 86_400_000;
export const ORDER_HISTORY_DAYS = 90;
export const MAX_ORDER_QUANTITY = 1_000_000;

export type DemandObservation = {
  date: string;
  productId: string;
  unitId: string;
  quantity: number;
};

// Demand models supply a multiplier per product and date.
export type DemandFactor = {
  source: string;
  date: string;
  productId: string;
  multiplier: number;
};

export function forecastOrder({
  productId,
  unitId,
  observations,
  historyFrom,
  today,
  coverageDays,
  bufferPercent,
  stock,
  factors = [],
  conditions = [],
  openingDays = [],
  staffFood = [],
  waste = [],
  operationalHistoryFrom = historyFrom,
}: {
  productId: string;
  unitId: string;
  observations: readonly DemandObservation[];
  historyFrom: string;
  today: string;
  coverageDays: number;
  bufferPercent: number;
  stock: number | null;
  factors?: readonly DemandFactor[];
  conditions?: readonly ForecastCondition[];
  openingDays?: readonly ForecastOpeningDay[];
  staffFood?: readonly DemandObservation[];
  waste?: readonly DemandObservation[];
  operationalHistoryFrom?: string;
}) {
  const from =
    historyFrom > shiftOrderDate(today, -ORDER_HISTORY_DAYS)
      ? historyFrom
      : shiftOrderDate(today, -ORDER_HISTORY_DAYS);
  function dailyObservations(rows: readonly DemandObservation[], start = from) {
    const quantities = new Map<string, number>();
    for (const row of rows) {
      if (
        row.productId === productId &&
        row.unitId === unitId &&
        row.date >= start &&
        row.date < today &&
        Number.isFinite(row.quantity)
      ) {
        quantities.set(
          row.date,
          (quantities.get(row.date) ?? 0) + row.quantity,
        );
      }
    }
    const daily = [];
    for (let date = start; date < today; date = shiftOrderDate(date, 1))
      daily.push({ date, value: Math.max(0, quantities.get(date) ?? 0) });
    return daily;
  }
  const salesHistory = dailyObservations(observations);
  const operationsFrom =
    operationalHistoryFrom > shiftOrderDate(today, -ORDER_HISTORY_DAYS)
      ? operationalHistoryFrom
      : shiftOrderDate(today, -ORDER_HISTORY_DAYS);
  const staffHistory = dailyObservations(staffFood, operationsFrom);
  const wasteHistory = dailyObservations(waste, operationsFrom);
  const days = Math.max(
    0,
    Math.round((Date.parse(today) - Date.parse(from)) / DAY_MS),
  );
  if (
    ![...salesHistory, ...staffHistory, ...wasteHistory].some(
      (row) => row.value > 0,
    )
  ) {
    return {
      demand: null,
      suggested: null,
      salesDemand: 0,
      staffFoodDemand: 0,
      wasteDemand: 0,
      historyDays: days,
      limited: true,
    };
  }
  const sales = forecastDailyDemand({
    observations: salesHistory,
    conditions,
    today,
    openingDays,
    precision: 6,
  });
  function total(points: typeof sales.points, applyFactors = false) {
    return points.slice(0, coverageDays).reduce((sum, point) => {
      const multiplier = applyFactors
        ? factors
            .filter(
              (factor) =>
                factor.productId === productId &&
                factor.date === point.date &&
                Number.isFinite(factor.multiplier) &&
                factor.multiplier >= 0,
            )
            .reduce((value, factor) => value * factor.multiplier, 1)
        : 1;
      return sum + point.value * multiplier;
    }, 0);
  }
  const salesDemand = total(sales.points, true);
  // Non-sales use has its own weekday/hour baseline, without customer weather effects.
  const staffFoodDemand = total(
    forecastDailyDemand({
      observations: staffHistory,
      conditions: [],
      today,
      openingDays,
      precision: 6,
    }).points,
  );
  const wasteDemand = total(
    forecastDailyDemand({
      observations: wasteHistory,
      conditions: [],
      today,
      precision: 6,
    }).points,
  );
  const demand = salesDemand + staffFoodDemand + wasteDemand;
  const needed = Math.max(
    0,
    demand * (1 + bufferPercent / 100) - Math.max(0, stock ?? 0),
  );
  const round = (value: number) => Math.round(value * 1e3) / 1e3;
  return {
    demand: round(demand),
    suggested: Math.ceil(needed * 1e3 - 1e-9) / 1e3,
    salesDemand: round(salesDemand),
    staffFoodDemand: round(staffFoodDemand),
    wasteDemand: round(wasteDemand),
    historyDays: days,
    limited: sales.historyDays < 28 || stock === null,
  };
}

export function parseOrderQuantity(value: string) {
  if (!value.trim()) return 0;
  if (!/^\d+(?:[.,]\d{0,6})?$/.test(value.trim())) return null;
  const quantity = Number(value.trim().replace(",", "."));
  return Number.isFinite(quantity) && quantity <= MAX_ORDER_QUANTITY
    ? quantity
    : null;
}
