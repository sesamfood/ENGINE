"use client";

import {
  useAccess,
  useKiosk,
  useLocationAccess,
  usePermission,
} from "@/components/app-shell";
import { PrinterSettings } from "@/components/date-labels/printer-setup";
import { ProductVisibilitySettings } from "@/components/date-labels/product-visibility-settings";
import { LocationField } from "@/components/location-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { selectedLocationId } from "@/lib/location-preference";
import { setRegistrationLocation, useWasteLocation } from "@/lib/waste-prefs";

export function DateLabelSettings() {
  const access = useAccess();
  const kiosk = useKiosk();
  const canPrint = usePermission("dateLabels.print");
  const canManageProducts = usePermission("catalog.manage");
  const session = authClient.useSession().data;
  const organizationId = session?.session.activeOrganizationId ?? undefined;
  const storedId = useWasteLocation(organizationId);
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const locationId = selectedLocationId({
    locations,
    storedId,
    isLocked,
    lockedId,
  });
  const locationName =
    locations.find((location) => location.id === locationId)?.name ??
    lockedName ??
    "";

  if (!access) return <Skeleton className="h-64 max-w-3xl" />;
  if (!canPrint || kiosk?.kioskModeEnabled) {
    return (
      <Alert variant="destructive" className="max-w-3xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til indstillinger for Datomærkning.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6 pb-10">
      {canManageProducts ? (
        <>
          <Field className="max-w-sm">
            <FieldLabel htmlFor="date-label-settings-location">
              Lokation
            </FieldLabel>
            <LocationField
              id="date-label-settings-location"
              locations={locations}
              value={locationId}
              locked={isLocked}
              lockedName={lockedName}
              onValueChange={(value) => {
                if (organizationId)
                  setRegistrationLocation(organizationId, value);
              }}
            />
          </Field>
          {locationId ? (
            <Card>
              <CardHeader>
                <CardTitle>Produkter</CardTitle>
                <CardDescription>
                  Gælder alle brugere på {locationName}.
                </CardDescription>
              </CardHeader>
              <ProductVisibilitySettings
                key={`${organizationId}:${session?.user.id}:${locationId}`}
                locationId={locationId}
              />
            </Card>
          ) : (
            <Alert>
              <AlertTitle>Ingen lokationer</AlertTitle>
              <AlertDescription>
                Du skal have adgang til en lokation for at vælge produkter til
                Datomærkning.
              </AlertDescription>
            </Alert>
          )}
        </>
      ) : null}
      <PrinterSettings />
    </div>
  );
}
