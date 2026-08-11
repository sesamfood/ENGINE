"use client";

import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  useKiosk,
  useLocationAccess,
  usePermission,
} from "@/components/app-shell";
import { authClient } from "@/lib/auth-client";
import { setCountLocation, useCountLocation } from "@/lib/count-prefs";
import { useLastDefined } from "@/lib/use-last-defined";

type CountState = FunctionReturnType<typeof api.count.getCountState>;
type LocationOption = { id: Id<"locations">; name: string };

type CountStateContextValue = {
  organizationId: string | undefined;
  locations: LocationOption[];
  isLocked: boolean;
  lockedId: Id<"locations"> | null;
  lockedName: string | null | undefined;
  locationId: Id<"locations"> | null;
  canRegister: boolean;
  now: number;
  state: CountState | undefined;
};

const CountStateContext = createContext<CountStateContextValue | null>(null);

export function CountStateProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const organization = authClient.useActiveOrganization();
  const organizationId = organization.data?.id;
  const storedLocationId = useCountLocation(organizationId);
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const kiosk = useKiosk();
  const canRegister =
    usePermission("count.register") ||
    Boolean(
      kiosk?.kioskModeEnabled &&
        kiosk.settings?.enabledPages.includes("count.register"),
    );
  const locationId = isLocked
    ? lockedId
    : locations.some((location) => location.id === storedLocationId)
      ? (storedLocationId as Id<"locations">)
      : (locations[0]?.id ?? null);

  useEffect(() => {
    if (!organizationId || isLocked) return;
    const valid = locations.some(
      (location) => location.id === storedLocationId,
    );
    if (!valid) {
      setCountLocation(organizationId, locations[0]?.id ?? null);
    }
  }, [isLocked, locations, organizationId, storedLocationId]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (pathname !== "/count") return;
    const update = () => setNow(Date.now());
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [pathname]);

  const queriedState = useQuery(
    api.count.getCountState,
    canRegister && pathname === "/count" && locationId
      ? { locationId, now: Math.floor(now / 60_000) * 60_000 }
      : "skip",
  );
  const state = useLastDefined(queriedState, locationId);

  return (
    <CountStateContext.Provider
      value={{
        organizationId,
        locations,
        isLocked,
        lockedId,
        lockedName,
        locationId,
        canRegister,
        now,
        state,
      }}
    >
      {children}
    </CountStateContext.Provider>
  );
}

export function useCountState() {
  const context = useContext(CountStateContext);
  if (!context) {
    throw new Error("CountStateProvider mangler");
  }
  return context;
}
