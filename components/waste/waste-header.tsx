"use client";

import { selectedLocationId } from "@/lib/location-preference";

import { AppPageHeader, PageTitle } from "@/components/app-page-header";
import { useLocationAccess } from "@/components/app-shell";
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
import type { Id } from "@/convex/_generated/dataModel";
import { setRegistrationLocation, useWasteLocation } from "@/lib/waste-prefs";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { useActiveOrganization } from "@/lib/active-organization";

type WasteContextValue = {
  locationId: Id<"locations"> | null;
  locations: Array<{ id: Id<"locations">; name: string }> | undefined;
  setDraftState: (state: { dirty: boolean; busy: boolean }) => void;
};

const WasteContext = createContext<WasteContextValue>({
  locationId: null,
  locations: undefined,
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
    <div className="grid gap-5 sm:grid-cols-(--grid-cols-page-header) sm:items-center">
      <div className="flex min-w-0 flex-col gap-2">
        <PageTitle>
          Waste
        </PageTitle>
      </div>
      <Field>
        <FieldLabel htmlFor="waste-location" className="sr-only">Lokation</FieldLabel>
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
  const pathname = usePathname();
  const organization = useActiveOrganization();
  const organizationId = organization.data?.id;
  const storedLocationId = useWasteLocation(organizationId);
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const locationId = selectedLocationId({
    locations,
    storedId: storedLocationId,
    lockedId,
    isLocked,
  });
  const [draftState, setDraftState] = useState({ dirty: false, busy: false });
  const [pendingLocation, setPendingLocation] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId || !locations || isLocked) return;
    if (!locations.some((location) => location.id === storedLocationId)) {
      setRegistrationLocation(organizationId, locations[0]?.id ?? null);
    }
  }, [isLocked, locations, organizationId, storedLocationId]);

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
      value={{ locationId, locations, setDraftState }}
    >
      <AppPageHeader>{controls}</AppPageHeader>
      <div
        key={pathname.startsWith("/waste/bad-delivery") ? locationId : undefined}
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
