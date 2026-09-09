"use client";

import { createLocationPreference } from "./location-preference";

const preference = createLocationPreference("engine.count.location");
export const useCountLocation = preference.useLocation;
export const setCountLocation = preference.set;
