"use client";

import { useMutation, useQuery } from "convex/react";
import { Clock3Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { canManageOrganization } from "@/lib/auth-permissions";

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

export function CountSettings() {
  const membership = authClient.useActiveMemberRole();
  const settings = useQuery(api.count.getCountSettings);
  const saveSettings = useMutation(api.count.setCountSettings);
  const [draftAllowOutsideWindow, setDraftAllowOutsideWindow] = useState<
    boolean | null
  >(null);
  const [draftLockOtherFeatures, setDraftLockOtherFeatures] = useState<
    boolean | null
  >(null);
  const [saving, setSaving] = useState(false);
  const allowOutsideWindow =
    draftAllowOutsideWindow ?? settings?.allowOutsideWindow ?? false;
  const lockOtherFeaturesDuringCount =
    draftLockOtherFeatures ??
    settings?.lockOtherFeaturesDuringCount ??
    false;

  if (membership.isPending || !settings) {
    return <Skeleton className="h-72 w-full max-w-2xl" />;
  }

  if (!canManageOrganization(membership.data?.role)) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Kun administratorer kan ændre count-vinduet.
        </AlertDescription>
      </Alert>
    );
  }

  async function save() {
    setSaving(true);
    try {
      await saveSettings({
        allowOutsideWindow,
        lockOtherFeaturesDuringCount,
      });
      toast.success("Count-indstillingerne er gemt");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex items-center gap-1">
          <CardTitle>Count-indstillinger</CardTitle>
          <HelpTooltip
            label="Count-indstillinger"
            content="Vælg om count kan gennemføres uden for locationens count-vindue, og om den øvrige drift skal låses imens."
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="count-outside-window">
                  Tillad count uden for count-vinduet
                </FieldLabel>
                <HelpTooltip
                  label="Tillad count uden for count-vinduet"
                  content="Medarbejdere kan registrere månedens count når som helst."
                />
              </div>
            </FieldContent>
            <Switch
              id="count-outside-window"
              aria-label="Tillad count uden for count-vinduet"
              checked={allowOutsideWindow}
              onCheckedChange={setDraftAllowOutsideWindow}
            />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="count-lock-other-features">
                  Lås andre funktioner under count
                </FieldLabel>
                <HelpTooltip
                  label="Lås andre funktioner under count"
                  content="Når count-vinduet åbner, er kun count, lager og indstillinger tilgængelige for den valgte location, indtil dens count er registreret."
                />
              </div>
            </FieldContent>
            <Switch
              id="count-lock-other-features"
              aria-label="Lås andre funktioner under count"
              checked={lockOtherFeaturesDuringCount}
              onCheckedChange={setDraftLockOtherFeatures}
            />
          </Field>
        </FieldGroup>

        <Alert>
          <Clock3Icon />
          <AlertTitle>Count-vinduet følger åbningstiderne</AlertTitle>
          <AlertDescription>
            Månedens count åbner, når locationen lukker sidste gang i måneden,
            og lukker igen, når locationen åbner første gang i den nye måned.
            Åbningstider og særlige datoer ændres under Locations.
          </AlertDescription>
        </Alert>
      </CardContent>
      <CardFooter className="justify-end">
        <Button disabled={saving} onClick={() => void save()}>
          {saving ? <Spinner data-icon="inline-start" /> : null}
          Gem count-indstillinger
        </Button>
      </CardFooter>
    </Card>
  );
}
