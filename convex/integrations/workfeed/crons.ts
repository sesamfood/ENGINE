import type { cronJobs } from "convex/server";
import { internal } from "../../_generated/api";

export function registerWorkfeedCrons(crons: ReturnType<typeof cronJobs>) {
  crons.cron(
    "daily Workfeed synchronization",
    "17 3 * * *",
    internal.workfeedSync.dispatchEnabledIntegrations,
    { kind: "employees", cursor: null },
  );

  crons.interval(
    "refresh estimated Workfeed labour",
    { hours: 6 },
    internal.workfeedLabor.dispatchCurrent,
    { cursor: null },
  );
}
