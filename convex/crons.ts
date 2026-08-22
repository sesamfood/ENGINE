import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "delete expired archived products",
  { hours: 24 },
  internal.catalog.deleteExpiredProducts,
  {},
);

crons.cron(
  "daily Workfeed synchronization",
  "17 3 * * *",
  internal.workfeedSync.dispatchEnabledIntegrations,
  { kind: "employees", cursor: null },
);

crons.cron(
  "incremental OnlinePOS sales",
  "13 */4 * * *",
  internal.onlinePosSync.dispatchEnabledLocations,
  { kind: "incremental", cursor: null },
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

// Audit history follows the existing 400-day sales retention window.
crons.interval("prune audit log", { hours: 24 }, internal.audit.prune, {});

crons.cron(
  "delete orphaned uploads",
  "11 2 * * 0",
  internal.storageCleanup.removeOrphans,
  { cursor: null },
);

export default crons;
