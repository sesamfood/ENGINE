import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  googlePlacesSearchUser: { kind: "token bucket", period: MINUTE, rate: 60, capacity: 10 },
  googlePlacesSearchOrganization: { kind: "token bucket", period: MINUTE, rate: 300, capacity: 50 },
  googlePlacesReadUser: { kind: "token bucket", period: MINUTE, rate: 30, capacity: 30 },
  googlePlacesReadOrganization: { kind: "token bucket", period: MINUTE, rate: 300, capacity: 60 },
  googlePlacesDaily: { kind: "fixed window", period: 24 * 60 * MINUTE, rate: 10_000 },
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
  monthlyKpiSync: {
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
  restApiMutation: {
    kind: "fixed window",
    period: MINUTE,
    rate: 30,
  },
});
