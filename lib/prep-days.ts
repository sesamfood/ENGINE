import { addDays, parseDateKey } from "./date";

// How many upcoming prep days an internal order can be placed for.
export const PREP_DAY_CHOICES = 3;

// A prep day is the day after an order window (0 = Sunday).
export function isPrepDay(date: string, orderWindows: readonly number[]) {
  return orderWindows.includes(parseDateKey(addDays(date, -1)).getUTCDay());
}

export function prepDaysAfter(
  after: string,
  orderWindows: readonly number[],
  count = PREP_DAY_CHOICES,
) {
  const days: string[] = [];
  for (let offset = 1; offset <= 7 * count && days.length < count; offset++) {
    const date = addDays(after, offset);
    if (isPrepDay(date, orderWindows)) days.push(date);
  }
  return days;
}

// Days from today until the first prep day after `after`, so the order lasts until the next planned delivery.
export function windowCoverageDays(
  today: string,
  after: string,
  orderWindows: readonly number[],
) {
  const [next] = prepDaysAfter(after, orderWindows, 1);
  if (!next) return null;
  const days =
    (parseDateKey(next).getTime() - parseDateKey(today).getTime()) / 86_400_000;
  return Math.min(Math.max(days, 1), 28);
}
