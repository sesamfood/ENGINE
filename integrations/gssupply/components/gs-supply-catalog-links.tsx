"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  CircleAlertIcon,
  PackageOpenIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CreatableCombobox,
  type ComboboxOption,
} from "@/components/catalog/creatable-combobox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { usePermission } from "@/components/app-shell";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { searchProducts } from "@/lib/product-search";
import { getUserErrorMessage } from "@/lib/user-errors";
import { useGsSupplyCatalog } from "./gs-supply-link-editor";

type EngineProduct = FunctionReturnType<
  typeof api.integrations.gssupply.api.listLinks
>["products"][number];
type CatalogRow = {
  productNumber: string;
  name: string;
  category: string;
  pictureUrl: string | null;
  price: number | null;
  unitAmount: number | null;
  inCatalog: boolean;
};

const priceFormatter = new Intl.NumberFormat("da-DK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const numberFormatter = new Intl.NumberFormat("da-DK");
const NEW_UNIT = "new-unit";

/** One row per GS Supply catalog item; each item is linked to an Engine product. */
export function GsSupplyCatalogLinks() {
  const options = useQuery(api.integrations.gssupply.api.listLinks);
  const canAddUnit = usePermission("catalog.manage");
  const { products: catalog, reload } = useGsSupplyCatalog();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const linkedByNumber = useMemo(
    () =>
      new Map(
        (options?.products ?? []).flatMap((product) =>
          product.link ? [[product.link.productNumber, product] as const] : [],
        ),
      ),
    [options],
  );
  const productOptions = useMemo<ComboboxOption[]>(
    () =>
      (options?.products ?? []).map((product) => ({
        value: product.id,
        label: product.name,
        searchName: product.name,
      })),
    [options],
  );

  if (!options || catalog === undefined) {
    return <Skeleton className="h-96 w-full" />;
  }

  // Linked items missing from the catalog stay visible so they can be removed.
  const rows: CatalogRow[] = [
    ...(catalog ?? []).map((item) => ({ ...item, inCatalog: true })),
    ...[...linkedByNumber.values()].flatMap((product) =>
      product.link &&
      !(catalog ?? []).some(
        (item) => item.productNumber === product.link?.productNumber,
      )
        ? [
            {
              productNumber: product.link.productNumber,
              name: product.link.productName,
              category: "",
              pictureUrl: null,
              price: null,
              unitAmount: null,
              inCatalog: false,
            },
          ]
        : [],
    ),
  ];
  const missingCount = rows.filter(
    (row) => !linkedByNumber.has(row.productNumber),
  ).length;
  const filtered = searchProducts(
    rows.filter(
      (row) => filter !== "missing" || !linkedByNumber.has(row.productNumber),
    ),
    search,
    (row) => ({
      name: `${row.productNumber} ${row.name}`,
      categoryPath: row.category,
    }),
  );

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col sm:grid">
        <CardTitle>Produktkoblinger</CardTitle>
        <CardDescription>
          Vælg det Produkt, hvert GS Supply-produkt svarer til, og den enhed én
          pakke fra GS Supply svarer til.
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={reload}>
            <RefreshCwIcon data-icon="inline-start" />
            Opdatér katalog
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent appearance="stacked" className="flex flex-col">
        {catalog === null ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>GS Supply-kataloget kunne ikke hentes</AlertTitle>
            <AlertDescription>
              Kontrollér linket til katalog-API&apos;et, og vælg Opdatér
              katalog.
            </AlertDescription>
          </Alert>
        ) : null}
        {options.limitReached ? (
          <Alert>
            <CircleAlertIcon />
            <AlertTitle>Kun de første 500 Produkter kan vælges</AlertTitle>
            <AlertDescription>
              Arkivér ubrugte Produkter for at få hele listen med.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <ToggleGroup
            variant="outline"
            value={[filter]}
            onValueChange={(values) => {
              if (values[0]) setFilter(values[0]);
            }}
            aria-label="Status for GS Supply-produktkoblinger"
          >
            <ToggleGroupItem value="all" className="min-h-11">
              Alle
            </ToggleGroupItem>
            <ToggleGroupItem value="missing" className="min-h-11">
              Ikke koblet ({missingCount})
            </ToggleGroupItem>
          </ToggleGroup>
          <InputGroup className="h-11 w-full sm:max-w-80">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Søg GS Supply-produkter"
              aria-label="Søg GS Supply-produkter"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </InputGroup>
        </div>
        {filtered.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Ingen GS Supply-produkter at vise</EmptyTitle>
              <EmptyDescription>
                Prøv en anden søgning, eller vis alle produktkoblinger.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader className="hidden sm:table-header-group">
              <TableRow>
                <TableHead>GS Supply-produkt</TableHead>
                <TableHead className="w-1/2">Produkt og enhed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow
                  key={row.productNumber}
                  className="flex flex-col sm:table-row"
                >
                  <TableCell className="whitespace-normal">
                    <CatalogItem row={row} />
                  </TableCell>
                  <TableCell>
                    <CatalogLinkEditor
                      row={row}
                      linked={linkedByNumber.get(row.productNumber) ?? null}
                      products={options.products}
                      productOptions={productOptions}
                      canAddUnit={canAddUnit}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function CatalogItem({ row }: { row: CatalogRow }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-12">
        <AvatarImage src={row.pictureUrl ?? undefined} alt="" />
        <AvatarFallback>
          <PackageOpenIcon className="size-5" />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="font-medium">{row.name}</div>
        <div className="text-sm text-muted-foreground">
          {row.inCatalog
            ? `${row.productNumber} · ${priceFormatter.format(row.price ?? 0)} kr. · ${numberFormatter.format(row.unitAmount ?? 0)} pr. pakke`
            : `${row.productNumber} · Ikke længere i kataloget`}
        </div>
      </div>
    </div>
  );
}

function CatalogLinkEditor({
  row,
  linked,
  products,
  productOptions,
  canAddUnit,
}: {
  row: CatalogRow;
  linked: EngineProduct | null;
  products: EngineProduct[];
  productOptions: ComboboxOption[];
  canAddUnit: boolean;
}) {
  const setCatalogLink = useMutation(
    api.integrations.gssupply.api.setCatalogLink,
  );
  const [saving, setSaving] = useState(false);
  // A chosen product waits here until its unit is chosen.
  const [pendingId, setPendingId] = useState<Id<"products"> | null>(null);
  const [addingUnit, setAddingUnit] = useState(false);
  const selected =
    products.find((product) => product.id === (pendingId ?? linked?.id)) ??
    null;
  const suggestions = useMemo(
    () =>
      linked || pendingId
        ? []
        : searchProducts(products, row.name, (product) => ({
            name: product.name,
          })).slice(0, 3),
    [linked, pendingId, products, row.name],
  );

  async function save(
    target: { productId: Id<"products">; unitId: Id<"units"> } | null,
  ) {
    setSaving(true);
    try {
      await setCatalogLink({
        productNumber: row.productNumber,
        productName: row.name,
        target,
      });
      setPendingId(null);
      toast.success(
        target
          ? "GS Supply-koblingen er gemt"
          : "GS Supply-koblingen er fjernet",
      );
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "GS Supply-koblingen kunne ikke gemmes. Prøv igen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  function chooseProduct(value: string | null) {
    if (value === null) {
      setPendingId(null);
      if (linked) void save(null);
      return;
    }
    const product = products.find((item) => item.id === value);
    if (!product) return;
    const unitId =
      product.id === linked?.id
        ? linked.link?.unitId
        : product.units.length === 1 && row.unitAmount === 1
          ? product.units[0]!.id
          : undefined;
    if (unitId) void save({ productId: product.id, unitId });
    else setPendingId(product.id);
  }

  // Products linked to another catalog item can't be chosen until that link is removed.
  // productOptions is built from products in the same order.
  const options = productOptions.map((option, index) => {
    const number = products[index]?.link?.productNumber;
    return number && number !== row.productNumber
      ? {
          ...option,
          label: `${option.label} (koblet til ${number})`,
          disabled: true,
        }
      : option;
  });
  const unitItems = [
    ...(selected?.units ?? []).map((unit) => ({
      value: unit.id as string,
      label: unit.name,
    })),
    ...(canAddUnit ? [{ value: NEW_UNIT, label: "Tilføj enhed…" }] : []),
  ];

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <div className="min-w-0 flex-1">
        <CreatableCombobox
          productSearch
          options={options}
          suggestionLabel="Forslag ud fra navnet"
          suggestionOptions={suggestions.map((product) => ({
            value: product.id,
            label: product.name,
          }))}
          value={selected?.id ?? null}
          onValueChange={chooseProduct}
          placeholder="Søg efter Produkt"
          ariaLabel={`Produkt for GS Supply-varenummer ${row.productNumber}`}
          disabled={saving}
        />
      </div>
      <div className="sm:w-44">
        <Select
          items={unitItems}
          value={pendingId ? null : (linked?.link?.unitId ?? null)}
          onValueChange={(value) => {
            if (!value || !selected) return;
            if (value === NEW_UNIT) setAddingUnit(true);
            else
              void save({
                productId: selected.id,
                unitId: value as Id<"units">,
              });
          }}
          disabled={saving || !selected}
        >
          <SelectTrigger
            className="h-11 w-full"
            aria-label={`Enhed for én pakke af ${row.productNumber}`}
            aria-invalid={pendingId !== null}
          >
            <SelectValue placeholder="Vælg enhed" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {unitItems.map((unit) => (
                <SelectItem key={unit.value} value={unit.value}>
                  {unit.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {pendingId ? (
          <FieldDescription>Vælg enheden for én pakke.</FieldDescription>
        ) : null}
      </div>
      {selected && addingUnit ? (
        <AddUnitDialog
          product={selected}
          unitAmount={row.unitAmount}
          onClose={() => setAddingUnit(false)}
          onAdded={(unitId) => {
            setAddingUnit(false);
            void save({ productId: selected.id, unitId });
          }}
        />
      ) : null}
    </div>
  );
}

function AddUnitDialog({
  product,
  unitAmount,
  onClose,
  onAdded,
}: {
  product: EngineProduct;
  unitAmount: number | null;
  onClose: () => void;
  onAdded: (unitId: Id<"units">) => void;
}) {
  const units = useQuery(api.catalog.listUnits);
  const addProductUnit = useMutation(api.catalog.addProductUnit);
  const [unitValue, setUnitValue] = useState<string | null>(null);
  const [factor, setFactor] = useState(
    unitAmount && unitAmount > 1 ? String(unitAmount) : "",
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const defaultUnit = product.units.find((unit) => unit.factorToDefault === 1);
  const productUnitIds = new Set(product.units.map((unit) => unit.id));
  const unitOptions = (units ?? [])
    .filter((unit) => !productUnitIds.has(unit.id))
    .map((unit) => ({ value: `existing:${unit.id}`, label: unit.name }));
  const factorValue = Number(factor.trim().replace(",", "."));
  const validFactor = Number.isFinite(factorValue) && factorValue > 0;

  async function add() {
    if (!unitValue || !validFactor) return;
    setSaving(true);
    setError("");
    try {
      const unitId = await addProductUnit({
        productId: product.id,
        unit: unitValue.startsWith("new:")
          ? { name: unitValue.slice(4) }
          : { unitId: unitValue.slice("existing:".length) as Id<"units"> },
        factorToDefault: factorValue,
      });
      toast.success(`Enheden er tilføjet til ${product.name}`);
      onAdded(unitId);
    } catch (caught) {
      setError(
        getUserErrorMessage(caught, "Enheden kunne ikke tilføjes. Prøv igen."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent>
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <DialogHeader>
            <DialogTitle>Tilføj enhed til {product.name}</DialogTitle>
            <DialogDescription>
              Enheden tilføjes til Produktet og bruges som én pakke fra GS
              Supply.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>Enhed</FieldLabel>
              {units === undefined ? (
                <Skeleton className="h-11 w-full" />
              ) : (
                <CreatableCombobox
                  allowCreate
                  options={unitOptions}
                  value={unitValue}
                  onValueChange={setUnitValue}
                  placeholder="Vælg eller opret enhed"
                  ariaLabel="Enhed"
                  disabled={saving}
                />
              )}
            </Field>
            <Field data-invalid={factor.trim() !== "" && !validFactor}>
              <FieldLabel htmlFor="gs-supply-unit-factor">
                Antal {defaultUnit?.name ?? "standardenheder"} pr. enhed
              </FieldLabel>
              <Input
                id="gs-supply-unit-factor"
                inputMode="decimal"
                className="h-11"
                value={factor}
                disabled={saving}
                aria-invalid={factor.trim() !== "" && !validFactor}
                onChange={(event) => setFactor(event.target.value)}
              />
              {unitAmount && unitAmount > 1 ? (
                <FieldDescription>
                  GS Supply angiver {numberFormatter.format(unitAmount)} pr.
                  pakke.
                </FieldDescription>
              ) : null}
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={saving}
              onClick={onClose}
            >
              Annullér
            </Button>
            <Button
              type="submit"
              size="lg"
              disabled={saving || !unitValue || !validFactor}
            >
              {saving ? <Spinner data-icon="inline-start" /> : null}
              Tilføj enhed
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
