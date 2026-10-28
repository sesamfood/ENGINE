"use client";

import { useConvex, useMutation, useQuery } from "convex/react";
import { CopyIcon, LinkIcon, PlusIcon, Trash2Icon } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  KioskDayTaskIconView,
  kioskDayTaskIconOptions,
} from "@/components/kiosk/kiosk-day-task-icon";
import {
  kioskDayTaskIcons,
  type KioskDayTask,
  type KioskDayTaskIcon,
} from "@/lib/kiosk-day";
import { kioskDestination, kioskDestinations, type KioskDestinationId } from "@/lib/kiosk";
import { getUserErrorMessage } from "@/lib/user-errors";

function isKioskDestinationId(page: string): page is KioskDestinationId {
  return kioskDestinations.some((destination) => destination.id === page);
}

type Phase = "endOfDay" | "startOfDay";
type Tasks = Record<Phase, KioskDayTask[]>;
type LocationOption = { id: Id<"locations">; name: string };

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

const iconItems = kioskDayTaskIcons.map((icon) => ({
  value: icon,
  label: kioskDayTaskIconOptions[icon].label,
}));

function TaskRow({
  phase,
  index,
  task,
  linkablePages,
  onChange,
  onRemove,
}: {
  phase: (typeof phases)[number];
  index: number;
  task: KioskDayTask;
  linkablePages: KioskDestinationId[];
  onChange: (task: KioskDayTask) => void;
  onRemove: () => void;
}) {
  const id = `${phase.id}-task-${index}`;
  return (
    <li>
      <Field appearance="panel">
        <div className="flex items-center gap-2">
          <Select
            value={task.icon ?? "check"}
            onValueChange={(icon) => onChange({ ...task, icon: icon as KioskDayTaskIcon })}
            items={iconItems}
          >
            <SelectTrigger aria-label={`Ikon for opgave ${index + 1}`}>
              <SelectValue>
                <KioskDayTaskIconView icon={task.icon} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {kioskDayTaskIcons.map((icon) => (
                  <SelectItem key={icon} value={icon}>
                    <KioskDayTaskIconView icon={icon} />
                    {kioskDayTaskIconOptions[icon].label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Input
            id={id}
            aria-label={`${phase.title}, opgave ${index + 1}`}
            placeholder="Opgave"
            value={task.title}
            maxLength={200}
            onChange={(event) => onChange({ ...task, title: event.target.value })}
          />
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label={`Fjern opgave ${index + 1}`}
            onClick={onRemove}
          >
            <Trash2Icon />
          </Button>
        </div>
        <Textarea
          aria-label={`Beskrivelse af opgave ${index + 1}`}
          placeholder="Beskrivelse (valgfri)"
          rows={2}
          maxLength={1000}
          value={task.description ?? ""}
          onChange={(event) => onChange({ ...task, description: event.target.value })}
        />
        {linkablePages.length ? (
          <Select
            value={task.link ?? "none"}
            onValueChange={(link) =>
              onChange({
                ...task,
                link: link === "none" ? undefined : (link as KioskDestinationId),
              })
            }
            items={[
              { value: "none", label: "Ingen side" },
              ...linkablePages.map((page) => ({ value: page, label: kioskDestination(page).label })),
            ]}
          >
            <SelectTrigger aria-label={`Side for opgave ${index + 1}`} className="w-full">
              <LinkIcon />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="none">Ingen side</SelectItem>
                {linkablePages.map((page) => (
                  <SelectItem key={page} value={page}>
                    {kioskDestination(page).label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        ) : null}
      </Field>
    </li>
  );
}

function TaskList({
  phase,
  tasks,
  linkablePages,
  onChange,
}: {
  phase: (typeof phases)[number];
  tasks: KioskDayTask[];
  linkablePages: KioskDestinationId[];
  onChange: (tasks: KioskDayTask[]) => void;
}) {
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
        <ol className="flex flex-col gap-3">
          {tasks.map((task, index) => (
            <TaskRow
              key={index}
              phase={phase}
              index={index}
              task={task}
              linkablePages={linkablePages}
              onChange={(next) => onChange(tasks.map((item, i) => (i === index ? next : item)))}
              onRemove={() => onChange(tasks.filter((_, i) => i !== index))}
            />
          ))}
        </ol>
        <div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => onChange([...tasks, { title: "" }])}
          >
            <PlusIcon data-icon="inline-start" />
            Tilføj opgave
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TaskEditor({
  locationId,
  initial,
  otherLocations,
  linkablePages,
}: {
  locationId: Id<"locations">;
  initial: Tasks;
  otherLocations: LocationOption[];
  linkablePages: KioskDestinationId[];
}) {
  const convex = useConvex();
  const saveTasks = useMutation(api.kioskDay.saveTasks);
  const [tasks, setTasks] = useState(initial);
  const [pending, setPending] = useState(false);
  const [copying, setCopying] = useState(false);

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

  async function copyFrom(source: LocationOption) {
    setCopying(true);
    try {
      setTasks(await convex.query(api.kioskDay.getTasks, { locationId: source.id }));
      toast.success(`Opgaverne er kopieret fra ${source.name}. Gem for at anvende dem.`);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Opgaverne kunne ikke kopieres. Prøv igen."));
    } finally {
      setCopying(false);
    }
  }

  return (
    <>
      {otherLocations.length ? (
        <div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="lg" disabled={copying} />}
            >
              {copying ? <Spinner data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
              Kopiér fra lokation
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Erstat begge lister med</DropdownMenuLabel>
                {otherLocations.map((location) => (
                  <DropdownMenuItem key={location.id} onClick={() => void copyFrom(location)}>
                    {location.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        {phases.map((phase) => (
          <TaskList
            key={phase.id}
            phase={phase}
            tasks={tasks[phase.id]}
            linkablePages={linkablePages}
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
  const linkablePages = useQuery(api.kioskDay.getLinkablePages, canManage ? {} : "skip");

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
      {tasks === undefined || linkablePages === undefined ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <TaskEditor
          key={locationId}
          locationId={locationId}
          initial={tasks}
          otherLocations={locations.filter((location) => location.id !== locationId)}
          linkablePages={linkablePages.filter(isKioskDestinationId)}
        />
      )}
    </div>
  );
}
