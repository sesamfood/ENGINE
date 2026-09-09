"use client";

import { useMutation } from "convex/react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { OwnCheckField, OwnCheckValue } from "@/lib/own-checks";
import { evaluateCompliance, ownCheckControlTypeLabels } from "@/lib/own-checks";
import { compressImage } from "@/lib/compress-image";
import { getUserErrorMessage } from "@/lib/user-errors";
import { InstructionContent } from "./instruction-content";

type TodayResult = NonNullable<ReturnType<typeof import("convex/react").useQuery<typeof api.ownChecks.listToday>>>;
type PlanItem = TodayResult["items"][number];

function formatTime(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", timeZone }).format(timestamp);
}

function limitText(field: OwnCheckField) {
  if (field.type !== "number") return null;
  if (field.min !== undefined && field.max !== undefined) return `Skal være mellem ${String(field.min).replace(".", ",")} og ${String(field.max).replace(".", ",")}${field.unit ? ` ${field.unit}` : ""}`;
  if (field.min !== undefined) return `Skal være mindst ${String(field.min).replace(".", ",")}${field.unit ? ` ${field.unit}` : ""}`;
  if (field.max !== undefined) return `Må højst være ${String(field.max).replace(".", ",")}${field.unit ? ` ${field.unit}` : ""}`;
  return field.unit ? `Enhed: ${field.unit}` : null;
}

function valueFor(values: OwnCheckValue[], key: string) {
  return values.find((value) => value.key === key);
}

export function OwnCheckForm({ item, locationId, timeZone, canSubmit, onSaved }: { item: PlanItem; locationId: Id<"locations">; timeZone: string; canSubmit: boolean; onSaved: () => void }) {
  const uploadUrl = useMutation(api.ownChecks.generateAttachmentUploadUrl);
  const submit = useMutation(api.ownChecks.submitOwnCheck);
  const [values, setValues] = useState<OwnCheckValue[]>(() => item.entry?.values ?? []);
  const [deviationDescription, setDeviationDescription] = useState(() => item.entry?.deviation?.description ?? "");
  const [correctiveAction, setCorrectiveAction] = useState(() => item.entry?.correctiveAction?.description ?? "");
  const [clientRequestId] = useState(() => typeof crypto === "undefined" ? "" : crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const compliance = useMemo(() => evaluateCompliance(item.fields, values), [item.fields, values]);
  const deviationKeys = new Set(item.fields.filter((field) => {
    const value = valueFor(values, field.key);
    if (field.type === "number" && value?.type === "number") {
      return Number.isFinite(value.number) && (
        (field.min !== undefined && value.number < field.min) ||
        (field.max !== undefined && value.number > field.max)
      );
    }
    if (field.type === "choice" && value?.type === "choice") {
      return field.options.some((option) => option.value === value.value && !option.compliant);
    }
    return field.type === "checkbox" && value?.type === "checkbox" && field.mustBeChecked && !value.checked;
  }).map((field) => field.key));
  const hasDeviation = deviationKeys.size > 0;
  const readOnly = Boolean(item.entry) || !canSubmit;

  function setValue(next: OwnCheckValue | null) {
    if (!next) return;
    setValues((current) => [...current.filter((value) => value.key !== next.key), next]);
  }

  async function uploadFiles(field: Extract<OwnCheckField, { type: "attachment" }>, files: FileList | null) {
    if (!files?.length) return;
    const current = valueFor(values, field.key);
    const existing = current?.type === "attachment" ? current.storageIds : [];
    if (existing.length + files.length > field.maxFiles) {
      toast.error(`Feltet må højst have ${field.maxFiles} filer`);
      return;
    }
    setUploadingKey(field.key);
    try {
      const storageIds: Id<"_storage">[] = [];
      for (const file of Array.from(files)) {
        const prepared = file.type.startsWith("image/")
          ? await compressImage(file, { maxWidth: 2_000, maxHeight: 2_000, quality: 0.8, type: "image/jpeg", alwaysReencode: true })
          : file;
        const url = await uploadUrl({});
        const response = await fetch(url, { method: "POST", headers: { "Content-Type": prepared.type }, body: prepared });
        if (!response.ok) throw new Error("Filen kunne ikke uploades");
        const result = (await response.json()) as { storageId?: string };
        if (!result.storageId) throw new Error("Filen kunne ikke uploades");
        storageIds.push(result.storageId as Id<"_storage">);
      }
      setValue({ key: field.key, type: "attachment", storageIds: [...existing, ...storageIds] });
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Filen kunne ikke uploades. Kontrollér filen, og prøv igen.",
        ),
      );
    } finally {
      setUploadingKey(null);
    }
  }

  async function save() {
    if (readOnly || saving || uploadingKey) return;
    const invalidField = compliance.violations.find((violation) => !deviationKeys.has(violation.key));
    if (invalidField) {
      toast.error(`${invalidField.label}: ${invalidField.message}`);
      return;
    }
    if (hasDeviation && !deviationDescription.trim()) {
      toast.error("Beskriv afvigelsen");
      return;
    }
    setSaving(true);
    try {
      const submitValues = values.map((value) => value.type === "attachment"
        ? { ...value, storageIds: value.storageIds as Id<"_storage">[] }
        : value);
      const result = await submit({
        locationId,
        templateId: item.templateId,
        templateVersionId: item.templateVersionId,
        dueDateKey: item.dueDateKey,
        values: submitValues,
        ...(hasDeviation && deviationDescription.trim() ? { deviationDescription } : {}),
        ...(hasDeviation && correctiveAction.trim() ? { correctiveAction } : {}),
        clientRequestId,
      });
      toast.success(result.status === "deviation" ? "Afvigelsen er registreret og skal følges op" : "Egenkontrollen er registreret");
      onSaved();
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Egenkontrollen kunne ikke registreres. Prøv igen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form noValidate className="grid items-start gap-6 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <div className="flex flex-col gap-1 md:col-span-2">
        <h2 className="text-xl font-semibold break-words">{item.name}</h2>
        <p className="text-sm text-muted-foreground">
          {ownCheckControlTypeLabels[item.controlType]} · {new Intl.DateTimeFormat("da-DK", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${item.dueDateKey}T12:00:00Z`))} · {item.status === "notCompleted" ? (item.startsAt !== null ? `Kl. ${formatTime(item.startsAt, timeZone)}–${formatTime(item.dueAt, timeZone)}` : `Inden kl. ${formatTime(item.dueAt, timeZone)}`) : "Registreret"}
        </p>
      </div>
      <Card className="md:col-start-2 md:row-start-2">
        <CardHeader><CardTitle><h3>Instruktioner</h3></CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          {item.imageUrl ? <div className="relative h-64 w-full"><Image src={item.imageUrl} alt={`Billede af ${item.name}`} fill unoptimized sizes="(max-width: 768px) 100vw, 50vw" className="rounded-lg object-contain" /></div> : null}
          <div className="whitespace-pre-wrap break-words">{item.instructions ? <InstructionContent value={item.instructions} /> : "Der er ikke tilføjet instruktioner til denne kontrol."}</div>
        </CardContent>
      </Card>
      <Card className="md:col-start-1 md:row-start-2">
        <CardHeader><CardTitle><h3>{item.entry ? "Registrering" : "Udfør kontrol"}</h3></CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-6">
          {item.entry ? <Alert role="note"><AlertTitle>Kontrollen er registreret</AlertTitle><AlertDescription>Åbn oversigten for at se dokumentationen.</AlertDescription></Alert> : null}
          <FieldGroup>
            {item.fields.map((field) => {
              const value = valueFor(values, field.key);
              return (
                <Field key={field.key}>
                  <FieldLabel htmlFor={`own-check-${field.key}`}>{field.label}{field.required ? " *" : ""}</FieldLabel>
                  {field.type === "number" ? <Input id={`own-check-${field.key}`} type="number" inputMode="decimal" step={field.decimals === undefined ? "any" : 1 / 10 ** field.decimals} value={value?.type === "number" ? value.number : ""} onChange={(event) => event.target.value === "" ? setValues((current) => current.filter((itemValue) => itemValue.key !== field.key)) : setValue({ key: field.key, type: "number", number: Number(event.target.value) })} disabled={readOnly} /> : null}
                  {field.type === "checkbox" ? <Switch id={`own-check-${field.key}`} checked={value?.type === "checkbox" ? value.checked : false} onCheckedChange={(checked) => setValue({ key: field.key, type: "checkbox", checked })} disabled={readOnly} /> : null}
                  {field.type === "choice" ? <RadioGroup value={value?.type === "choice" ? value.value : ""} onValueChange={(next) => setValue({ key: field.key, type: "choice", value: next })} className="gap-3">{field.options.map((option) => <label key={option.value} className="flex min-h-11 items-center gap-3 rounded-md border px-3"><RadioGroupItem value={option.value} id={`own-check-${field.key}-${option.value}`} disabled={readOnly} />{option.label}</label>)}</RadioGroup> : null}
                  {field.type === "text" ? <Textarea id={`own-check-${field.key}`} value={value?.type === "text" ? value.text : ""} onChange={(event) => setValue({ key: field.key, type: "text", text: event.target.value })} disabled={readOnly} maxLength={field.maxLength ?? 2_000} /> : null}
                  {field.type === "attachment" ? <><Input id={`own-check-${field.key}`} type="file" accept="image/*,application/pdf" multiple={field.maxFiles > 1} onChange={(event) => { void uploadFiles(field, event.target.files); event.target.value = ""; }} disabled={readOnly || uploadingKey === field.key} />{value?.type === "attachment" && value.storageIds.length ? <FieldDescription>{value.storageIds.length} fil{value.storageIds.length === 1 ? "" : "er"} valgt</FieldDescription> : null}</> : null}
                  {limitText(field) ? <FieldDescription>{limitText(field)}</FieldDescription> : null}
                </Field>
              );
            })}
          </FieldGroup>
          {!readOnly && hasDeviation ? <FieldGroup><Field><FieldLabel htmlFor="own-check-deviation">Beskriv afvigelsen *</FieldLabel><Textarea id="own-check-deviation" value={deviationDescription} onChange={(event) => setDeviationDescription(event.target.value)} maxLength={2_000} /></Field><Field><FieldLabel htmlFor="own-check-corrective">Korrigerende handling</FieldLabel><Textarea id="own-check-corrective" value={correctiveAction} onChange={(event) => setCorrectiveAction(event.target.value)} maxLength={2_000} /></Field></FieldGroup> : null}
        </CardContent>
        {!readOnly ? <CardFooter><Button type="submit" size="lg" className="min-h-12 w-full sm:w-auto" disabled={saving || Boolean(uploadingKey)}>{saving ? <Spinner data-icon="inline-start" /> : null}{hasDeviation ? "Registrér afvigelse" : "Registrér egenkontrol"}</Button></CardFooter> : null}
      </Card>
    </form>
  );
}
