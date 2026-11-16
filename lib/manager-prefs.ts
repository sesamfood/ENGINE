"use client";

import { createLocationPreference } from "./location-preference";

const preference = createLocationPreference("engine.manager.location");
export const useManagerLocation = preference.useLocation;
export const setManagerLocation = preference.set;
