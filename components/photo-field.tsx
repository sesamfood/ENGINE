"use client";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  CameraIcon,
  FileImageIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { toast } from "sonner";

export const photoTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

export function PhotoField({
  label,
  description,
  file,
  error,
  onChange,
  camera = true,
  maxFileSize,
  disabled,
  className,
}: {
  label: string;
  description?: string;
  file: File | null;
  error?: string;
  onChange: (file: File | null) => void;
  camera?: boolean;
  maxFileSize?: number;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const cameraInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!file || !preview.current) return;
    const url = URL.createObjectURL(file);
    preview.current.style.backgroundImage = `url("${url}")`;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function select(next?: File) {
    if (!next) return;
    if (!photoTypes.includes(next.type)) {
      toast.error("Vælg et JPEG-, PNG-, WebP- eller AVIF-billede");
      return;
    }
    if (maxFileSize !== undefined && next.size > maxFileSize) {
      toast.error(
        `Billedet må højst fylde ${Math.round(maxFileSize / 1024 / 1024)} MB`,
      );
      return;
    }
    onChange(next);
  }
  function remove() {
    if (cameraInput.current) cameraInput.current.value = "";
    if (uploadInput.current) uploadInput.current.value = "";
    onChange(null);
  }
  return (
    <Field data-invalid={Boolean(error)} data-disabled={disabled}>
      <FieldLabel htmlFor={`${id}-upload-button`}>{label}</FieldLabel>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {file ? (
        <div
          ref={preview}
          role="img"
          aria-label={`Forhåndsvisning af ${label.toLocaleLowerCase("da")}`}
          className={cn(
            "aspect-video w-full rounded-lg bg-muted bg-contain bg-center bg-no-repeat",
            className,
          )}
        />
      ) : (
        <div
          className={cn(
            "flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-lg bg-muted text-muted-foreground",
            className,
          )}
        >
          <FileImageIcon className="size-8" aria-hidden="true" />
          <span className="text-sm">Intet billede valgt</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {camera ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={disabled}
            aria-label={`Tag billede: ${label}`}
            onClick={() => cameraInput.current?.click()}
          >
            <CameraIcon data-icon="inline-start" />
            Tag billede
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={disabled}
          id={`${id}-upload-button`}
          aria-label={`Upload billede: ${label}`}
          onClick={() => uploadInput.current?.click()}
        >
          <UploadIcon data-icon="inline-start" />
          Upload billede
        </Button>
        {file ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            disabled={disabled}
            aria-label={`Fjern billede: ${label}`}
            onClick={remove}
          >
            <Trash2Icon data-icon="inline-start" />
            Fjern billede
          </Button>
        ) : null}
      </div>
      {camera ? (
        <input
          ref={cameraInput}
          hidden
          aria-label={`Tag billede: ${label}`}
          tabIndex={-1}
          type="file"
          accept={photoTypes.join(",")}
          capture="environment"
          disabled={disabled}
          onChange={(event) => {
            select(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      ) : null}
      <input
        ref={uploadInput}
        id={`${id}-upload`}
        hidden
        tabIndex={-1}
        type="file"
        accept={photoTypes.join(",")}
        aria-invalid={Boolean(error)}
        disabled={disabled}
        onChange={(event) => {
          select(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <FieldError>{error}</FieldError>
    </Field>
  );
}
