"use client";

import { createLocationPreference } from "./location-preference";

const preference = createLocationPreference("engine.employees.location");
export const useEmployeeLocation = preference.useLocation;
export const setEmployeeLocation = preference.set;
