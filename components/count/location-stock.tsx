"use client";

import { useCompleteCatalog } from "@/hooks/use-complete-catalog";

import { BoxesIcon, Grid2X2Icon, ListIcon, SearchIcon } from "lucide-react";
import {
  ProductCardMedia,
  productGridClassName,
} from "@/components/catalog/product-card-media";
import { useCountState } from "./count-state-provider";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useKiosk, usePermission } from "@/components/app-shell";
import { dateTimeFormatter, DEFAULT_TIME_ZONE } from "@/lib/date";
import { searchProducts } from "@/lib/product-search";

const quantityFormatter = new Intl.NumberFormat("da-DK", {
  maximumFractionDigits: 6,
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
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const { locations, locationId, state } = useCountState();
  const dateFormatter = dateTimeFormatter("da-DK", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: state?.timeZone ?? DEFAULT_TIME_ZONE,
  });
  const kiosk = useKiosk();
  const canView =
    usePermission("count.viewStock") ||
    Boolean(
      kiosk?.kioskModeEnabled &&
      kiosk.settings?.enabledPages.includes("count.stock"),
    );
  const stock = useCompleteCatalog(
    api.count.listLocationStockPage,
    canView && locationId ? { locationId } : "skip",
  );
  const categories = [...new Set((stock ?? []).map((row) => row.categoryName ?? "Uden kategori"))]
    .sort((a, b) => a.localeCompare(b, "da"));
  const activeCategory = categories.some((name) => `category:${name}` === category)
    ? category
    : "all";
  const visibleStock = searchProducts(
    (stock ?? []).filter((row) =>
      activeCategory === "all" || `category:${row.categoryName ?? "Uden kategori"}` === activeCategory,
    ),
    search,
    (row) => ({ name: row.productName, categoryPath: row.categoryName ?? "Uden kategori" }),
  );

  if (!canView) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til lagerbeholdningen.
        </AlertDescription>
      </Alert>
    );
  }

  if (!locations || (locationId && !stock)) {
    return (
      <div className={productGridClassName}>
        {Array.from({ length: 8 }, (_, index) => (
          <Card key={index} appearance="gallery">
            <Skeleton appearance="square" className="aspect-video w-full lg:aspect-4/3" />
            <CardHeader appearance="inset">
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
      <Empty appearance="outlined" className="min-h-72">
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
      <Empty appearance="outlined" className="min-h-72">
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <InputGroup className="h-11 min-w-0 flex-1">
          <InputGroupAddon><SearchIcon aria-hidden="true" /></InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Søg efter produkt eller kategori"
            aria-label="Søg i lageret"
          />
        </InputGroup>
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
      <Tabs value={activeCategory} onValueChange={setCategory} className="min-w-0">
        <TabsList
          aria-label="Produktkategorier"
          className="h-12 w-full justify-start overflow-x-auto overflow-y-hidden"
        >
          <TabsTrigger value="all" appearance="standard" className="min-w-20 shrink-0">Alle</TabsTrigger>
          {categories.map((name) => (
            <TabsTrigger key={name} value={`category:${name}`} appearance="standard" className="min-w-28 shrink-0">
              {name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <p role="status" className="text-sm text-muted-foreground">
        {visibleStock.length} af {stock?.length ?? 0} produkter
      </p>

      {visibleStock.length === 0 ? (
        <Empty appearance="outlined" className="min-h-64">
          <EmptyHeader>
            <EmptyMedia variant="icon"><SearchIcon /></EmptyMedia>
            <EmptyTitle>Ingen produkter fundet</EmptyTitle>
            <EmptyDescription>Prøv et andet søgeord eller en anden kategori.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" className="min-h-11" onClick={() => { setSearch(""); setCategory("all"); }}>
              Nulstil filtre
            </Button>
          </EmptyContent>
        </Empty>
      ) : view === "grid" ? (
        <div className={productGridClassName}>
          {visibleStock.map((row) => (
            <Card
              key={row.productId}
              appearance="product"
              spacing="responsive"
              className="h-full"
            >
              <ProductCardMedia
                imageUrl={row.imageUrl}
                alt={`Produktbillede af ${row.productName}`}
              />
              <CardHeader appearance="product">
                <div className="flex min-w-0 flex-col gap-1">
                  <CardTitle appearance="productName">
                    {row.productName}
                  </CardTitle>
                  <CardDescription>
                    {row.categoryName ?? "Uden kategori"}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent appearance="stock" className="flex flex-col">
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
              {visibleStock.map((row) => (
                <TableRow key={row.productId}>
                  <TableCell appearance="label">
                    {row.productName}
                  </TableCell>
                  <TableCell>{row.categoryName ?? "Uden kategori"}</TableCell>
                  <TableCell appearance="numeric" className="text-right">
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
