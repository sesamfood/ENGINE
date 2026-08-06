"use client";

import { useQuery } from "convex/react";
import {
  CheckCircle2Icon,
  MapPinIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { setCountLocation, useCountLocation } from "@/lib/count-prefs";
import { useLastDefined } from "@/lib/use-last-defined";

const periodFormatter = new Intl.DateTimeFormat("da-DK", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Copenhagen",
});

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Copenhagen",
});

function formatPeriod(periodKey: string) {
  const [year, month, day] = periodKey.split("-").map(Number);
  if (day) {
    return dateFormatter.format(Date.UTC(year, month - 1, day));
  }
  return periodFormatter.format(Date.UTC(year, month - 1, 15));
}

function CountHeaderControls({
  locationId,
  locations,
  locationItems,
  organizationId,
  periodKey,
  fixedLocationName,
}: {
  locationId: Id<"locations"> | null;
  locations:
    | Array<{ id: Id<"locations">; name: string }>
    | undefined;
  locationItems: Array<{ value: Id<"locations">; label: string }>;
  organizationId: string | undefined;
  periodKey: string | undefined;
  fixedLocationName?: string;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)] sm:items-end">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Lagerstyring
        </p>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Count
          </h1>
          {periodKey ? (
            <p className="text-lg capitalize text-muted-foreground">
              {formatPeriod(periodKey)}
            </p>
          ) : null}
        </div>
      </div>

      <Field>
        <FieldLabel>Location</FieldLabel>
        {fixedLocationName ? (
          <div className="flex h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium"><MapPinIcon aria-hidden="true" />{fixedLocationName}</div>
        ) : <Select
          items={locationItems}
          value={locationId}
          onValueChange={(value) => {
            if (organizationId) {
              setCountLocation(organizationId, value as string);
            }
          }}
          disabled={!locations || locations.length === 0}
        >
          <SelectTrigger className="h-11 w-full">
            <MapPinIcon aria-hidden="true" />
            <SelectValue placeholder="Vælg location" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {locationItems.map((location) => (
                <SelectItem key={location.value} value={location.value}>
                  {location.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>}
      </Field>
    </div>
  );
}

export function CountHeader() {
  const pathname = usePathname();
  const organization = authClient.useActiveOrganization();
  const organizationId = organization.data?.id;
  const storedLocationId = useCountLocation(organizationId);
  const locations = useQuery(api.locations.listLocationOptions);
  const kiosk = useQuery(api.kiosk.getRuntimeContext);
  const [now, setNow] = useState(() => Date.now());
  const [desktopTarget, setDesktopTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDesktopTarget(document.getElementById("count-shell-header"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!organizationId || !locations || kiosk?.isKioskAccount) return;
    const valid = locations.some(
      (location) => location.id === storedLocationId,
    );
    if (!valid) {
      setCountLocation(organizationId, locations[0]?.id ?? null);
    }
  }, [kiosk?.isKioskAccount, locations, organizationId, storedLocationId]);

  const locationId = kiosk?.isKioskAccount
    ? kiosk.locationId
    : locations?.some(
    (location) => location.id === storedLocationId,
  )
    ? (storedLocationId as Id<"locations">)
    : null;
  const queryNow = Math.floor(now / 60_000) * 60_000;
  const queriedState = useQuery(
    api.count.getCountState,
    locationId ? { locationId, now: queryNow } : "skip",
  );
  const state = useLastDefined(queriedState, locationId);
  const submitted = state?.count?.status === "submitted";
  const statusDescription =
    state?.count?.submittedAt
      ? `Registreret ${new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" }).format(state.count.submittedAt)}${state.count.submittedByName ? ` af ${state.count.submittedByName}` : ""}.`
      : "Denne count kan ikke ændres.";
  const locationItems =
    locations?.map((location) => ({
      value: location.id,
      label: location.name,
    })) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="md:hidden">
        <CountHeaderControls
          locationId={locationId}
          locations={locations}
          locationItems={locationItems}
          organizationId={organizationId}
          periodKey={state?.periodKey}
          fixedLocationName={kiosk?.isKioskAccount ? kiosk.locationName ?? undefined : undefined}
        />
      </header>
      {desktopTarget
        ? createPortal(
            <CountHeaderControls
              locationId={locationId}
              locations={locations}
              locationItems={locationItems}
              organizationId={organizationId}
              periodKey={state?.periodKey}
              fixedLocationName={kiosk?.isKioskAccount ? kiosk.locationName ?? undefined : undefined}
            />,
            desktopTarget,
          )
        : null}

      {pathname === "/count" && submitted ? (
        <Alert className="md:-mt-5">
          <CheckCircle2Icon />
          <AlertTitle>Count er registreret</AlertTitle>
          <AlertDescription>{statusDescription}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
