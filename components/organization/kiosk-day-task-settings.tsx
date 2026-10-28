"use client";

import { useMutation, useQuery } from "convex/react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
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
import { useAccess, useLocationAccess, usePermission } from "@/components/app-shell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getUserErrorMessage } from "@/lib/user-errors";

type Phase = "endOfDay" | "startOfDay";
type Tasks = Record<Phase, string[]>;

const phases: { id: Phase; title: string; description: string }[] = [
  {
    id: "endOfDay",
    title: "Lukning",
    description: "Vises på kiosken, når lokationen har lukket.",
  },
  {
    id: "startOfDay",
    title: "Åbning",
    description: "Skal udføres efter lukning, før kiosken kan bruges igen.",
  },
];

function TaskList({
  phase,
  tasks,
  onChange,
}: {
  phase: (typeof phases)[number];
  tasks: string[];
  onChange: (tasks: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const task = draft.trim();
    if (!task) return;
    onChange([...tasks, task]);
    setDraft("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{phase.title}</CardTitle>
        <CardDescription>{phase.description}</CardDescription>
      </CardHeader>
      <CardContent appearance="compact" className="flex flex-col">
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ingen opgaver endnu.</p>
        ) : null}
        <ol className="flex flex-col gap-2">
          {tasks.map((task, index) => (
            <li key={index} className="flex items-center gap-2">
              <Input
                aria-label={`${phase.title}, opgave ${index + 1}`}
                value={task}
                maxLength={200}
                onChange={(event) =>
                  onChange(tasks.map((item, i) => (i === index ? event.target.value : item)))
                }
              />
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                aria-label={`Fjern opgave ${index + 1}`}
                onClick={() => onChange(tasks.filter((_, i) => i !== index))}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ol>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <Input
            aria-label={`Ny opgave til ${phase.title.toLowerCase()}`}
            placeholder="Ny opgave"
            value={draft}
            maxLength={200}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" variant="outline" size="lg" disabled={!draft.trim()}>
            <PlusIcon data-icon="inline-start" />
            Tilføj
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function TaskEditor({
  locationId,
  initial,
}: {
  locationId: Id<"locations">;
  initial: Tasks;
}) {
  const saveTasks = useMutation(api.kioskDay.saveTasks);
  const [tasks, setTasks] = useState(initial);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    try {
      await saveTasks({ locationId, ...tasks });
      toast.success("Dagsopgaverne er gemt");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Dagsopgaverne kunne ikke gemmes. Prøv igen."));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-2">
        {phases.map((phase) => (
          <TaskList
            key={phase.id}
            phase={phase}
            tasks={tasks[phase.id]}
            onChange={(next) => setTasks((current) => ({ ...current, [phase.id]: next }))}
          />
        ))}
      </div>
      <div>
        <Button size="lg" onClick={save} disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Gem dagsopgaver
        </Button>
      </div>
    </>
  );
}

export function KioskDayTaskSettings() {
  const access = useAccess();
  const canManage = usePermission("kiosk.dayTasks.manage");
  const { locations } = useLocationAccess();
  const [selected, setSelected] = useState<Id<"locations"> | null>(null);
  const locationId = selected ?? locations[0]?.id ?? null;
  const tasks = useQuery(
    api.kioskDay.getTasks,
    canManage && locationId ? { locationId } : "skip",
  );

  if (!access) return <Skeleton className="h-80 w-full" />;

  if (!canManage) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>Du har ikke adgang til at administrere dagsopgaver.</AlertDescription>
      </Alert>
    );
  }

  if (!locationId) {
    return (
      <Alert className="max-w-xl">
        <AlertTitle>Ingen lokationer</AlertTitle>
        <AlertDescription>Opret en lokation, før du tilføjer dagsopgaver.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-2xl text-sm text-muted-foreground">
        Opgaverne vises på lokationens kiosk. Når lukningen er udført, er kiosken låst, indtil åbningen er udført.
      </p>
      {locations.length > 1 ? (
        <Field className="max-w-sm">
          <FieldLabel htmlFor="day-task-location">Lokation</FieldLabel>
          <Select
            value={locationId}
            onValueChange={(value) => setSelected(value as Id<"locations">)}
            items={locations.map((location) => ({ value: location.id, label: location.name }))}
          >
            <SelectTrigger id="day-task-location" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      ) : null}
      {tasks === undefined ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <TaskEditor key={locationId} locationId={locationId} initial={tasks} />
      )}
    </div>
  );
}
