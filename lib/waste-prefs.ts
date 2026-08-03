"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const memory = new Map<string, string | null>();

function key(organizationId: string) {
  return `engine.waste.location.${organizationId}`;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function read(organizationId?: string) {
  if (!organizationId) return null;
  try {
    const value =
      window.localStorage.getItem(key(organizationId)) ??
      window.localStorage.getItem(`engine.count.location.${organizationId}`);
    memory.set(organizationId, value);
    return value;
  } catch {
    return memory.get(organizationId) ?? null;
  }
}

export function useWasteLocation(organizationId?: string) {
  return useSyncExternalStore(subscribe, () => read(organizationId), () => null);
}

export function setWasteLocation(
  organizationId: string,
  locationId: string | null,
) {
  memory.set(organizationId, locationId);
  try {
    if (locationId) window.localStorage.setItem(key(organizationId), locationId);
    else window.localStorage.removeItem(key(organizationId));
  } catch {}
  for (const listener of listeners) listener();
}
