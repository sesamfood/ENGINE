"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useConvex, usePaginatedQuery, useQuery } from "convex/react";
import { ArrowLeftRightIcon, DownloadIcon, GripVerticalIcon } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useDelayedLoading } from "@/components/catalog/use-delayed-loading";
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
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
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
};

type TransferDetail = {
  id: Id<"transfers">;
  transferredAt: number;
  fromLocationName: string;
  toLocationName: string;
  responsibleName: string;
  comment: string | null;
  items: Array<{
    id: Id<"transferItems">;
    productName: string;
    unitName: string;
    quantity: number;
  }>;
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
};

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
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
  if (/[;"\r\n]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
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
    label: "Fra butik",
    value: (row) => row.fromLocationName,
  },
  { key: "toLocation", label: "Til butik", value: (row) => row.toLocationName },
  {
    key: "responsible",
    label: "Ansvarlig",
    value: (row) => row.responsibleName,
  },
  { key: "product", label: "Vare", value: (row) => row.productName },
  { key: "unit", label: "Enhed", value: (row) => row.unitName },
  {
    key: "quantity",
    label: "Antal",
    value: (row) => String(row.quantity).replace(".", ","),
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
    order: defaultColumnOrder,
    enabled: defaultColumnOrder,
    inDefaultUnit: false,
  };
  if (!value || typeof value !== "object") return defaults;
  const raw = value as Partial<ExportPrefs>;
  const knownOrder = Array.isArray(raw.order)
    ? raw.order.filter(
        (key): key is string =>
          typeof key === "string" && exportColumnByKey.has(key),
      )
    : [];
  const order = [
    ...knownOrder,
    ...defaultColumnOrder.filter((key) => !knownOrder.includes(key)),
  ];
  const enabledRaw = Array.isArray(raw.enabled)
    ? raw.enabled.filter(
        (key): key is string =>
          typeof key === "string" && exportColumnByKey.has(key),
      )
    : order;
  return {
    order,
    enabled: enabledRaw.length > 0 ? enabledRaw : order,
    inDefaultUnit: Boolean(raw.inDefaultUnit),
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

type ColumnDragState = {
  key: string;
  label: string;
  pointerId: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  overZone: ColumnZone | null;
};

function listsEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function placeColumn(
  key: string,
  included: string[],
  excluded: string[],
  zone: ColumnZone,
  index: number,
) {
  const nextIncluded = included.filter((item) => item !== key);
  const nextExcluded = excluded.filter((item) => item !== key);
  const target = zone === "included" ? nextIncluded : nextExcluded;
  const clamped = Math.max(0, Math.min(index, target.length));
  target.splice(clamped, 0, key);
  return { included: nextIncluded, excluded: nextExcluded };
}

function dropIndexForY(
  clientY: number,
  zoneElement: HTMLElement,
  draggingKey: string,
) {
  const rows = [
    ...zoneElement.querySelectorAll<HTMLElement>("[data-column-key]"),
  ].filter((row) => row.dataset.columnKey !== draggingKey);

  if (rows.length === 0) return 0;

  for (let index = 0; index < rows.length; index++) {
    const rect = rows[index].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return index;
  }
  return rows.length;
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
  const rootRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [included, setIncluded] = useState(() =>
    order.filter((key) => enabled.includes(key)),
  );
  const [excluded, setExcluded] = useState(() =>
    order.filter((key) => !enabled.includes(key)),
  );
  const includedRef = useRef(included);
  const excludedRef = useRef(excluded);
  const [drag, setDrag] = useState<ColumnDragState | null>(null);
  const dragRef = useRef<ColumnDragState | null>(null);

  // Keep the draft lists aligned with saved prefs when not mid-drag.
  useEffect(() => {
    if (dragRef.current) return;
    const nextIncluded = order.filter((key) => enabled.includes(key));
    const nextExcluded = order.filter((key) => !enabled.includes(key));
    if (
      listsEqual(nextIncluded, includedRef.current) &&
      listsEqual(nextExcluded, excludedRef.current)
    ) {
      return;
    }
    includedRef.current = nextIncluded;
    excludedRef.current = nextExcluded;
    setIncluded(nextIncluded);
    setExcluded(nextExcluded);
  }, [order, enabled]);

  useEffect(() => {
    if (!drag) return;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "grabbing";
    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [drag]);

  function commitLists(nextIncluded: string[], nextExcluded: string[]) {
    includedRef.current = nextIncluded;
    excludedRef.current = nextExcluded;
    setIncluded(nextIncluded);
    setExcluded(nextExcluded);
  }

  function moveGhost(x: number, y: number, offsetX: number, offsetY: number) {
    const ghost = ghostRef.current;
    if (!ghost) return;
    ghost.style.transform = `translate3d(${x - offsetX}px, ${y - offsetY}px, 0) rotate(-1.5deg) scale(1.02)`;
  }

  function applyHover(clientY: number) {
    const current = dragRef.current;
    const root = rootRef.current;
    if (!current || !root) return;

    const includedZone = root.querySelector<HTMLElement>(
      '[data-zone="included"]',
    );
    const excludedZone = root.querySelector<HTMLElement>(
      '[data-zone="excluded"]',
    );
    if (!includedZone || !excludedZone) return;

    const includedRect = includedZone.getBoundingClientRect();
    const excludedRect = excludedZone.getBoundingClientRect();
    const midGap = (includedRect.bottom + excludedRect.top) / 2;
    const overZone: ColumnZone =
      clientY >= excludedRect.top
        ? "excluded"
        : clientY <= includedRect.bottom
          ? "included"
          : clientY < midGap
            ? "included"
            : "excluded";

    const zoneElement = overZone === "included" ? includedZone : excludedZone;
    const index = dropIndexForY(clientY, zoneElement, current.key);
    const next = placeColumn(
      current.key,
      includedRef.current,
      excludedRef.current,
      overZone,
      index,
    );

    if (
      !listsEqual(next.included, includedRef.current) ||
      !listsEqual(next.excluded, excludedRef.current)
    ) {
      commitLists(next.included, next.excluded);
    }

    if (current.overZone !== overZone) {
      const nextDrag = { ...current, overZone };
      dragRef.current = nextDrag;
      setDrag(nextDrag);
    }
  }

  function finishDrag() {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDrag(null);
    onChange({
      order: [...includedRef.current, ...excludedRef.current],
      enabled: includedRef.current,
    });
  }

  function startDrag(
    event: React.PointerEvent<HTMLElement>,
    key: string,
    label: string,
  ) {
    if (event.button !== 0) return;
    const row = event.currentTarget.closest<HTMLElement>("[data-column-key]");
    if (!row) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = row.getBoundingClientRect();
    const nextDrag: ColumnDragState = {
      key,
      label,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      overZone: includedRef.current.includes(key) ? "included" : "excluded",
    };
    dragRef.current = nextDrag;
    setDrag(nextDrag);
    requestAnimationFrame(() => {
      moveGhost(nextDrag.x, nextDrag.y, nextDrag.offsetX, nextDrag.offsetY);
    });
  }

  function onPointerMove(event: React.PointerEvent<HTMLElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    current.x = event.clientX;
    current.y = event.clientY;
    moveGhost(current.x, current.y, current.offsetX, current.offsetY);
    applyHover(event.clientY);
  }

  function renderRow(key: string, zone: ColumnZone) {
    const column = exportColumnByKey.get(key);
    if (!column) return null;
    const isDragging = drag?.key === key;

    return (
      <li
        key={key}
        data-column-key={key}
        data-zone-item={zone}
        className={cn(
          "relative flex min-h-11 touch-none items-center gap-2 rounded-lg border px-2 transition-[box-shadow,opacity,border-color] duration-150 select-none",
          isDragging
            ? "border-dashed border-primary/40 bg-muted/40 opacity-40"
            : "border-border bg-background shadow-sm",
          drag ? "cursor-grabbing" : "cursor-grab",
        )}
        aria-label={`Flyt ${column.label}`}
        onPointerDown={(event) => startDrag(event, key, column.label)}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <span className="flex size-11 shrink-0 items-center justify-center text-muted-foreground">
          <GripVerticalIcon aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {column.label}
        </span>
      </li>
    );
  }

  function renderZone(
    zone: ColumnZone,
    keys: string[],
    title: string,
    emptyLabel: string,
  ) {
    const isActive = drag?.overZone === zone;
    return (
      <section
        data-zone={zone}
        className={cn(
          "rounded-xl border p-3 transition-colors",
          isActive
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/20",
        )}
      >
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-xs text-muted-foreground">
            {`${keys.length} ${keys.length === 1 ? "kolonne" : "kolonner"}`}
          </p>
        </div>
        <ul
          className={cn(
            "flex min-h-16 flex-col gap-1",
            keys.length === 0 &&
              "items-center justify-center rounded-lg border border-dashed border-border px-3 py-5 text-center text-sm text-muted-foreground",
          )}
          aria-label={title}
        >
          {keys.length === 0
            ? emptyLabel
            : keys.map((key) => renderRow(key, zone))}
        </ul>
      </section>
    );
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      {renderZone(
        "included",
        included,
        "Med i eksporten",
        "Træk kolonner hertil",
      )}
      {renderZone(
        "excluded",
        excluded,
        "Ikke med i eksporten",
        "Træk kolonner hertil for at skjule dem",
      )}
      {drag
        ? createPortal(
            <div
              ref={ghostRef}
              aria-hidden="true"
              className="pointer-events-none fixed top-0 left-0 z-[200] flex items-center gap-2 rounded-lg border border-primary bg-background px-2 shadow-lg ring-1 ring-foreground/10 will-change-transform"
              style={{
                width: drag.width,
                height: drag.height,
              }}
            >
              <span className="flex size-11 shrink-0 items-center justify-center text-muted-foreground">
                <GripVerticalIcon aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {drag.label}
              </span>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function TransferHistory() {
  const convex = useConvex();
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [selectedTransferId, setSelectedTransferId] =
    useState<Id<"transfers"> | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
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

  const rangeError =
    fromDate && toDate && startOfDay(fromDate) > endOfDay(toDate)
      ? "Fra-dato skal være før eller samme dag som til-dato"
      : null;

  const startAt = rangeError ? null : startOfDay(fromDate);
  const endAt = rangeError ? null : endOfDay(toDate);

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

  async function exportToExcel() {
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
      const rows = (await convex.query(api.transfers.exportTransfers, {
        startAt,
        endAt,
        inDefaultUnit,
      })) as ExportRow[];
      if (rows.length === 0) {
        toast.error("Ingen transfers i den valgte periode");
        return;
      }
      downloadTransfersCsv(rows, fromDate, toDate, selectedColumns);
      setIsExportOpen(false);
    } catch (caught) {
      toast.error(messageFrom(caught));
    } finally {
      setIsExporting(false);
    }
  }

  function openTransfer(transferId: Id<"transfers">) {
    setSelectedTransferId(transferId);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <FieldGroup className="md:flex-row md:items-end">
          <Field>
            <FieldLabel htmlFor="transfer-from-date">Fra dato</FieldLabel>
            <Input
              id="transfer-from-date"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="h-11"
              aria-invalid={Boolean(rangeError)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="transfer-to-date">Til dato</FieldLabel>
            <Input
              id="transfer-to-date"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="h-11"
              aria-invalid={Boolean(rangeError)}
            />
          </Field>
        </FieldGroup>
        <Button
          variant="outline"
          size="lg"
          className="min-h-11 px-4"
          disabled={Boolean(rangeError)}
          onClick={() => setIsExportOpen(true)}
        >
          <DownloadIcon data-icon="inline-start" />
          Eksportér til Excel
        </Button>
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
                <TableHead>Fra butik</TableHead>
                <TableHead>Til butik</TableHead>
                <TableHead>Ansvarlig</TableHead>
                <TableHead className="text-right">Antal enheder</TableHead>
                <TableHead>Kommentar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.map((transfer) => (
                <TableRow
                  key={transfer.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Åbn transfer fra ${transfer.fromLocationName} til ${transfer.toLocationName}`}
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
                    {dateTimeFormatter.format(transfer.transferredAt)}
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Eksportér til Excel</DialogTitle>
            <DialogDescription>
              {`Perioden ${dateFormatter.format(startOfDay(fromDate))} – ${dateFormatter.format(endOfDay(toDate))}`}
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <FieldSet>
              <FieldLegend variant="label">Kolonner</FieldLegend>
              <FieldDescription>
                Træk kolonner for at ændre rækkefølgen. Træk dem ned i området
                nedenunder for at lade dem ude af eksporten.
              </FieldDescription>
              <ExportColumnList
                order={columnOrder}
                enabled={enabledColumns}
                onChange={(next) => updateExportPrefs(next)}
              />
            </FieldSet>

            <FieldSet>
              <FieldLegend variant="label">Enheder</FieldLegend>
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
                  <FieldDescription>
                    Alle linjer omregnes til den standardenhed, produktet er
                    oprettet med, så antallene kan sammenlignes.
                  </FieldDescription>
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
              Annuller
            </Button>
            <Button
              disabled={isExporting || selectedColumns.length === 0}
              onClick={() => void exportToExcel()}
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
          if (!open) setSelectedTransferId(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Transfer</DialogTitle>
            <DialogDescription>
              {transferDetail
                ? `${dateTimeFormatter.format(transferDetail.transferredAt)} · ${transferDetail.fromLocationName} → ${transferDetail.toLocationName}`
                : "Indlæser transferdetaljer"}
            </DialogDescription>
          </DialogHeader>

          {transferDetail === undefined ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : null}

          {transferDetail === null ? (
            <p className="text-sm text-muted-foreground">
              Transferen blev ikke fundet.
            </p>
          ) : null}

          {transferDetail ? (
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
              </dl>
              <div className="overflow-hidden rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vare</TableHead>
                      <TableHead>Enhed</TableHead>
                      <TableHead className="text-right">Antal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transferDetail.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.productName}
                        </TableCell>
                        <TableCell>{item.unitName}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.quantity}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
