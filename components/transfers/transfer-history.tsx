"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useConvex, usePaginatedQuery, useQuery } from "convex/react";
import {
  ArrowLeftRightIcon,
  DownloadIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useDelayedLoading } from "@/components/catalog/use-delayed-loading";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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

export function TransferHistory() {
  const convex = useConvex();
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [selectedTransferId, setSelectedTransferId] =
    useState<Id<"transfers"> | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [columnKeys, setColumnKeys] = useState(() =>
    exportColumns.map((column) => column.key),
  );
  const [inDefaultUnit, setInDefaultUnit] = useState(false);

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

  const selectedColumns = exportColumns.filter((column) =>
    columnKeys.includes(column.key),
  );

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
        <div className="flex flex-col gap-3 sm:flex-row">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="min-h-11 px-4"
                />
              }
            >
              <SlidersHorizontalIcon data-icon="inline-start" />
              Eksportindstillinger
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Kolonner</DropdownMenuLabel>
              {exportColumns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.key}
                  className="min-h-10"
                  checked={columnKeys.includes(column.key)}
                  onCheckedChange={(checked) =>
                    setColumnKeys((current) =>
                      checked
                        ? [...current, column.key]
                        : current.filter((key) => key !== column.key),
                    )
                  }
                >
                  {column.label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Enheder</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                className="min-h-10"
                checked={inDefaultUnit}
                onCheckedChange={(checked) => setInDefaultUnit(checked)}
              >
                Omregn til produktets standardenhed
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="lg"
            className="min-h-11 px-4"
            disabled={
              isExporting ||
              Boolean(rangeError) ||
              selectedColumns.length === 0
            }
            onClick={() => void exportToExcel()}
          >
            {isExporting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <DownloadIcon data-icon="inline-start" />
            )}
            Eksportér til Excel
          </Button>
        </div>
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
