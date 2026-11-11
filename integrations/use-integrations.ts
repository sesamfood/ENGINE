"use client";

import { useConvexAuth } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@/convex/_generated/api";
import { useActiveOrganization } from "@/lib/active-organization";

export function useIntegrations() {
  const { isAuthenticated } = useConvexAuth();
  const organizationId = useActiveOrganization().data?.id;
  const state = useQuery(
    api.integrations.getState,
    isAuthenticated && organizationId ? {} : "skip",
  );
  // Ignore results that still belong to the previous organization after a switch.
  return state?.organizationId === organizationId ? state : undefined;
}
