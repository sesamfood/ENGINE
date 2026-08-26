import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { DashboardSummarySource } from "../../lib/dashboard/summary-sources";

const DEFAULT_TIME_ZONE = "Europe/Copenhagen";
export const DASHBOARD_SUMMARY_VERSION = 2;
const NUMERIC_TOLERANCE = 1e-9;
const validTimeZones = new Map<string, string>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

export type SummarySource = DashboardSummarySource;

export type SummaryDocumentBySource = {
  waste: Doc<"wasteRegistrations">;
  badDeliveries: Doc<"badDeliveries">;
  staffFood: Doc<"staffFoodRegistrations">;
  transfers: Doc<"transfers">;
  scheduledShifts: Doc<"scheduledShifts">;
};

export type DashboardSummaryContribution = {
  organizationId: string;
  source: SummarySource;
  timeZone: string;
  locationId: Id<"locations">;
  counterpartLocationId: Id<"locations"> | null;
  dayStart: number;
  count: number;
  value: number;
};

function validTimeZone(timeZone: string | undefined) {
  if (!timeZone) return DEFAULT_TIME_ZONE;
  const cached = validTimeZones.get(timeZone);
  if (cached) return cached;
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    validTimeZones.set(timeZone, timeZone);
    return timeZone;
  } catch {
    validTimeZones.set(timeZone, DEFAULT_TIME_ZONE);
    return DEFAULT_TIME_ZONE;
  }
}

function dateFormatter(timeZone: string) {
  const normalizedTimeZone = validTimeZone(timeZone);
  const cached = dateFormatters.get(normalizedTimeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizedTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  dateFormatters.set(normalizedTimeZone, formatter);
  return formatter;
}

function dateTimeFormatter(timeZone: string) {
  const normalizedTimeZone = validTimeZone(timeZone);
  const cached = dateTimeFormatters.get(normalizedTimeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizedTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  dateTimeFormatters.set(normalizedTimeZone, formatter);
  return formatter;
}

export async function dashboardSummaryTimeZone(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
) {
  const settings = await ctx.db
    .query("organizationScheduleSettings")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .unique();
  return validTimeZone(settings?.timeZone);
}

function dateKey(timestamp: number, timeZone: string) {
  const parts = dateFormatter(timeZone).formatToParts(timestamp);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function zonedStart(value: string, timeZone: string) {
  const [year, month, day] = value.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  let guess = target;
  const formatter = dateTimeFormatter(timeZone);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(guess).map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess += target - represented;
  }
  return guess;
}

function contribution(
  row: {
    organizationId: string;
  },
  source: SummarySource,
  timeZone: string,
  timestamp: number,
  locationId: Id<"locations">,
  count: number,
  value: number,
  counterpartLocationId: Id<"locations"> | null = null,
): DashboardSummaryContribution {
  const normalizedTimeZone = validTimeZone(timeZone);
  return {
    organizationId: row.organizationId,
    source,
    timeZone: normalizedTimeZone,
    locationId,
    counterpartLocationId,
    dayStart: zonedStart(
      dateKey(timestamp, normalizedTimeZone),
      normalizedTimeZone,
    ),
    count,
    value,
  };
}

export function wasteSummaryContribution(
  row: Doc<"wasteRegistrations">,
  timeZone: string,
) {
  return row.status === "active"
    ? [
        contribution(
          row,
          "waste",
          timeZone,
          row.registeredAt,
          row.locationId,
          1,
          row.defaultQuantity,
        ),
      ]
    : [];
}

export function badDeliverySummaryContribution(
  row: Doc<"badDeliveries">,
  timeZone: string,
) {
  return row.status === "active"
    ? [
        contribution(
          row,
          "badDeliveries",
          timeZone,
          row.registeredAt,
          row.locationId,
          1,
          0,
        ),
      ]
    : [];
}

export function staffFoodSummaryContribution(
  row: Doc<"staffFoodRegistrations">,
  timeZone: string,
) {
  return row.status === "active"
    ? [
        contribution(
          row,
          "staffFood",
          timeZone,
          row.registeredAt,
          row.locationId,
          1,
          0,
        ),
      ]
    : [];
}

export function transferSummaryContribution(
  row: Doc<"transfers">,
  items: readonly Pick<Doc<"transferItems">, "quantity" | "factorToDefault">[],
  timeZone: string,
) {
  return [
    contribution(
      row,
      "transfers",
      timeZone,
      row.transferredAt,
      row.fromLocationId,
      1,
      items.reduce(
        (sum, item) => sum + item.quantity * (item.factorToDefault ?? 1),
        0,
      ),
      row.toLocationId,
    ),
  ];
}

export function scheduledShiftSummaryContribution(
  row: Pick<
    Doc<"scheduledShifts">,
    "organizationId" | "locationId" | "startsAt" | "endsAt"
  >,
  timeZone: string,
) {
  return [
    contribution(
      row,
      "scheduledShifts",
      timeZone,
      row.startsAt,
      row.locationId,
      0,
      Math.max(0, row.endsAt - row.startsAt) / 3_600_000,
    ),
  ];
}

export function summaryContributionsFor(
  source: "waste",
  row: Doc<"wasteRegistrations">,
  timeZone: string,
  items?: readonly Pick<Doc<"transferItems">, "quantity" | "factorToDefault">[],
): DashboardSummaryContribution[];
export function summaryContributionsFor(
  source: "badDeliveries",
  row: Doc<"badDeliveries">,
  timeZone: string,
  items?: readonly Pick<Doc<"transferItems">, "quantity" | "factorToDefault">[],
): DashboardSummaryContribution[];
export function summaryContributionsFor(
  source: "staffFood",
  row: Doc<"staffFoodRegistrations">,
  timeZone: string,
  items?: readonly Pick<Doc<"transferItems">, "quantity" | "factorToDefault">[],
): DashboardSummaryContribution[];
export function summaryContributionsFor(
  source: "transfers",
  row: Doc<"transfers">,
  timeZone: string,
  items?: readonly Pick<Doc<"transferItems">, "quantity" | "factorToDefault">[],
): DashboardSummaryContribution[];
export function summaryContributionsFor(
  source: "scheduledShifts",
  row: Doc<"scheduledShifts">,
  timeZone: string,
  items?: readonly Pick<Doc<"transferItems">, "quantity" | "factorToDefault">[],
): DashboardSummaryContribution[];
export function summaryContributionsFor(
  source: SummarySource,
  row:
    | Doc<"wasteRegistrations">
    | Doc<"badDeliveries">
    | Doc<"staffFoodRegistrations">
    | Doc<"transfers">
    | Doc<"scheduledShifts">,
  timeZone: string,
  items?: readonly Pick<Doc<"transferItems">, "quantity" | "factorToDefault">[],
): DashboardSummaryContribution[];
export function summaryContributionsFor(
  source: SummarySource,
  row:
    | Doc<"wasteRegistrations">
    | Doc<"badDeliveries">
    | Doc<"staffFoodRegistrations">
    | Doc<"transfers">
    | Doc<"scheduledShifts">,
  timeZone: string,
  items?: readonly Pick<Doc<"transferItems">, "quantity" | "factorToDefault">[],
) {
  switch (source) {
    case "waste":
      return "activeIn30Days" in row
        ? wasteSummaryContribution(row, timeZone)
        : [];
    case "badDeliveries":
      return "initialNoticeStatus" in row
        ? badDeliverySummaryContribution(row, timeZone)
        : [];
    case "staffFood":
      return "checkoutId" in row
        ? staffFoodSummaryContribution(row, timeZone)
        : [];
    case "transfers":
      return "transferredAt" in row
        ? transferSummaryContribution(row, items ?? [], timeZone)
        : [];
    case "scheduledShifts":
      return "startsAt" in row
        ? scheduledShiftSummaryContribution(row, timeZone)
        : [];
  }
}

function contributionKey(row: DashboardSummaryContribution) {
  return [
    row.organizationId,
    row.source,
    row.timeZone,
    row.locationId,
    row.counterpartLocationId ?? "",
    row.dayStart,
  ].join("|");
}

export async function reconcileDashboardSummaryContributions(
  ctx: MutationCtx,
  previous: readonly DashboardSummaryContribution[],
  next: readonly DashboardSummaryContribution[],
  options?: { immediate?: boolean },
) {
  const deltas = new Map<string, DashboardSummaryContribution>();
  for (const row of previous) {
    const key = contributionKey(row);
    const delta = deltas.get(key) ?? { ...row, count: 0, value: 0 };
    delta.count -= row.count;
    delta.value -= row.value;
    deltas.set(key, delta);
  }
  for (const row of next) {
    const key = contributionKey(row);
    const delta = deltas.get(key) ?? { ...row, count: 0, value: 0 };
    delta.count += row.count;
    delta.value += row.value;
    deltas.set(key, delta);
  }
  const effectiveDeltas = [...deltas.values()].filter(
    (delta) =>
      Math.abs(delta.count) > NUMERIC_TOLERANCE ||
      Math.abs(delta.value) > NUMERIC_TOLERANCE,
  );
  if (!options?.immediate) {
    if (effectiveDeltas.length) {
      await ctx.db.insert("dashboardSummaryDeltas", {
        deltas: effectiveDeltas,
      });
    }
    return;
  }
  await applyDashboardSummaryDeltas(ctx, effectiveDeltas);
}

export async function applyDashboardSummaryDeltas(
  ctx: MutationCtx,
  deltas: readonly DashboardSummaryContribution[],
) {
  const combined = new Map<string, DashboardSummaryContribution>();
  for (const row of deltas) {
    const key = contributionKey(row);
    const delta = combined.get(key) ?? { ...row, count: 0, value: 0 };
    delta.count += row.count;
    delta.value += row.value;
    combined.set(key, delta);
  }
  const updatedAt = Date.now();
  for (const delta of combined.values()) {
    if (
      Math.abs(delta.count) <= NUMERIC_TOLERANCE &&
      Math.abs(delta.value) <= NUMERIC_TOLERANCE
    ) {
      continue;
    }
    const existing = await ctx.db
      .query("dashboardDailySummaries")
      .withIndex(
        "by_org_source_timeZone_locationId_counterpartLocationId_dayStart",
        (q) =>
          q
            .eq("organizationId", delta.organizationId)
            .eq("source", delta.source)
            .eq("timeZone", delta.timeZone)
            .eq("locationId", delta.locationId)
            .eq("counterpartLocationId", delta.counterpartLocationId)
            .eq("dayStart", delta.dayStart),
      )
      .unique();
    const count = (existing?.count ?? 0) + delta.count;
    const value = (existing?.value ?? 0) + delta.value;
    if (
      Math.abs(count) <= NUMERIC_TOLERANCE &&
      Math.abs(value) <= NUMERIC_TOLERANCE
    ) {
      if (existing) await ctx.db.delete(existing._id);
      continue;
    }
    const patch = {
      count,
      value,
      updatedAt,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("dashboardDailySummaries", {
        organizationId: delta.organizationId,
        source: delta.source,
        timeZone: delta.timeZone,
        locationId: delta.locationId,
        counterpartLocationId: delta.counterpartLocationId,
        dayStart: delta.dayStart,
        ...patch,
      });
    }
  }
}

export async function reconcileDashboardSummary<S extends SummarySource>(
  ctx: MutationCtx,
  source: S,
  previous: SummaryDocumentBySource[S] | null,
  next: SummaryDocumentBySource[S] | null,
  currentTimeZone: string,
  previousItems?: readonly Pick<
    Doc<"transferItems">,
    "quantity" | "factorToDefault"
  >[],
  nextItems?: readonly Pick<
    Doc<"transferItems">,
    "quantity" | "factorToDefault"
  >[],
  options?: { immediate?: boolean },
) {
  const previousTimeZone = previous?.dashboardSummaryTimeZone;
  const previousContribution =
    previous && previousTimeZone
      ? summaryContributionsFor(
          source,
          previous,
          previousTimeZone,
          previousItems,
        )
      : [];
  const nextContribution = next
    ? summaryContributionsFor(source, next, currentTimeZone, nextItems)
    : [];
  await reconcileDashboardSummaryContributions(
    ctx,
    previousContribution,
    nextContribution,
    options,
  );
}

export { DEFAULT_TIME_ZONE };
