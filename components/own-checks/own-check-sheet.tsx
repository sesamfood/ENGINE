"use client";

import { useMutation } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { OwnCheckField, OwnCheckValue } from "@/lib/own-checks";
import { evaluateCompliance, formatValue, ownCheckControlTypeLabels } from "@/lib/own-checks";
import { compressImage } from "@/lib/compress-image";
import { getUserErrorMessage } from "@/lib/user-errors";

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

export function OwnCheckSheet({ item, locationId, timeZone, open, onOpenChange }: { item: PlanItem | null; locationId: Id<"locations">; timeZone: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const uploadUrl = useMutation(api.ownChecks.generateAttachmentUploadUrl);
  const submit = useMutation(api.ownChecks.submitOwnCheck);
  const [values, setValues] = useState<OwnCheckValue[]>(() => (item?.entry?.values ?? []) as unknown as OwnCheckValue[]);
  const [deviationDescription, setDeviationDescription] = useState(() => item?.entry?.deviation?.description ?? "");
  const [correctiveAction, setCorrectiveAction] = useState(() => item?.entry?.correctiveAction?.description ?? "");
  const [clientRequestId] = useState(() => typeof crypto === "undefined" ? "" : crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const compliance = useMemo(() => item ? evaluateCompliance(item.fields, values) : { compliant: true, violations: [] }, [item, values]);
  const readOnly = Boolean(item?.entry);

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
    if (!item || readOnly) return;
    if (!compliance.compliant && !deviationDescription.trim()) {
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
        dueDateKey: item.dueDateKey,
        values: submitValues,
        ...(deviationDescription.trim() ? { deviationDescription } : {}),
        ...(correctiveAction.trim() ? { correctiveAction } : {}),
        clientRequestId,
      });
      toast.success(result.status === "deviation" ? "Afvigelsen er registreret og skal følges op" : "Egenkontrollen er registreret");
      onOpenChange(false);
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

  if (!item) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{item.name}</SheetTitle>
          <SheetDescription>{ownCheckControlTypeLabels[item.controlType]} · {item.status === "notCompleted" ? (item.startsAt ? `Kl. ${formatTime(item.startsAt, timeZone)}–${formatTime(item.dueAt, timeZone)}` : `Inden kl. ${formatTime(item.dueAt, timeZone)}`) : "Registreret"}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 px-4">
          {readOnly ? <div className="rounded-xl border bg-muted/30 p-4 text-sm">Egenkontrollen er allerede registreret. Åbn oversigten for at se dokumentationen.</div> : null}
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
          {!readOnly && (!compliance.compliant || deviationDescription.trim()) ? <FieldGroup><Field><FieldLabel htmlFor="own-check-deviation">Beskriv afvigelsen *</FieldLabel><Textarea id="own-check-deviation" value={deviationDescription} onChange={(event) => setDeviationDescription(event.target.value)} maxLength={2_000} /></Field><Field><FieldLabel htmlFor="own-check-corrective">Korrigerende handling</FieldLabel><Textarea id="own-check-corrective" value={correctiveAction} onChange={(event) => setCorrectiveAction(event.target.value)} maxLength={2_000} /></Field></FieldGroup> : null}
          {readOnly && item.entry ? <FieldGroup>{item.fields.map((field) => <div key={field.key} className="flex items-center justify-between gap-3 border-b py-2 text-sm"><span>{field.label}</span><span className="font-medium">{formatValue(field, item.entry?.values.find((value) => value.key === field.key) as OwnCheckValue | undefined)}</span></div>)}</FieldGroup> : null}
        </div>
        {!readOnly ? <SheetFooter><Button type="button" size="lg" className="min-h-12 w-full" disabled={saving || Boolean(uploadingKey)} onClick={() => void save()}>{saving ? <Spinner data-icon="inline-start" /> : null}{compliance.compliant ? "Registrér egenkontrol" : "Registrér afvigelse"}</Button></SheetFooter> : null}
      </SheetContent>
    </Sheet>
  );
}
