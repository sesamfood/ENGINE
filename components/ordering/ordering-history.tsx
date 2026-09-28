"use client";

import { useConvex, usePaginatedQuery, useQuery } from "convex/react";
import { DownloadIcon, HistoryIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AppPageHeader } from "@/components/app-page-header";
import { useLocationAccess, usePermission } from "@/components/app-shell";
import { LocationField } from "@/components/location-field";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  FieldError,
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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { dateKey, DEFAULT_TIME_ZONE, inclusiveDateRangeDays } from "@/lib/date";
import { selectedLocationId } from "@/lib/location-preference";
import { downloadOrderCsv } from "@/lib/ordering-csv";
import { setOrderingLocation, useOrderingLocation } from "@/lib/ordering-prefs";
import { getUserErrorMessage } from "@/lib/user-errors";

const PAGE_SIZE = 25;
const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
  timeZone: "UTC",
});
const timestampFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: DEFAULT_TIME_ZONE,
});
const numberFormatter = new Intl.NumberFormat("da-DK", {
  maximumFractionDigits: 6,
});

function formatPeriod(fromDate: string, toDate: string) {
  return `${dateFormatter.format(new Date(`${fromDate}T00:00:00Z`))} til ${dateFormatter.format(new Date(`${toDate}T00:00:00Z`))}`;
}

function OrderDetails({ orderId }: { orderId: Id<"orders"> }) {
  const order = useQuery(api.ordering.getHistory, { orderId });
  const convex = useConvex();
  const canExport = usePermission("ordering.export");
  const [exporting, setExporting] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function exportOrder() {
    if (exporting || !canExport) return;
    setExporting(true);
    try {
      const result = await convex.query(api.ordering.exportHistory, { orderId });
      if (!mounted.current) return;
      downloadOrderCsv(result);
      toast.success("Bestillingen er eksporteret som CSV");
    } catch (error) {
      if (mounted.current)
        toast.error(
          getUserErrorMessage(error, "Bestillingen kunne ikke eksporteres"),
        );
    } finally {
      if (mounted.current) setExporting(false);
    }
  }

  if (order === undefined) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Bestilling</DialogTitle>
          <DialogDescription>Henter bestillingen…</DialogDescription>
        </DialogHeader>
        <Skeleton className="h-64 w-full" />
        <DialogFooter showCloseButton />
      </>
    );
  }

  if (!order) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Bestilling ikke fundet</DialogTitle>
          <DialogDescription>
            Bestillingen findes ikke, eller du har ikke adgang til den.
          </DialogDescription>
        </DialogHeader>
        <div />
        <DialogFooter showCloseButton />
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Bestilling fra {timestampFormatter.format(order.createdAt)}
        </DialogTitle>
        <DialogDescription>{order.locationName}</DialogDescription>
      </DialogHeader>
      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Dækker perioden</dt>
            <dd>{formatPeriod(order.fromDate, order.toDate)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Afgivet af</dt>
            <dd>{order.createdByName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Buffer</dt>
            <dd>{numberFormatter.format(order.bufferPercent)} %</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Produkter</dt>
            <dd>{numberFormatter.format(order.itemCount)}</dd>
          </div>
        </dl>
        <div className="shrink-0 overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produkt</TableHead>
                <TableHead className="text-right">Mængde</TableHead>
                <TableHead>Enhed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.rows.map((row) => (
                <TableRow key={row.productId}>
                  <TableCell
                    appearance="label"
                    className="whitespace-normal break-words"
                  >
                    {row.productName}
                  </TableCell>
                  <TableCell appearance="numeric" className="text-right">
                    {numberFormatter.format(row.quantity)}
                  </TableCell>
                  <TableCell>{row.unitName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      <DialogFooter showCloseButton>
        {canExport ? (
          <Button disabled={exporting} onClick={() => void exportOrder()}>
            {exporting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <DownloadIcon data-icon="inline-start" />
            )}
            Eksportér CSV
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}

function HistoryList({
  locationId,
  fromDate,
  toDate,
}: {
  locationId: Id<"locations">;
  fromDate: string;
  toDate: string;
}) {
  const [selectedOrderId, setSelectedOrderId] =
    useState<Id<"orders"> | null>(null);
  const { results, status, loadMore } = usePaginatedQuery(
    api.ordering.listHistory,
    { locationId, range: { fromDate, toDate } },
    { initialNumItems: PAGE_SIZE },
  );

  return (
    <div className="flex flex-col gap-5">
      {status === "LoadingFirstPage" ? (
        <Skeleton className="h-64 w-full" />
      ) : results.length === 0 ? (
        <Empty appearance="outlined" className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HistoryIcon />
            </EmptyMedia>
            <EmptyTitle>Ingen bestillinger i perioden</EmptyTitle>
            <EmptyDescription>
              Vælg en anden periode, eller afgiv en ny bestilling.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Afgivet</TableHead>
                  <TableHead>Dækker perioden</TableHead>
                  <TableHead>Afgivet af</TableHead>
                  <TableHead className="text-right">Produkter</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((order) => (
                  <TableRow
                    key={order._id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Åbn bestilling fra ${timestampFormatter.format(order.createdAt)}`}
                    aria-haspopup="dialog"
                    appearance="selectable"
                    className="h-14 cursor-pointer"
                    onClick={() => setSelectedOrderId(order._id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedOrderId(order._id);
                      }
                    }}
                  >
                    <TableCell>
                      {timestampFormatter.format(order.createdAt)}
                    </TableCell>
                    <TableCell>
                      {formatPeriod(order.fromDate, order.toDate)}
                    </TableCell>
                    <TableCell className="max-w-60 whitespace-normal break-words">
                      {order.createdByName}
                    </TableCell>
                    <TableCell appearance="numeric" className="text-right">
                      {numberFormatter.format(order.itemCount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col gap-3 lg:hidden">
            {results.map((order) => (
              <li key={order._id}>
                <Card
                  role="button"
                  tabIndex={0}
                  aria-label={`Åbn bestilling fra ${timestampFormatter.format(order.createdAt)}`}
                  aria-haspopup="dialog"
                  appearance="menu"
                  className="cursor-pointer"
                  onClick={() => setSelectedOrderId(order._id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedOrderId(order._id);
                    }
                  }}
                >
                  <CardHeader>
                    <CardTitle>
                      {timestampFormatter.format(order.createdAt)}
                    </CardTitle>
                    <CardDescription>
                      Dækker {formatPeriod(order.fromDate, order.toDate)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-1">
                      <p>{numberFormatter.format(order.itemCount)} produkter</p>
                      <p className="break-words text-muted-foreground">
                        Afgivet af {order.createdByName}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(PAGE_SIZE)}
          >
            {status === "LoadingMore" ? (
              <Spinner data-icon="inline-start" />
            ) : null}
            Vis flere bestillinger
          </Button>
        </div>
      ) : null}
      <Dialog
        open={selectedOrderId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedOrderId(null);
        }}
      >
        <DialogContent className="max-h-(--spacing-dialog-dynamic) grid-rows-(--grid-rows-panel) sm:max-w-2xl">
          {selectedOrderId ? (
            <OrderDetails key={selectedOrderId} orderId={selectedOrderId} />
          ) : (
            <DialogHeader>
              <DialogTitle>Bestilling</DialogTitle>
            </DialogHeader>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function History({ organizationId }: { organizationId: string }) {
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const [fromDate, setFromDate] = useState(
    () => `${dateKey(Date.now(), DEFAULT_TIME_ZONE).slice(0, 8)}01`,
  );
  const [toDate, setToDate] = useState(
    () => dateKey(Date.now(), DEFAULT_TIME_ZONE),
  );
  const rangeDays = inclusiveDateRangeDays(fromDate, toDate);
  const rangeError = !Number.isFinite(rangeDays)
    ? "Vælg både fra- og til-dato"
    : rangeDays < 1
      ? "Fra-dato skal være før eller samme dag som til-dato"
      : null;
  const storedLocationId = useOrderingLocation(organizationId);
  const locationId = selectedLocationId({
    locations,
    storedId: storedLocationId,
    lockedId,
    isLocked,
  });

  return (
    <div className="flex flex-col gap-5 pb-(--spacing-safe-actions-compact)">
      <AppPageHeader>
        <div className="grid gap-5 sm:grid-cols-(--grid-cols-page-header) sm:items-end">
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              Bestilling
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Bestillingshistorik
            </h1>
          </div>
          <Field>
            <FieldLabel htmlFor="ordering-history-location">Lokation</FieldLabel>
            <LocationField
              id="ordering-history-location"
              locations={locations}
              value={locationId}
              onValueChange={(value) => setOrderingLocation(organizationId, value)}
              locked={isLocked}
              lockedName={lockedName}
            />
          </Field>
        </div>
      </AppPageHeader>
      <FieldSet className="max-w-lg">
        <FieldLegend>Afgivet i perioden</FieldLegend>
        <FieldGroup className="grid sm:grid-cols-2">
          <Field data-invalid={Boolean(rangeError)}>
            <FieldLabel htmlFor="ordering-history-from">Fra dato</FieldLabel>
            <Input
              id="ordering-history-from"
              type="date"
              className="h-11"
              value={fromDate}
              max={toDate || undefined}
              onChange={(event) => setFromDate(event.target.value)}
              aria-invalid={Boolean(rangeError)}
              aria-describedby={rangeError ? "ordering-history-range-error" : undefined}
              required
            />
          </Field>
          <Field data-invalid={Boolean(rangeError)}>
            <FieldLabel htmlFor="ordering-history-to">Til dato</FieldLabel>
            <Input
              id="ordering-history-to"
              type="date"
              className="h-11"
              value={toDate}
              min={fromDate || undefined}
              onChange={(event) => setToDate(event.target.value)}
              aria-invalid={Boolean(rangeError)}
              aria-describedby={rangeError ? "ordering-history-range-error" : undefined}
              required
            />
          </Field>
        </FieldGroup>
        {rangeError ? (
          <FieldError id="ordering-history-range-error">{rangeError}</FieldError>
        ) : null}
      </FieldSet>
      {locationId ? (
        !rangeError ? (
          <HistoryList
            key={`${locationId}:${fromDate}:${toDate}`}
            locationId={locationId}
            fromDate={fromDate}
            toDate={toDate}
          />
        ) : null
      ) : (
        <Empty appearance="outlined" className="min-h-72">
          <EmptyHeader>
            <EmptyTitle>Ingen lokationer</EmptyTitle>
            <EmptyDescription>
              Du skal have adgang til en lokation for at se bestillingshistorik.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}

export function OrderingHistory() {
  const { data: session } = authClient.useSession();
  const organizationId = session?.session.activeOrganizationId;
  if (!organizationId) return <Skeleton className="h-96 w-full" />;
  return (
    <History
      key={`${organizationId}:${session.user.id}`}
      organizationId={organizationId}
    />
  );
}
