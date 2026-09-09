export const DEFAULT_TIME_ZONE = "Europe/Copenhagen";
export const DAY_MS = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

export function dateTimeFormatter(
  locale: string,
  options: Intl.DateTimeFormatOptions,
) {
  const key = JSON.stringify([locale, options]);
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, formatter);
  }
  return formatter;
}

export function dateKey(timestamp: number, timeZone: string) {
  const parts = dateTimeFormatter("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function parseDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Datoen er ugyldig");
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Datoen er ugyldig");
  }
  return date;
}

export function addDays(value: string, days: number) {
  const date = parseDateKey(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  return (parseDateKey(to).getTime() - parseDateKey(from).getTime()) / DAY_MS;
}

export function zonedTimestamp(
  value: string,
  minuteOfDay: number,
  timeZone: string,
) {
  if (
    !Number.isInteger(minuteOfDay) ||
    minuteOfDay < 0 ||
    minuteOfDay > 1_439
  ) {
    throw new Error("Tidspunktet er ugyldigt");
  }
  const target = parseDateKey(value).getTime() + minuteOfDay * 60_000;
  const formatter = dateTimeFormatter("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let candidate = target;
  let previous: number | undefined;
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(candidate)
        .map((part) => [part.type, Number(part.value)]),
    );
    const represented = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const correction = target - represented;
    if (correction === 0) return candidate;
    const next = candidate + correction;
    // During a clock-forward gap, use the corresponding time after the gap.
    if (next === previous) return Math.max(candidate, next);
    previous = candidate;
    candidate = next;
  }
  return candidate;
}

export function zonedStart(value: string, timeZone: string) {
  return zonedTimestamp(value, 0, timeZone);
}

export function toDateTimeLocal(timestamp: number) {
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(timestamp - offset).toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value: string) {
  return new Date(value).getTime();
}

export function inclusiveDateRangeDays(from: string, to: string) {
  try {
    return daysBetween(from, to) + 1;
  } catch {
    return NaN;
  }
}
