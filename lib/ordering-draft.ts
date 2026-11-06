"use client";

import {
  readLocalDraft,
  removeLocalDraft,
  writeLocalDraft,
} from "./local-draft";

export type OrderingDraft = {
  supplierChoice: string | null;
  overrides: Record<string, string>;
  unitLines: Record<string, Array<{ unitId: string; input: string }>>;
  catalogInputs: Record<string, string>;
  sendEmail: boolean;
};

function draftKey(organizationId: string, userId: string, locationId: string) {
  return `ordering.${organizationId}.${userId}.${locationId}`;
}

export function readOrderingDraft(
  organizationId: string,
  userId: string,
  locationId: string,
) {
  const draft = readLocalDraft<OrderingDraft>(
    draftKey(organizationId, userId, locationId),
  );
  return draft?.overrides && draft.unitLines && draft.catalogInputs ? draft : null;
}

export function writeOrderingDraft(
  organizationId: string,
  userId: string,
  locationId: string,
  draft: OrderingDraft,
) {
  writeLocalDraft(draftKey(organizationId, userId, locationId), draft);
}

export function clearOrderingDraft(
  organizationId: string,
  userId: string,
  locationId: string,
) {
  removeLocalDraft(draftKey(organizationId, userId, locationId));
}
