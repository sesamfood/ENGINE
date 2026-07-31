"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CreatableCombobox } from "@/components/catalog/creatable-combobox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { canManageOrganization } from "@/lib/auth-permissions";

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

export function ScheduleSettings() {
  const membership = authClient.useActiveMemberRole();
  const context = useQuery(api.employees.getContext);
  const setTimeZone = useMutation(api.employees.setTimeZone);
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const zones = useMemo(() => {
    const supported =
      typeof Intl.supportedValuesOf === "function"
        ? Intl.supportedValuesOf("timeZone")
        : [
            "Europe/Copenhagen",
            "Europe/London",
            "Europe/Oslo",
            "Europe/Rome",
            "Europe/Stockholm",
            "UTC",
          ];
    return supported.map((zone) => ({
      value: zone,
      label: zone.replaceAll("_", " "),
    }));
  }, []);

  if (membership.isPending || !context) {
    return <Skeleton className="h-64 w-full max-w-3xl" />;
  }

  if (!canManageOrganization(membership.data?.role)) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Kun administratorer kan ændre vagtplanens tidszone.
        </AlertDescription>
      </Alert>
    );
  }

  const timeZone = draft ?? context.timeZone;

  async function save() {
    setSaving(true);
    try {
      await setTimeZone({ timeZone });
      setDraft(null);
      toast.success("Tidszonen er gemt");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Tidszone for vagtplan</CardTitle>
        <CardDescription>
          Bruges til uger, datoer og klokkeslæt i medarbejdernes vagtplan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel>Tidszone</FieldLabel>
            <CreatableCombobox
              options={zones}
              value={timeZone}
              onValueChange={(value) => value && setDraft(value)}
              placeholder="Søg efter tidszone"
              ariaLabel="Tidszone"
            />
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          disabled={saving || timeZone === context.timeZone}
          onClick={() => void save()}
        >
          {saving ? <Spinner data-icon="inline-start" /> : null}
          Gem
        </Button>
      </CardFooter>
    </Card>
  );
}
