import { addDays, dateKey } from "./date";

export type PayPeriod = {
  frequency: "weekly" | "biweekly" | "monthly";
  startsAt: number;
  monthDay: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function monthStart(year: number, month: number, day: number) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)))
    .toISOString()
    .slice(0, 10);
}

// offset 0 is the pay period containing today, -1 the one before.
export function payPeriodRange(
  period: PayPeriod,
  today: string,
  timeZone: string,
  offset: number,
) {
  const anchor = dateKey(period.startsAt, timeZone);
  if (period.frequency !== "monthly") {
    const length = period.frequency === "weekly" ? 7 : 14;
    const elapsed = Math.round((Date.parse(today) - Date.parse(anchor)) / DAY_MS);
    const from = addDays(anchor, (Math.floor(elapsed / length) + offset) * length);
    return { from, to: addDays(from, length - 1) };
  }
  const day = payPeriodMonthDay(period, timeZone);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  const current = monthStart(year, month, day) <= today ? month : month - 1;
  return {
    from: monthStart(year, current + offset, day),
    to: addDays(monthStart(year, current + offset + 1, day), -1),
  };
}

export function payPeriodMonthDay(period: PayPeriod, timeZone: string) {
  return period.monthDay ?? Number(dateKey(period.startsAt, timeZone).slice(8, 10));
}
