"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  AlertTriangleIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Clock3Icon,
  RefreshCwIcon,
  SearchIcon,
  UsersRoundIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { LocationField } from "@/components/location-field";
import { useKiosk, useLocationAccess, usePermission } from "@/components/app-shell";
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
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function dateKey(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function mondayFor(timestamp: number, timeZone: string) {
  const current = dateKey(timestamp, timeZone);
  const weekday = new Date(`${current}T00:00:00Z`).getUTCDay();
  return addDays(current, -(weekday === 0 ? 6 : weekday - 1));
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("da-DK", { timeZone: "UTC", ...options }).format(
    new Date(`${value}T12:00:00Z`),
  );
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

type Shift = {
  id: Id<"scheduledShifts">;
  startsAt: number;
  endsAt: number;
  roleName: string | null;
  date: string;
};

function EmployeeAvatar({ name, imageUrl }: { name: string; imageUrl: string | null }) {
  return (
    <Avatar>
      {imageUrl ? <AvatarImage src={imageUrl} alt="" /> : null}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

function ShiftBlock({ shift, timeZone }: { shift: Shift; timeZone: string }) {
  const time = new Intl.DateTimeFormat("da-DK", {
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
        <div className="mt-0.5 truncate text-muted-foreground">{shift.roleName}</div>
      ) : null}
      {overnight ? (
        <div className="mt-1 break-words text-muted-foreground">
          Slutter {formatDate(endDate, { weekday: "short" }).replace(".", "")} kl. {time.format(shift.endsAt)}
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
  const [selectedDate, setSelectedDate] = useState(currentMonday);
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
      <Empty className="min-h-72 border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><CalendarDaysIcon /></EmptyMedia>
          <EmptyTitle>Ingen lokationer endnu</EmptyTitle>
          <EmptyDescription>Opret en lokation i organisationen for at se vagtplanen.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const selectWeek = (value: string) => {
    setWeekStart(value);
    setSelectedDate(value);
  };
  const goToWeek = (value: string) => {
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(date.getTime())) selectWeek(mondayFor(date.getTime(), "UTC"));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => selectWeek(addDays(weekStart, -7))} aria-label="Forrige uge">
          <ChevronLeftIcon />
        </Button>
        <Button variant="outline" onClick={() => selectWeek(currentMonday)}>Denne uge</Button>
        <Button variant="outline" size="icon" onClick={() => selectWeek(addDays(weekStart, 7))} aria-label="Næste uge">
          <ChevronRightIcon />
        </Button>
        <Input className="h-9 w-40" type="date" value={weekStart} onChange={(event) => goToWeek(event.target.value)} aria-label="Vælg uge" />
        {syncButton}
      </div>

      {week === undefined ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          {week.limitReached ? (
            <Alert><AlertTriangleIcon /><AlertTitle>Visningen er afgrænset</AlertTitle><AlertDescription>Der er flere medarbejdere eller vagter i ugen, end denne visning kan vise.</AlertDescription></Alert>
          ) : null}
          <div className="hidden rounded-xl border md:block">
            <Table className="min-w-[980px] table-fixed">
              <TableHeader><TableRow>
                <TableHead className="w-52 bg-muted/30">Medarbejder</TableHead>
                {week.dates.map((date) => (
                  <TableHead key={date} className={cn("border-l text-center", date === dateKey(now, timeZone) && "bg-primary/5")}>
                    <span className="capitalize">{formatDate(date, { weekday: "short" })}</span>
                    <span className="ml-1 text-muted-foreground">{formatDate(date, { day: "numeric", month: "short" })}</span>
                  </TableHead>
                ))}
              </TableRow></TableHeader>
              <TableBody>
                {week.employees.map((employee) => {
                  const working = employee.shifts.some((shift) => shift.startsAt <= now && shift.endsAt > now);
                  return <TableRow key={employee.id}>
                    <TableCell className="bg-card align-top">
                      <div className="flex items-center gap-3"><EmployeeAvatar name={employee.displayName} imageUrl={employee.imageUrl} />
                        <div className="min-w-0"><div className="truncate font-medium">{employee.displayName}</div>{working ? <Badge className="mt-1" variant="secondary">På arbejde nu</Badge> : null}</div>
                      </div>
                    </TableCell>
                    {week.dates.map((date) => <TableCell key={date} className={cn("h-24 border-l p-2 align-top", date === dateKey(now, timeZone) && "bg-primary/5")}>
                      <div className="flex flex-col gap-2">{employee.shifts.filter((shift) => shift.date === date).map((shift) => <ShiftBlock key={shift.id} shift={shift} timeZone={timeZone} />)}</div>
                    </TableCell>)}
                  </TableRow>;
                })}
              </TableBody>
            </Table>
            {!week.employees.length ? <div className="p-10 text-center text-sm text-muted-foreground">Ingen medarbejdere er tilknyttet lokationen i denne uge.</div> : null}
          </div>

          <div className="flex flex-col gap-3 md:hidden">
            <ToggleGroup value={[selectedDate]} onValueChange={(value) => value[0] && setSelectedDate(value[0])} variant="outline" spacing={0} className="grid w-full grid-cols-7">
              {week.dates.map((date) => <ToggleGroupItem key={date} value={date} className="h-12 min-w-0 flex-col gap-0 px-1">
                <span className="text-[10px] capitalize">{formatDate(date, { weekday: "short" }).slice(0, 2)}</span><span>{formatDate(date, { day: "numeric" })}</span>
              </ToggleGroupItem>)}
            </ToggleGroup>
            {week.employees.map((employee) => {
              const shifts = employee.shifts.filter((shift) => shift.date === selectedDate);
              const working = employee.shifts.some((shift) => shift.startsAt <= now && shift.endsAt > now);
              return <Card key={employee.id} size="sm"><CardContent className="flex gap-3">
                <EmployeeAvatar name={employee.displayName} imageUrl={employee.imageUrl} />
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{employee.displayName}</span>{working ? <Badge variant="secondary">På arbejde nu</Badge> : null}</div>
                  {shifts.length ? <div className="mt-3 flex flex-col gap-2">{shifts.map((shift) => <ShiftBlock key={shift.id} shift={shift} timeZone={timeZone} />)}</div> : <p className="mt-1 text-sm text-muted-foreground">Ingen vagt</p>}
                </div>
              </CardContent></Card>;
            })}
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
      <Empty className="min-h-64 border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><UsersRoundIcon /></EmptyMedia>
          <EmptyTitle>Ingen lokation valgt</EmptyTitle>
          <EmptyDescription>Vælg en lokation for at se dens medarbejdere.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <InputGroup className="h-11 w-full sm:w-80">
            <InputGroupInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Søg efter medarbejder" aria-label="Søg efter medarbejder" />
            <InputGroupAddon align="inline-start"><SearchIcon /></InputGroupAddon>
          </InputGroup>
          {syncButton}
        </div>
        <ToggleGroup value={[activeOnly ? "active" : "all"]} onValueChange={(value) => value[0] && setActiveOnly(value[0] === "active")} variant="outline" spacing={0}>
          <ToggleGroupItem value="active">Aktive</ToggleGroupItem><ToggleGroupItem value="all">Alle</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {status === "LoadingFirstPage" ? <Skeleton className="h-72 w-full" /> : results.length ? <>
        <div className="hidden overflow-hidden rounded-xl border sm:block"><Table><TableHeader><TableRow><TableHead>Medarbejder</TableHead><TableHead>Lokationer</TableHead><TableHead className="text-right">Status</TableHead></TableRow></TableHeader><TableBody>
          {results.map((employee) => <TableRow key={employee.id}><TableCell><div className="flex items-center gap-3"><EmployeeAvatar name={employee.displayName} imageUrl={employee.imageUrl} /><div><div className="font-medium">{employee.displayName}</div><div className="mt-1 text-xs text-muted-foreground sm:hidden">{employee.locations.map((location) => location.name).join(", ") || "Ingen lokation"}</div></div></div></TableCell><TableCell className="hidden text-muted-foreground sm:table-cell">{employee.locations.map((location) => location.name).join(", ") || "Ingen lokation"}</TableCell><TableCell className="text-right"><Badge variant={employee.active ? "secondary" : "outline"}>{employee.active ? "Aktiv" : "Inaktiv"}</Badge></TableCell></TableRow>)}
        </TableBody></Table></div>
        <div className="flex flex-col gap-2 sm:hidden">{results.map((employee) => <Card key={employee.id} size="sm"><CardContent className="flex items-start gap-3"><EmployeeAvatar name={employee.displayName} imageUrl={employee.imageUrl} /><div className="min-w-0 flex-1"><div className="font-medium">{employee.displayName}</div><p className="mt-1 text-sm text-muted-foreground">{employee.locations.map((location) => location.name).join(", ") || "Ingen lokation"}</p></div><Badge variant={employee.active ? "secondary" : "outline"}>{employee.active ? "Aktiv" : "Inaktiv"}</Badge></CardContent></Card>)}</div>
      </> : <Empty className="min-h-64 border"><EmptyHeader><EmptyMedia variant="icon"><UsersRoundIcon /></EmptyMedia><EmptyTitle>Ingen medarbejdere fundet</EmptyTitle><EmptyDescription>{search ? "Prøv en anden søgning." : "Medarbejdere vises her efter den første synkronisering."}</EmptyDescription></EmptyHeader></Empty>}
      {status === "CanLoadMore" ? <div className="flex justify-center"><Button variant="outline" onClick={() => loadMore(30)}>Vis flere</Button></div> : null}
      {status === "LoadingMore" ? <div className="flex justify-center"><Spinner /></div> : null}
    </div>
  );
}

export function EmployeeScheduling() {
  const organization = authClient.useActiveOrganization();
  const pathname = usePathname();
  const router = useRouter();
  const organizationId = organization.data?.id;
  const context = useQuery(api.employees.getContext);
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const kiosk = useKiosk();
  const canSchedule = usePermission("employees.schedule") || Boolean(kiosk?.kioskModeEnabled && kiosk.settings?.enabledPages.includes("employees.schedule"));
  const canDirectory = usePermission("employees.directory") || Boolean(kiosk?.kioskModeEnabled && kiosk.settings?.enabledPages.includes("employees.directory"));
  const requestSync = useMutation(api.employees.requestWorkfeedSync);
  const selectedTab = canDirectory && (!canSchedule || pathname === "/employees/directory") ? "directory" : "schedule";
  const storedLocationId = useEmployeeLocation(organizationId);
  const [syncing, setSyncing] = useState(false);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [desktopTarget, setDesktopTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDesktopTarget(document.getElementById("employees-shell-header"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const queued = context?.syncState === "queued" || context?.syncState === "running";
  const request = async () => {
    setSyncing(true);
    try {
      const result = await requestSync({});
      if (result.state === "rateLimited") { setRetryAt(result.retryAt); toast.info("Der kan synkroniseres igen om få minutter"); }
      else if (result.state === "unavailable") toast.error("Workfeed-integrationen er ikke aktiv");
      else toast.success(result.accepted ? "Synkroniseringen er sat i gang" : "Synkroniseringen er allerede i gang");
    } catch (error) { toast.error(messageFrom(error)); }
    finally { setSyncing(false); }
  };

  const showSchedule = canSchedule;
  const showDirectory = canDirectory;
  const showSectionTabs = Number(showSchedule) + Number(showDirectory) > 1;
  useEffect(() => {
    if (pathname === "/employees/directory" && !showDirectory && showSchedule) {
      router.replace("/employees");
    } else if (pathname !== "/employees/directory" && !showSchedule && showDirectory) {
      router.replace("/employees/directory");
    }
  }, [pathname, router, showDirectory, showSchedule]);

  if (!context || !locations) return <div className="flex flex-col gap-5"><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div>;
  const effectiveRetryAt = retryAt ?? context.manualSyncRetryAt;
  const cooldown = effectiveRetryAt !== null && effectiveRetryAt > now;
  const activeLocationId = isLocked
    ? lockedId
    : locations.some((location) => location.id === storedLocationId)
    ? (storedLocationId as Id<"locations">)
    : (locations[0]?.id ?? null);
  const lastSync = context.lastShiftSyncAt ?? context.lastEmployeeSyncAt;
  const stale = Boolean(lastSync && now - lastSync > 45 * 60 * 1_000);
  const header = (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)] sm:items-end">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Personale</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Medarbejdere</h1>
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
  const syncButton = context.workfeedEnabled && !kiosk?.kioskModeEnabled ? (
    <Button size="lg" variant="outline" disabled={queued || syncing || cooldown} onClick={() => void request()}>
      {queued || syncing ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
      {queued ? "Synkroniserer" : "Synkronisér nu"}
    </Button>
  ) : null;
  if (!showSchedule && !showDirectory) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>Du har ikke adgang til medarbejdervisningen.</AlertDescription>
      </Alert>
    );
  }
  return (
    <main className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <header className="md:hidden">{header}</header>
      {desktopTarget ? createPortal(header, desktopTarget) : null}

      {context.lastError ? <Alert variant="destructive"><AlertTriangleIcon /><AlertTitle>Seneste synkronisering mislykkedes</AlertTitle><AlertDescription>{context.lastError} De senest hentede data vises fortsat.</AlertDescription></Alert>
        : !context.workfeedConnected ? <Alert><Clock3Icon /><AlertTitle>Ingen Workfeed-forbindelse</AlertTitle><AlertDescription>{context.hasCachedEmployees ? "De senest synkroniserede data vises. Automatisk opdatering er stoppet." : "Forbind Workfeed under Organisation → Integrationer for at hente medarbejdere og vagter."}</AlertDescription></Alert>
        : !context.workfeedEnabled ? <Alert><Clock3Icon /><AlertTitle>Synkronisering er slået fra</AlertTitle><AlertDescription>De senest synkroniserede data vises, men opdateres ikke automatisk.</AlertDescription></Alert>
        : stale ? <Alert><Clock3Icon /><AlertTitle>Data kan være forældede</AlertTitle><AlertDescription>Den automatiske synkronisering er forsinket. De senest hentede data vises stadig.</AlertDescription></Alert> : null}

      {!context.hasCachedEmployees ? <Empty className="min-h-72 border"><EmptyHeader><EmptyMedia variant="icon"><UsersRoundIcon /></EmptyMedia><EmptyTitle>Ingen medarbejderdata endnu</EmptyTitle><EmptyDescription>{context.workfeedEnabled ? "Start en synkronisering for at hente medarbejdere og offentliggjorte vagter." : "Medarbejdere vises her, når en integration har leveret den første synkronisering."}</EmptyDescription></EmptyHeader>{syncButton ? <EmptyContent>{syncButton}</EmptyContent> : null}</Empty>
        : <Tabs value={selectedTab} onValueChange={(value) => router.push(value === "directory" ? "/employees/directory" : "/employees")}>
            {showSectionTabs ? (
              <TabsList className="w-full" aria-label="Medarbejdersektioner">
                {showSchedule ? <TabsTrigger value="schedule" className="px-5">Vagtplan</TabsTrigger> : null}
                {showDirectory ? <TabsTrigger value="directory" className="px-5">Medarbejdere</TabsTrigger> : null}
              </TabsList>
            ) : null}
            {showSchedule ? <TabsContent value="schedule" className={showSectionTabs ? "pt-3" : undefined}><ScheduleTab locationId={activeLocationId} hasLocations={Boolean(locations.length)} syncButton={syncButton} timeZone={context.timeZone} /></TabsContent> : null}
            {showDirectory ? <TabsContent value="directory" className={showSectionTabs ? "pt-3" : undefined}><DirectoryTab locationId={activeLocationId} syncButton={syncButton} /></TabsContent> : null}
          </Tabs>}
    </main>
  );
}
