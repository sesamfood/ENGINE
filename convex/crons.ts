import { registerWoltCrons } from "./integrations/wolt/crons";
import { registerOnlinePosCrons } from "./integrations/onlinepos/crons";
import { registerWorkfeedCrons } from "./integrations/workfeed/crons";
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

registerWorkfeedCrons(crons);
registerOnlinePosCrons(crons);
registerWoltCrons(crons);

crons.interval("refresh weather and holiday forecasts", { hours: 6 }, internal.forecasts.dispatch, { cursor: null });

crons.interval(
  "flush dashboard summary updates",
  { minutes: 5 },
  internal.dashboardSummaries.flushSummaryDeltas,
  {},
);

crons.interval(
  "delete expired archived products",
  { hours: 24 },
  internal.catalog.deleteExpiredProducts,
  {},
);

// Audit history follows the existing 400-day sales retention window.
crons.interval("prune audit log", { hours: 24 }, internal.audit.prune, {});

crons.interval(
  "prune REST API idempotency records",
  { hours: 1 },
  internal.apiIdempotency.prune,
  {},
);

crons.cron(
  "delete orphaned uploads",
  "11 2 * * 0",
  internal.storageCleanup.removeOrphans,
  { cursor: null },
);

crons.cron(
  "delete orphaned member location access",
  "41 2 * * 0",
  internal.access.purgeOrphanedMemberLocationAccess,
  { cursor: null },
);

export default crons;
