"use client";

import { searchProducts } from "@/lib/product-search";

import { selectedLocationId } from "@/lib/location-preference";

import { useLastDefined } from "@/lib/use-last-defined";

import { AppBottomBar } from "@/components/app-bottom-bar";
import { AppPageHeader } from "@/components/app-page-header";

import { useConvex, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRightIcon,
  DownloadIcon,
  PackageOpenIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  ShoppingCartIcon,
  StoreIcon,
  TruckIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  useAccess,
  useLocationAccess,
  usePermission,
} from "@/components/app-shell";
import { LocationField } from "@/components/location-field";
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
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { downloadOrderCsv } from "@/lib/ordering-csv";
import {
  useGsSupplyCatalog,
  type GsSupplyProduct,
} from "@/integrations/gssupply/client";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setOrderingLocation, useOrderingLocation } from "@/lib/ordering-prefs";
import {
  DEFAULT_BUFFER_PERCENT,
  DEFAULT_COVERAGE_DAYS,
  forecastOrder,
  parseOrderQuantity,
  shiftOrderDate,
  type DemandObservation,
} from "@/lib/ordering-forecast";
import { getUserErrorMessage } from "@/lib/user-errors";
import { useActiveOrganization } from "@/lib/active-organization";

const numberFormatter = new Intl.NumberFormat("da-DK", {
  maximumFractionDigits: 6,
});
const priceFormatter = new Intl.NumberFormat("da-DK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const NO_SUPPLIER = "none";
const currentMinute = () => Math.floor(Date.now() / 60_000) * 60_000;

export function OrderingPlanner({ navigation }: { navigation?: ReactNode }) {
  const { data: session } = authClient.useSession();
  const organizationId = useActiveOrganization().data?.id;
  // An open internal order being edited.
  const editOrderId = useSearchParams().get("order") as Id<"orders"> | null;
  if (!organizationId) return <Skeleton className="h-96 w-full" />;
  return (
    <Planner
      key={`${organizationId}:${session?.user.id}:${editOrderId}`}
      organizationId={organizationId}
      editOrderId={editOrderId}
      navigation={navigation}
    />
  );
}

function Planner({
  navigation,
  organizationId,
  editOrderId,
}: {
  navigation?: ReactNode;
  organizationId: string;
  editOrderId: Id<"orders"> | null;
}) {
  const access = useAccess();
  const canPlan = usePermission("ordering.plan");
  const canExport = usePermission("ordering.export");
  const canPlace = usePermission("ordering.place");
  const router = useRouter();
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const storedLocationId = useOrderingLocation(organizationId);
  const editOrder = useQuery(
    api.ordering.getEditableOrder,
    canPlan && editOrderId ? { orderId: editOrderId } : "skip",
  );
  const editing = editOrderId !== null;
  const locationId = editing
    ? (editOrder?.locationId ?? null)
    : selectedLocationId({
        locations,
        storedId: storedLocationId,
        lockedId,
        isLocked,
      });
  const [asOf, setAsOf] = useState(currentMinute);
  const [search, setSearch] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  // Internal orders can list a product in several units.
  const [unitLines, setUnitLines] = useState<
    Record<string, { unitId: Id<"units">; input: string }[]>
  >({});
  const [exporting, setExporting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // null until the user has chosen, when suppliers must be chosen first.
  const [supplierChoice, setSupplierValue] = useState<string | null>(null);
  const supplierValue = editOrder?.fulfillingLocationId ?? supplierChoice;
  const [sendEmail, setSendEmail] = useState(true);
  const [catalogInputs, setCatalogInputs] = useState<Record<string, string>>(
    {},
  );
  const busy = exporting || placing;
  const submitting = useRef(false);
  const convex = useConvex();
  const placeOrder = useMutation(api.ordering.placeOrder);
  const updateOrder = useMutation(api.ordering.updateInternalOrder);
  const refreshEnvironment = useMutation(api.forecasts.requestRefresh);
  const settings = useQuery(
    api.orderingSettings.getSettings,
    canPlan ? {} : "skip",
  );
  const includeRecipes = settings?.includeRecipes ?? false;
  const suppliers = useQuery(api.suppliers.list, canPlan ? {} : "skip");
  const internalSuppliers = useQuery(
    api.ordering.listInternalSuppliers,
    canPlan && locationId ? { locationId } : "skip",
  );
  const supplier = useMemo(
    () => suppliers?.find((item) => item.id === supplierValue) ?? null,
    [suppliers, supplierValue],
  );
  // Another location, fulfilled with a Transfer.
  const internalSupplier =
    internalSuppliers?.find((item) => item.locationId === supplierValue) ??
    null;
  const recentUnits = useQuery(
    api.ordering.listRecentInternalUnits,
    canPlan && locationId && internalSupplier ? { locationId } : "skip",
  );
  const recentUnitIds = useMemo(
    () =>
      new Map(recentUnits?.map((item) => [item.productId, item.unitId])),
    [recentUnits],
  );
  const editLines = useMemo(() => {
    const lines = new Map<string, { unitId: Id<"units">; input: string }[]>();
    for (const line of editOrder?.lines ?? []) {
      lines.set(line.productId, [
        ...(lines.get(line.productId) ?? []),
        { unitId: line.unitId, input: String(line.quantity) },
      ]);
    }
    return lines;
  }, [editOrder]);
  const internalProductIds = useMemo(
    () => new Set(internalSupplier?.productIds),
    [internalSupplier],
  );
  const supplierName = supplier?.name ?? internalSupplier?.name;
  const maxLines = internalSupplier ? 200 : 500;
  // An internal supplier may not be offered to the newly chosen location.
  const choosingSupplier =
    supplierValue !== NO_SUPPLIER &&
    !supplier &&
    !internalSupplier &&
    settings !== undefined &&
    settings.chooseSupplierFirst !== false &&
    (suppliers?.length ?? 0) + (internalSuppliers?.length ?? 0) > 0;
  const catalogSupplier = supplier?.catalog === "gssupply";
  const supplierLinks = useQuery(
    api.integrations.gssupply.api.listOrderingLinks,
    canPlan && locationId && catalogSupplier ? { locationId } : "skip",
  );
  const { products: catalog, reload: reloadCatalog } =
    useGsSupplyCatalog(catalogSupplier);
  const linksByProduct = useMemo(
    () =>
      new Map(
        (supplierLinks?.links ?? []).map((link) => [link.productId, link]),
      ),
    [supplierLinks],
  );
  const catalogByNumber = useMemo(
    () =>
      new Map((catalog ?? []).map((item) => [item.productNumber, item])),
    [catalog],
  );
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
    return () => {
      mounted.current = false;
    };
  }, []);

  const liveContext = useQuery(
    api.ordering.getContext,
    canPlan && locationId ? { locationId, asOf } : "skip",
  );
  const context = useLastDefined(liveContext, canPlan ? locationId : null);
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

  // Set per supplier under Administration → Bestilling.
  const coverageDays =
    supplier?.coverageDays ??
    internalSupplier?.coverageDays ??
    settings?.coverageDays ??
    DEFAULT_COVERAGE_DAYS;
  const bufferPercent =
    supplier?.bufferPercent ??
    internalSupplier?.bufferPercent ??
    settings?.bufferPercent ??
    DEFAULT_BUFFER_PERCENT;
  const loading =
    settings === undefined ||
    suppliers === undefined ||
    internalSuppliers === undefined ||
    (internalSupplier !== null && recentUnits === undefined) ||
    (catalogSupplier && (supplierLinks === undefined || catalog === undefined)) ||
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
          context && !context.warning && !loading
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
      history,
      operationalHistory,
      coverageDays,
      bufferPercent,
    ],
  );
  const rows = forecasts.flatMap((product) => {
    // Catalog suppliers list their linked products, ordered in whole packs.
    const link = catalogSupplier ? linksByProduct.get(product.id) : undefined;
    if (
      internalSupplier
        ? !internalProductIds.has(product.id)
        : catalogSupplier
          ? !link
          : !includeRecipes && product.hasIngredients
    ) {
      return [];
    }
    // Internal orders start in the unit last ordered, suggested in whole units.
    const recentUnit = internalSupplier
      ? product.units.find(
          (unit) =>
            unit.id !== product.unitId &&
            unit.id === recentUnitIds.get(product.id),
        )
      : undefined;
    const orderUnitId = link?.unitId ?? recentUnit?.id ?? product.unitId;
    const factor = link?.factorToDefault ?? recentUnit?.factor;
    const catalogItem = link
      ? catalogByNumber.get(link.productNumber)
      : undefined;
    const packs =
      product.forecast.suggested === null || !factor
        ? product.forecast.suggested
        : Math.ceil(product.forecast.suggested / factor - 1e-9);
    const suggested =
      packs && catalogItem ? Math.max(packs, catalogItem.minOrder) : packs;
    const key = `${locationId}:${product.id}:${orderUnitId}`;
    const input = overrides[key] ?? String(suggested ?? 0);
    const parsed = parseOrderQuantity(input);
    // Editing starts from the order, with other products at 0.
    const editStart = editOrder
      ? (editLines.get(product.id) ?? [{ unitId: orderUnitId, input: "0" }])
      : undefined;
    const lines = (
      (internalSupplier && (unitLines[key] ?? editStart)) || [
        { unitId: orderUnitId, input },
      ]
    ).map((line) => ({ ...line, quantity: parseOrderQuantity(line.input) }));
    const quantity = internalSupplier
      ? lines.some((line) => line.quantity === null)
        ? null
        : lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0)
      : link && parsed !== null && !Number.isInteger(parsed)
        ? null
        : parsed;
    return [
      {
        ...product,
        key,
        input,
        quantity,
        suggested,
        orderUnitId,
        orderUnitName: link?.unitName ?? recentUnit?.name ?? product.unitName,
        productNumber: link?.productNumber ?? null,
        catalogItem,
        lines,
        edited:
          overrides[key] !== undefined ||
          (internalSupplier !== null && unitLines[key] !== undefined),
      },
    ];
  });
  const planned = rows.filter(
    (row) => row.quantity !== null && row.quantity > 0,
  );
  // Catalog items without a linked product can still be ordered in whole packs.
  const linkedNumbers = new Set(
    (supplierLinks?.links ?? []).map((link) => link.productNumber),
  );
  const catalogRows =
    catalogSupplier && catalog
      ? catalog
          .filter((item) => !linkedNumbers.has(item.productNumber))
          .map((item) => {
            const input = catalogInputs[item.productNumber] ?? "";
            const parsed = parseOrderQuantity(input);
            return {
              ...item,
              input,
              quantity:
                parsed !== null && Number.isInteger(parsed) ? parsed : null,
            };
          })
      : [];
  const plannedCatalog = catalogRows.filter(
    (row) => row.quantity !== null && row.quantity > 0,
  );
  const orderLines = planned.flatMap((row) =>
    row.lines.flatMap((line) =>
      line.quantity
        ? [{ productId: row.id, unitId: line.unitId, quantity: line.quantity }]
        : [],
    ),
  );
  const plannedCount = orderLines.length + plannedCatalog.length;
  const invalidQuantity =
    rows.some((row) => row.quantity === null) ||
    catalogRows.some((row) => row.quantity === null);
  const orderTotal =
    planned.reduce(
      (sum, row) => sum + (row.catalogItem?.price ?? 0) * (row.quantity ?? 0),
      0,
    ) +
    plannedCatalog.reduce((sum, row) => sum + row.price * (row.quantity ?? 0), 0);
  const catalogLines = plannedCatalog.map((row) => ({
    productNumber: row.productNumber,
    productName: row.name,
    quantity: row.quantity ?? 0,
  }));
  const missingPrices = planned.some((row) => row.productNumber && !row.catalogItem);
  const visible = searchProducts(rows, search, (row) => ({
    name: row.name,
    categoryPath: row.category,
  }));
  const visibleCatalog = searchProducts(catalogRows, search, (row) => ({
    name: `${row.productNumber} ${row.name}`,
    categoryPath: row.category,
  }));

  const supplierItems = [
    { value: NO_SUPPLIER, label: "Ingen leverandør" },
    ...(suppliers ?? []).map((item) => ({ value: item.id, label: item.name })),
    ...(internalSuppliers ?? []).map((item) => ({
      value: item.locationId,
      label: `${item.name} (intern)`,
    })),
  ];

  const showSupplierField =
    Boolean(locationId) &&
    settings !== undefined &&
    suppliers !== undefined &&
    internalSuppliers !== undefined &&
    !choosingSupplier;

  const header = (
    <FieldGroup appearance="standard" className="sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {editing ? "Redigér bestilling" : "Bestilling"}
        </h1>
      </div>
      {canPlan ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          {showSupplierField ? (
            <Field className="sm:w-64">
              <FieldLabel htmlFor="ordering-supplier">Leverandør</FieldLabel>
              <Select
                items={supplierItems}
                value={supplier?.id ?? internalSupplier?.locationId ?? NO_SUPPLIER}
                onValueChange={(value) => setSupplierValue(value ?? NO_SUPPLIER)}
                disabled={busy || editing || suppliers === undefined}
              >
                <SelectTrigger id="ordering-supplier" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {supplierItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <Field className="sm:w-72">
            <FieldLabel htmlFor="ordering-location" className="sr-only">Lokation</FieldLabel>
            <LocationField
              id="ordering-location"
              locations={locations}
              value={locationId}
              locked={isLocked || editing}
              lockedName={
                editing
                  ? locations.find((location) => location.id === locationId)
                      ?.name
                  : lockedName
              }
              disabled={busy || !locations.length}
              onValueChange={(value) => {
                const location = locations.find((item) => item.id === value);
                if (location) {
                  setOrderingLocation(organizationId, location.id);
                  setAsOf(currentMinute());
                }
              }}
            />
          </Field>
        </div>
      ) : null}
    </FieldGroup>
  );

  async function exportPlan() {
    if (
      !locationId ||
      !context ||
      loading ||
      invalidQuantity ||
      !plannedCount ||
      busy
    )
      return;
    if (submitting.current) return;
    submitting.current = true;
    setExporting(true);
    try {
      const result = await convex.query(api.ordering.prepareExport, {
        locationId,
        supplierId: supplier?.id,
        fulfillingLocationId: internalSupplier?.locationId,
        lines: orderLines,
        catalogLines,
      });
      if (!mounted.current) return;
      downloadOrderCsv({
        ...result,
        locationId,
        fromDate: context.today,
        toDate: shiftOrderDate(context.today, coverageDays - 1),
      });
      toast.success("Bestillingen er eksporteret som CSV");
    } catch (error) {
      if (mounted.current)
        toast.error(
          getUserErrorMessage(error, "Bestillingen kunne ikke eksporteres"),
        );
    } finally {
      submitting.current = false;
      if (mounted.current) setExporting(false);
    }
  }

  async function submitOrder() {
    if (
      !canPlace ||
      !locationId ||
      !context ||
      loading ||
      invalidQuantity ||
      !plannedCount ||
      plannedCount > maxLines ||
      submitting.current
    ) return;
    submitting.current = true;
    setPlacing(true);
    if (editOrder) {
      try {
        await updateOrder({ orderId: editOrder.id, lines: orderLines });
        if (!mounted.current) return;
        setConfirming(false);
        toast.success("Bestillingen er opdateret");
        router.push("/ordering/history");
      } catch (error) {
        if (mounted.current) {
          toast.error(
            getUserErrorMessage(error, "Bestillingen kunne ikke opdateres"),
          );
        }
      } finally {
        submitting.current = false;
        if (mounted.current) setPlacing(false);
      }
      return;
    }
    try {
      const emailed = Boolean(supplier?.email && sendEmail);
      await placeOrder({
        locationId,
        supplierId: supplier?.id,
        fulfillingLocationId: internalSupplier?.locationId,
        sendEmail: emailed,
        fromDate: context.today,
        coverageDays,
        bufferPercent,
        lines: orderLines,
        catalogLines,
      });
      if (!mounted.current) return;
      setOrderingLocation(organizationId, locationId);
      setConfirming(false);
      toast.success(
        emailed
          ? `Bestillingen er gemt og sendes til ${supplier?.email}`
          : internalSupplier
            ? `Bestillingen er sendt til ${internalSupplier.name}`
            : "Bestillingen er gemt i bestillingshistorikken",
      );
      router.push("/ordering/history");
    } catch (error) {
      if (mounted.current) {
        toast.error(getUserErrorMessage(error, "Bestillingen kunne ikke afgives"));
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setPlacing(false);
    }
  }

  function quantityInput(row: (typeof rows)[number]) {
    if (internalSupplier) return unitLinesInput(row);
    return (
      <Field data-invalid={row.quantity === null} className="min-w-24">
        <Input
          id={`quantity-${row.id}`}
          aria-label={`Bestil ${row.name} i ${row.orderUnitName}`}
          value={row.input}
          inputMode="decimal"
          className="h-11"
          disabled={busy}
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
            disabled={busy}
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

  function unitLinesInput(row: (typeof rows)[number]) {
    const setLines = (lines: { unitId: Id<"units">; input: string }[]) =>
      setUnitLines((current) => ({ ...current, [row.key]: lines }));
    const unusedUnits = row.units.filter(
      (unit) => !row.lines.some((line) => line.unitId === unit.id),
    );
    return (
      <div className="flex min-w-64 flex-col gap-2">
        {row.lines.map((line, index) => {
          const unitName =
            row.units.find((unit) => unit.id === line.unitId)?.name ?? "";
          const unitItems = row.units
            .filter(
              (unit) =>
                unit.id === line.unitId ||
                !row.lines.some((other) => other.unitId === unit.id),
            )
            .map((unit) => ({ value: unit.id, label: unit.name }));
          const update = (next: Partial<(typeof row.lines)[number]>) =>
            setLines(
              row.lines.map((item, itemIndex) => ({
                unitId: item.unitId,
                input: item.input,
                ...(itemIndex === index ? next : {}),
              })),
            );
          return (
            <Field
              key={index}
              orientation="horizontal"
              data-invalid={line.quantity === null}
            >
              <Input
                id={`quantity-${row.id}-${index}`}
                aria-label={`Bestil ${row.name} i ${unitName}`}
                value={line.input}
                inputMode="decimal"
                className="h-11 w-24"
                disabled={busy}
                aria-invalid={line.quantity === null}
                onChange={(event) => update({ input: event.target.value })}
              />
              <Select
                items={unitItems}
                value={line.unitId}
                onValueChange={(value) => {
                  if (value) update({ unitId: value as Id<"units"> });
                }}
                disabled={busy || unitItems.length < 2}
              >
                <SelectTrigger
                  className="h-11! w-32"
                  aria-label={`Enhed for ${row.name}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {unitItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {row.lines.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  className="size-11"
                  aria-label={`Fjern ${unitName} for ${row.name}`}
                  disabled={busy}
                  onClick={() =>
                    setLines(
                      row.lines
                        .filter((_, itemIndex) => itemIndex !== index)
                        .map(({ unitId, input }) => ({ unitId, input })),
                    )
                  }
                >
                  <XIcon />
                </Button>
              ) : null}
            </Field>
          );
        })}
        <div className="flex flex-wrap gap-1">
          {unusedUnits.length ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                setLines([
                  ...row.lines.map(({ unitId, input }) => ({ unitId, input })),
                  { unitId: unusedUnits[0].id, input: "" },
                ])
              }
            >
              <PlusIcon data-icon="inline-start" />
              Tilføj enhed
            </Button>
          ) : null}
          {row.edited ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                setUnitLines((current) => {
                  const next = { ...current };
                  delete next[row.key];
                  return next;
                })
              }
            >
              {editing ? "Fortryd" : "Brug forslag"}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <AppPageHeader>{header}</AppPageHeader>
      {!canPlan ? (
        <Alert variant="destructive">
          <AlertTitle>Ingen adgang</AlertTitle>
          <AlertDescription>
            Du har ikke adgang til at planlægge bestillinger.
          </AlertDescription>
        </Alert>
      ) : editing && editOrder === undefined ? (
        <Skeleton className="h-72 w-full" />
      ) : editing &&
        (editOrder === null ||
          (internalSuppliers !== undefined && !internalSupplier)) ? (
        <Alert variant="destructive">
          <AlertTitle>Bestillingen kan ikke redigeres</AlertTitle>
          <AlertDescription>
            <div className="flex flex-col items-start gap-3">
              Der er allerede oprettet en transfer for den, eller den kan ikke
              længere bestilles hos leverandøren.
              <Button
                variant="outline"
                render={<Link href="/ordering/history" />}
                nativeButton={false}
              >
                Til bestillingshistorikken
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : !locationId ? (
        <Empty appearance="outlined" className="min-h-72">
          <EmptyHeader>
            <EmptyTitle>Ingen lokationer</EmptyTitle>
            <EmptyDescription>
              Du skal have adgang til en lokation for at planlægge en
              bestilling.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : settings === undefined ||
        suppliers === undefined ||
        internalSuppliers === undefined ? (
        <Skeleton className="h-72 w-full" />
      ) : choosingSupplier ? (
        <section
          aria-labelledby="ordering-choose-supplier"
          className="mt-2 flex flex-col gap-4 pb-40"
        >
          <h2 id="ordering-choose-supplier" className="text-xl font-semibold">
            Hvem vil du bestille hos?
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ...suppliers.map((item) => ({
                value: item.id as string,
                label: item.name,
                description:
                  item.catalog === "gssupply"
                    ? "Koblede produkter med priser fra GS Supply"
                    : "Alle produkter, der kan bestilles",
                Icon: TruckIcon,
              })),
              ...(internalSuppliers ?? []).map((item) => ({
                value: item.locationId as string,
                label: item.name,
                description: "Intern bestilling, som leveres med en transfer",
                Icon: StoreIcon,
              })),
              {
                value: NO_SUPPLIER,
                label: "Ingen leverandør",
                description: "Alle produkter, der kan bestilles",
                Icon: TruckIcon,
              },
            ].map((option) => (
              <Card
                key={option.value}
                role="button"
                tabIndex={0}
                appearance="menu"
                className="cursor-pointer"
                onClick={() => setSupplierValue(option.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSupplierValue(option.value);
                  }
                }}
              >
                <CardHeader>
                  <CardTitle>
                    <span className="flex items-center gap-2">
                      <option.Icon className="size-5" />
                      {option.label}
                    </span>
                  </CardTitle>
                  <CardDescription>{option.description}</CardDescription>
                  <CardAction>
                    <ChevronRightIcon aria-hidden="true" className="text-muted-foreground" />
                  </CardAction>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>
      ) : (
        <div className="flex flex-col gap-5 pb-72 sm:pb-56 lg:pb-40">
          {invalidQuantity ? (
            <Alert variant="destructive">
              <AlertTitle>Kontrollér mængderne</AlertTitle>
              <AlertDescription>
                {catalogSupplier
                  ? "Vælg hele pakker fra 0 til 1.000.000."
                  : "Vælg bestillingsmængder fra 0 til 1.000.000 med højst seks decimaler."}
              </AlertDescription>
            </Alert>
          ) : null}
          {catalogSupplier && catalog === null ? (
            <Alert variant="destructive">
              <AlertTitle>GS Supply-kataloget kunne ikke hentes</AlertTitle>
              <AlertDescription>
                <div className="flex flex-col items-start gap-3">
                  Priser, lager og leveringstid vises ikke. Du kan stadig bestille de koblede Produkter.
                  <Button variant="outline" onClick={reloadCatalog}>
                    <RefreshCwIcon data-icon="inline-start" />
                    Prøv igen
                  </Button>
                </div>
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
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <HelpTooltip
                label="bestillingsforslag"
                content={
                  <div className="flex max-w-sm flex-col gap-2">
                    <p>
                      Forslag bruger op til 90 dages produktforbrug. De
                      seneste otte uger vægter i grundprognosen.
                      Åbningstider og lukkedage medregnes; natåbent fordeles
                      på kalenderdage. Vejr og helligdage læres særskilt fra
                      hvert produkts mængder, når der er nok historik. Staff
                      food og aktiv Waste fremskrives separat og lægges til.
                      Waste kan indgå på lukkedage. Opskrifter i Staff food
                      og Waste omregnes med de nuværende ingredienser. Waste
                      skelner endnu ikke mellem forberedelsestab og
                      undgåeligt spild. Buffer lægges til, og positiv
                      lagerbeholdning trækkes fra. Indgående leverancer er
                      ikke medregnet.
                    </p>
                    {context?.warning ? <p>{context.warning}</p> : null}
                    {operationalHistory.staffFood.unresolvedCount +
                      operationalHistory.waste.unresolvedCount >
                    0 ? (
                      <p>
                        Nogle Staff food- eller Waste-registreringer mangler
                        produkt- eller enhedskoblinger. Forslagene kan være
                        for lave.
                      </p>
                    ) : null}
                    {history.unmappedQuantity > 0 ? (
                      <p>
                        {numberFormatter.format(history.unmappedQuantity)}{" "}
                        solgte enheder mangler produkt- eller
                        enhedskoblinger. Forslagene kan være for lave.
                      </p>
                    ) : null}
                    {context ? <p>{context.environment.message}</p> : null}
                    <p>
                      Vejr fra{" "}
                      <a
                        className="underline"
                        href="https://openweathermap.org/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        OpenWeather
                      </a>
                      , bearbejdet til prognoser under{" "}
                      <a
                        className="underline"
                        href="https://creativecommons.org/licenses/by-sa/4.0/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        CC BY-SA 4.0
                      </a>
                      . Helligdage fra{" "}
                      <a
                        className="underline"
                        href="https://nagerholidays.com/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Nager.Holidays
                      </a>
                      .
                    </p>
                  </div>
                }
              />
              <Button
                variant="outline"
                size="lg"
                disabled={busy || loading}
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
          ) : !visible.length && !visibleCatalog.length ? (
            <Empty appearance="outlined" className="min-h-64">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ShoppingCartIcon />
                </EmptyMedia>
                <EmptyTitle>Ingen produkter at vise</EmptyTitle>
                <EmptyDescription>
                  {catalogSupplier && !rows.length
                    ? "Ingen Produkter er koblet til GS Supply endnu. Kobl dem under Administration → Integrationer → GS Supply."
                    : internalSupplier && !rows.length
                      ? `Ingen Produkter kan bestilles hos ${internalSupplier.name}. Vælg dem under Administration → Bestilling.`
                      : "Prøv en anden søgning, eller tilpas filtrene."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
            {visible.length ? (
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produkt</TableHead>
                    <TableHead>Lager</TableHead>
                    <TableHead className="whitespace-normal">Forventet forbrug</TableHead>
                    {catalogSupplier ? (
                      <TableHead className="whitespace-normal">Pris pr. pakke</TableHead>
                    ) : null}
                    <TableHead>Forslag</TableHead>
                    <TableHead className="w-32">Bestil</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow key={row.id} className="h-20">
                      <TableCell appearance="spaced" className="whitespace-normal">
                        <div className="flex items-center gap-3">
                          <Avatar className="size-14 shrink-0">
                            <AvatarImage
                              src={row.imageUrl ?? undefined}
                              alt=""
                            />
                            <AvatarFallback>
                              <PackageOpenIcon className="size-6" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="font-medium">{row.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {row.productNumber ? `${row.productNumber} · ` : ""}
                              {row.category} · {row.orderUnitName}
                            </div>
                            {row.hasIngredients ? (
                              <Badge variant="secondary">
                                Har ingredienser
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {row.stock === null
                          ? "Ukendt"
                          : numberFormatter.format(row.stock)}
                        <div className="text-xs text-muted-foreground">
                          {row.unitName}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal">
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
                      {catalogSupplier ? (
                        <TableCell className="whitespace-normal">
                          <CatalogItemDetails
                            item={row.catalogItem}
                            catalogLoaded={Boolean(catalog)}
                            quantity={row.quantity}
                          />
                        </TableCell>
                      ) : null}
                      <TableCell className="whitespace-normal">
                        {row.suggested === null
                          ? "Angiv manuelt"
                          : numberFormatter.format(row.suggested)}
                        {row.productNumber || internalSupplier ? (
                          <div className="text-xs text-muted-foreground">
                            {row.orderUnitName}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>{quantityInput(row)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            ) : null}
            {visibleCatalog.length ? (
              <CatalogItemsTable
                supplierName={supplier?.name ?? ""}
                rows={visibleCatalog}
                disabled={busy}
                onQuantityChange={(productNumber, value) =>
                  setCatalogInputs((current) => ({
                    ...current,
                    [productNumber]: value,
                  }))
                }
              />
            ) : null}
            </>
          )}
          {!canExport ? (
            <p className="text-sm text-muted-foreground">
              Du mangler adgang til at eksportere bestillinger.
            </p>
          ) : null}
          {!canPlace ? (
            <p className="text-sm text-muted-foreground">
              Du mangler adgang til at afgive bestillinger.
            </p>
          ) : null}
          {plannedCount > maxLines ? (
            <FieldError>Vælg højst {maxLines} produkter ad gangen.</FieldError>
          ) : null}
          <AppBottomBar>
            <div className="mx-auto flex w-full max-w-(--container-page) flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              {navigation ? <div className="min-w-0" inert={busy}>{navigation}</div> : null}
              <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
              <div className="flex items-center gap-1">
                <p className="font-medium">
                  {plannedCount} produkter i bestillingen
                  {catalogSupplier && catalog
                    ? ` · ${priceFormatter.format(orderTotal)} kr.${missingPrices ? " (uden ukendte priser)" : ""}`
                    : ""}
                </p>
                <HelpTooltip
                  label="produkter i bestillingen"
                  content="Bestillingen og CSV-filen indeholder alle medtagne produkter med mængder over 0, også uden for søgningen."
                />
              </div>
                <div className="flex flex-wrap gap-2">
                  {editing ? (
                    <Button
                      size="lg"
                      variant="outline"
                      className="h-12 flex-1 sm:flex-none"
                      disabled={busy}
                      render={<Link href="/ordering/history" />}
                      nativeButton={false}
                    >
                      Annullér
                    </Button>
                  ) : null}
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12 flex-1 sm:flex-none"
                    disabled={
                      !canExport ||
                      loading ||
                      invalidQuantity ||
                      plannedCount === 0 ||
                      plannedCount > maxLines ||
                      busy
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
                  <Button
                    size="lg"
                    className="h-12 flex-1 sm:flex-none"
                    disabled={
                      !canPlace ||
                      loading ||
                      invalidQuantity ||
                      plannedCount === 0 ||
                      plannedCount > maxLines ||
                      busy
                    }
                    onClick={() => setConfirming(true)}
                  >
                    {editing ? "Gem ændringer" : "Afgiv bestilling"}
                  </Button>
                </div>
              </div>
            </div>
          </AppBottomBar>
          <AlertDialog
            open={confirming}
            onOpenChange={(open) => {
              if (!submitting.current) setConfirming(open);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {editing ? "Gem ændringerne?" : "Afgiv bestillingen?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {plannedCount} {plannedCount === 1 ? "Produkt" : "Produkter"}
                  {supplierName ? ` hos ${supplierName}` : ""}.
                  {supplier && !supplier.email
                    ? " Bestillingen sendes ikke automatisk til leverandøren."
                    : ""}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {supplier?.email ? (
                <Field orientation="horizontal">
                  <Checkbox
                    id="ordering-send-email"
                    checked={sendEmail}
                    onCheckedChange={(checked) => setSendEmail(checked === true)}
                    disabled={placing}
                  />
                  <FieldLabel htmlFor="ordering-send-email">
                    Send bestillingen til {supplier.email}
                  </FieldLabel>
                </Field>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={placing}>Annullér</AlertDialogCancel>
                <AlertDialogAction
                  disabled={placing}
                  onClick={(event) => {
                    event.preventDefault();
                    void submitOrder();
                  }}
                >
                  {placing ? <Spinner data-icon="inline-start" /> : null}
                  {editing ? "Gem ændringer" : "Afgiv bestilling"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
      {canPlan && (!locationId || choosingSupplier) && navigation ? (
        <AppBottomBar>
          <div className="mx-auto w-full max-w-(--container-page)">
            {navigation}
          </div>
        </AppBottomBar>
      ) : null}
    </>
  );
}

function CatalogItemsTable({
  supplierName,
  rows,
  disabled,
  onQuantityChange,
}: {
  supplierName: string;
  rows: Array<
    GsSupplyProduct & { input: string; quantity: number | null }
  >;
  disabled: boolean;
  onQuantityChange: (productNumber: string, value: string) => void;
}) {
  return (
    <section
      aria-labelledby="ordering-catalog-items"
      className="flex flex-col gap-3"
    >
      <div className="flex items-center gap-1">
        <h2 id="ordering-catalog-items" className="text-lg font-semibold">
          Andre varer fra {supplierName}
        </h2>
        <HelpTooltip
          label="andre varer"
          content="Varer fra kataloget, der ikke er koblet til et Produkt. De bestilles i hele pakker uden forslag og påvirker ikke lageret."
        />
      </div>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vare</TableHead>
              <TableHead className="whitespace-normal">Pris pr. pakke</TableHead>
              <TableHead className="w-32 whitespace-normal">Bestil pakker</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.productNumber} className="h-20">
                <TableCell appearance="spaced" className="whitespace-normal">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-14 shrink-0">
                      <AvatarImage src={row.pictureUrl ?? undefined} alt="" />
                      <AvatarFallback>
                        <PackageOpenIcon className="size-6" />
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {row.productNumber} · {row.category}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <CatalogItemDetails
                    item={row}
                    catalogLoaded
                    quantity={row.quantity}
                  />
                </TableCell>
                <TableCell>
                  <Field data-invalid={row.quantity === null} className="min-w-24">
                    <Input
                      id={`catalog-quantity-${row.productNumber}`}
                      aria-label={`Bestil ${row.name} i pakker`}
                      value={row.input}
                      inputMode="numeric"
                      placeholder="0"
                      className="h-11"
                      disabled={disabled}
                      aria-invalid={row.quantity === null}
                      onChange={(event) =>
                        onQuantityChange(row.productNumber, event.target.value)
                      }
                    />
                  </Field>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

/** Price, pack size and supplier warnings for a catalog item. */
function CatalogItemDetails({
  item,
  catalogLoaded,
  quantity,
}: {
  item: GsSupplyProduct | undefined;
  catalogLoaded: boolean;
  quantity: number | null;
}) {
  if (!item) {
    return catalogLoaded ? (
      <div className="text-xs font-medium text-destructive">Ikke i kataloget</div>
    ) : null;
  }
  const ordered = quantity ?? 0;
  return (
    <>
      {priceFormatter.format(item.price)}
      <div className="text-xs text-muted-foreground">
        {numberFormatter.format(item.unitAmount)} pr. pakke
      </div>
      {item.leadTimeDays > 1 ? (
        <Badge variant="secondary">Leveringstid {item.leadTimeDays} dage</Badge>
      ) : null}
      {ordered > 0 && ordered < item.minOrder ? (
        <div className="text-xs font-medium text-destructive">
          Mindst {numberFormatter.format(item.minOrder)} pakker
        </div>
      ) : null}
      {ordered > item.availableQuantity ? (
        <div className="text-xs font-medium text-destructive">
          {item.availableQuantity > 0
            ? `Kun ${numberFormatter.format(item.availableQuantity)} på lager hos GS Supply`
            : "Ikke på lager hos GS Supply"}
        </div>
      ) : null}
    </>
  );
}
