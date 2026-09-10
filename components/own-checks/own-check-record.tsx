"use client";

import { useMutation, useQuery } from "convex/react";
import Image from "next/image";
import {
  PencilIcon,
  SaveIcon,
  ShieldCheckIcon,
  WrenchIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { usePermission } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  evaluateCompliance,
  ownCheckControlTypeLabels,
  ownCheckStatus,
  type OwnCheckValue,
} from "@/lib/own-checks";
import { getUserErrorMessage } from "@/lib/user-errors";
import { InstructionContent } from "./instruction-content";
import {
  initialOwnCheckExecution,
  OwnCheckExecutionInputs,
  validateOwnCheckExecution,
  type OwnCheckExecutionDraft,
} from "./own-check-execution-inputs";
import { OwnCheckFieldInput } from "./own-check-field-input";
import {
  OwnCheckAttachments,
  OwnCheckExecutionTimes,
  OwnCheckProductTemperatures,
  OwnCheckResultFields,
  OwnCheckStatusBadge,
} from "./own-check-results";
import { OwnCheckHistory } from "./own-check-history";
import { useOwnCheckUpload } from "./use-own-check-upload";

type RecordValue = OwnCheckValue;

function formatDateTime(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(timestamp);
}

function formatDate(dateKey: string) {
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${dateKey}T12:00:00Z`));
}

function valueFor(values: RecordValue[], key: string) {
  return values.find((value) => value.key === key);
}

export function OwnCheckRecord({
  entryId,
  onClose,
}: {
  entryId: Id<"ownCheckEntries">;
  onClose: () => void;
}) {
  const record = useQuery(api.ownChecks.getOwnCheckRecord, { entryId });
  const canApprove = usePermission("ownChecks.approve");
  const approvalSettings = useQuery(
    api.ownChecks.getApprovalSettings,
    canApprove ? {} : "skip",
  );
  const canEdit = usePermission("ownChecks.edit");
  const canCorrect = usePermission("ownChecks.correct");
  const edit = useMutation(api.ownChecks.editOwnCheck);
  const recordCorrectiveAction = useMutation(
    api.ownChecks.recordCorrectiveAction,
  );
  const approve = useMutation(api.ownChecks.approveOwnCheck);
  const uploadUrl = useMutation(api.ownChecks.generateAttachmentUploadUrl);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<RecordValue[]>([]);
  const [editExecution, setEditExecution] = useState<OwnCheckExecutionDraft>({
    startedAtLocal: "",
    endedAtLocal: "",
    initialStartedAt: null,
    initialEndedAt: null,
    productTemperatures: [],
  });
  const [executionErrors, setExecutionErrors] = useState<Record<string, string>>(
    {},
  );
  const [editNote, setEditNote] = useState("");
  const [editDeviation, setEditDeviation] = useState("");
  const [editCorrectiveAction, setEditCorrectiveAction] = useState("");
  const [editReason, setEditReason] = useState("");
  const [correctiveDraft, setCorrectiveDraft] = useState<string | null>(null);
  const [correctiveReason, setCorrectiveReason] = useState("");
  const [saving, setSaving] = useState(false);
  const { uploading, upload } = useOwnCheckUpload({
    uploadUrl: () => uploadUrl({}),
    onUploaded: (value) =>
      setEditValues((current) => [
        ...current.filter((item) => item.key !== value.key),
        value,
      ]),
  });

  if (record === undefined)
    return (
      <div className="flex min-h-48 items-center justify-center">
        <Spinner />
      </div>
    );
  if (record === null)
    return (
      <div className="p-6 text-center text-muted-foreground">
        Egenkontrollen blev ikke fundet.
      </div>
    );
  const currentRecord = record;

  const values = record.entry.values;
  const correctiveDescription =
    correctiveDraft ?? record.entry.correctiveAction?.description ?? "";

  function openEditor() {
    setEditExecution(
      initialOwnCheckExecution(currentRecord.entry, currentRecord.timeZone),
    );
    setExecutionErrors({});
    setEditValues(
      values.map((value) => ({
        ...value,
        ...(value.type === "attachment"
          ? { storageIds: [...value.storageIds] }
          : {}),
      })),
    );
    setEditNote(currentRecord.entry.note ?? "");
    setEditDeviation(currentRecord.entry.deviation?.description ?? "");
    setEditCorrectiveAction(
      currentRecord.entry.correctiveAction?.description ?? "",
    );
    setEditReason("");
    setEditing(true);
  }

  function setEditValue(fieldKey: string, next: RecordValue | null) {
    if (!next) {
      setEditValues((current) =>
        current.filter((value) => value.key !== fieldKey),
      );
      return;
    }
    setEditValues((current) => [
      ...current.filter((value) => value.key !== fieldKey),
      next,
    ]);
  }

  async function saveEdit() {
    if (saving || uploading) return;
    const validatedExecution = validateOwnCheckExecution(
      editExecution,
      currentRecord.timeZone,
    );
    if (!validatedExecution.valid) {
      setExecutionErrors(validatedExecution.errors);
      toast.error(Object.values(validatedExecution.errors)[0]);
      return;
    }
    setExecutionErrors({});
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
      const currentDeviation = currentRecord.entry.deviation?.description ?? "";
      const currentCorrectiveAction =
        currentRecord.entry.correctiveAction?.description ?? "";
      await edit({
        entryId,
        startedAt: validatedExecution.startedAt,
        endedAt: validatedExecution.endedAt,
        productTemperatures: validatedExecution.productTemperatures,
        values: editValues.map((value) =>
          value.type === "attachment"
            ? { ...value, storageIds: value.storageIds as Id<"_storage">[] }
            : value,
        ),
        note: editNote,
        ...(editDeviation.trim() === currentDeviation
          ? {}
          : { deviationDescription: editDeviation }),
        ...(editCorrectiveAction.trim() === currentCorrectiveAction
          ? {}
          : { correctiveAction: editCorrectiveAction }),
        reason: editReason,
      });
      toast.success("Rettelsen er gemt");
      setEditing(false);
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Rettelsen kunne ikke gemmes. Prøv igen."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveCorrectiveAction() {
    if (
      !correctiveDescription.trim() ||
      (currentRecord.entry.correctiveAction && !correctiveReason.trim())
    )
      return;
    setSaving(true);
    try {
      await recordCorrectiveAction({
        entryId,
        description: correctiveDescription,
        ...(currentRecord.entry.correctiveAction
          ? { reason: correctiveReason }
          : {}),
      });
      toast.success(
        currentRecord.entry.correctiveAction
          ? "Den korrigerende handling er erstattet"
          : "Den korrigerende handling er registreret",
      );
      setCorrectiveReason("");
      setCorrectiveDraft(null);
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Handlingen kunne ikke registreres. Prøv igen.",
        ),
      );
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
      toast.error(
        getUserErrorMessage(
          error,
          "Egenkontrollen kunne ikke godkendes. Prøv igen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 border-b pb-4 pr-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-heading text-xl font-semibold">
            {record.entry.name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {record.entry.locationName} ·{" "}
            {ownCheckControlTypeLabels[record.entry.controlType]} ·{" "}
            {formatDate(record.entry.dueDateKey)}
          </p>
          <p className="text-sm text-muted-foreground">
            Planlagt {formatDateTime(record.entry.dueAt, record.timeZone)} ·
            Udført {formatDateTime(record.entry.performedAt, record.timeZone)}{" "}
            af {record.entry.performedByName}
          </p>
        </div>
        <OwnCheckStatusBadge status={ownCheckStatus(record.entry)} />
      </div>

      {record.instructions || record.imageUrl ? (
        <Card>
          <CardHeader>
            <CardTitle>Instruktioner</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {record.imageUrl ? (
              <div className="relative h-64 w-full">
                <Image
                  src={record.imageUrl}
                  alt={`Billede af ${record.entry.name}`}
                  fill
                  unoptimized
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="rounded-lg object-contain"
                />
              </div>
            ) : null}
            {record.instructions ? (
              <div className="whitespace-pre-wrap break-words text-sm">
                <InstructionContent value={record.instructions} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <Card>
          <CardHeader>
            <CardTitle>Kontrolpunkter</CardTitle>
            <p className="text-sm text-muted-foreground">
              {record.description || "Ingen yderligere beskrivelse."}
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <OwnCheckResultFields
              fields={record.fields}
              values={values}
              renderAttachments={(fieldKey) => (
                <OwnCheckAttachments
                  attachments={record.attachments}
                  fieldKey={fieldKey}
                  revision={record.entry.revision}
                />
              )}
            />
            <OwnCheckProductTemperatures
              productTemperatures={record.entry.productTemperatures}
            />
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Registrering</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <OwnCheckExecutionTimes
                startedAt={record.entry.startedAt}
                endedAt={record.entry.endedAt}
                timeZone={record.timeZone}
              />
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Registreret af</span>
                <span className="text-right">
                  {record.entry.performedByName}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Revision</span>
                <span>{record.entry.revision}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Opfølgning</span>
                <span>
                  {record.entry.followUp === "open"
                    ? "Åben"
                    : record.entry.followUp === "resolved"
                      ? "Løst"
                      : "Ingen"}
                </span>
              </div>
              {record.entry.approvedByName ? (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Godkendt af</span>
                  <span className="text-right">
                    {record.entry.approvedByName}
                  </span>
                </div>
              ) : null}
            </CardContent>
          </Card>
          {record.entry.note ? (
            <Card>
              <CardHeader>
                <CardTitle>Note</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm">
                {record.entry.note}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {record.entry.deviation ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <WrenchIcon className="size-4" />
              Afvigelse
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <p className="whitespace-pre-wrap">
              {record.entry.deviation.description}
            </p>
            <p className="text-muted-foreground">
              Registreret{" "}
              {formatDateTime(
                record.entry.deviation.recordedAt,
                record.timeZone,
              )}{" "}
              af {record.entry.deviation.recordedByName}
            </p>
          </CardContent>
        </Card>
      ) : null}
      {record.entry.correctiveAction ? (
        <Card>
          <CardHeader>
            <CardTitle>Korrigerende handling</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <p className="whitespace-pre-wrap">
              {record.entry.correctiveAction.description}
            </p>
            <p className="text-muted-foreground">
              Registreret{" "}
              {formatDateTime(
                record.entry.correctiveAction.recordedAt,
                record.timeZone,
              )}{" "}
              af {record.entry.correctiveAction.recordedByName}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {(canCorrect &&
        record.entry.hasDeviation &&
        record.entry.status !== "approved") ||
      canApprove ||
      canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>Handlinger</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {canCorrect &&
            record.entry.hasDeviation &&
            record.entry.status !== "approved" ? (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="own-check-corrective-action">
                    {record.entry.correctiveAction
                      ? "Ny korrigerende handling"
                      : "Korrigerende handling"}
                  </FieldLabel>
                  <Textarea
                    id="own-check-corrective-action"
                    value={correctiveDescription}
                    onChange={(event) => setCorrectiveDraft(event.target.value)}
                    placeholder="Beskriv, hvad der er gjort"
                  />
                  <FieldDescription>
                    Den første korrigerende handling kræver ikke en begrundelse.
                    Hvis du erstatter den, skal du begrunde ændringen.
                  </FieldDescription>
                </Field>
                {record.entry.correctiveAction ? (
                  <Field>
                    <FieldLabel htmlFor="own-check-corrective-reason">
                      Begrundelse for erstatning
                    </FieldLabel>
                    <Textarea
                      id="own-check-corrective-reason"
                      value={correctiveReason}
                      onChange={(event) =>
                        setCorrectiveReason(event.target.value)
                      }
                      placeholder="Skriv, hvorfor handlingen erstattes"
                    />
                  </Field>
                ) : null}
                <Button
                  type="button"
                  className="min-h-11 self-start"
                  disabled={
                    saving ||
                    !correctiveDescription.trim() ||
                    Boolean(
                      record.entry.correctiveAction && !correctiveReason.trim(),
                    )
                  }
                  onClick={() => void saveCorrectiveAction()}
                >
                  <WrenchIcon data-icon="inline-start" />
                  {record.entry.correctiveAction
                    ? "Erstat handling"
                    : "Registrér handling"}
                </Button>
              </FieldGroup>
            ) : null}
            {canApprove && record.entry.status !== "approved" ? (
              <div className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex items-center gap-1 text-sm font-medium">
                  <ShieldCheckIcon className="size-4" />
                  Godkendelse
                  <HelpTooltip
                    label="Godkendelse"
                    content={
                      approvalSettings?.requireSecondPersonApproval
                        ? "En anden person skal godkende kontrollen. Brugere med rettigheden til at administrere egenkontroller kan dog godkende egne registreringer."
                        : "Denne organisation tillader selv-godkendelse."
                    }
                  />
                </div>
                {record.entry.followUp === "open" ? (
                  <p className="text-sm text-destructive">
                    Afvigelsen skal følges op, før kontrollen kan godkendes.
                  </p>
                ) : (
                  <Button
                    type="button"
                    className="min-h-11 self-start"
                    disabled={saving}
                    onClick={() => void approveRecord()}
                  >
                    <ShieldCheckIcon data-icon="inline-start" />
                    Godkend egenkontrol
                  </Button>
                )}
              </div>
            ) : null}
            {canEdit && record.entry.status !== "approved" ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 self-start"
                onClick={openEditor}
              >
                <PencilIcon data-icon="inline-start" />
                Ret registrering
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <OwnCheckHistory
        key={`${entryId}:${record.entry.revision}`}
        record={record}
      />

      <Dialog
        open={editing}
        onOpenChange={(open) => {
          if (!uploading && !saving) setEditing(open);
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Ret egenkontrol</DialogTitle>
            <DialogDescription>
              Alle rettelser gemmes som en ny revision. Begrundelsen bliver en
              del af dokumentationen.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <OwnCheckExecutionInputs
              value={editExecution}
              onChange={(next) => {
                setEditExecution(next);
                setExecutionErrors({});
              }}
              controlType={record.entry.controlType}
              disabled={saving}
              errors={executionErrors}
            />
            {record.fields.map((field) => (
              <OwnCheckFieldInput
                key={field.key}
                field={field}
                value={valueFor(editValues, field.key)}
                onChange={(next) => setEditValue(field.key, next)}
                onRemoveAttachment={(storageId) => {
                  const current = valueFor(editValues, field.key);
                  if (current?.type === "attachment")
                    setEditValue(field.key, {
                      ...current,
                      storageIds: current.storageIds.filter(
                        (id) => id !== storageId,
                      ),
                    });
                }}
                onUpload={(nextField, files) => {
                  const value = valueFor(editValues, nextField.key);
                  void upload(
                    nextField,
                    files,
                    value?.type === "attachment" ? value.storageIds : [],
                  );
                }}
                uploading={uploading}
                disabled={saving}
              />
            ))}
            <Field>
              <FieldLabel htmlFor="own-check-edit-note">Note</FieldLabel>
              <Textarea
                id="own-check-edit-note"
                value={editNote}
                onChange={(event) => setEditNote(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="own-check-edit-deviation">
                Afvigelse
              </FieldLabel>
              <Textarea
                id="own-check-edit-deviation"
                value={editDeviation}
                onChange={(event) => setEditDeviation(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="own-check-edit-corrective">
                Korrigerende handling
              </FieldLabel>
              <Textarea
                id="own-check-edit-corrective"
                value={editCorrectiveAction}
                onChange={(event) =>
                  setEditCorrectiveAction(event.target.value)
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="own-check-edit-reason">
                Begrundelse for rettelse *
              </FieldLabel>
              <Textarea
                id="own-check-edit-reason"
                value={editReason}
                onChange={(event) => setEditReason(event.target.value)}
                placeholder="Skriv, hvorfor registreringen rettes"
                required
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={uploading || saving}
              onClick={() => setEditing(false)}
            >
              Annullér
            </Button>
            <Button
              type="button"
              disabled={saving || uploading || !editReason.trim()}
              onClick={() => void saveEdit()}
            >
              <SaveIcon data-icon="inline-start" />
              Gem rettelse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button
        type="button"
        variant="outline"
        className="self-end"
        onClick={onClose}
      >
        Luk
      </Button>
    </div>
  );
}
