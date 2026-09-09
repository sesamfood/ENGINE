"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ownCheckLimitText } from "@/lib/own-check-display";
import type { OwnCheckField, OwnCheckValue } from "@/lib/own-checks";

export function OwnCheckFieldInput({
  field,
  value,
  onChange,
  onUpload,
  onRemoveAttachment,
  disabled = false,
  uploading = false,
}: {
  field: OwnCheckField;
  value: OwnCheckValue | undefined;
  onChange: (value: OwnCheckValue | null) => void;
  onUpload: (
    field: Extract<OwnCheckField, { type: "attachment" }>,
    files: FileList | null,
  ) => void;
  onRemoveAttachment?: (storageId: string) => void;
  disabled?: boolean;
  uploading?: boolean;
}) {
  const id = useId();
  const guidance = ownCheckLimitText(field, "guidance");
  const attachmentIds = value?.type === "attachment" ? value.storageIds : [];
  return (
    <Field data-disabled={disabled}>
      <FieldLabel id={`${id}-label`} htmlFor={id}>
        {field.label}
        {field.required ? " *" : ""}
      </FieldLabel>
      {field.type === "number" ? (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={field.decimals === undefined ? "any" : 1 / 10 ** field.decimals}
          value={value?.type === "number" ? value.number : ""}
          disabled={disabled}
          onChange={(event) =>
            onChange(
              event.target.value === ""
                ? null
                : {
                    key: field.key,
                    type: "number",
                    number: Number(event.target.value),
                  },
            )
          }
        />
      ) : null}
      {field.type === "checkbox" ? (
        <Switch
          id={id}
          checked={value?.type === "checkbox" ? value.checked : false}
          disabled={disabled}
          onCheckedChange={(checked) =>
            onChange({ key: field.key, type: "checkbox", checked })
          }
        />
      ) : null}
      {field.type === "choice" ? (
        <RadioGroup
          id={id}
          aria-labelledby={`${id}-label`}
          value={value?.type === "choice" ? value.value : ""}
          disabled={disabled}
          onValueChange={(next) =>
            onChange({ key: field.key, type: "choice", value: next })
          }
          className="gap-3"
        >
          {field.options.map((option, index) => (
            <label
              key={option.value}
              className="flex min-h-11 items-center gap-3 rounded-md border px-3"
            >
              <RadioGroupItem
                value={option.value}
                id={`${id}-${index}`}
                disabled={disabled}
              />
              {option.label}
            </label>
          ))}
        </RadioGroup>
      ) : null}
      {field.type === "text" ? (
        <Textarea
          id={id}
          value={value?.type === "text" ? value.text : ""}
          disabled={disabled}
          maxLength={field.maxLength ?? 2_000}
          onChange={(event) =>
            onChange({ key: field.key, type: "text", text: event.target.value })
          }
        />
      ) : null}
      {field.type === "attachment" ? (
        <>
          <Input
            id={id}
            type="file"
            accept="image/*,application/pdf"
            multiple={field.maxFiles > 1}
            disabled={
              disabled || uploading || attachmentIds.length >= field.maxFiles
            }
            onChange={(event) => {
              onUpload(field, event.target.files);
              event.target.value = "";
            }}
          />
          {attachmentIds.length ? (
            <FieldDescription>
              {attachmentIds.length} fil{attachmentIds.length === 1 ? "" : "er"}{" "}
              valgt
            </FieldDescription>
          ) : null}
          {onRemoveAttachment ? (
            <div className="flex flex-wrap gap-2">
              {attachmentIds.map((storageId) => (
                <Button
                  key={storageId}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || uploading}
                  onClick={() => onRemoveAttachment(storageId)}
                >
                  Fjern fil
                </Button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
      {guidance ? <FieldDescription>{guidance}</FieldDescription> : null}
    </Field>
  );
}
