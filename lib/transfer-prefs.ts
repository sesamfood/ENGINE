"use client";

import {
  readLocalDraft,
  removeLocalDraft,
  writeLocalDraft,
} from "./local-draft";
import { createLocationPreference } from "./location-preference";

const preference = createLocationPreference("engine.transfer.location");
export const useTransferLocation = preference.useLocation;
export const setTransferLocation = preference.set;

export type TransferDraft = {
  fromLocationId: string | null;
  toLocationId: string | null;
  responsibleUserId: string | null;
  comment: string;
  transferredAtLocal?: string;
  temperatures?: Record<
    string,
    { value: string; maxTemperatureCelsius: number | null }
  >;
  lines: Array<{
    key: string;
    productId: string;
    productName: string;
    unitId: string;
    units: Array<{ id: string; name: string }>;
    quantity: number;
  }>;
};

function draftKey(organizationId: string, userId: string) {
  return `transfer.${organizationId}.${userId}`;
}

export function readTransferDraft(organizationId: string, userId: string) {
  const draft = readLocalDraft<TransferDraft>(draftKey(organizationId, userId));
  return Array.isArray(draft?.lines) ? draft : null;
}

export function writeTransferDraft(
  organizationId: string,
  userId: string,
  draft: TransferDraft,
) {
  writeLocalDraft(draftKey(organizationId, userId), draft);
}

export function clearTransferDraft(organizationId: string, userId: string) {
  removeLocalDraft(draftKey(organizationId, userId));
}
