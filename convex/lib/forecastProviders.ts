import { z } from "zod";
import type { Infer } from "convex/values";
import { shiftOrderDate } from "../../lib/ordering-forecast";
import {
  SALES_FORECAST_DAYS,
  SALES_FORECAST_HISTORY_DAYS,
  type ForecastCondition,
} from "../../lib/sales-forecast";
import { forecastProfileValidator } from "./forecastValidators";

const dateSchema = z.iso.date();
const weatherSchema = z.object({
  daily: z.object({
    time: z.array(dateSchema).max(430),
    temperature_2m_mean: z
      .array(z.number().finite().min(-100).max(70).nullable())
      .max(430),
    precipitation_sum: z
      .array(z.number().finite().min(0).max(3000).nullable())
      .max(430),
  }),
});
const holidaysSchema = z
  .array(
    z.object({
      date: dateSchema,
      countryCode: z.string(),
      nationalHoliday: z.boolean(),
      subdivisionCodes: z.array(z.string()).nullable(),
      holidayTypes: z.array(z.string()),
    }),
  )
  .max(1000);

async function readJson(url: URL) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("Provider request failed");
  const body: unknown = await response.json();
  return body;
}

async function weather(url: URL, from: string, through: string) {
  const { daily } = weatherSchema.parse(await readJson(url));
  if (
    daily.time.length !== daily.temperature_2m_mean.length ||
    daily.time.length !== daily.precipitation_sum.length ||
    daily.time.length !==
      (Date.parse(through) - Date.parse(from)) / 86_400_000 + 1 ||
    daily.time.some((date, index) => date !== shiftOrderDate(from, index))
  )
    throw new Error("Incomplete weather response");
  return daily.time.map((date, index) => ({
    date,
    temperature: daily.temperature_2m_mean[index],
    precipitation: daily.precipitation_sum[index],
  }));
}

export async function fetchForecastConditions({
  profile,
  timeZone,
  today,
  cached,
  archiveThrough,
}: {
  profile: Infer<typeof forecastProfileValidator>;
  timeZone: string;
  today: string;
  cached: readonly ForecastCondition[];
  archiveThrough?: string;
}) {
  const from = shiftOrderDate(today, -SALES_FORECAST_HISTORY_DAYS);
  const through = shiftOrderDate(today, SALES_FORECAST_DAYS - 1);
  const archived = new Map(
    cached
      .filter((row) => archiveThrough && row.date <= archiveThrough)
      .map((row) => [row.date, row]),
  );
  const conditions = new Map<string, ForecastCondition>();
  for (let date = from; date <= through; date = shiftOrderDate(date, 1)) {
    const old = archived.get(date);
    conditions.set(date, {
      date,
      temperature: old?.temperature ?? null,
      precipitation: old?.precipitation ?? null,
      holiday: null,
    });
  }
  const warnings: string[] = [];
  let nextArchiveThrough = archiveThrough;
  const apiKey = process.env.OPEN_METEO_API_KEY?.trim();
  const archiveFrom =
    archiveThrough && archiveThrough >= from
      ? shiftOrderDate(archiveThrough, 1)
      : from;
  const archiveEnd = shiftOrderDate(today, -7);
  function weatherUrl(
    host: string,
    path: string,
    parameters: Record<string, string>,
  ) {
    const url = new URL(path, host);
    url.search = new URLSearchParams({
      latitude: String(profile.latitude),
      longitude: String(profile.longitude),
      timezone: timeZone,
      daily: "temperature_2m_mean,precipitation_sum",
      temperature_unit: "celsius",
      precipitation_unit: "mm",
      apikey: apiKey ?? "",
      ...parameters,
    }).toString();
    return url;
  }
  const years = Array.from(
    { length: Number(through.slice(0, 4)) - Number(from.slice(0, 4)) + 1 },
    (_, i) => Number(from.slice(0, 4)) + i,
  );
  const [[archive, recent], holidays] = await Promise.all([
    Promise.allSettled([
      apiKey && archiveFrom <= archiveEnd
        ? weather(
            weatherUrl(
              "https://customer-archive-api.open-meteo.com",
              "/v1/archive",
              { start_date: archiveFrom, end_date: archiveEnd },
            ),
            archiveFrom,
            archiveEnd,
          )
        : Promise.resolve([]),
      apiKey
        ? weather(
            weatherUrl("https://customer-api.open-meteo.com", "/v1/forecast", {
              past_days: "7",
              forecast_days: "16",
            }),
            shiftOrderDate(today, -7),
            shiftOrderDate(today, 15),
          )
        : Promise.resolve([]),
    ]),
    Promise.allSettled(
      years.map(async (year) => {
        const rows = holidaysSchema.parse(
          await readJson(
            new URL(
              `https://nagerholidays.com/api/v4/Holidays/${profile.countryCode}/${year}`,
            ),
          ),
        );
        if (
          rows.some(
            (row) =>
              row.countryCode !== profile.countryCode ||
              !row.date.startsWith(String(year)),
          )
        )
          throw new Error("Invalid holiday calendar");
        const dates = new Set(
          rows
            .filter(
              (row) =>
                row.holidayTypes.includes("Public") &&
                (row.nationalHoliday ||
                  (profile.subdivisionCode &&
                    row.subdivisionCodes?.includes(profile.subdivisionCode))),
            )
            .map((row) => row.date),
        );
        return { year, dates };
      }),
    ),
  ]);
  if (!apiKey) warnings.push("Vejrdata afventer opsætning af Open-Meteo.");
  else if (archive.status === "rejected" || recent.status === "rejected")
    warnings.push(
      "Vejrdata kunne ikke opdateres. Manglende vejr indgår ikke i prognosen.",
    );
  for (const result of [archive, recent]) {
    if (result.status !== "fulfilled") continue;
    for (const row of result.value) {
      const condition = conditions.get(row.date);
      if (condition) Object.assign(condition, row);
    }
  }
  if (archive.status === "fulfilled" && apiKey && archiveFrom <= archiveEnd) {
    // Retry gaps instead of treating null weather as a completed archive.
    for (
      let date = archiveFrom;
      date <= archiveEnd;
      date = shiftOrderDate(date, 1)
    ) {
      const row = conditions.get(date);
      if (row?.temperature == null || row.precipitation == null) break;
      nextArchiveThrough = date;
    }
  }
  for (const result of holidays) {
    if (result.status !== "fulfilled") {
      warnings.push(
        "Helligdage kunne ikke opdateres for alle år. Manglende kalenderdata indgår ikke i prognosen.",
      );
      continue;
    }
    for (const condition of conditions.values()) {
      if (condition.date.startsWith(String(result.value.year)))
        condition.holiday = result.value.dates.has(condition.date);
    }
  }
  return {
    conditions: [...conditions.values()],
    archiveThrough: nextArchiveThrough,
    warning: [...new Set(warnings)].join(" "),
  };
}
