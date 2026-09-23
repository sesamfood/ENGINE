"use client";

import { useIntegrations } from "@/integrations/use-integrations";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRightIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { useAccess, usePermission } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { integrationRegistry, type IntegrationId } from "@/integrations/registry";
import { getUserErrorMessage } from "@/lib/user-errors";

function ConnectionSummary({ integration }: { integration: IntegrationId }) {
  const workfeed = useQuery(api.workfeed.getSettings, integration === "workfeed" ? {} : "skip");
  const onlinePos = useQuery(api.onlinePos.getSettings, integration === "onlinepos" ? {} : "skip");
  const economic = useQuery(api.economic.getSettings, integration === "economic" ? {} : "skip");
  const wolt = useQuery(api.wolt.getIntegrationOverview, integration === "wolt" ? {} : "skip");
  let label = "Henter forbindelsesstatus…";
  let attention = false;
  if (workfeed) {
    label = workfeed.connected ? "Forbundet til Workfeed" : "Mangler forbindelse";
    attention = !workfeed.connected;
  }
  if (onlinePos) {
    label = onlinePos.masters.length ? `${onlinePos.masters.length} masterforbindelse${onlinePos.masters.length === 1 ? "" : "r"}` : "Mangler masterforbindelse";
    attention = onlinePos.masters.length === 0;
  }
  if (economic) {
    const reconnect = economic.connections.filter((connection) => connection.requiresReconnect).length;
    const connected = economic.connections.filter((connection) => connection.enabled && !connection.requiresReconnect).length;
    attention = reconnect > 0 || connected === 0;
    label = reconnect ? `${reconnect} aftale${reconnect === 1 ? " kræver" : "r kræver"} ny forbindelse` : connected ? `${connected} forbundet aftale${connected === 1 ? "" : "r"}` : "Mangler aktiv forbindelse";
  }
  if (wolt) {
    const incomplete = wolt.locations.filter((location) => !location.connection || location.connection.state !== "ready" || location.connection.deadLetterCount > 0 || location.connection.lastError).length;
    attention = incomplete > 0 || wolt.locations.length === 0;
    label = incomplete ? `${incomplete} lokation${incomplete === 1 ? " kræver" : "er kræver"} handling` : wolt.locations.length ? `${wolt.locations.length} ${wolt.locations.length === 1 ? "forbundet lokation" : "forbundne lokationer"}` : "Ingen forbundne lokationer";
  }
  return <p className={attention ? "flex items-center gap-2 text-sm font-medium" : "text-sm text-muted-foreground"}>{attention ? <TriangleAlertIcon className="size-4 shrink-0 text-destructive" aria-hidden="true" /> : null}{label}</p>;
}

export function IntegrationOverview() {
  const access = useAccess();
  const canManage = usePermission("integrations.manage");
  const state = useIntegrations();
  const setEnabled = useMutation(api.integrations.setEnabled);
  const [saving, setSaving] = useState<IntegrationId | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const canToggle = access?.locationScope.all === true;

  useEffect(() => {
    const result = searchParams.get("wolt");
    if (state?.wolt && (result === "processing" || result === "error")) {
      router.replace(`/administration/integrations/wolt?${searchParams}`);
    }
  }, [router, searchParams, state?.wolt]);

  async function changeEnabled(entry: (typeof integrationRegistry)[number], enabled: boolean) {
    if (!state) return;
    setSaving(entry.id);
    try {
      await setEnabled({ integration: entry.id, enabled, expectedOrganizationId: state.organizationId });
      toast.success(`${entry.name} er ${enabled ? "aktiveret" : "deaktiveret"}`);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Integrationen kunne ikke opdateres. Prøv igen."));
    } finally {
      setSaving(null);
    }
  }

  if (!access || (canManage && !state)) {
    return (
      <div className="grid gap-5 md:grid-cols-2">
        {integrationRegistry.map((entry) => (
          <Skeleton key={entry.id} className="h-52 w-full" />
        ))}
      </div>
    );
  }

  if (!canManage || !state) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at administrere integrationer.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex max-w-6xl flex-col gap-5 pb-10">
      <p className="text-sm text-muted-foreground">
        Aktivér de integrationer, organisationen vil bruge, og tilføj jeres egne adgangsnøgler under indstillinger.
      </p>
      {!canToggle ? (
        <Alert>
          <AlertTitle>Adgang til alle lokationer kræves</AlertTitle>
          <AlertDescription>
            Du skal have adgang til alle lokationer for at aktivere eller deaktivere integrationer.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-5 md:grid-cols-2">
        {integrationRegistry.map((entry) => {
          const enabled = state[entry.id];
          const canConfigure = !entry.requiresAllLocations || canToggle;
          const canOpen = enabled && canConfigure;
          return (
            <Card
              key={entry.id}
              appearance={canOpen ? "hover" : undefined}
              className="relative"
            >
              <CardHeader className="@container-normal">
                <CardTitle>
                  {canOpen ? (
                    <Link
                      href={`/administration/integrations/${entry.id}`}
                      aria-label={`${entry.name}-indstillinger`}
                      className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                    >
                      {entry.name}
                    </Link>
                  ) : entry.name}
                </CardTitle>
                <CardDescription>{entry.description}</CardDescription>
                <CardAction className="relative z-10">
                  <Field orientation="horizontal" className="min-h-11 w-auto">
                    <FieldLabel htmlFor={`${entry.id}-enabled`} className="sr-only">
                      Aktivér {entry.name}
                    </FieldLabel>
                    <Switch
                      id={`${entry.id}-enabled`}
                      checked={enabled}
                      disabled={!canToggle || saving !== null}
                      aria-busy={saving === entry.id}
                      onCheckedChange={(checked) => void changeEnabled(entry, checked)}
                    />
                  </Field>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-1 items-center justify-between">
                <div className="flex flex-col items-start gap-2">
                  <Badge variant="secondary">{enabled ? "Aktiveret" : "Deaktiveret"}</Badge>
                  {canOpen ? <ConnectionSummary integration={entry.id} /> : null}
                </div>
                {canOpen ? <span className="flex items-center gap-2 text-sm">Indstillinger<ArrowRightIcon className="size-4" aria-hidden="true" /></span> : null}
              </CardContent>
              {!canOpen ? (
                <CardFooter>
                  <p className="flex min-h-11 items-center text-sm text-muted-foreground">
                    {enabled
                      ? "Indstillinger kræver adgang til alle lokationer."
                      : "Aktivér integrationen for at åbne indstillinger."}
                  </p>
                </CardFooter>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
