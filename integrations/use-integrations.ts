"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";

export function useIntegrations() {
  const { isAuthenticated } = useConvexAuth();
  const organization = authClient.useActiveOrganization();
  const session = authClient.useSession();
  const organizationId = session.data?.session.activeOrganizationId;
  const state = useQuery(
    api.integrations.getState,
    isAuthenticated && organizationId && organization.data?.id === organizationId ? {} : "skip",
  );
  return state?.organizationId === organizationId && organization.data?.id === organizationId
    ? state
    : undefined;
}
