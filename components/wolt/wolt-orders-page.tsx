"use client";

import {
  CalendarDaysIcon,
  CircleAlertIcon,
  ListFilterIcon,
  MapPinIcon,
  PackageCheckIcon,
  SearchIcon,
} from "lucide-react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { useAccess, usePermission } from "@/components/app-shell";
import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import {
  formatWoltDateTime,
  formatWoltMoney,
  woltOrderTypeLabels,
  woltStatusLabels,
  woltStatusVariant,
} from "./wolt-format";
import { WoltOrderDetail } from "./wolt-order-detail";
import type { WoltOrderStatus, WoltOrderSummary, WoltOrderType } from "./wolt-types";

const MAX_ORDER_RANGE_MS = 90 * 24 * 60 * 60 * 1_000;

const statusOptions: Array<{ value: WoltOrderStatus | "all"; label: string }> = [
  { value: "all", label: "Alle statusser" },
  { value: "created", label: woltStatusLabels.created },
  { value: "production", label: woltStatusLabels.production },
  { value: "ready", label: woltStatusLabels.ready },
  { value: "delivered", label: woltStatusLabels.delivered },
  { value: "canceled", label: woltStatusLabels.canceled },
  { value: "other", label: woltStatusLabels.other },
];

const orderTypeOptions: Array<{ value: WoltOrderType | "all"; label: string }> = [
  { value: "all", label: "Alle ordretyper" },
  { value: "instant", label: woltOrderTypeLabels.instant },
  { value: "preorder", label: woltOrderTypeLabels.preorder },
  { value: "other", label: woltOrderTypeLabels.other },
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function defaultFromDate() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return dateInputValue(date);
}

function defaultToDate() {
  return dateInputValue(new Date());
}

function localDayStart(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return Number.NaN;
  return new Date(year, month - 1, day).getTime();
}

function locationNames(names: string[]) {
  const visible = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${visible} og ${names.length - 3} flere` : visible;
}

function isWoltStatus(value: string): value is WoltOrderStatus {
  return statusOptions.some((option) => option.value === value && option.value !== "all");
}

function isWoltOrderType(value: string): value is WoltOrderType {
  return orderTypeOptions.some((option) => option.value === value && option.value !== "all");
}

function FilterSelect<T extends string>({
  id,
  label,
  value,
  options,
  onValueChange,
}: {
  id: string;
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onValueChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={options}
        value={value}
        onValueChange={(next) => next && onValueChange(next)}
      >
        <SelectTrigger id={id} className="h-11 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function OrderStatus({ order }: { order: WoltOrderSummary }) {
  return (
    <Badge variant={woltStatusVariant(order.status)}>
      {woltStatusLabels[order.status]}
    </Badge>
  );
}

function OrderCard({
  order,
  onOpen,
}: {
  order: WoltOrderSummary;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="flex min-h-11 w-full flex-col gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">Wolt-ordre {order.displayNumber}</p>
          <p className="text-sm text-muted-foreground">
            {formatWoltDateTime(order.occurredAt)}
          </p>
        </div>
        <OrderStatus order={order} />
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div className="min-w-0">
          <dt className="text-muted-foreground">Lokation</dt>
          <dd className="truncate font-medium">{order.locationName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Type</dt>
          <dd className="font-medium">{woltOrderTypeLabels[order.orderType]}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Netto kurv</dt>
          <dd className="font-medium">{formatWoltMoney(order.netRevenue, order.currency)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Varer</dt>
          <dd className="font-medium">{order.itemCount}</dd>
        </div>
      </dl>
    </button>
  );
}

function OrderList({
  results,
  status,
  loadMore,
  onOpen,
}: {
  results: WoltOrderSummary[];
  status: string;
  loadMore: (numItems: number) => void;
  onOpen: (order: WoltOrderSummary) => void;
}) {
  if (status === "LoadingFirstPage") {
    return (
      <div className="flex flex-col gap-3" aria-label="Indlæser Wolt-ordrer">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (!results.length) {
    return (
      <Empty className="min-h-56 border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageCheckIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Ingen Wolt-ordrer</EmptyTitle>
          <EmptyDescription>
            Prøv en anden periode eller justér filtrene.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ordre</TableHead>
              <TableHead>Forretningstid</TableHead>
              <TableHead>Lokation</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Netto kurv</TableHead>
              <TableHead className="text-right">Varer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((order) => (
              <TableRow
                key={order.id}
                tabIndex={0}
                role="button"
                className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                aria-label={`Åbn Wolt-ordre ${order.displayNumber}`}
                onClick={() => onOpen(order)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(order);
                  }
                }}
              >
                <TableCell className="font-medium">{order.displayNumber}</TableCell>
                <TableCell>{formatWoltDateTime(order.occurredAt)}</TableCell>
                <TableCell>{order.locationName}</TableCell>
                <TableCell><OrderStatus order={order} /></TableCell>
                <TableCell>{woltOrderTypeLabels[order.orderType]}</TableCell>
                <TableCell className="text-right">{formatWoltMoney(order.netRevenue, order.currency)}</TableCell>
                <TableCell className="text-right">{order.itemCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col gap-3 md:hidden">
        {results.map((order) => (
          <OrderCard key={order.id} order={order} onOpen={() => onOpen(order)} />
        ))}
      </div>
      {status === "CanLoadMore" ? (
        <div className="flex justify-center pt-4">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-11"
            onClick={() => loadMore(25)}
          >
            Vis flere ordrer
          </Button>
        </div>
      ) : null}
      {status === "LoadingMore" ? (
        <div className="flex justify-center pt-4" aria-label="Indlæser flere ordrer">
          <Spinner />
        </div>
      ) : null}
    </>
  );
}

function WoltOrdersContent() {
  const access = useAccess();
  const canView = usePermission("sales.viewDetail");
  const locations = useQuery(api.wolt.getOrderLocations, canView ? {} : "skip");
  const sourceHealth = useQuery(
    api.wolt.getOrderSourceHealth,
    canView ? {} : "skip",
  );
  const [locationFilter, setLocationFilter] = useState<Id<"locations"> | "all">("all");
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [statusFilter, setStatusFilter] = useState<WoltOrderStatus | "all">("all");
  const [orderTypeFilter, setOrderTypeFilter] = useState<WoltOrderType | "all">("all");
  const [displayNumber, setDisplayNumber] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<Id<"woltOrders"> | null>(null);

  const range = useMemo(() => {
    const from = localDayStart(fromDate);
    const toStart = localDayStart(toDate);
    const to = Number.isFinite(toStart) ? toStart + 24 * 60 * 60 * 1_000 : Number.NaN;
    const valid = Number.isFinite(from) && Number.isFinite(to) && from < to;
    const withinLimit = valid && to - from <= MAX_ORDER_RANGE_MS;
    return { from, to, valid, withinLimit };
  }, [fromDate, toDate]);

  const locationId = locationFilter === "all" ? null : locationFilter;
  const listArgs =
    canView && range.valid && range.withinLimit
      ? {
          locationId,
          from: range.from,
          to: range.to,
          status: statusFilter === "all" ? null : statusFilter,
          orderType: orderTypeFilter === "all" ? null : orderTypeFilter,
          displayNumber: displayNumber.trim() || null,
        }
      : "skip";
  const { results, status, loadMore } = usePaginatedQuery(
    api.wolt.listOrders,
    listArgs,
    { initialNumItems: 25 },
  );

  if (!access) {
    return <Skeleton className="h-[32rem] w-full" />;
  }

  if (!canView) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <CircleAlertIcon aria-hidden="true" />
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at se detaljerede Wolt-ordrer.
        </AlertDescription>
      </Alert>
    );
  }

  const locationOptions = [
    { value: "all" as const, label: "Alle lokationer" },
    ...(locations ?? []).map((location) => ({ value: location.id, label: location.name })),
  ];

  return (
    <>
      {sourceHealth?.readyLocationCount === 0 ? (
        <Alert>
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Ingen aktive Wolt-forbindelser</AlertTitle>
          <AlertDescription>
            Du kan stadig se bevaret historik, men der hentes ikke nye Wolt-ordrer.
          </AlertDescription>
        </Alert>
      ) : null}
      {sourceHealth &&
      (sourceHealth.disconnectedLocationNames.length > 0 ||
        sourceHealth.staleLocationNames.length > 0 ||
        sourceHealth.errorLocationNames.length > 0 ||
        sourceHealth.backlogLocationNames.length > 0 ||
        sourceHealth.limited) ? (
        <Alert>
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Nogle Wolt-data kan være ufuldstændige</AlertTitle>
          <AlertDescription className="space-y-1">
            {sourceHealth.disconnectedLocationNames.length ? (
              <p>Ikke forbundet: {locationNames(sourceHealth.disconnectedLocationNames)}.</p>
            ) : null}
            {sourceHealth.staleLocationNames.length ? (
              <p>Ingen nylig aktivitet: {locationNames(sourceHealth.staleLocationNames)}.</p>
            ) : null}
            {sourceHealth.errorLocationNames.length ? (
              <p>Fejl eller ny godkendelse kræves: {locationNames(sourceHealth.errorLocationNames)}.</p>
            ) : null}
            {sourceHealth.backlogLocationNames.length ? (
              <p>Events venter eller er fejlet: {locationNames(sourceHealth.backlogLocationNames)}.</p>
            ) : null}
            {sourceHealth.limited ? <p>Statuslisten er afkortet.</p> : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListFilterIcon aria-hidden="true" />
            Filtrér Wolt-ordrer
          </CardTitle>
          <CardDescription>
            Vælg periode, lokation og status. Der kan vises ordrer fra højst 90 dage ad gangen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Field>
              <FieldLabel htmlFor="wolt-from-date">Fra dato</FieldLabel>
              <div className="relative">
                <CalendarDaysIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="wolt-from-date"
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                  className="h-11 pl-10"
                />
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="wolt-to-date">Til dato</FieldLabel>
              <div className="relative">
                <CalendarDaysIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="wolt-to-date"
                  type="date"
                  value={toDate}
                  onChange={(event) => setToDate(event.target.value)}
                  className="h-11 pl-10"
                />
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="wolt-location-filter">Lokation</FieldLabel>
              <Select
                items={locationOptions}
                value={locationFilter === "all" ? "all" : String(locationFilter)}
                onValueChange={(value) => {
                  if (value === "all") {
                    setLocationFilter("all");
                    return;
                  }
                  const selected = locations?.find((location) => location.id === value);
                  if (selected) setLocationFilter(selected.id);
                }}
              >
                <SelectTrigger id="wolt-location-filter" className="h-11 w-full">
                  <MapPinIcon aria-hidden="true" />
                  <SelectValue placeholder="Vælg lokation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {locationOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <FilterSelect
              id="wolt-status-filter"
              label="Status"
              value={statusFilter}
              options={statusOptions}
              onValueChange={(value) => setStatusFilter(isWoltStatus(value) ? value : "all")}
            />
            <FilterSelect
              id="wolt-order-type-filter"
              label="Ordretype"
              value={orderTypeFilter}
              options={orderTypeOptions}
              onValueChange={(value) => setOrderTypeFilter(isWoltOrderType(value) ? value : "all")}
            />
            <Field className="sm:col-span-2 xl:col-span-5">
              <FieldLabel htmlFor="wolt-display-number">Ordrenummer</FieldLabel>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="wolt-display-number"
                  value={displayNumber}
                  onChange={(event) => setDisplayNumber(event.target.value)}
                  placeholder="Søg på ordrenummer"
                  className="h-11 pl-10"
                  inputMode="search"
                />
              </div>
            </Field>
          </FieldGroup>
          {!range.valid ? (
            <Alert variant="destructive" className="mt-5">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Vælg en gyldig periode</AlertTitle>
              <AlertDescription>Fra dato skal ligge før til dato.</AlertDescription>
            </Alert>
          ) : !range.withinLimit ? (
            <Alert variant="destructive" className="mt-5">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Perioden er for lang</AlertTitle>
              <AlertDescription>Vælg højst 90 dage ad gangen.</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ordrer</CardTitle>
          <CardDescription>Åbn en ordre for at se varer og status uden forbrugeroplysninger.</CardDescription>
          <CardAction>
            {status === "LoadingFirstPage" || status === "LoadingMore" ? (
              <Spinner aria-label="Indlæser" />
            ) : (
              <span className="text-sm text-muted-foreground">{results.length} vist</span>
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          {locations === undefined ? (
            <div className="flex flex-col gap-3" aria-label="Indlæser lokationer">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : locations.length === 0 ? (
            <Empty className="min-h-56 border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon"><MapPinIcon aria-hidden="true" /></EmptyMedia>
                <EmptyTitle>Ingen tilgængelige lokationer</EmptyTitle>
                <EmptyDescription>Der er ingen lokationer, du kan se Wolt-ordrer for.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : !range.valid || !range.withinLimit ? null : (
            <OrderList
              results={results}
              status={status}
              loadMore={loadMore}
              onOpen={(order) => setSelectedOrderId(order.id)}
            />
          )}
        </CardContent>
      </Card>

      <WoltOrderDetail
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
      />
    </>
  );
}

export function WoltOrdersPage() {
  return (
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-5 pb-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Wolt</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Wolt-ordrer</h1>
        <p className="max-w-2xl text-muted-foreground">
          Følg modtagne Wolt-ordrer på tværs af dine tilgængelige lokationer.
        </p>
      </header>
      <OrganizationAuthGate>
        <WoltOrdersContent />
      </OrganizationAuthGate>
    </section>
  );
}
