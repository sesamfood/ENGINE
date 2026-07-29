export const COUNT_TIME_ZONE = "Europe/Copenhagen";

export type CountSettings = {
  closeMinuteOfDay: number;
  openMinuteOfDay: number;
};

export const DEFAULT_COUNT_SETTINGS: CountSettings = {
  closeMinuteOfDay: 22 * 60,
  openMinuteOfDay: 8 * 60,
};

const zonedParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: COUNT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function partsAt(timestamp: number) {
  const parts = Object.fromEntries(
    zonedParts
      .formatToParts(timestamp)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function zonedTimestamp(
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
) {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = target;

  for (let pass = 0; pass < 2; pass++) {
    const actual = partsAt(candidate);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    candidate += target - actualAsUtc;
  }

  return candidate;
}

function parsePeriod(periodKey: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodKey);
  if (!match) throw new Error("Perioden er ugyldig");
  return { year: Number(match[1]), month: Number(match[2]) };
}

function periodKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function offsetPeriod(year: number, month: number, offset: number) {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
  };
}

export function countWindow(
  key: string,
  settings: CountSettings = DEFAULT_COUNT_SETTINGS,
) {
  const { year, month } = parsePeriod(key);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const next = offsetPeriod(year, month, 1);

  return {
    periodKey: key,
    opensAt: zonedTimestamp(
      year,
      month,
      lastDay,
      settings.closeMinuteOfDay,
    ),
    closesAt: zonedTimestamp(
      next.year,
      next.month,
      1,
      settings.openMinuteOfDay,
    ),
  };
}

export function activePeriod(
  now: number,
  settings: CountSettings = DEFAULT_COUNT_SETTINGS,
) {
  const local = partsAt(now);
  const previous = offsetPeriod(local.year, local.month, -1);
  const previousKey = periodKey(previous.year, previous.month);

  if (now < countWindow(previousKey, settings).closesAt) return previousKey;
  return periodKey(local.year, local.month);
}
