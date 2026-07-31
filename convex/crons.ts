import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "delete expired archived products",
  { hours: 24 },
  internal.catalog.deleteExpiredProducts,
  {},
);

crons.interval(
  "synchronize Workfeed shifts",
  { minutes: 15 },
  internal.workfeedSync.dispatchEnabledIntegrations,
  { kind: "shifts", cursor: null },
);

crons.interval(
  "synchronize Workfeed employees",
  { hours: 6 },
  internal.workfeedSync.dispatchEnabledIntegrations,
  { kind: "employees", cursor: null },
);

export default crons;
