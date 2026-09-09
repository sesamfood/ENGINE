"use client";

import { IntegrationCard } from "./integration-card";

import type { FunctionReturnType } from "convex/server";
import { getUserErrorMessage } from "@/lib/user-errors";
import {
  useAction,
  useConvex,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import {
  ChevronRightIcon,
  CircleAlertIcon,
  CopyIcon,
  PlugIcon,
  RefreshCwIcon,
  ShoppingBasketIcon,
  UnplugIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  OnlinePosProductSelect,
  useOnlinePosProductOptions,
} from "@/components/catalog/online-pos-product-select";
import { OnlinePosLocationConnections } from "@/components/organization/online-pos-location-connections";
import { OnlinePosStockSettings } from "@/components/organization/online-pos-stock-settings";
import { OnlinePosOrderDetail } from "@/components/organization/online-pos-order-detail";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAccess, usePermission } from "@/components/app-shell";
import { DEFAULT_CURRENCY } from "@/lib/dashboard/types";
import { addDays, dateKey, DEFAULT_TIME_ZONE, zonedStart } from "@/lib/date";

type OnlinePosProduct = {
  id: number;
  name: string;
  groupName: string;
};

type SalesLocationContext = {
  id: Id<"locations">;
  name: string;
  currency: string;
  state: "idle" | "queued" | "running" | "error";
  lastSuccessAt: number | null;
  lastError: string | null;
  syncedThroughAt: number | null;
  backfillThroughAt: number | null;
};

const connectedAtFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "medium",
  timeStyle: "short",
});

const MAX_SALES_RANGE_MS = 31 * 24 * 60 * 60 * 1000;
const SYNC_DISABLED_REASON_ID = "online-pos-sales-sync-disabled-reason";

function salesDateRange(from: string, to: string, timeZone?: string) {
  try {
    if (timeZone) {
      return {
        from: zonedStart(from, timeZone),
        to: zonedStart(addDays(to, 1), timeZone),
      };
    }
  } catch {
    // Incomplete dates keep the query disabled until the range is valid.
  }
  return { from: Number.NaN, to: Number.NaN };
}

function formatOre(revenue: number, currency = DEFAULT_CURRENCY) {
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency,
  }).format(revenue / 100);
}

function syncStateLabel(state: SalesLocationContext["state"]) {
  switch (state) {
    case "queued":
      return "I kø";
    case "running":
      return "Synkroniserer";
    case "error":
      return "Fejl";
    default:
      return "Klar";
  }
}

function locationCoversRange(
  location: SalesLocationContext,
  from: number,
  to: number,
) {
  if (location.syncedThroughAt === null) return false;
  const historyStart =
    location.backfillThroughAt ?? location.syncedThroughAt;
  return historyStart <= from && location.syncedThroughAt >= to;
}

function periodHasSyncedData(
  locations: SalesLocationContext[],
  locationId: Id<"locations"> | null,
  from: number,
  to: number,
) {
  const relevant = locationId
    ? locations.filter((location) => location.id === locationId)
    : locations;
  return (
    relevant.length > 0 &&
    relevant.every((location) => locationCoversRange(location, from, to))
  );
}

function ConnectionCard({
  settings,
  onDisconnected,
}: {
  settings: {
    connected: boolean;
    enabled: boolean;
    companyId: number | null;
    connectedAt: number | null;
  };
  onDisconnected: () => void;
}) {
  const connect = useAction(api.onlinePos.connect);
  const disconnect = useMutation(api.onlinePos.disconnect);
  const [companyIdDraft, setCompanyIdDraft] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [editingConnection, setEditingConnection] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const companyId = companyIdDraft ?? String(settings.companyId ?? "");

  async function saveConnection() {
    const parsedCompanyId = Number(companyId);
    if (!Number.isSafeInteger(parsedCompanyId) || parsedCompanyId <= 0) {
      toast.error("Indtast et gyldigt firma-id");
      return;
    }
    if (!token.trim()) {
      toast.error("Indtast dit OnlinePOS-token");
      return;
    }

    setConnecting(true);
    try {
      const result = await connect({ companyId: parsedCompanyId, token });
      setToken("");
      setCompanyIdDraft(null);
      setEditingConnection(false);
      toast.success(
        `Masterforbindelsen er oprettet. ${result.productCount} produkter blev fundet.`,
      );
    } catch (error) {
      toast.error(getUserErrorMessage(error, "OnlinePOS-integrationen kunne ikke opdateres. Prøv igen."));
    } finally {
      setConnecting(false);
    }
  }

  async function removeConnection() {
    setDisconnecting(true);
    try {
      await disconnect({});
      setCompanyIdDraft("");
      setToken("");
      setEditingConnection(false);
      onDisconnected();
      toast.success("OnlinePOS-integrationen er fjernet");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "OnlinePOS-integrationen kunne ikke opdateres. Prøv igen."));
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-1">
          Masterforbindelse
          <HelpTooltip
            label="OnlinePOS-masterforbindelsen"
            content="Masterkontoen henter produkter til produktkoblinger. Salg hentes separat via hver lokations forbindelse."
          />
        </CardTitle>
        <CardAction>
          <Badge variant={settings.enabled ? "default" : "secondary"}>
            {settings.enabled
              ? "Aktiv"
              : settings.connected
                ? "Deaktiveret"
                : "Ikke forbundet"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {!settings.connected || editingConnection ? (
          <FieldGroup>
            {!settings.connected ? (
              <Field>
                <div className="flex items-center gap-1">
                  <FieldLabel htmlFor="online-pos-company-id">
                    Masterkontoens firma-id
                  </FieldLabel>
                  <HelpTooltip
                    label="Masterkontoens firma-id"
                    content="Brug firma-id'et fra den OnlinePOS-konto, der indeholder masterproduktlisten. Mangler I firma-id eller API-adgang, skal I kontakte OnlinePOS."
                  />
                </div>
                <Input
                  id="online-pos-company-id"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={companyId}
                  onChange={(event) => setCompanyIdDraft(event.target.value)}
                  placeholder="Firma-id fra OnlinePOS"
                  className="h-11"
                />
              </Field>
            ) : null}
            <Field>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="online-pos-token">
                  {settings.connected ? "Nyt token til masterkontoen" : "Masterkontoens token"}
                </FieldLabel>
                <HelpTooltip
                  label="Masterkontoens token"
                  content="Brug API-tokenet fra den OnlinePOS-konto, der indeholder masterproduktlisten. Mangler I det, skal I kontakte OnlinePOS. Tokenet gemmes på serveren og kan ikke vises igen."
                />
              </div>
              <Input
                id="online-pos-token"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder={
                  settings.connected
                    ? "Indtast nyt token"
                    : "Token fra OnlinePOS"
                }
                className="h-11"
              />
            </Field>
          </FieldGroup>
        ) : null}

        {settings.connectedAt ? (
          <p className="text-sm text-muted-foreground">
            Senest forbundet {connectedAtFormatter.format(settings.connectedAt)}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="flex-wrap justify-end gap-3">
        {settings.connected ? (
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button variant="outline" disabled={disconnecting} />}
            >
              <UnplugIcon data-icon="inline-start" />
              Fjern forbindelse
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Fjern forbindelsen til OnlinePOS?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Masterkontoens token, alle lokationstokens og alle produktkoblinger
                  slettes permanent. Handlingen kan ikke fortrydes.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={disconnecting}>
                  Behold forbindelse
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={disconnecting}
                  onClick={() => void removeConnection()}
                >
                  {disconnecting ? <Spinner data-icon="inline-start" /> : null}
                  Fjern forbindelse
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        {settings.connected && !editingConnection ? (
          <Button onClick={() => setEditingConnection(true)}>
            <RefreshCwIcon data-icon="inline-start" />
            Skift token
          </Button>
        ) : (
          <>
            {settings.connected ? (
              <Button
                variant="outline"
                disabled={connecting}
                onClick={() => {
                  setCompanyIdDraft(null);
                  setToken("");
                  setEditingConnection(false);
                }}
              >
                Annullér
              </Button>
            ) : null}
            <Button disabled={connecting} onClick={() => void saveConnection()}>
              {connecting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <PlugIcon data-icon="inline-start" />
              )}
              {settings.connected ? "Gem nyt token" : "Forbind master"}
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}

function StoredSalesSample() {
  const convex = useConvex();
  const [date, setDate] = useState(() =>
    addDays(dateKey(Date.now(), DEFAULT_TIME_ZONE), -1),
  );
  const [lines, setLines] = useState<FunctionReturnType<typeof api.sales.inspectStoredSales> | null>(null);
  const [loading, setLoading] = useState(false);
  const prettyJson = lines === null ? null : JSON.stringify(lines, null, 2);

  async function fetchLines() {
    if (!date) {
      toast.error("Vælg en dato");
      return;
    }
    setLoading(true);
    try {
      const result = await convex.query(api.sales.inspectStoredSales, { date });
      setLines(result);
    } catch (error) {
      setLines(null);
      toast.error(getUserErrorMessage(error, "OnlinePOS-integrationen kunne ikke opdateres. Prøv igen."));
    } finally {
      setLoading(false);
    }
  }

  async function copyResponse() {
    if (prettyJson === null) return;
    try {
      await navigator.clipboard.writeText(prettyJson);
      toast.success("Salgslinjerne er kopieret");
    } catch {
      toast.error(
        "Salgslinjerne kunne ikke kopieres. Markér teksten, og kopiér den manuelt.",
      );
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Gemte salgslinjer</CardTitle>
        <CardDescription>
          Vis op til fem gemte salgslinjer fra dagens første ordrer.
        </CardDescription>
        {prettyJson !== null ? (
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Kopiér gemte salgslinjer"
              onClick={() => void copyResponse()}
            >
              <CopyIcon data-icon="inline-start" />
              Kopiér
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void fetchLines();
          }}
        >
          <FieldGroup>
            <Field orientation="responsive">
              <FieldLabel htmlFor="stored-sales-date">Dato</FieldLabel>
              <Input
                id="stored-sales-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
              <Button type="submit" disabled={loading}>
                {loading ? <Spinner data-icon="inline-start" /> : null}
                Hent
              </Button>
            </Field>
          </FieldGroup>
        </form>
        {prettyJson !== null ? (
          <pre className="max-h-96 overflow-auto rounded-md border bg-muted p-4 text-xs">
            {prettyJson}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ProductMappings({
  onlinePosProducts,
  loading,
  onReload,
}: {
  onlinePosProducts: OnlinePosProduct[] | null;
  loading: boolean;
  onReload: () => void;
}) {
  const mappingOptions = useQuery(api.onlinePos.listMappingOptions);
  const setMapping = useAction(api.onlinePos.setProductMapping);
  const [savingProductIds, setSavingProductIds] = useState<Set<Id<"products">>>(
    new Set(),
  );
  const options = useOnlinePosProductOptions(onlinePosProducts);

  async function changeMapping(
    productId: Id<"products">,
    onlinePosProductId: number | null,
  ) {
    setSavingProductIds((current) => new Set(current).add(productId));
    try {
      await setMapping({
        productId,
        onlinePosProductId,
      });
      toast.success(
        onlinePosProductId === null
          ? "Produktkoblingen er fjernet"
          : "Produktkoblingen er gemt",
      );
    } catch (error) {
      toast.error(getUserErrorMessage(error, "OnlinePOS-integrationen kunne ikke opdateres. Prøv igen."));
    } finally {
      setSavingProductIds((current) => {
        const next = new Set(current);
        next.delete(productId);
        return next;
      });
    }
  }

  if (!mappingOptions || (loading && !onlinePosProducts)) {
    return <Skeleton className="h-96 w-full max-w-5xl" />;
  }

  return (
    <Card className="max-w-5xl">
      <CardHeader>
        <CardTitle>Produktkoblinger</CardTitle>
        <CardDescription>
          Søg efter et produkt i OnlinePOS, og vælg det produkt, hvert lokalt
          produkt svarer til.
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={onReload}
          >
            {loading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            Opdatér produkter
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mappingOptions.limitReached ? (
          <Alert>
            <CircleAlertIcon />
            <AlertTitle>Kun de første 500 produkter vises</AlertTitle>
            <AlertDescription>
              Arkivér ubrugte produkter for at få hele listen med.
            </AlertDescription>
          </Alert>
        ) : null}

        {mappingOptions.products.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShoppingBasketIcon />
              </EmptyMedia>
              <EmptyTitle>Ingen aktive produkter</EmptyTitle>
              <EmptyDescription>
                Opret lokale produkter, før du laver produktkoblinger.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : onlinePosProducts ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lokalt produkt</TableHead>
                <TableHead className="w-[60%]">OnlinePOS-produkt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappingOptions.products.map((product) => {
                return (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">
                      {product.name}
                    </TableCell>
                    <TableCell>
                      <OnlinePosProductSelect
                        options={options}
                        productName={product.name}
                        value={product.onlinePosProductId}
                        onValueChange={(value) =>
                          void changeMapping(product.id, value)
                        }
                        ariaLabel={`OnlinePOS-produkt for ${product.name}`}
                        disabled={savingProductIds.has(product.id)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <Alert variant="destructive">
            <AlertTitle>Produkterne kunne ikke indlæses</AlertTitle>
            <AlertDescription>
              Kontrollér forbindelsen, og prøv igen.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function SalesList() {
  const context = useQuery(api.sales.getContext);
  const requestSync = useMutation(api.sales.requestSync);
  // null = use org-zone defaults derived below (avoids browser-local seed + effect).
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [selectedOrderId, setSelectedOrderId] =
    useState<Id<"salesOrders"> | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const timeZone = context?.timeZone;
  const today = timeZone ? dateKey(now, timeZone) : "";
  const resolvedFromDate = fromDate ?? (today ? addDays(today, -7) : "");
  const resolvedToDate = toDate ?? today;
  const { from, to } = salesDateRange(
    resolvedFromDate,
    resolvedToDate,
    timeZone,
  );
  const rangeValid =
    Boolean(resolvedFromDate) &&
    Boolean(resolvedToDate) &&
    Boolean(timeZone) &&
    Number.isFinite(from) &&
    Number.isFinite(to) &&
    from < to &&
    to - from <= MAX_SALES_RANGE_MS;
  const locationId =
    locationFilter === "all" ? null : (locationFilter as Id<"locations">);
  const listArgs = context && rangeValid ? { locationId, from, to } : "skip";
  const { results, status, loadMore } = usePaginatedQuery(
    api.sales.listOrders,
    listArgs,
    { initialNumItems: 50 },
  );

  const orderAtFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("da-DK", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: context?.timeZone,
      }),
    [context?.timeZone],
  );

  const cooldown =
    context?.manualSyncRetryAt !== null &&
    context?.manualSyncRetryAt !== undefined &&
    context.manualSyncRetryAt > now;
  const anySyncing = Boolean(
    context?.locations.some(
      (location: SalesLocationContext) =>
        location.state === "queued" || location.state === "running",
    ),
  );
  const syncDisabledReason = cooldown
    ? context?.manualSyncRetryAt
      ? `Manuel synkronisering er midlertidigt begrænset. Du kan synkronisere igen ${connectedAtFormatter.format(context.manualSyncRetryAt)}.`
      : "Manuel synkronisering er midlertidigt begrænset."
    : anySyncing || syncing
      ? "En synkronisering kører allerede."
      : null;
  const connectedLocationCount = context?.locations.length ?? 0;
  const hasCoverage =
    rangeValid &&
    context &&
    periodHasSyncedData(context.locations, locationId, from, to);

  async function syncNow() {
    setSyncing(true);
    try {
      await requestSync({ locationId });
      toast.success("Synkroniseringen er sat i gang");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "OnlinePOS-integrationen kunne ikke opdateres. Prøv igen."));
    } finally {
      setSyncing(false);
    }
  }

  if (!context) {
    return <Skeleton className="h-96 w-full max-w-6xl" />;
  }

  const locationItems = [
    { value: "all", label: "Alle lokationer" },
    ...context.locations.map((location: SalesLocationContext) => ({
      value: location.id as string,
      label: location.name,
    })),
  ];

  return (
    <>
      <Card className="max-w-6xl">
        <CardHeader>
        <CardTitle>Ordrer fra OnlinePOS</CardTitle>
        <CardDescription>
          Vis synkroniserede ordrer for en periode på højst 31 dage. Datoerne er
          inklusive. Åbn en ordre for at se oplysninger og produktlinjer.
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            disabled={
              !context.enabled ||
              connectedLocationCount === 0 ||
              syncing ||
              anySyncing ||
              cooldown
            }
            aria-describedby={
              syncDisabledReason ? SYNC_DISABLED_REASON_ID : undefined
            }
            onClick={() => void syncNow()}
          >
            {syncing || anySyncing ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            {anySyncing ? "Synkroniserer" : "Synkronisér nu"}
          </Button>
        </CardAction>
      </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {!context.connected ? (
          <Alert>
            <CircleAlertIcon />
            <AlertTitle>OnlinePOS er ikke forbundet</AlertTitle>
            <AlertDescription>
              Opret masterforbindelsen under Indstillinger, før salg kan
              synkroniseres.
            </AlertDescription>
          </Alert>
        ) : !context.enabled ? (
          <Alert>
            <CircleAlertIcon />
            <AlertTitle>Integrationen er deaktiveret</AlertTitle>
            <AlertDescription>
              Aktivér OnlinePOS for at synkronisere ordrer automatisk.
            </AlertDescription>
          </Alert>
        ) : connectedLocationCount === 0 ? (
          <Alert>
            <CircleAlertIcon />
            <AlertTitle>Ingen lokationer er forbundet</AlertTitle>
            <AlertDescription>
              Tilføj firma-id og token til mindst én lokation under
              Indstillinger, før du synkroniserer salg.
            </AlertDescription>
          </Alert>
        ) : null}

          {cooldown && context.manualSyncRetryAt ? (
          <Alert id={SYNC_DISABLED_REASON_ID}>
            <CircleAlertIcon />
            <AlertTitle>Manuel synkronisering er midlertidigt begrænset</AlertTitle>
            <AlertDescription>
              Du kan synkronisere igen{" "}
              {connectedAtFormatter.format(context.manualSyncRetryAt)}.
            </AlertDescription>
          </Alert>
        ) : anySyncing || syncing ? (
          <p id={SYNC_DISABLED_REASON_ID} className="sr-only">
            {syncDisabledReason}
          </p>
        ) : null}

          {context.locations.length > 0 ? (
            <div className="flex flex-col gap-3">
              {context.locations.map((location: SalesLocationContext) => (
                <div
                key={location.id}
                className="flex flex-col gap-1 rounded-lg border px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
              >
                  <div className="min-w-0 flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{location.name}</span>
                    <Badge
                      variant={
                        location.state === "error" ? "destructive" : "secondary"
                      }
                    >
                      {syncStateLabel(location.state)}
                    </Badge>
                  </div>
                    <p className="text-sm text-muted-foreground">
                      {location.lastSuccessAt
                        ? `Senest synkroniseret ${connectedAtFormatter.format(location.lastSuccessAt)}`
                        : "Endnu ikke synkroniseret"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {location.backfillThroughAt
                        ? `Historik tilbage til ${connectedAtFormatter.format(location.backfillThroughAt)}`
                        : "Historik er endnu ikke hentet"}
                      {" · "}
                      {location.syncedThroughAt
                        ? `Aktuel til ${connectedAtFormatter.format(location.syncedThroughAt)}`
                        : "Ingen aktuelle data"}
                    </p>
                    {location.lastError ? (
                    <p className="text-sm text-destructive">{location.lastError}</p>
                  ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <FieldGroup className="grid sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
          <Field>
            <FieldLabel htmlFor="online-pos-sales-location">Lokation</FieldLabel>
            <Select
              items={locationItems}
              value={locationFilter}
              onValueChange={(value) => {
                if (value) setLocationFilter(value);
              }}
              disabled={connectedLocationCount === 0}
            >
              <SelectTrigger
                id="online-pos-sales-location"
                className="h-11 w-full"
              >
                <SelectValue placeholder="Vælg lokation" />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {locationItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="online-pos-sales-from">Fra dato</FieldLabel>
            <Input
              id="online-pos-sales-from"
              type="date"
              value={resolvedFromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="h-11"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="online-pos-sales-to">Til dato</FieldLabel>
            <Input
              id="online-pos-sales-to"
              type="date"
              value={resolvedToDate}
              onChange={(event) => setToDate(event.target.value)}
              className="h-11"
            />
          </Field>
        </FieldGroup>

          {!rangeValid ? (
          <Alert>
            <CircleAlertIcon />
            <AlertTitle>Ugyldig periode</AlertTitle>
            <AlertDescription>
              Vælg en periode på højst 31 dage, hvor slutdatoen er efter
              startdatoen.
            </AlertDescription>
          </Alert>
        ) : status === "LoadingFirstPage" ? (
            <Skeleton className="h-72 w-full" />
          ) : results.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShoppingBasketIcon />
              </EmptyMedia>
              {hasCoverage ? (
                <>
                  <EmptyTitle>Ingen ordrer i perioden</EmptyTitle>
                  <EmptyDescription>
                    Der var ingen salg i den valgte periode.
                  </EmptyDescription>
                </>
              ) : (
                <>
                  <EmptyTitle>Ingen synkroniserede data endnu</EmptyTitle>
                  <EmptyDescription>
                    Perioden er ikke synkroniseret endnu. Start en synkronisering,
                    eller vælg en periode med synkroniserede data.
                  </EmptyDescription>
                </>
              )}
            </EmptyHeader>
          </Empty>
        ) : (
            <>
              <Table>
                <TableHeader>
                <TableRow>
                  <TableHead>Tidspunkt</TableHead>
                  <TableHead>Lokation</TableHead>
                  <TableHead>Ordrenr.</TableHead>
                  <TableHead>Produkter</TableHead>
                  <TableHead>Omsætning</TableHead>
                  <TableHead>Afdeling</TableHead>
                  <TableHead>Betaling</TableHead>
                  <TableHead>
                    <span className="sr-only">Detaljer</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
                <TableBody>
                  {results.map((order) => (
                    <TableRow
                    key={order.id}
                    className="cursor-pointer [&>td]:py-3"
                    onClick={() => setSelectedOrderId(order.id)}
                  >
                      <TableCell>
                      {orderAtFormatter.format(order.occurredAt)}
                    </TableCell>
                      <TableCell>{order.locationName}</TableCell>
                      <TableCell>{order.orderNumber}</TableCell>
                      <TableCell>{order.itemCount}</TableCell>
                      <TableCell>
                        {formatOre(order.revenue, order.currency)}
                      </TableCell>
                      <TableCell>{order.department || "—"}</TableCell>
                      <TableCell>{order.paymentType || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          className="min-h-11"
                          aria-label={`Åbn OnlinePOS-ordre ${order.orderNumber}`}
                          onClick={(event) => {
                          event.stopPropagation();
                          setSelectedOrderId(order.id);
                        }}
                        >
                          Åbn
                          <ChevronRightIcon data-icon="inline-end" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {status === "CanLoadMore" ? (
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => loadMore(50)}>
                  Vis flere
                </Button>
              </div>
            ) : null}
              {status === "LoadingMore" ? (
              <div className="flex justify-center">
                <Spinner />
              </div>
            ) : null}
            </>
          )}
        </CardContent>
      </Card>
      <OnlinePosOrderDetail
        orderId={selectedOrderId}
        formatMoney={formatOre}
        timeZone={context.timeZone}
        onClose={() => setSelectedOrderId(null)}
      />
    </>
  );
}

export function OnlinePosIntegration() {
  const access = useAccess();
  const canManage = usePermission("integrations.manage");
  const settings = useQuery(api.onlinePos.getSettings, canManage ? {} : "skip");
  const listOnlinePosProducts = useAction(api.onlinePos.listProducts);
  const setEnabled = useAction(api.onlinePos.setEnabled);
  const [tab, setTab] = useState("connection");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [changingEnabled, setChangingEnabled] = useState(false);
  const [onlinePosProducts, setOnlinePosProducts] = useState<
    OnlinePosProduct[] | null
  >(null);
  const [loadingProducts, setLoadingProducts] = useState(false);

  async function loadProducts() {
    setLoadingProducts(true);
    try {
      setOnlinePosProducts(await listOnlinePosProducts({}));
    } catch (error) {
      setOnlinePosProducts(null);
      toast.error(getUserErrorMessage(error, "OnlinePOS-integrationen kunne ikke opdateres. Prøv igen."));
    } finally {
      setLoadingProducts(false);
    }
  }

  async function changeIntegrationEnabled(enabled: boolean) {
    if (!settings?.connected) {
      setSetupOpen(enabled);
      if (!enabled) setTab("connection");
      return;
    }

    setChangingEnabled(true);
    try {
      await setEnabled({ enabled });
      setDetailsOpen(false);
      if (!enabled) setTab("connection");
      toast.success(
        enabled
          ? "OnlinePOS-integrationen er aktiveret"
          : "OnlinePOS-integrationen er deaktiveret",
      );
    } catch (error) {
      toast.error(getUserErrorMessage(error, "OnlinePOS-integrationen kunne ikke opdateres. Prøv igen."));
    } finally {
      setChangingEnabled(false);
    }
  }

  if (!access) {
    return <Skeleton className="h-96 w-full max-w-3xl" />;
  }

  if (!canManage) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at administrere integrationer.
        </AlertDescription>
      </Alert>
    );
  }

  if (!settings) {
    return <Skeleton className="h-96 w-full max-w-3xl" />;
  }

  const integrationOpen = detailsOpen || setupOpen;

  return (
    <IntegrationCard
      id="online-pos-integration"
      title="OnlinePOS"
      description={
        <>
          Masterforbindelsen henter produkter. De enkelte lokationsforbindelser
          henter salg.
        </>
      }
      connected={settings.connected}
      checked={settings.connected ? settings.enabled : setupOpen}
      open={integrationOpen}
      onOpenChange={(open) => {
        setDetailsOpen(open);
        if (!open && !settings.connected) setSetupOpen(false);
      }}
      onEnabledChange={(enabled) => void changeIntegrationEnabled(enabled)}
      disabled={changingEnabled}
      className="has-data-[slot=card-footer]:pb-(--card-spacing)"
    >
      {settings.enabled ? (
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value);
            if (
              value === "mappings" &&
              !onlinePosProducts &&
              !loadingProducts
            ) {
              void loadProducts();
            }
          }}
          className="gap-5"
        >
          <TabsList
            aria-label="OnlinePOS-sektioner"
            className="w-full justify-start"
          >
            <TabsTrigger value="connection">Indstillinger</TabsTrigger>
            <TabsTrigger value="mappings">Produktkoblinger</TabsTrigger>
            <TabsTrigger value="sales">Salg</TabsTrigger>
          </TabsList>
          <TabsContent value="connection">
            <div className="flex flex-col gap-5">
              <ConnectionCard
                settings={settings}
                onDisconnected={() => {
                  setSetupOpen(false);
                  setTab("connection");
                }}
              />
              <StoredSalesSample />
              <OnlinePosStockSettings />
              <OnlinePosLocationConnections />
            </div>
          </TabsContent>
          <TabsContent value="mappings">
            <ProductMappings
              onlinePosProducts={onlinePosProducts}
              loading={loadingProducts}
              onReload={() => void loadProducts()}
            />
          </TabsContent>
          <TabsContent value="sales">
            <SalesList />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex flex-col gap-5">
          <ConnectionCard
            settings={settings}
            onDisconnected={() => {
              setSetupOpen(false);
              setTab("connection");
            }}
          />
          {settings.connected ? <StoredSalesSample /> : null}
          <OnlinePosStockSettings />
          <OnlinePosLocationConnections />
        </div>
      )}
    </IntegrationCard>
  );
}
