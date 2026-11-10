"use client";

import { useQuery } from "convex/react";
import { WheatIcon } from "lucide-react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useKiosk, useLocationAccess } from "@/components/app-shell";
import { LocationField } from "@/components/location-field";
import { CardSkeleton, FieldSkeleton, RowsSkeleton } from "@/components/page-skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { allergens } from "@/lib/allergens";

const labels = new Map<string, string>(allergens.map((allergen) => [allergen.id, allergen.label]));
const price = new Intl.NumberFormat("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AllergenOverview() {
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const kiosk = useKiosk();
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const locationId =
    lockedId ??
    locations?.find((location) => location.id === selectedLocation)?.id ??
    locations?.[0]?.id ??
    null;
  const result = useQuery(api.allergens.listForLocation, locationId ? { locationId } : "skip");

  if (locations === undefined || (locationId && result === undefined)) {
    return (
      <div className="flex flex-col gap-6">
        <FieldSkeleton className="sm:max-w-xs" />
        <CardSkeleton>
          <RowsSkeleton rows={6} />
        </CardSkeleton>
      </div>
    );
  }
  if (!locationId) {
    return (
      <Empty appearance="outlined" className="min-h-72">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <WheatIcon />
          </EmptyMedia>
          <EmptyTitle>Ingen lokationer</EmptyTitle>
          <EmptyDescription>Opret en lokation for at se allergener.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (!result) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Allergener</h2>
          <p className="text-sm text-muted-foreground">
            Produkter med salgspris på lokationen · {result.products.length}{" "}
            {result.products.length === 1 ? "produkt" : "produkter"}
          </p>
        </div>
        {!kiosk?.kioskModeEnabled ? (
          <Field className="sm:max-w-xs">
            <FieldLabel htmlFor="allergen-location">Lokation</FieldLabel>
            <LocationField
              id="allergen-location"
              locations={locations}
              value={locationId}
              locked={isLocked}
              lockedName={lockedName}
              onValueChange={setSelectedLocation}
            />
          </Field>
        ) : null}
      </div>
      {result.truncated ? (
        <Alert>
          <AlertDescription>Listen er for lang. Kun de første produkter vises.</AlertDescription>
        </Alert>
      ) : null}
      {result.products.length ? (
        <Card>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {result.products.map((product) => (
                <li key={product.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:gap-4">
                  <div className="flex min-w-0 items-baseline justify-between gap-3 sm:w-64 sm:shrink-0 sm:flex-col sm:justify-start sm:gap-0.5">
                    <span className="font-medium break-words">{product.name}</span>
                    <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                      {price.format(product.salesPrice / 100)} kr.
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {product.allergens.length ? (
                      product.allergens.map((allergen) => (
                        <Badge key={allergen} variant="secondary">
                          {labels.get(allergen)}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">Ingen allergener</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : (
        <Empty appearance="outlined" className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <WheatIcon />
            </EmptyMedia>
            <EmptyTitle>Ingen produkter</EmptyTitle>
            <EmptyDescription>
              Der er ingen produkter med salgspris på lokationen.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
