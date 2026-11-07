"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function OrganizationAuthGate({ children }: { children: ReactNode }) {
  return (
    <>
      <Authenticated>{children}</Authenticated>
      <AuthLoading>
        <div aria-busy="true" aria-label="Indlæser" />
      </AuthLoading>
      <Unauthenticated>
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Katalogforbindelsen er ikke tilgængelig</AlertTitle>
          <AlertDescription>
            Din session kunne ikke valideres. Log ud, og log derefter ind igen.
          </AlertDescription>
        </Alert>
      </Unauthenticated>
    </>
  );
}
