"use client";

import { getUserErrorMessage } from "@/lib/user-errors";
import { useMutation, useQuery } from "convex/react";
import { Clock3Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import type { Id } from "@/convex/_generated/dataModel";
import { useAccess, usePermission } from "@/components/app-shell";
import type { CountSchedule } from "@/lib/count-window";
import type { SalesSource } from "@/lib/dashboard/types";

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

const salesSourceOptions: Array<{ value: SalesSource; label: string }> = [
  { value: "onlinePos", label: "OnlinePOS" },
  { value: "wolt", label: "Wolt" },
  { value: "combined", label: "Combined: OnlinePOS + Wolt" },
];

function salesSourceFromValue(value: string): SalesSource | null {
  switch (value) {
    case "onlinePos":
    case "wolt":
    case "combined":
      return value;
    default:
      return null;
  }
}

export function CountSettings() {
  const access = useAccess();
  const canManage = usePermission("count.settings");
  const settings = useQuery(api.count.getCountSettings, canManage ? {} : "skip");
  const sourceSettings = useQuery(
    api.countSales.getSettings,
    canManage ? {} : "skip",
  );
  const saveSettings = useMutation(api.count.setCountSettings);
  const saveSource = useMutation(api.countSales.setSource);
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
  const [draftSources, setDraftSources] = useState<Record<string, SalesSource>>(
    {},
  );
  const [savingSource, setSavingSource] = useState<string | null>(null);
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
          Du har ikke adgang til at ændre Count-vinduet.
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
      toast.error(getUserErrorMessage(error, "Count-indstillingerne kunne ikke gemmes. Prøv igen."));
    } finally {
      setSaving(false);
    }
  }

  async function saveLocationSource(
    locationId: Id<"locations">,
    salesSource: SalesSource,
  ) {
    setSavingSource(locationId);
    try {
      await saveSource({ locationId, salesSource });
      setDraftSources((current) => {
        const next = { ...current };
        delete next[locationId];
        return next;
      });
      toast.success("Salgskilden er gemt for lokationen");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Count-indstillingerne kunne ikke gemmes. Prøv igen."));
    } finally {
      setSavingSource(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-10">
      <Card className="max-w-3xl">
      <CardHeader>
        <div className="flex items-center gap-1">
          <CardTitle>Count-indstillinger</CardTitle>
          <HelpTooltip
            label="Count-indstillinger"
            content="Vælg, hvornår Count skal gennemføres, om den skal være registreret før åbning, og om den øvrige drift skal låses imens."
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="count-outside-window">
                  Tillad Count uden for Count-vinduet
                </FieldLabel>
                <HelpTooltip
                  label="Tillad Count uden for Count-vinduet"
                  content="Medarbejdere kan registrere den aktuelle Count når som helst."
                />
              </div>
            </FieldContent>
            <Switch
              id="count-outside-window"
              aria-label="Tillad Count uden for Count-vinduet"
              checked={allowOutsideWindow}
              onCheckedChange={setDraftAllowOutsideWindow}
            />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="count-lock-other-features">
                  Lås andre funktioner under Count
                </FieldLabel>
                <HelpTooltip
                  label="Lås andre funktioner under Count"
                  content="Når Count-vinduet åbner, låses alle andre sider end Count, Lager og Indstillinger for den valgte lokation. Låsen ophæves, når Count er registreret."
                />
              </div>
            </FieldContent>
            <Switch
              id="count-lock-other-features"
              aria-label="Lås andre funktioner under Count"
              checked={lockOtherFeaturesDuringCount}
              onCheckedChange={setDraftLockOtherFeatures}
            />
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="count-required-before-opening">
                  Kræv Count før åbning
                </FieldLabel>
                <HelpTooltip
                  label="Kræv Count før åbning"
                  content="En Count, der ikke er registreret ved åbningstid, forbliver åben, indtil den registreres."
                />
              </div>
            </FieldContent>
            <Switch
              id="count-required-before-opening"
              aria-label="Kræv Count før åbning"
              checked={requireCountBeforeOpening}
              onCheckedChange={setDraftRequireCount}
            />
          </Field>
        </FieldGroup>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="count-schedule-type">Count-frekvens</FieldLabel>
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
              Vælg, hvornår Count-vinduet skal åbne.
            </FieldDescription>
          </Field>

          {countSchedule.type === "monthly" ? (
            <Field>
              <FieldLabel htmlFor="count-schedule-day">Count-dag</FieldLabel>
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
                  Første Count-dato
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
            Count åbner, når lokationen lukker på den valgte Count-dag
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
          Gem Count-indstillinger
        </Button>
      </CardFooter>
      </Card>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Salgskilde til Count</CardTitle>
          <CardDescription>
            Vælg, hvilken salgskilde der skal bruges i Waste-rapporten for hver
            lokation. Uden en gemt indstilling vælger Count OnlinePOS først og
            Wolt, hvis OnlinePOS ikke er forbundet.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!sourceSettings ? (
            <Skeleton className="h-36 w-full" />
          ) : sourceSettings.locations.length === 0 ? (
            <Alert>
              <AlertTitle>Ingen tilgængelige lokationer</AlertTitle>
              <AlertDescription>
                Du har ikke adgang til at vælge salgskilde for en lokation.
              </AlertDescription>
            </Alert>
          ) : (
            sourceSettings.locations.map((location) => {
              const draftSource = draftSources[location.id];
              const selectedSource = draftSource ?? location.effectiveSource;
              const hasDraft = draftSource !== undefined;
              const isSaving = savingSource === location.id;
              const onlinePosConnected = location.connected.onlinePos;
              const woltConnected = location.connected.wolt;
              return (
                <div
                  key={location.id}
                  className="flex flex-col gap-3 rounded-lg border p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="truncate font-medium">{location.name}</h3>
                      <div className="flex flex-wrap gap-2 pt-1 text-sm">
                        <Badge variant={onlinePosConnected ? "secondary" : "outline"}>
                          OnlinePOS: {onlinePosConnected ? "Forbundet" : "Ikke forbundet"}
                        </Badge>
                        <Badge variant={woltConnected ? "secondary" : "outline"}>
                          Wolt: {woltConnected ? "Klar" : "Ikke klar"}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {location.savedSource
                        ? `Gemt: ${salesSourceOptions.find((option) => option.value === location.savedSource)?.label ?? location.savedSource}`
                        : "Standardvalg endnu ikke gemt"}
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <Field className="min-w-0 flex-1">
                      <FieldLabel htmlFor={`count-sales-source-${location.id}`}>
                        Salgskilde
                      </FieldLabel>
                      <Select
                        items={salesSourceOptions}
                        value={selectedSource}
                        onValueChange={(value) => {
                          const source = value
                            ? salesSourceFromValue(value)
                            : null;
                          if (source) {
                            setDraftSources((current) => ({
                              ...current,
                              [location.id]: source,
                            }));
                          }
                        }}
                      >
                        <SelectTrigger
                          id={`count-sales-source-${location.id}`}
                          className="h-11 w-full"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {salesSourceOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Button
                      type="button"
                      className="min-h-11 sm:shrink-0"
                      disabled={!hasDraft || isSaving}
                      onClick={() => void saveLocationSource(location.id, selectedSource)}
                    >
                      {isSaving ? <Spinner data-icon="inline-start" /> : null}
                      Gem salgskilde
                    </Button>
                  </div>
                  {selectedSource === "combined" ? (
                    <Alert variant="destructive">
                      <AlertTitle>Combined er valgt</AlertTitle>
                      <AlertDescription>
                        Combined lægger OnlinePOS- og Wolt-salg sammen. Det samme
                        salg kan derfor blive talt med to gange.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
