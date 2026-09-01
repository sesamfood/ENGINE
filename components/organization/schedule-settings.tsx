"use client";

import { getUserErrorMessage } from "@/lib/user-errors";
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
import { useAccess, usePermission } from "@/components/app-shell";

export function ScheduleSettings() {
  const access = useAccess();
  const canManage = usePermission("organization.settings");
  const context = useQuery(api.employees.getContext, canManage ? {} : "skip");
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

  if (!access) {
    return <Skeleton className="h-64 w-full max-w-3xl" />;
  }

  if (!canManage) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at ændre vagtplanens tidszone.
        </AlertDescription>
      </Alert>
    );
  }

  if (!context) {
    return <Skeleton className="h-64 w-full max-w-3xl" />;
  }

  const timeZone = draft ?? context.timeZone;

  async function save() {
    setSaving(true);
    try {
      await setTimeZone({ timeZone });
      setDraft(null);
      toast.success("Tidszonen er gemt");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Tidszonen kunne ikke gemmes. Prøv igen."));
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
