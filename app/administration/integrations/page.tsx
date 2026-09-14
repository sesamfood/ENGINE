import { Suspense } from "react";
import { IntegrationOverview } from "@/components/integrations/integration-overview";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdministrationIntegrationsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full max-w-6xl" />}>
      <IntegrationOverview />
    </Suspense>
  );
}
