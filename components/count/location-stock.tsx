"use client";

import { useCompleteCatalog } from "@/hooks/use-complete-catalog";

import { useMutation } from "convex/react";
import { BoxesIcon, Grid2X2Icon, ListIcon, PencilIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import {
  ProductCardMedia,
  productGridClassName,
} from "@/components/catalog/product-card-media";
import { useCountState } from "./count-state-provider";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { parseQuantity } from "@/lib/quantity-input";
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
import { ProductGridSkeleton } from "@/components/page-skeletons";
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
import { getUserErrorMessage } from "@/lib/user-errors";
import { useKiosk, usePermission } from "@/components/app-shell";
import { dateTimeFormatter, DEFAULT_TIME_ZONE } from "@/lib/date";
import { unitNameFor } from "@/lib/unit-system";

const quantityFormatter = new Intl.NumberFormat("da-DK", {
  maximumFractionDigits: 6,
});

function formatStockQuantity(
  quantity: number,
  defaultUnitName: string,
  units: Array<{ name: string; pluralName?: string; factorToDefault: number }>,
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
  const largest = `${quantityFormatter.format(wholeUnits)} ${unitNameFor(largestUnit, wholeUnits)}`;

  return Math.abs(remainder) < 1e-9
    ? largest
    : `${largest} og ${quantityFormatter.format(remainder)} ${defaultUnitName}`;
}


export function LocationStock() {
  const [view, setView] = useState<"grid" | "detail">("grid");
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
  const canManage = usePermission("count.manage");
  const deductIngredients = useMutation(
    api.count.deductIngredientsForNegativeStock,
  );
  const [pending, setPending] = useState<{
    productId: Id<"products">;
    productName: string;
    quantity: string;
  } | "all" | null>(null);
  const deductAllIngredients = useMutation(
    api.count.deductAllIngredientsForNegativeStock,
  );
  const adjustStock = useMutation(api.count.adjustLocationStock);
  const [isDeducting, setIsDeducting] = useState(false);
  const [editing, setEditing] = useState<{
    productId: Id<"products">;
    productName: string;
    defaultUnitName: string;
    current: string;
    value: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const editQuantity = editing ? parseQuantity(editing.value) : null;

  async function saveStock() {
    if (!editing || !locationId || editQuantity === null) return;
    setIsSaving(true);
    try {
      await adjustStock({
        locationId,
        productId: editing.productId,
        quantity: editQuantity,
      });
      toast.success(`Lageret for ${editing.productName} er opdateret`);
      setEditing(null);
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Lageret kunne ikke opdateres. Prøv igen."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmDeduct() {
    if (!pending || !locationId) return;
    setIsDeducting(true);
    try {
      if (pending === "all") {
        const count = await deductAllIngredients({ locationId });
        toast.success(
          count === 1
            ? "1 produkt står nu på nul"
            : `${count} produkter står nu på nul`,
        );
      } else {
        await deductIngredients({ locationId, productId: pending.productId });
        toast.success(`${pending.productName} står nu på nul`);
      }
      setPending(null);
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Ingredienserne kunne ikke trækkes. Prøv igen."),
      );
    } finally {
      setIsDeducting(false);
    }
  }

  type StockRow = NonNullable<typeof stock>[number];
  const canDeduct = (row: StockRow) =>
    canManage && row.hasIngredients && row.quantity < 0;

  const deductableCount = stock?.filter(canDeduct).length ?? 0;

  function editButton(row: StockRow) {
    if (!canManage) return null;
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Redigér lager for ${row.productName}`}
        onClick={() =>
          setEditing({
            productId: row.productId,
            productName: row.productName,
            defaultUnitName: row.defaultUnitName,
            current: formatStockQuantity(row.quantity, row.defaultUnitName, row.units ?? []),
            value: String(Math.max(0, row.quantity)).replace(".", ","),
          })
        }
      >
        <PencilIcon />
      </Button>
    );
  }

  function deductButton(row: StockRow) {
    if (!canDeduct(row)) return null;
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          setPending({
            productId: row.productId,
            productName: row.productName,
            quantity: formatStockQuantity(
              -row.quantity,
              row.defaultUnitName,
              row.units ?? [],
            ),
          })
        }
      >
        Træk ingredienser
      </Button>
    );
  }

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
      <div className="flex flex-col gap-5">
        <Skeleton className="h-11 w-44 self-end" />
        <ProductGridSkeleton>
          <CardHeader appearance="product">
            <Skeleton className="h-5 w-2/3" />
          </CardHeader>
          <CardContent appearance="stock" className="flex flex-col">
            <Skeleton className="h-7 w-1/2" />
            <Skeleton className="h-4 w-full" />
          </CardContent>
        </ProductGridSkeleton>
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
      <div className="flex flex-wrap items-center justify-end gap-3">
        {deductableCount > 1 ? (
          <Button
            type="button"
            variant="outline"
            className="mr-auto"
            onClick={() => setPending("all")}
          >
            Træk ingredienser for alle ({deductableCount})
          </Button>
        ) : null}
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
        <div className={productGridClassName}>
          {stock?.map((row) => (
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
                <div className="flex min-w-0 items-baseline gap-2">
                  <CardTitle appearance="truncate" className="min-w-0 flex-1">
                    {row.productName}
                  </CardTitle>
                  <CardDescription appearance="truncate" className="max-w-9/20 shrink-0">
                    {row.categoryName ?? "Uden kategori"}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent appearance="stock" className="flex flex-col">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xl font-semibold tabular-nums">
                    {formatStockQuantity(
                      row.quantity,
                      row.defaultUnitName,
                      row.units ?? [],
                    )}
                  </p>
                  {editButton(row)}
                </div>
                <p className="text-sm text-muted-foreground">
                  {row.lastCountedAt
                    ? `Senest talt ${dateFormatter.format(row.lastCountedAt)}`
                    : "Ikke talt endnu"}
                </p>
                {canDeduct(row) ? (
                  <div className="mt-2">{deductButton(row)}</div>
                ) : null}
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
                {canManage ? (
                  <TableHead>
                    <span className="sr-only">Handlinger</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock?.map((row) => (
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
                  {canManage ? (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {deductButton(row)}
                        {editButton(row)}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open && !isDeducting) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Træk ingredienser fra lageret?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending === "all"
                ? `${deductableCount} produkter står på minus. Ingredienserne til de mængder trækkes fra lageret, og produkterne sættes til nul.`
                : pending
                ? `${pending.productName} står på minus ${pending.quantity}. Ingredienserne til den mængde trækkes fra lageret, og ${pending.productName} sættes til nul.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeducting}>Annullér</AlertDialogCancel>
            <AlertDialogAction disabled={isDeducting} onClick={confirmDeduct}>
              Træk ingredienser
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open && !isSaving) setEditing(null);
        }}
      >
        <DialogContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveStock();
            }}
          >
            <DialogHeader>
              <DialogTitle>Redigér lager</DialogTitle>
              <DialogDescription>
                {editing ? `${editing.productName} står på ${editing.current}.` : null}
              </DialogDescription>
            </DialogHeader>
            <Alert>
              <TriangleAlertIcon />
              <AlertTitle>Anbefales ikke</AlertTitle>
              <AlertDescription>
                Ret helst lageret med en Count, en Transfer eller en Waste-registrering, så ændringen kan spores. Brug kun dette til at rette fejl.
              </AlertDescription>
            </Alert>
            <Field data-invalid={editQuantity === null}>
              <FieldLabel htmlFor="stock-quantity">
                Beholdning ({editing?.defaultUnitName})
              </FieldLabel>
              <Input
                id="stock-quantity"
                type="text"
                inputMode="decimal"
                value={editing?.value ?? ""}
                onChange={(event) =>
                  setEditing((current) =>
                    current ? { ...current, value: event.target.value } : current,
                  )
                }
                className="h-11"
                aria-invalid={editQuantity === null}
                autoFocus
              />
              <FieldError>
                {editQuantity === null ? "Angiv en mængde på nul eller mere" : null}
              </FieldError>
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => setEditing(null)}
              >
                Annullér
              </Button>
              <Button type="submit" disabled={isSaving || editQuantity === null}>
                Gem
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
