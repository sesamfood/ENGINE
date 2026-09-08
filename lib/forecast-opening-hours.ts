import type { SpecialOpeningHours, WeeklyOpeningHours } from "./count-window";
import { shiftOrderDate } from "./forecast-dates";

export type ForecastOpeningDay = { date: string; openMinutes: number };

export function forecastOpeningDays({
  weekly,
  specials,
  from,
  through,
  closedFrom,
}: {
  weekly: readonly WeeklyOpeningHours[];
  specials: readonly SpecialOpeningHours[];
  from: string;
  through: string;
  closedFrom?: string;
}): ForecastOpeningDay[] {
  const byDate = new Map(specials.map((hours) => [hours.date, hours]));
  function hoursOn(date: string) {
    const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
    return (
      byDate.get(date) ?? weekly.find((hours) => hours.weekday === weekday)
    );
  }
  const days = [];
  for (let date = from; date <= through; date = shiftOrderDate(date, 1)) {
    const current = hoursOn(date);
    const previous = hoursOn(shiftOrderDate(date, -1));
    const todayMinutes =
      !current || current.closed
        ? 0
        : (current.closeMinuteOfDay > current.openMinuteOfDay
            ? current.closeMinuteOfDay
            : 1440) - current.openMinuteOfDay;
    const carry =
      previous &&
      !previous.closed &&
      previous.closeMinuteOfDay <= previous.openMinuteOfDay
        ? previous.closeMinuteOfDay
        : 0;
    const overlap =
      current && !current.closed
        ? Math.max(
            0,
            Math.min(carry, current.openMinuteOfDay + todayMinutes) -
              current.openMinuteOfDay,
          )
        : 0;
    // A dated closure overrides an overnight opening from the previous day.
    const closed =
      (closedFrom !== undefined && date >= closedFrom) ||
      byDate.get(date)?.closed;
    days.push({
      date,
      openMinutes: closed ? 0 : Math.min(1440, todayMinutes + carry - overlap),
    });
  }
  return days;
}
