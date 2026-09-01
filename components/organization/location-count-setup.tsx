"use client";

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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery } from "convex/react";
import {
  GripVerticalIcon,
  LayoutListIcon,
  ListOrderedIcon,
  MapIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
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
import { cn } from "@/lib/utils";

type ProductId = Id<"products">;
type ProductMode = "all" | "selected";
type ActiveTab = "products" | "areas";
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
  const {
    attributes,
    isDragging,
    isOver,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: productId, disabled });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : undefined,
      }}
      className={cn(
        "flex min-h-14 items-center gap-2 rounded-lg border bg-background p-1 transition-[box-shadow,border-color] duration-150",
        isDragging && "opacity-30",
        isOver &&
          !isDragging &&
          "border-primary bg-primary/5 ring-2 ring-primary/20",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="flex min-h-12 min-w-0 flex-1 touch-none cursor-grab items-center gap-2 rounded-md px-1 py-0 text-left outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing disabled:pointer-events-none disabled:cursor-default disabled:opacity-50"
        disabled={disabled}
        {...attributes}
        {...listeners}
        aria-label={`Flyt ${productName}`}
        aria-roledescription="Produkt, der kan flyttes"
      >
        <span className="flex size-11 shrink-0 items-center justify-center text-muted-foreground">
          <GripVerticalIcon aria-hidden="true" />
        </span>
        <span className="w-6 shrink-0 text-center text-sm text-muted-foreground">
          {position}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {productName}
        </span>
      </button>
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
    </li>
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
  const products = useQuery(
    api.catalog.listActiveProductSearchOptions,
    open ? {} : "skip",
  );
  const areas = useQuery(
    api.countAreas.listForManagement,
    open ? { locationId } : "skip",
  );
  const setConfiguration = useMutation(api.locationProducts.setConfiguration);
  const createArea = useMutation(api.countAreas.create);
  const renameArea = useMutation(api.countAreas.rename);
  const removeCountArea = useMutation(api.countAreas.remove);
  const setAreaProductOrder = useMutation(api.countAreas.setProductOrder);

  const [activeTab, setActiveTab] = useState<ActiveTab>("products");
  const [search, setSearch] = useState("");
  const [productDraft, setProductDraft] = useState<ProductDraft>(() => ({
    locationId: null,
    mode: "all",
    selectedProductIds: new Set(),
  }));
  const [savingProducts, setSavingProducts] = useState(false);
  const [editingArea, setEditingArea] = useState<CountArea | "new" | null>(null);
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
  const isBusy = savingProducts || savingArea || deletingArea || savingOrder;

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
      toast.error(getUserErrorMessage(error, "Count-opsætningen kunne ikke opdateres. Prøv igen."));
    } finally {
      setSavingProducts(false);
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

  function toggleAreaProduct(productId: ProductId, checked: boolean) {
    setOrderError("");
    setAreaOrder((current) => {
      if (checked) {
        return current.includes(productId) ? current : [...current, productId];
      }
      return current.filter((id) => id !== productId);
    });
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
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Produkter og Områder</DialogTitle>
            <DialogDescription>
              Vælg de Produkter og Områder, som bruges på {locationName}.
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (value === "products" || value === "areas") {
                setActiveTab(value);
              }
            }}
          >
            <TabsList
              className="grid h-11 w-full grid-cols-2"
              aria-label="Produkter og Områder"
            >
              <TabsTrigger value="products">Produkter</TabsTrigger>
              <TabsTrigger value="areas">Områder</TabsTrigger>
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
                              className="self-center mt-0!"
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

            <TabsContent value="areas" className="pt-4">
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
                  <Empty className="min-h-52 border">
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
                  <FieldGroup className="gap-2">
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
        open={Boolean(orderingArea)}
        onOpenChange={(next) => {
          if (!next && !savingOrder) setOrderingArea(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Produkter og rækkefølge</DialogTitle>
            <DialogDescription>
              Vælg Produkter til {orderingArea?.name}, og placér dem i den
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
                <FieldLegend variant="label">Produkter i Området</FieldLegend>
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
                        const checked = areaOrder.includes(product.id);
                        const inputId = `count-area-product-${orderingArea?.id}-${product.id}`;
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
                              className="self-center mt-0!"
                              checked={checked}
                              disabled={savingOrder}
                              aria-label={`Vælg ${product.name}`}
                              onCheckedChange={(next) =>
                                toggleAreaProduct(product.id, next === true)
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
                  Træk Produkterne for at ændre rækkefølgen. Du kan gemme en tom
                  rækkefølge.
                </FieldDescription>
                {areaOrder.length === 0 ? (
                  <Empty className="min-h-32 border">
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
                              onRemove={() =>
                                toggleAreaProduct(product.id, false)
                              }
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
