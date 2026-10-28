"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useHomeDestination, useKioskDay } from "@/components/app-shell";
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
  tasks: string[];
  forceEndOfDay: boolean; // TEMP: testing
  onCompleted: () => void;
}) {
  const complete = useMutation(api.kioskDay.complete);
  const [checked, setChecked] = useState<number[]>([]);
  const [pending, setPending] = useState(false);
  const text = copy[phase];
  const allDone = checked.length === tasks.length;

  async function submit() {
    setPending(true);
    try {
      await complete({ phase, tasks, forceEndOfDay });
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
          <li key={index}>
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
                <FieldContent>
                  <FieldTitle>{task}</FieldTitle>
                </FieldContent>
              </Field>
            </FieldLabel>
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
      key={`${day.phase}:${day.tasks.join("\n")}`}
      phase={day.phase}
      tasks={day.tasks}
      forceEndOfDay={day.forceEndOfDay}
      onCompleted={() => day.setForceEndOfDay(false)}
    />
  );
}
