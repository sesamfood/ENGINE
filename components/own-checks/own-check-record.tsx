"use client";

import { useMutation, useQuery } from "convex/react";
import {
  CheckCircle2Icon,
  FileIcon,
  PencilIcon,
  SaveIcon,
  ShieldCheckIcon,
  WrenchIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { usePermission } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { compressImage } from "@/lib/compress-image";
import {
  evaluateCompliance,
  formatValue,
  ownCheckControlTypeLabels,
  ownCheckStatusLabels,
  type OwnCheckField,
  type OwnCheckValue,
} from "@/lib/own-checks";

type RecordResult = NonNullable<ReturnType<typeof useQuery<typeof api.ownChecks.getOwnCheckRecord>>>;
type RecordField = RecordResult["fields"][number];
type RecordValue = OwnCheckValue;

const revisionKindLabels = {
  submitted: "Oprindelig registrering",
  edited: "Rettelse",
  deviationRecorded: "Afvigelse registreret",
  correctiveActionRecorded: "Korrigerende handling",
  approved: "Godkendelse",
} as const;

function formatDateTime(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(timestamp);
}

function formatDate(dateKey: string) {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${dateKey}T12:00:00Z`));
}

function limitText(field: RecordField) {
  if (field.type !== "number") return "Ingen fast grænse";
  const unit = field.unit ? ` ${field.unit}` : "";
  if (field.min !== undefined && field.max !== undefined) return `${String(field.min).replace(".", ",")}–${String(field.max).replace(".", ",")}${unit}`;
  if (field.min !== undefined) return `Mindst ${String(field.min).replace(".", ",")}${unit}`;
  if (field.max !== undefined) return `Højst ${String(field.max).replace(".", ",")}${unit}`;
  return "Ingen fast grænse";
}

function valueFor(values: RecordValue[], key: string) {
  return values.find((value) => value.key === key);
}

function StatusBadge({ status, hasDeviation }: { status: keyof typeof ownCheckStatusLabels; hasDeviation: boolean }) {
  const actualStatus = status === "approved" ? "approved" : hasDeviation ? "deviation" : status;
  return <Badge variant={actualStatus === "deviation" ? "destructive" : actualStatus === "approved" ? "default" : "secondary"}>{actualStatus === "approved" ? <CheckCircle2Icon data-icon="inline-start" /> : null}{ownCheckStatusLabels[actualStatus]}</Badge>;
}

function AttachmentList({ record, fieldKey, revision = record.entry.revision }: { record: RecordResult; fieldKey: string; revision?: number }) {
  const attachments = record.attachments.filter((attachment) => attachment.fieldKey === fieldKey && attachment.addedAtRevision <= revision && (attachment.removedAtRevision === null || attachment.removedAtRevision > revision));
  if (!attachments.length) return null;
  return <div className="mt-2 flex flex-wrap gap-2">{attachments.map((attachment, index) => attachment.url ? <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="group flex min-h-20 w-28 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border bg-muted/30 text-xs focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{attachment.contentType.startsWith("image/") ? <img src={attachment.url} alt={`Dokumentation ${index + 1}`} className="h-14 w-full object-cover" /> : <FileIcon className="size-8 text-muted-foreground" />}{attachment.contentType.startsWith("image/") ? <span className="sr-only">Åbn billede</span> : <span>Åbn PDF</span>}</a> : null)}</div>;
}

function FieldEditor({
  field,
  value,
  onChange,
  onRemoveAttachment,
  onUpload,
  uploading,
}: {
  field: OwnCheckField;
  value: RecordValue | undefined;
  onChange: (value: RecordValue | null) => void;
  onRemoveAttachment: (storageId: string) => void;
  onUpload: (field: Extract<OwnCheckField, { type: "attachment" }>, files: FileList | null) => void;
  uploading: boolean;
}) {
  return <Field>
    <FieldLabel htmlFor={`edit-own-check-${field.key}`}>{field.label}{field.required ? " *" : ""}</FieldLabel>
    {field.type === "number" ? <Input id={`edit-own-check-${field.key}`} type="number" inputMode="decimal" step={field.decimals === undefined ? "any" : 1 / 10 ** field.decimals} value={value?.type === "number" ? value.number : ""} onChange={(event) => onChange(event.target.value === "" ? null : { key: field.key, type: "number", number: Number(event.target.value) })} /> : null}
    {field.type === "checkbox" ? <Switch id={`edit-own-check-${field.key}`} checked={value?.type === "checkbox" ? value.checked : false} onCheckedChange={(checked) => onChange({ key: field.key, type: "checkbox", checked })} /> : null}
    {field.type === "choice" ? <RadioGroup value={value?.type === "choice" ? value.value : ""} onValueChange={(next) => onChange({ key: field.key, type: "choice", value: next })} className="gap-2">{field.options.map((option) => <label key={option.value} className="flex min-h-11 items-center gap-3 rounded-md border px-3"><RadioGroupItem value={option.value} id={`edit-own-check-${field.key}-${option.value}`} />{option.label}</label>)}</RadioGroup> : null}
    {field.type === "text" ? <Textarea id={`edit-own-check-${field.key}`} value={value?.type === "text" ? value.text : ""} maxLength={field.maxLength ?? 2_000} onChange={(event) => onChange({ key: field.key, type: "text", text: event.target.value })} /> : null}
    {field.type === "attachment" ? <div className="flex flex-col gap-2"><Input id={`edit-own-check-${field.key}`} type="file" accept="image/jpeg,image/png,application/pdf" multiple={field.maxFiles > 1} disabled={uploading || (value?.type === "attachment" && value.storageIds.length >= field.maxFiles)} onChange={(event) => onUpload(field, event.target.files)} /><div className="flex flex-wrap gap-2">{value?.type === "attachment" ? value.storageIds.map((storageId) => <Button key={storageId} type="button" variant="outline" size="sm" onClick={() => onRemoveAttachment(storageId)}>Fjern fil</Button>) : null}</div></div> : null}
    {field.type === "number" && (field.min !== undefined || field.max !== undefined || field.unit) ? <FieldDescription>{limitText(field)}</FieldDescription> : null}
  </Field>;
}

export function OwnCheckRecord({ entryId, onClose }: { entryId: Id<"ownCheckEntries">; onClose: () => void }) {
  const record = useQuery(api.ownChecks.getOwnCheckRecord, { entryId });
  const canApprove = usePermission("ownChecks.approve");
  const approvalSettings = useQuery(api.ownChecks.getApprovalSettings, canApprove ? {} : "skip");
  const canEdit = usePermission("ownChecks.edit");
  const canCorrect = usePermission("ownChecks.correct");
  const edit = useMutation(api.ownChecks.editOwnCheck);
  const recordCorrectiveAction = useMutation(api.ownChecks.recordCorrectiveAction);
  const approve = useMutation(api.ownChecks.approveOwnCheck);
  const uploadUrl = useMutation(api.ownChecks.generateAttachmentUploadUrl);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<RecordValue[]>([]);
  const [editNote, setEditNote] = useState("");
  const [editDeviation, setEditDeviation] = useState("");
  const [editCorrectiveAction, setEditCorrectiveAction] = useState("");
  const [editReason, setEditReason] = useState("");
  const [correctiveDraft, setCorrectiveDraft] = useState<string | null>(null);
  const [correctiveReason, setCorrectiveReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const compliance = useMemo(() => record ? evaluateCompliance(record.fields, record.entry.values as unknown as RecordValue[]) : null, [record]);
  if (record === undefined) return <div className="flex min-h-48 items-center justify-center"><Spinner /></div>;
  if (record === null) return <div className="p-6 text-center text-muted-foreground">Egenkontrollen blev ikke fundet.</div>;
  const currentRecord = record;

  const values = record.entry.values as unknown as RecordValue[];
  const correctiveDescription = correctiveDraft ?? record.entry.correctiveAction?.description ?? "";
  const violations = new Map((compliance?.violations ?? []).map((violation) => [violation.key, violation]));

  function openEditor() {
    setEditValues(values.map((value) => ({ ...value, ...(value.type === "attachment" ? { storageIds: [...value.storageIds] } : {}) })));
    setEditNote(currentRecord.entry.note ?? "");
    setEditDeviation(currentRecord.entry.deviation?.description ?? "");
    setEditCorrectiveAction(currentRecord.entry.correctiveAction?.description ?? "");
    setEditReason("");
    setEditing(true);
  }

  function setEditValue(fieldKey: string, next: RecordValue | null) {
    if (!next) {
      setEditValues((current) => current.filter((value) => value.key !== fieldKey));
      return;
    }
    setEditValues((current) => [...current.filter((value) => value.key !== fieldKey), next]);
  }

  async function uploadFiles(field: Extract<OwnCheckField, { type: "attachment" }>, files: FileList | null) {
    if (!files?.length) return;
    const current = valueFor(editValues, field.key);
    const existing = current?.type === "attachment" ? current.storageIds : [];
    if (existing.length + files.length > field.maxFiles) {
      toast.error(`Feltet må højst have ${field.maxFiles} filer`);
      return;
    }
    setUploadingKey(field.key);
    try {
      const storageIds: string[] = [];
      for (const file of Array.from(files)) {
        if (file.type === "application/pdf") {
          const signature = new TextDecoder().decode(new Uint8Array(await file.slice(0, 5).arrayBuffer()));
          if (signature !== "%PDF-") throw new Error("PDF-filen er ugyldig");
        }
        const prepared = file.type === "image/jpeg" || file.type === "image/png"
          ? await compressImage(file, { maxWidth: 2_000, maxHeight: 2_000, quality: 0.8, type: "image/jpeg", alwaysReencode: true })
          : file;
        const url = await uploadUrl({});
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": prepared.type }, body: prepared });
        if (!response.ok) throw new Error("Filen kunne ikke uploades");
        const result = (await response.json()) as { storageId?: string };
        if (!result.storageId) throw new Error("Filen kunne ikke uploades");
        storageIds.push(result.storageId);
      }
      setEditValue(field.key, { key: field.key, type: "attachment", storageIds: [...existing, ...storageIds] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Filen kunne ikke uploades");
    } finally {
      setUploadingKey(null);
    }
  }

  async function saveEdit() {
    if (!editReason.trim()) {
      toast.error("Skriv en begrundelse for rettelsen");
      return;
    }
    const editCompliance = evaluateCompliance(currentRecord.fields, editValues);
    if (!editCompliance.compliant && !editDeviation.trim()) {
      toast.error("Beskriv afvigelsen");
      return;
    }
    setSaving(true);
    try {
      await edit({
        entryId,
        values: editValues.map((value) => value.type === "attachment" ? { ...value, storageIds: value.storageIds as Id<"_storage">[] } : value),
        note: editNote,
        deviationDescription: editDeviation,
        correctiveAction: editCorrectiveAction,
        reason: editReason,
      });
      toast.success("Rettelsen er gemt");
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rettelsen kunne ikke gemmes");
    } finally {
      setSaving(false);
    }
  }

  async function saveCorrectiveAction() {
    if (!correctiveDescription.trim() || (currentRecord.entry.correctiveAction && !correctiveReason.trim())) return;
    setSaving(true);
    try {
      await recordCorrectiveAction({ entryId, description: correctiveDescription, ...(currentRecord.entry.correctiveAction ? { reason: correctiveReason } : {}) });
      toast.success(currentRecord.entry.correctiveAction ? "Den korrigerende handling er erstattet" : "Den korrigerende handling er registreret");
      setCorrectiveReason("");
      setCorrectiveDraft(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Handlingen kunne ikke registreres");
    } finally {
      setSaving(false);
    }
  }

  async function approveRecord() {
    setSaving(true);
    try {
      await approve({ entryId });
      toast.success("Egenkontrollen er godkendt");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Egenkontrollen kunne ikke godkendes");
    } finally {
      setSaving(false);
    }
  }

  return <div className="flex flex-col gap-5">
    <div className="flex flex-col gap-3 border-b pb-4 pr-8 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><h2 className="font-heading text-xl font-semibold">{record.entry.name}</h2><p className="mt-1 text-sm text-muted-foreground">{record.entry.locationName} · {ownCheckControlTypeLabels[record.entry.controlType]} · {formatDate(record.entry.dueDateKey)}</p><p className="text-sm text-muted-foreground">Planlagt {formatDateTime(record.entry.dueAt, record.timeZone)} · Udført {formatDateTime(record.entry.performedAt, record.timeZone)} af {record.entry.performedByName}</p></div>
      <StatusBadge status={record.entry.status === "approved" ? "approved" : record.entry.hasDeviation ? "deviation" : "completed"} hasDeviation={record.entry.hasDeviation} />
    </div>

    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <Card><CardHeader><CardTitle>Kontrolpunkter</CardTitle><p className="text-sm text-muted-foreground">{record.description || "Ingen yderligere beskrivelse."}</p></CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Felt</TableHead><TableHead>Værdi</TableHead><TableHead>Grænse</TableHead><TableHead>Vurdering</TableHead></TableRow></TableHeader><TableBody>{record.fields.map((field) => { const value = valueFor(values, field.key); const violation = violations.get(field.key); return <TableRow key={field.key}><TableCell className="font-medium">{field.label}</TableCell><TableCell><div>{formatValue(field, value)}</div>{field.type === "attachment" ? <AttachmentList record={record} fieldKey={field.key} /> : null}</TableCell><TableCell className="text-muted-foreground">{limitText(field)}</TableCell><TableCell>{violation ? <span className="text-sm text-destructive">{violation.message}</span> : <span className="text-sm text-muted-foreground">Inden for grænsen</span>}</TableCell></TableRow>; })}</TableBody></Table></div></CardContent></Card>
      <div className="flex flex-col gap-4">
        <Card><CardHeader><CardTitle>Registrering</CardTitle></CardHeader><CardContent className="flex flex-col gap-2 text-sm"><div className="flex justify-between gap-3"><span className="text-muted-foreground">Registreret af</span><span className="text-right">{record.entry.performedByName}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Revision</span><span>{record.entry.revision}</span></div><div className="flex justify-between gap-3"><span className="text-muted-foreground">Opfølgning</span><span>{record.entry.followUp === "open" ? "Åben" : record.entry.followUp === "resolved" ? "Løst" : "Ingen"}</span></div>{record.entry.approvedByName ? <div className="flex justify-between gap-3"><span className="text-muted-foreground">Godkendt af</span><span className="text-right">{record.entry.approvedByName}</span></div> : null}</CardContent></Card>
        {record.entry.note ? <Card><CardHeader><CardTitle>Note</CardTitle></CardHeader><CardContent className="whitespace-pre-wrap text-sm">{record.entry.note}</CardContent></Card> : null}
      </div>
    </div>

    {record.entry.deviation ? <Card className="border-destructive/40"><CardHeader><CardTitle className="flex items-center gap-2 text-destructive"><WrenchIcon className="size-4" />Afvigelse</CardTitle></CardHeader><CardContent className="flex flex-col gap-1 text-sm"><p className="whitespace-pre-wrap">{record.entry.deviation.description}</p><p className="text-muted-foreground">Registreret {formatDateTime(record.entry.deviation.recordedAt, record.timeZone)} af {record.entry.deviation.recordedByName}</p></CardContent></Card> : null}
    {record.entry.correctiveAction ? <Card><CardHeader><CardTitle>Korrigerende handling</CardTitle></CardHeader><CardContent className="flex flex-col gap-1 text-sm"><p className="whitespace-pre-wrap">{record.entry.correctiveAction.description}</p><p className="text-muted-foreground">Registreret {formatDateTime(record.entry.correctiveAction.recordedAt, record.timeZone)} af {record.entry.correctiveAction.recordedByName}</p></CardContent></Card> : null}

    {(canCorrect && record.entry.hasDeviation && record.entry.status !== "approved") || canApprove || canEdit ? <Card><CardHeader><CardTitle>Handlinger</CardTitle></CardHeader><CardContent className="flex flex-col gap-4">
      {canCorrect && record.entry.hasDeviation && record.entry.status !== "approved" ? <FieldGroup><Field><FieldLabel htmlFor="own-check-corrective-action">{record.entry.correctiveAction ? "Ny korrigerende handling" : "Korrigerende handling"}</FieldLabel><Textarea id="own-check-corrective-action" value={correctiveDescription} onChange={(event) => setCorrectiveDraft(event.target.value)} placeholder="Beskriv, hvad der er gjort" /><FieldDescription>Den første handling kan registreres uden begrundelse. En erstatning kræver en begrundelse.</FieldDescription></Field>{record.entry.correctiveAction ? <Field><FieldLabel htmlFor="own-check-corrective-reason">Begrundelse for erstatning</FieldLabel><Textarea id="own-check-corrective-reason" value={correctiveReason} onChange={(event) => setCorrectiveReason(event.target.value)} placeholder="Skriv, hvorfor handlingen erstattes" /></Field> : null}<Button type="button" className="min-h-11 self-start" disabled={saving || !correctiveDescription.trim() || Boolean(record.entry.correctiveAction && !correctiveReason.trim())} onClick={() => void saveCorrectiveAction()}><WrenchIcon data-icon="inline-start" />{record.entry.correctiveAction ? "Erstat handling" : "Registrer handling"}</Button></FieldGroup> : null}
      {canApprove && record.entry.status !== "approved" ? <div className="flex flex-col gap-2 rounded-lg border p-3"><div className="flex items-center gap-1 text-sm font-medium"><ShieldCheckIcon className="size-4" />Godkendelse<HelpTooltip label="Godkendelse" content={approvalSettings?.requireSecondPersonApproval ? "Godkendelse kræver en anden person. Brugere, der administrerer egenkontroller, kan godkende egne registreringer." : "Denne organisation tillader selv-godkendelse."} /></div>{record.entry.followUp === "open" ? <p className="text-sm text-destructive">Afvigelsen skal følges op, før kontrollen kan godkendes.</p> : <Button type="button" className="min-h-11 self-start" disabled={saving} onClick={() => void approveRecord()}><ShieldCheckIcon data-icon="inline-start" />Godkend egenkontrol</Button>}</div> : null}
      {canEdit && record.entry.status !== "approved" ? <Button type="button" variant="outline" className="min-h-11 self-start" onClick={openEditor}><PencilIcon data-icon="inline-start" />Ret registrering</Button> : null}
    </CardContent></Card> : null}

    <Card><CardHeader><CardTitle>Ændringshistorik</CardTitle></CardHeader><CardContent className="flex flex-col gap-4">{record.revisions.map((revision, index) => <div key={revision.id} className="relative pl-5 before:absolute before:top-1 before:bottom-0 before:left-1 before:w-px before:bg-border last:before:bottom-auto last:before:h-1"><div className="absolute top-1 left-0 size-2 rounded-full bg-primary" /><div className="flex flex-col gap-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">Revision {revision.revision}</span><Badge variant={index === 0 ? "secondary" : "outline"}>{revisionKindLabels[revision.kind]}</Badge><span className="text-sm text-muted-foreground">{formatDateTime(revision.at, record.timeZone)} · {revision.actorName}</span></div>{revision.reason ? <p className="text-sm text-muted-foreground">Begrundelse: {revision.reason}</p> : null}{revision.changes.length ? <ul className="flex flex-col gap-1 text-sm">{revision.changes.map((change) => <li key={`${revision.id}-${change.field}`}><span className="font-medium">{change.label}:</span> {change.from ?? "—"} → {change.to ?? "—"}</li>)}</ul> : null}<div className="flex flex-wrap gap-2">{record.fields.filter((field) => field.type === "attachment").map((field) => <AttachmentList key={`${revision.id}-${field.key}`} record={record} fieldKey={field.key} revision={revision.revision} />)}</div></div></div>)}</CardContent></Card>

    <Dialog open={editing} onOpenChange={setEditing}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Ret egenkontrol</DialogTitle><DialogDescription>Alle rettelser gemmes som en ny revision. Begrundelsen bliver en del af dokumentationen.</DialogDescription></DialogHeader><FieldGroup>{record.fields.map((field) => <FieldEditor key={field.key} field={field} value={valueFor(editValues, field.key)} onChange={(next) => setEditValue(field.key, next)} onRemoveAttachment={(storageId) => { const current = valueFor(editValues, field.key); if (current?.type === "attachment") setEditValue(field.key, { ...current, storageIds: current.storageIds.filter((id) => id !== storageId) }); }} onUpload={(nextField, files) => void uploadFiles(nextField, files)} uploading={uploadingKey === field.key} />)}<Field><FieldLabel htmlFor="own-check-edit-note">Note</FieldLabel><Textarea id="own-check-edit-note" value={editNote} onChange={(event) => setEditNote(event.target.value)} /></Field><Field><FieldLabel htmlFor="own-check-edit-deviation">Afvigelse</FieldLabel><Textarea id="own-check-edit-deviation" value={editDeviation} onChange={(event) => setEditDeviation(event.target.value)} /></Field><Field><FieldLabel htmlFor="own-check-edit-corrective">Korrigerende handling</FieldLabel><Textarea id="own-check-edit-corrective" value={editCorrectiveAction} onChange={(event) => setEditCorrectiveAction(event.target.value)} /></Field><Field><FieldLabel htmlFor="own-check-edit-reason">Begrundelse for rettelse *</FieldLabel><Textarea id="own-check-edit-reason" value={editReason} onChange={(event) => setEditReason(event.target.value)} placeholder="Skriv, hvorfor registreringen rettes" required /></Field></FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={() => setEditing(false)}>Annuller</Button><Button type="button" disabled={saving || Boolean(uploadingKey) || !editReason.trim()} onClick={() => void saveEdit()}><SaveIcon data-icon="inline-start" />Gem rettelse</Button></DialogFooter></DialogContent></Dialog>
    <Button type="button" variant="outline" className="self-end" onClick={onClose}>Luk</Button>
  </div>;
}
