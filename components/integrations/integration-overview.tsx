"use client";

import { useIntegrations } from "@/integrations/use-integrations";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";
import { toast } from "sonner";
import { useAccess, usePermission } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
          return (
            <Card key={entry.id}>
              <CardHeader>
                <CardTitle>{entry.name}</CardTitle>
                <CardDescription>{entry.description}</CardDescription>
                <CardAction>
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
              <CardContent className="flex-1">
                <Badge variant={enabled ? "default" : "secondary"}>
                  {enabled ? "Aktiveret" : "Deaktiveret"}
                </Badge>
              </CardContent>
              <CardFooter>
                {enabled && canConfigure ? (
                  <Button
                    variant="outline"
                    className="min-h-11 w-full justify-between"
                    render={<Link href={`/administration/integrations/${entry.id}`} />}
                    nativeButton={false}
                    aria-label={`${entry.name}-indstillinger`}
                  >
                    Indstillinger
                    <ArrowRightIcon data-icon="inline-end" />
                  </Button>
                ) : (
                  <p className="flex min-h-11 items-center text-sm text-muted-foreground">
                    {enabled
                      ? "Indstillinger kræver adgang til alle lokationer."
                      : "Aktivér integrationen for at åbne indstillinger."}
                  </p>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
