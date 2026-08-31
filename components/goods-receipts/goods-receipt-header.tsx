"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useLocationAccess } from "@/components/app-shell";
import { LocationField } from "@/components/location-field";
import { Field, FieldLabel } from "@/components/ui/field";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { setCountLocation } from "@/lib/count-prefs";
import { setWasteLocation, useWasteLocation } from "@/lib/waste-prefs";

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
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const storedLocation = locations.find(
    (location) => location.id === storedLocationId,
  );
  const locationId = isLocked
    ? lockedId
    : (storedLocation?.id ?? locations[0]?.id ?? null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTarget(document.getElementById("goods-receipts-shell-header"));
    });
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!organizationId || isLocked || !locations.length) return;
    if (!storedLocation) {
      const fallback = locations[0]?.id ?? null;
      setWasteLocation(organizationId, fallback);
      setCountLocation(organizationId, fallback);
    }
  }, [isLocked, locations, organizationId, storedLocation]);

  function selectLocation(value: string) {
    if (!organizationId) return;
    const location = locations.find((item) => item.id === value);
    if (!location) return;
    setWasteLocation(organizationId, location.id);
    setCountLocation(organizationId, location.id);
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
      <header className="md:hidden">
        <HeaderContent
          controlId="goods-receipt-location-mobile"
          {...headerProps}
        />
      </header>
      {target
        ? createPortal(
            <HeaderContent
              controlId="goods-receipt-location"
              {...headerProps}
            />,
            target,
          )
        : null}
      {children}
    </GoodsReceiptContext.Provider>
  );
}
