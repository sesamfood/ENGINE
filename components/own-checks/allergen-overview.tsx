"use client";

import { useQuery } from "convex/react";
import { CheckIcon, FileDownIcon, WheatIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useKiosk, useLocationAccess } from "@/components/app-shell";
import { LocationField } from "@/components/location-field";
import { AllergenIcon } from "@/components/own-checks/allergen-icon";
import { CardSkeleton, FieldSkeleton, RowsSkeleton } from "@/components/page-skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActiveOrganization } from "@/lib/active-organization";
import { allergens } from "@/lib/allergens";
import { getUserErrorMessage } from "@/lib/user-errors";

const price = new Intl.NumberFormat("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Draws any browser-readable image as PNG, since the PDF only embeds PNG and JPEG.
async function imageAsPng(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

export function AllergenOverview() {
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const kiosk = useKiosk();
  const organization = useActiveOrganization();
  const branding = useQuery(api.organization.getBranding, organization.data ? {} : "skip");
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const locationId =
    lockedId ??
    locations?.find((location) => location.id === selectedLocation)?.id ??
    locations?.[0]?.id ??
    null;
  const locationName =
    lockedName ?? locations?.find((location) => location.id === locationId)?.name ?? "";
  const result = useQuery(api.allergens.listForLocation, locationId ? { locationId } : "skip");

  async function exportPdf() {
    if (!result) return;
    setExporting(true);
    try {
      const [{ buildAllergenPdf }, markPng] = await Promise.all([
        import("@/lib/allergen-pdf"),
        organization.data?.logo ? imageAsPng(organization.data.logo) : Promise.resolve(null),
      ]);
      const bytes = await buildAllergenPdf({
        locationName,
        primaryColor: branding?.theme?.primary ?? "",
        markPng,
        products: result.products,
      });
      const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: "application/pdf" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `allergener-${locationName.toLowerCase().replace(/[^a-z0-9æøå]+/giu, "-").replace(/^-|-$/gu, "") || "lokation"}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "PDF'en kunne ikke oprettes"));
    } finally {
      setExporting(false);
    }
  }

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {!kiosk?.kioskModeEnabled ? (
            <Field className="sm:w-64">
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
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={exporting || !result.products.length}
            onClick={() => void exportPdf()}
          >
            {exporting ? <Spinner data-icon="inline-start" /> : <FileDownIcon data-icon="inline-start" />}
            Hent PDF
          </Button>
        </div>
      </div>
      {result.truncated ? (
        <Alert>
          <AlertDescription>Listen er for lang. Kun de første produkter vises.</AlertDescription>
        </Alert>
      ) : null}
      {result.products.length ? (
        <Card appearance="product">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead appearance="frozenLabel" className="min-w-44 align-bottom">
                  Produkt
                </TableHead>
                {allergens.map((allergen) => (
                  <TableHead key={allergen.id} appearance="matrix" className="w-14 min-w-14">
                    <div className="flex flex-col items-center gap-1 py-2">
                      <AllergenIcon allergen={allergen.id} className="size-9" />
                      <span className="text-xs leading-tight text-muted-foreground">{allergen.label}</span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.products.map((product) => {
                const contained = new Set(product.allergens);
                return (
                  <TableRow key={product.id}>
                    <TableCell appearance="frozenLabel">
                      <div className="flex flex-col">
                        <span>{product.name}</span>
                        <span className="text-xs font-normal text-muted-foreground tabular-nums">
                          {price.format(product.salesPrice / 100)} kr.
                        </span>
                      </div>
                    </TableCell>
                    {allergens.map((allergen) => (
                      <TableCell key={allergen.id} appearance="matrix">
                        {contained.has(allergen.id) ? (
                          <span className="inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <CheckIcon className="size-4" aria-hidden="true" />
                            <span className="sr-only">{allergen.label}</span>
                          </span>
                        ) : null}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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
