import type { z } from "zod";
import {
  locationCreateSchema,
  locationPatchSchema,
} from "./contract";

type ConvexLocation = {
  id: string;
  name: string;
  marketId: string | null;
  legalEntityId: string | null;
  operatorId: string | null;
  ownershipType: "owned" | "franchise" | "jointVenture" | "license" | null;
  conceptVersion: string | null;
  openedAt: number | null;
  currency: string | null;
  timeZone: string | null;
  status: "planned" | "open" | "temporarilyClosed" | "closed" | null;
};

export function publicLocation(location: ConvexLocation) {
  return {
    ...location,
    openedAt:
      location.openedAt === null
        ? null
        : new Date(location.openedAt).toISOString(),
  };
}

function openedAt(value: string | null | undefined) {
  return value === undefined ? undefined : value === null ? null : Date.parse(value);
}

export function locationCreateInput(
  input: z.output<typeof locationCreateSchema>,
) {
  return { ...input, openedAt: openedAt(input.openedAt) };
}

export function locationPatchInput(
  input: z.output<typeof locationPatchSchema>,
) {
  return { ...input, openedAt: openedAt(input.openedAt) };
}
