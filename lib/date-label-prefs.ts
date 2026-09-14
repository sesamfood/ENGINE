"use client";

import { useSyncExternalStore } from "react";
import { labelFormats, type LabelFormat } from "./date-label-print";

const preferencesEvent = "engine.date-labels.preferences";
const memory = new Map<string, string>();

export function subscribePreferences(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(preferencesEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(preferencesEvent, callback);
  };
}

export function readPreference(key: string) {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

export function savePreference(key: string, value: string) {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* Keep preferences for this session when storage is unavailable. */
  }
  window.dispatchEvent(new Event(preferencesEvent));
}

export function useLabelFormat() {
  const stored = useSyncExternalStore(
    subscribePreferences,
    () => readPreference("engine.date-labels.format"),
    () => null,
  );
  const format =
    labelFormats.find((item) => item.value === stored)?.value ?? "62x29";
  const setFormat = (value: LabelFormat) =>
    savePreference("engine.date-labels.format", value);
  return [format, setFormat] as const;
}
