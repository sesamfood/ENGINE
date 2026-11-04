"use client";

import { createLocationPreference } from "./location-preference";

const preference = createLocationPreference("engine.transfer.location");
export const useTransferLocation = preference.useLocation;
export const setTransferLocation = preference.set;
