"use client";

import {
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
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
  CreatableCombobox,
  type ComboboxOption,
} from "@/components/catalog/creatable-combobox";
import { getOnlinePosProductSuggestions } from "@/components/catalog/online-pos-product-suggestions";
import { OnlinePosLocationConnections } from "@/components/organization/online-pos-location-connections";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { Switch } from "@/components/ui/switch";
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

function addCalendarDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function dateKeyInZone(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateInput(daysAgo: number, timeZone = "Europe/Copenhagen") {
  return addCalendarDays(dateKeyInZone(Date.now(), timeZone), -daysAgo);
}

// Local copy of convex/lib/dashboardMetrics.zonedStart — client cannot import that module.
function zonedDayStart(value: string, timeZone: string) {
  const [year, month, day] = value.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(guess).map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess += target - represented;
  }
  return guess;
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
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
      toast.error(messageFrom(error));
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
      toast.error(messageFrom(error));
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <Card className="max-w-5xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-1">
          Masterforbindelse
          <HelpTooltip
            label="OnlinePOS-masterforbindelsen"
            content="Masterkontoens firma-id og token bruges til at hente produktlisten til produktkoblinger. Salg hentes med forbindelsen for hver lokation."
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
                    content="Brug firma-id'et for den OnlinePOS-konto, som indeholder masterproduktlisten. Kontakt OnlinePOS eller jeres OnlinePOS-kontakt for at få firma-id og API-adgang."
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
                  content="Brug API-tokenet til OnlinePOS-kontoen med masterproduktlisten. Kontakt OnlinePOS eller jeres OnlinePOS-kontakt, hvis I mangler det. Tokenet gemmes kun på serveren og vises ikke igen."
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
                  slettes. Handlingen kan ikke fortrydes.
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

function RawSalesResponse() {
  const inspectRawSales = useAction(api.onlinePos.inspectRawSales);
  const [date, setDate] = useState(() => dateInput(1));
  const [lines, setLines] = useState<unknown[] | null>(null);
  const [loading, setLoading] = useState(false);
  const prettyJson = lines === null ? null : JSON.stringify(lines, null, 2);

  async function fetchLines() {
    if (!date) {
      toast.error("Vælg en dato");
      return;
    }
    setLoading(true);
    try {
      const result: unknown[] = await inspectRawSales({ date });
      setLines(result);
    } catch (error) {
      setLines(null);
      toast.error(messageFrom(error));
    } finally {
      setLoading(false);
    }
  }

  async function copyResponse() {
    if (prettyJson === null) return;
    try {
      await navigator.clipboard.writeText(prettyJson);
      toast.success("Salgsresponsen er kopieret");
    } catch {
      toast.error("Salgsresponsen kunne ikke kopieres");
    }
  }

  return (
    <Card className="max-w-5xl">
      <CardHeader>
        <CardTitle>Rå salgsrespons</CardTitle>
        <CardDescription>
          Hent de første fem rå salgslinjer fra OnlinePOS for én dag.
        </CardDescription>
        {prettyJson !== null ? (
          <CardAction>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Kopiér rå salgsrespons"
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
              <FieldLabel htmlFor="online-pos-raw-sales-date">Dato</FieldLabel>
              <Input
                id="online-pos-raw-sales-date"
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
  const [savingProductId, setSavingProductId] = useState<Id<"products">>();
  const comboboxOptions = useMemo(
    () =>
      (onlinePosProducts ?? []).map((product) => ({
        value: String(product.id),
        label: product.groupName
          ? `${product.name} — ${product.groupName}`
          : product.name,
      })),
    [onlinePosProducts],
  );
  const suggestionsByProductId = useMemo(() => {
    const suggestions = new Map<
      Id<"products">,
      { exactMatch: boolean; options: ComboboxOption[] }
    >();

    for (const product of mappingOptions?.products ?? []) {
      if (product.onlinePosProductId !== null) continue;
      const { exactMatch, suggestions: matchingProducts } =
        getOnlinePosProductSuggestions(onlinePosProducts ?? [], product.name);
      const suggestionProducts = exactMatch
        ? [exactMatch]
        : matchingProducts;
      suggestions.set(product.id, {
        exactMatch: Boolean(exactMatch),
        options: suggestionProducts.map((suggestion) => ({
          value: String(suggestion.id),
          label: suggestion.groupName
            ? `${suggestion.name} — ${suggestion.groupName}`
            : suggestion.name,
        })),
      });
    }

    return suggestions;
  }, [mappingOptions?.products, onlinePosProducts]);

  async function changeMapping(
    productId: Id<"products">,
    onlinePosProductId: string | null,
  ) {
    setSavingProductId(productId);
    try {
      await setMapping({
        productId,
        onlinePosProductId:
          onlinePosProductId === null ? null : Number(onlinePosProductId),
      });
      toast.success(
        onlinePosProductId === null
          ? "Produktkoblingen er fjernet"
          : "Produktkoblingen er gemt",
      );
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSavingProductId(undefined);
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
          Søg i produktlisten fra OnlinePOS, og vælg hvilket produkt hvert
          lokalt produkt svarer til.
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
                const suggestions = suggestionsByProductId.get(product.id);
                return (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">
                      {product.name}
                    </TableCell>
                    <TableCell>
                      <CreatableCombobox
                        options={comboboxOptions}
                        suggestionLabel={
                          suggestions?.exactMatch
                            ? "Forslag med samme navn"
                            : "Forslag ud fra produktnavnet"
                        }
                        suggestionOptions={suggestions?.options}
                        value={
                          product.onlinePosProductId === null
                            ? null
                            : String(product.onlinePosProductId)
                        }
                        onValueChange={(value) =>
                          void changeMapping(product.id, value)
                        }
                        placeholder="Søg efter OnlinePOS-produkt"
                        ariaLabel={`OnlinePOS-produkt for ${product.name}`}
                        allowCreate={false}
                        disabled={savingProductId === product.id}
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
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  const timeZone = context?.timeZone;
  const resolvedFromDate = fromDate ?? (timeZone ? dateInput(7, timeZone) : "");
  const resolvedToDate = toDate ?? (timeZone ? dateInput(0, timeZone) : "");
  const from =
    timeZone && resolvedFromDate
      ? zonedDayStart(resolvedFromDate, timeZone)
      : Number.NaN;
  const to =
    timeZone && resolvedToDate
      ? zonedDayStart(addCalendarDays(resolvedToDate, 1), timeZone)
      : Number.NaN;
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
  const listArgs =
    context && rangeValid
      ? { locationId, from, to }
      : "skip";
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
      toast.error(messageFrom(error));
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
    <Card className="max-w-6xl">
      <CardHeader>
        <CardTitle>Ordrer fra OnlinePOS</CardTitle>
        <CardDescription>
          Vis synkroniserede ordrer for en periode på højst 31 dage. Datoerne er
          inklusive.
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
              Indstillinger, før salg kan synkroniseres.
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
                    Der er ikke synkroniseret data for perioden endnu. Start en
                    synkronisering, eller vælg en periode der allerede er
                    dækket.
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      {orderAtFormatter.format(order.occurredAt)}
                    </TableCell>
                    <TableCell>{order.locationName}</TableCell>
                    <TableCell>{order.orderNumber}</TableCell>
                    <TableCell>{order.itemCount}</TableCell>
                    <TableCell>{formatOre(order.revenue, order.currency)}</TableCell>
                    <TableCell>{order.department || "—"}</TableCell>
                    <TableCell>{order.paymentType || "—"}</TableCell>
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
      toast.error(messageFrom(error));
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
      toast.error(messageFrom(error));
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
    <Collapsible
      open={integrationOpen}
      onOpenChange={(open) => {
        setDetailsOpen(open);
        if (!open && !settings.connected) setSetupOpen(false);
      }}
    >
      <Card className="max-w-6xl has-data-[slot=card-footer]:pb-(--card-spacing)">
        <CardHeader>
          <CardTitle>OnlinePOS</CardTitle>
          <CardDescription>
            Hent produkter fra en masterkonto, og hent salg med separate
            forbindelser for hver lokation.
          </CardDescription>
          <CardAction className="flex items-center gap-3">
            <Field orientation="horizontal" className="w-auto">
              <Switch
                id="online-pos-integration-enabled"
                aria-controls={
                  settings.connected
                    ? undefined
                    : "online-pos-integration-settings"
                }
                aria-expanded={
                  settings.connected ? undefined : integrationOpen
                }
                aria-label="Aktivér OnlinePOS-integration"
                checked={settings.connected ? settings.enabled : setupOpen}
                disabled={changingEnabled}
                onCheckedChange={(enabled) =>
                  void changeIntegrationEnabled(enabled)
                }
              />
            </Field>
            <CollapsibleTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`${integrationOpen ? "Skjul" : "Vis"} OnlinePOS-indstillinger`}
                />
              }
            >
              {integrationOpen ? "Skjul" : "Vis"}
              {integrationOpen ? (
                <ChevronUpIcon data-icon="inline-end" />
              ) : (
                <ChevronDownIcon data-icon="inline-end" />
              )}
            </CollapsibleTrigger>
          </CardAction>
        </CardHeader>
        <CollapsibleContent id="online-pos-integration-settings">
          <CardContent>
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
                    <RawSalesResponse />
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
                {settings.connected ? <RawSalesResponse /> : null}
                <OnlinePosLocationConnections />
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
