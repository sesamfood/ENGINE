"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  CheckIcon,
  LinkIcon,
  ListPlusIcon,
  PackageOpenIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { usePermission } from "@/components/app-shell";
import { CreatableCombobox } from "@/components/catalog/creatable-combobox";
import { RowsSkeleton } from "@/components/page-skeletons";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useCompleteCatalog } from "@/hooks/use-complete-catalog";
import {
  OnlinePosProductSelect,
  useOnlinePosProductOptions,
} from "@/integrations/onlinepos/client";
import { useIntegrations } from "@/integrations/use-integrations";
import { parseDecimal } from "@/lib/containers";
import { searchProducts } from "@/lib/product-search";
import { getUserErrorMessage } from "@/lib/user-errors";

type Overview = FunctionReturnType<typeof api.catalogModifiers.getOverview>;
type SoldProduct = Overview["products"][number];
type CatalogItem = NonNullable<
  ReturnType<
    typeof useCompleteCatalog<typeof api.catalog.listActiveProductsPage>
  >
>[number];
type OnlinePosProducts = FunctionReturnType<typeof api.onlinePos.listProducts>;
type Amount = { quantity: string; unitId: Id<"units"> | null };
type AdditionDraft = { enabled: boolean; amount: Amount | null };

const ALL_CATEGORIES = "__all__";
const MAX_SELECTION = 200;

function formatAmount(
  quantity: number,
  unitId: Id<"units">,
  catalogById: ReadonlyMap<Id<"products">, CatalogItem>,
  productId: Id<"products">,
) {
  const unit = catalogById
    .get(productId)
    ?.units.find((item) => item.id === unitId);
  return `${quantity.toLocaleString("da-DK")} ${unit?.name ?? ""}`.trim();
}

function ProductImage({ product }: { product: SoldProduct }) {
  return product.imageUrl ? (
    <div className="relative aspect-4/3 w-full overflow-hidden bg-muted">
      <Image
        src={product.imageUrl}
        alt={`Produktbillede af ${product.name}`}
        fill
        sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 20vw"
        className="object-cover"
      />
    </div>
  ) : (
    <div className="flex aspect-4/3 w-full items-center justify-center bg-muted text-muted-foreground">
      <PackageOpenIcon className="size-12" aria-hidden="true" />
    </div>
  );
}

function AmountInput({
  amount,
  units,
  label,
  onChange,
}: {
  amount: Amount;
  units: Array<{ id: Id<"units">; name: string }>;
  label: string;
  onChange: (amount: Amount) => void;
}) {
  return (
    <div className="flex gap-2">
      <Input
        inputMode="decimal"
        value={amount.quantity}
        onChange={(event) =>
          onChange({ ...amount, quantity: event.target.value })
        }
        aria-label={`Mængde for ${label}`}
        className="h-11 w-24"
      />
      <Select
        items={units.map((unit) => ({ value: unit.id, label: unit.name }))}
        value={amount.unitId}
        onValueChange={(value) =>
          onChange({ ...amount, unitId: value as Id<"units"> | null })
        }
      >
        <SelectTrigger
          aria-label={`Enhed for ${label}`}
          className="h-11! flex-1"
        >
          <SelectValue placeholder="Enhed" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {units.map((unit) => (
              <SelectItem key={unit.id} value={unit.id}>
                {unit.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function parseAmount(amount: Amount) {
  const quantity = parseDecimal(amount.quantity);
  return Number.isFinite(quantity) && quantity > 0 && amount.unitId
    ? { quantity, unitId: amount.unitId }
    : null;
}

export function ModifierManager() {
  const overview = useQuery(api.catalogModifiers.getOverview);
  const catalog = useCompleteCatalog(api.catalog.listActiveProductsPage, {});
  const categories = useQuery(api.catalog.listCategoryOptions);
  const integrations = useIntegrations();
  const canManagePos =
    usePermission("integrations.manage") && integrations?.onlinepos === true;
  const posSettings = useQuery(
    api.onlinePos.getModifierMappings,
    canManagePos ? {} : "skip",
  );
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>(ALL_CATEGORIES);
  const [selectedIds, setSelectedIds] = useState<Id<"products">[]>([]);
  const [editing, setEditing] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [posOpen, setPosOpen] = useState(false);

  const catalogById = useMemo(
    () => new Map((catalog ?? []).map((item) => [item.id, item])),
    [catalog],
  );
  const name = (productId: Id<"products">) =>
    catalogById.get(productId)?.name ?? "Ukendt produkt";

  const categoryPaths = useMemo(
    () => new Map(categories?.map((category) => [category.id, category.path])),
    [categories],
  );
  const usedCategories = useMemo(() => {
    const used = new Set(overview?.products.flatMap((p) => p.categoryIds));
    return (categories ?? [])
      .filter((category) => used.has(category.id))
      .sort((a, b) => a.path.localeCompare(b.path, "da"));
  }, [categories, overview]);

  const shown = useMemo(() => {
    const products = (overview?.products ?? []).filter(
      (product) =>
        categoryId === ALL_CATEGORIES ||
        product.categoryIds.includes(categoryId as Id<"categories">),
    );
    return search.trim()
      ? searchProducts(products, search, (product) => ({
          name: product.name,
          categoryPath: product.categoryIds
            .map((id) => categoryPaths.get(id) ?? "")
            .join(" · "),
        }))
      : products;
  }, [categoryId, categoryPaths, overview, search]);

  const selected = new Set(selectedIds);
  const selectedProducts = (overview?.products ?? []).filter((product) =>
    selected.has(product.id),
  );
  const allShownSelected =
    shown.length > 0 && shown.every((product) => selected.has(product.id));

  function toggle(productId: Id<"products">) {
    setSelectedIds((current) => {
      if (current.includes(productId)) {
        return current.filter((id) => id !== productId);
      }
      if (current.length >= MAX_SELECTION) {
        toast.error(`Du kan højst vælge ${MAX_SELECTION} produkter ad gangen`);
        return current;
      }
      return [...current, productId];
    });
  }

  function toggleShown() {
    if (allShownSelected) {
      const shownIds = new Set(shown.map((product) => product.id));
      setSelectedIds((current) => current.filter((id) => !shownIds.has(id)));
      return;
    }
    setSelectedIds((current) => {
      const next = [
        ...new Set([...current, ...shown.map((product) => product.id)]),
      ];
      if (next.length > MAX_SELECTION) {
        toast.error(`Du kan højst vælge ${MAX_SELECTION} produkter ad gangen`);
        return current;
      }
      return next;
    });
  }

  const loading = overview === undefined || catalog === undefined;

  return (
    <div className="flex flex-col gap-7">
      <div className="z-30 -mx-4 bg-background px-4 py-3 max-sm:static sm:sticky sm:top-16 md:top-18 md:py-4">
        <div className="flex flex-wrap items-center gap-3">
          <InputGroup className="h-11 w-full sm:min-w-48 sm:flex-1">
            <InputGroupAddon>
              <SearchIcon />
              <span className="sr-only">Søg</span>
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Søg efter produkter"
              aria-label="Søg efter produkter"
            />
          </InputGroup>
          <Select
            items={[
              { value: ALL_CATEGORIES, label: "Alle kategorier" },
              ...usedCategories.map((category) => ({
                value: category.id,
                label: category.path,
              })),
            ]}
            value={categoryId}
            onValueChange={(value) => setCategoryId(value ?? ALL_CATEGORIES)}
          >
            <SelectTrigger
              aria-label="Kategori"
              className="h-11! w-full shrink-0 sm:w-auto"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={ALL_CATEGORIES}>Alle kategorier</SelectItem>
                {usedCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.path}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            appearance="compact"
            className="min-h-11"
            disabled={shown.length === 0}
            onClick={toggleShown}
          >
            {allShownSelected ? "Fravælg viste" : "Vælg viste"}
          </Button>
          <Button
            type="button"
            variant="outline"
            appearance="compact"
            className="min-h-11"
            onClick={() => setLibraryOpen(true)}
          >
            <ListPlusIcon data-icon="inline-start" />
            Standardtilvalg
          </Button>
          {canManagePos && posSettings?.enabled ? (
            <Button
              type="button"
              variant="outline"
              appearance="compact"
              className="min-h-11"
              onClick={() => setPosOpen(true)}
            >
              <LinkIcon data-icon="inline-start" />
              OnlinePOS-koblinger
            </Button>
          ) : null}
          <Button
            type="button"
            size="lg"
            appearance="standard"
            className="min-h-11"
            disabled={selectedIds.length === 0}
            onClick={() => setEditing(true)}
          >
            <PencilIcon data-icon="inline-start" />
            {selectedIds.length === 0
              ? "Vælg produkter"
              : `Redigér ${selectedIds.length} valgte`}
          </Button>
        </div>
      </div>

      {loading ? <RowsSkeleton rows={6} rowClassName="h-20" /> : null}

      {!loading && overview.limitReached ? (
        <p className="text-sm text-muted-foreground">
          Der vises kun de første 500 produkter med salgspris.
        </p>
      ) : null}

      {!loading && shown.length === 0 ? (
        <Empty appearance="outlined" className="min-h-80">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageOpenIcon />
            </EmptyMedia>
            <EmptyTitle>Ingen produkter fundet</EmptyTitle>
            <EmptyDescription>
              {overview.products.length === 0
                ? "Produkter med en salgspris vises her."
                : "Prøv en anden søgning eller kategori."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {!loading && shown.length > 0 ? (
        <div className="grid gap-5 min-[380px]:grid-cols-2 min-[640px]:grid-cols-3 min-[1024px]:grid-cols-4 min-[1200px]:grid-cols-5 min-[1600px]:grid-cols-6">
          {shown.map((product) => {
            const isSelected = selected.has(product.id);
            const removable = product.ingredients.filter(
              (row) => row.removable,
            );
            return (
              <Card key={product.id} appearance="catalog" className="relative">
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`Vælg ${product.name}`}
                  className="absolute inset-0 z-10 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"
                  onClick={() => toggle(product.id)}
                />
                <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-md bg-background/90 p-1 shadow-sm">
                  <Checkbox
                    checked={isSelected}
                    tabIndex={-1}
                    aria-hidden="true"
                    className="pointer-events-none"
                  />
                </div>
                <ProductImage product={product} />
                <CardHeader appearance="padded">
                  <CardTitle appearance="productName">{product.name}</CardTitle>
                  <CardDescription>
                    {product.categoryIds
                      .map((id) => categoryPaths.get(id))
                      .filter(Boolean)
                      .join(" · ") || "Uden kategori"}
                  </CardDescription>
                </CardHeader>
                <CardFooter appearance="product" className="mt-auto">
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant={removable.length > 0 ? "secondary" : "outline"}
                    >
                      {removable.length} fravalg
                    </Badge>
                    <Badge
                      variant={
                        product.additions.length > 0 ? "secondary" : "outline"
                      }
                    >
                      {product.additions.length} tilvalg
                    </Badge>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : null}

      {overview && catalog ? (
        <>
          <ModifierSheet
            open={editing}
            onOpenChange={setEditing}
            products={selectedProducts}
            defaults={overview.defaults}
            catalogById={catalogById}
            name={name}
            onSaved={() => {
              setEditing(false);
              setSelectedIds([]);
            }}
          />
          <LibraryDialog
            open={libraryOpen}
            onOpenChange={setLibraryOpen}
            overview={overview}
            catalog={catalog}
            catalogById={catalogById}
            name={name}
          />
          {canManagePos && posSettings?.enabled ? (
            <PosMappingDialog
              open={posOpen}
              onOpenChange={setPosOpen}
              overview={overview}
              name={name}
              posSettings={posSettings}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ModifierSheet({
  open,
  onOpenChange,
  products,
  defaults,
  catalogById,
  name,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: SoldProduct[];
  defaults: Overview["defaults"];
  catalogById: ReadonlyMap<Id<"products">, CatalogItem>;
  name: (productId: Id<"products">) => string;
  onSaved: () => void;
}) {
  const save = useMutation(api.catalogModifiers.saveProductModifiers);
  const [removals, setRemovals] = useState(new Map<Id<"products">, boolean>());
  const [additions, setAdditions] = useState(
    new Map<Id<"products">, AdditionDraft>(),
  );
  const [extraIds, setExtraIds] = useState<Id<"products">[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setRemovals(new Map());
      setAdditions(new Map());
      setExtraIds([]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const defaultsById = new Map(
    defaults.map((row) => [row.ingredientProductId, row]),
  );

  // Ingredients that appear in at least one selected recipe.
  const removalRows = [
    ...new Set(
      products.flatMap((product) =>
        product.ingredients.map((row) => row.ingredientProductId),
      ),
    ),
  ]
    .map((ingredientProductId) => {
      const rows = products.flatMap((product) =>
        product.ingredients.filter(
          (row) => row.ingredientProductId === ingredientProductId,
        ),
      );
      return {
        ingredientProductId,
        inProducts: rows.length,
        removableCount: rows.filter((row) => row.removable).length,
      };
    })
    .sort((a, b) =>
      name(a.ingredientProductId).localeCompare(
        name(b.ingredientProductId),
        "da",
      ),
    );

  const additionIds = new Set([
    ...removalRows.map((row) => row.ingredientProductId),
    ...defaults.map((row) => row.ingredientProductId),
    ...products.flatMap((product) =>
      product.additions.map((row) => row.ingredientProductId),
    ),
    ...extraIds,
  ]);
  const productIds = new Set(products.map((product) => product.id));
  const extraOptions = [...catalogById.values()]
    .filter((item) => !additionIds.has(item.id) && !productIds.has(item.id))
    .map((item) => ({ value: item.id, label: item.name, searchName: item.name }));

  // Without a standard amount, start from the existing or recipe amount.
  function startAmount(
    ingredientProductId: Id<"products">,
    first?: { quantity?: number; unitId?: Id<"units"> },
  ): Amount | null {
    if (defaultsById.has(ingredientProductId)) return null;
    const source =
      first?.quantity !== undefined && first.unitId
        ? first
        : products
            .flatMap((product) => product.ingredients)
            .find((row) => row.ingredientProductId === ingredientProductId);
    return source?.quantity !== undefined && source.unitId
      ? {
          quantity: source.quantity.toLocaleString("da-DK"),
          unitId: source.unitId,
        }
      : {
          quantity: "",
          unitId: catalogById.get(ingredientProductId)?.defaultUnitId ?? null,
        };
  }

  const additionRows = [...additionIds]
    .map((ingredientProductId) => {
      const rows = products.flatMap((product) =>
        product.additions.filter(
          (row) => row.ingredientProductId === ingredientProductId,
        ),
      );
      const amounts = new Set(
        rows.map((row) =>
          row.quantity === undefined
            ? "standard"
            : `${row.quantity}:${row.unitId}`,
        ),
      );
      return {
        ingredientProductId,
        enabledCount: rows.length,
        first: rows[0],
        mixedAmounts: amounts.size > 1,
      };
    })
    .sort((a, b) =>
      name(a.ingredientProductId).localeCompare(
        name(b.ingredientProductId),
        "da",
      ),
    );

  const changes = removals.size + additions.size;

  async function submit() {
    const additionChanges = [];
    for (const [ingredientProductId, draft] of additions) {
      if (!draft.enabled || draft.amount === null) {
        additionChanges.push({ ingredientProductId, enabled: draft.enabled });
        continue;
      }
      const amount = parseAmount(draft.amount);
      if (!amount) {
        toast.error(
          `Indtast en gyldig mængde og enhed for ${name(ingredientProductId)}`,
        );
        return;
      }
      additionChanges.push({ ingredientProductId, enabled: true, ...amount });
    }
    setSaving(true);
    try {
      await save({
        productIds: products.map((product) => product.id),
        removals: [...removals].map(([ingredientProductId, removable]) => ({
          ingredientProductId,
          removable,
        })),
        additions: additionChanges,
      });
      toast.success(
        `Tilvalg og fravalg er gemt for ${products.length} produkter`,
      );
      onSaved();
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Tilvalg og fravalg kunne ikke gemmes. Prøv igen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  const title =
    products.length === 1 ? products[0].name : `${products.length} produkter`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full! overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {products.length === 1
              ? "Vælg, hvad kunden kan fjerne eller tilføje."
              : products
                  .slice(0, 4)
                  .map((product) => product.name)
                  .join(", ") +
                (products.length > 4 ? ` og ${products.length - 4} flere` : "")}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-8 px-4">
          <FieldSet>
            <FieldLegend>Kan fjernes</FieldLegend>
            {removalRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                De valgte produkter har ingen ingredienser.
              </p>
            ) : (
              <div className="flex flex-col divide-y rounded-lg border">
                {removalRows.map((row) => {
                  const draft = removals.get(row.ingredientProductId);
                  const checked =
                    draft ?? row.removableCount === row.inProducts;
                  const mixed =
                    draft === undefined &&
                    row.removableCount > 0 &&
                    row.removableCount < row.inProducts;
                  return (
                    <label
                      key={row.ingredientProductId}
                      className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) =>
                          setRemovals((current) =>
                            new Map(current).set(row.ingredientProductId, next),
                          )
                        }
                      />
                      <span className="flex-1">
                        {name(row.ingredientProductId)}
                      </span>
                      {mixed ? (
                        <Badge variant="outline">
                          {row.removableCount} af {row.inProducts}
                        </Badge>
                      ) : null}
                      {row.inProducts < products.length ? (
                        <span className="text-xs text-muted-foreground">
                          I {row.inProducts} af {products.length}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            )}
          </FieldSet>

          <FieldSet>
            <FieldLegend>Kan tilføjes</FieldLegend>
            {additionRows.length === 0 ? null : (
              <div className="flex flex-col divide-y rounded-lg border">
                {additionRows.map((row) => {
                  const draft = additions.get(row.ingredientProductId);
                  const standard = defaultsById.get(row.ingredientProductId);
                  const checked =
                    draft?.enabled ?? row.enabledCount === products.length;
                  const mixed =
                    draft === undefined &&
                    row.enabledCount > 0 &&
                    row.enabledCount < products.length;
                  const units =
                    catalogById.get(row.ingredientProductId)?.units ?? [];
                  const amount = draft?.amount ?? null;
                  const currentLabel = row.mixedAmounts
                    ? "Forskellige mængder"
                    : row.first?.quantity !== undefined && row.first.unitId
                      ? formatAmount(
                          row.first.quantity,
                          row.first.unitId,
                          catalogById,
                          row.ingredientProductId,
                        )
                      : standard
                        ? `Standard (${formatAmount(standard.quantity, standard.unitId, catalogById, row.ingredientProductId)})`
                        : "Mangler mængde";
                  return (
                    <div
                      key={row.ingredientProductId}
                      className="flex flex-col gap-2 px-3 py-2"
                    >
                      <label className="flex min-h-11 cursor-pointer items-center gap-3">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) =>
                            setAdditions((current) =>
                              new Map(current).set(row.ingredientProductId, {
                                enabled: next,
                                amount: next
                                  ? (draft?.amount ??
                                    startAmount(
                                      row.ingredientProductId,
                                      row.first,
                                    ))
                                  : null,
                              }),
                            )
                          }
                        />
                        <span className="flex-1">
                          {name(row.ingredientProductId)}
                        </span>
                        {mixed ? (
                          <Badge variant="outline">
                            {row.enabledCount} af {products.length}
                          </Badge>
                        ) : null}
                      </label>
                      {checked ? (
                        amount ? (
                          <div className="flex items-center gap-2 pl-7">
                            <div className="flex-1">
                              <AmountInput
                                amount={amount}
                                units={units}
                                label={name(row.ingredientProductId)}
                                onChange={(next) =>
                                  setAdditions((current) =>
                                    new Map(current).set(
                                      row.ingredientProductId,
                                      {
                                        enabled: true,
                                        amount: next,
                                      },
                                    ),
                                  )
                                }
                              />
                            </div>
                            {standard ? (
                              <Button
                                type="button"
                                variant="ghost"
                                className="min-h-11"
                                onClick={() =>
                                  setAdditions((current) =>
                                    new Map(current).set(
                                      row.ingredientProductId,
                                      {
                                        enabled: true,
                                        amount: null,
                                      },
                                    ),
                                  )
                                }
                              >
                                Standard
                              </Button>
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2 pl-7 text-sm text-muted-foreground">
                            <span>
                              {draft && standard
                                ? `Standard (${formatAmount(standard.quantity, standard.unitId, catalogById, row.ingredientProductId)})`
                                : currentLabel}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              className="min-h-11"
                              onClick={() =>
                                setAdditions((current) =>
                                  new Map(current).set(
                                    row.ingredientProductId,
                                    {
                                      enabled: true,
                                      amount: {
                                        quantity:
                                          (
                                            row.first?.quantity ??
                                            standard?.quantity
                                          )?.toLocaleString("da-DK") ?? "",
                                        unitId:
                                          row.first?.unitId ??
                                          standard?.unitId ??
                                          null,
                                      },
                                    },
                                  ),
                                )
                              }
                            >
                              Ændr mængde
                            </Button>
                          </div>
                        )
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
            <CreatableCombobox
              key={extraIds.length}
              options={extraOptions}
              value={null}
              onValueChange={(value) => {
                if (!value) return;
                const id = value as Id<"products">;
                setExtraIds((current) => [...current, id]);
                setAdditions((current) =>
                  new Map(current).set(id, {
                    enabled: true,
                    amount: startAmount(id),
                  }),
                );
              }}
              placeholder="Tilføj andet produkt"
              ariaLabel="Tilføj andet produkt"
              productSearch
            />
          </FieldSet>
        </div>

        <SheetFooter className="flex-row justify-end">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annullér
          </Button>
          <Button
            type="button"
            className="min-h-11"
            onClick={() => void submit()}
            disabled={saving || changes === 0}
          >
            {saving ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <CheckIcon data-icon="inline-start" />
            )}
            {products.length === 1
              ? "Gem"
              : `Gem for ${products.length} produkter`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function LibraryDialog({
  open,
  onOpenChange,
  overview,
  catalog,
  catalogById,
  name,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  overview: Overview;
  catalog: CatalogItem[];
  catalogById: ReadonlyMap<Id<"products">, CatalogItem>;
  name: (productId: Id<"products">) => string;
}) {
  const saveDefault = useMutation(api.catalogModifiers.saveAdditionDefault);
  const deleteDefault = useMutation(api.catalogModifiers.deleteAdditionDefault);
  const [newIngredient, setNewIngredient] = useState<Id<"products"> | null>(
    null,
  );
  const [newAmount, setNewAmount] = useState<Amount>({
    quantity: "",
    unitId: null,
  });
  const [drafts, setDrafts] = useState(new Map<Id<"products">, Amount>());
  const [pendingDelete, setPendingDelete] = useState<Id<"products"> | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  async function storeDefault(
    ingredientProductId: Id<"products">,
    draft: Amount,
  ) {
    const amount = parseAmount(draft);
    if (!amount) {
      toast.error("Indtast en gyldig mængde og enhed");
      return false;
    }
    setBusy(true);
    try {
      await saveDefault({ ingredientProductId, ...amount });
      toast.success(`${name(ingredientProductId)} er gemt`);
      return true;
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Tilvalget kunne ikke gemmes. Prøv igen."),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await deleteDefault({ ingredientProductId: pendingDelete });
      toast.success(`${name(pendingDelete)} er fjernet`);
      setPendingDelete(null);
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Tilvalget kunne ikke fjernes. Prøv igen."),
      );
    } finally {
      setBusy(false);
    }
  }

  const defaultIds = new Set(
    overview.defaults.map((row) => row.ingredientProductId),
  );
  const ingredientOptions = catalog
    .filter((item) => !defaultIds.has(item.id))
    .map((item) => ({
      value: item.id,
      label: item.name,
      searchName: item.name,
    }));
  const usage = (id: Id<"products">) =>
    overview.products.filter((product) =>
      product.additions.some((row) => row.ingredientProductId === id),
    ).length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-(--spacing-viewport-inset) overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Standardtilvalg</DialogTitle>
            <DialogDescription>
              Opsæt hvert tilvalg én gang. Produkterne bruger standardmængden,
              medmindre du ændrer den på produktet.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            {overview.defaults.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Der er endnu ingen standardtilvalg.
              </p>
            ) : null}
            {overview.defaults.map((row) => {
              const id = row.ingredientProductId;
              const draft = drafts.get(id) ?? {
                quantity: row.quantity.toLocaleString("da-DK"),
                unitId: row.unitId,
              };
              const dirty = drafts.has(id);
              const count = usage(id);
              return (
                <div
                  key={id}
                  className="flex flex-col gap-3 rounded-lg border p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-medium">{name(id)}</span>
                    <span className="text-xs text-muted-foreground">
                      {count === 1 ? "1 produkt" : `${count} produkter`}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-lg"
                      className="size-11"
                      aria-label={`Fjern ${name(id)}`}
                      onClick={() => setPendingDelete(id)}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                  <Field>
                      <FieldLabel>Standardmængde</FieldLabel>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <AmountInput
                            amount={draft}
                            units={catalogById.get(id)?.units ?? []}
                            label={name(id)}
                            onChange={(next) =>
                              setDrafts((current) =>
                                new Map(current).set(id, next),
                              )
                            }
                          />
                        </div>
                        {dirty ? (
                          <Button
                            type="button"
                            className="min-h-11"
                            disabled={busy}
                            onClick={async () => {
                              if (await storeDefault(id, draft)) {
                                setDrafts((current) => {
                                  const next = new Map(current);
                                  next.delete(id);
                                  return next;
                                });
                              }
                            }}
                          >
                            Gem
                          </Button>
                        ) : null}
                      </div>
                    </Field>
                </div>
              );
            })}

            <div className="rounded-lg border border-dashed p-3">
              <FieldSet>
                <FieldLegend variant="label">Nyt standardtilvalg</FieldLegend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <CreatableCombobox
                    options={ingredientOptions}
                    value={newIngredient}
                    onValueChange={(value) => {
                      const id = value as Id<"products"> | null;
                      setNewIngredient(id);
                      setNewAmount({
                        quantity: "",
                        unitId: id
                          ? (catalogById.get(id)?.defaultUnitId ?? null)
                          : null,
                      });
                    }}
                    placeholder="Vælg ingrediens"
                    ariaLabel="Ingrediens"
                    productSearch
                  />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <AmountInput
                        amount={newAmount}
                        units={
                          newIngredient
                            ? (catalogById.get(newIngredient)?.units ?? [])
                            : []
                        }
                        label="nyt tilvalg"
                        onChange={setNewAmount}
                      />
                    </div>
                    <Button
                      type="button"
                      className="min-h-11"
                      disabled={busy || newIngredient === null}
                      onClick={async () => {
                        if (
                          newIngredient &&
                          (await storeDefault(newIngredient, newAmount))
                        ) {
                          setNewIngredient(null);
                          setNewAmount({ quantity: "", unitId: null });
                        }
                      }}
                    >
                      <PlusIcon data-icon="inline-start" />
                      Tilføj
                    </Button>
                  </div>
                </div>
              </FieldSet>
            </div>
          </div>

        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Fjern {pendingDelete ? name(pendingDelete) : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tilvalget fjernes også fra{" "}
              {pendingDelete ? usage(pendingDelete) : 0} produkter.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annullér</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              Fjern
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PosMappingDialog({
  open,
  onOpenChange,
  overview,
  name,
  posSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  overview: Overview;
  name: (productId: Id<"products">) => string;
  posSettings: FunctionReturnType<typeof api.onlinePos.getModifierMappings>;
}) {
  const setMapping = useAction(api.onlinePos.setModifierMapping);
  const listPosProducts = useAction(api.onlinePos.listProducts);
  const [posProducts, setPosProducts] = useState<
    OnlinePosProducts | null | undefined
  >(undefined);
  const posOptions = useOnlinePosProductOptions(posProducts);

  useEffect(() => {
    if (!open || posProducts !== undefined) return;
    let active = true;
    void listPosProducts({})
      .then((products) => {
        if (active) setPosProducts(products);
      })
      .catch(() => {
        if (active) setPosProducts(null);
      });
    return () => {
      active = false;
    };
  }, [listPosProducts, open, posProducts]);

  const byName = (ids: Iterable<Id<"products">>) =>
    [...new Set(ids)].sort((a, b) => name(a).localeCompare(name(b), "da"));
  const additions = byName([
    ...overview.defaults.map((row) => row.ingredientProductId),
    ...overview.products.flatMap((product) =>
      product.additions.map((row) => row.ingredientProductId),
    ),
  ]);
  const removals = byName(
    overview.products.flatMap((product) =>
      product.ingredients
        .filter((row) => row.removable)
        .map((row) => row.ingredientProductId),
    ),
  );

  async function changeMapping(
    kind: "removal" | "addition",
    ingredientProductId: Id<"products">,
    onlinePosProductId: number | null,
  ) {
    if (!posSettings.integrationId) return;
    try {
      await setMapping({
        expectedIntegrationId: posSettings.integrationId,
        kind,
        ingredientProductId,
        onlinePosProductId,
      });
      toast.success("OnlinePOS-koblingen er gemt");
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "OnlinePOS-koblingen kunne ikke gemmes. Prøv igen.",
        ),
      );
    }
  }

  const sections = [
    {
      kind: "addition" as const,
      title: "Tilvalg",
      ids: additions,
      empty: "Markér ingredienser som tilvalg på produkterne først.",
      productName: (id: Id<"products">) => `Ekstra ${name(id)}`,
      help: "Mængden, der trækkes fra lageret, er tilvalgets mængde på produktet.",
    },
    {
      kind: "removal" as const,
      title: "Fravalg",
      ids: removals,
      empty: "Markér ingredienser som fravalg på produkterne først.",
      productName: (id: Id<"products">) => `Uden ${name(id)}`,
      help: "Mængden, der lægges tilbage på lageret, kommer fra hvert produkts opskrift.",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-(--spacing-viewport-inset) overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>OnlinePOS-koblinger</DialogTitle>
          <DialogDescription>
            Vælg det OnlinePOS-produkt, der svarer til hvert tilvalg og
            fravalg. Koblingen gælder for alle produkter.
          </DialogDescription>
        </DialogHeader>
        {sections.map((section) => (
          <div key={section.kind} className="flex flex-col gap-3">
            <div className="flex items-center gap-1">
              <h3 className="font-medium">{section.title}</h3>
              <HelpTooltip
                label={`Om ${section.title.toLowerCase()}`}
                content={section.help}
              />
            </div>
            {section.ids.length === 0 ? (
              <p className="text-sm text-muted-foreground">{section.empty}</p>
            ) : (
              section.ids.map((id) => (
                <Field key={id} orientation="responsive">
                  <FieldLabel className="sm:w-48">{name(id)}</FieldLabel>
                  <OnlinePosProductSelect
                    options={posOptions}
                    productName={section.productName(id)}
                    value={
                      posSettings.mappings.find(
                        (row) =>
                          row.kind === section.kind &&
                          row.ingredientProductId === id,
                      )?.onlinePosProductId ?? null
                    }
                    onValueChange={(value) =>
                      void changeMapping(section.kind, id, value)
                    }
                    ariaLabel={`OnlinePOS-produkt for ${section.title.toLowerCase()} af ${name(id)}`}
                    onRetry={() => setPosProducts(undefined)}
                  />
                </Field>
              ))
            )}
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}
