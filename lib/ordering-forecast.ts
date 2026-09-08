const DAY_MS = 86_400_000;
export const ORDER_HISTORY_DAYS = 56;
export const MAX_ORDER_QUANTITY = 1_000_000;
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

export function orderDate(timestamp: number, timeZone: string) {
  let formatter = dateFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dateFormatters.set(timeZone, formatter);
  }
  return formatter.format(timestamp);
}

export function shiftOrderDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export type DemandObservation = {
  date: string;
  productId: string;
  unitId: string;
  quantity: number;
};

// Future holiday/weather providers supply a multiplier per product and date.
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
}) {
  const daily = new Map<string, number>();
  for (const row of observations) {
    if (
      row.productId !== productId ||
      row.unitId !== unitId ||
      row.date < historyFrom ||
      row.date >= today ||
      !Number.isFinite(row.quantity)
    )
      continue;
    daily.set(row.date, (daily.get(row.date) ?? 0) + row.quantity);
  }
  const days = Math.max(
    0,
    Math.min(
      ORDER_HISTORY_DAYS,
      Math.round(
        (Date.parse(`${today}T00:00:00Z`) -
          Date.parse(`${historyFrom}T00:00:00Z`)) /
          DAY_MS,
      ),
    ),
  );
  const hasDemand = [...daily.values()].some((quantity) => quantity > 0);
  if (!hasDemand || days === 0) {
    return { demand: null, suggested: null, historyDays: days, limited: true };
  }
  const weekdays = Array.from({ length: 7 }, () => ({
    quantity: 0,
    weight: 0,
    samples: 0,
  }));
  let total = 0;
  let weightTotal = 0;
  for (let age = 1; age <= days; age++) {
    const date = shiftOrderDate(today, -age);
    const quantity = Math.max(0, daily.get(date) ?? 0);
    const weight = 0.5 ** (age / 28);
    const weekday = weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()];
    weekday.quantity += quantity * weight;
    weekday.weight += weight;
    weekday.samples++;
    total += quantity * weight;
    weightTotal += weight;
  }
  let demand = 0;
  for (let offset = 0; offset < coverageDays; offset++) {
    const date = shiftOrderDate(today, offset);
    const weekday = weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()];
    const baseline =
      weekday.samples >= 2
        ? weekday.quantity / weekday.weight
        : total / weightTotal;
    const multiplier = factors
      .filter(
        (factor) =>
          factor.productId === productId &&
          factor.date === date &&
          Number.isFinite(factor.multiplier) &&
          factor.multiplier >= 0,
      )
      .reduce((value, factor) => value * factor.multiplier, 1);
    demand += baseline * multiplier;
  }
  // Negative book stock is a discrepancy, not an extra future requirement.
  const needed = Math.max(
    0,
    demand * (1 + bufferPercent / 100) - Math.max(0, stock ?? 0),
  );
  return {
    demand: Math.round(demand * 1e3) / 1e3,
    suggested: Math.ceil(needed * 1e3 - 1e-9) / 1e3,
    historyDays: days,
    limited: days < 28 || stock === null,
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
