"use client";

import { useEffect, useState } from "react";

const REFRESH_MS = 5 * 60 * 1_000;

function currentBucket() {
  return Math.floor(Date.now() / REFRESH_MS) * REFRESH_MS;
}

export function useDashboardNow() {
  const [now, setNow] = useState(currentBucket);

  useEffect(() => {
    const refresh = () => setNow(currentBucket());
    const interval = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  return now;
}
