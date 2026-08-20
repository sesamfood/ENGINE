"use client";

import { useMutation, useQuery } from "convex/react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  MAX_SPECIAL_OPENING_DATES,
  type DailyOpeningHours,
  type SpecialOpeningHours,
  type WeeklyOpeningHours,
} from "@/lib/count-window";

const weekdays = [
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
  "Søndag",
];

type OpeningHoursMode = "sameEveryDay" | "byWeekday";
type OpeningHoursDraft = {
  mode: OpeningHoursMode;
  weekly: WeeklyOpeningHours[];
  specials: SpecialOpeningHours[];
};

function copySettings(settings: OpeningHoursDraft): OpeningHoursDraft {
  return {
    mode: settings.mode,
    weekly: settings.weekly.map((hours) => ({ ...hours })),
    specials: settings.specials.map((hours) => ({ ...hours })),
  };
}

function draftFrom(
  current: OpeningHoursDraft | null,
  settings: OpeningHoursDraft | undefined,
) {
  return current ?? (settings ? copySettings(settings) : null);
}

function timeValue(minuteOfDay: number) {
  return `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`;
}

function minuteValue(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

function HoursFields({
  id,
  label,
  hours,
  onChange,
}: {
  id: string;
  label: string;
  hours: DailyOpeningHours;
  onChange: (hours: DailyOpeningHours) => void;
}) {
  return (
    <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[7rem_minmax(7rem,1fr)_minmax(7rem,1fr)] sm:items-end">
      <Field orientation="horizontal" className="min-h-11">
        <FieldContent>
          <FieldLabel htmlFor={`${id}-closed`}>Lukket</FieldLabel>
        </FieldContent>
        <Switch
          id={`${id}-closed`}
          aria-label={`${label} er lukket`}
          checked={hours.closed}
          onCheckedChange={(closed) => onChange({ ...hours, closed })}
        />
      </Field>
      <Field data-disabled={hours.closed}>
        <FieldLabel htmlFor={`${id}-open`}>Åbner</FieldLabel>
        <Input
          id={`${id}-open`}
          type="time"
          className="h-11"
          value={timeValue(hours.openMinuteOfDay)}
          disabled={hours.closed}
          aria-label={`${label} åbner`}
          onChange={(event) => {
            const value = minuteValue(event.target.value);
            if (value !== null) onChange({ ...hours, openMinuteOfDay: value });
          }}
        />
      </Field>
      <Field data-disabled={hours.closed}>
        <FieldLabel htmlFor={`${id}-close`}>Lukker</FieldLabel>
        <Input
          id={`${id}-close`}
          type="time"
          className="h-11"
          value={timeValue(hours.closeMinuteOfDay)}
          disabled={hours.closed}
          aria-label={`${label} lukker`}
          onChange={(event) => {
            const value = minuteValue(event.target.value);
            if (value !== null) onChange({ ...hours, closeMinuteOfDay: value });
          }}
        />
      </Field>
    </div>
  );
}

export function LocationOpeningHours({
  locationId,
  locationName,
  open,
  onOpenChange,
}: {
  locationId: Id<"locations">;
  locationName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const settings = useQuery(
    api.locations.getOpeningHours,
    open ? { locationId } : "skip",
  );
  const saveOpeningHours = useMutation(api.locations.setOpeningHours);
  const [draft, setDraft] = useState<OpeningHoursDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const currentDraft = draft ?? (settings ? copySettings(settings) : null);

  function setMode(mode: OpeningHoursMode) {
    setDraft((current) => {
      const source = draftFrom(current, settings);
      if (!source || source.mode === mode) return source;
      if (mode === "byWeekday") return { ...source, mode };
      const first = source.weekly[0];
      return {
        ...source,
        mode,
        weekly: source.weekly.map((hours) => ({
          ...hours,
          closed: first.closed,
          openMinuteOfDay: first.openMinuteOfDay,
          closeMinuteOfDay: first.closeMinuteOfDay,
        })),
      };
    });
  }

  function updateWeekly(
    weekday: number,
    hours: DailyOpeningHours,
  ) {
    setDraft((current) => {
      const source = draftFrom(current, settings);
      if (!source) return source;
      return {
        ...source,
        weekly: source.weekly.map((day) =>
          source.mode === "sameEveryDay" || day.weekday === weekday
            ? {
                ...day,
                closed: hours.closed,
                openMinuteOfDay: hours.openMinuteOfDay,
                closeMinuteOfDay: hours.closeMinuteOfDay,
              }
            : day,
        ),
      };
    });
  }

  function updateSpecial(
    index: number,
    next: Partial<SpecialOpeningHours>,
  ) {
    setDraft((current) => {
      const source = draftFrom(current, settings);
      if (!source) return source;
      return {
        ...source,
        specials: source.specials.map((hours, position) =>
          position === index ? { ...hours, ...next } : hours,
        ),
      };
    });
  }

  async function save() {
    if (!currentDraft) return;
    if (currentDraft.specials.some((hours) => !hours.date)) {
      toast.error("Vælg en dato for alle særlige åbningstider");
      return;
    }
    if (
      new Set(currentDraft.specials.map((hours) => hours.date)).size !==
      currentDraft.specials.length
    ) {
      toast.error("Hver særlig dato må kun tilføjes én gang");
      return;
    }
    if (currentDraft.weekly.every((hours) => hours.closed)) {
      toast.error("Mindst én ugedag skal være åben");
      return;
    }
    const invalidHours = [
      ...currentDraft.weekly,
      ...currentDraft.specials,
    ].some(
      (hours) =>
        !hours.closed &&
        hours.openMinuteOfDay === hours.closeMinuteOfDay,
    );
    if (invalidHours) {
      toast.error("Åbnings- og lukketid skal være forskellige");
      return;
    }

    setSaving(true);
    try {
      await saveOpeningHours({
        locationId,
        mode: currentDraft.mode,
        weekly: currentDraft.weekly,
        specials: [...currentDraft.specials].sort((left, right) =>
          left.date.localeCompare(right.date),
        ),
      });
      toast.success("Åbningstiderne er gemt");
      onOpenChange(false);
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSaving(false);
    }
  }

  const displayedWeekly =
    currentDraft?.mode === "sameEveryDay"
      ? currentDraft.weekly.slice(0, 1)
      : currentDraft?.weekly;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !saving) {
          setDraft(null);
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Åbningstider for {locationName}</DialogTitle>
          <DialogDescription>
            Åbningstiderne bestemmer Count-vinduet på den valgte Count-dag.
          </DialogDescription>
        </DialogHeader>

        {!currentDraft ? (
          <div className="flex flex-col gap-3 py-4">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <FieldSet>
              <div className="flex items-center gap-1">
                <FieldLegend>Faste åbningstider</FieldLegend>
                <HelpTooltip
                  label="Faste åbningstider"
                  content="En lukketid før åbningstiden betyder, at lokationen lukker efter midnat."
                />
              </div>
              <ToggleGroup
                value={[currentDraft.mode]}
                onValueChange={(value) => {
                  const mode = value[0];
                  if (mode === "sameEveryDay" || mode === "byWeekday") {
                    setMode(mode);
                  }
                }}
                variant="outline"
                spacing={0}
                aria-label="Opdeling af åbningstider"
              >
                <ToggleGroupItem value="sameEveryDay">
                  Samme hver dag
                </ToggleGroupItem>
                <ToggleGroupItem value="byWeekday">
                  Hver ugedag
                </ToggleGroupItem>
              </ToggleGroup>
              <FieldGroup>
                {displayedWeekly?.map((hours) => (
                  <Field
                    key={hours.weekday}
                    className="rounded-lg border p-3"
                  >
                    <FieldLabel className="text-base">
                      {currentDraft.mode === "sameEveryDay"
                        ? "Alle dage"
                        : weekdays[hours.weekday]}
                    </FieldLabel>
                    <HoursFields
                      id={`weekly-${hours.weekday}`}
                      label={
                        currentDraft.mode === "sameEveryDay"
                          ? "Alle dage"
                          : weekdays[hours.weekday]
                      }
                      hours={hours}
                      onChange={(next) =>
                        updateWeekly(hours.weekday, next)
                      }
                    />
                  </Field>
                ))}
              </FieldGroup>
            </FieldSet>

            <Separator />

            <FieldSet>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <FieldLegend>Særlige datoer</FieldLegend>
                  <FieldDescription>
                    Overskriv de faste tider på eksempelvis helligdage.
                  </FieldDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    currentDraft.specials.length >=
                    MAX_SPECIAL_OPENING_DATES
                  }
                  onClick={() =>
                    setDraft((current) => {
                      const source = draftFrom(current, settings);
                      return source
                        ? {
                            ...source,
                            specials: [
                              ...source.specials,
                              {
                                date: "",
                                closed: false,
                                openMinuteOfDay: 8 * 60,
                                closeMinuteOfDay: 22 * 60,
                              },
                            ],
                          }
                        : null;
                    })
                  }
                >
                  <PlusIcon data-icon="inline-start" />
                  Tilføj dato
                </Button>
              </div>

              {currentDraft.specials.length === 0 ? (
                <FieldDescription>
                  Ingen særlige åbningstider er tilføjet.
                </FieldDescription>
              ) : (
                <FieldGroup>
                  {currentDraft.specials.map((hours, index) => (
                    <Field
                      key={index}
                      className="rounded-lg border p-3"
                    >
                      <div className="flex items-end gap-2">
                        <Field className="min-w-0 flex-1">
                          <FieldLabel htmlFor={`special-${index}-date`}>
                            Dato
                          </FieldLabel>
                          <Input
                            id={`special-${index}-date`}
                            type="date"
                            className="h-11"
                            value={hours.date}
                            onChange={(event) =>
                              updateSpecial(index, {
                                date: event.target.value,
                              })
                            }
                          />
                        </Field>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-lg"
                          aria-label="Fjern særlig dato"
                          onClick={() =>
                            setDraft((current) => {
                              const source = draftFrom(current, settings);
                              return source
                                ? {
                                    ...source,
                                    specials: source.specials.filter(
                                      (_, position) => position !== index,
                                    ),
                                  }
                                : null;
                            })
                          }
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                      <HoursFields
                        id={`special-${index}`}
                        label={hours.date || "Særlig dato"}
                        hours={hours}
                        onChange={(next) => updateSpecial(index, next)}
                      />
                    </Field>
                  ))}
                </FieldGroup>
              )}
            </FieldSet>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Annullér
          </Button>
          <Button
            disabled={saving || !currentDraft}
            onClick={() => void save()}
          >
            {saving ? <Spinner data-icon="inline-start" /> : null}
            Gem åbningstider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
