"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";

export function useSupportSession() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.platform.support.current, isAuthenticated ? {} : "skip");
}

// Platform staff in a support session have no Better Auth membership, so the
// organization comes from their support grant instead.
export function useActiveOrganization() {
  const { isAuthenticated } = useConvexAuth();
  const support = useSupportSession();
  const organization = authClient.useActiveOrganization();
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
  if (isAuthenticated && support === undefined) {
    return { data: null, isPending: true, error: null };
  }
  return {
    data: organization.data
      ? {
          id: organization.data.id,
          name: organization.data.name,
          slug: organization.data.slug,
          logo: organization.data.logo,
        }
      : null,
    isPending: organization.isPending,
    error: organization.error,
  };
}
