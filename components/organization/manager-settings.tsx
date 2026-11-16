"use client";

import { useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { targetableMetrics } from "@/lib/dashboard/registry";
import type { MetricId } from "@/lib/dashboard/types";
import { getUserErrorMessage } from "@/lib/user-errors";
import { usePermission } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

export function ManagerSettings() {
  const canManage = usePermission("dashboard.manage");
  const settings = useQuery(api.locationTargets.getSettings, canManage ? {} : "skip");

  if (!canManage) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>Du har ikke adgang til at ændre indstillingerne for Manager.</AlertDescription>
      </Alert>
    );
  }
  if (settings === undefined) return <Skeleton className="h-72 w-full" />;
  return <ManagerSettingsForm key={settings.targetMetricIds.join(",")} initial={settings.targetMetricIds} />;
}

function ManagerSettingsForm({ initial }: { initial: MetricId[] }) {
  const save = useMutation(api.locationTargets.saveSettings);
  const [selected, setSelected] = useState<MetricId[]>(initial);
  const [pending, setPending] = useState(false);
  const categories = [...new Set(targetableMetrics.map((metric) => metric.category))];

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await save({ targetMetricIds: selected });
      toast.success("Indstillingerne er gemt");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Indstillingerne kunne ikke gemmes. Prøv igen."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mål</CardTitle>
        <CardDescription>Vælg de målinger, managere kan sætte mål for på deres lokationer.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-6">
          <FieldSet>
            <FieldLegend>Tilgængelige målinger</FieldLegend>
            <FieldDescription>Eksisterende mål for fravalgte målinger gemmes, men vises ikke.</FieldDescription>
            <div data-slot="checkbox-group" className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {categories.map((category) => (
                <FieldSet key={category} appearance="outline">
                  <FieldLegend variant="label">{category}</FieldLegend>
                  {targetableMetrics.filter((metric) => metric.category === category).map((metric) => (
                    <Field key={metric.id} orientation="horizontal">
                      <Checkbox
                        id={`manager-metric-${metric.id}`}
                        checked={selected.includes(metric.id)}
                        onCheckedChange={(checked) =>
                          setSelected(checked ? [...selected, metric.id] : selected.filter((id) => id !== metric.id))}
                      />
                      <FieldLabel htmlFor={`manager-metric-${metric.id}`}>{metric.label}</FieldLabel>
                    </Field>
                  ))}
                </FieldSet>
              ))}
            </div>
          </FieldSet>
          <Button type="submit" size="lg" className="self-start" disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}Gem indstillinger
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
