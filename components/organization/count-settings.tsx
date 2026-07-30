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
import { authClient } from "@/lib/auth-client";
import { canManageOrganization } from "@/lib/auth-permissions";
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
  const membership = authClient.useActiveMemberRole();
  const settings = useQuery(api.count.getCountSettings);
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
      toast.success("Count-indstillingerne er gemt");
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
          <CardTitle>Count-indstillinger</CardTitle>
          <HelpTooltip
            label="Count-indstillinger"
            content="Vælg hvornår count skal gennemføres, om det skal være registreret før åbning, og om den øvrige drift skal låses imens."
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
                  content="Medarbejdere kan registrere den aktuelle count når som helst."
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
          <Field orientation="horizontal">
            <FieldContent>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="count-required-before-opening">
                  Kræv count før åbning
                </FieldLabel>
                <HelpTooltip
                  label="Kræv count før åbning"
                  content="Når indstillingen er slået til, forbliver et count åbent efter locationens åbningstid, indtil det er registreret."
                />
              </div>
            </FieldContent>
            <Switch
              id="count-required-before-opening"
              aria-label="Kræv count før åbning"
              checked={requireCountBeforeOpening}
              onCheckedChange={setDraftRequireCount}
            />
          </Field>
        </FieldGroup>

        <FieldGroup>
          <Field>
            <FieldLabel>Count-frekvens</FieldLabel>
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
              <SelectTrigger className="h-11! w-full sm:max-w-sm">
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
              Vælg hvornår count-vinduet skal åbne.
            </FieldDescription>
          </Field>

          {countSchedule.type === "monthly" ? (
            <Field>
              <FieldLabel>Count-dag</FieldLabel>
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
                <SelectTrigger className="h-11! w-full sm:max-w-sm">
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
                  Første count-dato
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
          <AlertTitle>Count-vinduet følger åbningstiderne</AlertTitle>
          <AlertDescription>
            Count åbner, når locationen lukker på den valgte count-dag
            {requireCountBeforeOpening
              ? ", og forbliver åbent, indtil det er registreret."
              : ", og lukker, når locationen åbner igen."}{" "}
            Åbningstider og særlige datoer ændres under Locations.
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
          Gem count-indstillinger
        </Button>
      </CardFooter>
    </Card>
  );
}
