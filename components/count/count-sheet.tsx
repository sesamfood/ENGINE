"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useConvex, useMutation, useQuery } from "convex/react";
import {
  BoxesIcon,
  DownloadIcon,
  GripVerticalIcon,
  ListRestartIcon,
  LockKeyholeIcon,
  MinusIcon,
  PackageOpenIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CountNavigation } from "@/components/count/count-navigation";
import { useCountState } from "@/components/count/count-state-provider";
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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { usePermission } from "@/components/app-shell";
import {
  setCountOrder,
  useCountOrder,
} from "@/lib/count-prefs";
import { downloadCsv } from "@/lib/download-csv";
import { productSearchScore } from "@/lib/product-search";
import { useLastDefined } from "@/lib/use-last-defined";
import { cn } from "@/lib/utils";

type CountUnit = {
  id: Id<"units">;
  name: string;
  factorToDefault: number;
  quantity: number;
};

type CountCatalogProduct = {
  id: Id<"products">;
  name: string;
  category: {
    id: Id<"categories">;
    name: string;
    path: string;
    parentCategoryId: Id<"categories"> | null;
  };
  imageUrl: string | null;
  defaultUnitId: Id<"units">;
  units: Array<Omit<CountUnit, "quantity">>;
};

type CountProduct = Omit<CountCatalogProduct, "units"> & {
  units: CountUnit[];
};

type QuantityPayload = {
  locationId: Id<"locations">;
  productId: Id<"products">;
  unitId: Id<"units">;
  quantity: number;
};

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

function categoryTreeIds(
  categories: Array<{
    id: Id<"categories">;
    parentCategoryId: Id<"categories"> | null;
  }>,
  rootId: string,
) {
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (category.parentCategoryId && ids.has(category.parentCategoryId)) {
        if (!ids.has(category.id)) {
          ids.add(category.id);
          changed = true;
        }
      }
    }
  }
  return ids;
}

function countdown(target: number, now: number) {
  const seconds = Math.max(0, Math.ceil((target - now) / 1000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (days > 0) {
    return [
      `${days} ${days === 1 ? "dag" : "dage"}`,
      hours > 0 ? `${hours} t` : null,
      minutes > 0 ? `${minutes} min` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (hours > 0) {
    return [`${hours} t`, minutes > 0 ? `${minutes} min` : null]
      .filter(Boolean)
      .join(" ");
  }
  if (minutes > 0) {
    return [`${minutes} min`, rest > 0 ? `${rest} sek` : null]
      .filter(Boolean)
      .join(" ");
  }
  return `${rest} sek`;
}

function UnavailableTooltip({
  reason,
  children,
}: {
  reason: string | null;
  children: React.ReactNode;
}) {
  if (!reason) return children;

  return (
    <Tooltip>
      <TooltipTrigger
        closeOnClick={false}
        render={
          <div
            className="min-w-0"
            tabIndex={0}
            aria-label={`Ikke tilgængelig: ${reason}`}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

function QuantityControl({
  productName,
  unitName,
  quantity,
  disabled,
  onChange,
}: {
  productName: string;
  unitName: string;
  quantity: number;
  disabled: boolean;
  onChange: (quantity: number) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        className="size-11"
        aria-label={`Reducer ${productName} i ${unitName}`}
        disabled={disabled || quantity <= 0}
        onClick={() => onChange(Math.max(0, quantity - 1))}
      >
        <MinusIcon />
      </Button>
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={quantity}
        disabled={disabled}
        aria-label={`Mængde af ${productName} i ${unitName}`}
        className="h-11 min-w-0 flex-1 text-center"
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.max(0, next));
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        className="size-11"
        aria-label={`Forøg ${productName} i ${unitName}`}
        disabled={disabled}
        onClick={() => onChange(quantity + 1)}
      >
        <PlusIcon />
      </Button>
    </div>
  );
}

function ProductCard({
  product,
  selectedUnitId,
  disabledReason,
  editingOrder,
  dragHandle,
  quantityFor,
  onSelectedUnitChange,
  onQuantityChange,
}: {
  product: CountProduct;
  selectedUnitId: Id<"units">;
  disabledReason: string | null;
  editingOrder: boolean;
  dragHandle?: React.ReactNode;
  quantityFor: (unit: CountUnit) => number;
  onSelectedUnitChange: (unitId: Id<"units">) => void;
  onQuantityChange: (unit: CountUnit, quantity: number) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftQuantities, setDraftQuantities] = useState<
    Record<string, number>
  >({});
  const disabled = Boolean(disabledReason);
  const selectedUnit =
    product.units.find((unit) => unit.id === selectedUnitId) ??
    product.units[0];
  const unitItems = product.units.map((unit) => ({
    value: unit.id,
    label: unit.name,
  }));

  function openDialog() {
    setDraftQuantities(
      Object.fromEntries(
        product.units.map((unit) => [unit.id, quantityFor(unit)]),
      ),
    );
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setDraftQuantities({});
  }

  function confirmDialog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    for (const unit of product.units) {
      const quantity = draftQuantities[unit.id] ?? quantityFor(unit);
      if (quantity !== quantityFor(unit)) {
        onQuantityChange(unit, quantity);
      }
    }
    closeDialog();
  }

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        if (!open) closeDialog();
      }}
    >
      <Card
        className={cn(
          "h-full gap-0 py-0 [--card-spacing:--spacing(3)] lg:[--card-spacing:--spacing(4)]",
          !editingOrder &&
            !disabled &&
            "transition-shadow has-[button[data-card-trigger]:hover]:shadow-sm",
        )}
      >
        <div className="relative">
          {product.imageUrl ? (
            <div className="relative aspect-video w-full overflow-hidden bg-muted lg:aspect-[4/3]">
              <Image
                src={product.imageUrl}
                alt={`Produktbillede af ${product.name}`}
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
          {editingOrder && dragHandle ? (
            <div className="absolute left-2 top-2">{dragHandle}</div>
          ) : null}
          <CardHeader className="py-3 lg:py-4">
            <div className="flex min-w-0 items-baseline gap-2">
              <CardTitle className="min-w-0 flex-1 truncate">
                {product.name}
              </CardTitle>
              <CardDescription className="max-w-[45%] shrink-0 truncate">
                {product.category?.name ?? "Uden kategori"}
              </CardDescription>
            </div>
          </CardHeader>
          {!editingOrder ? (
            <button
              type="button"
              data-card-trigger
              className="absolute inset-0 cursor-pointer rounded-t-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed"
              aria-label={`Tæl ${product.name} i flere enheder`}
              disabled={disabled}
              onClick={openDialog}
            />
          ) : null}
        </div>
        <CardContent className="flex flex-col gap-2 pb-3 lg:gap-3 lg:pb-4">
          {selectedUnit ? (
            <>
              <UnavailableTooltip reason={disabledReason}>
                <Select
                  items={unitItems}
                  value={selectedUnit.id}
                  onValueChange={(value) =>
                    onSelectedUnitChange(value as Id<"units">)
                  }
                  disabled={disabled}
                >
                  <SelectTrigger aria-label={`Enhed for ${product.name}`} className="h-11! w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {unitItems.map((unit) => (
                        <SelectItem key={unit.value} value={unit.value}>
                          {unit.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </UnavailableTooltip>
              <UnavailableTooltip reason={disabledReason}>
                <QuantityControl
                  productName={product.name}
                  unitName={selectedUnit.name}
                  quantity={quantityFor(selectedUnit)}
                  disabled={disabled}
                  onChange={(quantity) =>
                    onQuantityChange(selectedUnit, quantity)
                  }
                />
              </UnavailableTooltip>
              {!editingOrder ? (
                <UnavailableTooltip reason={disabledReason}>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full"
                    disabled={disabled}
                    onClick={openDialog}
                  >
                    Flere muligheder
                  </Button>
                </UnavailableTooltip>
              ) : null}
            </>
          ) : null}
        </CardContent>
      </Card>

      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <form className="flex flex-col gap-4" onSubmit={confirmDialog}>
          <DialogHeader>
            <DialogTitle>{product.name}</DialogTitle>
            <DialogDescription>
              Registrér beholdningen i alle relevante enheder.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {product.units.map((unit) => (
              <Field key={unit.id} orientation="responsive">
                <FieldLabel className="@md/field-group:min-w-24">
                  {unit.name}
                </FieldLabel>
                <div className="w-full @md/field-group:w-56">
                  <QuantityControl
                    productName={product.name}
                    unitName={unit.name}
                    quantity={draftQuantities[unit.id] ?? quantityFor(unit)}
                    disabled={disabled}
                    onChange={(quantity) =>
                      setDraftQuantities((current) => ({
                        ...current,
                        [unit.id]: quantity,
                      }))
                    }
                  />
                </div>
              </Field>
            ))}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Annuller
            </Button>
            <Button type="submit">Bekræft</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OrderBuilder({
  open,
  products,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  products: CountProduct[];
  onOpenChange: (open: boolean) => void;
  onSave: (order: Id<"products">[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Id<"products">[]>([]);
  const selected = new Set(selectedIds);
  const available = products.filter(
    (product) =>
      !selected.has(product.id) &&
      product.name
        .toLocaleLowerCase("da")
        .includes(search.toLocaleLowerCase("da")),
  );

  function close(open: boolean) {
    if (!open) {
      setSearch("");
      setSelectedIds([]);
    }
    onOpenChange(open);
  }

  function save() {
    onSave([
      ...selectedIds,
      ...products
        .filter((product) => !selected.has(product.id))
        .map((product) => product.id),
    ]);
    close(false);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Start forfra med rækkefølgen</DialogTitle>
          <DialogDescription>
            Søg og vælg produkter i den rækkefølge, de skal vises. Ikke-valgte
            produkter placeres bagefter.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-4 sm:grid-cols-2">
          <div className="flex min-h-0 flex-col gap-2">
            <p className="font-medium">
              Valgt rækkefølge ({selectedIds.length})
            </p>
            <div className="flex max-h-80 flex-col gap-2 overflow-y-auto rounded-xl border p-2">
              {selectedIds.length ? (
                selectedIds.map((id, index) => {
                  const product = products.find((item) => item.id === id);
                  if (!product) return null;
                  return (
                    <Button
                      key={id}
                      type="button"
                      variant="outline"
                      className="min-h-11 w-full justify-start whitespace-normal"
                      aria-label={`Fjern ${product.name} fra rækkefølgen`}
                      onClick={() =>
                        setSelectedIds((current) =>
                          current.filter((productId) => productId !== id),
                        )
                      }
                    >
                      {index + 1}. {product.name}
                      <XIcon data-icon="inline-end" />
                    </Button>
                  );
                })
              ) : (
                <p className="p-3 text-sm text-muted-foreground">
                  Vælg det første produkt i listen.
                </p>
              )}
            </div>
          </div>
          <div className="flex min-h-0 flex-col gap-2">
            <InputGroup className="h-11">
              <InputGroupAddon>
                <SearchIcon aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Søg efter produkter"
                aria-label="Søg efter produkter til rækkefølgen"
              />
            </InputGroup>
            {available.length > 1 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setSelectedIds((current) => [
                    ...current,
                    ...available.map((product) => product.id),
                  ])
                }
              >
                Tilføj alle viste ({available.length})
              </Button>
            ) : null}
            <div className="flex max-h-80 flex-col gap-2 overflow-y-auto rounded-xl border p-2">
              {available.length ? (
                available.map((product) => (
                  <Button
                    key={product.id}
                    type="button"
                    variant="ghost"
                    className="min-h-11 w-full justify-start whitespace-normal"
                    onClick={() =>
                      setSelectedIds((current) => [...current, product.id])
                    }
                  >
                    <PlusIcon data-icon="inline-start" />
                    {product.name}
                  </Button>
                ))
              ) : (
                <p className="p-3 text-sm text-muted-foreground">
                  Ingen produkter fundet.
                </p>
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            Annuller
          </Button>
          <Button type="button" onClick={save}>
            Gem rækkefølge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SortableProduct({
  product,
  position,
  productCount,
  onMove,
  children,
}: {
  product: CountProduct;
  position: number;
  productCount: number;
  onMove: (position: number) => void;
  children: (dragHandle: React.ReactNode) => React.ReactNode;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [placement, setPlacement] = useState("position");
  const [selectedPosition, setSelectedPosition] = useState(
    String(position + 1),
  );
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: product.id });

  function place() {
    onMove(
      placement === "first"
        ? 0
        : placement === "last"
          ? productCount - 1
          : Number(selectedPosition) - 1,
    );
    setDialogOpen(false);
  }

  return (
    <>
      <div
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.5 : 1,
        }}
      >
        {children(
          <Button
            ref={setActivatorNodeRef}
            type="button"
            variant="outline"
            size="icon-lg"
            className="size-11 touch-none"
            aria-label={`Flyt ${product.name}`}
            onClick={() => {
              setPlacement("position");
              setSelectedPosition(String(position + 1));
              setDialogOpen(true);
            }}
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon />
          </Button>,
        )}
      </div>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Placér {product.name}</DialogTitle>
            <DialogDescription>
              Vælg en hurtig placering eller et bestemt nummer i rækkefølgen.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`${product.id}-placement`}>
                Placering
              </FieldLabel>
              <Select
                items={[
                  { value: "first", label: "Først" },
                  { value: "last", label: "Sidst" },
                  { value: "position", label: "Bestemt placering" },
                ]}
                value={placement}
                onValueChange={(value) => value && setPlacement(value)}
              >
                <SelectTrigger
                  id={`${product.id}-placement`}
                  className="h-11 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="first">Først</SelectItem>
                    <SelectItem value="last">Sidst</SelectItem>
                    <SelectItem value="position">Bestemt placering</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {placement === "position" ? (
              <Field>
                <FieldLabel htmlFor={`${product.id}-position`}>
                  Nummer i rækkefølgen
                </FieldLabel>
                <Select
                  items={Array.from({ length: productCount }, (_, index) => ({
                    value: String(index + 1),
                    label: String(index + 1),
                  }))}
                  value={selectedPosition}
                  onValueChange={(value) => value && setSelectedPosition(value)}
                >
                  <SelectTrigger
                    id={`${product.id}-position`}
                    className="h-11 w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {Array.from({ length: productCount }, (_, index) => (
                        <SelectItem key={index} value={String(index + 1)}>
                          {index + 1}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Annuller
            </Button>
            <Button type="button" onClick={place}>
              Placér produkt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CountSkeleton() {
  return (
    <div className="grid gap-3 min-[380px]:grid-cols-2 min-[640px]:grid-cols-3 min-[1024px]:grid-cols-4 lg:gap-5 min-[1200px]:grid-cols-5 min-[1600px]:grid-cols-6 min-[1920px]:grid-cols-7 min-[2240px]:grid-cols-8">
      {Array.from({ length: 8 }, (_, index) => (
        <Card key={index} className="gap-4 py-0">
          <Skeleton className="aspect-video w-full rounded-none lg:aspect-[4/3]" />
          <CardHeader className="pb-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-11 w-full" />
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

export function CountSheet() {
  const { organizationId, locations, locationId, canRegister, now, state } =
    useCountState();
  const canManageCatalog = usePermission("catalog.manage");
  const canExport = usePermission("count.export");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [editingOrder, setEditingOrder] = useState(false);
  const [selectedUnits, setSelectedUnits] = useState<Record<string, string>>(
    {},
  );
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitReason, setSubmitReason] = useState("");
  const [defaultConfirmOpen, setDefaultConfirmOpen] = useState(false);
  const [orderBuilderOpen, setOrderBuilderOpen] = useState(false);
  const [savingDefaultOrder, setSavingDefaultOrder] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const pendingValues = useRef(new Map<string, QuantityPayload>());
  const timers = useRef(new Map<string, number>());
  const inFlight = useRef(new Map<string, Promise<null>>());
  const convex = useConvex();
  const setQuantity = useMutation(api.count.setCountQuantity);
  const submitCount = useMutation(api.count.submitCount);
  const setDefaultOrder = useMutation(api.count.setCountProductOrder);
  const savedOrder = useCountOrder(organizationId, locationId);

  const queriedQuantities = useQuery(
    api.count.getCountQuantities,
    canRegister && locationId && state?.count
      ? { locationId, countId: state.count.id }
      : "skip",
  );
  const storedQuantities = useLastDefined(
    queriedQuantities,
    state?.count?.id ?? null,
  );
  const defaultOrder = useQuery(
    api.count.getCountProductOrder,
    canRegister && locationId ? { locationId } : "skip",
  );
  const categories = useQuery(
    api.catalog.listCategoryOptions,
    canRegister ? {} : "skip",
  );
  const queriedProducts = useQuery(
    api.catalog.listActiveProducts,
    canRegister && locationId ? {} : "skip",
  ) as CountCatalogProduct[] | undefined;
  const catalogProducts = useLastDefined(
    queriedProducts,
    locationId ? "catalog" : null,
  );
  const quantities = useMemo(
    () => (state?.count ? storedQuantities : state ? [] : undefined),
    [state, storedQuantities],
  );
  const products = useMemo(() => {
    if (!catalogProducts || !quantities) return undefined;
    const byUnit = new Map(
      quantities.map((row) => [
        `${row.productId}:${row.unitId}`,
        row.quantity,
      ]),
    );
    const selectedCategoryIds =
      categoryId === "all"
        ? null
        : categoryTreeIds(categories ?? [], categoryId);
    return catalogProducts
      .filter(
        (product) =>
          (!selectedCategoryIds ||
            selectedCategoryIds.has(product.category.id)) &&
          productSearchScore(product.name, product.category.path, search) !==
            null,
      )
      .map((product) => ({
        ...product,
        units: product.units.map((unit) => ({
          ...unit,
          quantity: byUnit.get(`${product.id}:${unit.id}`) ?? 0,
        })),
      }));
  }, [catalogProducts, categories, categoryId, quantities, search]);

  useEffect(() => {
    if (!products) return;
    setOverrides((current) => {
      const next = { ...current };
      let changed = false;
      for (const product of products) {
        for (const unit of product.units) {
          const key = `${product.id}:${unit.id}`;
          if (next[key] === unit.quantity && !pendingValues.current.has(key)) {
            delete next[key];
            changed = true;
          }
        }
      }
      return changed ? next : current;
    });
  }, [products]);

  async function persistQuantity(key: string) {
    const timer = timers.current.get(key);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(key);
    const payload = pendingValues.current.get(key);
    if (!payload) return;
    pendingValues.current.delete(key);
    const request = setQuantity(payload);
    inFlight.current.set(key, request);
    try {
      await request;
    } catch (error) {
      if (!pendingValues.current.has(key)) {
        pendingValues.current.set(key, payload);
      }
      throw error;
    } finally {
      if (inFlight.current.get(key) === request) inFlight.current.delete(key);
    }
  }

  function changeQuantity(
    product: CountProduct,
    unit: CountUnit,
    quantity: number,
  ) {
    if (!locationId) return;
    const key = `${product.id}:${unit.id}`;
    setOverrides((current) => ({ ...current, [key]: quantity }));
    pendingValues.current.set(key, {
      locationId,
      productId: product.id,
      unitId: unit.id,
      quantity,
    });
    const currentTimer = timers.current.get(key);
    if (currentTimer) window.clearTimeout(currentTimer);
    timers.current.set(
      key,
      window.setTimeout(() => {
        void persistQuantity(key).catch((error) =>
          toast.error(messageFrom(error)),
        );
      }, 300),
    );
  }

  async function flushPending() {
    await Promise.all(
      [...pendingValues.current.keys()].map((key) => persistQuantity(key)),
    );
    await Promise.all(inFlight.current.values());
  }

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) {
        window.clearTimeout(timer);
      }
      for (const payload of pendingValues.current.values()) {
        void setQuantity(payload);
      }
    },
    [setQuantity],
  );

  const displayedProducts = useMemo(() => {
    if (!products) return [];
    const order = savedOrder.length ? savedOrder : (defaultOrder ?? []);
    const index = new Map(order.map((id, position) => [id, position]));
    return products
      .map((product, position) => ({ product, position }))
      .sort(
        (left, right) =>
          (index.get(left.product.id) ?? order.length + left.position) -
          (index.get(right.product.id) ?? order.length + right.position),
      )
      .map(({ product }) => product);
  }, [defaultOrder, products, savedOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragEnd(event: DragEndEvent) {
    if (
      !organizationId ||
      !locationId ||
      !event.over ||
      event.active.id === event.over.id
    ) {
      return;
    }
    const ids = displayedProducts.map((product) => product.id);
    const from = ids.indexOf(event.active.id as Id<"products">);
    const to = ids.indexOf(event.over.id as Id<"products">);
    if (from >= 0 && to >= 0) {
      setCountOrder(organizationId, locationId, arrayMove(ids, from, to));
    }
  }

  function moveProduct(productId: Id<"products">, position: number) {
    if (!organizationId || !locationId) return;
    const ids = displayedProducts.map((product) => product.id);
    const from = ids.indexOf(productId);
    if (from >= 0 && position >= 0 && position < ids.length) {
      setCountOrder(organizationId, locationId, arrayMove(ids, from, position));
    }
  }

  function rebuildOrder(order: Id<"products">[]) {
    if (!organizationId || !locationId) return;
    setCountOrder(organizationId, locationId, order);
    toast.success("Produktrækkefølgen er gemt");
  }

  async function publishDefaultOrder() {
    if (!locationId) return;
    setSavingDefaultOrder(true);
    try {
      await setDefaultOrder({
        locationId,
        productIds: displayedProducts.map((product) => product.id),
      });
      setDefaultConfirmOpen(false);
      toast.success("Standardrækkefølgen er gemt for lokationen");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSavingDefaultOrder(false);
    }
  }

  const lockedReason = !state
    ? null
    : state.count?.status === "submitted"
      ? "Optællingen er allerede registreret"
      : !state.isOpen
        ? "Optællingsvinduet er lukket"
        : null;
  const isClosed = Boolean(
    state && state.count?.status !== "submitted" && !state.isOpen,
  );
  const quantityFor = (product: CountProduct, unit: CountUnit) =>
    overrides[`${product.id}:${unit.id}`] ?? unit.quantity;
  const allQuantities = new Map(
    quantities?.map((row) => [
      `${row.productId}:${row.unitId}`,
      row.quantity,
    ]),
  );
  for (const [key, quantity] of Object.entries(overrides)) {
    allQuantities.set(key, quantity);
  }
  const hasQuantity = [...allQuantities.values()].some(
    (quantity) => quantity > 0,
  );
  const disabledReason = !locationId
    ? "Vælg en lokation"
    : !state
      ? "Optælling indlæses"
      : state.count?.status === "submitted"
        ? "Optællingen er allerede registreret"
        : !state.isOpen
          ? "Optællingsvinduet er lukket"
          : !hasQuantity
            ? "Indtast mindst én mængde"
            : null;

  async function confirmSubmit() {
    if (!locationId) return;
    if (!submitReason.trim()) {
      toast.error("Angiv en begrundelse");
      return;
    }
    setSubmitting(true);
    try {
      await flushPending();
      await submitCount({ locationId, reason: submitReason });
      setConfirmOpen(false);
      toast.success("Optællingen er registreret");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function exportWasteReport() {
    if (!state?.count?.id) return;
    setExporting(true);
    try {
      const report = await convex.query(api.onlinePos.buildCountWasteReport, {
        countId: state.count.id,
      });
      if (!report.hasBaseline) {
        toast.error("Spildrapporten kræver en tidligere registreret optælling");
        return;
      }
      if (report.rows.length === 0) {
        toast.success("Der er ingen lagerafvigelser i denne optælling");
        return;
      }
      const registeredAt = new Intl.DateTimeFormat("da-DK", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(report.submittedAt);
      const fileDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Copenhagen",
      }).format(report.submittedAt);
      downloadCsv(
        `spildrapport-${fileDate}.csv`,
        [
          "Lokation",
          "Optælling registreret",
          "Produkt",
          "Forventet beholdning før salg",
          report.salesIncluded ? "Salg" : "Salg (ikke medtaget)",
          "Optalt beholdning",
          "Spild",
          "Enhed",
        ],
        report.rows
          .toSorted((a, b) => b.wasteQuantity - a.wasteQuantity)
          .map((row) => [
            report.locationName,
            registeredAt,
            row.productName,
            String(row.expectedQuantity).replace(".", ","),
            report.salesIncluded
              ? String(row.salesQuantity).replace(".", ",")
              : "—",
            String(row.countedQuantity).replace(".", ","),
            String(row.wasteQuantity).replace(".", ","),
            row.defaultUnitName,
          ]),
      );
      toast.success("Spildrapporten er klar");
      if (!report.salesIncluded) {
        toast.warning(
          report.salesOmittedReason
            ? `OnlinePOS-salg er ikke med: ${report.salesOmittedReason}`
            : "OnlinePOS-salg er ikke med i rapporten",
        );
      }
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setExporting(false);
    }
  }

  if (!canRegister) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>Du har ikke adgang til at registrere optællinger.</AlertDescription>
      </Alert>
    );
  }

  if (!locations) return <CountSkeleton />;

  if (locations.length === 0) {
    return (
      <Empty className="min-h-80 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BoxesIcon />
          </EmptyMedia>
          <EmptyTitle>Ingen lokationer endnu</EmptyTitle>
          <EmptyDescription>
            En administrator skal oprette en lokation, før lageret kan tælles.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-28">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <InputGroup className="h-11 min-w-0 flex-1">
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setEditingOrder(false);
            }}
            placeholder="Søg efter produkter"
            aria-label="Søg efter produkter"
          />
        </InputGroup>
        {categoryId === "all" && !search ? (
          <div className="flex flex-wrap gap-2">
            {editingOrder ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={!products}
                onClick={() => setOrderBuilderOpen(true)}
              >
                <ListRestartIcon data-icon="inline-start" />
                Start forfra
              </Button>
            ) : null}
            {editingOrder && canManageCatalog ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={!products || savingDefaultOrder}
                onClick={() => setDefaultConfirmOpen(true)}
              >
                {savingDefaultOrder ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                Gør til standard
              </Button>
            ) : null}
            <Button
              type="button"
              variant={editingOrder ? "default" : "outline"}
              className="min-h-11"
              onClick={() => setEditingOrder((current) => !current)}
            >
              <GripVerticalIcon data-icon="inline-start" />
              {editingOrder ? "Afslut rækkefølge" : "Redigér rækkefølge"}
            </Button>
          </div>
        ) : null}
      </div>

      <Tabs
        value={categoryId}
        onValueChange={(value) => {
          setCategoryId(value);
          setEditingOrder(false);
        }}
        className="w-full min-w-0"
      >
        <TabsList
          aria-label="Produktkategorier"
          className="h-12 w-full justify-start overflow-x-auto overflow-y-hidden"
        >
          <TabsTrigger value="all" className="min-w-24 shrink-0 px-4">
            Alle
          </TabsTrigger>
          {categories?.map((category) => (
            <TabsTrigger
              key={category.id}
              value={category.id}
              className="min-w-28 shrink-0 px-4"
            >
              {category.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!products ? <CountSkeleton /> : null}

      {products && displayedProducts.length === 0 ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageOpenIcon />
            </EmptyMedia>
            <EmptyTitle>Ingen produkter fundet</EmptyTitle>
            <EmptyDescription>
              {search
                ? "Prøv en anden søgning."
                : "Der er ingen aktive produkter i denne kategori."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {displayedProducts.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={displayedProducts.map((product) => product.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid gap-3 min-[380px]:grid-cols-2 min-[640px]:grid-cols-3 min-[1024px]:grid-cols-4 lg:gap-5 min-[1200px]:grid-cols-5 min-[1600px]:grid-cols-6 min-[1920px]:grid-cols-7 min-[2240px]:grid-cols-8">
              {displayedProducts.map((product, position) => {
                const selectedUnitId =
                  (selectedUnits[product.id] as Id<"units"> | undefined) ??
                  product.defaultUnitId;
                const renderCard = (dragHandle?: React.ReactNode) => (
                  <ProductCard
                    product={product}
                    selectedUnitId={selectedUnitId}
                    disabledReason={lockedReason}
                    editingOrder={editingOrder}
                    dragHandle={dragHandle}
                    quantityFor={(unit) => quantityFor(product, unit)}
                    onSelectedUnitChange={(unitId) =>
                      setSelectedUnits((current) => ({
                        ...current,
                        [product.id]: unitId,
                      }))
                    }
                    onQuantityChange={(unit, quantity) =>
                      changeQuantity(product, unit, quantity)
                    }
                  />
                );
                return editingOrder ? (
                  <SortableProduct
                    key={product.id}
                    product={product}
                    position={position}
                    productCount={displayedProducts.length}
                    onMove={(nextPosition) =>
                      moveProduct(product.id, nextPosition)
                    }
                  >
                    {renderCard}
                  </SortableProduct>
                ) : (
                  <div key={product.id}>{renderCard()}</div>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      ) : null}

      <OrderBuilder
        open={orderBuilderOpen}
        products={products ?? []}
        onOpenChange={setOrderBuilderOpen}
        onSave={rebuildOrder}
      />

      <AlertDialog
        open={defaultConfirmOpen}
        onOpenChange={setDefaultConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gør rækkefølgen til standard?</AlertDialogTitle>
            <AlertDialogDescription>
              Den nuværende rækkefølge bliver standard for den valgte lokation.
              Brugere med en personlig rækkefølge beholder deres egen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingDefaultOrder}>
              Annuller
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={savingDefaultOrder}
              onClick={() => void publishDefaultOrder()}
            >
              {savingDefaultOrder ? <Spinner data-icon="inline-start" /> : null}
              Gør til standard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CountNavigation
        action={
          <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
            {isClosed && state ? (
              <Badge
                variant="secondary"
                className="h-auto max-w-36 justify-end py-1 text-right whitespace-normal sm:max-w-none sm:whitespace-nowrap"
              >
                <LockKeyholeIcon data-icon="inline-start" />
                <span>
                  <span className="hidden lg:inline">Optællingen er låst · </span>
                  Åbner om {countdown(state.opensAt, now)}
                </span>
              </Badge>
            ) : null}
            {state?.count?.status === "submitted" && canExport ? (
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="min-h-11 shrink-0 px-4 sm:px-6"
                disabled={exporting}
                onClick={() => void exportWasteReport()}
              >
                {exporting ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <DownloadIcon data-icon="inline-start" />
                )}
                Eksportér spild
              </Button>
            ) : (
              <UnavailableTooltip reason={disabledReason}>
                <Button
                  type="button"
                  size="lg"
                  className="min-h-11 shrink-0 px-4 sm:px-6"
                  disabled={Boolean(disabledReason) || submitting}
                  onClick={() => {
                    setSubmitReason("");
                    setConfirmOpen(true);
                  }}
                >
                  {submitting ? <Spinner data-icon="inline-start" /> : null}
                  Registrér optælling
                </Button>
              </UnavailableTooltip>
            )}
          </div>
        }
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrér optælling?</AlertDialogTitle>
            <AlertDialogDescription>
              Lageret overskrives for de produkter, der har en mængde i denne
              optælling. Produkter uden en mængde beholder deres nuværende lager.
              Denne optælling kan ikke ændres bagefter. Skriv en begrundelse for
              lagerafstemningen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="count-submit-reason">Begrundelse</FieldLabel>
            <Textarea
              id="count-submit-reason"
              value={submitReason}
              onChange={(event) => setSubmitReason(event.target.value)}
              placeholder="Skriv, hvorfor optællingen registreres"
              required
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>
              Fortsæt optælling
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting || !submitReason.trim()}
              onClick={() => void confirmSubmit()}
            >
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              Registrér optælling
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
