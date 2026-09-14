import type { cronJobs } from "convex/server";
import { internal } from "../../_generated/api";

export function registerWoltCrons(crons: ReturnType<typeof cronJobs>) {
  crons.interval(
    "recover pending Wolt jobs",
    { minutes: 5 },
    internal.woltSync.dispatchPendingJobs,
    {},
  );

  crons.interval(
    "maintain Wolt refresh tokens",
    { minutes: 10 },
    internal.woltSync.dispatchTokenMaintenance,
    {},
  );

  crons.interval(
    "prune Wolt order details",
    { hours: 24 },
    internal.woltSync.prune,
    {},
  );
}
