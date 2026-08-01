"use client";

import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const EMPTY_ORDER: string[] = [];
const locationMemory = new Map<string, string | null>();
const orderMemory = new Map<string, string[]>();
const orderRaw = new Map<string, string | null>();

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

function orderKey(organizationId: string, locationId: string) {
  return `engine.count.order.${organizationId}.${locationId}`;
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

function readOrder(organizationId?: string, locationId?: string | null) {
  if (!organizationId || !locationId) return EMPTY_ORDER;
  const memoryKey = `${organizationId}:${locationId}`;
  try {
    const raw =
      window.localStorage.getItem(orderKey(organizationId, locationId)) ??
      window.localStorage.getItem(`engine.count.order.${organizationId}`);
    if (orderRaw.get(memoryKey) === raw) {
      return orderMemory.get(memoryKey) ?? [];
    }
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const order = Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
    orderRaw.set(memoryKey, raw);
    orderMemory.set(memoryKey, order);
    return order;
  } catch {
    return orderMemory.get(memoryKey) ?? [];
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

export function useCountOrder(
  organizationId?: string,
  locationId?: string | null,
) {
  return useSyncExternalStore(
    subscribe,
    () => readOrder(organizationId, locationId),
    () => EMPTY_ORDER,
  );
}

export function setCountOrder(
  organizationId: string,
  locationId: string,
  order: string[],
) {
  const normalized = [...new Set(order)];
  const memoryKey = `${organizationId}:${locationId}`;
  orderMemory.set(memoryKey, normalized);
  try {
    const raw = JSON.stringify(normalized);
    window.localStorage.setItem(orderKey(organizationId, locationId), raw);
    orderRaw.set(memoryKey, raw);
  } catch {
    // ponytail: private mode / quota — keep this device preference in memory.
  }
  emit();
}
