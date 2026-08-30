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
import usePresence from "@convex-dev/presence/react";
import { useConvex, useMutation, useQuery } from "convex/react";
import {
  BoxesIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
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
  CardAction,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { usePermission } from "@/components/app-shell";
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
  countAreaId: Id<"countAreas"> | null;
  productId: Id<"products">;
  unitId: Id<"units">;
  quantity: number;
};

type CountViewMode = "all" | "single";

function quantityKey(
  locationId: Id<"locations"> | null,
  countAreaId: Id<"countAreas"> | null,
  productId: Id<"products">,
  unitId: Id<"units">,
) {
  return `${locationId ?? "no-location"}:${countAreaId ?? "location"}:${productId}:${unitId}`;
}

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

function CountOpenCountdown({ target }: { target: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return <>Åbner om {countdown(target, now)}</>;
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
        aria-label={`Reducér ${productName} i ${unitName}`}
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
                  onValueChange={(value) => {
                    const unitId = product.units.find(
                      (unit) => unit.id === value,
                    )?.id;
                    if (unitId) onSelectedUnitChange(unitId);
                  }}
                  disabled={disabled}
                >
                  <SelectTrigger
                    aria-label={`Enhed for ${product.name}`}
                    className="h-11! w-full"
                  >
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
              Annullér
            </Button>
            <Button type="submit">Bekræft</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SingleProductCounter({
  product,
  position,
  productCount,
  disabledReason,
  quantityFor,
  onQuantityChange,
  onPrevious,
  onNext,
  onComplete,
  completionPending = false,
}: {
  product: CountProduct;
  position: number;
  productCount: number;
  disabledReason: string | null;
  quantityFor: (unit: CountUnit) => number;
  onQuantityChange: (unit: CountUnit, quantity: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onComplete?: () => void;
  completionPending?: boolean;
}) {
  const disabled = Boolean(disabledReason);
  const previousDisabled = position <= 0;
  const isLastProduct = position >= productCount - 1;
  const nextDisabled =
    completionPending || (isLastProduct && !onComplete);

  function goToNext() {
    if (isLastProduct) {
      onComplete?.();
      return;
    }
    onNext();
  }

  return (
    <div className="flex min-h-[32rem] flex-col gap-3 md:grid md:min-h-[calc(100svh-20rem)] md:grid-cols-[3rem_minmax(0,1fr)_3rem] md:items-center md:gap-4">
      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        className="hidden size-12 rounded-full md:inline-flex"
        aria-label="Forrige Produkt"
        disabled={previousDisabled}
        onClick={onPrevious}
      >
        <ChevronLeftIcon />
      </Button>

      <Card
        key={product.id}
        className="h-full min-h-0 gap-0 py-0 animate-in fade-in-0 zoom-in-95 duration-200 motion-reduce:animate-none"
      >
        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
          <div className="relative min-h-56 overflow-hidden bg-muted lg:min-h-full">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={`Produktbillede af ${product.name}`}
                fill
                loading="eager"
                sizes="(max-width: 1023px) 100vw, 50vw"
                className="object-cover"
              />
            ) : (
              <div className="flex size-full min-h-56 items-center justify-center text-muted-foreground">
                <PackageOpenIcon className="size-16" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-col">
            <CardHeader className="gap-3 px-5 py-5 sm:px-8 sm:py-7">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant="secondary" aria-live="polite">
                  {position + 1} af {productCount}
                </Badge>
                <CardDescription>{product.category.name}</CardDescription>
              </div>
              <CardTitle className="text-3xl leading-tight tracking-tight sm:text-4xl">
                {product.name}
              </CardTitle>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col justify-center px-5 pb-6 sm:px-8 sm:pb-8">
              <FieldGroup className="gap-3">
                {product.units.map((unit) => (
                  <Field
                    key={unit.id}
                    orientation="responsive"
                    data-disabled={disabled}
                    className="rounded-lg border bg-background p-3 @md/field-group:items-center"
                  >
                    <FieldLabel className="text-base font-medium @md/field-group:min-w-24">
                      {unit.name}
                    </FieldLabel>
                    <UnavailableTooltip reason={disabledReason}>
                      <div className="w-full @md/field-group:w-64">
                        <QuantityControl
                          productName={product.name}
                          unitName={unit.name}
                          quantity={quantityFor(unit)}
                          disabled={disabled}
                          onChange={(quantity) =>
                            onQuantityChange(unit, quantity)
                          }
                        />
                      </div>
                    </UnavailableTooltip>
                  </Field>
                ))}
              </FieldGroup>
            </CardContent>
          </div>
        </div>
      </Card>

      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        className="hidden size-12 rounded-full md:inline-flex"
        aria-label={
          completionPending
            ? "Markerer Bar som færdig"
            : isLastProduct && onComplete
              ? "Markér Bar som færdig"
              : "Næste Produkt"
        }
        disabled={nextDisabled}
        onClick={goToNext}
      >
        {completionPending ? <Spinner /> : <ChevronRightIcon />}
      </Button>

      <div className="flex gap-3 md:hidden">
        <Button
          type="button"
          variant="outline"
          className="min-h-12 flex-1"
          disabled={previousDisabled}
          onClick={onPrevious}
        >
          <ChevronLeftIcon data-icon="inline-start" />
          Forrige
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-12 flex-1"
          disabled={nextDisabled}
          onClick={goToNext}
        >
          {completionPending ? (
            <>
              <Spinner data-icon="inline-start" />
              Gemmer
            </>
          ) : (
            <>
              {isLastProduct && onComplete ? "Færdig" : "Næste"}
              <ChevronRightIcon data-icon="inline-end" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

type CountAreaStatusKind =
  | "complete"
  | "active"
  | "paused"
  | "empty"
  | "notStarted";

function CountAreaStatusBadge({
  kind,
  label,
}: {
  kind: CountAreaStatusKind;
  label: string;
}) {
  const variant =
    kind === "complete"
      ? "success"
      : kind === "active"
        ? "info"
        : kind === "paused"
          ? "paused"
          : "secondary";
  const tooltip =
    kind === "active"
      ? "En bruger tæller nu."
      : kind === "paused"
        ? "Ingen tæller lige nu."
        : null;

  if (!tooltip) {
    return (
      <Badge variant={variant} aria-live="polite">
        {kind === "complete" ? <CheckIcon aria-hidden="true" /> : null}
        {label}
      </Badge>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        closeOnClick={false}
        render={
          <Badge
            variant={variant}
            tabIndex={0}
            aria-label={`${label}. ${tooltip}`}
            aria-live="polite"
          />
        }
      >
        {label}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function CountAreaPresence({
  countAreaId,
}: {
  countAreaId: Id<"countAreas">;
}) {
  usePresence(api.presence, countAreaId, "counter", 10_000);
  return null;
}

function CountAreaPicker({
  countAreas,
  completedCountAreaIds,
  countAreaProgress,
  activeCountAreaIds,
  onSelect,
}: {
  countAreas: ReadonlyArray<{
    id: Id<"countAreas">;
    name: string;
    productIds: ReadonlyArray<Id<"products">>;
  }>;
  completedCountAreaIds: ReadonlyArray<Id<"countAreas">>;
  countAreaProgress: ReadonlyArray<{
    countAreaId: Id<"countAreas">;
    countedProductIds: ReadonlyArray<Id<"products">>;
  }>;
  activeCountAreaIds: ReadonlyArray<Id<"countAreas">>;
  onSelect: (countAreaId: Id<"countAreas">) => void;
}) {
  const completedIds = new Set(completedCountAreaIds);
  const activeIds = new Set(activeCountAreaIds);
  const progressByArea = new Map(
    countAreaProgress.map((progress) => [progress.countAreaId, progress]),
  );
  const completedCount = countAreas.filter((countArea) =>
    completedIds.has(countArea.id),
  ).length;

  return (
    <section
      aria-labelledby="count-area-picker-title"
      className="flex min-h-96 flex-col gap-6 md:min-h-[calc(100svh-15rem)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2
          id="count-area-picker-title"
          className="text-2xl font-semibold tracking-tight"
        >
          Vælg en Bar
        </h2>
        <Badge variant="outline" aria-live="polite">
          {completedCount} af {countAreas.length} færdige
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {countAreas.map((countArea) => {
          const completed = completedIds.has(countArea.id);
          const progress = progressByArea.get(countArea.id);
          const productIds = new Set(countArea.productIds);
          const countedProductCount =
            progress?.countedProductIds.filter((productId) =>
              productIds.has(productId),
            ).length ?? 0;
          const statusKind = completed
            ? "complete"
            : countArea.productIds.length === 0
              ? "empty"
              : activeIds.has(countArea.id)
                ? "active"
                : progress
                  ? "paused"
                  : "notStarted";
          const status =
            statusKind === "complete"
              ? "Færdig"
              : statusKind === "empty"
                ? "Ingen Produkter"
                : statusKind === "notStarted"
                  ? "Ikke startet"
                  : `${countedProductCount}/${countArea.productIds.length} optalt`;
          return (
            <Card
              key={countArea.id}
              size="sm"
              className={cn(
                "relative min-h-24 transition-shadow has-[button:hover]:shadow-sm",
                statusKind === "complete"
                  ? "bg-success/5 ring-success/30"
                  : statusKind === "active"
                    ? "bg-info/5 ring-info/30"
                    : statusKind === "paused" &&
                      "bg-paused/5 ring-paused/30",
              )}
            >
              <CardHeader className="flex-1">
                <CardTitle>{countArea.name}</CardTitle>
                <CardAction
                  className={cn(
                    (statusKind === "active" || statusKind === "paused") &&
                      "relative z-10",
                  )}
                >
                  <CountAreaStatusBadge kind={statusKind} label={status} />
                </CardAction>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span>
                  {statusKind === "complete"
                    ? "Åbn Count"
                    : statusKind === "active" || statusKind === "paused"
                      ? "Fortsæt Count"
                      : "Start Count"}
                </span>
                <ChevronRightIcon
                  className="size-5 text-muted-foreground"
                  aria-hidden="true"
                />
              </CardContent>
              <button
                type="button"
                className="absolute inset-0 cursor-pointer rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                aria-label={`Vælg ${countArea.name}`}
                onClick={() => onSelect(countArea.id)}
              />
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function OrderBuilder({
  open,
  products,
  appendUnselected,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  products: CountProduct[];
  appendUnselected: boolean;
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
      ...(appendUnselected
        ? products
            .filter((product) => !selected.has(product.id))
            .map((product) => product.id)
        : []),
    ]);
    close(false);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Start forfra med rækkefølgen</DialogTitle>
          <DialogDescription>
            {appendUnselected
              ? "Vælg Produkterne i den rækkefølge, de skal vises. Produkter, du ikke vælger, placeres til sidst."
              : "Vælg de Produkter, der skal tælles i denne Bar, og angiv deres rækkefølge."}
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
            Annullér
          </Button>
          <Button type="button" onClick={save}>
            Anvend rækkefølge
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
              Annullér
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
  const { locations, locationId, canRegister, state } = useCountState();
  const canManageLocations = usePermission("locations.manage");
  const canExport = usePermission("count.export");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [editingOrderContext, setEditingOrderContext] = useState<string | null>(
    null,
  );
  const [selectedCountAreaId, setSelectedCountAreaId] =
    useState<Id<"countAreas"> | null>(null);
  const [selectedUnits, setSelectedUnits] = useState<
    Record<string, Id<"units">>
  >({});
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<CountViewMode>("single");
  const [singleProductSelection, setSingleProductSelection] = useState<{
    key: string;
    index: number;
  }>({ key: "", index: 0 });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitReason, setSubmitReason] = useState("");
  const [orderBuilderOpen, setOrderBuilderOpen] = useState(false);
  const [orderDraft, setOrderDraft] = useState<Id<"products">[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [completingCountAreaId, setCompletingCountAreaId] =
    useState<Id<"countAreas"> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const pendingValues = useRef(new Map<string, QuantityPayload>());
  const timers = useRef(new Map<string, number>());
  const inFlight = useRef(new Map<string, Promise<null>>());
  const convex = useConvex();
  const setQuantity = useMutation(api.count.setCountQuantity);
  const startCountArea = useMutation(api.count.startCountArea);
  const markCountAreaProductCounted = useMutation(
    api.count.markCountAreaProductCounted,
  );
  const completeCountArea = useMutation(api.count.completeCountArea);
  const submitCount = useMutation(api.count.submitCount);
  const setProductOrder = useMutation(api.countAreas.setProductOrder);

  const queriedCountAreas = useQuery(
    api.countAreas.listForCount,
    canRegister && locationId ? { locationId } : "skip",
  );
  const countAreas = queriedCountAreas;
  const activeCountAreaIds = useQuery(
    api.presence.listActiveCountAreas,
    canRegister && locationId ? { locationId } : "skip",
  );
  const activeCountAreaId =
    countAreas?.find((area) => area.id === selectedCountAreaId)?.id ?? null;
  const countAreaSelectionReady =
    countAreas !== undefined &&
    (countAreas.length === 0 || activeCountAreaId !== null);
  const countContextKey = `${locationId ?? ""}:${activeCountAreaId ?? "location"}`;
  const editingOrder = editingOrderContext === countContextKey;

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
  const queriedProductOrder = useQuery(
    api.countAreas.getProductOrder,
    canRegister && locationId && countAreaSelectionReady
      ? { locationId, countAreaId: activeCountAreaId }
      : "skip",
  );
  const productOrder = useLastDefined(
    queriedProductOrder,
    canRegister && locationId && countAreaSelectionReady
      ? `${locationId}:${activeCountAreaId ?? "location"}`
      : null,
  );
  const categories = useQuery(
    api.catalog.listCategoryOptions,
    canRegister ? {} : "skip",
  );
  const queriedProducts = useQuery(
    api.count.listCatalog,
    canRegister && locationId && countAreaSelectionReady
      ? { locationId }
      : "skip",
  );
  const catalogProducts = useLastDefined(
    queriedProducts,
    canRegister && locationId && countAreaSelectionReady ? locationId : null,
  );
  const quantities = useMemo(
    () => (state?.count ? storedQuantities : state ? [] : undefined),
    [state, storedQuantities],
  );
  const products = useMemo(() => {
    if (
      !catalogProducts ||
      !quantities ||
      !countAreaSelectionReady ||
      productOrder === undefined
    ) {
      return undefined;
    }
    const byUnit = new Map(
      quantities.map((row) => [
        quantityKey(locationId, row.countAreaId, row.productId, row.unitId),
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
          editingOrder ||
          viewMode === "single" ||
          ((!selectedCategoryIds ||
            selectedCategoryIds.has(product.category.id)) &&
            productSearchScore(product.name, product.category.path, search) !==
              null),
      )
      .map((product) => ({
        ...product,
        units: product.units.map((unit) => ({
          ...unit,
          quantity:
            byUnit.get(
              quantityKey(locationId, activeCountAreaId, product.id, unit.id),
            ) ?? 0,
        })),
      }));
  }, [
    activeCountAreaId,
    catalogProducts,
    categories,
    categoryId,
    countAreaSelectionReady,
    editingOrder,
    locationId,
    productOrder,
    quantities,
    search,
    viewMode,
  ]);

  useEffect(() => {
    if (!products) return;
    setOverrides((current) => {
      const next = { ...current };
      let changed = false;
      for (const product of products) {
        for (const unit of product.units) {
          const key = quantityKey(
            locationId,
            activeCountAreaId,
            product.id,
            unit.id,
          );
          if (next[key] === unit.quantity && !pendingValues.current.has(key)) {
            delete next[key];
            changed = true;
          }
        }
      }
      return changed ? next : current;
    });
  }, [activeCountAreaId, locationId, products]);

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
      if (
        !pendingValues.current.has(key) &&
        inFlight.current.get(key) === request
      ) {
        setOverrides((current) => {
          if (!(key in current)) return current;
          const next = { ...current };
          delete next[key];
          return next;
        });
      }
    } catch (error) {
      if (
        !pendingValues.current.has(key) &&
        inFlight.current.get(key) === request
      ) {
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
    const key = quantityKey(
      locationId,
      activeCountAreaId,
      product.id,
      unit.id,
    );
    setOverrides((current) => ({ ...current, [key]: quantity }));
    pendingValues.current.set(key, {
      locationId,
      countAreaId: activeCountAreaId,
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

  const serverOrderedProducts = useMemo(() => {
    if (!products || !productOrder) return [];
    const byId = new Map(products.map((product) => [product.id, product]));
    if (activeCountAreaId) {
      return productOrder
        .map((productId) => byId.get(productId))
        .filter((product): product is CountProduct => product !== undefined);
    }
    const index = new Map(productOrder.map((id, position) => [id, position]));
    return products
      .map((product, position) => ({ product, position }))
      .sort(
        (left, right) =>
          (index.get(left.product.id) ?? productOrder.length + left.position) -
          (index.get(right.product.id) ?? productOrder.length + right.position),
      )
      .map(({ product }) => product);
  }, [activeCountAreaId, productOrder, products]);

  const displayedProducts = useMemo(() => {
    if (!editingOrder || !orderDraft) return serverOrderedProducts;
    const byId = new Map(products?.map((product) => [product.id, product]));
    if (activeCountAreaId) {
      return orderDraft
        .map((productId) => byId.get(productId))
        .filter((product): product is CountProduct => product !== undefined);
    }
    const draftIds = new Set(orderDraft);
    return [
      ...orderDraft
        .map((productId) => byId.get(productId))
        .filter((product): product is CountProduct => product !== undefined),
      ...(products ?? []).filter((product) => !draftIds.has(product.id)),
    ];
  }, [
    activeCountAreaId,
    editingOrder,
    orderDraft,
    products,
    serverOrderedProducts,
  ]);

  const productListKey = `${locationId ?? ""}:${activeCountAreaId ?? "location"}:${displayedProducts.map((product) => product.id).join(",")}`;
  const countedProductIds = new Set(
    state?.count?.countAreaProgress.find(
      (progress) => progress.countAreaId === activeCountAreaId,
    )?.countedProductIds ?? [],
  );
  const firstUncountedProductIndex = displayedProducts.findIndex(
    (product) => !countedProductIds.has(product.id),
  );
  const resumeProductIndex =
    firstUncountedProductIndex >= 0
      ? firstUncountedProductIndex
      : Math.max(0, displayedProducts.length - 1);
  const singleProductIndex =
    singleProductSelection.key === productListKey
      ? Math.min(
          singleProductSelection.index,
          Math.max(0, displayedProducts.length - 1),
        )
      : resumeProductIndex;

  function moveSingleProduct(delta: number) {
    setSingleProductSelection((current) => {
      const currentIndex =
        current.key === productListKey ? current.index : resumeProductIndex;
      return {
        key: productListKey,
        index: Math.max(
          0,
          Math.min(displayedProducts.length - 1, currentIndex + delta),
        ),
      };
    });
  }

  function selectCountArea(countAreaId: Id<"countAreas">) {
    setSelectedCountAreaId(countAreaId);
    setSingleProductSelection({ key: "", index: 0 });
    if (!locationId || lockedReason) return;
    void startCountArea({ locationId, countAreaId }).catch((error) =>
      toast.error(messageFrom(error)),
    );
  }

  function returnToCountAreaPicker() {
    setSelectedCountAreaId(null);
    setSingleProductSelection({ key: "", index: 0 });
  }

  const singleProduct = displayedProducts[singleProductIndex];

  async function markProductCounted(productId: Id<"products">) {
    if (!locationId || !activeCountAreaId) return;
    await markCountAreaProductCounted({
      locationId,
      countAreaId: activeCountAreaId,
      productId,
    });
  }

  function advanceSingleProduct() {
    if (!singleProduct) return;
    void markProductCounted(singleProduct.id).catch((error) =>
      toast.error(messageFrom(error)),
    );
    moveSingleProduct(1);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragEnd(event: DragEndEvent) {
    if (!editingOrder || !event.over || event.active.id === event.over.id) {
      return;
    }
    const ids = displayedProducts.map((product) => product.id);
    const from = ids.findIndex((id) => id === event.active.id);
    const to = ids.findIndex((id) => id === event.over?.id);
    if (from >= 0 && to >= 0) {
      setOrderDraft(arrayMove(ids, from, to));
    }
  }

  function moveProduct(productId: Id<"products">, position: number) {
    if (!editingOrder) return;
    const ids = displayedProducts.map((product) => product.id);
    const from = ids.indexOf(productId);
    if (from >= 0 && position >= 0 && position < ids.length) {
      setOrderDraft(arrayMove(ids, from, position));
    }
  }

  function rebuildOrder(order: Id<"products">[]) {
    setOrderDraft(order);
  }

  function startEditingOrder() {
    if (!catalogProducts || !productOrder) return;
    const catalogProductIds = catalogProducts.map((product) => product.id);
    const catalogProductIdSet = new Set(catalogProductIds);
    const orderedIds = productOrder.filter((productId) =>
      catalogProductIdSet.has(productId),
    );
    const orderedIdSet = new Set(orderedIds);
    const nextOrder = activeCountAreaId
      ? orderedIds
      : [
          ...orderedIds,
          ...catalogProductIds.filter(
            (productId) => !orderedIdSet.has(productId),
          ),
        ];
    setViewMode("all");
    setOrderDraft(nextOrder);
    setEditingOrderContext(countContextKey);
  }

  function cancelEditingOrder() {
    setEditingOrderContext(null);
    setOrderDraft(null);
    setOrderBuilderOpen(false);
  }

  async function saveOrder() {
    if (!locationId || !orderDraft || !countAreaSelectionReady) return;
    setSavingOrder(true);
    try {
      await setProductOrder({
        locationId,
        countAreaId: activeCountAreaId,
        productIds: orderDraft,
      });
      toast.success("Produktrækkefølgen er gemt");
      cancelEditingOrder();
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSavingOrder(false);
    }
  }

  const lockedReason = !state
    ? null
    : state.count?.status === "submitted"
      ? "Count er allerede registreret"
      : !state.isOpen
        ? "Count-vinduet er lukket"
        : null;

  async function finishCurrentCountArea() {
    if (
      !locationId ||
      !activeCountAreaId ||
      !singleProduct ||
      completingCountAreaId
    ) {
      return;
    }
    if (lockedReason) {
      returnToCountAreaPicker();
      return;
    }
    const countAreaId = activeCountAreaId;
    setCompletingCountAreaId(countAreaId);
    try {
      await flushPending();
      await markProductCounted(singleProduct.id);
      await completeCountArea({ locationId, countAreaId });
      returnToCountAreaPicker();
      toast.success("Baren er markeret som færdig");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setCompletingCountAreaId(null);
    }
  }

  const isClosed = Boolean(
    state && state.count?.status !== "submitted" && !state.isOpen,
  );
  const quantityFor = (product: CountProduct, unit: CountUnit) =>
    overrides[
      quantityKey(locationId, activeCountAreaId, product.id, unit.id)
    ] ??
    unit.quantity;
  const allQuantities = new Map(
    quantities?.map((row) => [
      quantityKey(locationId, row.countAreaId, row.productId, row.unitId),
      row.quantity,
    ]),
  );
  const currentLocationPrefix = `${locationId ?? "no-location"}:`;
  for (const [key, quantity] of Object.entries(overrides)) {
    if (!key.startsWith(currentLocationPrefix)) continue;
    allQuantities.set(key, quantity);
  }
  const hasQuantity = [...allQuantities.values()].some(
    (quantity) => quantity > 0,
  );
  const disabledReason = !locationId
    ? "Vælg en lokation"
    : countAreas === undefined
      ? "Barer indlæses"
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
    if (!submitReason.trim()) {
      toast.error("Angiv en begrundelse");
      return;
    }
    setSubmitting(true);
    try {
      await flushPending();
      await submitCount({ locationId, reason: submitReason });
      setConfirmOpen(false);
      toast.success("Count er registreret");
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
      const report = await convex.query(api.countSales.buildCountWasteReport, {
        countId: state.count.id,
      });
      if (!report.hasBaseline) {
        toast.error("Waste-rapporten kræver en tidligere registreret Count");
        return;
      }
      if (report.combinedWarning) {
        toast.warning(report.combinedWarning);
      }
      if (report.unmappedSalesQuantity > 0) {
        toast.warning(
          `Wolt-salg på ${String(report.unmappedSalesQuantity).replace(".", ",")} enheder kunne ikke kobles til et Produkt.`,
        );
      }
      const selectedHealth =
        report.salesSource === "combined"
          ? [report.sourceHealth.onlinePos, report.sourceHealth.wolt]
          : [
              report.salesSource === "onlinePos"
                ? report.sourceHealth.onlinePos
                : report.sourceHealth.wolt,
            ];
      if (
        report.salesIncluded &&
        selectedHealth.some((health) => health.freshnessAt === null)
      ) {
        toast.warning(
          "Den valgte salgskilde har ingen registreret seneste synkronisering.",
        );
      }
      if (!report.salesIncluded && report.salesOmittedReason) {
        toast.warning(
          `Salg fra den valgte kilde er ikke med: ${report.salesOmittedReason}`,
        );
      }
      if (report.rows.length === 0) {
        toast.success("Der er ingen lagerafvigelser i denne Count");
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
        `waste-rapport-${fileDate}.csv`,
        [
          "Lokation",
          "Count registreret",
          "Produkt",
          "Forventet beholdning før salg",
          report.salesIncluded ? "Salg" : "Salg (ikke medtaget)",
          "Optalt beholdning",
          "Waste",
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
      toast.success("Waste-rapporten er klar");
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
        <AlertDescription>
          Du har ikke adgang til at registrere Counts.
        </AlertDescription>
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
            En bruger med rollen Administrator skal oprette en lokation, før
            lageret kan tælles.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const countAreaSelectionPending = Boolean(
    countAreas && countAreas.length > 0 && !activeCountAreaId,
  );
  const emptyBarOrder = Boolean(
    activeCountAreaId &&
    productOrder &&
    productOrder.length === 0 &&
    catalogProducts?.length,
  );

  return (
    <div className="flex flex-col gap-4 pb-28">
      {activeCountAreaId && state && !lockedReason ? (
        <CountAreaPresence countAreaId={activeCountAreaId} />
      ) : null}
      {countAreaSelectionPending && countAreas ? (
        <CountAreaPicker
          countAreas={countAreas}
          completedCountAreaIds={
            state?.count?.completedCountAreaIds ?? []
          }
          countAreaProgress={state?.count?.countAreaProgress ?? []}
          activeCountAreaIds={activeCountAreaIds ?? []}
          onSelect={selectCountArea}
        />
      ) : (
        <>
          {!editingOrder ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <ToggleGroup
                value={[viewMode]}
                onValueChange={(value) => {
                  const nextMode = value[0];
                  if (nextMode === "all" || nextMode === "single") {
                    setViewMode(nextMode);
                  }
                }}
                variant="outline"
                spacing={0}
                aria-label="Produktvisning"
                className="w-full sm:w-fit"
              >
                <ToggleGroupItem
                  value="single"
                  className="min-h-11 flex-1 sm:flex-none"
                >
                  Ét Produkt ad gangen
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="all"
                  className="min-h-11 flex-1 sm:flex-none"
                >
                  Alle Produkter
                </ToggleGroupItem>
              </ToggleGroup>
              <div className="ml-auto flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                {countAreas && countAreas.length > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={returnToCountAreaPicker}
                  >
                    <ChevronLeftIcon data-icon="inline-start" />
                    Vælg en anden Bar
                  </Button>
                ) : null}
                {canManageLocations ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={!products || !productOrder || !catalogProducts}
                    onClick={startEditingOrder}
                  >
                    <GripVerticalIcon data-icon="inline-start" />
                    Redigér rækkefølge
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {viewMode === "all" || editingOrder ? (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <InputGroup className="h-11 min-w-0 flex-1">
                  <InputGroupAddon>
                    <SearchIcon aria-hidden="true" />
                  </InputGroupAddon>
                  <InputGroupInput
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      cancelEditingOrder();
                    }}
                    placeholder="Søg efter Produkter"
                    aria-label="Søg efter Produkter"
                  />
                </InputGroup>
                {editingOrder && canManageLocations ? (
                  <div className="flex flex-wrap gap-2">
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
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      onClick={cancelEditingOrder}
                    >
                      Annullér
                    </Button>
                    <Button
                      type="button"
                      className="min-h-11"
                      disabled={!orderDraft || savingOrder}
                      onClick={() => void saveOrder()}
                    >
                      {savingOrder ? (
                        <Spinner data-icon="inline-start" />
                      ) : null}
                      Gem rækkefølge
                    </Button>
                  </div>
                ) : null}
              </div>

              <Tabs
                value={categoryId}
                onValueChange={(value) => {
                  setCategoryId(value);
                  cancelEditingOrder();
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
            </>
          ) : null}

          {!products ? <CountSkeleton /> : null}

          {products && displayedProducts.length === 0 ? (
            <Empty className="min-h-72 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PackageOpenIcon />
                </EmptyMedia>
                <EmptyTitle>
                  {emptyBarOrder
                    ? "Ingen Produkter i denne Bar"
                    : "Ingen Produkter fundet"}
                </EmptyTitle>
                <EmptyDescription>
                  {emptyBarOrder
                    ? 'En bruger med tilladelsen til at administrere lokationer skal vælge Produkter med "Start forfra" i rækkefølgeeditoren.'
                    : search
                      ? "Prøv en anden søgning."
                      : "Der er ingen aktive Produkter i denne kategori."}
                </EmptyDescription>
                {emptyBarOrder && canManageLocations ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => {
                      startEditingOrder();
                      setOrderBuilderOpen(true);
                    }}
                  >
                    <ListRestartIcon data-icon="inline-start" />
                    Start forfra
                  </Button>
                ) : null}
              </EmptyHeader>
            </Empty>
          ) : null}

          {!editingOrder && viewMode === "single" && singleProduct ? (
            <SingleProductCounter
              product={singleProduct}
              position={singleProductIndex}
              productCount={displayedProducts.length}
              disabledReason={lockedReason}
              quantityFor={(unit) => quantityFor(singleProduct, unit)}
              onQuantityChange={(unit, quantity) =>
                changeQuantity(singleProduct, unit, quantity)
              }
              onPrevious={() => moveSingleProduct(-1)}
              onNext={advanceSingleProduct}
              completionPending={
                completingCountAreaId === activeCountAreaId
              }
              onComplete={
                countAreas && countAreas.length > 0
                  ? () => void finishCurrentCountArea()
                  : undefined
              }
            />
          ) : null}

          {(viewMode === "all" || editingOrder) &&
          displayedProducts.length > 0 ? (
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
                      selectedUnits[product.id] ?? product.defaultUnitId;
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
            open={orderBuilderOpen && editingOrder}
            products={products ?? []}
            appendUnselected={activeCountAreaId === null}
            onOpenChange={setOrderBuilderOpen}
            onSave={rebuildOrder}
          />
        </>
      )}

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
                  <span className="hidden lg:inline">Count er låst · </span>
                  <CountOpenCountdown target={state.opensAt} />
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
                Eksportér Waste
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
                  Registrér Count
                </Button>
              </UnavailableTooltip>
            )}
          </div>
        }
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrér Count?</AlertDialogTitle>
            <AlertDialogDescription>
              Lageret overskrives for produkter med en angivet mængde. Andre
              produkter beholder deres nuværende lager. Denne Count kan ikke
              rettes efter registrering. Skriv en begrundelse for
              lagerafstemningen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="count-submit-reason">Begrundelse</FieldLabel>
            <Textarea
              id="count-submit-reason"
              value={submitReason}
              onChange={(event) => setSubmitReason(event.target.value)}
              placeholder="Skriv, hvorfor Count registreres"
              required
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>
              Fortsæt Count
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting || !submitReason.trim()}
              onClick={() => void confirmSubmit()}
            >
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              Registrér Count
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
