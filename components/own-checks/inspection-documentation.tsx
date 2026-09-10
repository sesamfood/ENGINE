"use client";

import { useConvex, useMutation, useQuery } from "convex/react";
import { DownloadIcon, FileDownIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { downloadCsv } from "@/lib/download-csv";
import {
  addDays as shiftDate,
  inclusiveDateRangeDays as rangeDays,
  parseDateKey,
} from "@/lib/date";
import { ownCheckLimitText } from "@/lib/own-check-display";
import {
  MAX_EMBEDDED_ATTACHMENT_BYTES,
  MAX_EMBEDDED_ATTACHMENTS,
  isDocumentationReportReady,
} from "@/lib/own-check-documentation";
import {
  formatValue,
  evaluateCompliance,
  ownCheckControlTypeLabels,
  ownCheckStatus,
  ownCheckStatusLabels,
} from "@/lib/own-checks";
import { getUserErrorMessage } from "@/lib/user-errors";
import { LocationField } from "@/components/location-field";
import {
  useKiosk,
  useLocationAccess,
  usePermission,
} from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { Spinner } from "@/components/ui/spinner";
import {
  InspectionReport,
  type DocumentationRecord,
  type MissingRecord,
} from "./inspection-report";
import { useOwnCheckNow } from "./use-own-check-now";

const MAX_EXPORT_RECORDS = 5_000;
const MAX_EXPORT_PAGE_SIZE = 100;
const MAX_ATTACHMENT_FETCH_CONCURRENCY = 4;
type DocumentationStatus =
  "Idle" | "LoadingFirstPage" | "LoadingMore" | "Exhausted";

type ExportAttachment = {
  recordId: DocumentationRecord["id"];
  fieldKey: string;
  fieldLabel: string;
  fileName: string;
  contentType: string;
  bytes?: Uint8Array;
  omittedReason?: string;
  addedAtRevision: number;
  removedAtRevision: number | null;
};

type PreparedValue = {
  header: {
    locationId: Id<"locations">;
    locationName: string;
    legalEntityName: string | null;
    registrationNumber: string | null;
    operatorName: string | null;
    marketName: string | null;
    fromDateKey: string;
    toDateKey: string;
    generatedAt: number;
    generatedBy: string;
    timeZone: string;
  };
  missing: { items: MissingRecord[]; truncated: boolean };
};

function startOfWeek(dateKeyValue: string) {
  const date = parseDateKey(dateKeyValue);
  const weekday = date.getUTCDay();
  return shiftDate(dateKeyValue, weekday === 0 ? -6 : 1 - weekday);
}

function fileNamePart(value: string) {
  return (
    value
      .toLocaleLowerCase("da")
      .replace(/[^a-z0-9æøå]+/giu, "-")
      .replace(/^-|-$/gu, "") || "lokation"
  );
}

function downloadBytes(name: string, bytes: Uint8Array, type: string) {
  const url = URL.createObjectURL(
    new Blob([Uint8Array.from(bytes).buffer], { type }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function csvRows(
  records: DocumentationRecord[],
  missing: MissingRecord[],
  timeZone: string,
  locationName: string,
) {
  const rows: string[][] = [];
  for (const record of records) {
    const compliance = evaluateCompliance(record.fields, record.values);
    const violations = new Map(
      compliance.violations.map((violation) => [violation.key, violation]),
    );
    const revisions = record.revisions
      .slice(1)
      .map(
        (revision) =>
          `Revision ${revision.revision}: ${revision.reason ?? "uden begrundelse"}`,
      )
      .join(" | ");
    for (const value of record.values) {
      const field = record.fields.find(
        (candidate) => candidate.key === value.key,
      );
      if (!field) continue;
      rows.push([
        record.dueDateKey,
        new Intl.DateTimeFormat("da-DK", {
          dateStyle: "short",
          timeStyle: "short",
          timeZone,
        }).format(record.performedAt),
        record.name,
        ownCheckControlTypeLabels[record.controlType],
        record.locationName,
        record.performedByName,
        field.label,
        formatValue(field, value),
        ownCheckLimitText(field),
        violations.has(field.key) ? "Nej" : "Ja",
        ownCheckStatusLabels[ownCheckStatus(record)],
        record.deviation?.description ?? "",
        record.correctiveAction?.description ?? "",
        record.approvedByName ?? "",
        revisions,
      ]);
    }
  }
  for (const item of missing)
    rows.push([
      item.dueDateKey,
      `Kl. ${new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", timeZone }).format(item.dueAt)}`,
      item.name,
      ownCheckControlTypeLabels[item.controlType],
      locationName,
      "",
      "",
      "",
      "",
      "",
      "Ikke udført",
      "",
      "",
      "",
      "",
    ]);
  return rows;
}

export function InspectionDocumentation() {
  const convex = useConvex();
  const organization = authClient.useActiveOrganization();
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const kiosk = useKiosk();
  const canExport =
    usePermission("ownChecks.export") ||
    Boolean(
      kiosk?.kioskModeEnabled &&
      kiosk.settings?.enabledPages.includes("ownChecks.documentation"),
    );
  const [selectedLocation, setSelectedLocation] =
    useState<Id<"locations"> | null>(lockedId);
  const [manualRange, setManualRange] = useState<{
    locationId: Id<"locations">;
    from: string;
    to: string;
  } | null>(null);
  const [prepared, setPrepared] = useState<{
    key: string;
    value: PreparedValue;
  } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const locationId = lockedId ?? selectedLocation ?? locations?.[0]?.id ?? null;
  const now = useOwnCheckNow(
    `${locationId ?? ""}:${manualRange?.from ?? ""}:${manualRange?.to ?? ""}`,
  );
  const dateContext = useQuery(
    api.ownCheckDocumentation.getDocumentationDateContext,
    locationId && canExport ? { locationId, now } : "skip",
  );
  const activeManualRange =
    manualRange?.locationId === locationId ? manualRange : null;
  const toDateKey = activeManualRange?.to ?? dateContext?.todayDateKey ?? "";
  const fromDateKey =
    activeManualRange?.from ??
    (dateContext ? startOfWeek(dateContext.todayDateKey) : "");
  const days = rangeDays(fromDateKey, toDateKey);
  const rangeValid = Number.isFinite(days) && days >= 1 && days <= 366;
  const preparedKey = `${locationId ?? ""}:${fromDateKey}:${toDateKey}`;
  const preparedForCurrent =
    prepared?.key === preparedKey ? prepared.value : null;
  const prepare = useMutation(api.ownCheckDocumentation.prepareDocumentation);
  const documentationArgs = useMemo(
    () =>
      preparedForCurrent && !preparedForCurrent.missing.truncated && locationId
        ? {
            fromDateKey,
            toDateKey,
            locationId,
            generatedAt: preparedForCurrent.header.generatedAt,
          }
        : null,
    [fromDateKey, locationId, preparedForCurrent, toDateKey],
  );
  const documentationKey = documentationArgs
    ? `${documentationArgs.locationId}:${documentationArgs.fromDateKey}:${documentationArgs.toDateKey}:${documentationArgs.generatedAt}`
    : null;
  const [documentationRecords, setDocumentationRecords] = useState<
    DocumentationRecord[]
  >([]);
  const [documentationStatus, setDocumentationStatus] =
    useState<DocumentationStatus>("Idle");
  const [loadedDocumentationKey, setLoadedDocumentationKey] = useState<
    string | null
  >(null);
  const [documentationError, setDocumentationError] = useState<{
    key: string;
    error: Error;
  } | null>(null);
  const branding = useQuery(
    api.organization.getBranding,
    canExport && organization.data ? {} : "skip",
  );

  useEffect(() => {
    if (!documentationArgs || !documentationKey) return;

    let cancelled = false;

    void (async () => {
      if (cancelled) return;
      setDocumentationRecords([]);
      setDocumentationStatus("LoadingFirstPage");
      setLoadedDocumentationKey(documentationKey);
      setDocumentationError(null);
      const records: DocumentationRecord[] = [];
      let cursor: string | null = null;

      try {
        while (true) {
          if (cancelled) return;
          if (records.length > 0) setDocumentationStatus("LoadingMore");
          const page: {
            page: DocumentationRecord[];
            continueCursor: string;
            isDone: boolean;
          } = await convex.query(api.ownCheckDocumentation.buildDocumentation, {
            ...documentationArgs,
            paginationOpts: {
              numItems: MAX_EXPORT_PAGE_SIZE,
              cursor,
            },
          });
          if (cancelled) return;
          for (const record of page.page) {
            const revisions = [...record.revisions];
            const attachments = new Map(
              record.attachments.map((attachment) => [
                attachment.id,
                attachment,
              ]),
            );
            let nextRevision = record.historyNextRevision;
            while (nextRevision !== null) {
              if (cancelled) return;
              const history = await convex.query(
                api.ownCheckDocumentation.listDocumentationHistory,
                {
                  entryId: record.id,
                  generatedAt: documentationArgs.generatedAt,
                  afterRevision: nextRevision,
                },
              );
              revisions.push(...history.revisions);
              for (const attachment of history.attachments)
                attachments.set(attachment.id, attachment);
              nextRevision = history.nextRevision;
            }
            if (cancelled) return;
            records.push({
              ...record,
              revisions,
              attachments: [...attachments.values()],
              historyNextRevision: null,
            });
          }
          setDocumentationRecords([...records]);
          if (records.length > MAX_EXPORT_RECORDS || page.isDone) {
            setDocumentationStatus("Exhausted");
            return;
          }
          cursor = page.continueCursor;
        }
      } catch (error) {
        if (!cancelled) {
          setDocumentationError({
            key: documentationKey,
            error:
              error instanceof Error
                ? error
                : new Error("Dokumentationen kunne ikke hentes"),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [convex, documentationArgs, documentationKey]);

  if (documentationError?.key === documentationKey)
    throw documentationError.error;

  const currentDocumentationRecords =
    documentationKey && loadedDocumentationKey === documentationKey
      ? documentationRecords
      : [];
  const currentDocumentationStatus =
    documentationKey && loadedDocumentationKey === documentationKey
      ? documentationStatus
      : "LoadingFirstPage";
  const completedTooLarge = Boolean(
    preparedForCurrent &&
    (currentDocumentationRecords.length > MAX_EXPORT_RECORDS ||
      (currentDocumentationRecords.length === MAX_EXPORT_RECORDS &&
        currentDocumentationStatus !== "Exhausted")),
  );
  const missingTooLarge = preparedForCurrent?.missing.truncated === true;
  const exportTooLarge = completedTooLarge || missingTooLarge;
  const reportReady = isDocumentationReportReady({
    entriesExhausted: currentDocumentationStatus === "Exhausted",
    entriesTruncated: completedTooLarge,
    prepared: Boolean(preparedForCurrent),
    missingTruncated: missingTooLarge,
  });
  const reportRecords = currentDocumentationRecords;
  const missing = preparedForCurrent?.missing.items ?? [];
  const exportName =
    locationId && locations
      ? fileNamePart(
          locations.find((location) => location.id === locationId)?.name ??
            "lokation",
        )
      : "lokation";
  const organizationName = organization.data?.name ?? "Organisation";
  const progressText =
    currentDocumentationStatus === "LoadingFirstPage"
      ? "Henter dokumentation…"
      : currentDocumentationStatus === "LoadingMore"
        ? `Henter flere registreringer (${reportRecords.length})…`
        : "Gør dokumentationen klar…";

  function invalidatePrepared() {
    setPrepared(null);
  }

  function updateRange(next: Partial<{ from: string; to: string }>) {
    if (!locationId) return;
    invalidatePrepared();
    setManualRange({
      locationId,
      from: next.from ?? fromDateKey,
      to: next.to ?? toDateKey,
    });
  }

  function choosePreset(preset: "week" | "month" | "quarter") {
    if (!dateContext?.todayDateKey || !locationId) return;
    const today = dateContext.todayDateKey;
    const from =
      preset === "week"
        ? startOfWeek(today)
        : preset === "month"
          ? `${today.slice(0, 8)}01`
          : shiftDate(today, -89);
    invalidatePrepared();
    setManualRange({ locationId, from, to: today });
  }

  async function prepareReport() {
    if (!locationId || !rangeValid) return;
    setPreparing(true);
    invalidatePrepared();
    try {
      const value = await prepare({ fromDateKey, toDateKey, locationId });
      setPrepared({ key: preparedKey, value: value as PreparedValue });
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Dokumentationen kunne ikke klargøres. Prøv igen.",
        ),
      );
    } finally {
      setPreparing(false);
    }
  }

  async function fetchAttachmentBytes(
    records: DocumentationRecord[],
  ): Promise<ExportAttachment[]> {
    const output: ExportAttachment[] = [];
    const selected: Array<{ outputIndex: number; url: string }> = [];
    let selectedCount = 0;
    let selectedBytes = 0;
    let limitReached = false;

    for (const record of records) {
      for (const attachment of record.attachments) {
        const field = record.fields.find(
          (candidate) => candidate.key === attachment.fieldKey,
        );
        const extension =
          attachment.contentType === "application/pdf"
            ? "pdf"
            : attachment.contentType === "image/png"
              ? "png"
              : "jpg";
        const metadata: ExportAttachment = {
          recordId: record.id,
          fieldKey: attachment.fieldKey,
          fieldLabel: field?.label ?? attachment.fieldKey,
          fileName: `${record.dueDateKey}-${String(record.id)}-${attachment.fieldKey}.${extension}`,
          contentType: attachment.contentType,
          addedAtRevision: attachment.addedAtRevision,
          removedAtRevision: attachment.removedAtRevision,
        };
        const outputIndex = output.length;
        output.push(metadata);
        if (!attachment.url) {
          output[outputIndex] = {
            ...metadata,
            omittedReason: "Filen var ikke tilgængelig ved eksporten.",
          };
          continue;
        }

        const fileSize = Number.isFinite(attachment.fileSize)
          ? Math.max(0, attachment.fileSize)
          : 0;
        if (
          limitReached ||
          selectedCount >= MAX_EMBEDDED_ATTACHMENTS ||
          selectedBytes + fileSize > MAX_EMBEDDED_ATTACHMENT_BYTES
        ) {
          limitReached = true;
          output[outputIndex] = {
            ...metadata,
            omittedReason:
              "Filen blev ikke indlejret på grund af eksportgrænsen.",
          };
          continue;
        }

        selectedCount += 1;
        selectedBytes += fileSize;
        selected.push({ outputIndex, url: attachment.url });
      }
    }

    let nextIndex = 0;
    async function fetchWorker() {
      while (true) {
        const item = selected[nextIndex];
        if (!item) return;
        nextIndex += 1;
        const response = await fetch(item.url);
        if (!response.ok) throw new Error("En vedhæftet fil kunne ikke hentes");
        const bytes = new Uint8Array(await response.arrayBuffer());
        output[item.outputIndex] = { ...output[item.outputIndex]!, bytes };
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(MAX_ATTACHMENT_FETCH_CONCURRENCY, selected.length) },
        () => fetchWorker(),
      ),
    );
    return output;
  }

  async function exportPdf() {
    if (!reportReady || !preparedForCurrent) {
      toast.error("Dokumentationen er ikke komplet endnu");
      return;
    }
    setGenerating(true);
    try {
      const [attachments, { buildInspectionPdf }] = await Promise.all([
        fetchAttachmentBytes(reportRecords),
        import("@/lib/own-check-pdf"),
      ]);
      let logoBytes: Uint8Array | null = null;
      if (branding?.wideLogoUrl) {
        try {
          const response = await fetch(branding.wideLogoUrl);
          if (response.ok)
            logoBytes = new Uint8Array(await response.arrayBuffer());
        } catch {
          logoBytes = null;
        }
      }
      const pdf = await buildInspectionPdf({
        header: {
          ...preparedForCurrent.header,
          organizationName,
          logoBytes,
          completedCount: reportRecords.length,
          deviationCount: reportRecords.filter((record) => record.hasDeviation)
            .length,
          missingCount: missing.length,
        },
        records: reportRecords.map((record) => ({
          ...record,
          values: record.values,
          attachments: attachments
            .filter((attachment) => attachment.recordId === record.id)
            .map((attachment) => ({
              fieldKey: attachment.fieldKey,
              fieldLabel: attachment.fieldLabel,
              fileName: attachment.fileName,
              contentType: attachment.contentType,
              ...(attachment.bytes ? { bytes: attachment.bytes } : {}),
              ...(attachment.omittedReason
                ? { omittedReason: attachment.omittedReason }
                : {}),
              addedAtRevision: attachment.addedAtRevision,
              removedAtRevision: attachment.removedAtRevision,
            })),
          revisions: record.revisions.map((revision) => ({
            ...revision,
            changes: revision.changes.map((change) => ({
              label: change.label,
              from: change.from,
              to: change.to,
            })),
          })),
        })),
        missing: missing.map((item) => ({
          dueDateKey: item.dueDateKey,
          dueAt: item.dueAt,
          name: item.name,
          responsibleRole: item.responsibleRole,
        })),
      });
      downloadBytes(
        `egenkontrol-${exportName}-${fromDateKey}-${toDateKey}.pdf`,
        pdf,
        "application/pdf",
      );
      toast.success("PDF-dokumentationen er hentet");
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "PDF-dokumentationen kunne ikke oprettes. Prøv igen.",
        ),
      );
    } finally {
      setGenerating(false);
    }
  }

  function exportCsv() {
    if (!reportReady || !preparedForCurrent) {
      toast.error("Dokumentationen er ikke komplet endnu");
      return;
    }
    downloadCsv(
      `egenkontrol-${exportName}-${fromDateKey}-${toDateKey}.csv`,
      [
        "Dato",
        "Tidspunkt",
        "Egenkontrol",
        "Kontroltype",
        "Lokation",
        "Udført af",
        "Felt",
        "Værdi",
        "Grænse",
        "Inden for grænsen",
        "Status",
        "Afvigelse",
        "Korrigerende handling",
        "Godkendt af",
        "Rettelser",
      ],
      csvRows(
        reportRecords,
        missing,
        preparedForCurrent.header.timeZone,
        preparedForCurrent.header.locationName,
      ),
    );
    toast.success("CSV-dokumentationen er hentet");
  }

  if (!canExport)
    return (
      <Alert variant="destructive">
        <AlertTitle>Ingen eksportadgang</AlertTitle>
        <AlertDescription>
          Du kan kun se dokumentation, hvis du har adgang til at eksportere
          kontroldokumentation.
        </AlertDescription>
      </Alert>
    );
  if (locations === undefined) return <Skeleton className="h-96 w-full" />;
  if (!locations.length || !locationId)
    return (
      <Empty className="min-h-72 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileDownIcon />
          </EmptyMedia>
          <EmptyTitle>Ingen lokationer</EmptyTitle>
          <EmptyDescription>
            Opret en lokation, før dokumentationen kan vises.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Dokumentation</h2>
        <p className="text-sm text-muted-foreground">
          Eksportér udførte og manglende kontroller til PDF eller CSV.
        </p>
      </div>
      <FieldGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="own-documentation-location">Lokation</FieldLabel>
          <LocationField
            id="own-documentation-location"
            locations={locations}
            value={locationId}
            locked={isLocked}
            lockedName={lockedName}
            onValueChange={(value) => {
              invalidatePrepared();
              setSelectedLocation(value as Id<"locations">);
            }}
          />
        </Field>
        <Field data-invalid={!rangeValid}>
          <FieldLabel htmlFor="own-documentation-from">Fra dato</FieldLabel>
          <Input
            id="own-documentation-from"
            type="date"
            className="h-11"
            value={fromDateKey}
            aria-invalid={!rangeValid}
            onChange={(event) => updateRange({ from: event.target.value })}
          />
        </Field>
        <Field data-invalid={!rangeValid}>
          <FieldLabel htmlFor="own-documentation-to">Til dato</FieldLabel>
          <Input
            id="own-documentation-to"
            type="date"
            className="h-11"
            value={toDateKey}
            aria-invalid={!rangeValid}
            onChange={(event) => updateRange({ to: event.target.value })}
          />
        </Field>
        <Field>
          <div className="flex items-center gap-1">
            <FieldLabel htmlFor="own-documentation-period">
              Hurtig periode
            </FieldLabel>
            <HelpTooltip
              label="Dokumentationsperiode"
              content="Vælg en periode på højst 366 dage. Eksporten medtager både udførte og manglende kontroller."
            />
          </div>
          <Select
            items={[
              { value: "week", label: "Denne uge" },
              { value: "month", label: "Denne måned" },
              { value: "quarter", label: "Sidste 3 måneder" },
            ]}
            onValueChange={(value) =>
              value && choosePreset(value as "week" | "month" | "quarter")
            }
          >
            <SelectTrigger
              id="own-documentation-period"
              className="min-h-11 w-full"
            >
              <SelectValue placeholder="Vælg periode" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="week">Denne uge</SelectItem>
                <SelectItem value="month">Denne måned</SelectItem>
                <SelectItem value="quarter">Sidste 3 måneder</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      {!rangeValid ? (
        <Alert variant="destructive">
          <AlertTitle>Ugyldig periode</AlertTitle>
          <AlertDescription>
            Vælg en periode på mellem 1 og 366 dage, hvor fra-datoen ligger før
            til-datoen.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          className="min-h-11"
          disabled={!rangeValid || preparing || generating}
          onClick={() => void prepareReport()}
        >
          {preparing ? <Spinner data-icon="inline-start" /> : null}
          {preparedForCurrent ? "Opdatér dokumentation" : "Vis dokumentation"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={!reportReady || generating}
          onClick={() => void exportPdf()}
        >
          {generating ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <FileDownIcon data-icon="inline-start" />
          )}
          Hent PDF
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={!reportReady || generating}
          onClick={exportCsv}
        >
          <DownloadIcon data-icon="inline-start" />
          Eksportér CSV
        </Button>
      </div>
      {preparing ? (
        <Empty className="min-h-72 border" role="status">
          <EmptyHeader>
            <EmptyMedia>
              <Spinner />
            </EmptyMedia>
            <EmptyTitle>Forbereder dokumentationen…</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : exportTooLarge ? (
        <Alert variant="destructive">
          <AlertTitle>Dokumentationen er for stor</AlertTitle>
          <AlertDescription>
            Rapporten indeholder for mange registreringer eller manglende
            kontroller. Vælg en kortere periode.
          </AlertDescription>
        </Alert>
      ) : !preparedForCurrent ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileDownIcon />
            </EmptyMedia>
            <EmptyTitle>Vælg den periode, du vil dokumentere</EmptyTitle>
            <EmptyDescription>
              Tryk på &quot;Vis dokumentation&quot;. Alle registreringer hentes,
              før rapporten kan eksporteres.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : !reportReady ? (
        <Empty className="min-h-72 border" role="status">
          <EmptyHeader>
            <EmptyMedia>
              <Spinner />
            </EmptyMedia>
            <EmptyTitle>{progressText}</EmptyTitle>
            <EmptyDescription>
              Alle sider hentes, før rapporten kan eksporteres.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <InspectionReport
          header={{
            organizationName,
            locationName: preparedForCurrent.header.locationName,
            fromDateKey,
            toDateKey,
            generatedAt: preparedForCurrent.header.generatedAt,
            generatedBy: preparedForCurrent.header.generatedBy,
            timeZone: preparedForCurrent.header.timeZone,
          }}
          records={reportRecords}
          missing={missing}
        />
      )}
    </div>
  );
}
