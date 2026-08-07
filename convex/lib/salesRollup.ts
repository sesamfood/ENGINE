import { dateKey, zonedStart } from "./dashboardMetrics";

export type SalesDelta = {
  revenue: number;
  orderCount: number;
  itemCount: number;
};

export type IncomingSaleLine = {
  externalId: string;
  orderNumber: number;
  locationId: string;
  dayStart: number;
  revenue: number;
  quantity: number;
};

export type ExistingLineState = {
  revenue: number;
  quantity: number;
  locationId: string;
  dayStart: number;
};

export function dayStartOf(occurredAt: number, timeZone: string): number {
  return zonedStart(dateKey(occurredAt, timeZone), timeZone);
}

export function dateOfDay(occurredAt: number, timeZone: string): string {
  return dateKey(occurredAt, timeZone);
}

export function orderKey(
  locationId: string,
  dayStart: number,
  orderNumber: number,
) {
  return `${locationId}:${dayStart}:${orderNumber}`;
}

export function dayBucketKey(locationId: string, dayStart: number) {
  return `${locationId}:${dayStart}`;
}

export function emptyDelta(): SalesDelta {
  return { revenue: 0, orderCount: 0, itemCount: 0 };
}

/**
 * Pure daily-delta arithmetic for sales ingest.
 * `knownOrderKeys` uses {@link orderKey}; `existingLines` is keyed by line externalId.
 * Re-ingesting an identical batch yields a net-zero Map (empty or zeroed buckets).
 */
export function computeDailySalesDeltas(
  lines: IncomingSaleLine[],
  knownOrderKeys: ReadonlySet<string>,
  existingLines: ReadonlyMap<string, ExistingLineState>,
): Map<string, SalesDelta> {
  const deltas = new Map<string, SalesDelta>();
  const seenOrders = new Set<string>();
  const working = new Map(existingLines);

  function add(
    locationId: string,
    dayStart: number,
    delta: Partial<SalesDelta>,
  ) {
    const key = dayBucketKey(locationId, dayStart);
    const current = deltas.get(key) ?? emptyDelta();
    deltas.set(key, {
      revenue: current.revenue + (delta.revenue ?? 0),
      orderCount: current.orderCount + (delta.orderCount ?? 0),
      itemCount: current.itemCount + (delta.itemCount ?? 0),
    });
  }

  for (const line of lines) {
    const key = orderKey(line.locationId, line.dayStart, line.orderNumber);
    if (!knownOrderKeys.has(key) && !seenOrders.has(key)) {
      add(line.locationId, line.dayStart, { orderCount: 1 });
    }
    seenOrders.add(key);

    const existing = working.get(line.externalId);
    if (existing) {
      add(existing.locationId, existing.dayStart, {
        revenue: -existing.revenue,
        itemCount: -existing.quantity,
      });
    }
    add(line.locationId, line.dayStart, {
      revenue: line.revenue,
      itemCount: line.quantity,
    });
    working.set(line.externalId, {
      revenue: line.revenue,
      quantity: line.quantity,
      locationId: line.locationId,
      dayStart: line.dayStart,
    });
  }

  return deltas;
}
