"use client";

import { useConvex, useMutation, useQuery } from "convex/react";
import {
  DownloadIcon,
  Grid2X2Icon,
  ListIcon,
  RefreshCwIcon,
  SearchIcon,
  ShoppingCartIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  useAccess,
  useLocationAccess,
  usePermission,
} from "@/components/app-shell";
import { LocationField } from "@/components/location-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCompleteCatalog } from "@/hooks/use-complete-catalog";
import { authClient } from "@/lib/auth-client";
import { downloadCsv } from "@/lib/download-csv";
import {
  forecastOrder,
  parseOrderQuantity,
  shiftOrderDate,
  type DemandObservation,
} from "@/lib/ordering-forecast";
import { getUserErrorMessage } from "@/lib/user-errors";

const numberFormatter = new Intl.NumberFormat("da-DK", {
  maximumFractionDigits: 6,
});
const csvNumber = (quantity: number) => String(quantity).replace(".", ",");

export function OrderingPlanner() {
  const { data: session } = authClient.useSession();
  return (
    <Planner
      key={`${session?.session.activeOrganizationId}:${session?.user.id}`}
    />
  );
}

function Planner() {
  const access = useAccess();
  const canPlan =
    usePermission("ordering.plan") && !access?.kiosk?.kioskModeEnabled;
  const canExport = usePermission("ordering.export");
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const [selectedLocation, setSelectedLocation] =
    useState<Id<"locations"> | null>(null);
  const locationId = isLocked
    ? lockedId
    : (locations.find((location) => location.id === selectedLocation)?.id ??
      locations[0]?.id ??
      null);
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const [asOf, setAsOf] = useState(() => Date.now());
  const [coverageInput, setCoverageInput] = useState("7");
  const [bufferInput, setBufferInput] = useState("10");
  const [search, setSearch] = useState("");
  const [includeRecipes, setIncludeRecipes] = useState(false);
  const [onlyPlanned, setOnlyPlanned] = useState(false);
  const [view, setView] = useState<"list" | "grid">("list");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);
  const convex = useConvex();
  const refreshEnvironment = useMutation(api.forecasts.requestRefresh);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const frame = requestAnimationFrame(() =>
      setHeaderTarget(document.getElementById("ordering-shell-header")),
    );
    return () => {
      mounted.current = false;
      cancelAnimationFrame(frame);
    };
  }, []);

  const context = useQuery(
    api.ordering.getContext,
    canPlan && locationId ? { locationId, asOf } : "skip",
  );
  const products = useCompleteCatalog(
    api.ordering.listProducts,
    canPlan && locationId ? { locationId } : "skip",
  );
  const consumption = useCompleteCatalog(
    api.ordering.listConsumption,
    canPlan && locationId && context
      ? {
          locationId,
          from: context.historyStartAt,
          to: context.historyEndAt,
        }
      : "skip",
  );
  const history = useMemo(() => {
    const byProduct = new Map<string, DemandObservation[]>();
    let firstDate = context?.today ?? "";
    let unmappedQuantity = 0;
    for (const row of consumption ?? []) {
      if (!context || row.date >= context.today) continue;
      firstDate = firstDate < row.date ? firstDate : row.date;
      if (row.date < context.historyFrom) continue;
      unmappedQuantity += row.unmappedQuantity;
      for (const entry of row.entries) {
        const entries = byProduct.get(entry.productId) ?? [];
        entries.push(entry);
        byProduct.set(entry.productId, entries);
      }
    }
    // The first recorded day may be only partly synchronized.
    const firstCompleteDate =
      firstDate < (context?.today ?? "")
        ? shiftOrderDate(firstDate, 1)
        : firstDate;
    return {
      byProduct,
      from:
        context && firstCompleteDate < context.historyFrom
          ? context.historyFrom
          : firstCompleteDate,
      unmappedQuantity,
    };
  }, [consumption, context]);

  const coverageDays = Number(coverageInput);
  const bufferPercent = Number(bufferInput);
  const validCoverage =
    coverageInput.trim() !== "" &&
    Number.isInteger(coverageDays) &&
    coverageDays >= 1 &&
    coverageDays <= 28;
  const validBuffer =
    bufferInput.trim() !== "" &&
    Number.isFinite(bufferPercent) &&
    bufferPercent >= 0 &&
    bufferPercent <= 100;
  const validSettings = validCoverage && validBuffer;
  const loading =
    !context || products === undefined || consumption === undefined;
  const forecasts = useMemo(
    () =>
      (products ?? []).map((product) => ({
        ...product,
        forecast:
          context && !context.warning && !loading && validSettings
            ? forecastOrder({
                productId: product.id,
                unitId: product.unitId,
                observations: history.byProduct.get(product.id) ?? [],
                historyFrom: history.from,
                today: context.today,
                coverageDays,
                bufferPercent,
                stock: product.stock,
                factors: context.environment.factors.map((factor) => ({ ...factor, source: "weatherHolidays", productId: product.id })),
              })
            : { demand: null, suggested: null, historyDays: 0, limited: true },
      })),
    [
      products,
      context,
      loading,
      validSettings,
      history,
      coverageDays,
      bufferPercent,
    ],
  );
  const rows = forecasts
    .filter((product) => includeRecipes || !product.hasIngredients)
    .map((product) => {
      const key = `${locationId}:${product.id}:${product.unitId}`;
      const input = overrides[key] ?? String(product.forecast.suggested ?? 0);
      return {
        ...product,
        key,
        input,
        quantity: parseOrderQuantity(input),
        edited: overrides[key] !== undefined,
      };
    });
  const planned = rows.filter(
    (row) => row.quantity !== null && row.quantity > 0,
  );
  const invalidQuantity = rows.some((row) => row.quantity === null);
  const visible = rows.filter(
    (row) =>
      (!onlyPlanned || (row.quantity ?? 0) > 0) &&
      `${row.name} ${row.category}`
        .toLocaleLowerCase("da")
        .includes(search.trim().toLocaleLowerCase("da")),
  );

  const header = (
    <FieldGroup className="gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Bestilling
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Planlæg bestilling
        </h1>
      </div>
      {canPlan ? (
        <Field className="sm:max-w-72">
          <FieldLabel htmlFor="ordering-location">Lokation</FieldLabel>
          <LocationField
            id="ordering-location"
            locations={locations}
            value={locationId}
            locked={isLocked}
            lockedName={lockedName}
            disabled={exporting || !locations.length}
            onValueChange={(value) => {
              const location = locations.find((item) => item.id === value);
              if (location) {
                setSelectedLocation(location.id);
                setAsOf(Date.now());
              }
            }}
          />
        </Field>
      ) : null}
    </FieldGroup>
  );

  async function exportPlan() {
    if (
      !locationId ||
      !context ||
      loading ||
      !validSettings ||
      invalidQuantity ||
      !planned.length ||
      exporting
    )
      return;
    setExporting(true);
    try {
      const result = await convex.query(api.ordering.prepareExport, {
        locationId,
        lines: planned.flatMap((row) =>
          row.quantity === null
            ? []
            : [
                {
                  productId: row.id,
                  unitId: row.unitId,
                  quantity: row.quantity,
                },
              ],
        ),
      });
      if (!mounted.current) return;
      downloadCsv(
        `bestilling-${context.today}-${locationId}.csv`,
        [
          "Lokation",
          "Fra dato",
          "Til dato",
          "Produkt-id",
          "Produkt",
          "Enhed",
          "Mængde",
        ],
        result.rows.map((row) => [
          result.locationName,
          context.today,
          shiftOrderDate(context.today, coverageDays - 1),
          row.productId,
          row.productName,
          row.unitName,
          csvNumber(row.quantity),
        ]),
      );
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

  function quantityInput(row: (typeof rows)[number]) {
    return (
      <Field data-invalid={row.quantity === null} className="min-w-32">
        <FieldLabel className="sr-only" htmlFor={`quantity-${row.id}`}>
          Bestil {row.name} i {row.unitName}
        </FieldLabel>
        <Input
          id={`quantity-${row.id}`}
          value={row.input}
          inputMode="decimal"
          className="h-11"
          disabled={exporting}
          aria-invalid={row.quantity === null}
          onChange={(event) =>
            setOverrides((current) => ({
              ...current,
              [row.key]: event.target.value,
            }))
          }
        />
        {row.edited ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={exporting}
            onClick={() =>
              setOverrides((current) => {
                const next = { ...current };
                delete next[row.key];
                return next;
              })
            }
          >
            Brug forslag
          </Button>
        ) : null}
      </Field>
    );
  }

  return (
    <>
      <header className="md:hidden">{header}</header>
      {headerTarget ? createPortal(header, headerTarget) : null}
      {!canPlan ? (
        <Alert variant="destructive">
          <AlertTitle>Ingen adgang</AlertTitle>
          <AlertDescription>
            Du har ikke adgang til at planlægge bestillinger.
          </AlertDescription>
        </Alert>
      ) : !locationId ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyTitle>Ingen lokationer</EmptyTitle>
            <EmptyDescription>
              Du skal have adgang til en lokation for at planlægge en
              bestilling.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Bestillingsforslag</CardTitle>
              <CardDescription>
                Tilpas mængderne. Eksportér som CSV for at gemme din plan.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="gap-5 sm:flex-row sm:items-end">
                <Field className="sm:max-w-48" data-invalid={!validCoverage}>
                  <div className="flex items-center gap-1">
                    <FieldLabel htmlFor="ordering-days">
                      Dækning i dage
                    </FieldLabel>
                    <HelpTooltip
                      label="dækning"
                      content="Antal dage fra i dag, som bestillingen skal dække. Medregn leveringstiden. Vælg 1 til 28 dage."
                    />
                  </div>
                  <Input
                    id="ordering-days"
                    type="number"
                    min={1}
                    max={28}
                    step={1}
                    value={coverageInput}
                    className="h-11"
                    disabled={exporting}
                    aria-invalid={!validCoverage}
                    onChange={(event) => setCoverageInput(event.target.value)}
                  />
                </Field>
                <Field className="sm:max-w-48" data-invalid={!validBuffer}>
                  <div className="flex items-center gap-1">
                    <FieldLabel htmlFor="ordering-buffer">
                      Buffer i %
                    </FieldLabel>
                    <HelpTooltip
                      label="buffer"
                      content="Ekstra mængde oven i det forventede forbrug, før lageret trækkes fra. Vælg 0 til 100 %."
                    />
                  </div>
                  <Input
                    id="ordering-buffer"
                    type="number"
                    min={0}
                    max={100}
                    value={bufferInput}
                    className="h-11"
                    disabled={exporting}
                    aria-invalid={!validBuffer}
                    onChange={(event) => setBufferInput(event.target.value)}
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <HelpTooltip
                    label="bestillingsforslag"
                    content="Forslag bruger op til otte ugers synkroniseret salgsforbrug. Samme ugedage sammenlignes, og nyere uger vægter mest. Solgte opskrifter er omregnet til ingredienser. Vejr og helligdage tilpasser forbruget med effekter lært fra lokationens omsætning, når der er nok historik. Produktmikset antages uændret. Buffer lægges til, og positiv lagerbeholdning trækkes fra. Waste, Staff food og indgående leverancer er ikke medregnet."
                  />
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={exporting || loading}
                    onClick={async () => {
                      setAsOf(Date.now());
                      if (!locationId) return;
                      try {
                        await refreshEnvironment({ locationId });
                        toast.success("Forslag opdateres. Vejr og helligdage genbruges i op til ti minutter.");
                      } catch (error) {
                        toast.error(getUserErrorMessage(error, "Prognosen kunne ikke opdateres"));
                      }
                    }}
                  >
                    <RefreshCwIcon data-icon="inline-start" />
                    Opdatér forslag
                  </Button>
                </div>
              </FieldGroup>
              {context && (
                <p className="mt-4 text-sm text-muted-foreground">
                  {context.environment.message}{" "}
                  Vejr: <a className="underline underline-offset-4" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>.{" "}
                  Helligdage: <a className="underline underline-offset-4" href="https://nagerholidays.com/" target="_blank" rel="noreferrer">Nager.Holidays</a>.
                </p>
              )}
            </CardContent>
          </Card>
          {context?.warning ? (
            <Alert>
              <AlertTitle>Kontrollér datagrundlaget</AlertTitle>
              <AlertDescription>{context.warning}</AlertDescription>
            </Alert>
          ) : null}
          {!loading && history.unmappedQuantity > 0 ? (
            <Alert>
              <AlertTitle>Salg mangler produktkoblinger</AlertTitle>
              <AlertDescription>
                {numberFormatter.format(history.unmappedQuantity)} solgte
                enheder kunne ikke kobles til produkter. Forslagene kan være for
                lave.
              </AlertDescription>
            </Alert>
          ) : null}
          {!validSettings || invalidQuantity ? (
            <Alert variant="destructive">
              <AlertTitle>Kontrollér mængderne</AlertTitle>
              <AlertDescription>
                Vælg 1 til 28 dage, en buffer fra 0 til 100 % og
                bestillingsmængder fra 0 til 1.000.000 med højst seks decimaler.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap items-center gap-4">
            <InputGroup className="h-11 w-full sm:max-w-80">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                placeholder="Søg produkter eller kategori"
                aria-label="Søg produkter eller kategori"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </InputGroup>
            <FieldGroup className="w-auto flex-row flex-wrap gap-4">
              <Field orientation="horizontal" className="w-auto">
                <Switch
                  id="ordering-recipes"
                  checked={includeRecipes}
                  disabled={exporting}
                  onCheckedChange={setIncludeRecipes}
                />
                <FieldLabel htmlFor="ordering-recipes">
                  Medtag produkter med ingredienser
                </FieldLabel>
              </Field>
              <Field orientation="horizontal" className="w-auto">
                <Switch
                  id="ordering-planned"
                  checked={onlyPlanned}
                  onCheckedChange={setOnlyPlanned}
                />
                <FieldLabel htmlFor="ordering-planned">
                  Kun i bestillingen
                </FieldLabel>
              </Field>
            </FieldGroup>
            <ToggleGroup
              value={[view]}
              variant="outline"
              className="ml-auto"
              aria-label="Produktvisning"
              onValueChange={(values) => {
                if (values[0] === "list" || values[0] === "grid")
                  setView(values[0]);
              }}
            >
              <ToggleGroupItem value="list" aria-label="Liste">
                <ListIcon />
                <span className="hidden sm:inline">Liste</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="grid" aria-label="Kort">
                <Grid2X2Icon />
                <span className="hidden sm:inline">Kort</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          {loading ? (
            <div role="status" className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Indlæser produkter og salgsforbrug…
              </p>
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : !visible.length ? (
            <Empty className="min-h-64 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ShoppingCartIcon />
                </EmptyMedia>
                <EmptyTitle>Ingen produkter at vise</EmptyTitle>
                <EmptyDescription>
                  Prøv en anden søgning, eller tilpas filtrene.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : view === "list" ? (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produkt</TableHead>
                    <TableHead>Lager</TableHead>
                    <TableHead>Forventet forbrug</TableHead>
                    <TableHead>Forslag</TableHead>
                    <TableHead className="w-44">Bestil</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="min-w-44 whitespace-normal">
                        <div className="font-medium">{row.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {row.category} · {row.unitName}
                        </div>
                        {row.hasIngredients ? (
                          <Badge variant="secondary">Har ingredienser</Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {row.stock === null
                          ? "Ukendt"
                          : numberFormatter.format(row.stock)}
                        <div className="text-xs text-muted-foreground">
                          {row.unitName}
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.forecast.demand === null
                          ? "Intet salgsgrundlag"
                          : numberFormatter.format(row.forecast.demand)}
                        {row.forecast.demand !== null &&
                        row.forecast.limited ? (
                          <div className="text-xs text-muted-foreground">
                            Begrænset datagrundlag
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {row.forecast.suggested === null
                          ? "Angiv manuelt"
                          : numberFormatter.format(row.forecast.suggested)}
                      </TableCell>
                      <TableCell>{quantityInput(row)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {visible.map((row) => (
                <Card key={row.id}>
                  <CardHeader>
                    <CardTitle>{row.name}</CardTitle>
                    <CardDescription>
                      {row.category} · {row.unitName}
                      {row.hasIngredients ? " · Har ingredienser" : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    <dl className="grid grid-cols-2 gap-2 text-sm">
                      <dt className="text-muted-foreground">Lager</dt>
                      <dd>
                        {row.stock === null
                          ? "Ukendt"
                          : numberFormatter.format(row.stock)}
                      </dd>
                      <dt className="text-muted-foreground">
                        Forventet forbrug
                      </dt>
                      <dd>
                        {row.forecast.demand === null
                          ? "Intet salgsgrundlag"
                          : numberFormatter.format(row.forecast.demand)}
                      </dd>
                      <dt className="text-muted-foreground">Forslag</dt>
                      <dd>
                        {row.forecast.suggested === null
                          ? "Angiv manuelt"
                          : numberFormatter.format(row.forecast.suggested)}
                      </dd>
                    </dl>
                    {row.forecast.limited ? (
                      <p className="text-xs text-muted-foreground">
                        Begrænset datagrundlag
                      </p>
                    ) : null}
                    <div className="text-sm font-medium">
                      Bestil i {row.unitName}
                    </div>
                    {quantityInput(row)}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background p-4">
            <div>
              <p className="font-medium">
                {planned.length} produkter i bestillingen
              </p>
              <p className="text-sm text-muted-foreground">
                CSV indeholder alle medtagne produkter med mængder over 0, også
                uden for søgningen.
              </p>
            </div>
            <Button
              size="lg"
              disabled={
                !canExport ||
                loading ||
                !validSettings ||
                invalidQuantity ||
                planned.length === 0 ||
                planned.length > 500 ||
                exporting
              }
              onClick={() => void exportPlan()}
            >
              {exporting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <DownloadIcon data-icon="inline-start" />
              )}
              Eksportér CSV
            </Button>
            {!canExport ? (
              <p className="w-full text-sm text-muted-foreground">
                Du mangler adgang til at eksportere bestillinger.
              </p>
            ) : null}
            {planned.length > 500 ? (
              <p className="w-full text-sm text-destructive">
                Eksportér højst 500 produkter ad gangen.
              </p>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
