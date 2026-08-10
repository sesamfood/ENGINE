"use client";

import { useQuery } from "convex/react";
import {
  BoxesIcon,
  Grid2X2Icon,
  ListIcon,
  PackageOpenIcon,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { useCountLocation } from "@/lib/count-prefs";

const quantityFormatter = new Intl.NumberFormat("da-DK", {
  maximumFractionDigits: 6,
});

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatStockQuantity(
  quantity: number,
  defaultUnitName: string,
  units: Array<{ name: string; factorToDefault: number }>,
) {
  const largestUnit = units
    .filter(
      (unit) =>
        Number.isFinite(unit.factorToDefault) &&
        unit.factorToDefault > 1 &&
        Math.abs(quantity) >= unit.factorToDefault,
    )
    .sort((a, b) => b.factorToDefault - a.factorToDefault)[0];

  if (!largestUnit) {
    return `${quantityFormatter.format(quantity)} ${defaultUnitName}`;
  }

  const wholeUnits = Math.trunc(quantity / largestUnit.factorToDefault);
  const remainder = Number(
    (quantity - wholeUnits * largestUnit.factorToDefault).toPrecision(12),
  );
  const largest = `${quantityFormatter.format(wholeUnits)} ${largestUnit.name}`;

  return Math.abs(remainder) < 1e-9
    ? largest
    : `${largest} og ${quantityFormatter.format(remainder)} ${defaultUnitName}`;
}

export function LocationStock() {
  const [view, setView] = useState<"grid" | "detail">("grid");
  const organization = authClient.useActiveOrganization();
  const organizationId = organization.data?.id;
  const storedLocationId = useCountLocation(organizationId);
  const locations = useQuery(api.locations.listLocationOptions);
  const locationId = locations?.some(
    (location) => location.id === storedLocationId,
  )
    ? (storedLocationId as Id<"locations">)
    : null;
  const stock = useQuery(
    api.count.listLocationStock,
    locationId ? { locationId } : "skip",
  );

  if (!locations || (locationId && !stock)) {
    return (
      <div className="grid gap-3 min-[380px]:grid-cols-2 min-[640px]:grid-cols-3 min-[1024px]:grid-cols-4 lg:gap-5 min-[1200px]:grid-cols-5 min-[1600px]:grid-cols-6 min-[1920px]:grid-cols-7 min-[2240px]:grid-cols-8">
        {Array.from({ length: 8 }, (_, index) => (
          <Card key={index} className="gap-4 py-0">
            <Skeleton className="aspect-video w-full rounded-none lg:aspect-[4/3]" />
            <CardHeader className="pb-4">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-8 w-1/2" />
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  if (!locationId) {
    return (
      <Empty className="min-h-72 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BoxesIcon />
          </EmptyMedia>
          <EmptyTitle>Vælg en lokation</EmptyTitle>
          <EmptyDescription>
            Vælg den lokation, hvis lager du vil se.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (stock?.length === 0) {
    return (
      <Empty className="min-h-72 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BoxesIcon />
          </EmptyMedia>
          <EmptyTitle>Ingen aktive produkter</EmptyTitle>
          <EmptyDescription>
            Aktive produkter vises her, når de er oprettet i kataloget.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end">
        <ToggleGroup
          value={[view]}
          onValueChange={(value) => {
            if (value[0] === "grid" || value[0] === "detail") {
              setView(value[0]);
            }
          }}
          variant="outline"
          spacing={0}
          aria-label="Visning af lager"
        >
          <ToggleGroupItem value="grid" aria-label="Vis som kort">
            <Grid2X2Icon />
            <span className="hidden sm:inline">Kort</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="detail" aria-label="Vis detaljer">
            <ListIcon />
            <span className="hidden sm:inline">Detaljer</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {view === "grid" ? (
        <div className="grid gap-3 min-[380px]:grid-cols-2 min-[640px]:grid-cols-3 min-[1024px]:grid-cols-4 lg:gap-5 min-[1200px]:grid-cols-5 min-[1600px]:grid-cols-6 min-[1920px]:grid-cols-7 min-[2240px]:grid-cols-8">
          {stock?.map((row) => (
            <Card
              key={row.productId}
              className="h-full gap-0 py-0 [--card-spacing:--spacing(3)] lg:[--card-spacing:--spacing(4)]"
            >
              {row.imageUrl ? (
                <div className="relative aspect-video w-full overflow-hidden bg-muted lg:aspect-[4/3]">
                  <Image
                    src={row.imageUrl}
                    alt={`Produktbillede af ${row.productName}`}
                    fill
                    sizes="(max-width: 379px) 100vw, (max-width: 639px) 50vw, (max-width: 1023px) 33vw, (max-width: 1199px) 25vw, (max-width: 1599px) 20vw, (max-width: 1919px) 16vw, (max-width: 2239px) 14vw, 12vw"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex aspect-video w-full items-center justify-center bg-muted text-muted-foreground lg:aspect-[4/3]">
                  <PackageOpenIcon
                    className="size-10 lg:size-12"
                    aria-hidden="true"
                  />
                </div>
              )}
              <CardHeader className="py-3 lg:py-4">
                <div className="flex min-w-0 items-baseline gap-2">
                  <CardTitle className="min-w-0 flex-1 truncate">
                    {row.productName}
                  </CardTitle>
                  <CardDescription className="max-w-[45%] shrink-0 truncate">
                    {row.categoryName ?? "Uden kategori"}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 pb-3 lg:pb-4">
                <p className="text-xl font-semibold tabular-nums">
                  {formatStockQuantity(
                    row.quantity,
                    row.defaultUnitName,
                    row.units ?? [],
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {row.lastCountedAt
                    ? `Senest talt ${dateFormatter.format(row.lastCountedAt)}`
                    : "Ikke talt endnu"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produkt</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-right">Beholdning</TableHead>
                <TableHead>Senest talt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock?.map((row) => (
                <TableRow key={row.productId}>
                  <TableCell className="font-medium">
                    {row.productName}
                  </TableCell>
                  <TableCell>{row.categoryName ?? "Uden kategori"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatStockQuantity(
                      row.quantity,
                      row.defaultUnitName,
                      row.units ?? [],
                    )}
                  </TableCell>
                  <TableCell>
                    {row.lastCountedAt
                      ? dateFormatter.format(row.lastCountedAt)
                      : "Ikke talt endnu"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
