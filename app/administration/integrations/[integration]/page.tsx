import { Suspense } from "react";
import { notFound } from "next/navigation";
import { IntegrationDetail } from "@/components/integrations/integration-detail";
import { Skeleton } from "@/components/ui/skeleton";
import { integrationRegistry } from "@/integrations/registry";

export default async function IntegrationSettingsPage({
  params,
}: {
  params: Promise<{ integration: string }>;
}) {
  const { integration } = await params;
  const entry = integrationRegistry.find((entry) => entry.id === integration);
  if (!entry) notFound();

  return (
    <Suspense fallback={<Skeleton className="h-72 w-full max-w-6xl" />}>
      <IntegrationDetail integration={entry.id} />
    </Suspense>
  );
}
