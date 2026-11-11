"use client";

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexReactClient } from "convex/react";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache/provider";
import type { ReactNode } from "react";
import { authClient } from "@/lib/auth-client";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error("Miljøvariablen NEXT_PUBLIC_CONVEX_URL mangler");
}

const convex = new ConvexReactClient(convexUrl);

export function ConvexClientProvider({
  children,
  initialToken,
}: {
  children: ReactNode;
  initialToken?: string | null;
}) {
  return (
    <ConvexBetterAuthProvider
      client={convex}
      authClient={authClient}
      initialToken={initialToken}
    >
      {/* Keeps a left page's subscriptions briefly so returning to it is
          instant. Short expiry limits re-runs of queries nobody is viewing. */}
      <ConvexQueryCacheProvider expiration={120_000} maxIdleEntries={100}>
        {children}
      </ConvexQueryCacheProvider>
    </ConvexBetterAuthProvider>
  );
}
