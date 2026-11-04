"use client";

export type OrderingDraft = {
  supplierChoice: string | null;
  overrides: Record<string, string>;
  unitLines: Record<string, Array<{ unitId: string; input: string }>>;
  catalogInputs: Record<string, string>;
  sendEmail: boolean;
};

function draftKey(organizationId: string, locationId: string) {
  return `engine.ordering.draft.${organizationId}.${locationId}`;
}

export function readOrderingDraft(
  organizationId: string,
  locationId: string,
): OrderingDraft | null {
  try {
    const raw = window.localStorage.getItem(
      draftKey(organizationId, locationId),
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrderingDraft;
    if (
      !parsed ||
      typeof parsed.overrides !== "object" ||
      typeof parsed.unitLines !== "object" ||
      typeof parsed.catalogInputs !== "object"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeOrderingDraft(
  organizationId: string,
  locationId: string,
  draft: OrderingDraft,
) {
  try {
    window.localStorage.setItem(
      draftKey(organizationId, locationId),
      JSON.stringify(draft),
    );
  } catch {
    // Drafts are best-effort; storage may be full or unavailable.
  }
}

export function clearOrderingDraft(organizationId: string, locationId: string) {
  try {
    window.localStorage.removeItem(draftKey(organizationId, locationId));
  } catch {
    // Ignore unavailable storage.
  }
}
