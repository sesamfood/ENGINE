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
import { useMutation, useQuery } from "convex/react";
import {
  BoxesIcon,
  GripVerticalIcon,
  MinusIcon,
  PackageOpenIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CountNavigation } from "@/components/count/count-navigation";
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
import { authClient } from "@/lib/auth-client";
import {
  setCountOrder,
  useCountLocation,
  useCountOrder,
} from "@/lib/count-prefs";
import { cn } from "@/lib/utils";

type CountUnit = {
  id: Id<"units">;
  name: string;
  factorToDefault: number;
  quantity: number;
};

type CountProduct = {
  id: Id<"products">;
  name: string;
  category: { id: Id<"categories">; name: string } | null;
  imageUrl: string | null;
  defaultUnitId: Id<"units">;
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
  const disabled = Boolean(disabledReason);
  const selectedUnit =
    product.units.find((unit) => unit.id === selectedUnitId) ??
    product.units[0];
  const unitItems = product.units.map((unit) => ({
    value: unit.id,
    label: unit.name,
  }));
  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        if (!open || (!disabled && !editingOrder)) setDialogOpen(open);
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
        <UnavailableTooltip reason={editingOrder ? null : disabledReason}>
          <div className="relative">
            {product.imageUrl ? (
              <div
                role="img"
                aria-label={`Produktbillede af ${product.name}`}
                className="aspect-video w-full bg-muted bg-cover bg-center lg:aspect-[4/3]"
                style={{ backgroundImage: `url("${product.imageUrl}")` }}
              />
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
                  {product.name}
                </CardTitle>
                <CardDescription className="max-w-[45%] shrink-0 truncate">
                  {product.category?.name ?? "Uden kategori"}
                </CardDescription>
              </div>
              {editingOrder ? <CardAction>{dragHandle}</CardAction> : null}
            </CardHeader>
            {!editingOrder ? (
              <button
                type="button"
                data-card-trigger
                className="absolute inset-0 cursor-pointer rounded-t-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed"
                aria-label={`Tæl ${product.name} i flere enheder`}
                disabled={disabled}
                onClick={() => setDialogOpen(true)}
              />
            ) : null}
          </div>
        </UnavailableTooltip>
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
                    <SelectTrigger className="h-11 w-full">
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
              </>
            ) : null}
        </CardContent>
      </Card>

      <DialogContent className="sm:max-w-lg">
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
                  quantity={quantityFor(unit)}
                  disabled={disabled}
                  onChange={(quantity) => onQuantityChange(unit, quantity)}
                />
              </div>
            </Field>
          ))}
        </FieldGroup>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}

function SortableProduct({
  product,
  children,
}: {
  product: CountProduct;
  children: (dragHandle: React.ReactNode) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: product.id });

  return (
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
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon />
        </Button>,
      )}
    </div>
  );
}

function CountSkeleton() {
  return (
    <div className="grid gap-3 min-[380px]:grid-cols-2 sm:grid-cols-3 lg:gap-5 xl:grid-cols-4">
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
  const organization = authClient.useActiveOrganization();
  const organizationId = organization.data?.id;
  const storedLocationId = useCountLocation(organizationId);
  const savedOrder = useCountOrder(organizationId);
  const [now, setNow] = useState(() => Date.now());
  const [search, setSearch] = useState("");
  const [querySearch, setQuerySearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [editingOrder, setEditingOrder] = useState(false);
  const [selectedUnits, setSelectedUnits] = useState<Record<string, string>>(
    {},
  );
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const pendingValues = useRef(new Map<string, QuantityPayload>());
  const timers = useRef(new Map<string, number>());
  const inFlight = useRef(new Map<string, Promise<null>>());
  const setQuantity = useMutation(api.count.setCountQuantity);
  const submitCount = useMutation(api.count.submitCount);
  const locations = useQuery(api.locations.listLocationOptions);
  const locationId = locations?.some(
    (location) => location.id === storedLocationId,
  )
    ? (storedLocationId as Id<"locations">)
    : null;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setQuerySearch(search), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  const queryNow = Math.floor(now / 60_000) * 60_000;
  const state = useQuery(
    api.count.getCountState,
    locationId ? { locationId, now: queryNow } : "skip",
  );
  const categories = useQuery(api.catalog.listCategories);
  const products = useQuery(
    api.count.listCountProducts,
    locationId
      ? {
          locationId,
          now: queryNow,
          categoryId:
            categoryId === "all"
              ? undefined
              : (categoryId as Id<"categories">),
          search: querySearch,
        }
      : "skip",
  ) as CountProduct[] | undefined;

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
    const index = new Map(savedOrder.map((id, position) => [id, position]));
    return products
      .map((product, position) => ({ product, position }))
      .sort(
        (left, right) =>
          (index.get(left.product.id) ?? savedOrder.length + left.position) -
          (index.get(right.product.id) ?? savedOrder.length + right.position),
      )
      .map(({ product }) => product);
  }, [products, savedOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    if (!organizationId || !event.over || event.active.id === event.over.id) {
      return;
    }
    const ids = displayedProducts.map((product) => product.id);
    const from = ids.indexOf(event.active.id as Id<"products">);
    const to = ids.indexOf(event.over.id as Id<"products">);
    if (from >= 0 && to >= 0) {
      setCountOrder(organizationId, arrayMove(ids, from, to));
    }
  }

  const locked = !state?.isOpen || state.count?.status === "submitted";
  const lockedReason = !state
    ? null
    : state.count?.status === "submitted"
      ? "Count er allerede registreret"
      : !state.isOpen
        ? "Count-vinduet er lukket"
        : null;
  const quantityFor = (product: CountProduct, unit: CountUnit) =>
    overrides[`${product.id}:${unit.id}`] ?? unit.quantity;
  const hasQuantity =
    (state?.countedProducts ?? 0) > 0 ||
    displayedProducts.some((product) =>
      product.units.some((unit) => quantityFor(product, unit) > 0),
    );
  const disabledReason = !locationId
    ? "Vælg en location"
    : !state
      ? "Count indlæses"
      : state.count?.status === "submitted"
        ? "Count er allerede registreret"
        : !state.isOpen
          ? "Count-vinduet er lukket"
          : !hasQuantity
            ? "Indtast mindst én mængde"
            : null;

  async function confirmSubmit() {
    if (!locationId) return;
    setSubmitting(true);
    try {
      await flushPending();
      await submitCount({ locationId });
      setConfirmOpen(false);
      toast.success("Count er registreret");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (!locations) return <CountSkeleton />;

  if (locations.length === 0) {
    return (
      <Empty className="min-h-80 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BoxesIcon />
          </EmptyMedia>
          <EmptyTitle>Ingen locations endnu</EmptyTitle>
          <EmptyDescription>
            En administrator skal oprette en location, før lageret kan tælles.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-7 pb-28">
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
          <UnavailableTooltip reason={lockedReason}>
            <Button
              type="button"
              variant={editingOrder ? "default" : "outline"}
              className="min-h-11"
              disabled={locked}
              onClick={() => setEditingOrder((current) => !current)}
            >
              <GripVerticalIcon data-icon="inline-start" />
              {editingOrder ? "Afslut rækkefølge" : "Redigér rækkefølge"}
            </Button>
          </UnavailableTooltip>
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
            <div className="grid gap-3 min-[380px]:grid-cols-2 sm:grid-cols-3 lg:gap-5 xl:grid-cols-4">
              {displayedProducts.map((product) => {
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
                  <SortableProduct key={product.id} product={product}>
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

      <CountNavigation
        action={
          <UnavailableTooltip reason={disabledReason}>
            <Button
              type="button"
              size="lg"
              className="min-h-11 shrink-0 px-4 sm:px-6"
              disabled={Boolean(disabledReason) || submitting}
              onClick={() => setConfirmOpen(true)}
            >
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              Registrér count
            </Button>
          </UnavailableTooltip>
        }
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrér count?</AlertDialogTitle>
            <AlertDialogDescription>
              Lageret overskrives for de produkter, der har en mængde i denne
              count. Produkter uden en mængde beholder deres nuværende lager.
              Denne count kan ikke ændres bagefter.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>
              Fortsæt count
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={() => void confirmSubmit()}
            >
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              Registrér count
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
