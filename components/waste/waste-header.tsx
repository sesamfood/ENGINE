"use client";

import { useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Field, FieldLabel } from "@/components/ui/field";
import { LocationField } from "@/components/location-field";
import { useKiosk, useLocationAccess, usePermission } from "@/components/app-shell";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { setCountLocation } from "@/lib/count-prefs";
import { setWasteLocation, useWasteLocation } from "@/lib/waste-prefs";

type WasteContextValue = {
  locationId: Id<"locations"> | null;
  locations: Array<{ id: Id<"locations">; name: string }> | undefined;
  resetToken: number;
};

const WasteContext = createContext<WasteContextValue>({
  locationId: null,
  locations: undefined,
  resetToken: 0,
});

export function useWasteContext() {
  return useContext(WasteContext);
}

function Controls({
  locationId,
  locations,
  organizationId,
  isLocked,
  lockedName,
}: Omit<WasteContextValue, "resetToken"> & {
  organizationId?: string;
  isLocked: boolean;
  lockedName?: string | null;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)] sm:items-end">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Lagerstyring
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Spild</h1>
      </div>
      <Field>
        <FieldLabel htmlFor="waste-location">Lokation</FieldLabel>
        <LocationField
          id="waste-location"
          locations={locations}
          value={locationId}
          locked={isLocked}
          lockedName={lockedName}
          onValueChange={(value) => {
            if (!organizationId) return;
            setWasteLocation(organizationId, value);
            setCountLocation(organizationId, value);
          }}
        />
      </Field>
    </div>
  );
}

export function WasteHeader({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const organization = authClient.useActiveOrganization();
  const organizationId = organization.data?.id;
  const storedLocationId = useWasteLocation(organizationId);
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const kiosk = useKiosk();
  const canRegister = usePermission("waste.register") || Boolean(kiosk?.kioskModeEnabled && kiosk.settings?.enabledPages.includes("waste.register"));
  const locationId = isLocked
    ? lockedId
    : locations?.some((location) => location.id === storedLocationId)
    ? (storedLocationId as Id<"locations">)
    : (locations?.[0]?.id ?? null);
  const viewState = useQuery(
    api.waste.getViewState,
    canRegister && !pathname.startsWith("/waste/report") && locationId
      ? { locationId }
      : "skip",
  );
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [resetToken, setResetToken] = useState(0);

  useEffect(() => {
    if (!organizationId || !locations || isLocked) return;
    if (!locations.some((location) => location.id === storedLocationId)) {
      setWasteLocation(organizationId, locations[0]?.id ?? null);
      setCountLocation(organizationId, locations[0]?.id ?? null);
    }
  }, [isLocked, locations, organizationId, storedLocationId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setTarget(document.getElementById("waste-shell-header")),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!canRegister || kiosk?.kioskModeEnabled) return;
    if (pathname.startsWith("/waste/bad-delivery") || pathname.startsWith("/waste/report")) return;
    const seconds = viewState?.settings.inactivitySeconds ?? 30;
    let timer = window.setTimeout(reset, seconds * 1000);
    function reset() {
      router.replace("/waste", { scroll: false });
      setResetToken((value) => value + 1);
      window.scrollTo({ top: 0 });
    }
    function activity() {
      window.clearTimeout(timer);
      timer = window.setTimeout(reset, seconds * 1000);
    }
    const events = ["pointerdown", "keydown", "input", "scroll"] as const;
    for (const event of events) window.addEventListener(event, activity, true);
    return () => {
      window.clearTimeout(timer);
      for (const event of events) window.removeEventListener(event, activity, true);
    };
  }, [canRegister, kiosk?.kioskModeEnabled, pathname, router, viewState?.settings.inactivitySeconds]);

  const controls = (
    <Controls
      locationId={locationId}
      locations={locations}
      organizationId={organizationId}
      isLocked={isLocked}
      lockedName={lockedName}
    />
  );

  return (
    <WasteContext.Provider value={{ locationId, locations, resetToken }}>
      <header className="md:hidden">{controls}</header>
      {target ? createPortal(controls, target) : null}
      <div key={resetToken}>{children}</div>
    </WasteContext.Provider>
  );
}
