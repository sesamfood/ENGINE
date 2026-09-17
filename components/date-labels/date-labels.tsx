"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Clock3Icon,
  HeartIcon,
  MinusIcon,
  PackageOpenIcon,
  PlusIcon,
  PrinterIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AppPageHeader } from "@/components/app-page-header";
import {
  useKiosk,
  useLocationAccess,
  usePermission,
} from "@/components/app-shell";
import { ExpiryField } from "@/components/catalog/expiry-field";
import { ProductCardMedia } from "@/components/catalog/product-card-media";
import { LocationField } from "@/components/location-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCompleteCatalog } from "@/hooks/use-complete-catalog";
import { useSmoothPrint } from "@/hooks/use-smooth-print";
import { authClient } from "@/lib/auth-client";
import {
  dateKey,
  dateTimeFormatter,
  DEFAULT_TIME_ZONE,
  zonedTimestamp,
} from "@/lib/date";
import {
  labelDocument,
  labelFormats,
  printDateLabels,
  type DateLabel,
  type LabelFormat,
} from "@/lib/date-label-print";
import {
  expiryError,
  expiryTimestamp,
  formatExpiry,
  type Expiry,
} from "@/lib/expiry";
import { selectedLocationId } from "@/lib/location-preference";
import {
  readPreference,
  savePreference,
  subscribePreferences,
  useLabelFormat,
} from "@/lib/date-label-prefs";
import { searchProducts } from "@/lib/product-search";
import { getUserErrorMessage } from "@/lib/user-errors";
import { cn } from "@/lib/utils";
import { setRegistrationLocation, useWasteLocation } from "@/lib/waste-prefs";

type Product = FunctionReturnType<
  typeof api.dateLabels.listProducts
>["page"][number];

function subscribeWide(callback: () => void) {
  const media = window.matchMedia("(min-width: 1024px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
function localTime(timestamp: number) {
  return dateTimeFormatter("en-GB", {
    timeZone: DEFAULT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(timestamp);
}

export function DateLabels() {
  const organizationId = authClient.useActiveOrganization().data?.id;
  const session = authClient.useSession().data;
  const storedId = useWasteLocation(organizationId);
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const kiosk = useKiosk();
  const permission = usePermission("dateLabels.print");
  const allowed = kiosk?.kioskModeEnabled
    ? kiosk.settings?.enabledPages.includes("dateLabels.print")
    : permission;
  const locationId = selectedLocationId({
    locations,
    storedId,
    isLocked,
    lockedId,
  });
  return (
    <div className="flex flex-col gap-6">
      <AppPageHeader>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,18rem)] sm:items-end">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              Datomærkning
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Datomærkning
            </h1>
          </div>
          <Field>
            <FieldLabel htmlFor="date-label-location">Lokation</FieldLabel>
            <LocationField
              id="date-label-location"
              locations={locations}
              value={locationId}
              locked={isLocked}
              lockedName={lockedName}
              onValueChange={(value) => {
                if (organizationId)
                  setRegistrationLocation(organizationId, value);
              }}
            />
          </Field>
        </div>
      </AppPageHeader>
      {!allowed ? (
        <Alert>
          <AlertTitle>Ingen adgang</AlertTitle>
          <AlertDescription>
            Du har ikke adgang til at printe datoetiketter.
          </AlertDescription>
        </Alert>
      ) : !locationId ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageOpenIcon />
            </EmptyMedia>
            <EmptyTitle>Ingen lokationer</EmptyTitle>
            <EmptyDescription>
              Du skal have adgang til en lokation for at printe etiketter.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : organizationId && session ? (
        <LabelWorkspace
          key={`${organizationId}:${session.user.id}:${locationId}`}
          organizationId={organizationId}
          userId={session.user.id}
          locationId={locationId}
          locationName={
            locations.find((location) => location.id === locationId)?.name ??
            lockedName ??
            ""
          }
        />
      ) : (
        <Skeleton className="h-80" />
      )}
    </div>
  );
}

function LabelWorkspace({
  organizationId,
  userId,
  locationId,
  locationName,
}: {
  organizationId: string;
  userId: string;
  locationId: Id<"locations">;
  locationName: string;
}) {
  const products = useCompleteCatalog(api.dateLabels.listProducts, {
    locationId,
  });
  const settings = useQuery(api.dateLabels.getSettings, { locationId });
  const rememberExpiry = useMutation(api.dateLabels.rememberExpiry);
  const catalogPermission = usePermission("catalog.manage");
  const kiosk = useKiosk();
  const canRemember = catalogPermission && !kiosk?.kioskModeEnabled;
  const wide = useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false,
  );
  const favoriteKey = `engine.date-labels.favorites.${organizationId}.${userId}`;
  const storedFavorites = useSyncExternalStore(
    subscribePreferences,
    () => readPreference(favoriteKey),
    () => null,
  );
  const favorites = useMemo(() => {
    try {
      const value: unknown = JSON.parse(storedFavorites ?? "[]");
      return new Set(
        Array.isArray(value)
          ? value.filter((item): item is string => typeof item === "string")
          : [],
      );
    } catch {
      return new Set<string>();
    }
  }, [storedFavorites]);
  const [format] = useLabelFormat();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selection, setSelection] = useState<{
    id: Id<"products">;
    expiry: Expiry | null;
  } | null>(null);
  const [pendingId, setPendingId] = useState<Id<"products"> | null>(null);
  const [expiryValue, setExpiryValue] = useState("");
  const [expiryUnit, setExpiryUnit] = useState<Expiry["unit"]>("days");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const selectedProduct = products?.find(
    (product) => product.id === selection?.id,
  );
  const pendingProduct = products?.find((product) => product.id === pendingId);
  const categoryPaths = useMemo(
    () =>
      new Map(
        settings?.categories.map((category) => [category.id, category.path]),
      ),
    [settings?.categories],
  );
  const visibleProducts = useMemo(
    () =>
      searchProducts(
        (products ?? [])
          .filter(
            (product) => filter !== "favorites" || favorites.has(product.id),
          )
          .sort((a, b) => a.name.localeCompare(b.name, "da")),
        search,
        (product) => ({
          name: product.name,
          categoryPath: product.categories
            .map((item) => categoryPaths.get(item.id) ?? item.name)
            .join(" · "),
        }),
      ),
    [products, filter, favorites, categoryPaths, search],
  );

  function selectProduct(product: Product) {
    if (product.expiry) {
      setSelection({ id: product.id, expiry: null });
      return;
    }
    setPendingId(product.id);
    setExpiryValue("");
    setExpiryUnit("days");
    setRemember(false);
    setError(null);
  }
  async function confirmExpiry() {
    if (!pendingProduct || saving) return;
    const expiry: Expiry = { value: Number(expiryValue), unit: expiryUnit };
    const validation = expiryError(expiry);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (remember && canRemember) {
        await rememberExpiry({
          productId: pendingProduct.id,
          locationId,
          expiry,
        });
        toast.success("Holdbarheden er gemt på produktet");
      }
      setSelection({ id: pendingProduct.id, expiry });
      setPendingId(null);
    } catch (error) {
      setError(getUserErrorMessage(error, "Holdbarheden kunne ikke gemmes"));
    } finally {
      setSaving(false);
    }
  }
  const panel =
    selectedProduct && settings ? (
      <PrintPanel
        key={selectedProduct.id}
        product={selectedProduct}
        expiry={selectedProduct.expiry ?? selection?.expiry ?? null}
        locationName={locationName}
        format={format}
        includeTime={settings.includeTime}
        onClose={() => setSelection(null)}
        canConfigurePrinter={!kiosk?.kioskModeEnabled}
        onMissingExpiry={() => selectProduct(selectedProduct)}
      />
    ) : null;

  return (
    <>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <ToggleGroup
              value={[filter]}
              onValueChange={(values) => {
                if (values[0]) setFilter(values[0]);
              }}
              variant="outline"
              aria-label="Vis produkter"
            >
              <ToggleGroupItem value="all" className="min-h-11">
                Alle
              </ToggleGroupItem>
              <ToggleGroupItem value="favorites" className="min-h-11">
                <HeartIcon />
                Favoritter
              </ToggleGroupItem>
            </ToggleGroup>
            <InputGroup className="h-11 min-w-48 flex-1">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Søg efter produkt eller kategori…"
                aria-label="Søg efter produkt eller kategori"
              />
            </InputGroup>
            {products ? (
              <span
                className="shrink-0 text-sm text-muted-foreground"
                role="status"
              >
                {visibleProducts.length}{" "}
                {visibleProducts.length === 1 ? "produkt" : "produkter"}
              </span>
            ) : null}
          </div>
          {products === undefined ? (
            <div
              className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
              aria-label="Indlæser produkter"
            >
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-64" />
              ))}
            </div>
          ) : visibleProducts.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PackageOpenIcon />
                </EmptyMedia>
                <EmptyTitle>
                  {filter === "favorites"
                    ? "Ingen favoritter fundet"
                    : "Ingen produkter fundet"}
                </EmptyTitle>
                <EmptyDescription>
                  {products.length
                    ? "Prøv en anden søgning eller kategori. Tryk på hjertet for at gemme en favorit på denne enhed."
                    : "Kontrollér produktvalget under Administration → Datomærkning og de produkter, der er tilgængelige på lokationen."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 min-[1920px]:grid-cols-5">
              {visibleProducts.map((product) => (
                <Card
                  key={product.id}
                  size="sm"
                  className={cn(
                    "relative gap-3 pt-0",
                    selection?.id === product.id && "outline-2 outline-primary",
                  )}
                >
                  <ProductCardMedia
                    imageUrl={product.imageUrl}
                    alt={product.name}
                    sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 20vw"
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-2 right-2 min-h-11 min-w-11"
                    aria-label={`${favorites.has(product.id) ? "Fjern" : "Gem"} ${product.name} som favorit`}
                    aria-pressed={favorites.has(product.id)}
                    onClick={() => {
                      const next = new Set(favorites);
                      if (next.has(product.id)) next.delete(product.id);
                      else next.add(product.id);
                      savePreference(favoriteKey, JSON.stringify([...next]));
                    }}
                  >
                    <HeartIcon
                      fill={favorites.has(product.id) ? "currentColor" : "none"}
                    />
                  </Button>
                  <CardHeader className="flex-1">
                    <CardTitle>{product.name}</CardTitle>
                    <CardDescription>
                      {product.categories.map((item) => item.name).join(" · ")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock3Icon className="size-3.5 shrink-0" />
                      {product.expiry
                        ? `Holdbarhed: ${formatExpiry(product.expiry)}`
                        : "Holdbarhed ikke angivet"}
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Button
                      className="min-h-11 w-full"
                      onClick={() => selectProduct(product)}
                      aria-label={`Print etiket for ${product.name}`}
                    >
                      <PrinterIcon data-icon="inline-start" />
                      Print etiket
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </div>
        {wide ? (
          <aside className="sticky top-6">
            {panel ?? (
              <Card>
                <CardHeader>
                  <CardTitle>Print etiket</CardTitle>
                  <CardDescription>
                    Vælg et produkt for at klargøre etiketten.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <PrinterIcon />
                      </EmptyMedia>
                      <EmptyTitle>Ingen produkter valgt</EmptyTitle>
                      <EmptyDescription>
                        Holdbarheden beregnes fra produktionsdatoen.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </CardContent>
              </Card>
            )}
          </aside>
        ) : null}
      </div>
      {!wide ? (
        <Sheet
          open={Boolean(selectedProduct)}
          onOpenChange={(open) => {
            if (!open) setSelection(null);
          }}
        >
          <SheetContent
            className="w-full! overflow-y-auto sm:max-w-md"
            showCloseButton={false}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Print etiket</SheetTitle>
            </SheetHeader>
            {panel}
          </SheetContent>
        </Sheet>
      ) : null}
      <Dialog
        open={pendingId !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setPendingId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Angiv holdbarhed</DialogTitle>
            <DialogDescription>
              {pendingProduct
                ? `${pendingProduct.name} har ingen holdbarhed. Angiv tiden fra produktion til sidste anvendelse.`
                : "Produktet er ikke længere tilgængeligt. Luk vinduet, og vælg et andet produkt."}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <ExpiryField
              id="label-expiry"
              value={expiryValue}
              unit={expiryUnit}
              onValueChange={setExpiryValue}
              onUnitChange={setExpiryUnit}
              error={error}
              disabled={saving}
            />
            <Field
              orientation="horizontal"
              data-disabled={!canRemember || saving}
            >
              <Checkbox
                id="remember-expiry"
                checked={remember}
                onCheckedChange={setRemember}
                disabled={!canRemember || saving}
              />
              <FieldLabel htmlFor="remember-expiry">
                Husk holdbarheden for produktet
              </FieldLabel>
            </Field>
            {!canRemember ? (
              <FieldDescription>
                Du kan bruge holdbarheden til denne etiket. Det kræver adgang
                til at administrere kataloget at gemme den på produktet.
              </FieldDescription>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={saving}
              onClick={() => setPendingId(null)}
            >
              Annullér
            </Button>
            <Button
              className="min-h-11"
              disabled={saving || !pendingProduct}
              onClick={() => void confirmExpiry()}
            >
              {saving ? <Spinner data-icon="inline-start" /> : null}Fortsæt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PrintPanel({
  product,
  expiry,
  locationName,
  format,
  includeTime,
  onClose,
  canConfigurePrinter,
  onMissingExpiry,
}: {
  product: Product;
  expiry: Expiry | null;
  locationName: string;
  format: LabelFormat;
  includeTime: boolean;
  onClose: () => void;
  canConfigurePrinter: boolean;
  onMissingExpiry: () => void;
}) {
  const [date, setDate] = useState(() =>
    dateKey(Date.now(), DEFAULT_TIME_ZONE),
  );
  const [defaultTime] = useState(() => localTime(Date.now()));
  const [time, setTime] = useState(defaultTime);
  const productionTime = includeTime ? time : defaultTime;
  const [copies, setCopies] = useState("1");
  const [printError, setPrintError] = useState<string | null>(null);
  const size = labelFormats.find((item) => item.value === format)!;
  let label: DateLabel | null = null;
  let dateError: string | null = null;
  try {
    if (!/^\d{2}:\d{2}$/.test(productionTime))
      throw new Error("Angiv et gyldigt klokkeslæt");
    const [hours, minutes] = productionTime.split(":").map(Number);
    if (hours > 23 || minutes > 59)
      throw new Error("Angiv et gyldigt klokkeslæt");
    const producedAt = zonedTimestamp(
      date,
      hours * 60 + minutes,
      DEFAULT_TIME_ZONE,
    );
    if (includeTime && localTime(producedAt) !== productionTime)
      throw new Error(
        "Klokkeslættet findes ikke ved skift til sommertid. Vælg et andet klokkeslæt",
      );
    if (expiry)
      label = {
        productName: product.name,
        includeTime,
        locationName,
        producedAt,
        expiresAt: expiryTimestamp(producedAt, expiry),
      };
  } catch (error) {
    dateError =
      error instanceof Error ? error.message : "Kontrollér produktionsdatoen";
  }
  const copiesValid =
    Number.isInteger(Number(copies)) &&
    Number(copies) >= 1 &&
    Number(copies) <= 100;
  const printer = useSmoothPrint(
    copiesValid ? label : null,
    format,
    Number(copies),
  );
  function print() {
    if (!expiry) {
      onMissingExpiry();
      return;
    }
    if (!label || !copiesValid) return;
    try {
      if (printer.platform) printer.open();
      else printDateLabels(label, format, Number(copies));
      setPrintError(null);
    } catch (error) {
      setPrintError(
        error instanceof Error
          ? error.message
          : "Printvinduet kunne ikke åbnes",
      );
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Print etiket</CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label="Ryd produktvalg"
            onClick={onClose}
          >
            <XIcon />
          </Button>
        </CardAction>
        <CardDescription>{product.name}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="w-20 shrink-0 overflow-hidden rounded-md">
            <ProductCardMedia
              imageUrl={product.imageUrl}
              alt={product.name}
              sizes="80px"
            />
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-medium">{product.name}</p>
            <p className="text-xs text-muted-foreground">
              {expiry
                ? `Holdbarhed: ${formatExpiry(expiry)}`
                : "Holdbarhed ikke angivet"}
            </p>
          </div>
        </div>
        <Separator />
        <FieldGroup>
          <div
            className={cn(
              "grid gap-3",
              includeTime && "grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]",
            )}
          >
            <Field data-invalid={Boolean(dateError)}>
              <FieldLabel htmlFor="label-date">Produktionsdato</FieldLabel>
              <Input
                id="label-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="h-11 min-w-0"
                aria-invalid={Boolean(dateError)}
              />
            </Field>
            {includeTime ? (
              <Field data-invalid={Boolean(dateError)}>
                <FieldLabel htmlFor="label-time">Klokkeslæt</FieldLabel>
                <Input
                  id="label-time"
                  type="time"
                  value={time}
                  onChange={(event) => setTime(event.target.value)}
                  className="h-11 min-w-0"
                  aria-invalid={Boolean(dateError)}
                />
              </Field>
            ) : null}
          </div>
          {dateError ? <FieldError>{dateError}</FieldError> : null}
          <Field data-invalid={!copiesValid}>
            <FieldLabel htmlFor="label-copies">Antal etiketter</FieldLabel>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="min-h-11 min-w-11"
                aria-label="Én etiket færre"
                disabled={Number(copies) <= 1}
                onClick={() =>
                  setCopies(String(Math.max(1, Number(copies) - 1)))
                }
              >
                <MinusIcon />
              </Button>
              <Input
                id="label-copies"
                type="number"
                min={1}
                max={100}
                step={1}
                value={copies}
                onChange={(event) => setCopies(event.target.value)}
                aria-invalid={!copiesValid}
                className="h-11 min-w-0 flex-1 text-center"
              />
              <Button
                variant="outline"
                size="icon"
                className="min-h-11 min-w-11"
                aria-label="Én etiket mere"
                disabled={Number(copies) >= 100}
                onClick={() =>
                  setCopies(String(Math.min(100, Number(copies) + 1)))
                }
              >
                <PlusIcon />
              </Button>
            </div>
            <FieldError>
              {copiesValid ? null : "Vælg mellem 1 og 100 etiketter"}
            </FieldError>
          </Field>
        </FieldGroup>
        <Separator />
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Printer</p>
            {canConfigurePrinter ? (
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                nativeButton={false}
                render={<Link href="/administration/date-labels#printer" />}
              >
                Opsætning
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {printer.platform
              ? "Printeren vælges i Brother Smooth Print"
              : "Printeren vælges i enhedens printdialog"}
          </p>
          {printer.platform ? (
            <p className="text-xs text-muted-foreground">
              Kontrollér printervalget i Smooth Print, når du skifter lokation.
            </p>
          ) : null}
          <Badge variant="outline">{size.label}</Badge>
        </div>
        {label ? (
          <div className="flex flex-col gap-3 rounded-lg bg-muted p-3">
            <p className="text-xs text-muted-foreground">Etiketvisning</p>
            <iframe
              title="Forhåndsvisning af datoetiket"
              sandbox=""
              srcDoc={labelDocument(label, format).replace(
                "</style>",
                "@media screen { .label { width: 100%; height: 100vh; } }</style>",
              )}
              className="w-full rounded-sm border-0"
              style={{ aspectRatio: `${size.width} / ${size.height}` }}
            />
          </div>
        ) : null}
        {printError || printer.error ? (
          <Alert variant="destructive">
            <AlertDescription>{printError ?? printer.error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="flex flex-col gap-2">
        <Button
          className="min-h-12 w-full"
          disabled={
            printer.preparing ||
            Boolean(printer.error) ||
            Boolean(dateError) ||
            !copiesValid
          }
          onClick={print}
        >
          {printer.preparing ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <PrinterIcon data-icon="inline-start" />
          )}
          {expiry
            ? printer.platform
              ? "Print i Smooth Print"
              : `Print ${Number(copies) === 1 ? "etiket" : `${copies} etiketter`}`
            : "Angiv holdbarhed"}
        </Button>
        {printer.opened ? (
          <p role="status" className="text-sm text-muted-foreground">
            Kontrollér resultatet i Smooth Print, før du printer igen. Hvis
            appen ikke åbner, kan du hente den i Administration eller bruge
            enhedens printdialog.
          </p>
        ) : null}
        {printer.platform ? (
          <Button
            variant="ghost"
            className="min-h-11 w-full"
            disabled={!label || !copiesValid}
            onClick={() => {
              if (!label) return;
              try {
                printDateLabels(label, format, Number(copies));
                setPrintError(null);
              } catch (error) {
                setPrintError(
                  error instanceof Error
                    ? error.message
                    : "Printdialogen kunne ikke åbnes",
                );
              }
            }}
          >
            Brug enhedens printdialog
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}
