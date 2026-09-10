"use client";

import { setCountLocation } from "@/lib/count-prefs";
import { createLocationPreference } from "./location-preference";

const preference = createLocationPreference(
  "engine.waste.location",
  "engine.count.location",
);
export const useWasteLocation = preference.useLocation;
export const setWasteLocation = preference.set;

export function setRegistrationLocation(
  organizationId: string,
  locationId: string | null,
) {
  setWasteLocation(organizationId, locationId);
  setCountLocation(organizationId, locationId);
}
