"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const locationMemory = new Map<string, string | null>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener();
}

function locationKey(organizationId: string) {
  return `engine.count.location.${organizationId}`;
}

function readLocation(organizationId?: string) {
  if (!organizationId) return null;
  try {
    const value = window.localStorage.getItem(locationKey(organizationId));
    locationMemory.set(organizationId, value);
    return value;
  } catch {
    return locationMemory.get(organizationId) ?? null;
  }
}

export function useCountLocation(organizationId?: string) {
  return useSyncExternalStore(
    subscribe,
    () => readLocation(organizationId),
    () => null,
  );
}

export function setCountLocation(
  organizationId: string,
  locationId: string | null,
) {
  locationMemory.set(organizationId, locationId);
  try {
    if (locationId) {
      window.localStorage.setItem(locationKey(organizationId), locationId);
    } else {
      window.localStorage.removeItem(locationKey(organizationId));
    }
  } catch {
    // ponytail: private mode / quota — keep this device preference in memory.
  }
  emit();
}
