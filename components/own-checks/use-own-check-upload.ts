"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { compressImage } from "@/lib/compress-image";
import { uploadToStorage } from "@/lib/upload-to-storage";
import { getUserErrorMessage } from "@/lib/user-errors";
import type { OwnCheckField, OwnCheckValue } from "@/lib/own-checks";

export function useOwnCheckUpload({
  uploadUrl,
  onUploaded,
}: {
  uploadUrl: () => Promise<string>;
  onUploaded: (value: Extract<OwnCheckValue, { type: "attachment" }>) => void;
}) {
  const active = useRef(false);
  const [uploading, setUploading] = useState(false);

  async function upload(
    field: Extract<OwnCheckField, { type: "attachment" }>,
    files: FileList | null,
    existing: string[],
  ) {
    if (active.current || !files?.length) return;
    const selected = Array.from(files);
    if (existing.length + selected.length > field.maxFiles) {
      toast.error(`Feltet må højst have ${field.maxFiles} filer`);
      return;
    }
    active.current = true;
    setUploading(true);
    try {
      const storageIds = [...existing];
      for (const file of selected) {
        if (file.type === "application/pdf") {
          const signature = new TextDecoder().decode(
            await file.slice(0, 5).arrayBuffer(),
          );
          if (signature !== "%PDF-") throw new Error("PDF-filen er ugyldig");
        } else if (!file.type.startsWith("image/")) {
          throw new Error("Vælg et billede eller en PDF-fil");
        }
        const prepared = file.type.startsWith("image/")
          ? await compressImage(file, {
              maxWidth: 2_000,
              maxHeight: 2_000,
              quality: 0.8,
              type: "image/jpeg",
              alwaysReencode: true,
            })
          : file;
        storageIds.push(
          await uploadToStorage({
            uploadUrl: await uploadUrl(),
            file: prepared,
          }),
        );
      }
      onUploaded({ key: field.key, type: "attachment", storageIds });
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Filen kunne ikke uploades. Kontrollér filen, og prøv igen.",
        ),
      );
    } finally {
      active.current = false;
      setUploading(false);
    }
  }
  return { uploading, upload };
}
