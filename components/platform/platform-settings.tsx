"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { usePlatformRole } from "@/components/platform/platform-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { getUserErrorMessage } from "@/lib/user-errors";

export type UnavailableDisplay = "disabled" | "hidden";

export const unavailableDisplayOptions: {
  value: UnavailableDisplay;
  label: string;
}[] = [
  { value: "disabled", label: "Vis nedtonet" },
  { value: "hidden", label: "Skjul" },
];

export function PlatformSettings() {
  const role = usePlatformRole();
  const settings = useQuery(api.platform.settings.get);
  const setUnavailableDisplay = useMutation(
    api.platform.settings.setUnavailableDisplay,
  );
  const [saving, setSaving] = useState(false);
  const canEdit = role === "owner";

  async function change(value: UnavailableDisplay) {
    setSaving(true);
    try {
      await setUnavailableDisplay({ unavailableDisplay: value });
      toast.success("Indstillingen er gemt");
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Indstillingen kunne ikke gemmes. Prøv igen."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Indstillinger</h1>
      {settings === undefined ? (
        <Skeleton className="h-40 w-full max-w-3xl" />
      ) : (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>Funktioner uden for abonnementet</CardTitle>
            <CardDescription>
              Standard for alle organisationer. Kan ændres for den enkelte
              organisation under Funktioner.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Field className="sm:max-w-sm">
              <FieldLabel htmlFor="platform-unavailable-display">
                Visning i Administration
              </FieldLabel>
              <Select
                items={unavailableDisplayOptions}
                value={settings.unavailableDisplay}
                disabled={!canEdit || saving}
                onValueChange={(value) =>
                  void change(value as UnavailableDisplay)
                }
              >
                <SelectTrigger
                  id="platform-unavailable-display"
                  className="h-11! w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {unavailableDisplayOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {!canEdit ? (
                <FieldDescription>
                  Kun platformejere kan ændre indstillingen.
                </FieldDescription>
              ) : null}
            </Field>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
