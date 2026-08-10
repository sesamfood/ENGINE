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
  "0 3 * * *",
  internal.workfeedSync.dispatchEnabledIntegrations,
  { kind: "employees", cursor: null },
);

// Convex cron expressions are UTC (not org-local). 05:00 UTC is 06:00 CET /
// 07:00 CEST — after typical Copenhagen close-of-business for the prior local day.
crons.cron(
  "reconcile OnlinePOS sales",
  "0 5 * * *",
  internal.onlinePosSync.dispatchEnabledLocations,
  { kind: "reconcile", cursor: null },
);

crons.interval(
  "prune OnlinePOS sales",
  { hours: 24 },
  internal.onlinePosSync.pruneSales,
  { cursor: null },
);

crons.cron(
  "delete orphaned uploads",
  "0 2 * * 0",
  internal.storageCleanup.removeOrphans,
  { cursor: null },
);

export default crons;
