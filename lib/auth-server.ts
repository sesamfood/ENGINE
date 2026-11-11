import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";

export const {
  handler,
  isAuthenticated,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthNextJs({
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL!,
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!,
  // Reuse the unexpired Convex JWT cookie instead of fetching a token from
  // Convex on every server render. Convex still verifies it and the session.
  jwtCache: {
    enabled: true,
    expirationToleranceSeconds: 0,
    // A failed call with a cached token is always retried with a fresh one.
    isAuthError: () => false,
  },
});
