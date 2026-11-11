"use client";

import { dateTimeFormatter as sharedDateTimeFormatter } from "@/lib/date";

import {
  ProductCardMedia,
  productGridClassName,
} from "@/components/catalog/product-card-media";

import { selectedLocationId } from "@/lib/location-preference";

import { StaffFoodNavigation } from "@/components/staff-food/staff-food-navigation";

import { AppPageHeader, PageTitle } from "@/components/app-page-header";

import { EmployeeAvatar } from "@/components/employees/employee-avatar";

import {
  useKiosk,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { BottomBarSkeleton, LocationHeaderSkeleton, ProductGridSkeleton } from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useLastDefined } from "@/lib/use-last-defined";
import { getUserErrorMessage } from "@/lib/user-errors";
import { cn } from "@/lib/utils";
import { setRegistrationLocation, useWasteLocation } from "@/lib/waste-prefs";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import {
  CheckIcon,
  Clock3Icon,
  ImageIcon,
  MapPinIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ShoppingBasketIcon,
  UserRoundIcon,
  UsersRoundIcon,
  UtensilsIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useActiveOrganization } from "@/lib/active-organization";

type Picker = NonNullable<
  ReturnType<typeof useQuery<typeof api.staffFood.getPicker>>
>;
type PickerShift = Picker["shifts"][number];
type SearchResults = NonNullable<
  ReturnType<typeof useQuery<typeof api.staffFood.searchEmployees>>
>;
type SearchEmployee = SearchResults[number];
type SessionState = NonNullable<
  ReturnType<typeof useQuery<typeof api.staffFood.getSessionState>>
>;
type Product = SessionState["products"][number];
type Choices = { removals: Id<"products">[]; additions: Id<"products">[] };

const noChoices: Choices = { removals: [], additions: [] };

function hasModifiers(product: Product) {
  return product.removals.length > 0 || product.additions.length > 0;
}

function choiceSummary(product: Product, value: Choices) {
  const names = [
    ...product.removals
      .filter((option) => value.removals.includes(option.id))
      .map((option) => `Uden ${option.name}`),
    ...product.additions
      .filter((option) => value.additions.includes(option.id))
      .map((option) => `Ekstra ${option.name}`),
  ];
  return names.length ? names.join(", ") : "Ingen tilvalg eller fravalg";
}

function ModifierChoices({
  product,
  value,
  onChange,
}: {
  product: Product;
  value: Choices;
  onChange: (value: Choices) => void;
}) {
  const groups = [
    { key: "removals", title: "Fravalg", prefix: "Uden" },
    { key: "additions", title: "Tilvalg", prefix: "Ekstra" },
  ] as const;
  return (
    <div className="flex flex-col gap-3">
      {groups.map(({ key, title, prefix }) =>
        product[key].length ? (
          <div key={key} className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">{title}</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {product[key].map((option) => {
                const selected = value[key].includes(option.id);
                return (
                  <Toggle
                    key={option.id}
                    variant="outline"
                    className="justify-start"
                    pressed={selected}
                    onPressedChange={(pressed) =>
                      onChange({
                        ...value,
                        [key]: pressed
                          ? [...value[key], option.id]
                          : value[key].filter((id) => id !== option.id),
                      })
                    }
                  >
                    {selected ? <CheckIcon data-icon="inline-start" /> : null}
                    {prefix} {option.name}
                  </Toggle>
                );
              })}
            </div>
          </div>
        ) : null,
      )}
    </div>
  );
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!remainder) return `${hours} t`;
  if (!hours) return `${remainder} min`;
  return `${hours} t ${remainder} min`;
}

function ShiftTime({ shift }: { shift: PickerShift }) {
  const formatter = sharedDateTimeFormatter("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <span className="text-sm text-muted-foreground">
      {formatter.format(shift.startsAt)}–{formatter.format(shift.endsAt)} ·{" "}
      {formatDuration(shift.durationMinutes)}
    </span>
  );
}

function PickerButton({
  shift,
  onSelect,
  disabled,
}: {
  shift: PickerShift;
  onSelect: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="flex min-h-20 w-full items-center gap-3 rounded-xl border bg-card p-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
    >
      <EmployeeAvatar
        name={shift.displayName}
        imageUrl={shift.imageUrl}
        large
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium">{shift.displayName}</span>
        <ShiftTime shift={shift} />
        {shift.roleName ? (
          <span className="truncate text-xs text-muted-foreground">
            {shift.roleName}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function StaffFoodHeader({
  locationId,
  locations,
  organizationId,
  employeeName,
  onLocationChange,
  onEmployeeChange,
  isLocked,
  lockedName,
}: {
  locationId: Id<"locations"> | null;
  locations: Array<{ id: Id<"locations">; name: string }> | undefined;
  organizationId?: string;
  employeeName?: string;
  onLocationChange: () => void;
  onEmployeeChange: () => void;
  isLocked: boolean;
  lockedName?: string | null;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-(--grid-cols-content-action) md:items-center">
      <div className="flex min-w-0 flex-col gap-2">
        <PageTitle>
          Staff food
        </PageTitle>
      </div>
      <div
        className={cn(
          "grid gap-3",
          employeeName ? "sm:grid-cols-2 md:w-96 lg:w-136" : "md:w-80",
        )}
      >
        {employeeName ? (
          <Field>
            <Button
              variant="outline"
              appearance="compact"
              className="h-11 w-full justify-start"
              aria-label={`Skift medarbejder: ${employeeName}`}
              onClick={onEmployeeChange}
            >
              <UserRoundIcon data-icon="inline-start" />
              <span className="truncate">{employeeName}</span>
            </Button>
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="staff-food-location" className="sr-only">Lokation</FieldLabel>
          <LocationField
            id="staff-food-location"
            locations={locations}
            value={locationId}
            locked={isLocked}
            lockedName={lockedName}
            onValueChange={(value) => {
              if (!organizationId) return;
              onLocationChange();
              setRegistrationLocation(organizationId, value);
            }}
          />
        </Field>
      </div>
    </div>
  );
}

function PickerSkeleton() {
  return (
    <Card className="mx-auto w-full max-w-3xl">
      <CardHeader>
        <Skeleton className="h-7 w-36" />
      </CardHeader>
      <CardContent appearance="relaxed" className="flex flex-col">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-5 w-24" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

export function StaffFoodRegistration() {
  const organization = useActiveOrganization();
  const organizationId = organization.data?.id;
  const storedLocationId = useWasteLocation(organizationId);
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const kiosk = useKiosk();
  const canRegister =
    usePermission("staffFood.register") ||
    Boolean(
      kiosk?.kioskModeEnabled &&
      kiosk.settings?.enabledPages.includes("staffFood.register"),
    );
  const [now, setNow] = useState(() => Date.now());
  const [sessionId, setSessionId] = useState<Id<"staffFoodSessions"> | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [manualEmployee, setManualEmployee] = useState<SearchEmployee | null>(
    null,
  );
  const [manualDuration, setManualDuration] = useState("240");
  const [starting, setStarting] = useState(false);
  const [basket, setBasket] = useState<Record<string, number>>({});
  const [choices, setChoices] = useState<Record<string, Choices>>({});
  const [pendingProduct, setPendingProduct] = useState<{
    product: Product;
    add: () => void;
  } | null>(null);
  const [draftChoices, setDraftChoices] = useState<Choices>(noChoices);
  const [editingChoicesId, setEditingChoicesId] = useState<string | null>(null);
  // Kept apart from pendingProduct so the dialog keeps its content while closing.
  const [modifiersOpen, setModifiersOpen] = useState(false);
  const [categoryId, setCategoryId] = useState("all");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [voidCheckoutId, setVoidCheckoutId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const startSession = useMutation(api.staffFood.startSession);
  const register = useMutation(api.staffFood.register);
  const voidCheckout = useMutation(api.staffFood.voidCheckout);

  const locationId = selectedLocationId({
    locations,
    storedId: storedLocationId,
    lockedId,
    isLocked,
  });
  const queryNow = Math.floor(now / 300_000) * 300_000;
  const queriedPicker = useQuery(
    api.staffFood.getPicker,
    canRegister && locationId ? { locationId, now: queryNow } : "skip",
  );
  const picker = useLastDefined(queriedPicker, locationId);
  const queriedSearchResults = useQuery(
    api.staffFood.searchEmployees,
    canRegister && locationId && searchValue
      ? { locationId, search: searchValue, now: queryNow }
      : "skip",
  );
  const searchResults = useLastDefined(
    queriedSearchResults,
    canRegister && locationId && searchValue
      ? `${locationId}:${searchValue}`
      : null,
  );
  const queriedState = useQuery(
    api.staffFood.getSessionState,
    canRegister && sessionId ? { sessionId, now: queryNow } : "skip",
  );
  const state = useLastDefined(queriedState, sessionId);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 300_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearchValue(search.trim()), 200);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!organizationId || !locations || isLocked) return;
    if (!locations.some((location) => location.id === storedLocationId)) {
      const fallback = locations[0]?.id ?? null;
      setRegistrationLocation(organizationId, fallback);
    }
  }, [isLocked, locations, organizationId, storedLocationId]);

  const effectiveCategoryId =
    categoryId === "all" ||
    state?.allowances.some((item) => item.categoryId === categoryId)
      ? categoryId
      : "all";

  const header = (
    <StaffFoodHeader
      locationId={locationId}
      locations={locations}
      organizationId={organizationId}
      employeeName={state?.session.employeeName}
      isLocked={isLocked}
      lockedName={lockedName}
      onLocationChange={() => {
        setSessionId(null);
        setBasket({});
        setConfirming(false);
        setCategoryId("all");
        setManualEmployee(null);
        setSearch("");
      }}
      onEmployeeChange={() => {
        setSessionId(null);
        setBasket({});
        setConfirming(false);
        setCategoryId("all");
        setManualEmployee(null);
        setSearch("");
      }}
    />
  );

  async function chooseScheduled(shift: PickerShift) {
    if (!locationId) return;
    setStarting(true);
    try {
      const id = await startSession({
        selection: { kind: "scheduled", locationId, shiftId: shift.shiftId },
      });
      setSessionId(id);
      setCategoryId("all");
      setSearch("");
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Staff food kunne ikke registreres. Prøv igen.",
        ),
      );
    } finally {
      setStarting(false);
    }
  }

  async function chooseManual() {
    if (!locationId || !manualEmployee) return;
    const durationMinutes = Number(manualDuration);
    if (
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 30 ||
      durationMinutes > 1440 ||
      durationMinutes % 30 !== 0
    ) {
      toast.error("Vælg en vagtlængde mellem 30 minutter og 24 timer");
      return;
    }
    setStarting(true);
    try {
      const id = await startSession({
        selection: {
          kind: "manual",
          locationId,
          employeeId: manualEmployee.employeeId,
          durationMinutes,
        },
      });
      setSessionId(id);
      setCategoryId("all");
      setManualEmployee(null);
      setSearch("");
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Staff food kunne ikke registreres. Prøv igen.",
        ),
      );
    } finally {
      setStarting(false);
    }
  }

  function changeProduct(product: Product, delta: number) {
    const allowance = state?.allowances.find(
      (item) => item.categoryId === product.allowanceCategoryId,
    );
    if (!allowance) return;
    const reserved = Object.entries(basket).reduce((total, [id, quantity]) => {
      const item = state?.products.find((candidate) => candidate.id === id);
      return item?.allowanceCategoryId === product.allowanceCategoryId
        ? total + quantity
        : total;
    }, 0);
    setBasket((current) => {
      const nextValue = Math.max(0, (current[product.id] ?? 0) + delta);
      if (delta > 0 && reserved >= allowance.remaining) return current;
      const next = { ...current };
      if (nextValue) next[product.id] = nextValue;
      else delete next[product.id];
      return next;
    });
  }

  function toggleSingleProduct(product: Product) {
    setBasket((current) => {
      const next = { ...current };
      const selected = (current[product.id] ?? 0) > 0;
      for (const item of state?.products ?? []) {
        if (item.allowanceCategoryId === product.allowanceCategoryId) {
          delete next[item.id];
        }
      }
      if (!selected) next[product.id] = 1;
      return next;
    });
  }

  // Products with tilvalg or fravalg ask for them before entering the basket.
  function selectProduct(product: Product, add: () => void) {
    if (!hasModifiers(product)) return add();
    setDraftChoices(noChoices);
    setPendingProduct({ product, add });
    setModifiersOpen(true);
  }

  async function submit() {
    if (!sessionId) return;
    const items = Object.entries(basket).map(([productId, quantity]) => ({
      productId: productId as Id<"products">,
      quantity,
      ...(choices[productId] ?? noChoices),
    }));
    if (!items.length) return;
    setSubmitting(true);
    try {
      const result = await register({ sessionId, items });
      setConfirming(false);
      setBasket({});
      setChoices({});
      setCategoryId("all");
      setManualEmployee(null);
      setSearch("");
      setSearchValue("");
      setSessionId(null);
      toast.success("Staff food er registreret", {
        duration: 30_000,
        action: {
          label: "Fortryd",
          onClick: () => {
            setVoidReason("");
            setVoidCheckoutId(result.checkoutId);
          },
        },
      });
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Staff food kunne ikke registreres. Prøv igen.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmVoidCheckout() {
    if (!voidCheckoutId || !voidReason.trim()) return;
    try {
      await voidCheckout({
        checkoutId: voidCheckoutId,
        reason: voidReason,
      });
      toast.success("Registreringen er fortrudt");
      setVoidCheckoutId(null);
      setVoidReason("");
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Staff food kunne ikke registreres. Prøv igen.",
        ),
      );
    }
  }

  const basketProducts = useMemo(
    () =>
      Object.entries(basket).flatMap(([id, quantity]) => {
        const product = state?.products.find((item) => item.id === id);
        return product ? [{ product, quantity }] : [];
      }),
    [basket, state],
  );
  const visibleAllowances =
    state?.allowances.filter(
      (allowance) =>
        effectiveCategoryId === "all" ||
        allowance.categoryId === effectiveCategoryId,
    ) ?? [];
  const hasVisibleProducts = visibleAllowances.some((allowance) =>
    state?.products.some(
      (product) => product.allowanceCategoryId === allowance.categoryId,
    ),
  );
  const canManage = usePermission("staffFood.manage");

  if (!canRegister) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at registrere Staff food.
        </AlertDescription>
      </Alert>
    );
  }

  if (!locations) {
    return (
      <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-6">
        <LocationHeaderSkeleton title="Staff food" />
        <PickerSkeleton />
        <BottomBarSkeleton />
      </section>
    );
  }

  // Mirrors the render branches below: the basket bar carries the tabs itself.
  const showBasket = Boolean(
    locations.length &&
      picker?.hasRules &&
      state &&
      state.tierMinimumShiftMinutes !== null,
  );

  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-6 pb-32 sm:pb-24">
      <AppPageHeader>{header}</AppPageHeader>

      {!locations.length ? (
        <Empty appearance="outlined" className="min-h-80">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MapPinIcon />
            </EmptyMedia>
            <EmptyTitle>Ingen lokationer endnu</EmptyTitle>
            <EmptyDescription>
              Opret en lokation, før Staff food kan registreres.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : picker === undefined ? (
        <PickerSkeleton />
      ) : !picker.hasRules ? (
        <Empty appearance="outlined" className="min-h-80">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UtensilsIcon />
            </EmptyMedia>
            <EmptyTitle>Staff food er ikke sat op endnu</EmptyTitle>
            <EmptyDescription>
              En bruger med rollen Administrator skal først oprette en Staff
              food-regel med vagtlængde, kategorier og produkter.
            </EmptyDescription>
          </EmptyHeader>
          {canManage ? (
            <EmptyContent>
              <Button
                render={<Link href="/administration/staff-food" />}
                nativeButton={false}
              >
                Åbn indstillinger
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : sessionId && state === undefined ? (
        <ProductGridSkeleton>
          <CardHeader appearance="product">
            <Skeleton className="h-5 w-2/3" />
          </CardHeader>
          <CardFooter appearance="product" className="mt-auto">
            <Skeleton className="h-12 w-full" />
          </CardFooter>
        </ProductGridSkeleton>
      ) : state ? (
        <>
          {!state.session.active ? (
            <Alert variant="destructive">
              <Clock3Icon />
              <AlertTitle>Vagten er ikke aktiv</AlertTitle>
              <AlertDescription>
                Skift medarbejder for at fortsætte.
              </AlertDescription>
            </Alert>
          ) : null}
          {state.tierMinimumShiftMinutes === null ? (
            <Empty appearance="outlined" className="min-h-72">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Clock3Icon />
                </EmptyMedia>
                <EmptyTitle>Vagten udløser ingen regel</EmptyTitle>
                <EmptyDescription>
                  Vagtlængden på {formatDuration(state.session.durationMinutes)}
                  er kortere end den første Staff food-regel.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => setSessionId(null)}>
                  Skift medarbejder
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <>
              <div className="flex min-w-0 flex-col gap-5">
                <Tabs value={effectiveCategoryId} onValueChange={setCategoryId}>
                  <TabsList className="h-12 w-full justify-start overflow-x-auto overflow-y-hidden" appearance="scrollFade">
                    <TabsTrigger value="all" appearance="standard" className="min-w-20 shrink-0">
                      Alle
                    </TabsTrigger>
                    {state.allowances.map((allowance) => {
                      const reserved = basketProducts
                        .filter(
                          ({ product }) =>
                            product.allowanceCategoryId ===
                            allowance.categoryId,
                        )
                        .reduce((total, item) => total + item.quantity, 0);
                      return (
                        <TabsTrigger
                          key={allowance.categoryId}
                          value={allowance.categoryId}
                          appearance="standard"
                          className="min-w-28 shrink-0"
                        >
                          {allowance.categoryName}
                          <Badge variant="secondary">
                            {Math.max(0, allowance.remaining - reserved)}
                          </Badge>
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </Tabs>

                {hasVisibleProducts ? (
                  <div className="flex flex-col gap-7">
                    {visibleAllowances.map((allowance) => {
                      const products = state.products.filter(
                        (product) =>
                          product.allowanceCategoryId === allowance.categoryId,
                      );
                      if (!products.length) return null;
                      const reserved = basketProducts
                        .filter(
                          ({ product }) =>
                            product.allowanceCategoryId ===
                            allowance.categoryId,
                        )
                        .reduce((total, item) => total + item.quantity, 0);
                      const canAdd =
                        state.session.active && reserved < allowance.remaining;

                      return (
                        <section
                          key={allowance.categoryId}
                          className="flex flex-col gap-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <h2 className="text-lg font-semibold">
                              {allowance.categoryName}
                            </h2>
                            <span className="text-sm text-muted-foreground">
                              {Math.max(0, allowance.remaining - reserved)}{" "}
                              tilbage
                            </span>
                          </div>
                          <div className={productGridClassName}>
                            {products.map((product) => {
                              const quantity = basket[product.id] ?? 0;
                              const unavailable = !canAdd && quantity === 0;
                              return (
                                <Card
                                  key={product.id}
                                  appearance="staffProduct"
                                  unavailable={unavailable}
                                  spacing="responsive"
                                  className="h-full"
                                >
                                  <div className="relative">
                                    <ProductCardMedia
                                      imageUrl={product.imageUrl}
                                      alt={`Produktbillede af ${product.name}`}
                                      fallback={
                                        <ImageIcon
                                          className="size-10 lg:size-12"
                                          aria-hidden="true"
                                        />
                                      }
                                    />
                                    <CardHeader appearance="product">
                                      <CardTitle appearance="truncate">
                                        {product.name}
                                      </CardTitle>
                                    </CardHeader>
                                  </div>
                                  {allowance.amount === 1 ? (
                                    <CardFooter appearance="product" className="mt-auto">
                                      <Button
                                        size="lg"
                                        variant={quantity ? "default" : "outline"}
                                        className="h-12 w-full"
                                        disabled={!canAdd && !quantity}
                                        onClick={() =>
                                          quantity
                                            ? toggleSingleProduct(product)
                                            : selectProduct(product, () =>
                                                toggleSingleProduct(product),
                                              )
                                        }
                                      >
                                        {quantity ? (
                                          <CheckIcon data-icon="inline-start" />
                                        ) : null}
                                        {quantity ? "Valgt" : "Vælg"}
                                      </Button>
                                    </CardFooter>
                                  ) : (
                                    <CardFooter appearance="flush" className="mt-auto grid grid-cols-(--grid-cols-quantity-control)">
                                      <Button
                                        size="icon-lg"
                                        variant="ghost"
                                        appearance="square"
                                        className="size-11"
                                        aria-label={`Fjern én ${product.name}`}
                                        disabled={!quantity}
                                        onClick={() => changeProduct(product, -1)}
                                      >
                                        <MinusIcon />
                                      </Button>
                                      <span className="grid min-h-11 place-items-center border-x text-base font-semibold tabular-nums">
                                        {quantity}
                                      </span>
                                      <Button
                                        size="icon-lg"
                                        variant="ghost"
                                        appearance="square"
                                        className="size-11"
                                        aria-label={`Tilføj én ${product.name}`}
                                        disabled={!canAdd}
                                        onClick={() =>
                                          quantity
                                            ? changeProduct(product, 1)
                                            : selectProduct(product, () =>
                                                changeProduct(product, 1),
                                              )
                                        }
                                      >
                                        <PlusIcon />
                                      </Button>
                                    </CardFooter>
                                  )}
                                </Card>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <Empty appearance="outlined" className="min-h-64">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <UtensilsIcon />
                      </EmptyMedia>
                      <EmptyTitle>Ingen aktive produkter</EmptyTitle>
                      <EmptyDescription>
                        Kategorien har ingen aktive, tilladte produkter.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
              <StaffFoodNavigation
                action={
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 overflow-x-auto">
                    <ShoppingBasketIcon className="shrink-0" />
                    {basketProducts.length ? (
                      <div className="flex min-w-0 items-center gap-2">
                        {basketProducts.map(({ product, quantity }) => (
                          <Badge
                            key={product.id}
                            variant="secondary"
                            className="shrink-0"
                          >
                            {product.name} × {quantity}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Ingen produkter valgt
                      </span>
                    )}
                  </div>
                  <Button
                    size="lg"
                    className="h-12 w-full sm:w-auto sm:min-w-52"
                    disabled={
                      !basketProducts.length ||
                      submitting ||
                      !state.session.active
                    }
                    onClick={() => {
                      setEditingChoicesId(null);
                      setConfirming(true);
                    }}
                  >
                    Registrér Staff food
                  </Button>
                </div>
                }
              />
              <Dialog
                open={modifiersOpen}
                onOpenChange={setModifiersOpen}
              >
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{pendingProduct?.product.name}</DialogTitle>
                    <DialogDescription>
                      Vælg tilvalg og fravalg, eller tilføj produktet som det er.
                    </DialogDescription>
                  </DialogHeader>
                  {pendingProduct ? (
                    <ModifierChoices
                      product={pendingProduct.product}
                      value={draftChoices}
                      onChange={setDraftChoices}
                    />
                  ) : null}
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>
                      Annullér
                    </DialogClose>
                    <Button
                      onClick={() => {
                        if (!pendingProduct) return;
                        pendingProduct.add();
                        setChoices((current) => ({
                          ...current,
                          [pendingProduct.product.id]: draftChoices,
                        }));
                        setModifiersOpen(false);
                      }}
                    >
                      Tilføj
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog
                open={confirming}
                onOpenChange={(open) => {
                  if (!submitting) setConfirming(open);
                }}
              >
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Bekræft registrering</DialogTitle>
                    <DialogDescription>
                      Kontrollér valget, før du registrerer Staff food.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-sm text-muted-foreground">
                        Medarbejder
                      </span>
                      <span className="truncate font-medium">
                        {state.session.employeeName}
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-sm text-muted-foreground">
                        Lokation
                      </span>
                      <span className="truncate font-medium">
                        {state.session.locationName}
                      </span>
                    </div>
                  </div>
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Valgte produkter</CardTitle>
                    </CardHeader>
                    <CardContent appearance="dense" className="flex flex-col">
                      {basketProducts.map(({ product, quantity }) => (
                        <div key={product.id} className="flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate font-medium">
                              {product.name}
                            </span>
                            <Badge variant="secondary" className="shrink-0">
                              {quantity} stk.
                            </Badge>
                          </div>
                          {hasModifiers(product) ? (
                            <>
                              <div className="flex items-center justify-between gap-3">
                                <span className="min-w-0 text-sm text-muted-foreground">
                                  {choiceSummary(
                                    product,
                                    choices[product.id] ?? noChoices,
                                  )}
                                </span>
                                <Button
                                  variant="outline"
                                  className="shrink-0"
                                  aria-expanded={editingChoicesId === product.id}
                                  onClick={() =>
                                    setEditingChoicesId((current) =>
                                      current === product.id ? null : product.id,
                                    )
                                  }
                                >
                                  {editingChoicesId === product.id ? (
                                    <CheckIcon data-icon="inline-start" />
                                  ) : (
                                    <PencilIcon data-icon="inline-start" />
                                  )}
                                  {editingChoicesId === product.id
                                    ? "Færdig"
                                    : "Redigér"}
                                </Button>
                              </div>
                              {editingChoicesId === product.id ? (
                                <ModifierChoices
                                  product={product}
                                  value={choices[product.id] ?? noChoices}
                                  onChange={(value) =>
                                    setChoices((current) => ({
                                      ...current,
                                      [product.id]: value,
                                    }))
                                  }
                                />
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  <DialogFooter>
                    <DialogClose
                      render={
                        <Button variant="outline" disabled={submitting} />
                      }
                    >
                      Tilbage
                    </DialogClose>
                    <Button
                      disabled={submitting || !basketProducts.length}
                      onClick={() => void submit()}
                    >
                      {submitting ? <Spinner data-icon="inline-start" /> : null}
                      Bekræft registrering
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </>
      ) : null}

      {picker?.hasRules && !sessionId && locations.length ? (
        <Card className="mx-auto w-full max-w-3xl">
          <CardHeader>
            <CardTitle appearance="large">Hvem er du?</CardTitle>
          </CardHeader>
          <CardContent appearance="relaxed" className="flex flex-col">
            <InputGroup className="h-11">
              <InputGroupInput
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setManualEmployee(null);
                }}
                placeholder="Søg blandt alle medarbejdere"
                aria-label="Søg blandt alle medarbejdere"
              />
              <InputGroupAddon align="inline-start">
                <SearchIcon />
              </InputGroupAddon>
            </InputGroup>

            {manualEmployee ? (
              <Card>
                <CardHeader>
                  <CardTitle appearance="spaced" className="flex items-center">
                    <EmployeeAvatar
                      name={manualEmployee.displayName}
                      imageUrl={manualEmployee.imageUrl}
                      large
                    />
                    {manualEmployee.displayName}
                  </CardTitle>
                  <CardDescription>
                    Angiv vagtens samlede længde. Erstatningsvagten gælder
                    resten af dagen på denne lokation.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Field>
                    <FieldLabel htmlFor="manual-shift-duration">
                      Vagtlængde i timer
                    </FieldLabel>
                    <Input
                      id="manual-shift-duration"
                      type="number"
                      inputMode="decimal"
                      min={0.5}
                      max={24}
                      step={0.5}
                      value={Number(manualDuration) / 60}
                      onChange={(event) =>
                        setManualDuration(
                          String(Number(event.target.value) * 60),
                        )
                      }
                      className="h-11 max-w-48"
                    />
                    <FieldDescription>
                      Mellem 0,5 og 24 timer i halve timer.
                    </FieldDescription>
                  </Field>
                </CardContent>
                <CardFooter appearance="compact" className="justify-end">
                  <Button
                    variant="outline"
                    onClick={() => setManualEmployee(null)}
                  >
                    Tilbage
                  </Button>
                  <Button
                    disabled={starting}
                    onClick={() => void chooseManual()}
                  >
                    {starting ? <Spinner data-icon="inline-start" /> : null}
                    Fortsæt
                  </Button>
                </CardFooter>
              </Card>
            ) : searchValue ? (
              searchResults === undefined ? (
                <Skeleton className="h-48 w-full" />
              ) : searchResults.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {searchResults.flatMap((employee) =>
                    employee.activeShifts.length
                      ? employee.activeShifts.map((shift) => (
                          <PickerButton
                            key={shift.shiftId}
                            shift={shift}
                            disabled={starting}
                            onSelect={() => void chooseScheduled(shift)}
                          />
                        ))
                      : [
                          <button
                            key={employee.employeeId}
                            type="button"
                            disabled={starting}
                            onClick={() => setManualEmployee(employee)}
                            className="flex min-h-20 items-center gap-3 rounded-xl border bg-card p-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                          >
                            <EmployeeAvatar
                              name={employee.displayName}
                              imageUrl={employee.imageUrl}
                              large
                            />
                            <span className="flex min-w-0 flex-1 flex-col gap-1">
                              <span className="truncate font-medium">
                                {employee.displayName}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                Erstatningsvagt
                              </span>
                            </span>
                          </button>,
                        ],
                  )}
                </div>
              ) : (
                <Empty appearance="outlined" className="min-h-48">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <UserRoundIcon />
                    </EmptyMedia>
                    <EmptyTitle>Ingen medarbejdere fundet</EmptyTitle>
                    <EmptyDescription>Prøv en anden søgning.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )
            ) : picker?.shifts.length ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-medium">På vagt nu</h2>
                  <Badge variant="secondary">{picker.shifts.length}</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {picker.shifts.map((shift) => (
                    <PickerButton
                      key={shift.shiftId}
                      shift={shift}
                      disabled={starting}
                      onSelect={() => void chooseScheduled(shift)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <Empty appearance="outlined" className="min-h-52">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UsersRoundIcon />
                  </EmptyMedia>
                  <EmptyTitle>Ingen er på vagt lige nu</EmptyTitle>
                  <EmptyDescription>
                    Søg efter en medarbejder ovenfor for at registrere en
                    erstatningsvagt.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
          <CardFooter>
            <p className="mr-auto text-xs text-muted-foreground">
              Staff food registreres på den valgte medarbejder og lokation.
            </p>
          </CardFooter>
        </Card>
      ) : null}

      <AlertDialog
        open={Boolean(voidCheckoutId)}
        onOpenChange={(open) => {
          if (!open) setVoidCheckoutId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Fortryd Staff food-registrering?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Lageret bliver ført tilbage. Skriv en begrundelse for ændringen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="staff-food-void-reason">
              Begrundelse
            </FieldLabel>
            <Textarea
              id="staff-food-void-reason"
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              placeholder="Skriv, hvorfor registreringen fortrydes"
              required
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>Behold</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!voidReason.trim()}
              onClick={() => void confirmVoidCheckout()}
            >
              Fortryd registrering
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {showBasket ? null : <StaffFoodNavigation />}
    </section>
  );
}
