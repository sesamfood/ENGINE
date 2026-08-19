import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  manualWorkfeedSync: {
    kind: "fixed window",
    period: 5 * MINUTE,
    rate: 1,
  },
  manualSalesSync: {
    kind: "fixed window",
    period: 5 * MINUTE,
    rate: 1,
  },
  dashboardShareUnlock: {
    kind: "fixed window",
    period: MINUTE,
    rate: 5,
  },
  ownCheckSubmit: {
    kind: "fixed window",
    period: MINUTE,
    rate: 60,
  },
  feedbackSubmit: {
    kind: "fixed window",
    period: 10 * MINUTE,
    rate: 5,
  },
});
