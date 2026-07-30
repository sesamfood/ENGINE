export const COUNT_TIME_ZONE = "Europe/Copenhagen";
export const MAX_SPECIAL_OPENING_DATES = 50;

export type DailyOpeningHours = {
  closed: boolean;
  openMinuteOfDay: number;
  closeMinuteOfDay: number;
};

export type WeeklyOpeningHours = DailyOpeningHours & {
  weekday: number;
};

export type SpecialOpeningHours = DailyOpeningHours & {
  date: string;
};

export const DEFAULT_WEEKLY_OPENING_HOURS: WeeklyOpeningHours[] = Array.from(
  { length: 7 },
  (_, weekday) => ({
    weekday,
    closed: false,
    openMinuteOfDay: 8 * 60,
    closeMinuteOfDay: 22 * 60,
  }),
);

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

function zonedTimestamp(date: Date, minuteOfDay: number) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const target = Date.UTC(year, month, day, hour, minute);
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

function formatPeriod(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function offsetPeriod(year: number, month: number, offset: number) {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
  };
}

function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function openingHoursOn(
  date: Date,
  weekly: WeeklyOpeningHours[],
  specials: Map<string, SpecialOpeningHours>,
) {
  const special = specials.get(dateKey(date));
  if (special) return special;
  const weekday = (date.getUTCDay() + 6) % 7;
  return (
    weekly.find((hours) => hours.weekday === weekday) ??
    DEFAULT_WEEKLY_OPENING_HOURS[weekday]
  );
}

function findOpenDay(
  start: Date,
  direction: -1 | 1,
  weekly: WeeklyOpeningHours[],
  specials: Map<string, SpecialOpeningHours>,
) {
  for (
    let offset = 0;
    offset <= MAX_SPECIAL_OPENING_DATES * 7 + 7;
    offset++
  ) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + offset * direction);
    const hours = openingHoursOn(date, weekly, specials);
    if (!hours.closed) return { date, hours };
  }
  throw new Error("Locationen har ingen åbne dage");
}

export function countWindow(
  key: string,
  weekly: WeeklyOpeningHours[] = DEFAULT_WEEKLY_OPENING_HOURS,
  specialOpeningHours: SpecialOpeningHours[] = [],
) {
  const { year, month } = parsePeriod(key);
  const specials = new Map(
    specialOpeningHours.map((hours) => [hours.date, hours]),
  );
  const lastOpenDay = findOpenDay(
    new Date(Date.UTC(year, month, 0)),
    -1,
    weekly,
    specials,
  );
  const next = offsetPeriod(year, month, 1);
  const firstOpenDay = findOpenDay(
    new Date(Date.UTC(next.year, next.month - 1, 1)),
    1,
    weekly,
    specials,
  );
  const overnight =
    lastOpenDay.hours.closeMinuteOfDay <=
    lastOpenDay.hours.openMinuteOfDay;
  if (overnight) {
    lastOpenDay.date.setUTCDate(lastOpenDay.date.getUTCDate() + 1);
  }

  return {
    periodKey: key,
    opensAt: zonedTimestamp(
      lastOpenDay.date,
      lastOpenDay.hours.closeMinuteOfDay,
    ),
    closesAt: zonedTimestamp(
      firstOpenDay.date,
      firstOpenDay.hours.openMinuteOfDay,
    ),
  };
}

export function activePeriod(
  now: number,
  weekly: WeeklyOpeningHours[] = DEFAULT_WEEKLY_OPENING_HOURS,
  specialOpeningHours: SpecialOpeningHours[] = [],
) {
  const local = partsAt(now);
  const previous = offsetPeriod(local.year, local.month, -1);
  const previousKey = formatPeriod(previous.year, previous.month);

  if (now < countWindow(previousKey, weekly, specialOpeningHours).closesAt) {
    return previousKey;
  }
  return formatPeriod(local.year, local.month);
}
