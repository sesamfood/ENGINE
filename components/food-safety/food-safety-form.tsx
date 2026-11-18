"use client";

import { useMutation } from "convex/react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { FoodSafetyValue } from "@/lib/food-safety";
import {
  evaluateCompliance,
  foodSafetyControlTypeLabels,
} from "@/lib/food-safety";
import { getUserErrorMessage } from "@/lib/user-errors";
import { InstructionContent } from "./instruction-content";
import {
  initialFoodSafetyExecution,
  FoodSafetyExecutionInputs,
  validateFoodSafetyExecution,
} from "./food-safety-execution-inputs";
import { FoodSafetyFieldInput } from "./food-safety-field-input";
import {
  FoodSafetyExecutionTimes,
  FoodSafetyProductTemperatures,
} from "./food-safety-results";
import { useFoodSafetyUpload } from "./use-food-safety-upload";

type TodayResult = NonNullable<
  ReturnType<
    typeof import("convex/react").useQuery<typeof api.foodSafety.listToday>
  >
>;
type PlanItem = TodayResult["items"][number];

function formatTime(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(timestamp);
}

function valueFor(values: FoodSafetyValue[], key: string) {
  return values.find((value) => value.key === key);
}

export function FoodSafetyForm({
  item,
  locationId,
  timeZone,
  canSubmit,
  onSaved,
}: {
  item: PlanItem;
  locationId: Id<"locations">;
  timeZone: string;
  canSubmit: boolean;
  onSaved: () => void;
}) {
  const uploadUrl = useMutation(api.foodSafety.generateAttachmentUploadUrl);
  const submit = useMutation(api.foodSafety.submitFoodSafety);
  const [values, setValues] = useState<FoodSafetyValue[]>(
    () => item.entry?.values ?? [],
  );
  const [execution, setExecution] = useState(() =>
    initialFoodSafetyExecution(item.entry, timeZone),
  );
  const [executionErrors, setExecutionErrors] = useState<Record<string, string>>(
    {},
  );
  const [deviationDescription, setDeviationDescription] = useState(
    () => item.entry?.deviation?.description ?? "",
  );
  const [correctiveAction, setCorrectiveAction] = useState(
    () => item.entry?.correctiveAction?.description ?? "",
  );
  const [clientRequestId] = useState(() =>
    typeof crypto === "undefined" ? "" : crypto.randomUUID(),
  );
  const [saving, setSaving] = useState(false);
  const { uploading, upload } = useFoodSafetyUpload({
    uploadUrl: () => uploadUrl({}),
    onUploaded: (value) =>
      setValues((current) => [
        ...current.filter((item) => item.key !== value.key),
        value,
      ]),
  });

  const compliance = useMemo(
    () => evaluateCompliance(item.fields, values),
    [item.fields, values],
  );
  const deviationKeys = new Set(
    item.fields
      .filter((field) => {
        const value = valueFor(values, field.key);
        if (field.type === "number" && value?.type === "number") {
          return (
            Number.isFinite(value.number) &&
            ((field.min !== undefined && value.number < field.min) ||
              (field.max !== undefined && value.number > field.max))
          );
        }
        if (field.type === "choice" && value?.type === "choice") {
          return field.options.some(
            (option) => option.value === value.value && !option.compliant,
          );
        }
        return (
          field.type === "checkbox" &&
          value?.type === "checkbox" &&
          field.mustBeChecked &&
          !value.checked
        );
      })
      .map((field) => field.key),
  );
  const hasDeviation = deviationKeys.size > 0;
  const readOnly = Boolean(item.entry) || !canSubmit;

  async function save() {
    if (readOnly || saving || uploading) return;
    const validatedExecution = validateFoodSafetyExecution(execution, timeZone);
    if (!validatedExecution.valid) {
      setExecutionErrors(validatedExecution.errors);
      toast.error(Object.values(validatedExecution.errors)[0]);
      return;
    }
    setExecutionErrors({});
    const invalidField = compliance.violations.find(
      (violation) => !deviationKeys.has(violation.key),
    );
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
      const submitValues = values.map((value) =>
        value.type === "attachment"
          ? { ...value, storageIds: value.storageIds as Id<"_storage">[] }
          : value,
      );
      const result = await submit({
        locationId,
        templateId: item.templateId,
        templateVersionId: item.templateVersionId,
        dueDateKey: item.dueDateKey,
        startedAt: validatedExecution.startedAt,
        endedAt: validatedExecution.endedAt,
        productTemperatures: validatedExecution.productTemperatures,
        values: submitValues,
        ...(hasDeviation && deviationDescription.trim()
          ? { deviationDescription }
          : {}),
        ...(hasDeviation && correctiveAction.trim()
          ? { correctiveAction }
          : {}),
        clientRequestId,
      });
      toast.success(
        result.status === "deviation"
          ? "Afvigelsen er registreret og skal følges op"
          : "Egenkontrollen er registreret",
      );
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
    <form
      noValidate
      className="grid items-start gap-6 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-col gap-1 md:col-span-2">
        <h2 className="text-xl font-semibold break-words">{item.name}</h2>
        <p className="text-sm text-muted-foreground">
          {foodSafetyControlTypeLabels[item.controlType]} ·{" "}
          {new Intl.DateTimeFormat("da-DK", {
            dateStyle: "long",
            timeZone: "UTC",
          }).format(new Date(`${item.dueDateKey}T12:00:00Z`))}{" "}
          ·{" "}
          {item.status === "notCompleted"
            ? item.startsAt !== null
              ? `Kl. ${formatTime(item.startsAt, timeZone)}–${formatTime(item.dueAt, timeZone)}`
              : `Inden kl. ${formatTime(item.dueAt, timeZone)}`
            : "Registreret"}
        </p>
      </div>
      <Card className="md:col-start-2 md:row-start-2">
        <CardHeader>
          <CardTitle>
            <h3>Instruktioner</h3>
          </CardTitle>
        </CardHeader>
        <CardContent appearance="stacked" className="flex flex-col">
          {item.imageUrl ? (
            <div className="relative h-64 w-full">
              <Image
                src={item.imageUrl}
                alt={`Billede af ${item.name}`}
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 50vw"
                className="rounded-lg object-contain"
              />
            </div>
          ) : null}
          <div className="whitespace-pre-wrap break-words">
            {item.instructions ? (
              <InstructionContent value={item.instructions} />
            ) : (
              "Der er ikke tilføjet instruktioner til denne kontrol."
            )}
          </div>
        </CardContent>
      </Card>
      <Card className="md:col-start-1 md:row-start-2">
        <CardHeader>
          <CardTitle>
            <h3>{item.entry ? "Registrering" : "Udfør kontrol"}</h3>
          </CardTitle>
        </CardHeader>
        <CardContent appearance="spacious" className="flex flex-col">
          {item.entry ? (
            <Alert role="note">
              <AlertTitle>Kontrollen er registreret</AlertTitle>
              <AlertDescription>
                Åbn oversigten for at se dokumentationen.
              </AlertDescription>
            </Alert>
          ) : null}
          {item.entry ? (
            <>
              <FoodSafetyExecutionTimes
                startedAt={item.entry.startedAt}
                endedAt={item.entry.endedAt}
                timeZone={timeZone}
              />
              <FoodSafetyProductTemperatures
                productTemperatures={item.entry.productTemperatures}
              />
            </>
          ) : (
            <FoodSafetyExecutionInputs
              value={execution}
              onChange={(next) => {
                setExecution(next);
                setExecutionErrors({});
              }}
              productTemperaturesEnabled={item.productTemperaturesEnabled}
              disabled={readOnly || saving}
              errors={executionErrors}
            />
          )}
          <FieldGroup>
            {item.fields.map((field) => {
              const value = valueFor(values, field.key);
              return (
                <FoodSafetyFieldInput
                  key={field.key}
                  field={field}
                  value={value}
                  disabled={readOnly || saving}
                  uploading={uploading}
                  onChange={(next) =>
                    setValues((current) => [
                      ...current.filter((item) => item.key !== field.key),
                      ...(next ? [next] : []),
                    ])
                  }
                  onUpload={(attachmentField, files) =>
                    void upload(
                      attachmentField,
                      files,
                      value?.type === "attachment" ? value.storageIds : [],
                    )
                  }
                />
              );
            })}
          </FieldGroup>
          {!readOnly && hasDeviation ? (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="food-safety-deviation">
                  Beskriv afvigelsen *
                </FieldLabel>
                <Textarea
                  id="food-safety-deviation"
                  value={deviationDescription}
                  onChange={(event) =>
                    setDeviationDescription(event.target.value)
                  }
                  maxLength={2_000}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="food-safety-corrective">
                  Korrigerende handling
                </FieldLabel>
                <Textarea
                  id="food-safety-corrective"
                  value={correctiveAction}
                  onChange={(event) => setCorrectiveAction(event.target.value)}
                  maxLength={2_000}
                />
              </Field>
            </FieldGroup>
          ) : null}
        </CardContent>
        {!readOnly ? (
          <CardFooter>
            <Button
              type="submit"
              size="lg"
              className="min-h-12 w-full sm:w-auto"
              disabled={saving || Boolean(uploading)}
            >
              {saving ? <Spinner data-icon="inline-start" /> : null}
              {hasDeviation ? "Registrér afvigelse" : "Registrér egenkontrol"}
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    </form>
  );
}
