"use client";

import { useState } from "react";

export function useLastDefined<T>(value: T | undefined, key: string | null) {
  const [last, setLast] = useState<{ key: string; value: T } | null>(null);

  if (
    value !== undefined &&
    key !== null &&
    (last?.key !== key || last.value !== value)
  ) {
    setLast({ key, value });
  }

  return value ?? (last?.key === key ? last.value : undefined);
}
