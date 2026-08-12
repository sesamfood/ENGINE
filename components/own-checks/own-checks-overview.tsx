"use client";

import { useQuery } from "convex/react";
import { AlertTriangleIcon, CheckCircle2Icon, CircleHelpIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocationAccess } from "@/components/app-shell";
import { LocationField } from "@/components/location-field";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ownCheckControlTypeLabels, ownCheckStatusLabels, type OwnCheckControlType, type OwnCheckStatus } from "@/lib/own-checks";
import { OwnCheckRecord } from "./own-check-record";

type OverviewResult = NonNullable<ReturnType<typeof useQuery<typeof api.ownChecks.listOwnChecks>>>;
type Row = OverviewResult["page"][number];
const emptyRows: Row[] = [];

function dateKey(offsetDays = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(now);
}

function formatDate(key: string) {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium" }).format(new Date(`${key}T12:00:00`));
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit" }).format(timestamp);
}

function StatusBadge({ row }: { row: Row }) {
  const icon = row.status === "approved" ? <CheckCircle2Icon data-icon="inline-start" /> : row.status === "deviation" ? <AlertTriangleIcon data-icon="inline-start" /> : null;
  const variant = row.status === "deviation" ? "destructive" : row.status === "approved" ? "default" : row.status === "notCompleted" ? "outline" : "secondary";
  return <Badge variant={variant}>{icon}{ownCheckStatusLabels[row.status as OwnCheckStatus]}</Badge>;
}

function RowContent({ row, onOpen }: { row: Row; onOpen: () => void }) {
  return <div role={row.entry ? "button" : undefined} tabIndex={row.entry ? 0 : undefined} className={`flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left ${row.entry ? "cursor-pointer hover:bg-muted/50" : "opacity-80"} ${row.entry?.followUp === "open" ? "border-l-4 border-l-destructive" : ""}`} onClick={() => row.entry && onOpen()} onKeyDown={(event) => { if (row.entry && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpen(); } }}><div className="min-w-0 flex-1"><p className="truncate font-medium">{row.name}</p><p className="text-sm text-muted-foreground">{row.locationName} · {ownCheckControlTypeLabels[row.controlType]} · {formatTime(row.dueAt)}</p></div><div className="flex shrink-0 items-end gap-2"><StatusBadge row={row} />{row.overdue && row.status === "notCompleted" ? <span className="text-xs font-medium text-destructive">Overskredet</span> : null}</div></div>;
}

export function OwnChecksOverview() {
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const [selectedLocation, setSelectedLocation] = useState<Id<"locations"> | null>(lockedId);
  const [fromDateKey, setFromDateKey] = useState(() => dateKey(-7));
  const [toDateKey, setToDateKey] = useState(() => dateKey());
  const [controlType, setControlType] = useState<OwnCheckControlType | "">("");
  const [status, setStatus] = useState<OwnCheckStatus | "">("");
  const [performedBy, setPerformedBy] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState<Id<"ownCheckEntries"> | null>(null);
  const locationId = lockedId ?? selectedLocation ?? locations?.[0]?.id ?? null;
  const result = useQuery(api.ownChecks.listOwnChecks, locationId ? {
    paginationOpts: { numItems: 2_000, cursor: null },
    fromDateKey,
    toDateKey,
    locationId,
    ...(controlType ? { controlType } : {}),
    ...(status ? { status } : {}),
    ...(performedBy.trim() ? { performedBy: performedBy.trim() } : {}),
  } : "skip");

  const rows = result?.page ?? emptyRows;
  const performerOptions = useMemo(() => [...new Map(rows.filter((row) => row.entry).map((row) => [row.entry!.performedBy, row.entry!.performedByName])).entries()], [rows]);

  if (locations === undefined || (locationId && result === undefined)) return <Skeleton className="h-[40rem] w-full" />;
  if (!locations.length || !locationId) return <Card><CardContent className="p-8 text-center text-muted-foreground">Opret en lokation, før oversigten kan vises.</CardContent></Card>;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="pt-6">
          <FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {!isLocked ? <Field><FieldLabel htmlFor="own-overview-location">Lokation</FieldLabel><LocationField id="own-overview-location" locations={locations} value={locationId} locked={isLocked} lockedName={lockedName} onValueChange={(value) => setSelectedLocation(value as Id<"locations">)} /></Field> : null}
            <Field><FieldLabel htmlFor="own-overview-from">Fra dato</FieldLabel><Input id="own-overview-from" type="date" value={fromDateKey} onChange={(event) => setFromDateKey(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="own-overview-to">Til dato</FieldLabel><Input id="own-overview-to" type="date" value={toDateKey} onChange={(event) => setToDateKey(event.target.value)} /></Field>
            <Field><FieldLabel htmlFor="own-overview-type">Kontroltype</FieldLabel><Select items={[{ value: "", label: "Alle kontroltyper" }, ...Object.entries(ownCheckControlTypeLabels).map(([value, label]) => ({ value, label }))]} value={controlType} onValueChange={(value) => setControlType((value ?? "") as OwnCheckControlType | "")}><SelectTrigger id="own-overview-type" className="w-full"><SelectValue placeholder="Alle kontroltyper" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="">Alle kontroltyper</SelectItem>{Object.entries(ownCheckControlTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
            <Field><div className="flex items-center gap-1"><FieldLabel htmlFor="own-overview-status">Status</FieldLabel><HelpTooltip label="Statusfilter" content="Afvigelse viser alle registreringer med en afvigelse, også når de senere er godkendt." /></div><Select items={[{ value: "", label: "Alle statusser" }, { value: "notCompleted", label: "Ikke udført" }, { value: "completed", label: "Udført" }, { value: "approved", label: "Godkendt" }, { value: "deviation", label: "Afvigelse" }]} value={status} onValueChange={(value) => setStatus((value ?? "") as OwnCheckStatus | "")}><SelectTrigger id="own-overview-status" className="w-full"><SelectValue placeholder="Alle statusser" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="">Alle statusser</SelectItem><SelectItem value="notCompleted">Ikke udført</SelectItem><SelectItem value="completed">Udført</SelectItem><SelectItem value="approved">Godkendt</SelectItem><SelectItem value="deviation">Afvigelse</SelectItem></SelectGroup></SelectContent></Select></Field>
          </FieldGroup>
          <Field className="mt-4 max-w-md"><div className="flex items-center gap-1"><FieldLabel htmlFor="own-overview-performed-by">Ansvarlig bruger</FieldLabel><HelpTooltip label="Ansvarlig bruger" content="Filteret matcher den bruger, der udførte kontrollen. Manglende kontroller med en ansvarlig rolle vises kun, når brugeren matcher rollen." /></div><Select items={[{ value: "", label: "Alle brugere" }, ...performerOptions.map(([value, label]) => ({ value, label }))]} value={performedBy} onValueChange={(value) => setPerformedBy(value ?? "")}><SelectTrigger id="own-overview-performed-by" className="w-full"><SelectValue placeholder="Alle brugere" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="">Alle brugere</SelectItem>{performerOptions.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Kontroller · {formatDate(fromDateKey)} – {formatDate(toDateKey)}</CardTitle></CardHeader>
        <CardContent>
          {rows.length ? <><div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow><TableHead>Dato</TableHead><TableHead>Egenkontrol</TableHead><TableHead>Lokation</TableHead><TableHead>Kontroltype</TableHead><TableHead>Planlagt</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={`${row.locationId}-${row.templateId}-${row.dueDateKey}`} tabIndex={row.entry ? 0 : undefined} className={row.entry ? "cursor-pointer" : undefined} onClick={() => row.entry && setSelectedEntryId(row.entry.id)} onKeyDown={(event) => { if (row.entry && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSelectedEntryId(row.entry.id); } }}><TableCell>{formatDate(row.dueDateKey)}</TableCell><TableCell className="font-medium">{row.name}</TableCell><TableCell>{row.locationName}</TableCell><TableCell>{ownCheckControlTypeLabels[row.controlType]}</TableCell><TableCell>{formatTime(row.dueAt)}</TableCell><TableCell><StatusBadge row={row} /></TableCell></TableRow>)}</TableBody></Table></div><div className="flex flex-col gap-2 md:hidden">{rows.map((row) => <RowContent key={`${row.locationId}-${row.templateId}-${row.dueDateKey}`} row={row} onOpen={() => row.entry && setSelectedEntryId(row.entry.id)} />)}</div></> : <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground"><CircleHelpIcon /><p>Ingen egenkontroller matcher filtrene.</p></div>}
          {result?.pageStatus ? <p className="mt-4 text-sm text-muted-foreground">Viser kun de første 2.000 rækker. Vælg en kortere periode.</p> : null}
        </CardContent>
      </Card>
      <Dialog open={Boolean(selectedEntryId)} onOpenChange={(open) => !open && setSelectedEntryId(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle className="sr-only">Egenkontroldetaljer</DialogTitle><DialogDescription className="sr-only">Værdier, dokumentation og ændringshistorik.</DialogDescription></DialogHeader>{selectedEntryId ? <OwnCheckRecord entryId={selectedEntryId} onClose={() => setSelectedEntryId(null)} /> : null}</DialogContent>
      </Dialog>
    </div>
  );
}
