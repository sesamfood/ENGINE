"use client";

import { api } from "@/convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ownCheckControlTypeLabels, ownCheckStatus } from "@/lib/own-checks";
import {
  OwnCheckAttachments,
  OwnCheckExecutionTimes,
  OwnCheckProductTemperatures,
  OwnCheckResultFields,
  OwnCheckStatusBadge,
} from "./own-check-results";

export type DocumentationResult = NonNullable<
  ReturnType<
    typeof import("convex/react").usePaginatedQuery<
      typeof api.ownCheckDocumentation.buildDocumentation
    >
  >
>;
export type DocumentationRecord = DocumentationResult["results"][number];
export type MissingResult = NonNullable<
  ReturnType<
    typeof import("convex/react").useQuery<
      typeof api.ownCheckDocumentation.listMissingOwnChecks
    >
  >
>;
export type MissingRecord = MissingResult["items"][number];

function formatDate(dateKey: string) {
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T12:00:00Z`));
}

function formatTime(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(timestamp);
}

function formatDateTime(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone,
  }).format(timestamp);
}

export function InspectionReport({
  header,
  records,
  missing,
}: {
  header: {
    organizationName: string;
    locationName: string;
    fromDateKey: string;
    toDateKey: string;
    generatedAt: number;
    generatedBy: string;
    timeZone: string;
  };
  records: DocumentationRecord[];
  missing: MissingRecord[];
}) {
  const grouped = new Map<string, DocumentationRecord[]>();
  for (const record of records)
    grouped.set(record.dueDateKey, [
      ...(grouped.get(record.dueDateKey) ?? []),
      record,
    ]);
  const deviations = records.filter((record) => record.hasDeviation).length;
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>{header.organizationName}</CardTitle>
          <p className="text-muted-foreground">
            Kontroldokumentation for {header.locationName}
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Periode</p>
            <p>
              {formatDate(header.fromDateKey)} – {formatDate(header.toDateKey)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Genereret</p>
            <p>{formatDateTime(header.generatedAt, header.timeZone)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Genereret af</p>
            <p>{header.generatedBy}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Resultat</p>
            <p>
              {records.length} udførte · {deviations} afvigelser ·{" "}
              {missing.length} manglende
            </p>
          </div>
        </CardContent>
      </Card>
      {[...grouped.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dateKey, dateRecords]) => (
          <section key={dateKey} className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <h2 className="font-heading text-lg font-semibold">
                {formatDate(dateKey)}
              </h2>
              <Separator className="flex-1" />
            </div>
            {dateRecords.map((record) => {
              return (
                <Card
                  key={record.id}
                  className={
                    record.followUp === "open"
                      ? "border-l-4 border-l-destructive"
                      : undefined
                  }
                >
                  <CardHeader className="gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <CardTitle className="text-base">{record.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {ownCheckControlTypeLabels[record.controlType]} ·
                        Planlagt kl. {formatTime(record.dueAt, header.timeZone)}{" "}
                        · Udført{" "}
                        {formatDateTime(record.performedAt, header.timeZone)} af{" "}
                        {record.performedByName}
                      </p>
                    </div>
                    <OwnCheckStatusBadge status={ownCheckStatus(record)} />
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <OwnCheckExecutionTimes
                      startedAt={record.startedAt}
                      endedAt={record.endedAt}
                      timeZone={header.timeZone}
                    />
                    <OwnCheckResultFields
                      fields={record.fields}
                      values={record.values}
                      renderAttachments={(fieldKey) => (
                        <OwnCheckAttachments
                          attachments={record.attachments}
                          fieldKey={fieldKey}
                          revision={record.revisions.at(-1)?.revision ?? 1}
                        />
                      )}
                    />
                    <OwnCheckProductTemperatures
                      productTemperatures={record.productTemperatures}
                    />
                    {record.note ? (
                      <div>
                        <p className="text-sm font-medium">Note</p>
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                          {record.note}
                        </p>
                      </div>
                    ) : null}
                    {record.deviation ? (
                      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                        <p className="text-sm font-medium text-destructive">
                          Afvigelse
                        </p>
                        <p className="whitespace-pre-wrap text-sm">
                          {record.deviation.description}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {record.deviation.recordedByName} ·{" "}
                          {formatDateTime(
                            record.deviation.recordedAt,
                            header.timeZone,
                          )}
                        </p>
                      </div>
                    ) : null}
                    {record.correctiveAction ? (
                      <div className="rounded-lg border p-3">
                        <p className="text-sm font-medium">
                          Korrigerende handling
                        </p>
                        <p className="whitespace-pre-wrap text-sm">
                          {record.correctiveAction.description}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {record.correctiveAction.recordedByName} ·{" "}
                          {formatDateTime(
                            record.correctiveAction.recordedAt,
                            header.timeZone,
                          )}
                        </p>
                      </div>
                    ) : null}
                    {record.approvedByName ? (
                      <p className="text-sm text-muted-foreground">
                        Godkendt af {record.approvedByName}
                      </p>
                    ) : null}
                    {record.revisions.length > 1 ? (
                      <div>
                        <p className="text-sm font-medium">Rettelser</p>
                        <ul className="mt-1 flex flex-col gap-1 text-sm text-muted-foreground">
                          {record.revisions.slice(1).map((revision) => (
                            <li key={revision.id}>
                              Revision {revision.revision} ·{" "}
                              {formatDateTime(revision.at, header.timeZone)} ·{" "}
                              {revision.actorName}
                              {revision.reason ? ` · ${revision.reason}` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </section>
        ))}
      {missing.length ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 className="font-heading text-lg font-semibold">
              Manglende egenkontroller
            </h2>
            <Separator className="flex-1" />
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dato</TableHead>
                    <TableHead>Egenkontrol</TableHead>
                    <TableHead>Planlagt</TableHead>
                    <TableHead>Ansvarlig rolle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {missing.map((item) => (
                    <TableRow key={`${item.templateId}-${item.dueDateKey}`}>
                      <TableCell>{formatDate(item.dueDateKey)}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>
                        {formatTime(item.dueAt, header.timeZone)}
                      </TableCell>
                      <TableCell>{item.responsibleRole ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
