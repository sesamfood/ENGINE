"use client";

import { SortableListRow } from "./sortable-list-row";

import { useCompleteCatalog } from "@/hooks/use-complete-catalog";

import { getUserErrorMessage } from "@/lib/user-errors";
import {
  closestCorners,
  type CollisionDetection,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  type Announcements,
  type UniqueIdentifier,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { useMutation, useQuery } from "convex/react";
import {
  EllipsisVerticalIcon,
  GripVerticalIcon,
  LayoutListIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type ProductId = Id<"products">;
type AreaId = Id<"countAreas">;
type CountColumnKey = AreaId | "location";
type ColumnKey = "unused" | "waste" | CountColumnKey;
type CountArea = {
  id: AreaId;
  name: string;
  productIds: ProductId[];
};
type Board = {
  autoInclude: boolean;
  unused: Set<ProductId>;
  columns: Map<CountColumnKey, ProductId[]>;
};

const MAX_AREA_PRODUCTS = 500;
const COLUMN_PREFIX = "column:";

function itemId(column: ColumnKey, productId: ProductId) {
  return `${column}|${productId}`;
}

function parseItemId(id: UniqueIdentifier) {
  const [column, productId] = String(id).split("|");
  return { column: column as ColumnKey, productId: productId as ProductId };
}

function targetColumn(id: UniqueIdentifier) {
  const value = String(id);
  return value.startsWith(COLUMN_PREFIX)
    ? (value.slice(COLUMN_PREFIX.length) as ColumnKey)
    : parseItemId(value).column;
}

function isCountColumn(column: ColumnKey): column is CountColumnKey {
  return column !== "unused" && column !== "waste";
}

function sameIds(left: ProductId[], right: ProductId[]) {
  return (
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

// Prefer the card under the pointer, then the column, then the nearest card for keyboard drags.
const boardCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  if (hits.length === 0) return closestCorners(args);
  const card = hits.find((hit) => !String(hit.id).startsWith(COLUMN_PREFIX));
  return [card ?? hits[0]];
};

function BoardColumn({
  column,
  title,
  description,
  count,
  tone,
  actions,
  sortableIds,
  children,
}: {
  column: ColumnKey;
  title: string;
  description: string;
  count: number;
  tone: "muted" | "neutral" | "count";
  actions?: ReactNode;
  sortableIds: string[];
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${COLUMN_PREFIX}${column}`,
  });
  return (
    <section
      ref={setNodeRef}
      aria-label={title}
      className={cn(
        "flex w-72 shrink-0 snap-start flex-col rounded-xl border transition-colors",
        tone === "muted" && "border-dashed bg-muted/20",
        tone === "neutral" && "bg-muted/40",
        tone === "count" && "bg-card",
        isOver && "border-primary ring-2 ring-primary/20",
      )}
    >
      <header className="flex min-h-14 items-start justify-between gap-2 border-b p-3 pr-1">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate font-medium">{title}</h3>
            <Badge variant={tone === "count" ? "default" : "secondary"}>
              {count}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {actions}
      </header>
      <SortableContext
        items={sortableIds}
        strategy={verticalListSortingStrategy}
      >
        <ol className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2">
          {children}
        </ol>
      </SortableContext>
    </section>
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
  const locationOrder = useQuery(
    api.countAreas.getLocationProductOrder,
    open ? { locationId } : "skip",
  );
  const saveSetup = useMutation(api.countAreas.saveSetup);
  const createArea = useMutation(api.countAreas.create);
  const renameArea = useMutation(api.countAreas.rename);
  const removeCountArea = useMutation(api.countAreas.remove);
  const setAreaProductOrder = useMutation(api.countAreas.setProductOrder);

  const [draft, setDraft] = useState<Board | null>(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [dragging, setDragging] = useState<UniqueIdentifier | null>(null);
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const sortedProducts = useMemo(
    () =>
      [...(products ?? [])].sort((left, right) =>
        left.name.localeCompare(right.name, "da"),
      ),
    [products],
  );
  const productNames = useMemo(
    () => new Map(sortedProducts.map((product) => [product.id, product.name])),
    [sortedProducts],
  );
  const organizationExcluded = useMemo(
    () => new Set(exclusions?.organizationProductIds ?? []),
    [exclusions],
  );
  const ingredientIds = useMemo(
    () =>
      new Set(
        configuration?.kind === "selected"
          ? configuration.ingredientProductIds
          : [],
      ),
    [configuration],
  );

  const saved = useMemo<Board | null>(() => {
    if (
      !configuration ||
      !products ||
      !areas ||
      !exclusions ||
      !locationOrder
    ) {
      return null;
    }
    const effective = new Set(
      configuration.kind === "all"
        ? sortedProducts
            .map((product) => product.id)
            .filter((id) => !configuration.unusedProductIds.includes(id))
        : [
            ...configuration.selectedProductIds,
            ...configuration.ingredientProductIds,
          ],
    );
    const columns = new Map<CountColumnKey, ProductId[]>();
    if (areas.length > 0) {
      for (const area of areas) columns.set(area.id, area.productIds);
    } else {
      const excluded = new Set([
        ...exclusions.organizationProductIds,
        ...exclusions.locationProductIds,
      ]);
      const position = new Map(locationOrder.map((id, index) => [id, index]));
      const fallback = locationOrder.length;
      columns.set(
        "location",
        sortedProducts
          .map((product) => product.id)
          .filter((id) => effective.has(id) && !excluded.has(id))
          .sort(
            (left, right) =>
              (position.get(left) ?? fallback) -
              (position.get(right) ?? fallback),
          ),
      );
    }
    return {
      autoInclude: configuration.kind === "all",
      unused: new Set(
        sortedProducts
          .map((product) => product.id)
          .filter((id) => !effective.has(id)),
      ),
      columns,
    };
  }, [
    areas,
    configuration,
    exclusions,
    locationOrder,
    products,
    sortedProducts,
  ]);

  const board = draft ?? saved;
  const hasAreas = Boolean(areas && areas.length > 0);
  const countKeys: CountColumnKey[] =
    areas && hasAreas ? areas.map((area) => area.id) : ["location"];
  const unused = board?.unused;

  function columnIds(key: CountColumnKey) {
    return (board?.columns.get(key) ?? saved?.columns.get(key) ?? []).filter(
      (id) =>
        productNames.has(id) &&
        !unused?.has(id) &&
        !organizationExcluded.has(id),
    );
  }

  const countColumns = new Map(countKeys.map((key) => [key, columnIds(key)]));
  const counted = new Set([...countColumns.values()].flat());
  const unusedIds = sortedProducts
    .map((product) => product.id)
    .filter((id) => unused?.has(id));
  const wasteIds = sortedProducts
    .map((product) => product.id)
    .filter((id) => !unused?.has(id) && !counted.has(id));
  const columnTitles = new Map<ColumnKey, string>([
    ["unused", "Ikke brugt"],
    ["waste", "Kun Waste"],
    ["location", "Count"],
    ...(areas ?? []).map((area) => [area.id, area.name] as const),
  ]);
  const query = search.trim().toLocaleLowerCase("da");
  const matches = (id: ProductId) =>
    !query ||
    (productNames.get(id) ?? "").toLocaleLowerCase("da").includes(query);
  const isDirty = draft !== null;
  const isBusy = saving || savingArea || deletingArea;

  function update(change: (next: Board) => void) {
    if (!board) return;
    const next: Board = {
      autoInclude: board.autoInclude,
      unused: new Set(board.unused),
      columns: new Map(countColumns),
    };
    change(next);
    setDraft(next);
  }

  function moveProduct(
    productId: ProductId,
    from: ColumnKey,
    to: ColumnKey,
    { index, copy = false }: { index?: number; copy?: boolean } = {},
  ) {
    if (isCountColumn(to) && organizationExcluded.has(productId)) {
      toast.error("Produktet er udeladt fra Count for hele organisationen");
      return;
    }
    if (to === "unused" && ingredientIds.has(productId)) {
      toast.error(
        "Produktet er ingrediens i et valgt Produkt og kan ikke fravælges",
      );
      return;
    }
    if (from === to && !isCountColumn(to)) return;
    update((next) => {
      if (to === "unused") {
        next.unused.add(productId);
      } else {
        next.unused.delete(productId);
      }
      if (!isCountColumn(to)) {
        for (const [key, ids] of next.columns) {
          next.columns.set(
            key,
            ids.filter((id) => id !== productId),
          );
        }
        return;
      }
      if (!copy && isCountColumn(from) && from !== to) {
        next.columns.set(
          from,
          (next.columns.get(from) ?? []).filter((id) => id !== productId),
        );
      }
      const target = (next.columns.get(to) ?? []).filter(
        (id) => id !== productId,
      );
      target.splice(index ?? target.length, 0, productId);
      next.columns.set(to, target);
    });
  }

  function removeFromColumn(productId: ProductId, key: CountColumnKey) {
    update((next) => {
      next.columns.set(
        key,
        (next.columns.get(key) ?? []).filter((id) => id !== productId),
      );
    });
  }

  function requestClose() {
    if (isBusy) return;
    if (isDirty) setConfirmDiscard(true);
    else onOpenChange(false);
  }

  async function save() {
    if (!board || !saved || !exclusions) return;
    const productIds = board.autoInclude
      ? []
      : sortedProducts
          .map((product) => product.id)
          .filter((id) => !board.unused.has(id));
    const unusedProductIds = board.autoInclude ? unusedIds : [];
    if (!board.autoInclude && productIds.length === 0) {
      toast.error("Vælg mindst ét Produkt til lokationen");
      return;
    }
    const waste = new Set(wasteIds);
    // With Områder, only placement decides Count; keep existing exclusions that still apply.
    const excludedProductIds =
      areas && areas.length > 0
        ? exclusions.locationProductIds.filter((id) => waste.has(id))
        : wasteIds.filter((id) => !organizationExcluded.has(id));
    const orders = countKeys
      .filter(
        (key) => !sameIds(countColumns.get(key) ?? [], columnIdsSaved(key)),
      )
      .map((key) => ({
        countAreaId: key === "location" ? null : key,
        productIds: countColumns.get(key) ?? [],
      }));
    setSaving(true);
    try {
      await saveSetup({
        locationId,
        productIds,
        unusedProductIds,
        excludedProductIds,
        orders,
      });
      setDraft(null);
      toast.success("Count-opsætningen er gemt");
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Count-opsætningen kunne ikke gemmes. Prøv igen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  function columnIdsSaved(key: CountColumnKey) {
    return (saved?.columns.get(key) ?? []).filter(
      (id) => productNames.has(id) && !organizationExcluded.has(id),
    );
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
        const seed = areas?.length === 0 ? columnIdsSaved("location") : [];
        const countAreaId = await createArea({ locationId, name: areaName });
        // The first Område takes over the Produkter that were counted without Områder.
        if (seed.length > 0 && seed.length <= MAX_AREA_PRODUCTS) {
          await setAreaProductOrder({
            locationId,
            countAreaId,
            productIds: seed,
          });
        }
        toast.success("Området er oprettet");
      } else if (editingArea) {
        await renameArea({ countAreaId: editingArea.id, name: areaName });
        toast.success("Området er omdøbt");
      }
      setEditingArea(null);
    } catch (error) {
      setAreaError(
        getUserErrorMessage(
          error,
          "Count-opsætningen kunne ikke opdateres. Prøv igen.",
        ),
      );
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
      toast.error(
        getUserErrorMessage(
          error,
          "Count-opsætningen kunne ikke opdateres. Prøv igen.",
        ),
      );
    } finally {
      setDeletingArea(false);
    }
  }

  const announcements: Announcements = {
    onDragStart({ active }) {
      const { productId } = parseItemId(active.id);
      return `${productNames.get(productId) ?? "Produktet"} er valgt.`;
    },
    onDragOver({ active, over }) {
      if (!over) return;
      const { productId } = parseItemId(active.id);
      return `${productNames.get(productId) ?? "Produktet"} er over ${columnTitles.get(targetColumn(over.id)) ?? "en kolonne"}.`;
    },
    onDragEnd({ active, over }) {
      const { productId } = parseItemId(active.id);
      const name = productNames.get(productId) ?? "Produktet";
      return over
        ? `${name} er flyttet til ${columnTitles.get(targetColumn(over.id)) ?? "kolonnen"}.`
        : `${name} blev ikke flyttet.`;
    },
    onDragCancel({ active }) {
      const { productId } = parseItemId(active.id);
      return `Flytning af ${productNames.get(productId) ?? "Produktet"} blev annulleret.`;
    },
  };

  function renderCard(
    column: ColumnKey,
    productId: ProductId,
    position?: number,
  ) {
    const name = productNames.get(productId) ?? "";
    const locked = organizationExcluded.has(productId);
    const note = locked
      ? "Udeladt for hele organisationen"
      : ingredientIds.has(productId)
        ? "Ingrediens"
        : null;
    const memberOf = countKeys.filter((key) =>
      (countColumns.get(key) ?? []).includes(productId),
    );
    const alsoIn = isCountColumn(column)
      ? memberOf.filter((key) => key !== column)
      : [];
    const details = [
      note,
      alsoIn.length > 0
        ? `Også i ${alsoIn.map((key) => columnTitles.get(key)).join(", ")}`
        : null,
    ].filter(Boolean);
    return (
      <SortableListRow
        key={itemId(column, productId)}
        id={itemId(column, productId)}
        label={name}
        position={position}
        disabled={isBusy}
        roleDescription="Produkt, der kan flyttes"
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  className="size-11"
                  aria-label={`Placér ${name}`}
                  disabled={isBusy}
                />
              }
            >
              <EllipsisVerticalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  {hasAreas ? "Tælles i" : "Count"}
                </DropdownMenuLabel>
                {countKeys.map((key) => (
                  <DropdownMenuCheckboxItem
                    key={key}
                    className="min-h-11"
                    closeOnClick={false}
                    checked={memberOf.includes(key)}
                    disabled={locked}
                    onCheckedChange={(checked) =>
                      checked
                        ? moveProduct(productId, column, key, { copy: true })
                        : removeFromColumn(productId, key)
                    }
                  >
                    {columnTitles.get(key)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Tælles ikke</DropdownMenuLabel>
                {(["waste", "unused"] as const)
                  .filter((key) => key !== column)
                  .map((key) => (
                    <DropdownMenuItem
                      key={key}
                      className="min-h-11"
                      disabled={
                        key === "unused" && ingredientIds.has(productId)
                      }
                      onClick={() => moveProduct(productId, column, key)}
                    >
                      Flyt til {columnTitles.get(key)}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        <span className="flex min-w-0 flex-1 flex-col py-1">
          <span className="truncate font-medium">{name}</span>
          {details.length > 0 ? (
            <span className="truncate text-xs text-muted-foreground">
              {details.join(" · ")}
            </span>
          ) : null}
        </span>
      </SortableListRow>
    );
  }

  function renderCards(column: ColumnKey, ids: ProductId[], numbered: boolean) {
    const visible = ids
      .map((id, index) => ({ id, position: index + 1 }))
      .filter(({ id }) => matches(id));
    if (visible.length === 0) {
      return (
        <li className="flex min-h-20 items-center justify-center rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
          {ids.length === 0 ? "Træk Produkter hertil" : "Ingen match"}
        </li>
      );
    }
    return visible.map(({ id, position }) =>
      renderCard(column, id, numbered ? position : undefined),
    );
  }

  const draggedProduct = dragging ? parseItemId(dragging).productId : null;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        <DialogContent className="flex h-(--spacing-dialog) flex-col sm:max-w-7xl">
          <DialogHeader>
            <DialogTitle>Produkter og Områder</DialogTitle>
            <DialogDescription>
              Placér Produkterne for {locationName}. Rækkefølgen i et Område er
              rækkefølgen i Count.
            </DialogDescription>
          </DialogHeader>

          {!board || !areas ? (
            <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-full w-72 shrink-0" />
              ))}
            </div>
          ) : sortedProducts.length === 0 ? (
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
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-48 flex-1">
                  <SearchIcon
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Søg efter produkter"
                    aria-label="Søg efter produkter"
                    appearance="search"
                    className="h-11"
                  />
                </div>
                <div className="flex min-h-11 items-center gap-2">
                  <Switch
                    id={`count-setup-auto-${locationId}`}
                    checked={board.autoInclude}
                    disabled={isBusy}
                    onCheckedChange={(checked) =>
                      update((next) => {
                        next.autoInclude = checked;
                      })
                    }
                  />
                  <label
                    htmlFor={`count-setup-auto-${locationId}`}
                    className="text-sm font-medium"
                  >
                    Brug nye Produkter automatisk
                  </label>
                  <HelpTooltip
                    label="Brug nye Produkter automatisk"
                    content="Når den er slået til, bruges nye Produkter automatisk på lokationen og lander i Kun Waste. Produkter i Ikke brugt forbliver fravalgt. Når den er slået fra, bruges kun de Produkter, der ligger uden for Ikke brugt nu."
                  />
                </div>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={boardCollision}
                accessibility={{ announcements }}
                onDragStart={({ active }) => setDragging(active.id)}
                onDragCancel={() => setDragging(null)}
                onDragEnd={({ active, over }) => {
                  setDragging(null);
                  if (!over) return;
                  const source = parseItemId(active.id);
                  const to = targetColumn(over.id);
                  const overId = String(over.id);
                  const index =
                    isCountColumn(to) && !overId.startsWith(COLUMN_PREFIX)
                      ? (countColumns.get(to) ?? []).indexOf(
                          parseItemId(overId).productId,
                        )
                      : undefined;
                  moveProduct(source.productId, source.column, to, {
                    index: index === -1 ? undefined : index,
                  });
                }}
              >
                <div className="-mx-4 flex min-h-0 flex-1 snap-x gap-3 overflow-x-auto px-4 pb-1">
                  <BoardColumn
                    column="unused"
                    title="Ikke brugt"
                    description="Bruges ikke på lokationen."
                    count={unusedIds.length}
                    tone="muted"
                    sortableIds={unusedIds.map((id) => itemId("unused", id))}
                  >
                    {renderCards("unused", unusedIds, false)}
                  </BoardColumn>
                  <BoardColumn
                    column="waste"
                    title="Kun Waste"
                    description="Bruges i Waste, men tælles ikke."
                    count={wasteIds.length}
                    tone="neutral"
                    sortableIds={wasteIds.map((id) => itemId("waste", id))}
                  >
                    {renderCards("waste", wasteIds, false)}
                  </BoardColumn>
                  {countKeys.map((key) => {
                    const ids = countColumns.get(key) ?? [];
                    const area = areas.find(
                      (candidate) => candidate.id === key,
                    );
                    return (
                      <BoardColumn
                        key={key}
                        column={key}
                        title={columnTitles.get(key) ?? ""}
                        description={
                          area
                            ? "Tælles i denne rækkefølge."
                            : "Tælles i denne rækkefølge. Opret Områder for at dele Count op."
                        }
                        count={ids.length}
                        tone="count"
                        sortableIds={ids.map((id) => itemId(key, id))}
                        actions={
                          area ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-lg"
                                    className="size-11 shrink-0"
                                    aria-label={`Indstillinger for ${area.name}`}
                                    disabled={isBusy}
                                  />
                                }
                              >
                                <EllipsisVerticalIcon />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="min-w-44"
                              >
                                <DropdownMenuItem
                                  className="min-h-11"
                                  onClick={() => openRenameArea(area)}
                                >
                                  <PencilIcon />
                                  Omdøb
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  variant="destructive"
                                  className="min-h-11"
                                  onClick={() => setPendingAreaDelete(area)}
                                >
                                  <Trash2Icon />
                                  Fjern Område
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null
                        }
                      >
                        {renderCards(key, ids, true)}
                      </BoardColumn>
                    );
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-24 w-48 shrink-0 snap-start flex-col"
                    disabled={isBusy}
                    onClick={openNewArea}
                  >
                    <PlusIcon />
                    {hasAreas ? "Nyt Område" : "Opdel i Områder"}
                  </Button>
                </div>
                {/* The dialog is transformed, which would offset a fixed overlay. */}
                {createPortal(
                  <DragOverlay zIndex={60}>
                    {draggedProduct ? (
                      <div className="flex min-h-14 items-center gap-2 rounded-lg border bg-background p-1 pr-3 shadow-lg">
                        <span className="flex size-11 items-center justify-center text-muted-foreground">
                          <GripVerticalIcon aria-hidden="true" />
                        </span>
                        <span className="truncate font-medium">
                          {productNames.get(draggedProduct)}
                        </span>
                      </div>
                    ) : null}
                  </DragOverlay>,
                  document.body,
                )}
              </DndContext>
            </>
          )}

          <DialogFooter className="items-center">
            {isDirty ? (
              <p className="mr-auto text-sm text-muted-foreground">
                Du har ændringer, der ikke er gemt.
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={isBusy}
              onClick={() => (isDirty ? setDraft(null) : onOpenChange(false))}
            >
              {isDirty ? "Fortryd" : "Luk"}
            </Button>
            <Button
              type="button"
              className="min-h-11"
              disabled={!isDirty || isBusy}
              onClick={() => void save()}
            >
              {saving ? <Spinner data-icon="inline-start" /> : null}
              Gem
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
              {editingArea === "new" && !hasAreas
                ? "Giv Området et navn. Produkterne, der tælles nu, flyttes til Området."
                : "Giv Området et navn."}
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
              permanent. Produkterne flyttes til Kun Waste, medmindre de også
              ligger i et andet Område.
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

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kassér ændringer?</AlertDialogTitle>
            <AlertDialogDescription>
              Dine ændringer til Produkter og Områder er ikke gemt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11">
              Fortsæt redigering
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="min-h-11"
              onClick={() => {
                setConfirmDiscard(false);
                onOpenChange(false);
              }}
            >
              Kassér
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
