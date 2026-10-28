"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ArrowRightIcon,
  CalendarIcon,
  CircleCheckIcon,
  CircleIcon,
  ClockIcon,
  MapPinIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CreatableCombobox } from "@/components/catalog/creatable-combobox";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useHomeDestination, useKiosk, useKioskDay } from "@/components/app-shell";
import { KioskDayTaskIconView } from "@/components/kiosk/kiosk-day-task-icon";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { dateTimeFormatter } from "@/lib/date";
import { kioskDestination } from "@/lib/kiosk";
import type { KioskDayTask } from "@/lib/kiosk-day";
import { getUserErrorMessage } from "@/lib/user-errors";

const copy = {
  endOfDay: {
    title: "Lukning",
    description: "Gennemfør alle opgaver, før lokationen lukkes for i dag.",
    timeLabel: "Lukketid",
    confirm: "Når alle punkter er gennemført, bekræft nedenfor for at registrere lukningen.",
    done: "Lukningen er registreret",
  },
  startOfDay: {
    title: "Åbning",
    description: "Gennemfør alle opgaver inden åbning af lokationen.",
    timeLabel: "Åbningstid",
    confirm: "Når alle punkter er gennemført, bekræft nedenfor for at registrere åbningen.",
    done: "Åbningen er registreret",
  },
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </p>
  );
}

function useStoredChecks(storageKey: string, taskCount: number) {
  // Kept in session storage so ticks survive a visit to a linked page.
  const [checked, setCheckedState] = useState<number[]>(() => {
    try {
      const stored: unknown = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "[]");
      return Array.isArray(stored)
        ? stored.filter((index): index is number => Number.isInteger(index) && index < taskCount)
        : [];
    } catch {
      return [];
    }
  });
  function toggle(index: number) {
    setCheckedState((current) => {
      const next = current.includes(index)
        ? current.filter((i) => i !== index)
        : [...current, index];
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  function clear() {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {}
  }
  return { checked, toggle, clear };
}

function TaskRow({
  index,
  task,
  done,
  showLink,
  preview,
  onToggle,
}: {
  index: number;
  task: KioskDayTask;
  done: boolean;
  showLink: boolean;
  preview: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold">
          {index + 1}
        </span>
        <span className="grid size-12 shrink-0 place-items-center rounded-lg border text-primary [&_svg]:size-6">
          <KioskDayTaskIconView icon={task.icon} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-semibold uppercase">{task.title}</p>
          {task.description ? (
            <p className="text-sm text-muted-foreground">{task.description}</p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:shrink-0">
        {showLink && task.link ? (
          <Button
            variant="outline"
            size="lg"
            // Links stay inert in preview so unsaved settings are not lost.
            {...(preview
              ? { disabled: true }
              : { render: <Link href={kioskDestination(task.link).route} />, nativeButton: false })}
          >
            {kioskDestination(task.link).label}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        ) : null}
        <Button
          variant={done ? "default" : "outline"}
          size="lg"
          aria-pressed={done}
          aria-label={`${task.title}: ${done ? "udført" : "markér som udført"}`}
          onClick={onToggle}
        >
          {done ? "Udført" : "Markér som udført"}
          {done ? <CircleCheckIcon data-icon="inline-end" /> : <CircleIcon data-icon="inline-end" />}
        </Button>
      </div>
    </li>
  );
}

function Checklist({
  phase,
  tasks,
  scheduledAt,
  timeZone,
  locationName,
  enabledPages,
  preview = false,
}: {
  phase: keyof typeof copy;
  tasks: KioskDayTask[];
  scheduledAt: number | null;
  timeZone: string | null;
  locationName: string | null;
  enabledPages: string[];
  preview?: boolean;
}) {
  const complete = useMutation(api.kioskDay.complete);
  const [openedAt] = useState(Date.now);
  const people = useQuery(
    api.kioskDay.listResponsibleEmployees,
    preview ? "skip" : { now: openedAt },
  );
  const { checked, toggle, clear } = useStoredChecks(
    `engine.kiosk-day.${preview ? "preview." : ""}${phase}.${tasks.map((task) => task.title).join("\n")}`,
    tasks.length,
  );
  // An employee id, or "new:<name>" for a typed name.
  const [responsible, setResponsible] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const text = copy[phase];
  const allDone = checked.length === tasks.length;
  const zone = timeZone ?? undefined;
  const shiftTime = dateTimeFormatter("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: zone });

  async function submit() {
    if (!responsible) return;
    setPending(true);
    try {
      await complete({
        phase,
        tasks: tasks.map((task) => task.title),
        responsible: responsible.startsWith("new:")
          ? { name: responsible.slice(4) }
          : { employeeId: responsible as Id<"employees"> },
      });
      clear();
      toast.success(text.done);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Opgaverne kunne ikke registreres. Prøv igen."));
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-semibold tracking-tight uppercase">{text.title}</h1>
          <p className="text-muted-foreground">{text.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {locationName ? (
            <div className="flex flex-col gap-0.5 rounded-lg border bg-card px-3 py-2">
              <Eyebrow>Lokation</Eyebrow>
              <p className="flex items-center gap-1.5 font-semibold uppercase">
                <MapPinIcon aria-hidden="true" className="size-4 text-primary" />
                {locationName}
              </p>
            </div>
          ) : null}
          <div className="flex flex-col gap-0.5 rounded-lg border bg-card px-3 py-2">
            <Eyebrow>Dato</Eyebrow>
            <p className="flex items-center gap-1.5 font-medium">
              <CalendarIcon aria-hidden="true" className="size-4 text-primary" />
              {dateTimeFormatter("da-DK", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: zone,
              }).format(openedAt)}
            </p>
          </div>
        </div>
      </header>

      <Card spacing="relaxed">
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex flex-1 flex-col gap-2">
              <Eyebrow>Dagens status</Eyebrow>
              <p className="text-sm" aria-live="polite">
                <span className="font-semibold text-primary">
                  {checked.length} / {tasks.length}
                </span>{" "}
                gennemført
              </p>
              <div
                role="progressbar"
                aria-label="Gennemførte opgaver"
                aria-valuemin={0}
                aria-valuemax={tasks.length}
                aria-valuenow={checked.length}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full w-(--progress) rounded-full bg-primary transition-all"
                  style={{ "--progress": `${(checked.length / Math.max(tasks.length, 1)) * 100}%` } as React.CSSProperties}
                />
              </div>
            </div>
            {scheduledAt ? (
              <div className="flex items-center gap-3 border-t pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
                <ClockIcon aria-hidden="true" className="size-6" />
                <div className="flex flex-col">
                  <Eyebrow>{text.timeLabel}</Eyebrow>
                  <p className="text-2xl font-semibold tabular-nums">
                    {dateTimeFormatter("da-DK", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: zone,
                    }).format(scheduledAt)}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="day-tasks-heading">
        <h2 id="day-tasks-heading" className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Opgaver
        </h2>
        <Card appearance="product">
          <ol className="divide-y">
            {tasks.map((task, index) => (
              <TaskRow
                key={index}
                index={index}
                task={task}
                done={checked.includes(index)}
                showLink={Boolean(task.link && enabledPages.includes(task.link))}
                preview={preview}
                onToggle={() => toggle(index)}
              />
            ))}
          </ol>
        </Card>
      </section>

      <Card spacing="relaxed">
        <CardContent>
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex flex-1 flex-col gap-1">
              <Eyebrow>Bekræftelse</Eyebrow>
              <p className="text-sm text-muted-foreground">{text.confirm}</p>
            </div>
            <Field className="md:w-72">
              <FieldLabel>Godkendt af</FieldLabel>
              <CreatableCombobox
                options={(people?.employees ?? []).map((person) => ({
                  value: person.id,
                  label: person.name,
                }))}
                suggestionLabel="På vagt"
                suggestionOptions={(people?.onShift ?? []).map((person) => ({
                  value: person.id,
                  label: `${person.name} · ${shiftTime.formatRange(person.startsAt, person.endsAt)}`,
                }))}
                allowCreate
                value={responsible}
                onValueChange={setResponsible}
                placeholder="Vælg medarbejder"
                ariaLabel="Godkendt af"
                disabled={preview || people === undefined}
              />
            </Field>
            <Button
              size="lg"
              disabled={preview || !allDone || !responsible || pending}
              onClick={submit}
            >
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Bekræft og gem
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Shows the kiosk checklist for unsaved tasks without registering anything.
export function KioskDayChecklistPreview({
  phase,
  tasks,
  locationName,
  enabledPages,
}: {
  phase: keyof typeof copy;
  tasks: KioskDayTask[];
  locationName: string | null;
  enabledPages: string[];
}) {
  return (
    <Checklist
      preview
      phase={phase}
      tasks={tasks}
      scheduledAt={null}
      timeZone={null}
      locationName={locationName}
      enabledPages={enabledPages}
    />
  );
}

export function KioskDayTasks() {
  const day = useKioskDay();
  const kiosk = useKiosk();
  const home = useHomeDestination();
  const router = useRouter();
  const phase = day?.phase ?? null;

  useEffect(() => {
    if (!phase && home) router.replace(home);
  }, [home, phase, router]);

  if (!day?.phase) {
    return (
      <main className="grid min-h-64 place-items-center" aria-label="Åbner startsiden">
        <Spinner className="size-5" />
      </main>
    );
  }

  return (
    <main>
      <Checklist
        key={`${day.phase}:${day.tasks.map((task) => task.title).join("\n")}`}
        phase={day.phase}
        tasks={day.tasks}
        scheduledAt={day.scheduledAt}
        timeZone={day.timeZone}
        locationName={kiosk?.locationName ?? null}
        enabledPages={kiosk?.settings?.enabledPages ?? []}
      />
    </main>
  );
}
