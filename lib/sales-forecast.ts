import { shiftOrderDate } from "./ordering-forecast";

export const SALES_FORECAST_HISTORY_DAYS = 400;
export const SALES_FORECAST_DAYS = 28;

export type ForecastCondition = {
  date: string;
  temperature: number | null;
  precipitation: number | null;
  holiday: boolean | null;
};

export type DailySalesObservation = { date: string; value: number };

const dayNumber = (date: string) =>
  Date.parse(`${date}T00:00:00Z`) / 86_400_000;
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const bounded = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function solve(matrix: number[][], target: number[]) {
  const rows = matrix.map((row, index) => [...row, target[index]]);
  for (let column = 0; column < rows.length; column++) {
    let pivot = column;
    for (let index = column + 1; index < rows.length; index++) {
      if (Math.abs(rows[index][column]) > Math.abs(rows[pivot][column]))
        pivot = index;
    }
    if (Math.abs(rows[pivot][column]) < 1e-9) return null;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let index = column; index <= rows.length; index++)
      rows[column][index] /= divisor;
    for (let index = 0; index < rows.length; index++) {
      if (index === column) continue;
      const factor = rows[index][column];
      for (let cell = column; cell <= rows.length; cell++)
        rows[index][cell] -= factor * rows[column][cell];
    }
  }
  return rows.map((row) => row[rows.length]);
}

function meanAndScale(values: number[], minimumScale: number) {
  const mean =
    values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, values.length);
  return { mean, scale: Math.max(minimumScale, Math.sqrt(variance)) };
}

export function forecastDailySales({
  observations,
  conditions,
  today,
}: {
  observations: readonly DailySalesObservation[];
  conditions: readonly ForecastCondition[];
  today: string;
}) {
  const from = shiftOrderDate(today, -SALES_FORECAST_HISTORY_DAYS);
  const history = observations
    .filter(
      (row) =>
        row.date >= from &&
        row.date < today &&
        Number.isFinite(row.value) &&
        row.value >= 0,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const conditionByDate = new Map(
    conditions.map((condition) => [condition.date, condition]),
  );
  const weatherHistory = history.flatMap((row) => {
    const condition = conditionByDate.get(row.date);
    return condition?.temperature !== null &&
      condition?.temperature !== undefined &&
      condition.precipitation !== null
      ? [condition]
      : [];
  });
  const temperatures = weatherHistory.flatMap((row) =>
    row.temperature === null ? [] : [row.temperature],
  );
  const rainfall = weatherHistory.flatMap((row) =>
    row.precipitation === null ? [] : [Math.log1p(row.precipitation)],
  );
  const temperature = meanAndScale(temperatures, 2);
  const rain = meanAndScale(rainfall, 0.25);
  const weatherLearned = weatherHistory.length >= 56;
  const holidayDays = history.filter(
    (row) => conditionByDate.get(row.date)?.holiday === true,
  ).length;
  const ordinaryDays = history.filter(
    (row) => conditionByDate.get(row.date)?.holiday === false,
  ).length;
  const holidaysLearned = holidayDays >= 3 && ordinaryDays >= 28;
  const seasonal = history.length >= 300;

  function features(date: string) {
    const condition = conditionByDate.get(date);
    const day = weekday(date);
    const annual = (dayNumber(date) / 365.25) * 2 * Math.PI;
    return [
      1,
      ...Array.from({ length: 6 }, (_, index) => Number(day === index + 1)),
      (dayNumber(date) - dayNumber(today)) / 90,
      seasonal ? Math.sin(annual) : 0,
      seasonal ? Math.cos(annual) : 0,
      weatherLearned && condition?.temperature != null
        ? bounded(
            (condition.temperature - temperature.mean) / temperature.scale,
            -3,
            3,
          )
        : 0,
      weatherLearned && condition?.precipitation != null
        ? bounded(
            (Math.log1p(condition.precipitation) - rain.mean) / rain.scale,
            -3,
            3,
          )
        : 0,
      holidaysLearned && condition?.holiday === true ? 1 : 0,
    ];
  }

  const dimensions = 13;
  const matrix = Array.from({ length: dimensions }, () =>
    Array<number>(dimensions).fill(0),
  );
  const target = Array<number>(dimensions).fill(0);
  let trainingDays = 0;
  for (const row of history) {
    const condition = conditionByDate.get(row.date);
    if (
      (weatherLearned &&
        (condition?.temperature == null || condition.precipitation == null)) ||
      (holidaysLearned && condition?.holiday == null)
    )
      continue;
    trainingDays++;
    const x = features(row.date);
    const weight = 0.5 ** ((dayNumber(today) - dayNumber(row.date)) / 180);
    const y = Math.log1p(row.value);
    for (let i = 0; i < dimensions; i++) {
      target[i] += weight * x[i] * y;
      for (let j = 0; j < dimensions; j++) matrix[i][j] += weight * x[i] * x[j];
    }
  }
  // Shrink sparse weather/holiday effects; weekday and trend terms absorb calendar variation.
  const penalties = [0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 8, 4, 4, 6, 6, 3];
  for (let i = 0; i < dimensions; i++) matrix[i][i] += penalties[i];
  const coefficients = trainingDays >= 56 ? solve(matrix, target) : null;
  const recent = history.filter(
    (row) => row.date >= shiftOrderDate(today, -56),
  );

  const points = Array.from({ length: SALES_FORECAST_DAYS }, (_, offset) => {
    const date = shiftOrderDate(today, offset);
    const sameWeekday = recent.filter(
      (row) => weekday(row.date) === weekday(date),
    );
    const samples = sameWeekday.length >= 2 ? sameWeekday : recent;
    let valueSum = 0;
    let weightSum = 0;
    const normal = [0, 0, 0];
    for (const row of samples) {
      const weight = 0.5 ** ((dayNumber(today) - dayNumber(row.date)) / 28);
      valueSum += weight * row.value;
      weightSum += weight;
      const x = features(row.date);
      for (let i = 0; i < normal.length; i++) normal[i] += weight * x[10 + i];
    }
    const baseline = weightSum > 0 ? valueSum / weightSum : 0;
    const condition = conditionByDate.get(date);
    const weatherApplied = Boolean(
      coefficients &&
      weatherLearned &&
      condition?.temperature != null &&
      condition.precipitation != null,
    );
    const holidayApplied = Boolean(
      coefficients && holidaysLearned && condition?.holiday != null,
    );
    const x = features(date);
    let effect = 0;
    if (coefficients && weightSum > 0) {
      if (weatherApplied) {
        effect += coefficients[10] * (x[10] - normal[0] / weightSum);
        effect += coefficients[11] * (x[11] - normal[1] / weightSum);
      }
      if (holidayApplied)
        effect += coefficients[12] * (x[12] - normal[2] / weightSum);
    }
    const multiplier = bounded(Math.exp(effect), 0.25, 4);
    return {
      date,
      value: Math.round(baseline * multiplier),
      multiplier,
      weatherApplied,
      holidayApplied,
    };
  });
  return {
    points,
    historyDays: history.length,
    weatherDays: weatherHistory.length,
    holidayDays,
    weatherLearned: Boolean(coefficients && weatherLearned),
    holidaysLearned: Boolean(coefficients && holidaysLearned),
  };
}
