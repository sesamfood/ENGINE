import { dateKey, zonedStart } from "./dashboardMetrics";

export type SalesDelta = {
  revenue: number;
  orderCount: number;
  itemCount: number;
};

export type IncomingSaleLine = {
  externalId: string;
  orderNumber: number;
  department: string;
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
  orderNumber: number;
  department: string;
};

export function dayStartOf(occurredAt: number, timeZone: string): number {
  return zonedStart(dateKey(occurredAt, timeZone), timeZone);
}

export function orderKey(
  locationId: string,
  dayStart: number,
  orderNumber: number,
  department: string,
) {
  return `${locationId}:${dayStart}:${orderNumber}:${department}`;
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
 * When a line's order key changes and the old order has no remaining stored or
 * batched lines, the old day bucket gets `orderCount: -1`.
 */
export function computeDailySalesDeltas(
  lines: IncomingSaleLine[],
  knownOrderKeys: ReadonlySet<string>,
  existingLines: ReadonlyMap<string, ExistingLineState>,
  ordersWithOtherLines: ReadonlySet<string> = new Set(),
): Map<string, SalesDelta> {
  const deltas = new Map<string, SalesDelta>();
  const countedOrders = new Set(knownOrderKeys);
  const working = new Map(existingLines);
  const linesPerOrder = new Map<string, number>();
  for (const key of ordersWithOtherLines) linesPerOrder.set(key, 1);
  for (const state of working.values()) {
    const key = orderKey(
      state.locationId,
      state.dayStart,
      state.orderNumber,
      state.department,
    );
    linesPerOrder.set(key, (linesPerOrder.get(key) ?? 0) + 1);
  }

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
    const key = orderKey(
      line.locationId,
      line.dayStart,
      line.orderNumber,
      line.department,
    );
    const existing = working.get(line.externalId);

    if (existing) {
      const oldKey = orderKey(
        existing.locationId,
        existing.dayStart,
        existing.orderNumber,
        existing.department,
      );
      const remaining = (linesPerOrder.get(oldKey) ?? 0) - 1;
      linesPerOrder.set(oldKey, remaining);
      add(existing.locationId, existing.dayStart, {
        revenue: -existing.revenue,
        itemCount: -existing.quantity,
      });
      if (oldKey !== key && remaining === 0 && countedOrders.has(oldKey)) {
        add(existing.locationId, existing.dayStart, { orderCount: -1 });
        countedOrders.delete(oldKey);
      }
    }

    if (!countedOrders.has(key)) {
      add(line.locationId, line.dayStart, { orderCount: 1 });
      countedOrders.add(key);
    }
    linesPerOrder.set(key, (linesPerOrder.get(key) ?? 0) + 1);

    add(line.locationId, line.dayStart, {
      revenue: line.revenue,
      itemCount: line.quantity,
    });
    working.set(line.externalId, {
      revenue: line.revenue,
      quantity: line.quantity,
      locationId: line.locationId,
      dayStart: line.dayStart,
      orderNumber: line.orderNumber,
      department: line.department,
    });
  }

  return deltas;
}
