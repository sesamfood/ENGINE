"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { ClipboardCheckIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLocationAccess } from "@/components/app-shell";
import { LocationField } from "@/components/location-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OwnCheckStatusBadge } from "./own-check-results";
import { inclusiveDateRangeDays as rangeDays } from "@/lib/date";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addDateKey,
  ownCheckControlTypeLabels,
  type OwnCheckControlType,
  type OwnCheckStatus,
} from "@/lib/own-checks";
import { cn } from "@/lib/utils";
import { OwnCheckRecord } from "./own-check-record";
import { useOwnCheckNow } from "./use-own-check-now";

type PlanResult = NonNullable<
  ReturnType<typeof useQuery<typeof api.ownChecks.listOwnCheckPlan>>
>;
type EntriesResult = NonNullable<
  ReturnType<typeof useQuery<typeof api.ownChecks.listOwnCheckEntries>>
>;
type Row = PlanResult["rows"][number] | EntriesResult["page"][number];
const emptyRows: Row[] = [];

function formatDate(key: string) {
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${key}T12:00:00Z`));
}

function formatTime(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(timestamp);
}

function isOverdue(row: Row, now: number) {
  return row.status === "notCompleted" && now > row.dueAt;
}

function RowContent({
  row,
  now,
  onOpen,
}: {
  row: Row;
  now: number;
  onOpen: () => void;
}) {
  return (
    <div
      role={row.entry ? "button" : undefined}
      tabIndex={row.entry ? 0 : undefined}
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-lg border p-3 text-left",
        row.entry &&
          "cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        row.entry?.followUp === "open" && "border-l-4 border-l-destructive",
      )}
      onClick={() => row.entry && onOpen()}
      onKeyDown={(event) => {
        if (row.entry && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium">{row.name}</p>
        <p className="text-sm text-muted-foreground">
          {formatDate(row.dueDateKey)} · {formatTime(row.dueAt, row.timeZone)}
        </p>
        <p className="text-sm text-muted-foreground">
          {row.locationName} · {ownCheckControlTypeLabels[row.controlType]}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <OwnCheckStatusBadge status={row.status} />
        {isOverdue(row, now) ? (
          <span className="text-xs font-medium text-destructive">
            Overskredet
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function OwnChecksOverview() {
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const [selectedLocation, setSelectedLocation] =
    useState<Id<"locations"> | null>(lockedId);
  const [manualRange, setManualRange] = useState<{
    locationId: Id<"locations">;
    from: string;
    to: string;
  } | null>(null);
  const [controlType, setControlType] = useState<OwnCheckControlType | "">("");
  const [status, setStatus] = useState<OwnCheckStatus | "">("");
  const [performedBy, setPerformedBy] = useState("");
  const [selectedEntryId, setSelectedEntryId] =
    useState<Id<"ownCheckEntries"> | null>(null);
  const locationId = lockedId ?? selectedLocation ?? locations?.[0]?.id ?? null;
  const now = useOwnCheckNow(locationId ?? "");
  const dateContext = useQuery(
    api.ownCheckOverview.getOverviewDateContext,
    locationId ? { locationId, now } : "skip",
  );
  const activeManualRange =
    manualRange?.locationId === locationId ? manualRange : null;
  const toDateKey = activeManualRange?.to ?? dateContext?.todayDateKey ?? "";
  const fromDateKey =
    activeManualRange?.from ??
    (dateContext ? addDateKey(dateContext.todayDateKey, -7) : "");
  const days = rangeDays(fromDateKey, toDateKey);
  const rangeValid = Number.isFinite(days) && days >= 1 && days <= 92;
  const isEntryStatus = Boolean(status && status !== "notCompleted");
  const commonArgs =
    locationId && rangeValid
      ? {
          fromDateKey,
          toDateKey,
          locationId,
          ...(controlType ? { controlType } : {}),
          ...(performedBy.trim() ? { performedBy: performedBy.trim() } : {}),
        }
      : null;
  const planArgs =
    commonArgs && !isEntryStatus
      ? {
          ...commonArgs,
          ...(status === "notCompleted"
            ? { status: "notCompleted" as const }
            : {}),
        }
      : "skip";
  const entryArgs =
    commonArgs && isEntryStatus
      ? {
          ...commonArgs,
          status: status as "completed" | "approved" | "deviation",
        }
      : "skip";
  const paginated = usePaginatedQuery(
    api.ownChecks.listOwnCheckEntries,
    entryArgs,
    { initialNumItems: 50 },
  );
  const plan = useQuery(api.ownChecks.listOwnCheckPlan, planArgs);
  const rows = (isEntryStatus ? paginated.results : plan?.rows) ?? emptyRows;
  const performerOptions = useMemo(
    () => [
      ...new Map(
        rows
          .filter((row) => row.entry)
          .map((row) => [row.entry!.performedBy, row.entry!.performedByName]),
      ).entries(),
    ],
    [rows],
  );
  const loading =
    locations === undefined ||
    Boolean(locationId && rangeValid && dateContext === undefined) ||
    (isEntryStatus
      ? paginated.status === "LoadingFirstPage"
      : planArgs !== "skip" && plan === undefined);

  function updateRange(next: Partial<{ from: string; to: string }>) {
    if (!locationId) return;
    setManualRange({
      locationId,
      from: next.from ?? fromDateKey,
      to: next.to ?? toDateKey,
    });
  }

  if (loading) return <Skeleton className="h-[40rem] w-full" />;
  if (!locations?.length || !locationId)
    return (
      <Empty className="min-h-72 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ClipboardCheckIcon />
          </EmptyMedia>
          <EmptyTitle>Ingen lokationer</EmptyTitle>
          <EmptyDescription>
            Opret en lokation, før oversigten kan vises.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Oversigt</h2>
      <FieldGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {!isLocked ? (
          <Field>
            <FieldLabel htmlFor="own-overview-location">Lokation</FieldLabel>
            <LocationField
              id="own-overview-location"
              locations={locations}
              value={locationId}
              locked={isLocked}
              lockedName={lockedName}
              onValueChange={(value) =>
                setSelectedLocation(value as Id<"locations">)
              }
            />
          </Field>
        ) : null}
        <Field data-invalid={!rangeValid}>
          <FieldLabel htmlFor="own-overview-from">Fra dato</FieldLabel>
          <Input
            id="own-overview-from"
            type="date"
            className="h-11"
            aria-invalid={!rangeValid}
            value={fromDateKey}
            onChange={(event) => updateRange({ from: event.target.value })}
          />
        </Field>
        <Field data-invalid={!rangeValid}>
          <FieldLabel htmlFor="own-overview-to">Til dato</FieldLabel>
          <Input
            id="own-overview-to"
            type="date"
            className="h-11"
            aria-invalid={!rangeValid}
            value={toDateKey}
            onChange={(event) => updateRange({ to: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="own-overview-type">Kontroltype</FieldLabel>
          <Select
            items={[
              { value: "", label: "Alle kontroltyper" },
              ...Object.entries(ownCheckControlTypeLabels).map(
                ([value, label]) => ({ value, label }),
              ),
            ]}
            value={controlType}
            onValueChange={(value) =>
              setControlType((value ?? "") as OwnCheckControlType | "")
            }
          >
            <SelectTrigger id="own-overview-type" className="min-h-11 w-full">
              <SelectValue placeholder="Alle kontroltyper" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="">Alle kontroltyper</SelectItem>
                {Object.entries(ownCheckControlTypeLabels).map(
                  ([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ),
                )}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <div className="flex items-center gap-1">
            <FieldLabel htmlFor="own-overview-status">Status</FieldLabel>
            <HelpTooltip
              label="Statusfilter"
              content="Afvigelse viser alle registreringer med en afvigelse, også når de senere er godkendt."
            />
          </div>
          <Select
            items={[
              { value: "", label: "Alle statusser" },
              { value: "notCompleted", label: "Ikke udført" },
              { value: "completed", label: "Udført" },
              { value: "approved", label: "Godkendt" },
              { value: "deviation", label: "Afvigelse" },
            ]}
            value={status}
            onValueChange={(value) =>
              setStatus((value ?? "") as OwnCheckStatus | "")
            }
          >
            <SelectTrigger id="own-overview-status" className="min-h-11 w-full">
              <SelectValue placeholder="Alle statusser" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="">Alle statusser</SelectItem>
                <SelectItem value="notCompleted">Ikke udført</SelectItem>
                <SelectItem value="completed">Udført</SelectItem>
                <SelectItem value="approved">Godkendt</SelectItem>
                <SelectItem value="deviation">Afvigelse</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <div className="flex items-center gap-1">
            <FieldLabel htmlFor="own-overview-performed-by">
              Ansvarlig bruger
            </FieldLabel>
            <HelpTooltip
              label="Ansvarlig bruger"
              content="Filteret matcher den bruger, der udførte kontrollen. For manglende kontroller matcher det i stedet den ansvarlige rolle."
            />
          </div>
          <Select
            items={[
              { value: "", label: "Alle brugere" },
              ...performerOptions.map(([value, label]) => ({ value, label })),
            ]}
            value={performedBy}
            onValueChange={(value) => setPerformedBy(value ?? "")}
          >
            <SelectTrigger
              id="own-overview-performed-by"
              className="min-h-11 w-full"
            >
              <SelectValue placeholder="Alle brugere" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="">Alle brugere</SelectItem>
                {performerOptions.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      {!rangeValid ? (
        <Alert variant="destructive">
          <AlertTitle>Ugyldig periode</AlertTitle>
          <AlertDescription>
            Vælg en periode på mellem 1 og 92 dage.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Kontroller · {fromDateKey ? formatDate(fromDateKey) : ""} –{" "}
          {toDateKey ? formatDate(toDateKey) : ""}
        </p>
        {rows.length ? (
          <>
            <div className="hidden overflow-hidden rounded-xl border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dato</TableHead>
                    <TableHead>Egenkontrol</TableHead>
                    <TableHead>Lokation</TableHead>
                    <TableHead>Kontroltype</TableHead>
                    <TableHead>Planlagt</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={`${row.locationId}-${row.templateId}-${row.dueDateKey}`}
                      tabIndex={row.entry ? 0 : undefined}
                      className={cn(
                        "h-14",
                        row.entry &&
                          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      )}
                      onClick={() =>
                        row.entry && setSelectedEntryId(row.entry.id)
                      }
                      onKeyDown={(event) => {
                        if (
                          row.entry &&
                          (event.key === "Enter" || event.key === " ")
                        ) {
                          event.preventDefault();
                          setSelectedEntryId(row.entry.id);
                        }
                      }}
                    >
                      <TableCell>{formatDate(row.dueDateKey)}</TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.locationName}</TableCell>
                      <TableCell>
                        {ownCheckControlTypeLabels[row.controlType]}
                      </TableCell>
                      <TableCell>
                        {formatTime(row.dueAt, row.timeZone)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <OwnCheckStatusBadge status={row.status} />
                          {isOverdue(row, now) ? (
                            <span className="text-xs font-medium text-destructive">
                              Overskredet
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-col gap-2 md:hidden">
              {rows.map((row) => (
                <RowContent
                  key={`${row.locationId}-${row.templateId}-${row.dueDateKey}`}
                  row={row}
                  now={now}
                  onOpen={() => row.entry && setSelectedEntryId(row.entry.id)}
                />
              ))}
            </div>
          </>
        ) : (
          <Empty className="min-h-72 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClipboardCheckIcon />
              </EmptyMedia>
              <EmptyTitle>Ingen egenkontroller matcher filtrene</EmptyTitle>
              <EmptyDescription>
                Prøv en anden periode eller andre filtre.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {!isEntryStatus && plan?.truncated ? (
          <p className="text-sm text-muted-foreground">
            Listen er begrænset til 2.000 rækker. Vælg en kortere periode.
          </p>
        ) : null}
        {isEntryStatus && paginated.status === "CanLoadMore" ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 self-start"
            onClick={() => paginated.loadMore(50)}
          >
            Vis flere
          </Button>
        ) : null}
      </div>
      <Dialog
        open={Boolean(selectedEntryId)}
        onOpenChange={(open) => !open && setSelectedEntryId(null)}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="sr-only">Egenkontroldetaljer</DialogTitle>
            <DialogDescription className="sr-only">
              Værdier, dokumentation og ændringshistorik.
            </DialogDescription>
          </DialogHeader>
          {selectedEntryId ? (
            <OwnCheckRecord
              entryId={selectedEntryId}
              onClose={() => setSelectedEntryId(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
