"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export function OrganizationAuthGate({ children }: { children: ReactNode }) {
  return (
    <>
      <Authenticated>{children}</Authenticated>
      <AuthLoading>
        <div className="flex flex-col gap-5" aria-label="Loading catalog">
          <Skeleton className="h-11 w-64 max-w-full" />
          <Skeleton className="h-12 w-full" />
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="aspect-[4/3] w-full" />
            ))}
          </div>
        </div>
      </AuthLoading>
      <Unauthenticated>
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Catalog connection unavailable</AlertTitle>
          <AlertDescription>
            Convex could not validate this Clerk session. Enable Clerk&apos;s
            Convex integration for this instance, then sign out completely and
            sign back in.
          </AlertDescription>
        </Alert>
      </Unauthenticated>
    </>
  );
}
