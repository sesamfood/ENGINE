"use client";

import { useAction, useQuery } from "convex/react";
import { RefreshCwIcon, UsersRoundIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type Shift = {
  id: string;
  employeeId: string;
  employeeName: string;
  imageUrl: string | null;
  start: number;
  end: number;
};

type DailyResult = {
  locations: Array<{
    locationId: Id<"locations">;
    locationName: string;
    departmentName: string;
    shifts: Shift[];
  }>;
};

const timeFormatter = new Intl.DateTimeFormat("da-DK", {
  hour: "2-digit",
  minute: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
  timeStyle: "short",
});

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateInput(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayRange(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = new Date(year, month - 1, day);
  if (
    start.getFullYear() !== year ||
    start.getMonth() !== month - 1 ||
    start.getDate() !== day
  ) {
    return null;
  }
  const end = new Date(year, month - 1, day + 1);
  return { from: start.getTime(), to: end.getTime() };
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

function shiftTime(shift: Shift) {
  const start = new Date(shift.start);
  const end = new Date(shift.end);
  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()
  ) {
    return `${timeFormatter.format(start)}–${timeFormatter.format(end)}`;
  }
  return `${dateTimeFormatter.format(start)} – ${dateTimeFormatter.format(end)}`;
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

function LocationCard({
  location,
  now,
  selectedToday,
}: {
  location: DailyResult["locations"][number];
  now: number;
  selectedToday: boolean;
}) {
  const employeeCount = new Set(
    location.shifts.map((shift) => shift.employeeId),
  ).size;
  const workingNow = new Set(
    location.shifts
      .filter((shift) => shift.start <= now && now < shift.end)
      .map((shift) => shift.employeeId),
  ).size;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{location.locationName}</CardTitle>
        <CardDescription>
          {location.departmentName} · {employeeCount} planlagt
        </CardDescription>
        <CardAction>
          <Badge
            variant={
              selectedToday && workingNow > 0 ? "default" : "secondary"
            }
          >
            {selectedToday
              ? `${workingNow} på arbejde nu`
              : `${employeeCount} medarbejdere`}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {location.shifts.length === 0 ? (
          <Empty className="min-h-40">
            <EmptyHeader>
              <EmptyTitle>Ingen planlagte medarbejdere</EmptyTitle>
              <EmptyDescription>
                Der er ingen udgivne Workfeed-vagter denne dag.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medarbejder</TableHead>
                <TableHead>Vagt</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {location.shifts.map((shift) => {
                const working = shift.start <= now && now < shift.end;
                return (
                  <TableRow key={shift.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          {shift.imageUrl ? (
                            <AvatarImage
                              src={shift.imageUrl}
                              alt={shift.employeeName}
                            />
                          ) : null}
                          <AvatarFallback>
                            {initials(shift.employeeName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">
                          {shift.employeeName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>{shiftTime(shift)}</TableCell>
                    <TableCell>
                      <Badge variant={working ? "default" : "outline"}>
                        {working ? "På arbejde" : "Planlagt"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function EmployeesContent() {
  const enabled = useQuery(api.workfeed.isEnabled);
  const listDailyEmployees = useAction(api.workfeed.listDailyEmployees);
  const [date, setDate] = useState(() => dateInput());
  const [result, setResult] = useState<DailyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(
    async (dateValue: string) => {
      const range = dayRange(dateValue);
      if (!range) {
        setLoading(false);
        setFailed(true);
        toast.error("Vælg en gyldig dato");
        return;
      }
      setLoading(true);
      setFailed(false);
      try {
        setResult(await listDailyEmployees(range));
      } catch (error) {
        setResult(null);
        setFailed(true);
        toast.error(messageFrom(error));
      } finally {
        setLoading(false);
      }
    },
    [listDailyEmployees],
  );

  useEffect(() => {
    const range = dayRange(date);
    if (!enabled || !range) return;
    let cancelled = false;
    void listDailyEmployees(range)
      .then((nextResult) => {
        if (!cancelled) setResult(nextResult);
      })
      .catch((error) => {
        if (cancelled) return;
        setResult(null);
        setFailed(true);
        toast.error(messageFrom(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, enabled, listDailyEmployees]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const selectedToday = date === dateInput(new Date(now));
  const totalWorkingNow = useMemo(
    () =>
      new Set(
        (result?.locations ?? []).flatMap((location) =>
          location.shifts
            .filter((shift) => shift.start <= now && now < shift.end)
            .map((shift) => shift.employeeId),
        ),
      ).size,
    [now, result],
  );

  if (enabled === undefined) return <Skeleton className="h-96 w-full" />;

  if (!enabled) {
    return (
      <Empty className="min-h-80">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersRoundIcon />
          </EmptyMedia>
          <EmptyTitle>Workfeed er ikke aktiveret</EmptyTitle>
          <EmptyDescription>
            En administrator skal aktivere Workfeed og koble lokationerne til
            afdelinger.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Vælg dag</CardTitle>
          <CardDescription>
            Se udgivne vagter fra Workfeed. Antallet på arbejde opdateres
            automatisk.
          </CardDescription>
          {selectedToday ? (
            <CardAction>
              <Badge>{totalWorkingNow} på arbejde nu</Badge>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid sm:grid-cols-[1fr_auto] sm:items-end">
            <Field>
              <FieldLabel htmlFor="workfeed-date">Dato</FieldLabel>
              <Input
                id="workfeed-date"
                type="date"
                value={date}
                onChange={(event) => {
                  const nextDate = event.target.value;
                  setDate(nextDate);
                  setResult(null);
                  setFailed(!dayRange(nextDate));
                  setLoading(Boolean(dayRange(nextDate)));
                }}
                className="h-11"
              />
            </Field>
            <Button disabled={loading} onClick={() => void load(date)}>
              {loading ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RefreshCwIcon data-icon="inline-start" />
              )}
              Opdatér
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>

      {failed ? (
        <Alert variant="destructive" className="max-w-xl">
          <AlertTitle>Vagtplanen kunne ikke indlæses</AlertTitle>
          <AlertDescription>
            Kontrollér forbindelsen, og prøv igen.
          </AlertDescription>
        </Alert>
      ) : loading && !result ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : result?.locations.length === 0 ? (
        <Empty className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersRoundIcon />
            </EmptyMedia>
            <EmptyTitle>Ingen lokationer er koblet</EmptyTitle>
            <EmptyDescription>
              En administrator skal koble mindst én lokation til en
              Workfeed-afdeling.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {result?.locations.map((location) => (
            <LocationCard
              key={location.locationId}
              location={location}
              now={now}
              selectedToday={selectedToday}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkfeedEmployees() {
  return (
    <section className="mx-auto w-full max-w-[96rem]">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Workfeed
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Medarbejdere
        </h1>
      </header>
      <div className="mt-8">
        <OrganizationAuthGate>
          <EmployeesContent />
        </OrganizationAuthGate>
      </div>
    </section>
  );
}
