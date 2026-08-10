"use client";

import { useQuery } from "convex/react";
import { CheckCircle2Icon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldLabel } from "@/components/ui/field";
import { LocationField } from "@/components/location-field";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useKiosk, useLocationAccess, usePermission } from "@/components/app-shell";
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
  organizationId,
  periodKey,
  isLocked,
  lockedName,
}: {
  locationId: Id<"locations"> | null;
  locations:
    | Array<{ id: Id<"locations">; name: string }>
    | undefined;
  organizationId: string | undefined;
  periodKey: string | undefined;
  isLocked: boolean;
  lockedName?: string | null;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)] sm:items-end">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Lagerstyring
        </p>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Optælling
          </h1>
          {periodKey ? (
            <p className="text-lg capitalize text-muted-foreground">
              {formatPeriod(periodKey)}
            </p>
          ) : null}
        </div>
      </div>

      <Field>
        <FieldLabel htmlFor="count-location">Lokation</FieldLabel>
        <LocationField
          id="count-location"
          locations={locations}
          value={locationId}
          locked={isLocked}
          lockedName={lockedName}
          onValueChange={(value) => {
            if (organizationId) setCountLocation(organizationId, value);
          }}
        />
      </Field>
    </div>
  );
}

export function CountHeader() {
  const pathname = usePathname();
  const organization = authClient.useActiveOrganization();
  const organizationId = organization.data?.id;
  const storedLocationId = useCountLocation(organizationId);
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const kiosk = useKiosk();
  const canRegister = usePermission("count.register") || Boolean(kiosk?.kioskModeEnabled && kiosk.settings?.enabledPages.includes("count.register"));
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
    if (!organizationId || !locations || isLocked) return;
    const valid = locations.some(
      (location) => location.id === storedLocationId,
    );
    if (!valid) {
      setCountLocation(organizationId, locations[0]?.id ?? null);
    }
  }, [isLocked, locations, organizationId, storedLocationId]);

  const locationId = isLocked
    ? lockedId
    : locations?.some((location) => location.id === storedLocationId)
      ? (storedLocationId as Id<"locations">)
      : (locations?.[0]?.id ?? null);
  const queryNow = Math.floor(now / 60_000) * 60_000;
  const queriedState = useQuery(
    api.count.getCountState,
    canRegister && pathname === "/count" && locationId
      ? { locationId, now: queryNow }
      : "skip",
  );
  const state = useLastDefined(queriedState, locationId);
  const submitted = state?.count?.status === "submitted";
  const statusDescription =
    state?.count?.submittedAt
      ? `Registreret ${new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" }).format(state.count.submittedAt)}${state.count.submittedByName ? ` af ${state.count.submittedByName}` : ""}.`
      : "Denne optælling kan ikke ændres.";
  return (
    <div className="flex flex-col gap-6">
      <header className="md:hidden">
        <CountHeaderControls
          locationId={locationId}
          locations={locations}
          organizationId={organizationId}
          periodKey={state?.periodKey}
          isLocked={isLocked}
          lockedName={lockedName}
        />
      </header>
      {desktopTarget
        ? createPortal(
            <CountHeaderControls
              locationId={locationId}
              locations={locations}
              organizationId={organizationId}
              periodKey={state?.periodKey}
              isLocked={isLocked}
              lockedName={lockedName}
            />,
            desktopTarget,
          )
        : null}

      {pathname === "/count" && submitted ? (
        <Alert className="md:-mt-5">
          <CheckCircle2Icon />
          <AlertTitle>Optællingen er registreret</AlertTitle>
          <AlertDescription>{statusDescription}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
