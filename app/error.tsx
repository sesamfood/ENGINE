"use client";

import posthog from "posthog-js";
import { useEffect } from "react";
import { ErrorRecovery } from "@/components/error-recovery";

export default function ErrorPage({
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

  return <ErrorRecovery errorCode={error.digest} retry={unstable_retry} />;
}
