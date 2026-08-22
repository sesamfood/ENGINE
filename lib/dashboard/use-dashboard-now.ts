"use client";

import { useEffect, useState } from "react";

const REFRESH_MS = 60 * 60 * 1_000;

function currentBucket() {
  return Math.floor(Date.now() / REFRESH_MS) * REFRESH_MS;
}

export function useDashboardNow() {
  const [now, setNow] = useState(currentBucket);

  useEffect(() => {
    let timeout: number;
    const refresh = () => setNow(currentBucket());
    const scheduleRefresh = () => {
      window.clearTimeout(timeout);
      const untilNextBucket = REFRESH_MS - (Date.now() % REFRESH_MS);
      timeout = window.setTimeout(() => {
        refresh();
        scheduleRefresh();
      }, untilNextBucket + 100);
    };
    scheduleRefresh();
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return now;
}
