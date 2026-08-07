import assert from "node:assert/strict";
import { parseSaleLines } from "../convex/lib/onlinePosApi";
import {
  computeDailySalesDeltas,
  dayBucketKey,
  dayStartOf,
  emptyDelta,
  orderKey,
  type ExistingLineState,
  type IncomingSaleLine,
  type SalesDelta,
} from "../convex/lib/salesRollup";

const TZ = "Europe/Copenhagen";
const LOCATION = "loc-1";

function rawLine(
  id: number,
  chk: number,
  date: string,
  time: string,
  amount: number,
  price: string,
) {
  return {
    line: {
      id,
      chk,
      date,
      time,
      product_id: 42,
      product: "Cola",
      amount,
      price,
      payment_type: "card",
      department: "bar",
    },
  };
}

function parseOne(id: number, date: string, time: string, amount: number, price: string) {
  return parseSaleLines([rawLine(id, id, date, time, amount, price)], TZ)[0];
}

function assertMoney(line: { unitPrice: number; quantity: number; revenue: number }) {
  assert.ok(Number.isInteger(line.unitPrice));
  assert.ok(Number.isInteger(line.revenue));
  assert.equal(line.revenue, Math.round(line.quantity * line.unitPrice));
}

function localDay(ts: number) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ts);
}

{
  // Local morning whose UTC instant falls on the previous calendar day.
  const crossing = parseOne(1, "15.01.2025", "00:30:00", 2, "12,50");
  assertMoney(crossing);
  assert.equal(localDay(crossing.occurredAt), "2025-01-15");
  assert.equal(new Date(crossing.occurredAt).toISOString().slice(0, 10), "2025-01-14");

  // Late evening local — same day bucket; would mismatch under naive UTC day keys.
  const evening = parseOne(3, "15.01.2025", "23:45:00", 1, "45,00");
  assertMoney(evening);
  assert.equal(localDay(evening.occurredAt), "2025-01-15");
  assert.equal(dayStartOf(crossing.occurredAt, TZ), dayStartOf(evening.occurredAt, TZ));
  assert.equal(evening.unitPrice, 4500);
  assert.equal(evening.revenue, 4500);

  // DST spring-forward 2025-03-30 (02:xx skipped) and autumn-back 2025-10-26 (02:xx twice).
  const spring = parseOne(4, "30.03.2025", "03:30:00", 1, "8,00");
  assertMoney(spring);
  assert.equal(localDay(spring.occurredAt), "2025-03-30");
  assert.equal(
    dayStartOf(spring.occurredAt, TZ),
    dayStartOf(parseOne(40, "30.03.2025", "12:00:00", 1, "8,00").occurredAt, TZ),
  );
  const autumn = parseOne(5, "26.10.2025", "02:30:00", 3, "1,33");
  assertMoney(autumn);
  assert.equal(localDay(autumn.occurredAt), "2025-10-26");
  assert.equal(autumn.unitPrice, 133);
  assert.equal(autumn.revenue, Math.round(3 * 133));
}

function applyDeltas(daily: Map<string, SalesDelta>, deltas: Map<string, SalesDelta>) {
  for (const [key, delta] of deltas) {
    const current = daily.get(key) ?? emptyDelta();
    daily.set(key, {
      revenue: current.revenue + delta.revenue,
      orderCount: current.orderCount + delta.orderCount,
      itemCount: current.itemCount + delta.itemCount,
    });
  }
}

function ingest(
  lines: IncomingSaleLine[],
  knownOrderKeys: Set<string>,
  existingLines: Map<string, ExistingLineState>,
  daily: Map<string, SalesDelta>,
) {
  const deltas = computeDailySalesDeltas(lines, knownOrderKeys, existingLines);
  applyDeltas(daily, deltas);
  for (const line of lines) {
    knownOrderKeys.add(orderKey(line.locationId, line.dayStart, line.orderNumber));
    existingLines.set(line.externalId, {
      revenue: line.revenue,
      quantity: line.quantity,
      locationId: line.locationId,
      dayStart: line.dayStart,
    });
  }
  return deltas;
}

function recomputeDay(lines: IncomingSaleLine[]): SalesDelta {
  let revenue = 0;
  let itemCount = 0;
  const orders = new Set<string>();
  for (const line of lines) {
    revenue += line.revenue;
    itemCount += line.quantity;
    orders.add(orderKey(line.locationId, line.dayStart, line.orderNumber));
  }
  return { revenue, orderCount: orders.size, itemCount };
}

{
  const dayStart = dayStartOf(parseOne(100, "20.02.2025", "12:00:00", 1, "10,00").occurredAt, TZ);
  const bucket = dayBucketKey(LOCATION, dayStart);
  const batch: IncomingSaleLine[] = [
    { externalId: "L1", orderNumber: 501, locationId: LOCATION, dayStart, revenue: 2500, quantity: 2 },
    { externalId: "L2", orderNumber: 501, locationId: LOCATION, dayStart, revenue: 1000, quantity: 1 },
    { externalId: "L3", orderNumber: 502, locationId: LOCATION, dayStart, revenue: 5000, quantity: 4 },
  ];
  const knownOrderKeys = new Set<string>();
  const existingLines = new Map<string, ExistingLineState>();
  const daily = new Map<string, SalesDelta>();

  const first = ingest(batch, knownOrderKeys, existingLines, daily);
  assert.equal(first.get(bucket)?.orderCount, 2, "orderCount counts each receipt once");
  assert.deepEqual(daily.get(bucket), { revenue: 8500, orderCount: 2, itemCount: 7 });

  const second = ingest(batch, knownOrderKeys, existingLines, daily);
  for (const [, delta] of second) assert.deepEqual(delta, emptyDelta(), "re-ingest must be net-zero");
  assert.deepEqual(daily.get(bucket), { revenue: 8500, orderCount: 2, itemCount: 7 });

  // Day replace: void receipt 502, reset rollup, clear day state, re-ingest remainder.
  const remaining = batch.filter((line) => line.orderNumber !== 502);
  daily.set(bucket, emptyDelta());
  knownOrderKeys.clear();
  existingLines.clear();
  ingest(remaining, knownOrderKeys, existingLines, daily);
  const expected = recomputeDay(remaining);
  assert.deepEqual(daily.get(bucket), expected);
  assert.deepEqual(expected, { revenue: 3500, orderCount: 1, itemCount: 3 });
}

console.log("check-sales-rollup: ok");
