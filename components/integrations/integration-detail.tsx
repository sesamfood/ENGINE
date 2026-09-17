"use client";

import { useIntegrations } from "@/integrations/use-integrations";

import type { ComponentType } from "react";
import dynamic from "next/dynamic";
import { useAccess, usePermission } from "@/components/app-shell";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { integrationRegistry, type IntegrationId } from "@/integrations/registry";
import { authClient } from "@/lib/auth-client";

const settingsComponents = {
  workfeed: dynamic(() => import("@/integrations/workfeed/client").then((module) => module.WorkfeedIntegration)),
  onlinepos: dynamic(() => import("@/integrations/onlinepos/client").then((module) => module.OnlinePosIntegration)),
  economic: dynamic(() => import("@/integrations/economic/client").then((module) => module.EconomicIntegration)),
  wolt: dynamic(() => import("@/integrations/wolt/client").then((module) => module.WoltIntegration)),
} satisfies Record<IntegrationId, ComponentType>;

export function IntegrationDetail({ integration }: { integration: IntegrationId }) {
  const { data: session } = authClient.useSession();
  const access = useAccess();
  const canManage = usePermission("integrations.manage");
  const state = useIntegrations();
  const entry = integrationRegistry.find((entry) => entry.id === integration);

  if (!access || (canManage && !state)) {
    return <Skeleton className="h-72 w-full max-w-6xl" />;
  }

  const available = canManage && state?.[integration] && entry &&
    (!entry.requiresAllLocations || access.locationScope.all);
  const Settings = settingsComponents[integration];

  return (
    <div className="flex max-w-6xl flex-col gap-5 pb-10">
      {available ? (
        <>
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold">{entry.name}</h1>
            <p className="text-sm text-muted-foreground">{entry.description}</p>
          </div>
          <Settings key={`${session?.session.activeOrganizationId}:${session?.user.id}`} />
        </>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Indstillingerne er ikke tilgængelige</EmptyTitle>
            <EmptyDescription>
              Gå til integrationer for at se de tilgængelige muligheder.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
