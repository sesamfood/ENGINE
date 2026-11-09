"use client";

const PREFIX = "engine.draft.";
// Stale quantities and readings must not come back as if they were current.
const MAX_AGE_MS = 24 * 60 * 60 * 1_000;

type StoredDraft<T> = { startedAt: number; value: T };

function readStored<T>(key: string): StoredDraft<T> | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredDraft<T> | null;
    if (!stored?.value || typeof stored.startedAt !== "number") return null;
    return Date.now() - stored.startedAt > MAX_AGE_MS ? null : stored;
  } catch {
    return null;
  }
}

export function readLocalDraft<T>(key: string): T | null {
  const stored = readStored<T>(key);
  if (!stored) removeLocalDraft(key);
  return stored?.value ?? null;
}

export function writeLocalDraft<T>(key: string, value: T) {
  try {
    const startedAt = readStored<T>(key)?.startedAt ?? Date.now();
    window.localStorage.setItem(
      PREFIX + key,
      JSON.stringify({ startedAt, value } satisfies StoredDraft<T>),
    );
  } catch {
    // Drafts are best-effort; storage may be full or unavailable.
  }
}

export function removeLocalDraft(key: string) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // Ignore unavailable storage.
  }
}

export function clearLocalDrafts() {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore unavailable storage.
  }
}
