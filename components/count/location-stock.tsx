"use client";

import { useQuery } from "convex/react";
import { BoxesIcon } from "lucide-react";
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

export function LocationStock() {
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
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12 w-full" />
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
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
          <EmptyTitle>Vælg en location</EmptyTitle>
          <EmptyDescription>
            Vælg den location, hvis lager du vil se.
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
            <TableCell className="font-medium">{row.productName}</TableCell>
            <TableCell>{row.categoryName ?? "Uden kategori"}</TableCell>
            <TableCell className="text-right tabular-nums">
              {quantityFormatter.format(row.quantity)} {row.defaultUnitName}
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
  );
}
