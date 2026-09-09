"use client";

import { useConvex, useMutation, useQuery } from "convex/react";
import {
  DownloadIcon,
  PackageOpenIcon,
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
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
const currentMinute = () => Math.floor(Date.now() / 60_000) * 60_000;

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
  const [asOf, setAsOf] = useState(currentMinute);
  const [coverageInput, setCoverageInput] = useState("7");
  const [bufferInput, setBufferInput] = useState("10");
  const [search, setSearch] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);
  const convex = useConvex();
  const refreshEnvironment = useMutation(api.forecasts.requestRefresh);
  const settings = useQuery(api.orderingSettings.getSettings, canPlan ? {} : "skip");
  const includeRecipes = settings?.includeRecipes ?? false;
  const mounted = useRef(true);

  useEffect(() => {
    const update = () => setAsOf(currentMinute());
    const interval = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", update);
    };
  }, []);

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

  const liveContext = useQuery(
    api.ordering.getContext,
    canPlan && locationId ? { locationId, asOf } : "skip",
  );
  const contextLocation = canPlan ? locationId : null;
  const [lastContext, setLastContext] = useState({
    locationId: contextLocation,
    value: liveContext,
  });
  if (
    lastContext.locationId !== contextLocation ||
    (liveContext !== undefined && liveContext !== lastContext.value)
  ) {
    setLastContext({ locationId: contextLocation, value: liveContext });
  }
  // Keep the history subscriptions and editable rows during a clock refresh.
  const context = liveContext ?? (
    lastContext.locationId === contextLocation ? lastContext.value : undefined
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
  const staffFood = useCompleteCatalog(
    api.ordering.listOperationalConsumption,
    canPlan && locationId && context
      ? {
          locationId,
          from: context.historyStartAt,
          to: context.historyEndAt,
          source: "staffFood",
        }
      : "skip",
  );
  const waste = useCompleteCatalog(
    api.ordering.listOperationalConsumption,
    canPlan && locationId && context
      ? {
          locationId,
          from: context.historyStartAt,
          to: context.historyEndAt,
          source: "waste",
        }
      : "skip",
  );
  const operationalHistory = useMemo(() => {
    function group(rows: NonNullable<typeof staffFood>) {
      const byProduct = new Map<string, DemandObservation[]>();
      let unresolvedCount = 0;
      for (const row of rows) {
        if (
          !context ||
          row.date >= context.today ||
          row.date < context.historyFrom
        )
          continue;
        unresolvedCount += row.unresolvedCount;
        for (const entry of row.entries) {
          const observations = byProduct.get(entry.productId) ?? [];
          observations.push(entry);
          byProduct.set(entry.productId, observations);
        }
      }
      return { byProduct, unresolvedCount };
    }
    return { staffFood: group(staffFood ?? []), waste: group(waste ?? []) };
  }, [staffFood, waste, context]);
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
    settings === undefined ||
    !context ||
    products === undefined ||
    consumption === undefined ||
    staffFood === undefined ||
    waste === undefined;
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
                operationalHistoryFrom: context.historyFrom,
                today: context.today,
                coverageDays,
                bufferPercent,
                stock: product.stock,
                conditions: context.environment.conditions,
                openingDays: context.openingDays,
                staffFood:
                  operationalHistory.staffFood.byProduct.get(product.id) ?? [],
                waste: operationalHistory.waste.byProduct.get(product.id) ?? [],
              })
            : {
                demand: null,
                suggested: null,
                salesDemand: 0,
                staffFoodDemand: 0,
                wasteDemand: 0,
                historyDays: 0,
                limited: true,
              },
      })),
    [
      products,
      context,
      loading,
      validSettings,
      history,
      operationalHistory,
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
                setAsOf(currentMinute());
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
                    content={
                      <div className="flex max-w-sm flex-col gap-2">
                        <p>Forslag bruger op til 90 dages produktforbrug. De seneste otte uger vægter i grundprognosen. Åbningstider og lukkedage medregnes; natåbent fordeles på kalenderdage. Vejr og helligdage læres særskilt fra hvert produkts mængder, når der er nok historik. Staff food og aktiv Waste fremskrives separat og lægges til. Waste kan indgå på lukkedage. Opskrifter i Staff food og Waste omregnes med de nuværende ingredienser. Waste skelner endnu ikke mellem forberedelsestab og undgåeligt spild. Buffer lægges til, og positiv lagerbeholdning trækkes fra. Indgående leverancer er ikke medregnet.</p>
                        {context?.warning ? <p>{context.warning}</p> : null}
                        {operationalHistory.staffFood.unresolvedCount + operationalHistory.waste.unresolvedCount > 0 ? (
                          <p>Nogle Staff food- eller Waste-registreringer mangler produkt- eller enhedskoblinger. Forslagene kan være for lave.</p>
                        ) : null}
                        {history.unmappedQuantity > 0 ? (
                          <p>{numberFormatter.format(history.unmappedQuantity)} solgte enheder mangler produkt- eller enhedskoblinger. Forslagene kan være for lave.</p>
                        ) : null}
                        {context ? <p>{context.environment.message}</p> : null}
                        <p>
                          Vejr fra <a className="underline" href="https://openweathermap.org/" target="_blank" rel="noreferrer">OpenWeather</a>,
                          bearbejdet til prognoser under <a className="underline" href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>.
                          Helligdage fra <a className="underline" href="https://nagerholidays.com/" target="_blank" rel="noreferrer">Nager.Holidays</a>.
                        </p>
                      </div>
                    }
                  />
                  <Button
                    variant="outline"
                    size="lg"
                    disabled={exporting || loading}
                    onClick={async () => {
                      setAsOf(currentMinute());
                      if (!locationId) return;
                      try {
                        await refreshEnvironment({ locationId });
                        toast.success(
                          "Forslag opdateres. Vejr og helligdage genbruges i op til ti minutter.",
                        );
                      } catch (error) {
                        toast.error(
                          getUserErrorMessage(
                            error,
                            "Prognosen kunne ikke opdateres",
                          ),
                        );
                      }
                    }}
                  >
                    <RefreshCwIcon data-icon="inline-start" />
                    Opdatér forslag
                  </Button>
                </div>
              </FieldGroup>
            </CardContent>
          </Card>
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
          </div>
          {loading ? (
            <div role="status" className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Indlæser produkter, salg, Staff food og Waste…
              </p>
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-20 w-full" />
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
          ) : (
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
                    <TableRow key={row.id} className="h-20">
                      <TableCell className="min-w-44 py-3 whitespace-normal">
                        <div className="flex items-center gap-3">
                          <Avatar className="size-14">
                            <AvatarImage src={row.imageUrl ?? undefined} alt="" />
                            <AvatarFallback><PackageOpenIcon className="size-6" /></AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="font-medium">{row.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {row.category} · {row.unitName}
                            </div>
                            {row.hasIngredients ? (
                              <Badge variant="secondary">Har ingredienser</Badge>
                            ) : null}
                          </div>
                        </div>
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
                          ? "Intet forbrugsgrundlag"
                          : numberFormatter.format(row.forecast.demand)}
                        {row.forecast.staffFoodDemand > 0 ||
                        row.forecast.wasteDemand > 0 ? (
                          <div className="text-xs text-muted-foreground">
                            Heraf Staff food:{" "}
                            {numberFormatter.format(
                              row.forecast.staffFoodDemand,
                            )}{" "}
                            · Waste:{" "}
                            {numberFormatter.format(row.forecast.wasteDemand)}
                          </div>
                        ) : null}
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
