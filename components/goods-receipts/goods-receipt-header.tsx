"use client";

import { selectedLocationId } from "@/lib/location-preference";

import { AppPageHeader } from "@/components/app-page-header";

import { useLocationAccess } from "@/components/app-shell";
import { LocationField } from "@/components/location-field";
import { Field, FieldLabel } from "@/components/ui/field";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { setRegistrationLocation, useWasteLocation } from "@/lib/waste-prefs";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect } from "react";

type GoodsReceiptContextValue = {
  locationId: Id<"locations"> | null;
};

const GoodsReceiptContext = createContext<GoodsReceiptContextValue>({
  locationId: null,
});

export function useGoodsReceiptContext() {
  return useContext(GoodsReceiptContext);
}

function HeaderContent({
  controlId,
  locationId,
  locations,
  isLocked,
  lockedName,
  onLocationChange,
}: {
  controlId: string;
  locationId: Id<"locations"> | null;
  locations: Array<{ id: Id<"locations">; name: string }>;
  isLocked: boolean;
  lockedName?: string | null;
  onLocationChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)] sm:items-end">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Varemodtagelse
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Varemodtagelse
        </h1>
      </div>
      <Field>
        <FieldLabel htmlFor={controlId}>Lokation</FieldLabel>
        <LocationField
          id={controlId}
          locations={locations}
          value={locationId}
          locked={isLocked}
          lockedName={lockedName}
          onValueChange={onLocationChange}
        />
      </Field>
    </div>
  );
}

export function GoodsReceiptHeader({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const organization = authClient.useActiveOrganization();
  const organizationId = organization.data?.id;
  const storedLocationId = useWasteLocation(organizationId);
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const storedLocation = locations.find(
    (location) => location.id === storedLocationId,
  );
  const locationId = selectedLocationId({
    locations,
    storedId: storedLocationId,
    lockedId,
    isLocked,
  });

  useEffect(() => {
    if (!organizationId || isLocked || !locations.length) return;
    if (!storedLocation) {
      const fallback = locations[0]?.id ?? null;
      setRegistrationLocation(organizationId, fallback);
    }
  }, [isLocked, locations, organizationId, storedLocation]);

  function selectLocation(value: string) {
    if (!organizationId) return;
    const location = locations.find((item) => item.id === value);
    if (!location) return;
    setRegistrationLocation(organizationId, location.id);
    if (pathname !== "/goods-receipts") {
      router.push("/goods-receipts", { scroll: false });
    }
  }

  const headerProps = {
    locationId,
    locations,
    isLocked,
    lockedName,
    onLocationChange: selectLocation,
  };

  return (
    <GoodsReceiptContext.Provider value={{ locationId }}>
      <AppPageHeader>
        <HeaderContent controlId="goods-receipt-location" {...headerProps} />
      </AppPageHeader>
      {children}
    </GoodsReceiptContext.Provider>
  );
}
