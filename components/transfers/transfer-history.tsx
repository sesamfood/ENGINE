"use client";

import { getUserErrorMessage } from "@/lib/user-errors";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  type Announcements,
  type ScreenReaderInstructions,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useConvex,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import {
  ArrowLeftRightIcon,
  CircleCheckBigIcon,
  DownloadIcon,
  GripVerticalIcon,
  PencilIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useDelayedLoading } from "@/components/catalog/use-delayed-loading";
import { usePermission } from "@/components/app-shell";
import {
  TransferForm,
  type EditableTransfer,
} from "@/components/transfers/transfer-form";
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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type TransferListRow = {
  id: Id<"transfers">;
  transferredAt: number;
  fromLocationName: string;
  toLocationName: string;
  responsibleName: string;
  comment: string | null;
  itemCount: number;
  totalQuantity: number;
  hasTemperatureDeviation: boolean;
  receiptStatus: "pending" | "registered" | null;
};

type TransferDetail = EditableTransfer & {
  fromLocationName: string;
  toLocationName: string;
  responsibleName: string;
};

type ExportRow = {
  transferredAt: number;
  fromLocationName: string;
  toLocationName: string;
  responsibleName: string;
  productName: string;
  unitName: string;
  quantity: number;
  comment: string | null;
  temperatureCelsius: number | null;
  maxTemperatureCelsius: number | null;
  temperatureDeviation: boolean;
};

function formatTemperature(value: number) {
  return new Intl.NumberFormat("da-DK", {
    maximumFractionDigits: 1,
  }).format(value);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfDay(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
}

function endOfDay(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

function defaultFromDate() {
  const now = new Date();
  return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
}

function defaultToDate() {
  return toDateInputValue(new Date());
}

const dateTimeFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
  timeStyle: "short",
});

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
});

const timeFormatter = new Intl.DateTimeFormat("da-DK", {
  timeStyle: "short",
});

function escapeCsvValue(value: string) {
  const safeValue = /^[\u0000-\u0020\u00a0\ufeff]*[=+\-@]/u.test(value)
    ? `'${value}`
    : value;
  if (/[;"\r\n]/.test(safeValue)) {
    return `"${safeValue.replaceAll('"', '""')}"`;
  }
  return safeValue;
}

type ExportColumn = {
  key: string;
  label: string;
  value: (row: ExportRow) => string;
};

const exportColumns: ExportColumn[] = [
  {
    key: "date",
    label: "Dato",
    value: (row) => dateFormatter.format(row.transferredAt),
  },
  {
    key: "time",
    label: "Tid",
    value: (row) => timeFormatter.format(row.transferredAt),
  },
  {
    key: "fromLocation",
    label: "Fra lokation",
    value: (row) => row.fromLocationName,
  },
  {
    key: "toLocation",
    label: "Til lokation",
    value: (row) => row.toLocationName,
  },
  {
    key: "responsible",
    label: "Ansvarlig",
    value: (row) => row.responsibleName,
  },
  { key: "product", label: "Produkt", value: (row) => row.productName },
  { key: "unit", label: "Enhed", value: (row) => row.unitName },
  {
    key: "quantity",
    label: "Antal",
    value: (row) => String(row.quantity).replace(".", ","),
  },
  {
    key: "temperature",
    label: "Temperatur (°C)",
    value: (row) =>
      row.temperatureCelsius === null
        ? ""
        : formatTemperature(row.temperatureCelsius),
  },
  {
    key: "maxTemperature",
    label: "Maks. temperatur (°C)",
    value: (row) =>
      row.maxTemperatureCelsius === null
        ? ""
        : formatTemperature(row.maxTemperatureCelsius),
  },
  {
    key: "temperatureDeviation",
    label: "Temperaturafvigelse",
    value: (row) => (row.temperatureDeviation ? "Ja" : "Nej"),
  },
  { key: "comment", label: "Kommentar", value: (row) => row.comment ?? "" },
];

const exportColumnByKey = new Map(
  exportColumns.map((column) => [column.key, column]),
);
const defaultColumnOrder = exportColumns.map((column) => column.key);
const EXPORT_PREFS_KEY = "transfers-export-prefs";

type ExportPrefs = {
  order: string[];
  enabled: string[];
  inDefaultUnit: boolean;
};

function normalizeExportPrefs(value: unknown): ExportPrefs {
  const defaults: ExportPrefs = {
    order: [...defaultColumnOrder],
    enabled: [...defaultColumnOrder],
    inDefaultUnit: false,
  };
  if (!value || typeof value !== "object") return defaults;
  const rawOrder = "order" in value && Array.isArray(value.order)
    ? value.order
    : [];
  const knownOrder = rawOrder.filter(
        (key): key is string =>
          typeof key === "string" && exportColumnByKey.has(key),
      );
  const order = [
    ...knownOrder,
    ...defaultColumnOrder.filter((key) => !knownOrder.includes(key)),
  ];
  const hasSavedColumns =
    ("order" in value && Array.isArray(value.order)) ||
    ("enabled" in value && Array.isArray(value.enabled));
  const enabledRaw = "enabled" in value && Array.isArray(value.enabled)
    ? value.enabled.filter(
        (key): key is string =>
          typeof key === "string" && exportColumnByKey.has(key),
      )
    : hasSavedColumns
      ? knownOrder
      : order;
  return {
    order,
    enabled: enabledRaw,
    inDefaultUnit:
      "inDefaultUnit" in value ? Boolean(value.inDefaultUnit) : false,
  };
}

const SERVER_EXPORT_PREFS = normalizeExportPrefs(null);
let cachedExportPrefsRaw: string | null | undefined;
let cachedExportPrefs: ExportPrefs = SERVER_EXPORT_PREFS;

function readExportPrefs(): ExportPrefs {
  try {
    const raw = window.localStorage.getItem(EXPORT_PREFS_KEY);
    if (raw === cachedExportPrefsRaw) return cachedExportPrefs;
    cachedExportPrefsRaw = raw;
    cachedExportPrefs = normalizeExportPrefs(raw ? JSON.parse(raw) : null);
    return cachedExportPrefs;
  } catch {
    return SERVER_EXPORT_PREFS;
  }
}

function writeExportPrefs(prefs: ExportPrefs) {
  try {
    const raw = JSON.stringify(prefs);
    window.localStorage.setItem(EXPORT_PREFS_KEY, raw);
    cachedExportPrefsRaw = raw;
    cachedExportPrefs = prefs;
  } catch {
    // ponytail: private mode / quota — keep in-memory prefs for this session.
    cachedExportPrefsRaw = undefined;
    cachedExportPrefs = prefs;
  }
}

const exportPrefsListeners = new Set<() => void>();

function subscribeExportPrefs(onStoreChange: () => void) {
  exportPrefsListeners.add(onStoreChange);
  return () => {
    exportPrefsListeners.delete(onStoreChange);
  };
}

function getExportPrefsSnapshot() {
  return readExportPrefs();
}

function getExportPrefsServerSnapshot() {
  return SERVER_EXPORT_PREFS;
}

function setExportPrefs(prefs: ExportPrefs) {
  writeExportPrefs(prefs);
  for (const listener of exportPrefsListeners) listener();
}

// ponytail: browser-built semicolon CSV that Danish Excel opens natively — no dependency, no server route.
function downloadTransfersCsv(
  rows: ExportRow[],
  startDate: string,
  endDate: string,
  columns: ExportColumn[],
) {
  const lines = [
    columns.map((column) => escapeCsvValue(column.label)).join(";"),
    ...rows.map((row) =>
      columns.map((column) => escapeCsvValue(column.value(row))).join(";"),
    ),
  ];
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `transfers-${startDate}-${endDate}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

type ColumnZone = "included" | "excluded";
type ExportColumnLists = Record<ColumnZone, string[]>;
type ExportColumnDropPreview = {
  columnKey: string;
  index: number;
  zone: ColumnZone;
};

const exportScreenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "Tryk på mellemrum for at vælge kolonnen. Flyt den med piletasterne. Tryk på mellemrum igen for at placere den, eller Escape for at annullere.",
};

const exportAnnouncements: Announcements = {
  onDragStart({ active }) {
    return `${exportColumnByKey.get(String(active.id))?.label ?? active.id} er valgt.`;
  },
  onDragOver({ active, over }) {
    if (!over) return;
    const sourceLabel =
      exportColumnByKey.get(String(active.id))?.label ?? active.id;
    const targetLabel =
      exportColumnByKey.get(String(over.id))?.label ??
      (over.data.current?.zone === "included"
        ? "Med i eksporten"
        : "Ikke med i eksporten");
    return `${sourceLabel} flyttes til ${targetLabel}.`;
  },
  onDragEnd({ active }) {
    return `${exportColumnByKey.get(String(active.id))?.label ?? active.id} er placeret.`;
  },
  onDragCancel({ active }) {
    return `Flytning af ${exportColumnByKey.get(String(active.id))?.label ?? active.id} blev annulleret.`;
  },
};

function isColumnZone(value: unknown): value is ColumnZone {
  return value === "included" || value === "excluded";
}

function sameColumnKeys(first: string[], second: string[]) {
  return (
    first.length === second.length &&
    first.every((key, index) => key === second[index])
  );
}

function ExportColumnDragPreview({ columnKey }: { columnKey: string }) {
  const column = exportColumnByKey.get(columnKey);
  if (!column) return null;

  return (
    <div className="flex min-h-11 w-full cursor-grabbing items-center gap-2 rounded-lg border border-primary bg-background px-2 text-left shadow-xl ring-2 ring-primary/20">
      <span className="flex size-11 shrink-0 items-center justify-center text-muted-foreground">
        <GripVerticalIcon aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">
        {column.label}
      </span>
    </div>
  );
}

function ExportColumnDropPlaceholder({ columnKey }: { columnKey: string }) {
  const column = exportColumnByKey.get(columnKey);
  if (!column) return null;

  return (
    <li aria-hidden="true">
      <div className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-dashed border-primary bg-primary/5 px-2 text-left text-primary/70">
        <span className="flex size-11 shrink-0 items-center justify-center">
          <GripVerticalIcon />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {column.label}
        </span>
      </div>
    </li>
  );
}

function ExportColumnRow({
  columnKey,
  dragActive,
  index,
  zone,
}: {
  columnKey: string;
  dragActive: boolean;
  index: number;
  zone: ColumnZone;
}) {
  const column = exportColumnByKey.get(columnKey);
  const {
    attributes,
    isDragging,
    isOver,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: columnKey,
    data: { index, zone },
  });

  if (!column) return null;

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : undefined,
      }}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        className={cn(
          "flex min-h-11 w-full touch-none items-center gap-2 rounded-lg border bg-background px-2 text-left shadow-sm transition-[box-shadow,border-color] duration-150 select-none",
          dragActive
            ? "cursor-grabbing"
            : "cursor-grab active:cursor-grabbing",
          isDragging && "opacity-30",
          isOver &&
            !isDragging &&
            "border-primary bg-primary/5 ring-2 ring-primary/20",
        )}
        aria-label={`Flyt ${column.label}`}
        aria-roledescription="kolonne, der kan flyttes"
      >
        <span className="flex size-11 shrink-0 items-center justify-center text-muted-foreground">
          <GripVerticalIcon aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {column.label}
        </span>
      </button>
    </li>
  );
}

function ExportColumnZone({
  dragActive,
  dropPreview,
  zone,
  keys,
  title,
  emptyLabel,
}: {
  dragActive: boolean;
  dropPreview: ExportColumnDropPreview | null;
  zone: ColumnZone;
  keys: string[];
  title: string;
  emptyLabel: string;
}) {
  const preview = dropPreview?.zone === zone ? dropPreview : null;
  const { isOver, setNodeRef } = useDroppable({
    id: `export-zone-${zone}`,
    data: { zone },
  });

  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-xl border p-2.5 transition-colors",
        dragActive && "cursor-grabbing",
        isOver
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-border bg-muted/20",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">
          {`${keys.length} ${keys.length === 1 ? "kolonne" : "kolonner"}`}
        </p>
      </div>
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          className={cn(
            "flex min-h-16 flex-col gap-1.5",
            keys.length === 0 &&
              !preview &&
              "items-center justify-center rounded-lg border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground",
          )}
          aria-label={title}
        >
          {keys.length === 0 && !preview
            ? emptyLabel
            : keys.flatMap((key, index) => [
                preview?.index === index ? (
                  <ExportColumnDropPlaceholder
                    key={`${preview.columnKey}-placeholder`}
                    columnKey={preview.columnKey}
                  />
                ) : null,
                <ExportColumnRow
                  key={key}
                  columnKey={key}
                  dragActive={dragActive}
                  index={index}
                  zone={zone}
                />,
              ])}
          {preview && preview.index >= keys.length ? (
            <ExportColumnDropPlaceholder columnKey={preview.columnKey} />
          ) : null}
        </ul>
      </SortableContext>
    </section>
  );
}

function ExportColumnList({
  order,
  enabled,
  onChange,
}: {
  order: string[];
  enabled: string[];
  onChange: (next: { order: string[]; enabled: string[] }) => void;
}) {
  const [lists, setLists] = useState<ExportColumnLists>(() => ({
    included: order.filter((key) => enabled.includes(key)),
    excluded: order.filter((key) => !enabled.includes(key)),
  }));
  const pendingChange = useRef<ExportColumnLists | null>(null);
  const [activeColumnKey, setActiveColumnKey] = useState<string | null>(null);
  const [dropPreview, setDropPreview] =
    useState<ExportColumnDropPreview | null>(null);
  const included = lists.included;
  const excluded = lists.excluded;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    if (pendingChange.current) return;

    const next = {
      included: order.filter((key) => enabled.includes(key)),
      excluded: order.filter((key) => !enabled.includes(key)),
    };
    setLists((current) =>
      sameColumnKeys(current.included, next.included) &&
      sameColumnKeys(current.excluded, next.excluded)
        ? current
        : next,
    );
  }, [enabled, order]);

  useEffect(() => {
    const next = pendingChange.current;
    if (!next) return;

    pendingChange.current = null;
    onChange({
      order: [...next.included, ...next.excluded],
      enabled: next.included,
    });
  }, [lists, onChange]);

  return (
    <DndContext
      accessibility={{
        announcements: exportAnnouncements,
        screenReaderInstructions: exportScreenReaderInstructions,
      }}
      collisionDetection={closestCorners}
      sensors={sensors}
      onDragStart={({ active }) => {
        setDropPreview(null);
        setActiveColumnKey(String(active.id));
      }}
      onDragOver={({ active, over }) => {
        if (!over) {
          setDropPreview(null);
          return;
        }

        const activeKey = String(active.id);
        const initialGroup = active.data.current?.zone;
        const group = over.data.current?.zone;
        if (
          !isColumnZone(initialGroup) ||
          !isColumnZone(group) ||
          initialGroup === group
        ) {
          setDropPreview(null);
          return;
        }

        const overIndex = lists[group].indexOf(String(over.id));
        const isBelowOver =
          overIndex >= 0 &&
          active.rect.current.translated &&
          active.rect.current.translated.top > over.rect.top + over.rect.height;
        const index =
          overIndex < 0
            ? lists[group].length
            : overIndex + (isBelowOver ? 1 : 0);
        setDropPreview((current) =>
          current?.columnKey === activeKey &&
          current.zone === group &&
          current.index === index
            ? current
            : { columnKey: activeKey, index, zone: group },
        );
      }}
      onDragCancel={() => {
        setActiveColumnKey(null);
        setDropPreview(null);
      }}
      onDragEnd={({ active, over }) => {
        setActiveColumnKey(null);
        const preview = dropPreview;
        setDropPreview(null);
        if (!over) return;

        const initialGroup = active.data.current?.zone;
        const group = over.data.current?.zone;
        const activeKey = String(active.id);
        if (!isColumnZone(initialGroup) || !isColumnZone(group)) return;

        const initialIndex = lists[initialGroup].indexOf(activeKey);
        if (initialIndex < 0) return;

        const overIndex = lists[group].indexOf(String(over.id));
        const index =
          preview?.columnKey === activeKey && preview.zone === group
            ? preview.index
            : overIndex < 0
              ? lists[group].length
              : overIndex;

        const next = {
          included: [...included],
          excluded: [...excluded],
        };
        const [moved] = next[initialGroup].splice(initialIndex, 1);
        if (!moved) return;
        next[group].splice(index, 0, moved);
        pendingChange.current = next;
        setLists(next);
      }}
    >
      <div
        className={cn(
          "grid items-start gap-3 sm:grid-cols-2",
          activeColumnKey && "cursor-grabbing",
        )}
      >
        <ExportColumnZone
          dragActive={Boolean(activeColumnKey)}
          dropPreview={dropPreview}
          zone="included"
          keys={included}
          title="Med i eksporten"
          emptyLabel="Træk kolonner hertil"
        />
        <ExportColumnZone
          dragActive={Boolean(activeColumnKey)}
          dropPreview={dropPreview}
          zone="excluded"
          keys={excluded}
          title="Ikke med i eksporten"
          emptyLabel="Træk kolonner hertil for at skjule dem"
        />
      </div>
      {activeColumnKey
        ? createPortal(
            <DragOverlay dropAnimation={null} zIndex={100}>
              <ExportColumnDragPreview columnKey={activeColumnKey} />
            </DragOverlay>,
            document.body,
          )
        : null}
    </DndContext>
  );
}

export function TransferHistory() {
  const convex = useConvex();
  const canExport = usePermission("transfers.export");
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [selectedTransferId, setSelectedTransferId] =
    useState<Id<"transfers"> | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const deleteTransfer = useMutation(api.transfers.deleteTransfer);
  const requestAggregateBackfill = useMutation(
    api.transfers.requestAggregateBackfill,
  );
  useEffect(() => {
    void requestAggregateBackfill({}).catch(() => undefined);
  }, [requestAggregateBackfill]);
  const exportPrefs = useSyncExternalStore(
    subscribeExportPrefs,
    getExportPrefsSnapshot,
    getExportPrefsServerSnapshot,
  );
  const columnOrder = exportPrefs.order;
  const enabledColumns = exportPrefs.enabled;
  const inDefaultUnit = exportPrefs.inDefaultUnit;

  function updateExportPrefs(patch: Partial<ExportPrefs>) {
    setExportPrefs({ ...exportPrefs, ...patch });
  }

  const parsedStartAt = fromDate ? startOfDay(fromDate) : NaN;
  const parsedEndAt = toDate ? endOfDay(toDate) : NaN;
  const rangeError =
    !Number.isFinite(parsedStartAt) || !Number.isFinite(parsedEndAt)
      ? "Vælg både fra- og til-dato"
      : parsedStartAt > parsedEndAt
        ? "Fra-dato skal være før eller samme dag som til-dato"
        : null;

  const startAt = rangeError ? null : parsedStartAt;
  const endAt = rangeError ? null : parsedEndAt;

  const {
    results,
    status: paginationStatus,
    loadMore,
  } = usePaginatedQuery(
    api.transfers.listTransfers,
    startAt !== null && endAt !== null ? { startAt, endAt } : "skip",
    { initialNumItems: 25 },
  );

  const transferDetail = useQuery(
    api.transfers.getTransfer,
    selectedTransferId ? { transferId: selectedTransferId } : "skip",
  ) as TransferDetail | null | undefined;

  const transfers = results as TransferListRow[];
  const loading = paginationStatus === "LoadingFirstPage";
  const showSkeleton = useDelayedLoading(loading && transfers.length === 0);
  const detailGroups = useMemo(() => {
    if (!transferDetail) return [];
    return Array.from(
      transferDetail.items
        .reduce((groups, item) => {
          const group = groups.get(item.productId);
          if (group) group.push(item);
          else groups.set(item.productId, [item]);
          return groups;
        }, new Map<Id<"products">, TransferDetail["items"]>())
        .values(),
    );
  }, [transferDetail]);
  // ponytail: count is of loaded rows only; upgrade path is @convex-dev/aggregate for a true period total.
  const loadedCount = transfers.length;

  const countLabel = useMemo(() => {
    const noun = loadedCount === 1 ? "transfer" : "transfers";
    const base = `${loadedCount} ${noun} i perioden`;
    if (paginationStatus === "CanLoadMore") {
      return `${base} (flere kan indlæses)`;
    }
    return base;
  }, [loadedCount, paginationStatus]);

  const selectedColumns = columnOrder
    .filter((key) => enabledColumns.includes(key))
    .map((key) => exportColumnByKey.get(key))
    .filter((column): column is ExportColumn => column !== undefined);

  async function exportToCsv() {
    if (rangeError || startAt === null || endAt === null) {
      toast.error(rangeError ?? "Vælg en gyldig periode");
      return;
    }
    if (selectedColumns.length === 0) {
      toast.error("Vælg mindst én kolonne til eksporten");
      return;
    }
    setIsExporting(true);
    try {
      const rows: ExportRow[] = [];
      let cursor: string | null = null;
      let isDone = false;

      while (!isDone) {
        const result: {
          page: Array<{ rows: ExportRow[] }>;
          continueCursor: string;
          isDone: boolean;
        } = await convex.query(api.transfers.exportTransfers, {
          paginationOpts: {
            numItems: 5,
            cursor,
            maximumRowsRead: 5,
          },
          startAt,
          endAt,
          inDefaultUnit,
        });
        rows.push(...result.page.flatMap((transfer) => transfer.rows));
        cursor = result.continueCursor;
        isDone = result.isDone;
      }
      if (rows.length === 0) {
        toast.error("Ingen transfers i den valgte periode");
        return;
      }
      downloadTransfersCsv(rows, fromDate, toDate, selectedColumns);
      setIsExportOpen(false);
    } catch (caught) {
      toast.error(getUserErrorMessage(caught, "Transferhistorikken kunne ikke opdateres. Prøv igen."));
    } finally {
      setIsExporting(false);
    }
  }

  function openTransfer(transferId: Id<"transfers">) {
    setIsEditing(false);
    setSelectedTransferId(transferId);
  }

  async function confirmDelete() {
    if (!selectedTransferId) return;
    setIsDeleting(true);
    try {
      await deleteTransfer({ transferId: selectedTransferId });
      toast.success("Transferen er slettet");
      setIsDeleteOpen(false);
      setSelectedTransferId(null);
      setIsEditing(false);
    } catch (caught) {
      toast.error(getUserErrorMessage(caught, "Transferhistorikken kunne ikke opdateres. Prøv igen."));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <FieldGroup className="md:flex-row md:items-end">
          <Field data-invalid={Boolean(rangeError)}>
            <FieldLabel htmlFor="transfer-from-date">Fra dato</FieldLabel>
            <Input
              id="transfer-from-date"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="h-11"
              aria-invalid={Boolean(rangeError)}
              required
            />
          </Field>
          <Field data-invalid={Boolean(rangeError)}>
            <FieldLabel htmlFor="transfer-to-date">Til dato</FieldLabel>
            <Input
              id="transfer-to-date"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="h-11"
              aria-invalid={Boolean(rangeError)}
              required
            />
          </Field>
        </FieldGroup>
        {canExport ? (
          <Button
            variant="outline"
            size="lg"
            className="min-h-11 px-4"
            disabled={Boolean(rangeError)}
            onClick={() => setIsExportOpen(true)}
          >
            <DownloadIcon data-icon="inline-start" />
            Eksportér til CSV
          </Button>
        ) : null}
      </div>

      {rangeError ? (
        <p className="text-sm text-destructive" role="alert">
          {rangeError}
        </p>
      ) : null}

      {!rangeError ? (
        <p className="text-sm text-muted-foreground">{countLabel}</p>
      ) : null}

      {showSkeleton ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : null}

      {!rangeError && !loading && transfers.length === 0 ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ArrowLeftRightIcon />
            </EmptyMedia>
            <EmptyTitle>Ingen transfers i perioden</EmptyTitle>
            <EmptyDescription>
              Prøv en anden periode, eller opret en ny transfer.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {!showSkeleton && !rangeError && transfers.length > 0 ? (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tidspunkt</TableHead>
                <TableHead>Fra lokation</TableHead>
                <TableHead>Til lokation</TableHead>
                <TableHead>Ansvarlig</TableHead>
                <TableHead>
                  <span className="flex items-center justify-end gap-1">
                    Antal enheder
                    <HelpTooltip
                      label="Antal enheder"
                      content="Summen af alle registrerede mængder i transferen. Produkterne kan bruge forskellige enheder."
                    />
                  </span>
                </TableHead>
                <TableHead>Kommentar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((transfer) => (
                <TableRow
                  key={transfer.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Åbn transfer fra ${transfer.fromLocationName} til ${transfer.toLocationName}${transfer.hasTemperatureDeviation ? " med temperaturafvigelse" : ""}`}
                  className="cursor-pointer focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                  onClick={() => openTransfer(transfer.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openTransfer(transfer.id);
                    }
                  }}
                >
                  <TableCell>
                    <span className="flex items-center gap-1">
                      {transfer.hasTemperatureDeviation ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span className="inline-flex text-warning" />
                            }
                          >
                            <TriangleAlertIcon
                              aria-hidden="true"
                              className="size-4"
                            />
                            <span className="sr-only">
                              Temperaturafvigelse
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Transferen har en temperaturafvigelse
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                      <span>{dateTimeFormatter.format(transfer.transferredAt)}</span>
                    </span>
                  </TableCell>
                  <TableCell>{transfer.fromLocationName}</TableCell>
                  <TableCell>{transfer.toLocationName}</TableCell>
                  <TableCell>{transfer.responsibleName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {transfer.totalQuantity}
                  </TableCell>
                  <TableCell className="max-w-56 truncate">
                    {transfer.comment ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {!rangeError &&
      (paginationStatus === "CanLoadMore" ||
        paginationStatus === "LoadingMore") ? (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="lg"
            className="min-h-11 px-5"
            disabled={paginationStatus === "LoadingMore"}
            onClick={() => loadMore(25)}
          >
            {paginationStatus === "LoadingMore" ? (
              <Spinner data-icon="inline-start" />
            ) : null}
            Indlæs flere
          </Button>
        </div>
      ) : null}

      <Dialog
        open={isExportOpen}
        onOpenChange={(open) => {
          if (!open && !isExporting) setIsExportOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Eksportér til CSV</DialogTitle>
            <DialogDescription>
              {`Perioden ${dateFormatter.format(startOfDay(fromDate))} – ${dateFormatter.format(endOfDay(toDate))}`}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <FieldSet>
              <FieldLegend
                variant="label"
                className="flex items-center gap-1"
              >
                Kolonner
                <HelpTooltip
                  label="Kolonner"
                  content={'Træk kolonnerne for at ændre rækkefølgen. Flyt en kolonne til "Ikke med i eksporten" for at udelade den.'}
                />
              </FieldLegend>
              <ExportColumnList
                order={columnOrder}
                enabled={enabledColumns}
                onChange={(next) => updateExportPrefs(next)}
              />
            </FieldSet>

            <FieldSet>
              <FieldLegend
                variant="label"
                className="flex items-center gap-1"
              >
                Enheder
                <HelpTooltip
                  label="Enheder"
                  content="Alle transferlinjer omregnes til produktets standardenhed, så mængderne kan sammenlignes."
                />
              </FieldLegend>
              <Field orientation="horizontal">
                <Checkbox
                  id="export-default-unit"
                  checked={inDefaultUnit}
                  onCheckedChange={(checked) =>
                    updateExportPrefs({ inDefaultUnit: checked })
                  }
                />
                <FieldContent>
                  <FieldLabel htmlFor="export-default-unit">
                    Omregn til produktets standardenhed
                  </FieldLabel>
                </FieldContent>
              </Field>
            </FieldSet>
          </FieldGroup>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={isExporting}
              onClick={() => setIsExportOpen(false)}
            >
              Annullér
            </Button>
            <Button
              disabled={isExporting || selectedColumns.length === 0}
              onClick={() => void exportToCsv()}
            >
              {isExporting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <DownloadIcon data-icon="inline-start" />
              )}
              Eksportér
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedTransferId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTransferId(null);
            setIsEditing(false);
          }
        }}
      >
        <DialogContent
          className={
            isEditing
              ? "max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-5xl"
              : "sm:max-w-2xl"
          }
        >
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Redigér transfer" : "Transfer"}
            </DialogTitle>
            <DialogDescription>
              {transferDetail
                ? `${dateTimeFormatter.format(transferDetail.transferredAt)} · ${transferDetail.fromLocationName} → ${transferDetail.toLocationName}`
                : "Indlæser transferdetaljer"}
            </DialogDescription>
          </DialogHeader>

          {!isEditing && transferDetail === undefined ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : null}

          {!isEditing && transferDetail === null ? (
            <p className="text-sm text-muted-foreground">
              Transferen blev ikke fundet.
            </p>
          ) : null}

          {transferDetail && isEditing ? (
            <TransferForm
              key={transferDetail.id}
              transfer={transferDetail}
              onCancel={() => setIsEditing(false)}
              onSaved={() => setIsEditing(false)}
            />
          ) : null}

          {transferDetail && !isEditing ? (
            <div className="flex flex-col gap-4">
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Ansvarlig</dt>
                  <dd className="font-medium">
                    {transferDetail.responsibleName}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Kommentar</dt>
                  <dd className="font-medium">
                    {transferDetail.comment ?? "—"}
                  </dd>
                </div>
                {transferDetail.receiptStatus ? (
                  <div>
                    <dt className="text-muted-foreground">Varemodtagelse</dt>
                    <dd>
                      <Badge
                        variant={
                          transferDetail.receiptStatus === "registered"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {transferDetail.receiptStatus === "registered"
                          ? "Registreret"
                          : "Afventer"}
                      </Badge>
                    </dd>
                  </div>
                ) : null}
              </dl>
              <div className="overflow-hidden rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produkt</TableHead>
                      <TableHead>Enhed</TableHead>
                      <TableHead className="text-right">Sendt</TableHead>
                      {transferDetail.receiptStatus === "registered" ? (
                        <TableHead className="text-right">Modtaget</TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailGroups.flatMap((group) => {
                      const first = group[0];
                      if (!first) return [];
                      const measured = first.temperatureCelsius;
                      const maximum = first.maxTemperatureCelsius;
                      const hasDeviation =
                        measured !== null &&
                        maximum !== null &&
                        measured > maximum;
                      return [
                        <TableRow key={`${first.productId}-temperature`}>
                          <TableCell
                            colSpan={
                              transferDetail.receiptStatus === "registered"
                                ? 4
                                : 3
                            }
                          >
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="font-medium">
                                {first.productName}
                              </span>
                              {hasDeviation ? (
                                <Badge variant="outline" className="text-warning">
                                  <TriangleAlertIcon
                                    aria-hidden="true"
                                    data-icon="inline-start"
                                  />
                                  <span>Temperaturafvigelse</span>
                                  <span className="sr-only">
                                    Temperaturen overstiger maksimum.
                                  </span>
                                </Badge>
                              ) : null}
                            </div>
                            <p
                              className={cn(
                                "text-sm text-muted-foreground",
                                hasDeviation && "text-warning",
                              )}
                            >
                              Temperatur: {measured === null ? "Ikke registreret" : `${formatTemperature(measured)} °C`} · Maks. temperatur: {maximum === null ? "Ikke angivet" : `${formatTemperature(maximum)} °C`}
                              {hasDeviation && measured !== null && maximum !== null ? (
                                <span className="sr-only">
                                  Målt temperatur {formatTemperature(measured)} °C,
                                  maksimum {formatTemperature(maximum)} °C.
                                </span>
                              ) : null}
                            </p>
                          </TableCell>
                        </TableRow>,
                        ...group.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.productName}
                            </TableCell>
                            <TableCell>{item.unitName}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {item.quantity}
                            </TableCell>
                            {transferDetail.receiptStatus === "registered" ? (
                              <TableCell className="text-right tabular-nums">
                                {item.receivedQuantity ?? 0}
                              </TableCell>
                            ) : null}
                          </TableRow>
                        )),
                      ];
                    })}
                  </TableBody>
                </Table>
              </div>
              {transferDetail.receiptStatus === "registered" ? (
                <Alert>
                  <CircleCheckBigIcon />
                  <AlertTitle>Varemodtagelsen er registreret</AlertTitle>
                  <AlertDescription>
                    Transferen kan ikke redigeres eller slettes, fordi lageret
                    er opdateret med de modtagne mængder.
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}

          {transferDetail &&
          !isEditing &&
          transferDetail.receiptStatus !== "registered" ? (
            <DialogFooter className="sm:justify-between">
              <Button
                variant="destructive"
                size="lg"
                className="min-h-11 px-5"
                onClick={() => setIsDeleteOpen(true)}
              >
                <Trash2Icon data-icon="inline-start" />
                Slet transfer
              </Button>
              <Button
                size="lg"
                className="min-h-11 px-5"
                onClick={() => setIsEditing(true)}
              >
                <PencilIcon data-icon="inline-start" />
                Redigér transfer
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={isDeleteOpen}
        onOpenChange={(open) => {
          if (!isDeleting) setIsDeleteOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet transfer?</AlertDialogTitle>
            <AlertDialogDescription>
              Transferen og alle dens produktlinjer slettes permanent. Handlingen
              kan ikke fortrydes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Annullér
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={() => void confirmDelete()}
            >
              {isDeleting ? <Spinner data-icon="inline-start" /> : null}
              Slet transfer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
