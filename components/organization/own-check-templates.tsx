"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ArchiveIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAccess, useLocationAccess, usePermission } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { OwnCheckControlType, OwnCheckField, OwnCheckSchedule } from "@/lib/own-checks";

type Template = NonNullable<ReturnType<typeof useQuery<typeof api.ownCheckTemplates.listTemplates>>>[number];
type EditorMode = Template | "new" | null;

type Draft = {
  name: string;
  description: string;
  controlType: OwnCheckControlType;
  schedule: OwnCheckSchedule;
  startMinuteOfDay: number | undefined;
  dueMinuteOfDay: number | undefined;
  fields: OwnCheckField[];
  allLocations: boolean;
  locationIds: Id<"locations">[];
  responsibleRole: string;
  reason: string;
};

const controlTypes: Array<{ value: OwnCheckControlType; label: string }> = [
  { value: "temperature", label: "Temperatur" },
  { value: "cleaning", label: "Rengøring" },
  { value: "receiving", label: "Modtagekontrol" },
  { value: "shelfLife", label: "Holdbarhed" },
  { value: "hygiene", label: "Personlig hygiejne" },
  { value: "pest", label: "Skadedyr" },
  { value: "other", label: "Andet" },
];

const fieldTypes = [
  { value: "number", label: "Tal" },
  { value: "checkbox", label: "Punkt" },
  { value: "choice", label: "Valg" },
  { value: "text", label: "Tekst" },
  { value: "attachment", label: "Fil" },
] as const;

function defaultField(key = "felt1"): OwnCheckField {
  return { key, label: "Felt", type: "number", required: true, unit: "", min: undefined, max: undefined, decimals: 1 };
}

function newDraft(): Draft {
  return {
    name: "",
    description: "",
    controlType: "temperature",
    schedule: { type: "daily" },
    startMinuteOfDay: undefined,
    dueMinuteOfDay: undefined,
    fields: [defaultField()],
    allLocations: true,
    locationIds: [],
    responsibleRole: "",
    reason: "",
  };
}

function draftFromTemplate(template: Template): Draft {
  return {
    name: template.name,
    description: template.description,
    controlType: template.controlType,
    schedule: template.schedule,
    startMinuteOfDay: template.startMinuteOfDay ?? undefined,
    dueMinuteOfDay: template.dueMinuteOfDay ?? undefined,
    fields: template.fields,
    allLocations: template.allLocations,
    locationIds: template.locationIds,
    responsibleRole: template.responsibleRole ?? "",
    reason: "",
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Handlingen kunne ikke gennemføres";
}

function scheduleLabel(schedule: OwnCheckSchedule) {
  if (schedule.type === "daily") return "Dagligt";
  if (schedule.type === "weekly") return `Ugentligt (${schedule.weekdays.length} dage)`;
  if (schedule.type === "monthly") return `Månedligt (${schedule.days.join(", ")})`;
  return `Hver ${schedule.intervalDays}. dag`;
}

function minutesLabel(value: number | null | undefined) {
  if (value === null || value === undefined) return "";
  return `${String(Math.floor(value / 60)).padStart(2, "0")}.${String(value % 60).padStart(2, "0")}`;
}

function parseMinute(value: string) {
  if (!value) return undefined;
  const [hours, minutes] = value.split(":").map(Number);
  return Number.isInteger(hours) && Number.isInteger(minutes) ? hours * 60 + minutes : undefined;
}

function updateFieldType(field: OwnCheckField, type: OwnCheckField["type"]): OwnCheckField {
  if (type === field.type) return field;
  if (type === "number") return { key: field.key, label: field.label, type, required: field.required, unit: "", decimals: 1 };
  if (type === "checkbox") return { key: field.key, label: field.label, type, required: field.required, mustBeChecked: true };
  if (type === "choice") return { key: field.key, label: field.label, type, required: field.required, options: [{ value: "ok", label: "I orden", compliant: true }, { value: "bad", label: "Ikke i orden", compliant: false }] };
  if (type === "text") return { key: field.key, label: field.label, type, required: field.required, maxLength: 2000 };
  return { key: field.key, label: field.label, type, required: field.required, maxFiles: 1 };
}

function FieldEditor({ draft, setDraft }: { draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>> }) {
  function patchField(index: number, patch: Partial<OwnCheckField>) {
    setDraft((current) => ({ ...current, fields: current.fields.map((field, itemIndex) => itemIndex === index ? { ...field, ...patch } as OwnCheckField : field) }));
  }

  function moveField(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.fields.length) return current;
      const fields = [...current.fields];
      [fields[index], fields[nextIndex]] = [fields[nextIndex], fields[index]];
      return { ...current, fields };
    });
  }

  return (
    <FieldSet>
      <FieldTitle>Felter</FieldTitle>
      <FieldDescription>Felternes nøgler gemmes som stabile identifikatorer, så historikken kan sammenlignes.</FieldDescription>
      <div className="flex flex-col gap-3">
        {draft.fields.map((field, index) => (
          <div key={`${field.key}-${index}`} className="rounded-xl border p-3">
            <div className="grid gap-3 md:grid-cols-[1fr_10rem_auto]">
              <Field>
                <FieldLabel htmlFor={`own-field-label-${index}`}>Feltnavn</FieldLabel>
                <Input id={`own-field-label-${index}`} value={field.label} onChange={(event) => patchField(index, { label: event.target.value })} />
              </Field>
              <Field>
                <FieldLabel htmlFor={`own-field-type-${index}`}>Type</FieldLabel>
                <Select items={fieldTypes} value={field.type} onValueChange={(value) => value && setDraft((current) => ({ ...current, fields: current.fields.map((item, itemIndex) => itemIndex === index ? updateFieldType(item, value as OwnCheckField["type"]) : item) }))}>
                  <SelectTrigger id={`own-field-type-${index}`} className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>{fieldTypes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
              </Field>
              <div className="flex items-end gap-1">
                <Button type="button" variant="outline" size="icon" aria-label="Flyt felt op" disabled={index === 0} onClick={() => moveField(index, -1)}><ArrowUpIcon /></Button>
                <Button type="button" variant="outline" size="icon" aria-label="Flyt felt ned" disabled={index === draft.fields.length - 1} onClick={() => moveField(index, 1)}><ArrowDownIcon /></Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Slet felt" disabled={draft.fields.length === 1} onClick={() => setDraft((current) => ({ ...current, fields: current.fields.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2Icon /></Button>
              </div>
            </div>
            <FieldGroup className="mt-3 grid md:grid-cols-3">
              <Field>
                <FieldLabel htmlFor={`own-field-key-${index}`}>Nøgle</FieldLabel>
                <Input id={`own-field-key-${index}`} value={field.key} onChange={(event) => patchField(index, { key: event.target.value })} />
              </Field>
              <Field orientation="horizontal" className="md:pt-7">
                <FieldContent><FieldLabel htmlFor={`own-field-required-${index}`}>Påkrævet</FieldLabel></FieldContent>
                <Switch id={`own-field-required-${index}`} checked={field.required} onCheckedChange={(checked) => patchField(index, { required: checked })} />
              </Field>
              {field.type === "number" ? (
                <>
                  <Field><FieldLabel htmlFor={`own-field-unit-${index}`}>Enhed</FieldLabel><Input id={`own-field-unit-${index}`} value={field.unit ?? ""} onChange={(event) => patchField(index, { unit: event.target.value })} placeholder="°C" /></Field>
                  <Field><FieldLabel htmlFor={`own-field-min-${index}`}>Minimum</FieldLabel><Input id={`own-field-min-${index}`} type="number" value={field.min ?? ""} onChange={(event) => patchField(index, { min: event.target.value === "" ? undefined : Number(event.target.value) })} /></Field>
                  <Field><FieldLabel htmlFor={`own-field-max-${index}`}>Maksimum</FieldLabel><Input id={`own-field-max-${index}`} type="number" value={field.max ?? ""} onChange={(event) => patchField(index, { max: event.target.value === "" ? undefined : Number(event.target.value) })} /></Field>
                  <Field><FieldLabel htmlFor={`own-field-decimals-${index}`}>Decimaler</FieldLabel><Input id={`own-field-decimals-${index}`} type="number" min={0} max={3} value={field.decimals ?? ""} onChange={(event) => patchField(index, { decimals: event.target.value === "" ? undefined : Number(event.target.value) })} /></Field>
                </>
              ) : null}
              {field.type === "checkbox" ? <Field orientation="horizontal"><FieldContent><FieldLabel htmlFor={`own-field-checked-${index}`}>Skal være bekræftet</FieldLabel></FieldContent><Switch id={`own-field-checked-${index}`} checked={field.mustBeChecked} onCheckedChange={(checked) => patchField(index, { mustBeChecked: checked })} /></Field> : null}
              {field.type === "text" ? <Field><FieldLabel htmlFor={`own-field-max-length-${index}`}>Maks. tegn</FieldLabel><Input id={`own-field-max-length-${index}`} type="number" min={1} max={2000} value={field.maxLength ?? ""} onChange={(event) => patchField(index, { maxLength: event.target.value === "" ? undefined : Number(event.target.value) })} /></Field> : null}
              {field.type === "attachment" ? <Field><FieldLabel htmlFor={`own-field-max-files-${index}`}>Maks. filer</FieldLabel><Input id={`own-field-max-files-${index}`} type="number" min={1} max={5} value={field.maxFiles} onChange={(event) => patchField(index, { maxFiles: Number(event.target.value) })} /></Field> : null}
            </FieldGroup>
            {field.type === "choice" ? (
              <Field className="mt-3">
                <FieldLabel htmlFor={`own-field-options-${index}`}>Valgmuligheder</FieldLabel>
                <Textarea id={`own-field-options-${index}`} value={field.options.map((option) => `${option.value}|${option.label}|${option.compliant ? "ja" : "nej"}`).join("\n")} onChange={(event) => patchField(index, { options: event.target.value.split("\n").filter(Boolean).map((line) => { const [value, label, compliant] = line.split("|"); return { value: value?.trim() ?? "", label: label?.trim() ?? "", compliant: compliant?.trim().toLowerCase() === "ja" }; }) })} />
                <FieldDescription>Én valgmulighed pr. linje: værdi|label|ja eller nej.</FieldDescription>
              </Field>
            ) : null}
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" className="min-h-11 self-start" onClick={() => setDraft((current) => ({ ...current, fields: [...current.fields, defaultField(`felt${current.fields.length + 1}`)] }))}><PlusIcon data-icon="inline-start" />Tilføj felt</Button>
    </FieldSet>
  );
}

function TemplateEditor({ mode, locations, onClose, onSaved }: { mode: EditorMode; locations: Array<{ id: Id<"locations">; name: string }>; onClose: () => void; onSaved: () => void }) {
  const createTemplate = useMutation(api.ownCheckTemplates.createTemplate);
  const updateTemplate = useMutation(api.ownCheckTemplates.updateTemplate);
  const [draft, setDraft] = useState<Draft>(() => mode && mode !== "new" ? draftFromTemplate(mode) : newDraft());
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: draft.name,
        description: draft.description,
        controlType: draft.controlType,
        schedule: draft.schedule,
        ...(draft.startMinuteOfDay === undefined ? {} : { startMinuteOfDay: draft.startMinuteOfDay }),
        ...(draft.dueMinuteOfDay === undefined ? {} : { dueMinuteOfDay: draft.dueMinuteOfDay }),
        fields: draft.fields,
        allLocations: draft.allLocations,
        locationIds: draft.locationIds,
        ...(draft.responsibleRole.trim() ? { responsibleRole: draft.responsibleRole.trim() } : {}),
      };
      if (mode && mode !== "new") await updateTemplate({ ...payload, templateId: mode.id, reason: draft.reason });
      else await createTemplate(payload);
      toast.success(mode && mode !== "new" ? "Egenkontrollen er opdateret" : "Egenkontrollen er oprettet");
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(mode)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{mode === "new" ? "Ny egenkontrol" : "Redigér egenkontrol"}</DialogTitle>
          <DialogDescription>Definér felter, frekvens og hvilke lokationer kontrollen gælder for.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-6">
          <FieldGroup className="grid md:grid-cols-2">
            <Field><FieldLabel htmlFor="own-template-name">Navn</FieldLabel><Input id="own-template-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required maxLength={100} /></Field>
            <Field><FieldLabel htmlFor="own-template-type">Kontroltype</FieldLabel><Select items={controlTypes} value={draft.controlType} onValueChange={(value) => value && setDraft((current) => ({ ...current, controlType: value as OwnCheckControlType }))}><SelectTrigger id="own-template-type" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{controlTypes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
          </FieldGroup>
          <Field><FieldLabel htmlFor="own-template-description">Beskrivelse</FieldLabel><Textarea id="own-template-description" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} maxLength={1000} /></Field>
          <FieldSet>
            <FieldTitle>Frekvens og tidsrum</FieldTitle>
            <FieldGroup className="grid md:grid-cols-2">
              <Field><FieldLabel htmlFor="own-template-schedule">Frekvens</FieldLabel><Select items={[{ value: "daily", label: "Dagligt" }, { value: "weekly", label: "Ugentligt" }, { value: "monthly", label: "Månedligt" }, { value: "interval", label: "Fast interval" }]} value={draft.schedule.type} onValueChange={(value) => setDraft((current) => ({ ...current, schedule: value === "weekly" ? { type: "weekly", weekdays: [1] } : value === "monthly" ? { type: "monthly", days: [0] } : value === "interval" ? { type: "interval", intervalDays: 7, anchorDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen" }).format(new Date()) } : { type: "daily" } }))}><SelectTrigger id="own-template-schedule" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="daily">Dagligt</SelectItem><SelectItem value="weekly">Ugentligt</SelectItem><SelectItem value="monthly">Månedligt</SelectItem><SelectItem value="interval">Fast interval</SelectItem></SelectGroup></SelectContent></Select></Field>
              {draft.schedule.type === "weekly" ? <Field><FieldLabel>Ugedage</FieldLabel><div className="grid grid-cols-4 gap-2">{["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"].map((label, day) => <label key={label} className="flex min-h-11 items-center gap-2 rounded-md border px-2 text-sm"><Checkbox checked={draft.schedule.type === "weekly" && draft.schedule.weekdays.includes(day)} onCheckedChange={(checked) => setDraft((current) => current.schedule.type !== "weekly" ? current : { ...current, schedule: { ...current.schedule, weekdays: checked ? [...current.schedule.weekdays, day] : current.schedule.weekdays.filter((item) => item !== day) } })} />{label}</label>)}</div></Field> : null}
              {draft.schedule.type === "monthly" ? <Field><FieldLabel htmlFor="own-template-month-days">Månedsdage</FieldLabel><Input id="own-template-month-days" value={draft.schedule.days.join(",")} onChange={(event) => setDraft((current) => current.schedule.type !== "monthly" ? current : { ...current, schedule: { ...current.schedule, days: event.target.value.split(",").map(Number).filter((value) => Number.isFinite(value)) } })} /><FieldDescription>Brug 1–28 eller 0 for sidste dag i måneden.</FieldDescription></Field> : null}
              {draft.schedule.type === "interval" ? <FieldGroup className="grid grid-cols-2"><Field><FieldLabel htmlFor="own-template-interval">Antal dage</FieldLabel><Input id="own-template-interval" type="number" min={1} max={365} value={draft.schedule.intervalDays} onChange={(event) => setDraft((current) => current.schedule.type !== "interval" ? current : { ...current, schedule: { ...current.schedule, intervalDays: Number(event.target.value) } })} /></Field><Field><FieldLabel htmlFor="own-template-anchor">Startdato</FieldLabel><Input id="own-template-anchor" type="date" value={draft.schedule.anchorDate} onChange={(event) => setDraft((current) => current.schedule.type !== "interval" ? current : { ...current, schedule: { ...current.schedule, anchorDate: event.target.value } })} /></Field></FieldGroup> : null}
            </FieldGroup>
            <FieldGroup className="grid md:grid-cols-2">
              <Field><FieldLabel htmlFor="own-template-start">Starter kl.</FieldLabel><Input id="own-template-start" type="time" value={minutesLabel(draft.startMinuteOfDay).replace(".", ":")} onChange={(event) => setDraft((current) => ({ ...current, startMinuteOfDay: parseMinute(event.target.value) }))} /></Field>
              <Field><FieldLabel htmlFor="own-template-due">Forfalder kl.</FieldLabel><Input id="own-template-due" type="time" value={minutesLabel(draft.dueMinuteOfDay).replace(".", ":")} onChange={(event) => setDraft((current) => ({ ...current, dueMinuteOfDay: parseMinute(event.target.value) }))} /><FieldDescription>Udfyld ikke feltet for forfald ved dagens slutning.</FieldDescription></Field>
            </FieldGroup>
          </FieldSet>
          <FieldSet>
            <FieldTitle>Lokationer</FieldTitle>
            <Field orientation="horizontal"><FieldContent><FieldLabel htmlFor="own-template-all-locations">Alle lokationer</FieldLabel></FieldContent><Switch id="own-template-all-locations" checked={draft.allLocations} onCheckedChange={(checked) => setDraft((current) => ({ ...current, allLocations: checked }))} /></Field>
            {!draft.allLocations ? <div className="grid gap-2 md:grid-cols-2">{locations.map((location) => <label key={location.id} className="flex min-h-11 items-center gap-2 rounded-md border px-3"><Checkbox checked={draft.locationIds.includes(location.id)} onCheckedChange={(checked) => setDraft((current) => ({ ...current, locationIds: checked ? [...current.locationIds, location.id] : current.locationIds.filter((id) => id !== location.id) }))} />{location.name}</label>)}</div> : null}
          </FieldSet>
          <Field><FieldLabel htmlFor="own-template-role">Ansvarlig rolle</FieldLabel><Input id="own-template-role" value={draft.responsibleRole} onChange={(event) => setDraft((current) => ({ ...current, responsibleRole: event.target.value }))} placeholder="Valgfrit" /><FieldDescription>Rollen bruges kun til visning og filtrering. Den begrænser ikke, hvem der må udføre kontrollen.</FieldDescription></Field>
          <FieldEditor draft={draft} setDraft={setDraft} />
          {mode && mode !== "new" ? <Field><FieldLabel htmlFor="own-template-reason">Begrundelse</FieldLabel><Input id="own-template-reason" value={draft.reason} onChange={(event) => setDraft((current) => ({ ...current, reason: event.target.value }))} placeholder="Angiv en begrundelse" required /></Field> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annuller</Button>
            <Button type="submit" size="lg" disabled={saving}>{saving ? <Spinner data-icon="inline-start" /> : null}Gem egenkontrol</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OwnCheckTemplates() {
  const access = useAccess();
  const canManage = usePermission("ownChecks.manage");
  const { locations } = useLocationAccess();
  const [includeArchived, setIncludeArchived] = useState(false);
  const templates = useQuery(api.ownCheckTemplates.listTemplates, canManage ? { includeArchived } : "skip");
  const archiveTemplate = useMutation(api.ownCheckTemplates.archiveTemplate);
  const restoreTemplate = useMutation(api.ownCheckTemplates.restoreTemplate);
  const [editor, setEditor] = useState<EditorMode>(null);
  const [action, setAction] = useState<{ template: Template; type: "archive" | "restore" } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionPending, setActionPending] = useState(false);

  if (!access || (canManage && templates === undefined)) return <Skeleton className="h-[30rem] w-full" />;
  if (!canManage) {
    return <Alert variant="destructive" className="max-w-xl"><AlertTitle>Ingen adgang</AlertTitle><AlertDescription>Du har ikke adgang til at administrere egenkontroller.</AlertDescription></Alert>;
  }

  async function completeAction() {
    if (!action || !actionReason.trim()) {
      toast.error("Angiv en begrundelse");
      return;
    }
    setActionPending(true);
    try {
      if (action.type === "archive") await archiveTemplate({ templateId: action.template.id, reason: actionReason });
      else await restoreTemplate({ templateId: action.template.id, reason: actionReason });
      toast.success(action.type === "archive" ? "Egenkontrollen er arkiveret" : "Egenkontrollen er gendannet");
      setAction(null);
      setActionReason("");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setActionPending(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div><CardTitle>Egenkontroller</CardTitle><CardDescription>Versioner gemmes, så historiske kontroller altid bruger de rigtige felter og grænser.</CardDescription></div>
            <div className="flex flex-wrap gap-2"><Button type="button" size="lg" onClick={() => setEditor("new")}><PlusIcon data-icon="inline-start" />Ny egenkontrol</Button><Button type="button" variant="outline" onClick={() => setIncludeArchived((current) => !current)}>{includeArchived ? "Skjul arkiverede" : "Vis arkiverede"}</Button></div>
          </div>
        </CardHeader>
        <CardContent>
          {templates?.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Navn</TableHead><TableHead>Kontroltype</TableHead><TableHead>Frekvens</TableHead><TableHead>Lokationer</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Handlinger</TableHead></TableRow></TableHeader><TableBody>{templates.map((template) => <TableRow key={template.id}><TableCell className="font-medium">{template.name}<div className="text-xs text-muted-foreground">Version {template.version}</div></TableCell><TableCell>{controlTypes.find((item) => item.value === template.controlType)?.label}</TableCell><TableCell>{scheduleLabel(template.schedule)}{template.dueMinuteOfDay !== null ? <div className="text-xs text-muted-foreground">Kl. {minutesLabel(template.dueMinuteOfDay)}</div> : null}</TableCell><TableCell>{template.allLocations ? "Alle" : `${template.locationIds.length} valgt`}</TableCell><TableCell><Badge variant={template.status === "active" ? "secondary" : "outline"}>{template.status === "active" ? "Aktiv" : "Arkiveret"}</Badge></TableCell><TableCell><div className="flex justify-end gap-1"><Button type="button" variant="ghost" size="icon" aria-label={`Redigér ${template.name}`} onClick={() => setEditor(template)} disabled={template.status !== "active"}><PencilIcon /><span className="sr-only">Redigér</span></Button>{template.status === "active" ? <Button type="button" variant="ghost" size="icon" aria-label={`Arkivér ${template.name}`} onClick={() => setAction({ template, type: "archive" })}><ArchiveIcon /></Button> : <Button type="button" variant="ghost" size="icon" aria-label={`Gendan ${template.name}`} onClick={() => setAction({ template, type: "restore" })}><RotateCcwIcon /></Button>}</div></TableCell></TableRow>)}</TableBody></Table></div> : <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Ingen egenkontroller endnu.</div>}
        </CardContent>
      </Card>
      <TemplateEditor mode={editor} locations={locations} onClose={() => setEditor(null)} onSaved={() => setEditor(null)} />
      <AlertDialog open={Boolean(action)} onOpenChange={(open) => !open && setAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{action?.type === "archive" ? "Arkivér egenkontrollen?" : "Gendan egenkontrollen?"}</AlertDialogTitle><AlertDialogDescription>{action?.type === "archive" ? "Nye datoer får ikke længere planlagt denne kontrol. Historikken bevares." : "Kontrollen bliver planlagt igen fra den nye versions gyldighed."}</AlertDialogDescription></AlertDialogHeader>
          <Field><FieldLabel htmlFor="own-template-action-reason">Begrundelse</FieldLabel><Input id="own-template-action-reason" value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder="Angiv en begrundelse" /></Field>
          <AlertDialogFooter><AlertDialogCancel>Annuller</AlertDialogCancel><AlertDialogAction variant={action?.type === "archive" ? "destructive" : "default"} disabled={actionPending} onClick={() => void completeAction()}>{actionPending ? <Spinner data-icon="inline-start" /> : null}{action?.type === "archive" ? "Arkivér" : "Gendan"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
