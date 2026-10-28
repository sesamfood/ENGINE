"use client";

import { useMutation } from "convex/react";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { KioskDayTaskIconView } from "@/components/kiosk/kiosk-day-task-icon";
import type { KioskDayTask } from "@/lib/kiosk-day";
import { Spinner } from "@/components/ui/spinner";
import { useHomeDestination, useKiosk, useKioskDay } from "@/components/app-shell";
import { kioskDestination } from "@/lib/kiosk";
import { api } from "@/convex/_generated/api";
import { getUserErrorMessage } from "@/lib/user-errors";

const copy = {
  endOfDay: {
    title: "Lukning",
    description: "Udfør opgaverne, før lokationen lukkes for i dag.",
    action: "Afslut lukning",
    done: "Lukningen er registreret",
  },
  startOfDay: {
    title: "Åbning",
    description: "Udfør opgaverne for at låse kiosken op.",
    action: "Afslut åbning",
    done: "Åbningen er registreret",
  },
};

function Checklist({
  phase,
  tasks,
  forceEndOfDay,
  onCompleted,
}: {
  phase: keyof typeof copy;
  tasks: KioskDayTask[];
  forceEndOfDay: boolean; // TEMP: testing
  onCompleted: () => void;
}) {
  const complete = useMutation(api.kioskDay.complete);
  const enabledPages = useKiosk()?.settings?.enabledPages ?? [];
  // Kept in session storage so ticks survive a visit to a linked page.
  const storageKey = `engine.kiosk-day.${phase}.${tasks.map((task) => task.title).join("\n")}`;
  const [checked, setCheckedState] = useState<number[]>(() => {
    try {
      const stored: unknown = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "[]");
      return Array.isArray(stored)
        ? stored.filter((index): index is number => Number.isInteger(index) && index < tasks.length)
        : [];
    } catch {
      return [];
    }
  });
  function setChecked(update: (current: number[]) => number[]) {
    setCheckedState((current) => {
      const next = update(current);
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  const [pending, setPending] = useState(false);
  const text = copy[phase];
  const allDone = checked.length === tasks.length;

  async function submit() {
    setPending(true);
    try {
      await complete({ phase, tasks: tasks.map((task) => task.title), forceEndOfDay });
      try {
        window.sessionStorage.removeItem(storageKey);
      } catch {}
      onCompleted();
      toast.success(text.done);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Opgaverne kunne ikke registreres. Prøv igen."));
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{text.title}</h1>
        <p className="text-muted-foreground">{text.description}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {tasks.map((task, index) => (
          <li key={index} className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <FieldLabel htmlFor={`day-task-${index}`} appearance="large">
              <Field orientation="horizontal">
                <Checkbox
                  id={`day-task-${index}`}
                  checked={checked.includes(index)}
                  onCheckedChange={(value) =>
                    setChecked((current) =>
                      value ? [...current, index] : current.filter((i) => i !== index),
                    )
                  }
                />
                <KioskDayTaskIconView icon={task.icon} />
                <FieldContent>
                  <FieldTitle>{task.title}</FieldTitle>
                  {task.description ? (
                    <FieldDescription>{task.description}</FieldDescription>
                  ) : null}
                </FieldContent>
              </Field>
            </FieldLabel>
            {task.link && enabledPages.includes(task.link) ? (
              <Button
                variant="outline"
                size="lg"
                render={<Link href={kioskDestination(task.link).route} />}
                nativeButton={false}
              >
                {kioskDestination(task.link).label}
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-4">
        <Button size="lg" disabled={!allDone || pending} onClick={submit}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {text.action}
        </Button>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {checked.length} af {tasks.length} udført
        </p>
      </div>
    </main>
  );
}

export function KioskDayTasks() {
  const day = useKioskDay();
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
    <Checklist
      key={`${day.phase}:${day.tasks.map((task) => task.title).join("\n")}`}
      phase={day.phase}
      tasks={day.tasks}
      forceEndOfDay={day.forceEndOfDay}
      onCompleted={() => day.setForceEndOfDay(false)}
    />
  );
}
