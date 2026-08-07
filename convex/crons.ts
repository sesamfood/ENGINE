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
  "synchronize Workfeed shifts",
  "5,20,35,50 * * * *",
  internal.workfeedSync.dispatchEnabledIntegrations,
  { kind: "shifts", cursor: null },
);

crons.cron(
  "synchronize Workfeed employees",
  "0 */6 * * *",
  internal.workfeedSync.dispatchEnabledIntegrations,
  { kind: "employees", cursor: null },
);

// Incremental OnlinePOS sales; 2h watermark overlap re-reads ~200 late lines cheaply.
crons.interval(
  "synchronize OnlinePOS sales",
  { minutes: 15 },
  internal.onlinePosSync.dispatchEnabledLocations,
  { kind: "incremental", cursor: null },
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

// ponytail: Idempotent widen→narrow migration kickoff. Remove after the
// onlinePosTurnover literal is dropped from storedMetricIdValidator.
crons.interval(
  "migrate onlinePosTurnover widgets",
  { hours: 24 },
  internal.dashboard.migrateOnlinePosTurnoverWidgets,
  { table: "dashboards", cursor: null },
);

export default crons;
