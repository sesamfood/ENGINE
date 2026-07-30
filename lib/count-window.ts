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

export type CountSchedule =
  | { type: "monthly"; day: number }
  | { type: "interval"; intervalDays: number; anchorDate: string };

export const DEFAULT_WEEKLY_OPENING_HOURS: WeeklyOpeningHours[] = Array.from(
  { length: 7 },
  (_, weekday) => ({
    weekday,
    closed: false,
    openMinuteOfDay: 8 * 60,
    closeMinuteOfDay: 22 * 60,
  }),
);

export const DEFAULT_COUNT_SCHEDULE: CountSchedule = {
  type: "monthly",
  day: 0,
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

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

function parsePeriodKey(periodKey: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodKey);
  if (!match) throw new Error("Perioden er ugyldig");
  return { year: Number(match[1]), month: Number(match[2]) };
}

function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function parseDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Datoen er ugyldig");
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (dateKey(date) !== value) throw new Error("Datoen er ugyldig");
  return date;
}

function localDate(now: number) {
  const parts = partsAt(now);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function monthlyDate(year: number, month: number, day: number) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  return day === 0
    ? lastDay
    : new Date(
        Date.UTC(
          lastDay.getUTCFullYear(),
          lastDay.getUTCMonth(),
          Math.min(day, lastDay.getUTCDate()),
        ),
      );
}

function scheduledDateAtOrBefore(date: Date, schedule: CountSchedule) {
  if (schedule.type === "interval") {
    const anchor = parseDateKey(schedule.anchorDate);
    const interval = schedule.intervalDays * DAY_IN_MS;
    const steps = Math.floor((date.getTime() - anchor.getTime()) / interval);
    return new Date(anchor.getTime() + steps * interval);
  }

  let scheduled = monthlyDate(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    schedule.day,
  );
  if (scheduled > date) {
    scheduled = monthlyDate(
      date.getUTCFullYear(),
      date.getUTCMonth() - 1,
      schedule.day,
    );
  }
  return scheduled;
}

function offsetScheduledDate(
  date: Date,
  schedule: CountSchedule,
  offset: -1 | 1,
) {
  if (schedule.type === "interval") {
    return new Date(
      date.getTime() + offset * schedule.intervalDays * DAY_IN_MS,
    );
  }
  return monthlyDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + offset,
    schedule.day,
  );
}

function periodKeyFor(date: Date, schedule: CountSchedule) {
  return schedule.type === "monthly"
    ? dateKey(date).slice(0, 7)
    : dateKey(date);
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

function countWindowForDate(
  scheduledDate: Date,
  periodKey: string,
  weekly: WeeklyOpeningHours[] = DEFAULT_WEEKLY_OPENING_HOURS,
  specialOpeningHours: SpecialOpeningHours[] = [],
) {
  const specials = new Map(
    specialOpeningHours.map((hours) => [hours.date, hours]),
  );
  const lastOpenDay = findOpenDay(
    scheduledDate,
    -1,
    weekly,
    specials,
  );
  const dayAfter = new Date(scheduledDate);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
  const firstOpenDay = findOpenDay(
    dayAfter,
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
    periodKey,
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

export function countWindow(
  key: string,
  weekly: WeeklyOpeningHours[] = DEFAULT_WEEKLY_OPENING_HOURS,
  specialOpeningHours: SpecialOpeningHours[] = [],
) {
  return countWindowForPeriod(
    key,
    DEFAULT_COUNT_SCHEDULE,
    weekly,
    specialOpeningHours,
  );
}

export function countWindowForPeriod(
  key: string,
  schedule: CountSchedule,
  weekly: WeeklyOpeningHours[] = DEFAULT_WEEKLY_OPENING_HOURS,
  specialOpeningHours: SpecialOpeningHours[] = [],
) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return countWindowForDate(
      parseDateKey(key),
      key,
      weekly,
      specialOpeningHours,
    );
  }
  const { year, month } = parsePeriodKey(key);
  return countWindowForDate(
    monthlyDate(
      year,
      month - 1,
      schedule.type === "monthly" ? schedule.day : 0,
    ),
    key,
    weekly,
    specialOpeningHours,
  );
}

export function scheduledCountWindows(
  now: number,
  weekly: WeeklyOpeningHours[] = DEFAULT_WEEKLY_OPENING_HOURS,
  specialOpeningHours: SpecialOpeningHours[] = [],
  schedule: CountSchedule = DEFAULT_COUNT_SCHEDULE,
) {
  let dueDate = scheduledDateAtOrBefore(localDate(now), schedule);
  let due = countWindowForDate(
    dueDate,
    periodKeyFor(dueDate, schedule),
    weekly,
    specialOpeningHours,
  );

  if (due.opensAt > now) {
    dueDate = offsetScheduledDate(dueDate, schedule, -1);
    due = countWindowForDate(
      dueDate,
      periodKeyFor(dueDate, schedule),
      weekly,
      specialOpeningHours,
    );
  }

  const nextDate = offsetScheduledDate(dueDate, schedule, 1);
  const next = countWindowForDate(
    nextDate,
    periodKeyFor(nextDate, schedule),
    weekly,
    specialOpeningHours,
  );

  return {
    due,
    active: now < due.closesAt ? due : next,
  };
}

export function activePeriod(
  now: number,
  weekly: WeeklyOpeningHours[] = DEFAULT_WEEKLY_OPENING_HOURS,
  specialOpeningHours: SpecialOpeningHours[] = [],
) {
  return scheduledCountWindows(
    now,
    weekly,
    specialOpeningHours,
  ).active.periodKey;
}
