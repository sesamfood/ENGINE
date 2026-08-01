"use client";

import { useSyncExternalStore } from "react";

export type EmployeeTab = "schedule" | "directory";

const listeners = new Set<() => void>();
const tabMemory = new Map<string, EmployeeTab>();
const locationMemory = new Map<string, string | null>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) listener();
}

function tabKey(organizationId: string) {
  return `engine.employees.tab.${organizationId}`;
}

function locationKey(organizationId: string) {
  return `engine.employees.location.${organizationId}`;
}

function readTab(organizationId?: string): EmployeeTab {
  if (!organizationId) return "schedule";
  try {
    const value = window.localStorage.getItem(tabKey(organizationId));
    const tab = value === "directory" ? "directory" : "schedule";
    tabMemory.set(organizationId, tab);
    return tab;
  } catch {
    return tabMemory.get(organizationId) ?? "schedule";
  }
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

export function useEmployeeTab(organizationId?: string) {
  return useSyncExternalStore(
    subscribe,
    () => readTab(organizationId),
    () => "schedule",
  );
}

export function setEmployeeTab(
  organizationId: string,
  tab: EmployeeTab,
) {
  tabMemory.set(organizationId, tab);
  try {
    window.localStorage.setItem(tabKey(organizationId), tab);
  } catch {
    // ponytail: private mode / quota — keep this device preference in memory.
  }
  emit();
}

export function useEmployeeLocation(organizationId?: string) {
  return useSyncExternalStore(
    subscribe,
    () => readLocation(organizationId),
    () => null,
  );
}

export function setEmployeeLocation(
  organizationId: string,
  locationId: string,
) {
  locationMemory.set(organizationId, locationId);
  try {
    window.localStorage.setItem(locationKey(organizationId), locationId);
  } catch {
    // ponytail: private mode / quota — keep this device preference in memory.
  }
  emit();
}
