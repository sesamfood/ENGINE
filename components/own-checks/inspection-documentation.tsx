"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { DownloadIcon, FileDownIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { downloadCsv } from "@/lib/download-csv";
import { buildInspectionPdf } from "@/lib/own-check-pdf";
import { formatValue, evaluateCompliance, ownCheckControlTypeLabels, ownCheckStatusLabels } from "@/lib/own-checks";
import { LocationField } from "@/components/location-field";
import { useKiosk, useLocationAccess, usePermission } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { InspectionReport, type DocumentationRecord, type MissingRecord } from "./inspection-report";

function dateKey(offsetDays = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(now);
}

function shiftDate(dateKeyValue: string, days: number) {
  const date = new Date(`${dateKeyValue}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(date);
}

function startOfWeek(dateKeyValue: string) {
  const date = new Date(`${dateKeyValue}T12:00:00Z`);
  const weekday = date.getUTCDay();
  return shiftDate(dateKeyValue, weekday === 0 ? -6 : 1 - weekday);
}

function rangeDays(from: string, to: string) {
  return (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000 + 1;
}

function limitText(field: DocumentationRecord["fields"][number]) {
  if (field.type !== "number") return "—";
  const unit = field.unit ? ` ${field.unit}` : "";
  const number = (value: number) => String(value).replace(".", ",");
  if (field.min !== undefined && field.max !== undefined) return `${number(field.min)}–${number(field.max)}${unit}`;
  if (field.min !== undefined) return `Mindst ${number(field.min)}${unit}`;
  if (field.max !== undefined) return `Højst ${number(field.max)}${unit}`;
  return "—";
}

function fileNamePart(value: string) {
  return value.toLocaleLowerCase("da").replace(/[^a-z0-9æøå]+/giu, "-").replace(/^-|-$/gu, "") || "lokation";
}

function downloadBytes(name: string, bytes: Uint8Array, type: string) {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function csvRows(records: DocumentationRecord[], missing: MissingRecord[], timeZone: string, locationName: string) {
  const rows: string[][] = [];
  for (const record of records) {
    const compliance = evaluateCompliance(record.fields, record.values as never);
    const violations = new Map(compliance.violations.map((violation) => [violation.key, violation]));
    const revisions = record.revisions.slice(1).map((revision) => `Revision ${revision.revision}: ${revision.reason ?? "uden begrundelse"}`).join(" | ");
    for (const value of record.values) {
      const field = record.fields.find((candidate) => candidate.key === value.key);
      if (!field) continue;
      const violation = violations.get(field.key);
      rows.push([
        record.dueDateKey,
        new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short", timeZone }).format(record.performedAt),
        record.name,
        ownCheckControlTypeLabels[record.controlType],
        record.locationName,
        record.performedByName,
        field.label,
        formatValue(field, value as never),
        limitText(field),
        violation ? "Nej" : "Ja",
        ownCheckStatusLabels[record.status],
        record.deviation?.description ?? "",
        record.correctiveAction?.description ?? "",
        record.approvedByName ?? "",
        revisions,
      ]);
    }
  }
  for (const item of missing) rows.push([item.dueDateKey, `Kl. ${new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", timeZone }).format(item.dueAt)}`, item.name, ownCheckControlTypeLabels[item.controlType], locationName, "", "", "", "", "", "Ikke udført", "", "", "", ""]);
  return rows;
}

const MAX_EXPORT_RECORDS = 5_000;

export function InspectionDocumentation() {
  const organization = authClient.useActiveOrganization();
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const kiosk = useKiosk();
  const canExport = usePermission("ownChecks.export") || Boolean(kiosk?.kioskModeEnabled && kiosk.settings?.enabledPages.includes("ownChecks.documentation"));
  const [selectedLocation, setSelectedLocation] = useState<Id<"locations"> | null>(lockedId);
  const [fromDateKey, setFromDateKey] = useState(() => startOfWeek(dateKey()));
  const [toDateKey, setToDateKey] = useState(() => dateKey());
  const [generating, setGenerating] = useState(false);
  const locationId = lockedId ?? selectedLocation ?? locations?.[0]?.id ?? null;
  const days = rangeDays(fromDateKey, toDateKey);
  const rangeValid = Boolean(fromDateKey && toDateKey && days >= 1 && days <= 366);
  const args = canExport && locationId && rangeValid ? { paginationOpts: { numItems: 25, cursor: null }, fromDateKey, toDateKey, locationId } : "skip";
  const { results, status, loadMore } = usePaginatedQuery(api.ownCheckDocumentation.buildDocumentation, args, { initialNumItems: 25 });
  const header = useQuery(api.ownCheckDocumentation.getDocumentationHeader, args === "skip" ? "skip" : { fromDateKey, toDateKey, locationId: locationId! });
  const missingResult = useQuery(api.ownCheckDocumentation.listMissingOwnChecks, args === "skip" ? "skip" : { fromDateKey, toDateKey, locationId: locationId! });
  const branding = useQuery(api.organization.getBranding, canExport && organization.data ? {} : "skip");

  useEffect(() => {
    if (status === "CanLoadMore" && results.length < MAX_EXPORT_RECORDS) loadMore(25);
  }, [loadMore, results.length, status]);

  const exportTooLarge = results.length >= MAX_EXPORT_RECORDS && status !== "Exhausted";
  const reportReady = status === "Exhausted" && !exportTooLarge && header !== undefined && missingResult !== undefined;
  const reportRecords = results as DocumentationRecord[];
  const missing = missingResult?.items ?? [];
  const exportName = locationId && locations ? fileNamePart(locations.find((location) => location.id === locationId)?.name ?? "lokation") : "lokation";
  const organizationName = organization.data?.name ?? "Organisation";
  const progressText = status === "LoadingFirstPage" ? "Henter dokumentation…" : status === "LoadingMore" ? `Henter flere registreringer (${results.length})…` : "Gør dokumentationen klar…";

  function choosePreset(preset: "week" | "month" | "quarter") {
    const today = dateKey();
    if (preset === "week") setFromDateKey(startOfWeek(today));
    if (preset === "month") setFromDateKey(`${today.slice(0, 8)}01`);
    if (preset === "quarter") setFromDateKey(shiftDate(today, -89));
    setToDateKey(today);
  }

  async function fetchAttachmentBytes(records: DocumentationRecord[]) {
    let totalBytes = 0;
    const output = [];
    for (const record of records) {
      for (const attachment of record.attachments) {
        if (!attachment.url) continue;
        const response = await fetch(attachment.url);
        if (!response.ok) throw new Error("En vedhæftet fil kunne ikke hentes");
        const bytes = new Uint8Array(await response.arrayBuffer());
        totalBytes += bytes.byteLength;
        if (totalBytes > 100 * 1024 * 1024) throw new Error("PDF-eksporten er for stor. Vælg en kortere periode.");
        const field = record.fields.find((candidate) => candidate.key === attachment.fieldKey);
        const extension = attachment.contentType === "application/pdf" ? "pdf" : attachment.contentType === "image/png" ? "png" : "jpg";
        output.push({ recordId: record.id, fieldKey: attachment.fieldKey, fieldLabel: field?.label ?? attachment.fieldKey, fileName: `${record.dueDateKey}-${String(record.id)}-${attachment.fieldKey}.${extension}`, contentType: attachment.contentType, bytes, addedAtRevision: attachment.addedAtRevision, removedAtRevision: attachment.removedAtRevision });
      }
    }
    return output;
  }

  async function exportPdf() {
    if (!reportReady || !header) return;
    setGenerating(true);
    try {
      let logoBytes: Uint8Array | null = null;
      if (branding?.wideLogoUrl) {
        try { const response = await fetch(branding.wideLogoUrl); if (response.ok) logoBytes = new Uint8Array(await response.arrayBuffer()); } catch { logoBytes = null; }
      }
      const attachments = await fetchAttachmentBytes(reportRecords);
      const pdf = await buildInspectionPdf({
        header: {
          ...header,
          organizationName,
          logoBytes,
          completedCount: reportRecords.length,
          deviationCount: reportRecords.filter((record) => record.hasDeviation).length,
          missingCount: missing.length,
        },
        records: reportRecords.map((record) => ({ ...record, values: record.values as never, attachments: attachments.filter((attachment) => attachment.recordId === record.id).map((attachment) => ({ fieldKey: attachment.fieldKey, fieldLabel: attachment.fieldLabel, fileName: attachment.fileName, contentType: attachment.contentType, bytes: attachment.bytes, addedAtRevision: attachment.addedAtRevision, removedAtRevision: attachment.removedAtRevision })), revisions: record.revisions.map((revision) => ({ ...revision, changes: revision.changes.map((change) => ({ label: change.label, from: change.from, to: change.to })) })) })),
        missing: missing.map((item) => ({ dueDateKey: item.dueDateKey, dueAt: item.dueAt, name: item.name, responsibleRole: item.responsibleRole })),
      });
      downloadBytes(`egenkontrol-${exportName}-${fromDateKey}-${toDateKey}.pdf`, pdf, "application/pdf");
      toast.success("PDF-dokumentationen er hentet");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "PDF-dokumentationen kunne ikke oprettes");
    } finally {
      setGenerating(false);
    }
  }

  function exportCsv() {
    if (!reportReady) return;
    downloadCsv(`egenkontrol-${exportName}-${fromDateKey}-${toDateKey}.csv`, ["Dato", "Tidspunkt", "Egenkontrol", "Kontroltype", "Lokation", "Udført af", "Felt", "Værdi", "Grænse", "Inden for grænsen", "Status", "Afvigelse", "Korrigerende handling", "Godkendt af", "Rettelser"], csvRows(reportRecords, missing, header?.timeZone ?? "Europe/Copenhagen", header?.locationName ?? ""));
    toast.success("CSV-dokumentationen er hentet");
  }

  if (!canExport) return <Alert variant="destructive"><AlertTitle>Ingen eksportadgang</AlertTitle><AlertDescription>Du kan kun se dokumentation, hvis du har adgang til at eksportere kontroldokumentation.</AlertDescription></Alert>;
  if (locations === undefined) return <Skeleton className="h-96 w-full" />;
  if (!locations.length || !locationId) return <Card><CardContent className="p-8 text-center text-muted-foreground">Opret en lokation, før dokumentationen kan vises.</CardContent></Card>;

  return <div className="flex flex-col gap-5">
    <Card><CardContent className="pt-6"><FieldGroup className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><Field className="xl:col-span-2"><FieldLabel htmlFor="own-documentation-location">Lokation</FieldLabel><LocationField id="own-documentation-location" locations={locations} value={locationId} locked={isLocked} lockedName={lockedName} onValueChange={(value) => setSelectedLocation(value as Id<"locations">)} /></Field><Field><FieldLabel htmlFor="own-documentation-from">Fra dato</FieldLabel><Input id="own-documentation-from" type="date" value={fromDateKey} onChange={(event) => setFromDateKey(event.target.value)} /></Field><Field><FieldLabel htmlFor="own-documentation-to">Til dato</FieldLabel><Input id="own-documentation-to" type="date" value={toDateKey} onChange={(event) => setToDateKey(event.target.value)} /></Field><Field><FieldLabel>Hurtig periode</FieldLabel><Select items={[{ value: "week", label: "Denne uge" }, { value: "month", label: "Denne måned" }, { value: "quarter", label: "Sidste 3 måneder" }]} onValueChange={(value) => value && choosePreset(value as "week" | "month" | "quarter")}><SelectTrigger className="w-full"><SelectValue placeholder="Vælg periode" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="week">Denne uge</SelectItem><SelectItem value="month">Denne måned</SelectItem><SelectItem value="quarter">Sidste 3 måneder</SelectItem></SelectGroup></SelectContent></Select></Field></FieldGroup><FieldDescription className="mt-4">Vælg højst 366 dage. PDF- og CSV-eksporten indeholder både udførte og manglende kontroller.</FieldDescription></CardContent></Card>
    {!rangeValid ? <Alert variant="destructive"><AlertTitle>Ugyldig periode</AlertTitle><AlertDescription>Vælg en periode på mellem 1 og 366 dage, hvor fra-datoen ligger før til-datoen.</AlertDescription></Alert> : null}
    <div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" disabled={!reportReady || generating} onClick={() => void exportPdf()}>{generating ? <Spinner data-icon="inline-start" /> : <FileDownIcon data-icon="inline-start" />}Hent PDF</Button><Button variant="outline" className="min-h-11" disabled={!reportReady || generating} onClick={exportCsv}><DownloadIcon data-icon="inline-start" />Eksportér CSV</Button></div>
    {exportTooLarge ? <Alert variant="destructive"><AlertTitle>Perioden er for stor</AlertTitle><AlertDescription>Dokumentationen indeholder mindst 5.000 registreringer. Vælg en kortere periode.</AlertDescription></Alert> : !reportReady || !header ? <Card><CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center text-muted-foreground"><Spinner /><p>{progressText}</p><p className="text-sm">Alle sider hentes, før rapporten kan eksporteres.</p></CardContent></Card> : <><InspectionReport header={{ organizationName, locationName: header.locationName, fromDateKey, toDateKey, generatedAt: header.generatedAt, generatedBy: header.generatedBy, timeZone: header.timeZone }} records={reportRecords} missing={missing} />{missingResult?.truncated ? <Alert><AlertTitle>Rapporten er afgrænset</AlertTitle><AlertDescription>Der er flere end 5.000 manglende kontroller. Vælg en kortere periode for at få hele listen med.</AlertDescription></Alert> : null}</>}
  </div>;
}
