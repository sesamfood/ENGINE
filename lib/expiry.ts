import {
  addDays,
  dateKey,
  dateTimeFormatter,
  DEFAULT_TIME_ZONE,
  zonedTimestamp,
} from "./date";

export type Expiry = { value: number; unit: "hours" | "days" | "months" };

export const expiryUnits = [
  { value: "hours", label: "Timer" },
  { value: "days", label: "Dage" },
  { value: "months", label: "Måneder" },
] as const;

export function expiryError(expiry: Expiry) {
  const maximum = { hours: 87_600, days: 3_650, months: 120 }[expiry.unit];
  return !maximum ||
    !Number.isInteger(expiry.value) ||
    expiry.value < 1 ||
    expiry.value > maximum
    ? `Angiv et helt antal mellem 1 og ${maximum ?? 120}`
    : null;
}

export function formatExpiry(expiry: Expiry) {
  const labels = {
    hours: ["time", "timer"],
    days: ["dag", "dage"],
    months: ["måned", "måneder"],
  };
  return `${expiry.value} ${labels[expiry.unit][expiry.value === 1 ? 0 : 1]}`;
}

export function expiryTimestamp(
  producedAt: number,
  expiry: Expiry,
  timeZone = DEFAULT_TIME_ZONE,
) {
  if (!Number.isFinite(producedAt))
    throw new Error("Angiv en gyldig produktionsdato og et klokkeslæt");
  const error = expiryError(expiry);
  if (error) throw new Error(error);
  if (expiry.unit === "hours") return producedAt + expiry.value * 3_600_000;

  const producedDate = dateKey(producedAt, timeZone);
  const parts = Object.fromEntries(
    dateTimeFormatter("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(producedAt)
      .map((part) => [part.type, part.value]),
  );
  let expiresDate: string;
  if (expiry.unit === "days") {
    expiresDate = addDays(producedDate, expiry.value);
  } else {
    const [year, month, day] = producedDate.split("-").map(Number);
    const endOfMonth = new Date(Date.UTC(year, month + expiry.value, 0));
    endOfMonth.setUTCDate(Math.min(day, endOfMonth.getUTCDate()));
    expiresDate = endOfMonth.toISOString().slice(0, 10);
  }
  return zonedTimestamp(
    expiresDate,
    Number(parts.hour) * 60 + Number(parts.minute),
    timeZone,
  );
}
