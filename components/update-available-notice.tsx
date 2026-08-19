"use client";

import { InfoIcon } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

const CURRENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "development";
const POLL_INTERVAL_MS = 5 * 60 * 1000;
const MIN_CHECK_GAP_MS = 60 * 1000;

/** Notifies the user when the server runs a newer build than this tab. */
export function UpdateAvailableNotice() {
  useEffect(() => {
    if (CURRENT_BUILD_ID === "development") return;

    let stopped = false;
    let lastCheckedAt = Date.now();

    async function check() {
      if (stopped || document.visibilityState === "hidden") return;
      if (Date.now() - lastCheckedAt < MIN_CHECK_GAP_MS) return;
      lastCheckedAt = Date.now();

      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;

        const { buildId } = (await response.json()) as { buildId?: string };
        if (!buildId || buildId === CURRENT_BUILD_ID) return;

        stopped = true;
        toast("En ny version er klar", {
          icon: <InfoIcon className="size-4" />,
          duration: Number.POSITIVE_INFINITY,
          action: {
            label: "Genindlæs",
            onClick: () => window.location.reload(),
          },
        });
      } catch {
        // Ignorer netværksfejl, og prøv igen ved næste tjek.
      }
    }

    const interval = window.setInterval(check, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", check);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  return null;
}
