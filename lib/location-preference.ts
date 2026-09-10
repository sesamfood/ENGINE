"use client";

import { useSyncExternalStore } from "react";

export function createLocationPreference(
  prefix: string,
  fallbackPrefix?: string,
) {
  const listeners = new Set<() => void>();
  const memory = new Map<string, string | null>();
  const failedWrites = new Set<string>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  function read(organizationId?: string) {
    if (!organizationId) return null;
    if (failedWrites.has(organizationId))
      return memory.get(organizationId) ?? null;
    try {
      const value =
        window.localStorage.getItem(`${prefix}.${organizationId}`) ??
        (fallbackPrefix
          ? window.localStorage.getItem(`${fallbackPrefix}.${organizationId}`)
          : null);
      memory.set(organizationId, value);
      return value;
    } catch {
      return memory.get(organizationId) ?? null;
    }
  }

  function set(organizationId: string, locationId: string | null) {
    memory.set(organizationId, locationId);
    try {
      if (locationId)
        window.localStorage.setItem(`${prefix}.${organizationId}`, locationId);
      else window.localStorage.removeItem(`${prefix}.${organizationId}`);
      failedWrites.delete(organizationId);
    } catch {
      failedWrites.add(organizationId);
    }
    notify();
  }

  function useLocation(organizationId?: string) {
    return useSyncExternalStore(
      subscribe,
      () => read(organizationId),
      () => null,
    );
  }
  return { useLocation, set };
}

export function selectedLocationId<Id extends string>({
  locations,
  storedId,
  lockedId,
  isLocked,
}: {
  locations: readonly { id: Id }[];
  storedId: string | null;
  lockedId: Id | null;
  isLocked: boolean;
}) {
  return isLocked
    ? lockedId
    : (locations.find((location) => location.id === storedId)?.id ??
        locations[0]?.id ??
        null);
}
