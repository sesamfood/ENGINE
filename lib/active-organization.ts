"use client";

import { useConvexAuth } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@/convex/_generated/api";

export function useSupportSession() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.platform.support.current, isAuthenticated ? {} : "skip");
}

// Platform staff in a support session have no Better Auth membership, so the
// organization comes from their support grant instead.
export function useActiveOrganization() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const support = useSupportSession();
  const organization = useQuery(
    api.organization.getActive,
    isAuthenticated ? {} : "skip",
  );
  if (support) {
    return {
      data: {
        id: support.organizationId,
        name: support.organizationName,
        slug: support.organizationSlug,
        logo: support.organizationLogo,
      },
      isPending: false,
      error: null,
    };
  }
  if (isAuthenticated && (support === undefined || organization === undefined)) {
    return { data: null, isPending: true, error: null };
  }
  return {
    data: organization ?? null,
    isPending: isLoading,
    error: null,
  };
}
