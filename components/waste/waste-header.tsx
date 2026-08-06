"use client";

import { useQuery } from "convex/react";
import { MapPinIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  fixedLocationName,
}: Omit<WasteContextValue, "resetToken"> & {
  organizationId?: string;
  fixedLocationName?: string;
}) {
  const items =
    locations?.map((location) => ({ value: location.id, label: location.name })) ?? [];
  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)] sm:items-end">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Lagerstyring
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Waste</h1>
      </div>
      <Field>
        <FieldLabel>Location</FieldLabel>
        {fixedLocationName ? (
          <div className="flex h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium"><MapPinIcon aria-hidden="true" />{fixedLocationName}</div>
        ) : <Select
          items={items}
          value={locationId}
          onValueChange={(value) => {
            if (organizationId) {
              setWasteLocation(organizationId, value as string);
              setCountLocation(organizationId, value as string);
            }
          }}
          disabled={!locations?.length}
        >
          <SelectTrigger className="h-11 w-full">
            <MapPinIcon aria-hidden="true" />
            <SelectValue placeholder="Vælg location" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>}
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
  const locations = useQuery(api.locations.listLocationOptions);
  const kiosk = useQuery(api.kiosk.getRuntimeContext);
  const locationId = kiosk?.isKioskAccount
    ? kiosk.locationId
    : locations?.some((location) => location.id === storedLocationId)
    ? (storedLocationId as Id<"locations">)
    : (locations?.[0]?.id ?? null);
  const viewState = useQuery(
    api.waste.getViewState,
    locationId ? { locationId } : "skip",
  );
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [resetToken, setResetToken] = useState(0);

  useEffect(() => {
    if (!organizationId || !locations || kiosk?.isKioskAccount) return;
    if (!locations.some((location) => location.id === storedLocationId)) {
      setWasteLocation(organizationId, locations[0]?.id ?? null);
      setCountLocation(organizationId, locations[0]?.id ?? null);
    }
  }, [kiosk?.isKioskAccount, locations, organizationId, storedLocationId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setTarget(document.getElementById("waste-shell-header")),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (kiosk?.kioskModeEnabled) return;
    if (pathname.startsWith("/waste/bad-delivery")) return;
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
  }, [kiosk?.kioskModeEnabled, pathname, router, viewState?.settings.inactivitySeconds]);

  const controls = (
    <Controls
      locationId={locationId}
      locations={locations}
      organizationId={organizationId}
      fixedLocationName={kiosk?.isKioskAccount ? kiosk.locationName ?? undefined : undefined}
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
