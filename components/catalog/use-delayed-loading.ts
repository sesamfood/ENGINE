"use client";

import { useEffect, useState } from "react";

export function useDelayedLoading(loading: boolean, delay = 180) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setReady(loading),
      loading ? delay : 0,
    );
    return () => window.clearTimeout(timeout);
  }, [delay, loading]);

  return loading && ready;
}
