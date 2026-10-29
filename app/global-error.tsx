"use client";

import posthog from "posthog-js";
import { useEffect } from "react";
import { ErrorRecovery } from "@/components/error-recovery";
import "./globals.css";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  // Boundaries swallow render errors before PostHog's global handler sees them.
  useEffect(() => {
    posthog.captureException(error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="da" className="h-full">
      <body className="min-h-full">
        <title>Der opstod en fejl</title>
        <ErrorRecovery
          errorCode={error.digest}
          fullPage
          retry={unstable_retry}
        />
      </body>
    </html>
  );
}
