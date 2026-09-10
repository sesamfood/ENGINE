import { ConvexError } from "convex/values";
import { addDays, dateKey, parseDateKey, zonedStart, zonedTimestamp } from "../../lib/date";
import { number, object, requestOnlinePos, type OnlinePosSettings } from "./onlinePosApi";

const MAX_PAGES = 100;
const MAX_LINES = 500_000;

export type FinancialDay = {
  date: string;
  netRevenue: number;
  transactionCount: number;
};

function invalidExport(): never {
  throw new ConvexError("OnlinePOS returnerede ufuldstændige finansielle salgsdata");
}

function identifier(value: unknown) {
  const parsed = number(value);
  if (parsed === null || !Number.isSafeInteger(parsed) || parsed <= 0) invalidExport();
  return String(parsed);
}

function minorAmount(value: unknown) {
  const parsed = number(value);
  if (parsed === null) invalidExport();
  const amount = Math.round(parsed * 100);
  if (!Number.isSafeInteger(amount)) invalidExport();
  return amount;
}

function paidTimestamp(value: unknown, timeZone: string) {
  if (typeof value !== "string") invalidExport();
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  if (!match) invalidExport();
  const [, date, hour, minute, second] = match;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) invalidExport();
  try {
    parseDateKey(date);
    return zonedTimestamp(date, Number(hour) * 60 + Number(minute), timeZone) + Number(second) * 1_000;
  } catch {
    invalidExport();
  }
}

export function parseFinancialPage(payload: unknown, companyId: number, timeZone: string, expectedPage: number) {
  const page = object(payload);
  if (!page || !Array.isArray(page.data) || number(page.current_page) !== expectedPage) invalidExport();
  if (!("next_page_url" in page) || (page.next_page_url !== null && typeof page.next_page_url !== "string")) invalidExport();
  let nextPage: number | null = null;
  if (page.next_page_url !== null) {
    let nextUrl: URL;
    try {
      nextUrl = new URL(page.next_page_url);
    } catch {
      invalidExport();
    }
    if (
      nextUrl.hostname !== "api.onlinepos.dk" ||
      !["https:", "http:"].includes(nextUrl.protocol) ||
      nextUrl.username || nextUrl.password ||
      (nextUrl.port && nextUrl.port !== "443" && nextUrl.port !== "80") ||
      !/^\/api\/exportSales\/v20(?:\/\d+)?$/.test(nextUrl.pathname)
    ) invalidExport();
    nextPage = number(nextUrl.searchParams.get("page"));
    if (nextPage !== expectedPage + 1) invalidExport();
    if (page.data.length === 0) invalidExport();
  }
  const lines = page.data.map((value) => {
    const line = object(value);
    if (!line || number(line.firmaid) !== companyId) invalidExport();
    return {
      id: identifier(line.orderlineid),
      orderId: identifier(line.orderid),
      paidAt: paidTimestamp(line.timestamp_pay, timeZone),
      netRevenue: minorAmount(line.priceexclvat),
    };
  });
  return { lines, nextPage };
}

export async function requestFinancialDays(args: {
  settings: OnlinePosSettings;
  from: string;
  through: string;
  timeZone: string;
}): Promise<FinancialDay[]> {
  const fromAt = zonedStart(args.from, args.timeZone);
  const toAt = zonedStart(addDays(args.through, 1), args.timeZone);
  const path = `/exportSales/v20/${Math.floor(fromAt / 1_000)}`;
  const days = new Map<string, FinancialDay>();
  for (let date = args.from; date <= args.through; date = addDays(date, 1)) {
    days.set(date, { date, netRevenue: 0, transactionCount: 0 });
  }
  const linesSeen = new Set<string>();
  const orders = new Map<string, { date: string; netRevenue: number }>();
  let pageNumber = 1;
  for (;;) {
    if (pageNumber > MAX_PAGES || linesSeen.size > MAX_LINES) {
      throw new ConvexError("OnlinePOS-eksporten er for stor. Salgsrapporten er ikke opdateret");
    }
    const payload = await requestOnlinePos(`${path}?page=${pageNumber}`, args.settings, {
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    });
    const page = parseFinancialPage(payload, args.settings.companyId, args.timeZone, pageNumber);
    for (const line of page.lines) {
      if (linesSeen.has(line.id)) invalidExport();
      linesSeen.add(line.id);
      if (linesSeen.size > MAX_LINES) {
        throw new ConvexError("OnlinePOS-eksporten er for stor. Salgsrapporten er ikke opdateret");
      }
      const date = dateKey(line.paidAt, args.timeZone);
      const previous = orders.get(line.orderId);
      if (previous && previous.date !== date && (days.has(previous.date) || days.has(date))) {
        throw new ConvexError("En OnlinePOS-ordre har betalinger på flere datoer. Transaktionerne kræver afstemning");
      }
      const orderRevenue = (previous?.netRevenue ?? 0) + line.netRevenue;
      if (!Number.isSafeInteger(orderRevenue)) invalidExport();
      orders.set(line.orderId, { date, netRevenue: orderRevenue });
      if (line.paidAt < fromAt || line.paidAt >= toAt) continue;
      const day = days.get(date);
      if (!day) invalidExport();
      day.netRevenue += line.netRevenue;
      if (!Number.isSafeInteger(day.netRevenue)) invalidExport();
    }
    if (page.nextPage === null) break;
    pageNumber = page.nextPage;
  }
  // Refund-only and zero-net orders affect sales but do not add a transaction.
  for (const order of orders.values()) {
    const day = days.get(order.date);
    if (day && order.netRevenue > 0) day.transactionCount += 1;
  }
  return [...days.values()];
}
