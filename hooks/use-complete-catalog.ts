"use client";

import { useEffect, useState } from "react";
import { getFunctionName } from "convex/server";
import { convexToJson, type Value } from "convex/values";
import {
  usePaginatedQuery,
  type PaginatedQueryArgs,
  type PaginatedQueryItem,
  type PaginatedQueryReference,
} from "convex/react";
import { authClient } from "@/lib/auth-client";

const COMPLETE_CATALOG_PAGE_SIZE = 100;

// Registration forms need the complete catalog before choosing products or units.
export function useCompleteCatalog<Query extends PaginatedQueryReference>(
  query: Query,
  args: (PaginatedQueryArgs<Query> & Record<string, Value | undefined>) | "skip",
) {
  const { data: session } = authClient.useSession();
  const organizationId = session?.session.activeOrganizationId;
  const key = args !== "skip" && organizationId && session?.user.id
    ? JSON.stringify([
        getFunctionName(query),
        convexToJson(args),
        session.user.id,
        organizationId,
      ])
    : null;
  const [completed, setCompleted] = useState<{
    key: string | null;
    products: PaginatedQueryItem<Query>[] | undefined;
  }>({ key: null, products: undefined });
  const changed = completed.key !== key;
  const enabled = key !== null && !changed;
  // An organization change must also reset the pager's implicit organization.
  const { results, status, loadMore } = usePaginatedQuery(
    query,
    enabled ? args : "skip",
    { initialNumItems: COMPLETE_CATALOG_PAGE_SIZE },
  );
  const products = enabled && status === "Exhausted" ? results : undefined;
  if (changed || (products !== undefined && products !== completed.products)) {
    setCompleted({ key, products });
  }
  useEffect(() => {
    if (enabled && status === "CanLoadMore") {
      loadMore(COMPLETE_CATALOG_PAGE_SIZE);
    }
  }, [enabled, loadMore, status]);
  return products ?? (enabled ? completed.products : undefined);
}
