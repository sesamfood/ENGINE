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

function orderKey(organizationId: string) {
  return `engine.count.order.${organizationId}`;
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

function readOrder(organizationId?: string) {
  if (!organizationId) return EMPTY_ORDER;
  try {
    const raw = window.localStorage.getItem(orderKey(organizationId));
    if (orderRaw.get(organizationId) === raw) {
      return orderMemory.get(organizationId) ?? [];
    }
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const order = Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
    orderRaw.set(organizationId, raw);
    orderMemory.set(organizationId, order);
    return order;
  } catch {
    return orderMemory.get(organizationId) ?? [];
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

export function useCountOrder(organizationId?: string) {
  return useSyncExternalStore(
    subscribe,
    () => readOrder(organizationId),
    () => EMPTY_ORDER,
  );
}

export function setCountOrder(organizationId: string, order: string[]) {
  const normalized = [...new Set(order)];
  orderMemory.set(organizationId, normalized);
  try {
    const raw = JSON.stringify(normalized);
    window.localStorage.setItem(orderKey(organizationId), raw);
    orderRaw.set(organizationId, raw);
  } catch {
    // ponytail: private mode / quota — keep this device preference in memory.
  }
  emit();
}
