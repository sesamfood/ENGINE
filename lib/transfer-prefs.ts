"use client";

import { createLocationPreference } from "./location-preference";

const preference = createLocationPreference("engine.transfer.location");
export const useTransferLocation = preference.useLocation;
export const setTransferLocation = preference.set;

export type TransferDraft = {
  fromLocationId: string | null;
  toLocationId: string | null;
  responsibleUserId: string | null;
  comment: string;
  lines: Array<{
    key: string;
    productId: string;
    productName: string;
    unitId: string;
    units: Array<{ id: string; name: string }>;
    quantity: number;
  }>;
};

function draftKey(organizationId: string) {
  return `engine.transfer.draft.${organizationId}`;
}

export function readTransferDraft(organizationId: string): TransferDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(organizationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TransferDraft;
    if (!parsed || !Array.isArray(parsed.lines)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeTransferDraft(
  organizationId: string,
  draft: TransferDraft,
) {
  try {
    window.localStorage.setItem(draftKey(organizationId), JSON.stringify(draft));
  } catch {
    // Drafts are best-effort; storage may be full or unavailable.
  }
}

export function clearTransferDraft(organizationId: string) {
  try {
    window.localStorage.removeItem(draftKey(organizationId));
  } catch {
    // Ignore unavailable storage.
  }
}
