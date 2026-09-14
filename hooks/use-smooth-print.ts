"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { DateLabel, LabelFormat } from "@/lib/date-label-print";
import { dateLabelImage } from "@/lib/date-label-image";
import { smoothPrintPlatform, smoothPrintUrl } from "@/lib/smooth-print";

const subscribe = () => () => {};
let lastOpenedAt = 0;

export function useSmoothPrintPlatform() {
  return useSyncExternalStore(subscribe, smoothPrintPlatform, () => null);
}

export function useSmoothPrint(
  label: DateLabel | null,
  format: LabelFormat,
  copies: number,
) {
  const platform = useSmoothPrintPlatform();
  const key =
    label && platform ? JSON.stringify({ label, format, copies }) : null;
  const [prepared, setPrepared] = useState<{
    key: string;
    url: string | null;
    error: string | null;
  } | null>(null);
  const [openedKey, setOpenedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const job: { label: DateLabel; format: LabelFormat; copies: number } =
      JSON.parse(key);
    // Prepare before the click so opening the native app keeps browser user activation.
    void import("@/lib/date-label-pdf")
      .then(async ({ dateLabelPdf }) => {
        const image = dateLabelImage(job.label, job.format);
        const pdf = await dateLabelPdf(image, job.format);
        const url = smoothPrintUrl(pdf, job.format, job.copies);
        if (!cancelled) setPrepared({ key, url, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setPrepared({
            key,
            url: null,
            error:
              error instanceof Error
                ? error.message
                : "Etiketten kunne ikke klargøres",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const current = prepared?.key === key ? prepared : null;
  return {
    platform,
    preparing: Boolean(key && !current),
    error: current?.error ?? null,
    opened: Boolean(key && openedKey === key),
    open: () => {
      if (!platform)
        throw new Error("Smooth Print kræver iPad, iPhone eller Android");
      if (!current?.url)
        throw new Error(current?.error ?? "Vent, mens etiketten klargøres");
      if (Date.now() - lastOpenedAt < 1_500) return;
      window.location.assign(current.url);
      lastOpenedAt = Date.now();
      setOpenedKey(key);
    },
  };
}
