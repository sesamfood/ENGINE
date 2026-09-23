"use client";

import { useIntegrations } from "@/integrations/use-integrations";

import { dateKey, addDays, dateTimeFormatter } from "@/lib/date";

import { selectedLocationId } from "@/lib/location-preference";

import { AppBottomBar } from "@/components/app-bottom-bar";
import { cn } from "@/lib/utils";
import { AppPageHeader } from "@/components/app-page-header";

import { EmployeeAvatar } from "@/components/employees/employee-avatar";
import { EmployeeEditor, type DirectoryEmployee } from "@/components/employees/employee-editor";

import {
  useKiosk,
  useLocationAccess,
  usePermission,
} from "@/components/app-shell";
import { LocationField } from "@/components/location-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { setEmployeeLocation, useEmployeeLocation } from "@/lib/employee-prefs";
import { getUserErrorMessage } from "@/lib/user-errors";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  AlertTriangleIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Clock3Icon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  UsersRoundIcon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

function mondayFor(timestamp: number, timeZone: string) {
  const current = dateKey(timestamp, timeZone);
  const weekday = new Date(`${current}T00:00:00Z`).getUTCDay();
  return addDays(current, -(weekday === 0 ? 6 : weekday - 1));
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions) {
  return dateTimeFormatter("da-DK", {
    timeZone: "UTC",
    ...options,
  }).format(new Date(`${value}T12:00:00Z`));
}

type Shift = {
  id: Id<"scheduledShifts">;
  startsAt: number;
  endsAt: number;
  roleName: string | null;
  date: string;
};

function ShiftBlock({ shift, timeZone }: { shift: Shift; timeZone: string }) {
  const time = dateTimeFormatter("da-DK", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
  const endDate = dateKey(shift.endsAt, timeZone);
  const overnight = endDate !== shift.date;
  return (
    <div className="min-w-0 whitespace-normal rounded-lg border bg-muted/40 px-2.5 py-2 text-xs leading-snug">
      <div className="whitespace-nowrap font-medium tabular-nums">
        {time.format(shift.startsAt)}–{time.format(shift.endsAt)}
      </div>
      {shift.roleName ? (
        <div className="mt-0.5 truncate text-muted-foreground">
          {shift.roleName}
        </div>
      ) : null}
      {overnight ? (
        <div className="mt-1 break-words text-muted-foreground">
          Slutter {formatDate(endDate, { weekday: "short" }).replace(".", "")}{" "}
          kl. {time.format(shift.endsAt)}
        </div>
      ) : null}
    </div>
  );
}

function ScheduleTab({
  locationId,
  hasLocations,
  syncButton,
  timeZone,
}: {
  locationId: Id<"locations"> | null;
  hasLocations: boolean;
  syncButton: ReactNode;
  timeZone: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const currentMonday = mondayFor(now, timeZone);
  const [weekStart, setWeekStart] = useState(currentMonday);
  const [selectedDate, setSelectedDate] = useState(() => dateKey(now, timeZone));
  const week = useQuery(
    api.employees.listWeek,
    locationId ? { locationId, weekStart } : "skip",
  );
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  if (!hasLocations) {
    return (
      <Empty appearance="outlined" className="min-h-72">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarDaysIcon />
          </EmptyMedia>
          <EmptyTitle>Ingen lokationer endnu</EmptyTitle>
          <EmptyDescription>
            Opret en lokation i organisationen for at se vagtplanen.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const scheduledEmployees = week?.employees.filter((employee) => employee.shifts.some((shift) => shift.date === selectedDate)) ?? [];
  const offDutyEmployees = week?.employees.filter((employee) => !employee.shifts.some((shift) => shift.date === selectedDate)) ?? [];

  const selectWeek = (value: string) => {
    setWeekStart(value);
    setSelectedDate(value === currentMonday ? dateKey(now, timeZone) : value);
  };
  const goToWeek = (value: string) => {
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(date.getTime()))
      selectWeek(mondayFor(date.getTime(), "UTC"));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => selectWeek(addDays(weekStart, -7))}
          aria-label="Forrige uge"
        >
          <ChevronLeftIcon />
        </Button>
        <Button variant="outline" onClick={() => selectWeek(currentMonday)}>
          Denne uge
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => selectWeek(addDays(weekStart, 7))}
          aria-label="Næste uge"
        >
          <ChevronRightIcon />
        </Button>
        <Input
          className="h-9 w-40"
          type="date"
          value={weekStart}
          onChange={(event) => goToWeek(event.target.value)}
          aria-label="Vælg uge"
        />
        {syncButton}
      </div>

      {week === undefined ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          {week.limitReached ? (
            <Alert>
              <AlertTriangleIcon />
              <AlertTitle>Visningen er afgrænset</AlertTitle>
              <AlertDescription>
                Der er flere medarbejdere eller vagter i ugen, end denne visning
                kan vise.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="hidden rounded-xl border md:block">
            <Table className="min-w-(--spacing-schedule) table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead appearance="muted" className="w-52">
                    Medarbejder
                  </TableHead>
                  {week.dates.map((date) => (
                    <TableHead
                      key={date}
                      appearance={
                        date === dateKey(now, timeZone) ? "currentDay" : "day"
                      }
                      className="text-center"
                    >
                      <span className="capitalize">
                        {formatDate(date, { weekday: "short" })}
                      </span>
                      <span className="ml-1 text-muted-foreground">
                        {formatDate(date, { day: "numeric", month: "short" })}
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {week.employees.map((employee) => {
                  const working = employee.shifts.some(
                    (shift) => shift.startsAt <= now && shift.endsAt > now,
                  );
                  return (
                    <TableRow key={employee.id}>
                      <TableCell appearance="surface" className="align-top">
                        <div className="flex items-center gap-3">
                          <EmployeeAvatar
                            name={employee.displayName}
                            imageUrl={employee.imageUrl}
                          />
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {employee.displayName}
                            </div>
                            {working ? (
                              <Badge className="mt-1" variant="secondary">
                                På arbejde nu
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      {week.dates.map((date) => (
                        <TableCell
                          key={date}
                          appearance={
                            date === dateKey(now, timeZone)
                              ? "currentDay"
                              : "day"
                          }
                          className="h-24 align-top"
                        >
                          <div className="flex flex-col gap-2">
                            {employee.shifts
                              .filter((shift) => shift.date === date)
                              .map((shift) => (
                                <ShiftBlock
                                  key={shift.id}
                                  shift={shift}
                                  timeZone={timeZone}
                                />
                              ))}
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {!week.employees.length ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Ingen medarbejdere er tilknyttet lokationen i denne uge.
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            <ToggleGroup
              value={[selectedDate]}
              onValueChange={(value) => value[0] && setSelectedDate(value[0])}
              variant="outline"
              spacing={0}
              className="grid w-full grid-cols-7"
            >
              {week.dates.map((date) => (
                <ToggleGroupItem
                  key={date}
                  value={date}
                  appearance="day"
                  className="h-12 min-w-0 flex-col"
                >
                  <span className="text-2xs capitalize">
                    {formatDate(date, { weekday: "short" }).slice(0, 2)}
                  </span>
                  <span>{formatDate(date, { day: "numeric" })}</span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {scheduledEmployees.map((employee) => {
              const shifts = employee.shifts.filter(
                (shift) => shift.date === selectedDate,
              );
              const working = selectedDate === dateKey(now, timeZone) && employee.shifts.some(
                (shift) => shift.startsAt <= now && shift.endsAt > now,
              );
              return (
                <Card key={employee.id} size="sm">
                  <CardContent appearance="compact" className="flex">
                    <EmployeeAvatar
                      name={employee.displayName}
                      imageUrl={employee.imageUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {employee.displayName}
                        </span>
                        {working ? (
                          <Badge variant="secondary">På arbejde nu</Badge>
                        ) : null}
                      </div>
                      {shifts.length ? (
                        <div className="mt-3 flex flex-col gap-2">
                          {shifts.map((shift) => (
                            <ShiftBlock
                              key={shift.id}
                              shift={shift}
                              timeZone={timeZone}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Ingen vagt
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {!scheduledEmployees.length ? (
              <p className="py-4 text-sm text-muted-foreground">Ingen vagter denne dag.</p>
            ) : null}
            {offDutyEmployees.length > 0 ? (
              <Accordion>
                <AccordionItem value="off-duty">
                  <AccordionTrigger className="min-h-11">
                    Ingen vagt · {offDutyEmployees.length}
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="flex flex-col gap-3">
                      {offDutyEmployees.map((employee) => (
                        <li key={employee.id} className="flex items-center gap-3">
                          <EmployeeAvatar name={employee.displayName} imageUrl={employee.imageUrl} />
                          <span>{employee.displayName}</span>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function DirectoryTab({
  locationId,
  syncButton,
}: {
  locationId: Id<"locations"> | null;
  syncButton: ReactNode;
}) {
  const kiosk = useKiosk();
  const canManage = usePermission("organization.settings") && !kiosk?.kioskModeEnabled;
  const [editing, setEditing] = useState<DirectoryEmployee | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [querySearch, setQuerySearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const { results, status, loadMore } = usePaginatedQuery(
    api.employees.listDirectory,
    locationId ? { locationId, search: querySearch, activeOnly } : "skip",
    { initialNumItems: 30 },
  );
  useEffect(() => {
    const timeout = window.setTimeout(() => setQuerySearch(search), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);
  if (!locationId) {
    return (
      <Empty appearance="outlined" className="min-h-64">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersRoundIcon />
          </EmptyMedia>
          <EmptyTitle>Ingen lokation valgt</EmptyTitle>
          <EmptyDescription>
            Vælg en lokation for at se dens medarbejdere.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <InputGroup className="h-11 w-full sm:w-80">
            <InputGroupInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Søg efter medarbejder"
              aria-label="Søg efter medarbejder"
            />
            <InputGroupAddon align="inline-start">
              <SearchIcon />
            </InputGroupAddon>
          </InputGroup>
          {syncButton}
          {canManage ? (
            <Button className="min-h-11" onClick={() => setEditing("new")}>
              <PlusIcon data-icon="inline-start" />
              Opret medarbejder
            </Button>
          ) : null}
        </div>
        <ToggleGroup
          value={[activeOnly ? "active" : "all"]}
          onValueChange={(value) =>
            value[0] && setActiveOnly(value[0] === "active")
          }
          variant="outline"
          spacing={0}
        >
          <ToggleGroupItem value="active">Aktive</ToggleGroupItem>
          <ToggleGroupItem value="all">Alle</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {status === "LoadingFirstPage" ? (
        <Skeleton className="h-72 w-full" />
      ) : results.length ? (
        <>
          <div className="hidden overflow-hidden rounded-xl border sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medarbejder</TableHead>
                  <TableHead>Lokationer</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                  {canManage ? <TableHead className="w-14"><span className="sr-only">Handlinger</span></TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <EmployeeAvatar
                          name={employee.displayName}
                          imageUrl={employee.imageUrl}
                        />
                        <div>
                          <div className="font-medium">
                            {employee.displayName}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground sm:hidden">
                            {employee.locations
                              .map((location) => location.name)
                              .join(", ") || "Ingen lokation"}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell appearance="muted" className="hidden sm:table-cell">
                      {employee.locations
                        .map((location) => location.name)
                        .join(", ") || "Ingen lokation"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={employee.active ? "secondary" : "outline"}
                      >
                        {employee.active ? "Aktiv" : "Inaktiv"}
                      </Badge>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        {employee.managedLocally ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-11"
                            aria-label={`Redigér ${employee.displayName}`}
                            onClick={() => setEditing(employee)}
                          >
                            <PencilIcon />
                          </Button>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-2 sm:hidden">
            {results.map((employee) => (
              <Card key={employee.id} size="sm">
                <CardContent appearance="compact" className="flex items-start">
                  <EmployeeAvatar
                    name={employee.displayName}
                    imageUrl={employee.imageUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{employee.displayName}</div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {employee.locations
                        .map((location) => location.name)
                        .join(", ") || "Ingen lokation"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={employee.active ? "secondary" : "outline"}>
                      {employee.active ? "Aktiv" : "Inaktiv"}
                    </Badge>
                    {canManage && employee.managedLocally ? (
                      <Button
                        variant="outline"
                        className="min-h-11"
                        aria-label={`Redigér ${employee.displayName}`}
                        onClick={() => setEditing(employee)}
                      >
                        <PencilIcon data-icon="inline-start" />
                        Redigér
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Empty appearance="outlined" className="min-h-64">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersRoundIcon />
            </EmptyMedia>
            <EmptyTitle>Ingen medarbejdere fundet</EmptyTitle>
            <EmptyDescription>
              {search
                ? "Prøv en anden søgning."
                : canManage
                  ? "Opret en medarbejder på den valgte lokation."
                  : "Der er ingen medarbejdere på den valgte lokation."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {status === "CanLoadMore" ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => loadMore(30)}>
            Vis flere
          </Button>
        </div>
      ) : null}
      {status === "LoadingMore" ? (
        <div className="flex justify-center">
          <Spinner />
        </div>
      ) : null}
      {canManage && editing ? (
        <EmployeeEditor
          employee={editing === "new" ? undefined : editing}
          locationId={locationId}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

export function EmployeeScheduling() {
  const integrations = useIntegrations();
  const organization = authClient.useActiveOrganization();
  const pathname = usePathname();
  const router = useRouter();
  const organizationId = organization.data?.id;
  const context = useQuery(api.employees.getContext);
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const kiosk = useKiosk();
  const canSchedule =
    usePermission("employees.schedule") ||
    Boolean(
      kiosk?.kioskModeEnabled &&
      kiosk.settings?.enabledPages.includes("employees.schedule"),
    );
  const canDirectory =
    usePermission("employees.directory") ||
    Boolean(
      kiosk?.kioskModeEnabled &&
      kiosk.settings?.enabledPages.includes("employees.directory"),
    );
  const requestSync = useMutation(api.employees.requestWorkfeedSync);
  const selectedTab =
    canDirectory && (!canSchedule || pathname === "/employees/directory")
      ? "directory"
      : "schedule";
  const storedLocationId = useEmployeeLocation(organizationId);
  const [syncing, setSyncing] = useState(false);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  const queued =
    context?.syncState === "queued" || context?.syncState === "running";
  const request = async () => {
    setSyncing(true);
    try {
      const result = await requestSync({});
      if (result.state === "rateLimited") {
        setRetryAt(result.retryAt);
        toast.info("Der kan synkroniseres igen om få minutter");
      } else if (result.state === "unavailable")
        toast.error("Workfeed-integrationen er ikke aktiv");
      else
        toast.success(
          result.accepted
            ? "Synkroniseringen er sat i gang"
            : "Synkroniseringen er allerede i gang",
        );
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Vagtplanen kunne ikke opdateres. Prøv igen.",
        ),
      );
    } finally {
      setSyncing(false);
    }
  };

  const showSchedule = canSchedule;
  const showDirectory = canDirectory;
  const showSectionTabs = Number(showSchedule) + Number(showDirectory) > 1;
  useEffect(() => {
    if (pathname === "/employees/directory" && !showDirectory && showSchedule) {
      router.replace("/employees");
    } else if (
      pathname !== "/employees/directory" &&
      !showSchedule &&
      showDirectory
    ) {
      router.replace("/employees/directory");
    }
  }, [pathname, router, showDirectory, showSchedule]);

  if (!context || !locations)
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  const effectiveRetryAt = retryAt ?? context.manualSyncRetryAt;
  const cooldown = effectiveRetryAt !== null && effectiveRetryAt > now;
  const activeLocationId = selectedLocationId({
    locations,
    storedId: storedLocationId,
    lockedId,
    isLocked,
  });
  const lastSync = context.lastShiftSyncAt ?? context.lastEmployeeSyncAt;
  const stale = Boolean(lastSync && now - lastSync > 45 * 60 * 1_000);
  const header = (
    <div className="grid gap-5 sm:grid-cols-(--grid-cols-page-header) sm:items-end">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Personale
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Medarbejdere
        </h1>
      </div>
      <Field>
        <FieldLabel htmlFor="employees-location">Lokation</FieldLabel>
        <LocationField
          id="employees-location"
          locations={locations}
          value={activeLocationId}
          locked={isLocked}
          lockedName={lockedName}
          onValueChange={(value) => {
            if (organizationId) setEmployeeLocation(organizationId, value);
          }}
        />
      </Field>
    </div>
  );
  const syncButton =
    integrations?.workfeed && context.workfeedEnabled && !kiosk?.kioskModeEnabled ? (
      <Button
        size="lg"
        variant="outline"
        disabled={queued || syncing || cooldown}
        onClick={() => void request()}
      >
        {queued || syncing ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <RefreshCwIcon data-icon="inline-start" />
        )}
        {queued ? "Synkroniserer" : "Synkronisér nu"}
      </Button>
    ) : null;
  if (!showSchedule && !showDirectory) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til medarbejdervisningen.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-(--container-page) flex-col gap-6",
        showSectionTabs && "pb-(--spacing-safe-actions-compact)",
      )}
    >
      <AppPageHeader>{header}</AppPageHeader>

      {!integrations?.workfeed ? null : context.lastError ? (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Seneste synkronisering mislykkedes</AlertTitle>
          <AlertDescription>
            {context.lastError} De senest hentede data vises fortsat.
          </AlertDescription>
        </Alert>
      ) : !context.workfeedConnected ? (
        <Alert>
          <Clock3Icon />
          <AlertTitle>Ingen Workfeed-forbindelse</AlertTitle>
          <AlertDescription>
            {context.hasCachedEmployees
              ? "De senest synkroniserede data vises. Automatisk opdatering er stoppet."
              : "Forbind Workfeed under Organisation → Integrationer for at hente medarbejdere og vagter."}
          </AlertDescription>
        </Alert>
      ) : !context.workfeedEnabled ? (
        <Alert>
          <Clock3Icon />
          <AlertTitle>Synkronisering er slået fra</AlertTitle>
          <AlertDescription>
            De senest synkroniserede data vises, men opdateres ikke automatisk.
          </AlertDescription>
        </Alert>
      ) : stale ? (
        <Alert>
          <Clock3Icon />
          <AlertTitle>Data kan være forældede</AlertTitle>
          <AlertDescription>
            Den automatiske synkronisering er forsinket. De senest hentede data
            vises stadig.
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs
        value={selectedTab}
        onValueChange={(value) =>
          router.push(
            value === "directory" ? "/employees/directory" : "/employees",
            { scroll: false },
          )
        }
      >
        {showSectionTabs ? (
          <AppBottomBar>
            <div className="mx-auto w-full max-w-(--container-page)">
              <TabsList
                variant="line"
                aria-label="Medarbejdersektioner"
                className="h-12 max-w-full justify-start overflow-x-auto overflow-y-hidden"
              >
                {showSchedule ? (
                  <TabsTrigger
                    value="schedule"
                    appearance="standard"
                    className="min-w-32"
                  >
                    Vagtplan
                  </TabsTrigger>
                ) : null}
                {showDirectory ? (
                  <TabsTrigger
                    value="directory"
                    appearance="standard"
                    className="min-w-32"
                  >
                    Medarbejdere
                  </TabsTrigger>
                ) : null}
              </TabsList>
            </div>
          </AppBottomBar>
        ) : null}
        {showSchedule ? (
          <TabsContent value="schedule">
            <ScheduleTab
              locationId={activeLocationId}
              hasLocations={Boolean(locations.length)}
              syncButton={syncButton}
              timeZone={context.timeZone}
            />
          </TabsContent>
        ) : null}
        {showDirectory ? (
          <TabsContent value="directory">
            <DirectoryTab
              key={`${organizationId}:${activeLocationId}`}
              locationId={activeLocationId}
              syncButton={syncButton}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </main>
  );
}
