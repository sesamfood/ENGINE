"use client";

import { useEffect, useState } from "react";

function minuteTimestamp() {
  return Math.floor(Date.now() / 60_000) * 60_000;
}

export function useOwnCheckNow(refreshKey?: string) {
  const [now, setNow] = useState(minuteTimestamp);

  useEffect(() => {
    const refresh = () => setNow(minuteTimestamp());
    const interval = window.setInterval(refresh, 60_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    refresh();
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refreshKey]);

  return now;
}
