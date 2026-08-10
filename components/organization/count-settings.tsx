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
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { useAccess, usePermission } from "@/components/app-shell";
import type { CountSchedule } from "@/lib/count-window";

const scheduleOptions = [
  { value: "monthly", label: "Månedligt" },
  { value: "interval", label: "Fast interval" },
];

const monthlyDayOptions = [
  { value: "0", label: "Sidste dag i måneden" },
  ...Array.from({ length: 31 }, (_, index) => ({
    value: String(index + 1),
    label: `${index + 1}. dag i måneden`,
  })),
];

function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
  }).format(new Date());
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

export function CountSettings() {
  const access = useAccess();
  const canManage = usePermission("count.settings");
  const settings = useQuery(api.count.getCountSettings, canManage ? {} : "skip");
  const saveSettings = useMutation(api.count.setCountSettings);
  const [draftAllowOutsideWindow, setDraftAllowOutsideWindow] = useState<
    boolean | null
  >(null);
  const [draftLockOtherFeatures, setDraftLockOtherFeatures] = useState<
    boolean | null
  >(null);
  const [draftRequireCount, setDraftRequireCount] = useState<boolean | null>(
    null,
  );
  const [draftSchedule, setDraftSchedule] = useState<CountSchedule | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const allowOutsideWindow =
    draftAllowOutsideWindow ?? settings?.allowOutsideWindow ?? false;
  const lockOtherFeaturesDuringCount =
    draftLockOtherFeatures ??
    settings?.lockOtherFeaturesDuringCount ??
    false;
  const requireCountBeforeOpening =
    draftRequireCount ?? settings?.requireCountBeforeOpening ?? true;
  const countSchedule =
    draftSchedule ?? settings?.countSchedule ?? { type: "monthly", day: 0 };

  if (!access || (canManage && !settings)) {
    return <Skeleton className="h-72 w-full max-w-2xl" />;
  }

  if (!canManage) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at ændre optællingsvinduet.
        </AlertDescription>
      </Alert>
    );
  }

  async function save() {
    if (
      countSchedule.type === "interval" &&
      (!Number.isInteger(countSchedule.intervalDays) ||
        countSchedule.intervalDays < 1 ||
        countSchedule.intervalDays > 365)
    ) {
      toast.error("Intervallet skal være mellem 1 og 365 dage");
      return;
    }

    setSaving(true);
    try {
      await saveSettings({
        allowOutsideWindow,
        lockOtherFeaturesDuringCount,
        requireCountBeforeOpening,
        countSchedule,
      });
      toast.success("Optællingsindstillingerne er gemt");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="flex items-center gap-1">
          <CardTitle>Optællingsindstillinger</CardTitle>
          <HelpTooltip
            label="Optællingsindstillinger"
            content="Vælg hvornår optællingen skal gennemføres, om den skal være registreret før åbning, og om den øvrige drift skal låses imens."
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="count-outside-window">
                  Tillad optælling uden for optællingsvinduet
                </FieldLabel>
                <HelpTooltip
                  label="Tillad optælling uden for optællingsvinduet"
                  content="Medarbejdere kan registrere den aktuelle optælling når som helst."
                />
              </div>
            </FieldContent>
            <Switch
              id="count-outside-window"
              aria-label="Tillad optælling uden for optællingsvinduet"
              checked={allowOutsideWindow}
              onCheckedChange={setDraftAllowOutsideWindow}
            />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="count-lock-other-features">
                  Lås andre funktioner under optælling
                </FieldLabel>
                <HelpTooltip
                  label="Lås andre funktioner under optælling"
                  content="Når optællingsvinduet åbner, er kun optælling, lager og indstillinger tilgængelige for den valgte lokation, indtil dens optælling er registreret."
                />
              </div>
            </FieldContent>
            <Switch
              id="count-lock-other-features"
              aria-label="Lås andre funktioner under optælling"
              checked={lockOtherFeaturesDuringCount}
              onCheckedChange={setDraftLockOtherFeatures}
            />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="count-required-before-opening">
                  Kræv optælling før åbning
                </FieldLabel>
                <HelpTooltip
                  label="Kræv optælling før åbning"
                  content="Når indstillingen er slået til, forbliver en optælling åben efter lokationens åbningstid, indtil den er registreret."
                />
              </div>
            </FieldContent>
            <Switch
              id="count-required-before-opening"
              aria-label="Kræv optælling før åbning"
              checked={requireCountBeforeOpening}
              onCheckedChange={setDraftRequireCount}
            />
          </Field>
        </FieldGroup>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="count-schedule-type">Optællingsfrekvens</FieldLabel>
            <Select
              items={scheduleOptions}
              value={countSchedule.type}
              onValueChange={(value) =>
                setDraftSchedule(
                  value === "interval"
                    ? {
                        type: "interval",
                        intervalDays: 14,
                        anchorDate: today(),
                      }
                    : { type: "monthly", day: 0 },
                )
              }
            >
              <SelectTrigger id="count-schedule-type" className="h-11! w-full sm:max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {scheduleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              Vælg, hvornår optællingsvinduet skal åbne.
            </FieldDescription>
          </Field>

          {countSchedule.type === "monthly" ? (
            <Field>
              <FieldLabel htmlFor="count-schedule-day">Optællingsdag</FieldLabel>
              <Select
                items={monthlyDayOptions}
                value={String(countSchedule.day)}
                onValueChange={(value) =>
                  setDraftSchedule({
                    type: "monthly",
                    day: Number(value),
                  })
                }
              >
                <SelectTrigger id="count-schedule-day" className="h-11! w-full sm:max-w-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {monthlyDayOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <FieldGroup className="grid sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="count-interval-days">
                  Interval i dage
                </FieldLabel>
                <Input
                  id="count-interval-days"
                  type="number"
                  min={1}
                  max={365}
                  className="h-11"
                  value={countSchedule.intervalDays}
                  onChange={(event) =>
                    setDraftSchedule({
                      ...countSchedule,
                      intervalDays: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="count-anchor-date">
                  Første optællingsdato
                </FieldLabel>
                <Input
                  id="count-anchor-date"
                  type="date"
                  className="h-11"
                  value={countSchedule.anchorDate}
                  onChange={(event) =>
                    setDraftSchedule({
                      ...countSchedule,
                      anchorDate: event.target.value,
                    })
                  }
                />
              </Field>
            </FieldGroup>
          )}
        </FieldGroup>

        <Alert>
          <Clock3Icon />
          <AlertTitle>Optællingsvinduet følger åbningstiderne</AlertTitle>
          <AlertDescription>
            Optællingen åbner, når lokationen lukker på den valgte optællingsdag
            {requireCountBeforeOpening
              ? ", og forbliver åbent, indtil det er registreret."
              : ", og lukker, når lokationen åbner igen."}{" "}
            Åbningstider og særlige datoer ændres under Lokationer.
          </AlertDescription>
        </Alert>
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          className="min-h-11"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? <Spinner data-icon="inline-start" /> : null}
          Gem optællingsindstillinger
        </Button>
      </CardFooter>
    </Card>
  );
}
