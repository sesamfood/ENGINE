import type { cronJobs } from "convex/server";
import { internal } from "../../_generated/api";

export function registerOnlinePosCrons(crons: ReturnType<typeof cronJobs>) {
  crons.cron(
    "incremental OnlinePOS sales",
    "13 */4 * * *",
    internal.onlinePosSync.dispatchEnabledLocations,
    { kind: "incremental", cursor: null },
  );

  crons.interval(
    "OnlinePOS sales for live stock",
    { minutes: 10 },
    internal.onlinePosSync.dispatchEnabledLocations,
    { kind: "incremental", cursor: null, stockOnly: true },
  );

  // Convex cron expressions are UTC (not org-local). 05:23 UTC is 06:23 CET /
  // 07:23 CEST — after typical Copenhagen close-of-business for the prior local day.
  crons.cron(
    "reconcile OnlinePOS sales",
    "23 5 * * *",
    internal.onlinePosSync.dispatchEnabledLocations,
    { kind: "reconcile", cursor: null },
  );

  crons.interval(
    "prune OnlinePOS sales",
    { hours: 24 },
    internal.onlinePosSync.pruneSales,
    { cursor: null },
  );

  crons.interval(
    "prune sales stock applications",
    { hours: 24 },
    internal.onlinePosStock.prune,
    {},
  );

  crons.interval(
    "refresh OnlinePOS financial sales",
    { hours: 6 },
    internal.onlinePosFinancial.refreshRecentMonths,
    { cursor: null },
  );
}
