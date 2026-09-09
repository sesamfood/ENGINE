"use client";

import { selectedLocationId } from "@/lib/location-preference";

import { AppPageHeader } from "@/components/app-page-header";
import {
  useKiosk,
  useLocationAccess,
  usePermission,
} from "@/components/app-shell";
import { LocationField } from "@/components/location-field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { setRegistrationLocation, useWasteLocation } from "@/lib/waste-prefs";
import { useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

type WasteContextValue = {
  locationId: Id<"locations"> | null;
  locations: Array<{ id: Id<"locations">; name: string }> | undefined;
  resetToken: number;
  setDraftState: (state: { dirty: boolean; busy: boolean }) => void;
};

const WasteContext = createContext<WasteContextValue>({
  locationId: null,
  locations: undefined,
  resetToken: 0,
  setDraftState: () => {},
});

export function useWasteContext() {
  return useContext(WasteContext);
}

function Controls({
  locationId,
  locations,
  onLocationChange,
  disabled,
  isLocked,
  lockedName,
}: Pick<WasteContextValue, "locationId" | "locations"> & {
  onLocationChange: (value: string) => void;
  disabled: boolean;
  isLocked: boolean;
  lockedName?: string | null;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)] sm:items-end">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Waste
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Waste
        </h1>
      </div>
      <Field>
        <FieldLabel htmlFor="waste-location">Lokation</FieldLabel>
        <LocationField
          id="waste-location"
          locations={locations}
          value={locationId}
          locked={isLocked}
          lockedName={lockedName}
          onValueChange={onLocationChange}
          disabled={disabled}
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
  const canRegister =
    usePermission("waste.register") ||
    Boolean(
      kiosk?.kioskModeEnabled &&
      kiosk.settings?.enabledPages.includes("waste.register"),
    );
  const locationId = selectedLocationId({
    locations,
    storedId: storedLocationId,
    lockedId,
    isLocked,
  });
  const viewState = useQuery(
    api.waste.getViewState,
    canRegister && !pathname.startsWith("/waste/report") && locationId
      ? { locationId }
      : "skip",
  );
  const [draftState, setDraftState] = useState({ dirty: false, busy: false });
  const [pendingLocation, setPendingLocation] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState(0);

  useEffect(() => {
    if (!organizationId || !locations || isLocked) return;
    if (!locations.some((location) => location.id === storedLocationId)) {
      setRegistrationLocation(organizationId, locations[0]?.id ?? null);
    }
  }, [isLocked, locations, organizationId, storedLocationId]);

  useEffect(() => {
    if (!canRegister || kiosk?.kioskModeEnabled) return;
    if (
      pathname.startsWith("/waste/bad-delivery") ||
      pathname.startsWith("/waste/report")
    )
      return;
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
      for (const event of events)
        window.removeEventListener(event, activity, true);
    };
  }, [
    canRegister,
    kiosk?.kioskModeEnabled,
    pathname,
    router,
    viewState?.settings.inactivitySeconds,
  ]);

  const controls = (
    <Controls
      locationId={locationId}
      locations={locations}
      disabled={draftState.busy}
      onLocationChange={(value) => {
        if (!organizationId || value === locationId) return;
        if (draftState.dirty && pathname.startsWith("/waste/bad-delivery"))
          setPendingLocation(value);
        else setRegistrationLocation(organizationId, value);
      }}
      isLocked={isLocked}
      lockedName={lockedName}
    />
  );

  return (
    <WasteContext.Provider
      value={{ locationId, locations, resetToken, setDraftState }}
    >
      <AppPageHeader>{controls}</AppPageHeader>
      <div
        key={`${resetToken}:${pathname.startsWith("/waste/bad-delivery") ? locationId : ""}`}
      >
        {children}
      </div>
      <AlertDialog
        open={pendingLocation !== null}
        onOpenChange={(open) => {
          if (!open) setPendingLocation(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skift lokation?</AlertDialogTitle>
            <AlertDialogDescription>
              Produkterne, billederne og kommentaren i denne kladde bliver
              fjernet, når du skifter lokation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Behold kladde</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (organizationId && pendingLocation)
                  setRegistrationLocation(organizationId, pendingLocation);
                setDraftState({ dirty: false, busy: false });
                setPendingLocation(null);
              }}
            >
              Skift lokation og fjern kladde
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WasteContext.Provider>
  );
}
