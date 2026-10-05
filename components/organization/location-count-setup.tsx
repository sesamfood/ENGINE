"use client";


import { ProductCategoryCombobox } from "@/components/catalog/product-category-combobox";
import { CountExclusionList } from "./count-exclusion-list";
import { SortableListRow } from "./sortable-list-row";

import { useCompleteCatalog } from "@/hooks/use-complete-catalog";

import { getUserErrorMessage } from "@/lib/user-errors";
import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  type Announcements,
  type ScreenReaderInstructions,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { useMutation, useQuery } from "convex/react";
import {
  LayoutListIcon,
  ListOrderedIcon,
  MapIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
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
  FieldDescription,
  FieldError,
  FieldLegend,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
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
type ActiveTab = "products" | "areas" | "excluded";
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

const areaOrderScreenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "Tryk på mellemrum for at vælge Produktet. Flyt det med piletasterne. Tryk på mellemrum igen for at placere det, eller Escape for at annullere.",
};

function allProductDraft(locationId: Id<"locations">): ProductDraft {
  return {
    locationId,
    mode: "all",
    selectedProductIds: new Set(),
  };
}

function SortableAreaProductRow({
  areaName,
  disabled,
  position,
  productId,
  productName,
  onRemove,
}: {
  areaName: string;
  disabled: boolean;
  position: number;
  productId: ProductId;
  productName: string;
  onRemove: () => void;
}) {
  return (
    <SortableListRow
      id={productId}
      label={productName}
      disabled={disabled}
      position={position}
      roleDescription="Produkt, der kan flyttes"
      actions={
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="size-11"
                aria-label={`Fjern ${productName} fra ${areaName}`}
                disabled={disabled}
                onClick={onRemove}
              />
            }
          >
            <Trash2Icon />
          </TooltipTrigger>
          <TooltipContent>Fjern Produkt</TooltipContent>
        </Tooltip>
      }
    />
  );
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
  const products = useCompleteCatalog(
    api.catalog.listActiveProductSearchOptionsPage,
    open ? {} : "skip",
  );
  const areas = useQuery(
    api.countAreas.listForManagement,
    open ? { locationId } : "skip",
  );
  const exclusions = useQuery(
    api.countExclusions.getLocation,
    open ? { locationId } : "skip",
  );
  const categories = useQuery(
    api.catalog.listCategoryOptions,
    open ? {} : "skip",
  );
  const setConfiguration = useMutation(api.locationProducts.setConfiguration);
  const setExclusions = useMutation(api.countExclusions.setLocation);
  const createArea = useMutation(api.countAreas.create);
  const renameArea = useMutation(api.countAreas.rename);
  const removeCountArea = useMutation(api.countAreas.remove);
  const setAreaProductOrder = useMutation(api.countAreas.setProductOrder);

  const [activeTab, setActiveTab] = useState<ActiveTab>("products");
  const [productDraft, setProductDraft] = useState<ProductDraft>(() => ({
    locationId: null,
    mode: "all",
    selectedProductIds: new Set(),
  }));
  const [savingProducts, setSavingProducts] = useState(false);
  const [exclusionDraft, setExclusionDraft] = useState<{
    locationId: Id<"locations">;
    productIds: Set<ProductId>;
  } | null>(null);
  const [savingExclusions, setSavingExclusions] = useState(false);
  const [editingArea, setEditingArea] = useState<CountArea | "new" | null>(
    null,
  );
  const [areaName, setAreaName] = useState("");
  const [areaError, setAreaError] = useState("");
  const [savingArea, setSavingArea] = useState(false);
  const [pendingAreaDelete, setPendingAreaDelete] = useState<CountArea | null>(
    null,
  );
  const [deletingArea, setDeletingArea] = useState(false);
  const [orderingArea, setOrderingArea] = useState<CountArea | null>(null);
  const [areaOrder, setAreaOrder] = useState<ProductId[]>([]);
  const [orderError, setOrderError] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);
  const areaOrderSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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
  const productOptions =
    products?.map((product) => {
      const isIngredient = ingredientProductIds.includes(product.id);
      return {
        value: product.id,
        label: isIngredient ? `${product.name} · Ingrediens` : product.name,
        categoryIds: product.categoryIds,
        disabled: isIngredient,
      };
    }) ?? [];
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
  const excludedProductIds =
    exclusionDraft?.locationId === locationId
      ? exclusionDraft.productIds
      : new Set(exclusions?.locationProductIds ?? []);
  const organizationExcludedProductIds = useMemo(
    () => new Set(exclusions?.organizationProductIds ?? []),
    [exclusions],
  );
  const effectiveProducts = useMemo(() => {
    const savedExcluded = new Set([
      ...(exclusions?.organizationProductIds ?? []),
      ...(exclusions?.locationProductIds ?? []),
    ]);
    return (
      products?.filter(
        (product) =>
          effectiveProductIds.has(product.id) && !savedExcluded.has(product.id),
      ) ?? []
    );
  }, [effectiveProductIds, exclusions, products]);
  const productNamesById = useMemo(
    () =>
      new Map<string, string>(
        effectiveProducts.map((product) => [product.id, product.name]),
      ),
    [effectiveProducts],
  );
  const areaOrderAnnouncements = useMemo<Announcements>(
    () => ({
      onDragStart({ active }) {
        const name = productNamesById.get(String(active.id)) ?? "Produktet";
        return `${name} er valgt.`;
      },
      onDragOver({ active, over }) {
        if (!over) return;
        const name = productNamesById.get(String(active.id)) ?? "Produktet";
        const overName =
          productNamesById.get(String(over.id)) ?? "den nye placering";
        return `${name} flyttes til ${overName}.`;
      },
      onDragEnd({ active }) {
        const name = productNamesById.get(String(active.id)) ?? "Produktet";
        return `${name} er placeret.`;
      },
      onDragCancel({ active }) {
        const name = productNamesById.get(String(active.id)) ?? "Produktet";
        return `Flytning af ${name} blev annulleret.`;
      },
    }),
    [productNamesById],
  );
  const isBusy =
    savingProducts ||
    savingExclusions ||
    savingArea ||
    deletingArea ||
    savingOrder;


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
      toast.error(getUserErrorMessage(error, "Count-opsætningen kunne ikke opdateres. Prøv igen."));
    } finally {
      setSavingProducts(false);
    }
  }

  async function saveExclusions() {
    setSavingExclusions(true);
    try {
      await setExclusions({ locationId, productIds: [...excludedProductIds] });
      setExclusionDraft(null);
      toast.success("Produkter udeladt fra Count er gemt");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Count-opsætningen kunne ikke opdateres. Prøv igen."));
    } finally {
      setSavingExclusions(false);
    }
  }

  function openNewArea() {
    setEditingArea("new");
    setAreaName("");
    setAreaError("");
  }

  function openRenameArea(area: CountArea) {
    setEditingArea(area);
    setAreaName(area.name);
    setAreaError("");
  }

  async function saveArea() {
    if (!areaName.trim()) {
      setAreaError("Indtast et navn til Området");
      return;
    }
    setSavingArea(true);
    setAreaError("");
    try {
      if (editingArea === "new") {
        await createArea({ locationId, name: areaName });
        toast.success("Området er oprettet");
      } else if (editingArea) {
        await renameArea({ countAreaId: editingArea.id, name: areaName });
        toast.success("Området er omdøbt");
      }
      setEditingArea(null);
    } catch (error) {
      setAreaError(getUserErrorMessage(error, "Count-opsætningen kunne ikke opdateres. Prøv igen."));
    } finally {
      setSavingArea(false);
    }
  }

  async function deleteArea() {
    if (!pendingAreaDelete) return;
    setDeletingArea(true);
    try {
      await removeCountArea({ countAreaId: pendingAreaDelete.id });
      toast.success("Området er fjernet");
      setPendingAreaDelete(null);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Count-opsætningen kunne ikke opdateres. Prøv igen."));
    } finally {
      setDeletingArea(false);
    }
  }

  function openAreaOrder(area: CountArea) {
    setOrderingArea(area);
    setAreaOrder([...area.productIds]);
    setOrderError("");
  }

  async function saveAreaOrder() {
    if (!orderingArea) return;
    setSavingOrder(true);
    setOrderError("");
    try {
      await setAreaProductOrder({
        locationId,
        countAreaId: orderingArea.id,
        productIds: areaOrder,
      });
      toast.success("Produktordenen for Området er gemt");
      setOrderingArea(null);
    } catch (error) {
      const message = getUserErrorMessage(error, "Count-opsætningen kunne ikke opdateres. Prøv igen.");
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
        <DialogContent className="max-h-(--spacing-dialog) overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Produkter og Områder</DialogTitle>
            <DialogDescription>
              Vælg de Produkter og Områder, som bruges på {locationName}.
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (
                value === "products" ||
                value === "areas" ||
                value === "excluded"
              ) {
                setActiveTab(value);
              }
            }}
          >
            <TabsList
              className="grid h-11 w-full grid-cols-3"
              aria-label="Produkter og Områder"
            >
              <TabsTrigger value="products">Produkter</TabsTrigger>
              <TabsTrigger value="areas">Områder</TabsTrigger>
              <TabsTrigger value="excluded">Udelad fra Count</TabsTrigger>
            </TabsList>

            <TabsContent value="products" appearance="standard">
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

                {products === undefined || categories === undefined ? (
                  <Skeleton className="h-11 w-full" />
                ) : products.length === 0 ? (
                  <Empty appearance="outlined" className="min-h-48">
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
                ) : (
                  <Field data-disabled={configuration === undefined}>
                    <FieldLabel>Valgte Produkter</FieldLabel>
                    <ProductCategoryCombobox
                      categories={categories}
                      products={productOptions}
                      values={mode === "selected" ? [...selectedProductIds] : []}
                      onValuesChange={(values) =>
                        setProductDraft({
                          locationId,
                          mode: "selected",
                          selectedProductIds: new Set(values as ProductId[]),
                        })
                      }
                      disabled={configuration === undefined}
                      ariaLabel="Produkter på lokationen"
                    />
                    <FieldDescription>
                      Vælg en kategorilinje for at vælge eller fravælge alle
                      Produkter i kategorien.
                    </FieldDescription>
                  </Field>
                )}
              </FieldGroup>
            </TabsContent>

            <TabsContent value="areas" appearance="standard">
              <FieldGroup>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex flex-col gap-1">
                    <h3 className="font-medium">Områder</h3>
                    <p className="text-sm text-muted-foreground">
                      Du kan ændre Produktrækkefølgen her eller på Count-siden,
                      når du har valgt Området.
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="min-h-11 shrink-0"
                    onClick={openNewArea}
                  >
                    <PlusIcon data-icon="inline-start" />
                    Nyt Område
                  </Button>
                </div>

                {areas === undefined ? (
                  <div className="flex flex-col gap-2">
                    {Array.from({ length: 3 }, (_, index) => (
                      <Skeleton key={index} className="h-14 w-full" />
                    ))}
                  </div>
                ) : areas.length === 0 ? (
                  <Empty appearance="outlined" className="min-h-52">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <MapIcon />
                      </EmptyMedia>
                      <EmptyTitle>Ingen Områder endnu</EmptyTitle>
                      <EmptyDescription>
                        Opret et Område, før du starter en Count på lokationen.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <Button
                        type="button"
                        className="min-h-11"
                        onClick={openNewArea}
                      >
                        <PlusIcon data-icon="inline-start" />
                        Nyt Område
                      </Button>
                    </EmptyContent>
                  </Empty>
                ) : (
                  <FieldGroup appearance="dense">
                    {areas.map((area) => (
                      <div
                        key={area.id}
                        className="flex min-h-14 items-center justify-between gap-3 rounded-lg border px-3 py-2"
                      >
                        <div className="flex min-w-0 flex-col gap-1">
                          <p className="truncate font-medium">{area.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {area.productIds.length === 0
                              ? "Produktorden er ikke sat"
                              : `${area.productIds.length} Produkter i ordenen`}
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
                                  aria-label={`Produkter og rækkefølge for ${area.name}`}
                                  onClick={() => openAreaOrder(area)}
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
                                  aria-label={`Redigér ${area.name}`}
                                  onClick={() => openRenameArea(area)}
                                />
                              }
                            >
                              <PencilIcon />
                            </TooltipTrigger>
                            <TooltipContent>Redigér Område</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-lg"
                                  className="size-11"
                                  aria-label={`Fjern ${area.name}`}
                                  onClick={() => setPendingAreaDelete(area)}
                                />
                              }
                            >
                              <Trash2Icon />
                            </TooltipTrigger>
                            <TooltipContent>Fjern Område</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    ))}
                  </FieldGroup>
                )}
              </FieldGroup>
            </TabsContent>

            <TabsContent value="excluded" appearance="standard">
              <FieldGroup>
                <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">Udelad fra Count</p>
                    <Badge variant="secondary">
                      {excludedProductIds.size} udeladte
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Valgte Produkter vises ikke i Count på {locationName}. De
                    kan stadig bruges i Transfer og Waste.
                  </p>
                </div>
                <CountExclusionList
                  products={products}
                  excludedProductIds={excludedProductIds}
                  lockedProductIds={organizationExcludedProductIds}
                  disabled={exclusions === undefined || savingExclusions}
                  onChange={(productIds) =>
                    setExclusionDraft({ locationId, productIds })
                  }
                />
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
            ) : activeTab === "excluded" ? (
              <Button
                type="button"
                className="min-h-11"
                disabled={
                  savingExclusions ||
                  exclusionDraft?.locationId !== locationId
                }
                onClick={() => void saveExclusions()}
              >
                {savingExclusions ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                Gem udeladte Produkter
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(orderingArea)}
        onOpenChange={(next) => {
          if (!next && !savingOrder) setOrderingArea(null);
        }}
      >
        <DialogContent className="max-h-(--spacing-dialog) overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Produkter og rækkefølge</DialogTitle>
            <DialogDescription>
              Vælg Produkter til {orderingArea?.name}, og placér dem i den
              rækkefølge, de skal tælles i.
            </DialogDescription>
          </DialogHeader>

          {configuration === undefined ||
          products === undefined ||
          categories === undefined ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-11 w-full" />
              ))}
            </div>
          ) : (
            <FieldGroup>
              <FieldSet>
                <FieldLegend variant="label">Produkter i Området</FieldLegend>
                {effectiveProducts.length === 0 ? (
                  <Empty appearance="outlined" className="min-h-36">
                    <EmptyHeader>
                      <EmptyTitle>Ingen Produkter tilgængelige</EmptyTitle>
                      <EmptyDescription>
                        Vælg aktive Produkter for lokationen først.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <ProductCategoryCombobox
                    categories={categories}
                    products={effectiveProducts.map((product) => ({
                      value: product.id,
                      label: product.name,
                      categoryIds: product.categoryIds,
                    }))}
                    values={areaOrder}
                    onValuesChange={(values) => {
                      setOrderError("");
                      setAreaOrder(values as ProductId[]);
                    }}
                    disabled={savingOrder}
                    ariaLabel={`Produkter i ${orderingArea?.name ?? "Området"}`}
                  />
                )}
              </FieldSet>

              <FieldSet>
                <FieldLegend variant="label">Rækkefølge</FieldLegend>
                <FieldDescription>
                  Træk Produkterne for at ændre rækkefølgen. Du kan gemme en tom
                  rækkefølge.
                </FieldDescription>
                {areaOrder.length === 0 ? (
                  <Empty appearance="outlined" className="min-h-32">
                    <EmptyHeader>
                      <EmptyTitle>Ingen Produkter i Området</EmptyTitle>
                      <EmptyDescription>
                        Markér Produkter ovenfor for at tilføje dem.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <DndContext
                    accessibility={{
                      announcements: areaOrderAnnouncements,
                      screenReaderInstructions:
                        areaOrderScreenReaderInstructions,
                    }}
                    collisionDetection={closestCorners}
                    sensors={areaOrderSensors}
                    onDragEnd={({ active, over }) => {
                      setOrderError("");
                      if (!over || active.id === over.id) return;

                      const activeId = String(active.id);
                      const overId = String(over.id);
                      setAreaOrder((current) => {
                        const from = current.findIndex(
                          (id) => String(id) === activeId,
                        );
                        const to = current.findIndex(
                          (id) => String(id) === overId,
                        );
                        return from < 0 || to < 0
                          ? current
                          : arrayMove(current, from, to);
                      });
                    }}
                  >
                    <SortableContext
                      items={areaOrder}
                      strategy={verticalListSortingStrategy}
                    >
                      <ol
                        className="flex flex-col gap-2"
                        aria-label="Produktrækkefølge"
                      >
                        {areaOrder.map((productId, index) => {
                          const product = effectiveProducts.find(
                            (candidate) => candidate.id === productId,
                          );
                          if (!product || !orderingArea) return null;
                          return (
                            <SortableAreaProductRow
                              key={product.id}
                              areaName={orderingArea.name}
                              disabled={savingOrder}
                              position={index + 1}
                              productId={product.id}
                              productName={product.name}
                              onRemove={() => {
                                setOrderError("");
                                setAreaOrder((current) =>
                                  current.filter((id) => id !== product.id),
                                );
                              }}
                            />
                          );
                        })}
                      </ol>
                    </SortableContext>
                  </DndContext>
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
              onClick={() => setOrderingArea(null)}
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
              onClick={() => void saveAreaOrder()}
            >
              {savingOrder ? <Spinner data-icon="inline-start" /> : null}
              Gem rækkefølge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingArea)}
        onOpenChange={(next) => {
          if (!next && !savingArea) setEditingArea(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingArea === "new" ? "Nyt Område" : "Redigér Område"}
            </DialogTitle>
            <DialogDescription>
              Giv Området et navn. Produktordenen kan ændres her eller på
              Count-siden.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={Boolean(areaError)}>
              <FieldLabel htmlFor={`count-area-name-${locationId}`}>
                Navn
              </FieldLabel>
              <Input
                id={`count-area-name-${locationId}`}
                value={areaName}
                onChange={(event) => setAreaName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void saveArea();
                  }
                }}
                aria-invalid={Boolean(areaError)}
                className="min-h-11"
              />
              <FieldError>{areaError}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={savingArea}
              onClick={() => setEditingArea(null)}
            >
              Annullér
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={savingArea}
              onClick={() => void saveArea()}
            >
              {savingArea ? <Spinner data-icon="inline-start" /> : null}
              Gem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingAreaDelete)}
        onOpenChange={(next) => {
          if (!next && !deletingArea) setPendingAreaDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fjern Området?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAreaDelete?.name} og dens Produktrækkefølge fjernes
              permanent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={deletingArea}>
              Annullér
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="min-h-11"
              disabled={deletingArea}
              onClick={() => void deleteArea()}
            >
              {deletingArea ? <Spinner data-icon="inline-start" /> : null}
              Fjern Område
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
