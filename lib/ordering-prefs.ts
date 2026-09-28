"use client";

import { createLocationPreference } from "./location-preference";

const preference = createLocationPreference("engine.ordering.location");
export const useOrderingLocation = preference.useLocation;
export const setOrderingLocation = preference.set;
