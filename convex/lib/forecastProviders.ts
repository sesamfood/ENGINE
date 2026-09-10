import { dateTimeFormatter, dateKey as dateInTimeZone, zonedStart as localStartUtc } from "../../lib/date";
import { z } from "zod";
import type { Infer } from "convex/values";
import { env } from "../_generated/server";
import { shiftOrderDate } from "../../lib/ordering-forecast";
import {
  SALES_FORECAST_DAYS,
  SALES_FORECAST_HISTORY_DAYS,
  type ForecastCondition,
} from "../../lib/sales-forecast";
import { forecastProfileValidator } from "./forecastValidators";

const MAX_OPENWEATHER_REQUESTS = 6;
const MAX_FORECAST_PAGES = 3;
const MAX_BACKFILL_PAGES = 3;
const MAX_PAGE_DAYS = 10;
const OPENWEATHER_HOST = "https://api.openweathermap.org";
const OPENWEATHER_PATH = "/data/4.0/onecall/timeline/1day";
const MAX_EPOCH_SECONDS = 4_102_444_800;

const dateSchema = z.iso.date();
const boundedTemperatureSchema = z
  .number()
  .finite()
  .min(-100)
  .max(70);
const boundedPrecipitationSchema = z
  .number()
  .finite()
  .min(0)
  .max(3000);
const epochSecondsSchema = z
  .number()
  .finite()
  .int()
  .positive()
  .max(MAX_EPOCH_SECONDS);
const weatherPageSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
  timezone: z.string().min(1),
  timezone_offset: z.number().finite().int().min(-86_400).max(86_400),
  data: z
    .array(
      z.object({
        dt: epochSecondsSchema,
        temp: z.object({
          day: boundedTemperatureSchema,
        }),
        rain: boundedPrecipitationSchema.optional(),
        snow: boundedPrecipitationSchema.optional(),
      }),
    )
    .max(MAX_PAGE_DAYS),
  next: z.string().optional(),
  prev: z.string().optional(),
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

type ProviderErrorKind =
  | "http"
  | "network"
  | "invalid-response"
  | "timezone";

class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    readonly status?: number,
  ) {
    super("Provider request failed");
    this.name = "ProviderError";
  }
}

async function readJson(url: URL): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      redirect: "error",
    });
  } catch {
    throw new ProviderError("network");
  }
  if (!response.ok) throw new ProviderError("http", response.status);
  try {
    return await response.json();
  } catch {
    throw new ProviderError("invalid-response");
  }
}

function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

function partsAt(timestamp: number, timeZone: string) {
  const parts = dateTimeFormatter("en-CA", {
    timeZone,
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(timestamp)
    .reduce<Record<string, string>>((values, part) => {
      values[part.type] = part.value;
      return values;
    }, {});
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const second = Number(parts.second);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    !Number.isInteger(second)
  )
    throw new Error("Invalid timezone parts");
  return { year, month, day, hour, minute, second };
}

function offsetAt(timestamp: number, timeZone: string) {
  const parts = partsAt(timestamp, timeZone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((localAsUtc - timestamp) / 1000);
}

function safeDate(value: string) {
  return dateSchema.safeParse(value).success;
}

function safeArchiveThrough(value: string | undefined, today: string) {
  return value && safeDate(value) && value < today ? value : undefined;
}

function weatherUrl(
  profile: Infer<typeof forecastProfileValidator>,
  apiKey: string,
  start: number,
) {
  const url = new URL(OPENWEATHER_PATH, OPENWEATHER_HOST);
  url.search = new URLSearchParams({
    lat: String(profile.latitude),
    lon: String(profile.longitude),
    appid: apiKey,
    units: "metric",
    start: String(Math.floor(start / 1000)),
  }).toString();
  return url;
}

function validatedNextStart(value: string, currentStart: number) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "api.openweathermap.org" ||
    url.pathname !== OPENWEATHER_PATH
  )
    return null;
  const rawStart = url.searchParams.get("start");
  if (!rawStart || !/^\d+$/.test(rawStart)) return null;
  const start = Number(rawStart) * 1000;
  if (
    !Number.isSafeInteger(start) ||
    start <= currentStart ||
    start > MAX_EPOCH_SECONDS * 1000
  )
    return null;
  return start;
}

function safeProviderError(error: unknown) {
  return error instanceof ProviderError
    ? error
    : new ProviderError("invalid-response");
}

type WeatherPage = z.infer<typeof weatherPageSchema>;

function parseWeatherPage(
  body: unknown,
  profile: Infer<typeof forecastProfileValidator>,
  timeZone: string,
): WeatherPage {
  let page: WeatherPage;
  try {
    page = weatherPageSchema.parse(body);
  } catch {
    throw new ProviderError("invalid-response");
  }
  if (!isValidTimeZone(page.timezone) || page.data.length === 0)
    throw new ProviderError("invalid-response");
  if (
    Math.abs(page.lat - profile.latitude) > 0.1 ||
    Math.abs(page.lon - profile.longitude) > 0.1
  )
    throw new ProviderError("invalid-response");
  const seenDates = new Set<string>();
  let previousDt = 0;
  for (const row of page.data) {
    const timestamp = row.dt * 1000;
    if (row.dt <= previousDt) throw new ProviderError("invalid-response");
    previousDt = row.dt;
    const providerDate = dateInTimeZone(timestamp, page.timezone);
    const siteDate = dateInTimeZone(timestamp, timeZone);
    const providerOffset = offsetAt(timestamp, page.timezone);
    const siteOffset = offsetAt(timestamp, timeZone);
    if (
      !safeDate(providerDate) ||
      !safeDate(siteDate) ||
      seenDates.has(siteDate)
    )
      throw new ProviderError("invalid-response");
    seenDates.add(siteDate);
    if (providerDate !== siteDate || providerOffset !== siteOffset)
      throw new ProviderError("timezone");
    if (
      row.rain !== undefined &&
      row.snow !== undefined &&
      row.rain + row.snow > 3000
    )
      throw new ProviderError("invalid-response");
  }
  const firstTimestamp = page.data[0].dt * 1000;
  if (!Number.isFinite(firstTimestamp)) throw new ProviderError("invalid-response");
  return page;
}

async function weatherPage(
  profile: Infer<typeof forecastProfileValidator>,
  apiKey: string,
  timeZone: string,
  start: number,
) {
  const body = await readJson(weatherUrl(profile, apiKey, start));
  return parseWeatherPage(body, profile, timeZone);
}

function providerWarning(error: ProviderError) {
  if (error.kind === "timezone")
    return "Vejrdata blev afvist, fordi leverandørens tidszone ikke matcher lokationens tidszone.";
  return "Vejrdata kunne ikke opdateres. Manglende vejr indgår ikke i prognosen.";
}

function isRateOrAuthError(error: ProviderError) {
  return error.status === 401 || error.status === 403 || error.status === 429;
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
  const archivedThrough = safeArchiveThrough(archiveThrough, today);
  const archived = new Map(
    cached
      .filter(
        (row) =>
          row.date < today &&
          row.date >= from &&
          archivedThrough !== undefined &&
          row.date <= archivedThrough,
      )
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

  const warnings = new Set<string>();
  let nextArchiveThrough = archivedThrough;
  let latestFetchedPast: string | undefined;
  let openWeatherCalls = 0;
  let openWeatherBlocked = false;
  const currentFetchedDates = new Set<string>();
  const currentFrom = shiftOrderDate(today, -1);
  const currentRequired = new Set<string>();
  for (
    let date = currentFrom;
    date <= through;
    date = shiftOrderDate(date, 1)
  )
    currentRequired.add(date);

  const recordFetchedPast = (date: string) => {
    if (
      date >= from &&
      date < today &&
      (latestFetchedPast === undefined || date > latestFetchedPast)
    )
      latestFetchedPast = date;
  };

  const applyPage = (page: WeatherPage, mode: "current" | "backfill") => {
    for (const row of page.data) {
      const date = dateInTimeZone(row.dt * 1000, timeZone);
      const condition = conditions.get(date);
      if (!condition) continue;
      const precipitation = (row.rain ?? 0) + (row.snow ?? 0);
      if (mode === "backfill") {
        if (date >= today || condition.temperature !== null) continue;
      }
      condition.temperature = row.temp.day;
      condition.precipitation = precipitation;
      if (mode === "current") currentFetchedDates.add(date);
      if (date < today) recordFetchedPast(date);
    }
  };

  const noteWeatherError = (error: unknown) => {
    const safeError = safeProviderError(error);
    warnings.add(providerWarning(safeError));
    if (isRateOrAuthError(safeError)) openWeatherBlocked = true;
  };

  const apiKey = env.OPENWEATHER_API_KEY?.trim();
  if (!apiKey) {
    warnings.add("Vejrdata afventer opsætning af OpenWeather.");
  } else if (!isValidTimeZone(timeZone)) {
    warnings.add(
      "Vejrdata kunne ikke opdateres. Manglende vejr indgår ikke i prognosen.",
    );
  } else if (
    !Number.isFinite(profile.latitude) ||
    profile.latitude < -90 ||
    profile.latitude > 90 ||
    !Number.isFinite(profile.longitude) ||
    profile.longitude < -180 ||
    profile.longitude > 180
  ) {
    warnings.add(
      "Vejrdata kunne ikke opdateres. Manglende vejr indgår ikke i prognosen.",
    );
  } else {
    let nextStart: number | null = localStartUtc(currentFrom, timeZone);
    const visitedStarts = new Set<number>();
    for (
      let pageNumber = 0;
      pageNumber < MAX_FORECAST_PAGES &&
      nextStart !== null &&
      !openWeatherBlocked;
      pageNumber++
    ) {
      const start = nextStart;
      nextStart = null;
      if (visitedStarts.has(start)) {
        warnings.add(
          "Vejrdata kunne ikke fortsætte siden. Manglende vejr indgår ikke i prognosen.",
        );
        break;
      }
      visitedStarts.add(start);
      openWeatherCalls++;
      try {
        const page = await weatherPage(profile, apiKey, timeZone, start);
        applyPage(page, "current");
        if ([...currentRequired].every((date) => currentFetchedDates.has(date)))
          break;
        if (!page.next) break;
        nextStart = validatedNextStart(page.next, start);
        if (nextStart === null) {
          warnings.add(
            "Vejrdata kunne ikke fortsætte siden. Manglende vejr indgår ikke i prognosen.",
          );
          break;
        }
      } catch (error) {
        noteWeatherError(error);
        break;
      }
    }
    if (
      ![...currentRequired].every((date) => currentFetchedDates.has(date)) &&
      !openWeatherBlocked
    )
      warnings.add(
        "Vejrdata mangler for nogle prognosedage. Manglende vejr indgår ikke i prognosen.",
      );

    const findRecentGap = () => {
      let date = shiftOrderDate(today, -1);
      while (date >= from) {
        const condition = conditions.get(date);
        const missing =
          !condition ||
          condition.temperature === null ||
          condition.precipitation === null;
        if (!missing) {
          date = shiftOrderDate(date, -1);
          continue;
        }
        const end = date;
        while (date >= from) {
          const current = conditions.get(date);
          if (
            current &&
            current.temperature !== null &&
            current.precipitation !== null
          )
            break;
          date = shiftOrderDate(date, -1);
        }
        const gapStart = shiftOrderDate(date, 1);
        const tenDaysAgo = shiftOrderDate(end, -MAX_PAGE_DAYS + 1);
        const pageStart = tenDaysAgo > gapStart ? tenDaysAgo : gapStart;
        return pageStart;
      }
      return null;
    };

    for (
      let pageNumber = 0;
      pageNumber < MAX_BACKFILL_PAGES &&
      openWeatherCalls < MAX_OPENWEATHER_REQUESTS &&
      !openWeatherBlocked;
      pageNumber++
    ) {
      const pageStartDate = findRecentGap();
      if (!pageStartDate) break;
      openWeatherCalls++;
      try {
        const page = await weatherPage(
          profile,
          apiKey,
          timeZone,
          localStartUtc(pageStartDate, timeZone),
        );
        applyPage(page, "backfill");
      } catch (error) {
        noteWeatherError(error);
        break;
      }
    }
    if (
      latestFetchedPast !== undefined &&
      (nextArchiveThrough === undefined || latestFetchedPast > nextArchiveThrough)
    )
      nextArchiveThrough = latestFetchedPast;
    if (
      [...conditions.values()].some(
        (condition) =>
          condition.date < today &&
          (condition.temperature === null || condition.precipitation === null),
      )
    )
      warnings.add(
        "Vejrhistorikken er ufuldstændig. Manglende vejr indgår ikke i prognosen.",
      );
  }

  const years = Array.from(
    { length: Number(through.slice(0, 4)) - Number(from.slice(0, 4)) + 1 },
    (_, i) => Number(from.slice(0, 4)) + i,
  );
  const holidays = await Promise.allSettled(
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
      const unresolvedDates = new Set(
        !profile.subdivisionCode
          ? rows
              .filter((row) => row.holidayTypes.includes("Public") && !row.nationalHoliday)
              .map((row) => row.date)
          : [],
      );
      return { year, dates, unresolvedDates };
    }),
  );
  for (const result of holidays) {
    if (result.status !== "fulfilled") {
      warnings.add(
        "Helligdage kunne ikke opdateres for alle år. Manglende kalenderdata indgår ikke i prognosen.",
      );
      continue;
    }
    for (const condition of conditions.values()) {
      if (condition.date.startsWith(String(result.value.year))) {
        condition.holiday = result.value.dates.has(condition.date)
          ? true
          : result.value.unresolvedDates.has(condition.date) ? null : false;
        if (condition.holiday === null) {
          warnings.add("Regionskoden er ikke tilgængelig. Regionale helligdage indgår ikke i prognosen.");
        }
      }
    }
  }
  return {
    conditions: [...conditions.values()],
    archiveThrough: nextArchiveThrough,
    warning: [...warnings].join(" "),
  };
}
