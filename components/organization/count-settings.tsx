"use client";

import { useMutation, useQuery } from "convex/react";
import { Clock3Icon } from "lucide-react";
import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { canManageOrganization } from "@/lib/auth-permissions";
import { activePeriod, countWindow } from "@/lib/count-window";

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Copenhagen",
});

function timeValue(minuteOfDay: number) {
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function minuteValue(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

export function CountSettings() {
  const membership = authClient.useActiveMemberRole();
  const settings = useQuery(api.count.getCountSettings);
  const saveSettings = useMutation(api.count.setCountSettings);
  const [draftTimes, setDraftTimes] = useState<{
    closeTime: string;
    openTime: string;
  } | null>(null);
  const [draftAllowOutsideWindow, setDraftAllowOutsideWindow] = useState<
    boolean | null
  >(null);
  const [draftLockOtherFeatures, setDraftLockOtherFeatures] = useState<
    boolean | null
  >(null);
  const [previewNow] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const closeTime =
    draftTimes?.closeTime ??
    (settings ? timeValue(settings.closeMinuteOfDay) : "");
  const openTime =
    draftTimes?.openTime ??
    (settings ? timeValue(settings.openMinuteOfDay) : "");
  const allowOutsideWindow =
    draftAllowOutsideWindow ?? settings?.allowOutsideWindow ?? false;
  const lockOtherFeaturesDuringCount =
    draftLockOtherFeatures ??
    settings?.lockOtherFeaturesDuringCount ??
    false;

  const preview = useMemo(() => {
    const closeMinuteOfDay = minuteValue(closeTime);
    const openMinuteOfDay = minuteValue(openTime);
    if (closeMinuteOfDay === null || openMinuteOfDay === null) return null;
    const nextSettings = { closeMinuteOfDay, openMinuteOfDay };
    return countWindow(activePeriod(previewNow, nextSettings), nextSettings);
  }, [closeTime, openTime, previewNow]);

  if (membership.isPending || !settings) {
    return <Skeleton className="h-80 w-full max-w-2xl" />;
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
    const closeMinuteOfDay = minuteValue(closeTime);
    const openMinuteOfDay = minuteValue(openTime);
    if (closeMinuteOfDay === null || openMinuteOfDay === null) {
      toast.error("Vælg gyldige tidspunkter");
      return;
    }
    setSaving(true);
    try {
      await saveSettings({
        closeMinuteOfDay,
        openMinuteOfDay,
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
            content="Vælg hvornår count er tilgængelig, og om den øvrige drift skal låses under count-vinduet."
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
          <Field>
            <div className="flex items-center gap-1">
              <FieldLabel htmlFor="count-close-time">Lukketid</FieldLabel>
              <HelpTooltip
                label="Lukketid"
                content="Her åbner månedens count."
              />
            </div>
            <Input
              id="count-close-time"
              type="time"
              value={closeTime}
              onChange={(event) =>
                setDraftTimes({
                  closeTime: event.target.value,
                  openTime,
                })
              }
              className="h-11"
            />
          </Field>
          <Field>
            <div className="flex items-center gap-1">
              <FieldLabel htmlFor="count-open-time">Åbningstid</FieldLabel>
              <HelpTooltip
                label="Åbningstid"
                content="Her låses count næste dag."
              />
            </div>
            <Input
              id="count-open-time"
              type="time"
              value={openTime}
              onChange={(event) =>
                setDraftTimes({
                  closeTime,
                  openTime: event.target.value,
                })
              }
              className="h-11"
            />
          </Field>
        </FieldGroup>

        {preview ? (
          <Alert>
            <Clock3Icon />
            <AlertTitle>Næste count-vindue</AlertTitle>
            <AlertDescription>
              {dateFormatter.format(preview.opensAt)} til{" "}
              {dateFormatter.format(preview.closesAt)}.
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="justify-end">
        <Button disabled={saving || !preview} onClick={() => void save()}>
          {saving ? <Spinner data-icon="inline-start" /> : null}
          Gem count-indstillinger
        </Button>
      </CardFooter>
    </Card>
  );
}
