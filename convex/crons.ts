import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "delete expired archived products",
  { hours: 24 },
  internal.catalog.deleteExpiredProducts,
  {},
);

export default crons;
