"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  LayoutListIcon,
  ListOrderedIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  WineIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ProductId = Id<"products">;
type ProductMode = "all" | "selected";
type ActiveTab = "products" | "bars";
type CountArea = {
  id: Id<"countAreas">;
  name: string;
  productIds: ProductId[];
};
type ProductDraft = {
  locationId: Id<"locations"> | null;
  mode: ProductMode;
  selectedProductIds: Set<ProductId>;
};

function allProductDraft(locationId: Id<"locations">): ProductDraft {
  return {
    locationId,
    mode: "all",
    selectedProductIds: new Set(),
  };
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

export function LocationCountSetup({
  locationId,
  locationName,
  open,
  onOpenChange,
}: {
  locationId: Id<"locations">;
  locationName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const configuration = useQuery(
    api.locationProducts.getConfiguration,
    open ? { locationId } : "skip",
  );
  const products = useQuery(
    api.catalog.listActiveProductSearchOptions,
    open ? {} : "skip",
  );
  const bars = useQuery(
    api.countAreas.listForManagement,
    open ? { locationId } : "skip",
  );
  const setConfiguration = useMutation(api.locationProducts.setConfiguration);
  const createBar = useMutation(api.countAreas.create);
  const renameBar = useMutation(api.countAreas.rename);
  const removeCountArea = useMutation(api.countAreas.remove);
  const setBarProductOrder = useMutation(api.countAreas.setProductOrder);

  const [activeTab, setActiveTab] = useState<ActiveTab>("products");
  const [search, setSearch] = useState("");
  const [productDraft, setProductDraft] = useState<ProductDraft>(() => ({
    locationId: null,
    mode: "all",
    selectedProductIds: new Set(),
  }));
  const [savingProducts, setSavingProducts] = useState(false);
  const [editingBar, setEditingBar] = useState<CountArea | "new" | null>(null);
  const [barName, setBarName] = useState("");
  const [barError, setBarError] = useState("");
  const [savingBar, setSavingBar] = useState(false);
  const [pendingBarDelete, setPendingBarDelete] = useState<CountArea | null>(
    null,
  );
  const [deletingBar, setDeletingBar] = useState(false);
  const [orderingBar, setOrderingBar] = useState<CountArea | null>(null);
  const [barOrder, setBarOrder] = useState<ProductId[]>([]);
  const [orderError, setOrderError] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);

  const serverProductDraft: ProductDraft | null = configuration
    ? {
        locationId,
        mode: configuration.kind,
        selectedProductIds: new Set(
          configuration.kind === "selected"
            ? configuration.selectedProductIds
            : [],
        ),
      }
    : null;
  const currentProductDraft =
    productDraft.locationId === locationId
      ? productDraft
      : (serverProductDraft ?? {
          ...allProductDraft(locationId),
        });
  const mode = currentProductDraft.mode;
  const selectedProductIds = currentProductDraft.selectedProductIds;

  const ingredientProductIds =
    configuration?.kind === "selected"
      ? configuration.ingredientProductIds
      : [];
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("da");
    if (!products) return [];
    if (!query) return products;
    return products.filter(
      (product) =>
        product.name.toLocaleLowerCase("da").includes(query) ||
        product.categoryPath.toLocaleLowerCase("da").includes(query),
    );
  }, [products, search]);
  const effectiveProductIds = useMemo(() => {
    if (!products || !configuration) return new Set<ProductId>();
    if (configuration.kind === "all") {
      return new Set(products.map((product) => product.id));
    }
    return new Set([
      ...configuration.selectedProductIds,
      ...configuration.ingredientProductIds,
    ]);
  }, [configuration, products]);
  const effectiveProducts = useMemo(
    () =>
      products?.filter((product) => effectiveProductIds.has(product.id)) ?? [],
    [effectiveProductIds, products],
  );
  const isBusy = savingProducts || savingBar || deletingBar || savingOrder;

  function toggleProduct(productId: ProductId, checked: boolean) {
    setProductDraft((current) => {
      const base =
        current.locationId === locationId
          ? current
          : (serverProductDraft ?? {
              ...allProductDraft(locationId),
            });
      const next = new Set(base.selectedProductIds);
      if (checked) next.add(productId);
      else next.delete(productId);
      return { locationId, mode: "selected", selectedProductIds: next };
    });
  }

  async function saveProducts() {
    setSavingProducts(true);
    try {
      const productIds = mode === "selected" ? [...selectedProductIds] : [];
      await setConfiguration({ locationId, productIds });
      if (productIds.length === 0) {
        setProductDraft({
          locationId,
          mode: "all",
          selectedProductIds: new Set(),
        });
        toast.success("Alle aktive Produkter bruges på Count og Waste");
      } else {
        setProductDraft({
          locationId,
          mode: "selected",
          selectedProductIds: new Set(productIds),
        });
        toast.success("Produktvalget er gemt");
      }
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSavingProducts(false);
    }
  }

  function openNewBar() {
    setEditingBar("new");
    setBarName("");
    setBarError("");
  }

  function openRenameBar(bar: CountArea) {
    setEditingBar(bar);
    setBarName(bar.name);
    setBarError("");
  }

  async function saveBar() {
    if (!barName.trim()) {
      setBarError("Indtast et navn til Baren");
      return;
    }
    setSavingBar(true);
    setBarError("");
    try {
      if (editingBar === "new") {
        await createBar({ locationId, name: barName });
        toast.success("Baren er oprettet");
      } else if (editingBar) {
        await renameBar({ countAreaId: editingBar.id, name: barName });
        toast.success("Baren er omdøbt");
      }
      setEditingBar(null);
    } catch (error) {
      setBarError(messageFrom(error));
    } finally {
      setSavingBar(false);
    }
  }

  async function deleteBar() {
    if (!pendingBarDelete) return;
    setDeletingBar(true);
    try {
      await removeCountArea({ countAreaId: pendingBarDelete.id });
      toast.success("Baren er fjernet");
      setPendingBarDelete(null);
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setDeletingBar(false);
    }
  }

  function openBarOrder(bar: CountArea) {
    setOrderingBar(bar);
    setBarOrder([...bar.productIds]);
    setOrderError("");
  }

  function toggleBarProduct(productId: ProductId, checked: boolean) {
    setOrderError("");
    setBarOrder((current) => {
      if (checked) {
        return current.includes(productId) ? current : [...current, productId];
      }
      return current.filter((id) => id !== productId);
    });
  }

  function moveBarProduct(productId: ProductId, direction: -1 | 1) {
    setOrderError("");
    setBarOrder((current) => {
      const index = current.indexOf(productId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  async function saveBarOrder() {
    if (!orderingBar) return;
    setSavingOrder(true);
    setOrderError("");
    try {
      await setBarProductOrder({
        locationId,
        countAreaId: orderingBar.id,
        productIds: barOrder,
      });
      toast.success("Produktordenen for Baren er gemt");
      setOrderingBar(null);
    } catch (error) {
      const message = messageFrom(error);
      setOrderError(message);
      toast.error(message);
    } finally {
      setSavingOrder(false);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!isBusy) onOpenChange(next);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Produkter og Barer</DialogTitle>
            <DialogDescription>
              Vælg de Produkter og Barer, som bruges på {locationName}.
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (value === "products" || value === "bars") {
                setActiveTab(value);
              }
            }}
          >
            <TabsList
              className="grid h-11 w-full grid-cols-2"
              aria-label="Produkter og Barer"
            >
              <TabsTrigger value="products">Produkter</TabsTrigger>
              <TabsTrigger value="bars">Barer</TabsTrigger>
            </TabsList>

            <TabsContent value="products" className="pt-4">
              <FieldGroup>
                <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">Produktvalg</p>
                      <Badge variant="secondary">
                        {mode === "all"
                          ? "Alle aktive"
                          : `${selectedProductIds.size} valgte`}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {mode === "all"
                        ? "Alle aktive Produkter bruges på Count og Waste."
                        : "Kun de valgte Produkter bruges på Count og Waste."}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={mode === "all" ? "secondary" : "outline"}
                    className="min-h-11 shrink-0"
                    disabled={configuration === undefined}
                    onClick={() => {
                      setProductDraft({
                        locationId,
                        mode: "all",
                        selectedProductIds: new Set(),
                      });
                    }}
                  >
                    Brug alle aktive Produkter
                  </Button>
                </div>

                <Field>
                  <FieldLabel
                    htmlFor={`location-products-search-${locationId}`}
                  >
                    Søg efter Produkt
                  </FieldLabel>
                  <InputGroup className="min-h-11">
                    <InputGroupAddon align="inline-start">
                      <SearchIcon />
                    </InputGroupAddon>
                    <InputGroupInput
                      id={`location-products-search-${locationId}`}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Søg efter navn eller kategori"
                      aria-label="Søg efter Produkt eller kategori"
                    />
                  </InputGroup>
                </Field>

                {products === undefined ? (
                  <div className="flex flex-col gap-2 rounded-lg border p-2">
                    {Array.from({ length: 5 }, (_, index) => (
                      <Skeleton key={index} className="h-11 w-full" />
                    ))}
                  </div>
                ) : products.length === 0 ? (
                  <Empty className="min-h-48 border">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <LayoutListIcon />
                      </EmptyMedia>
                      <EmptyTitle>Ingen aktive Produkter</EmptyTitle>
                      <EmptyDescription>
                        Opret eller aktivér et Produkt i Produktkataloget først.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : filteredProducts.length === 0 ? (
                  <Empty className="min-h-40 border">
                    <EmptyHeader>
                      <EmptyTitle>Ingen Produkter fundet</EmptyTitle>
                      <EmptyDescription>
                        Prøv et andet søgeord.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div className="max-h-80 overflow-y-auto rounded-lg border p-2">
                    <FieldGroup className="gap-1">
                      {filteredProducts.map((product) => {
                        const isIngredient = ingredientProductIds.includes(
                          product.id,
                        );
                        const checked =
                          mode === "selected" &&
                          (selectedProductIds.has(product.id) || isIngredient);
                        const inputId = `location-product-${locationId}-${product.id}`;
                        return (
                          <Field
                            key={product.id}
                            orientation="horizontal"
                            data-disabled={isIngredient}
                            className="min-h-11 rounded-md px-2 py-1 hover:bg-muted/50"
                          >
                            <Checkbox
                              id={inputId}
                              checked={checked}
                              disabled={
                                isIngredient || configuration === undefined
                              }
                              aria-label={`Vælg ${product.name}`}
                              onCheckedChange={(next) =>
                                toggleProduct(product.id, next === true)
                              }
                            />
                            <FieldContent className="min-w-0">
                              <FieldLabel
                                htmlFor={inputId}
                                className="min-w-0 font-normal"
                              >
                                <span className="truncate">{product.name}</span>
                                {isIngredient ? (
                                  <Badge variant="outline">Ingrediens</Badge>
                                ) : null}
                              </FieldLabel>
                              <FieldDescription className="truncate">
                                {product.categoryPath}
                              </FieldDescription>
                            </FieldContent>
                          </Field>
                        );
                      })}
                    </FieldGroup>
                  </div>
                )}
              </FieldGroup>
            </TabsContent>

            <TabsContent value="bars" className="pt-4">
              <FieldGroup>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex flex-col gap-1">
                    <h3 className="font-medium">Barer</h3>
                    <p className="text-sm text-muted-foreground">
                      Du kan ændre Produktrækkefølgen her eller på Count-siden,
                      når du har valgt Baren.
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="min-h-11 shrink-0"
                    onClick={openNewBar}
                  >
                    <PlusIcon data-icon="inline-start" />
                    Ny Bar
                  </Button>
                </div>

                {bars === undefined ? (
                  <div className="flex flex-col gap-2">
                    {Array.from({ length: 3 }, (_, index) => (
                      <Skeleton key={index} className="h-14 w-full" />
                    ))}
                  </div>
                ) : bars.length === 0 ? (
                  <Empty className="min-h-52 border">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <WineIcon />
                      </EmptyMedia>
                      <EmptyTitle>Ingen Barer endnu</EmptyTitle>
                      <EmptyDescription>
                        Opret en Bar, før du starter en Count på lokationen.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button
                        type="button"
                        className="min-h-11"
                        onClick={openNewBar}
                      >
                        <PlusIcon data-icon="inline-start" />
                        Ny Bar
                      </Button>
                    </EmptyContent>
                  </Empty>
                ) : (
                  <FieldGroup className="gap-2">
                    {bars.map((bar) => (
                      <div
                        key={bar.id}
                        className="flex min-h-14 items-center justify-between gap-3 rounded-lg border px-3 py-2"
                      >
                        <div className="flex min-w-0 flex-col gap-1">
                          <p className="truncate font-medium">{bar.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {bar.productIds.length === 0
                              ? "Produktorden er ikke sat"
                              : `${bar.productIds.length} Produkter i ordenen`}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-lg"
                                  className="size-11"
                                  aria-label={`Produkter og rækkefølge for ${bar.name}`}
                                  onClick={() => openBarOrder(bar)}
                                />
                              }
                            >
                              <ListOrderedIcon />
                            </TooltipTrigger>
                            <TooltipContent>
                              Produkter og rækkefølge
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-lg"
                                  className="size-11"
                                  aria-label={`Redigér ${bar.name}`}
                                  onClick={() => openRenameBar(bar)}
                                />
                              }
                            >
                              <PencilIcon />
                            </TooltipTrigger>
                            <TooltipContent>Redigér Bar</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-lg"
                                  className="size-11"
                                  aria-label={`Fjern ${bar.name}`}
                                  onClick={() => setPendingBarDelete(bar)}
                                />
                              }
                            >
                              <Trash2Icon />
                            </TooltipTrigger>
                            <TooltipContent>Fjern Bar</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    ))}
                  </FieldGroup>
                )}
              </FieldGroup>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={isBusy}
              onClick={() => onOpenChange(false)}
            >
              Luk
            </Button>
            {activeTab === "products" ? (
              <Button
                type="button"
                className="min-h-11"
                disabled={savingProducts || configuration === undefined}
                onClick={() => void saveProducts()}
              >
                {savingProducts ? <Spinner data-icon="inline-start" /> : null}
                Gem Produktvalg
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(orderingBar)}
        onOpenChange={(next) => {
          if (!next && !savingOrder) setOrderingBar(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Produkter og rækkefølge</DialogTitle>
            <DialogDescription>
              Vælg Produkter til {orderingBar?.name}, og placér dem i den
              rækkefølge, de skal tælles i.
            </DialogDescription>
          </DialogHeader>

          {configuration === undefined || products === undefined ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-11 w-full" />
              ))}
            </div>
          ) : (
            <FieldGroup>
              <FieldSet>
                <FieldLegend variant="label">Produkter i Baren</FieldLegend>
                <FieldDescription>
                  Valgbare Produkter følger lokationens Produktvalg.
                </FieldDescription>
                {effectiveProducts.length === 0 ? (
                  <Empty className="min-h-36 border">
                    <EmptyHeader>
                      <EmptyTitle>Ingen Produkter tilgængelige</EmptyTitle>
                      <EmptyDescription>
                        Vælg aktive Produkter for lokationen først.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <div className="max-h-64 overflow-y-auto rounded-lg border p-2">
                    <FieldGroup className="gap-1">
                      {effectiveProducts.map((product) => {
                        const checked = barOrder.includes(product.id);
                        const inputId = `count-area-product-${orderingBar?.id}-${product.id}`;
                        const isIngredient = ingredientProductIds.includes(
                          product.id,
                        );
                        return (
                          <Field
                            key={product.id}
                            orientation="horizontal"
                            className="min-h-11 rounded-md px-2 py-1 hover:bg-muted/50"
                          >
                            <Checkbox
                              id={inputId}
                              checked={checked}
                              disabled={savingOrder}
                              aria-label={`Vælg ${product.name}`}
                              onCheckedChange={(next) =>
                                toggleBarProduct(product.id, next === true)
                              }
                            />
                            <FieldContent className="min-w-0">
                              <FieldLabel
                                htmlFor={inputId}
                                className="min-w-0 font-normal"
                              >
                                <span className="truncate">{product.name}</span>
                                {isIngredient ? (
                                  <Badge variant="outline">Ingrediens</Badge>
                                ) : null}
                              </FieldLabel>
                              <FieldDescription className="truncate">
                                {product.categoryPath}
                              </FieldDescription>
                            </FieldContent>
                          </Field>
                        );
                      })}
                    </FieldGroup>
                  </div>
                )}
              </FieldSet>

              <FieldSet>
                <FieldLegend variant="label">Rækkefølge</FieldLegend>
                <FieldDescription>
                  Brug pilene til at flytte et Produkt. Du kan gemme en tom
                  rækkefølge.
                </FieldDescription>
                {barOrder.length === 0 ? (
                  <Empty className="min-h-32 border">
                    <EmptyHeader>
                      <EmptyTitle>Ingen Produkter i Baren</EmptyTitle>
                      <EmptyDescription>
                        Markér Produkter ovenfor for at tilføje dem.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <FieldGroup className="gap-2">
                    {barOrder.map((productId, index) => {
                      const product = effectiveProducts.find(
                        (candidate) => candidate.id === productId,
                      );
                      if (!product) return null;
                      return (
                        <div
                          key={product.id}
                          className="flex min-h-14 items-center justify-between gap-3 rounded-lg border px-3 py-2"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="w-6 shrink-0 text-center text-sm text-muted-foreground">
                              {index + 1}
                            </span>
                            <p className="truncate font-medium">
                              {product.name}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-lg"
                                    className="size-11"
                                    aria-label={`Flyt ${product.name} op`}
                                    disabled={index === 0 || savingOrder}
                                    onClick={() =>
                                      moveBarProduct(product.id, -1)
                                    }
                                  />
                                }
                              >
                                <ArrowUpIcon />
                              </TooltipTrigger>
                              <TooltipContent>Flyt op</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-lg"
                                    className="size-11"
                                    aria-label={`Flyt ${product.name} ned`}
                                    disabled={
                                      index === barOrder.length - 1 ||
                                      savingOrder
                                    }
                                    onClick={() =>
                                      moveBarProduct(product.id, 1)
                                    }
                                  />
                                }
                              >
                                <ArrowDownIcon />
                              </TooltipTrigger>
                              <TooltipContent>Flyt ned</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-lg"
                                    className="size-11"
                                    aria-label={`Fjern ${product.name} fra ${orderingBar?.name}`}
                                    disabled={savingOrder}
                                    onClick={() =>
                                      toggleBarProduct(product.id, false)
                                    }
                                  />
                                }
                              >
                                <Trash2Icon />
                              </TooltipTrigger>
                              <TooltipContent>Fjern Produkt</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      );
                    })}
                  </FieldGroup>
                )}
              </FieldSet>
              <FieldError>{orderError}</FieldError>
            </FieldGroup>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={savingOrder}
              onClick={() => setOrderingBar(null)}
            >
              Annullér
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={
                savingOrder ||
                configuration === undefined ||
                products === undefined
              }
              onClick={() => void saveBarOrder()}
            >
              {savingOrder ? <Spinner data-icon="inline-start" /> : null}
              Gem rækkefølge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingBar)}
        onOpenChange={(next) => {
          if (!next && !savingBar) setEditingBar(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingBar === "new" ? "Ny Bar" : "Redigér Bar"}
            </DialogTitle>
            <DialogDescription>
              Giv Baren et navn. Produktordenen kan ændres her eller på
              Count-siden.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={Boolean(barError)}>
              <FieldLabel htmlFor={`count-area-name-${locationId}`}>
                Navn
              </FieldLabel>
              <Input
                id={`count-area-name-${locationId}`}
                value={barName}
                onChange={(event) => setBarName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void saveBar();
                  }
                }}
                aria-invalid={Boolean(barError)}
                className="min-h-11"
              />
              <FieldError>{barError}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={savingBar}
              onClick={() => setEditingBar(null)}
            >
              Annullér
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={savingBar}
              onClick={() => void saveBar()}
            >
              {savingBar ? <Spinner data-icon="inline-start" /> : null}
              Gem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingBarDelete)}
        onOpenChange={(next) => {
          if (!next && !deletingBar) setPendingBarDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fjern Baren?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingBarDelete?.name} og dens Produktrækkefølge fjernes
              permanent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={deletingBar}>
              Annullér
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="min-h-11"
              disabled={deletingBar}
              onClick={() => void deleteBar()}
            >
              {deletingBar ? <Spinner data-icon="inline-start" /> : null}
              Fjern Bar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
