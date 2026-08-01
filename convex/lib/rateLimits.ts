import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  manualWorkfeedSync: {
    kind: "fixed window",
    period: 5 * MINUTE,
    rate: 1,
  },
});
