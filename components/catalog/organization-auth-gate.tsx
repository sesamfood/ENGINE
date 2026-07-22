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
        <div className="flex flex-col gap-5" aria-label="Indlæser katalog">
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
          <AlertTitle>Katalogforbindelsen er ikke tilgængelig</AlertTitle>
          <AlertDescription>
            Convex kunne ikke validere din session. Log ud, og log derefter ind
            igen.
          </AlertDescription>
        </Alert>
      </Unauthenticated>
    </>
  );
}
