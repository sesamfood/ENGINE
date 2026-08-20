"use client";

import { CheckCircle2Icon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldLabel } from "@/components/ui/field";
import { LocationField } from "@/components/location-field";
import type { Id } from "@/convex/_generated/dataModel";
import { useCountState } from "@/components/count/count-state-provider";
import { setCountLocation } from "@/lib/count-prefs";

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
          Count
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
  const [desktopTarget, setDesktopTarget] = useState<HTMLElement | null>(null);
  const { organizationId, locations, isLocked, lockedName, locationId, state } =
    useCountState();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDesktopTarget(document.getElementById("count-shell-header"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const submitted = state?.count?.status === "submitted";
  const statusDescription =
    state?.count?.submittedAt
      ? `Registreret ${new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" }).format(state.count.submittedAt)}${state.count.submittedByName ? ` af ${state.count.submittedByName}` : ""}.`
      : "Denne Count kan ikke ændres.";
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
          <AlertTitle>Count er registreret</AlertTitle>
          <AlertDescription>{statusDescription}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
