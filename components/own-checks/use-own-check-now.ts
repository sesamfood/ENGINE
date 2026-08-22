"use client";

import { useEffect, useState } from "react";

const HOUR_MS = 60 * 60 * 1_000;

function hourTimestamp() {
  return Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
}

export function useOwnCheckNow(refreshKey?: string) {
  const [now, setNow] = useState(hourTimestamp);

  useEffect(() => {
    const refresh = () => setNow(hourTimestamp());
    const delay = HOUR_MS - (Date.now() % HOUR_MS);
    let interval: number | undefined;
    const timeout = window.setTimeout(() => {
      refresh();
      interval = window.setInterval(refresh, HOUR_MS);
    }, delay);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    refresh();
    return () => {
      window.clearTimeout(timeout);
      if (interval !== undefined) window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshKey]);

  return now;
}
