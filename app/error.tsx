"use client";

import { ErrorRecovery } from "@/components/error-recovery";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <ErrorRecovery errorCode={error.digest} retry={unstable_retry} />;
}
