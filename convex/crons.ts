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

export default crons;
