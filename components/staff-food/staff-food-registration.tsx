"use client";

import { useMutation, useQuery } from "convex/react";
import {
  CheckIcon,
  CheckCircle2Icon,
  Clock3Icon,
  ImageIcon,
  MapPinIcon,
  MinusIcon,
  PlusIcon,
  SearchIcon,
  ShoppingBasketIcon,
  UserRoundIcon,
  UsersRoundIcon,
  UtensilsIcon,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { LocationField } from "@/components/location-field";
import { Textarea } from "@/components/ui/textarea";
import { useKiosk, useLocationAccess, usePermission } from "@/components/app-shell";
import { useSidebar } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { setCountLocation } from "@/lib/count-prefs";
import { useLastDefined } from "@/lib/use-last-defined";
import { cn } from "@/lib/utils";
import { setWasteLocation, useWasteLocation } from "@/lib/waste-prefs";

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

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Staff food kunne ikke registreres";
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!remainder) return `${hours} t`;
  if (!hours) return `${remainder} min`;
  return `${hours} t ${remainder} min`;
}

function EmployeeAvatar({
  name,
  imageUrl,
  large = false,
}: {
  name: string;
  imageUrl: string | null;
  large?: boolean;
}) {
  return (
    <Avatar
      size={large ? "lg" : "default"}
      className={large ? "size-12" : undefined}
    >
      {imageUrl ? <AvatarImage src={imageUrl} alt="" /> : null}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

function ShiftTime({ shift }: { shift: PickerShift }) {
  const formatter = new Intl.DateTimeFormat("da-DK", {
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
    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Staff food
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Staff food
        </h1>
      </div>
      <div
        className={cn(
          "grid gap-3",
          employeeName ? "sm:grid-cols-2 md:w-[34rem]" : "md:w-80",
        )}
      >
        {employeeName ? (
          <Field>
            <FieldLabel>Medarbejder</FieldLabel>
            <Button
              variant="outline"
              className="h-11 w-full justify-start px-3"
              onClick={onEmployeeChange}
            >
              <UserRoundIcon data-icon="inline-start" />
              <span className="truncate">{employeeName}</span>
            </Button>
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="staff-food-location">Lokation</FieldLabel>
          <LocationField
            id="staff-food-location"
            locations={locations}
            value={locationId}
            locked={isLocked}
            lockedName={lockedName}
            onValueChange={(value) => {
              if (!organizationId) return;
              onLocationChange();
              setWasteLocation(organizationId, value);
              setCountLocation(organizationId, value);
            }}
          />
        </Field>
      </div>
    </div>
  );
}

export function StaffFoodRegistration() {
  const router = useRouter();
  const sidebar = useSidebar();
  const organization = authClient.useActiveOrganization();
  const organizationId = organization.data?.id;
  const storedLocationId = useWasteLocation(organizationId);
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const kiosk = useKiosk();
  const canRegister = usePermission("staffFood.register") || Boolean(kiosk?.kioskModeEnabled && kiosk.settings?.enabledPages.includes("staffFood.register"));
  const [now, setNow] = useState(() => Date.now());
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
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
  const [categoryId, setCategoryId] = useState("all");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [voidCheckoutId, setVoidCheckoutId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [success, setSuccess] = useState(false);
  const redirectTimer = useRef<number | null>(null);
  const startSession = useMutation(api.staffFood.startSession);
  const register = useMutation(api.staffFood.register);
  const voidCheckout = useMutation(api.staffFood.voidCheckout);

  const locationId = isLocked
    ? lockedId
    : locations?.some((location) => location.id === storedLocationId)
      ? (storedLocationId as Id<"locations">)
      : (locations?.[0]?.id ?? null);
  const queryNow = Math.floor(now / 30_000) * 30_000;
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
    canRegister && locationId && searchValue ? `${locationId}:${searchValue}` : null,
  );
  const queriedState = useQuery(
    api.staffFood.getSessionState,
    canRegister && sessionId ? { sessionId, now: queryNow } : "skip",
  );
  const state = useLastDefined(queriedState, sessionId);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      if (redirectTimer.current !== null) {
        window.clearTimeout(redirectTimer.current);
        redirectTimer.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearchValue(search.trim()), 200);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setHeaderTarget(document.getElementById("staff-food-shell-header"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!organizationId || !locations || isLocked) return;
    if (!locations.some((location) => location.id === storedLocationId)) {
      const fallback = locations[0]?.id ?? null;
      setWasteLocation(organizationId, fallback);
      setCountLocation(organizationId, fallback);
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
      toast.error(message(error));
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
      toast.error(message(error));
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

  async function submit() {
    if (!sessionId) return;
    const items = Object.entries(basket).map(([productId, quantity]) => ({
      productId: productId as Id<"products">,
      quantity,
    }));
    if (!items.length) return;
    setSubmitting(true);
    try {
      const result = await register({ sessionId, items });
      setConfirming(false);
      setSuccess(true);
      setBasket({});
      toast.success("Staff food er registreret", {
        duration: 30_000,
        action: {
          label: "Fortryd",
          onClick: () => {
            if (redirectTimer.current !== null) {
              window.clearTimeout(redirectTimer.current);
              redirectTimer.current = null;
            }
            setVoidReason("");
            setVoidCheckoutId(result.checkoutId);
          },
        },
      });
      redirectTimer.current = window.setTimeout(() => {
        redirectTimer.current = null;
        router.replace("/waste");
      }, 30_000);
    } catch (error) {
      toast.error(message(error));
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
      toast.error(message(error));
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
        <AlertDescription>Du har ikke adgang til at registrere Staff food.</AlertDescription>
      </Alert>
    );
  }

  if (!locations) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 pb-32 sm:pb-24">
      <header className="md:hidden">{header}</header>
      {headerTarget ? createPortal(header, headerTarget) : null}

      {!locations.length ? (
        <Empty className="min-h-80 border">
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
        <Skeleton className="h-96 w-full" />
      ) : !picker.hasRules ? (
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UtensilsIcon />
            </EmptyMedia>
            <EmptyTitle>Staff food er ikke sat op endnu</EmptyTitle>
            <EmptyDescription>
              En bruger med rollen Administrator skal oprette mindst én regel for vagtlængde,
              kategorier og produkter.
            </EmptyDescription>
          </EmptyHeader>
          {canManage ? (
            <EmptyContent>
              <Button
                render={<Link href="/organization/staff-food" />}
                nativeButton={false}
              >
                Åbn indstillinger
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : success ? (
        <div className="grid min-h-[28rem] place-items-center">
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground">
              <CheckCircle2Icon className="size-8" />
            </span>
            <h2 className="text-2xl font-semibold">
              Staff food er registreret
            </h2>
            <p className="text-muted-foreground">
              Du sendes tilbage til Waste.
            </p>
          </div>
        </div>
      ) : sessionId && state === undefined ? (
        <Skeleton className="h-96 w-full" />
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
            <Empty className="min-h-72 border">
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
                  <TabsList className="h-12 w-full justify-start overflow-x-auto overflow-y-hidden">
                    <TabsTrigger value="all" className="min-w-20 shrink-0 px-4">
                      Alle
                    </TabsTrigger>
                    {state.allowances.map((allowance) => {
                      const reserved = basketProducts
                        .filter(
                          ({ product }) =>
                            product.allowanceCategoryId === allowance.categoryId,
                        )
                        .reduce((total, item) => total + item.quantity, 0);
                      return (
                        <TabsTrigger
                          key={allowance.categoryId}
                          value={allowance.categoryId}
                          className="min-w-28 shrink-0 px-4"
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
                            product.allowanceCategoryId === allowance.categoryId,
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
                          <div className="grid gap-3 min-[380px]:grid-cols-2 min-[640px]:grid-cols-3 min-[1024px]:grid-cols-4 lg:gap-5 min-[1200px]:grid-cols-5 min-[1600px]:grid-cols-6 min-[1920px]:grid-cols-7 min-[2240px]:grid-cols-8">
                            {products.map((product) => {
                              const quantity = basket[product.id] ?? 0;
                              const unavailable = !canAdd && quantity === 0;
                              return (
                                <Card
                                  key={product.id}
                                  className={cn(
                                    "h-full gap-0 py-0 [--card-spacing:--spacing(3)] transition-[opacity,filter,box-shadow] lg:[--card-spacing:--spacing(4)]",
                                    unavailable && "opacity-40 grayscale",
                                  )}
                                >
                                  <div className="relative">
                                    {product.imageUrl ? (
                                      <div className="relative aspect-video w-full overflow-hidden bg-muted lg:aspect-[4/3]">
                                        <Image
                                          src={product.imageUrl}
                                          alt={`Produktbillede af ${product.name}`}
                                          fill
                                          sizes="(max-width: 379px) 100vw, (max-width: 639px) 50vw, (max-width: 1023px) 33vw, (max-width: 1199px) 25vw, (max-width: 1599px) 20vw, (max-width: 1919px) 16vw, (max-width: 2239px) 14vw, 12vw"
                                          className="object-cover"
                                        />
                                      </div>
                                    ) : (
                                      <div className="flex aspect-video w-full items-center justify-center bg-muted text-muted-foreground lg:aspect-[4/3]">
                                        <ImageIcon className="size-10 lg:size-12" />
                                      </div>
                                    )}
                                    <CardHeader className="py-2.5">
                                      <CardTitle className="truncate">
                                        {product.name}
                                      </CardTitle>
                                    </CardHeader>
                                  </div>
                                  {allowance.amount === 1 ? (
                                    <CardFooter className="mt-auto border-t-0 p-3 pt-0">
                                      <Button
                                        size="lg"
                                        className="h-12 w-full"
                                        disabled={!canAdd && !quantity}
                                        onClick={() =>
                                          toggleSingleProduct(product)
                                        }
                                      >
                                        {quantity ? (
                                          <CheckIcon data-icon="inline-start" />
                                        ) : null}
                                        {quantity ? "Valgt" : "Vælg"}
                                      </Button>
                                    </CardFooter>
                                  ) : (
                                    <CardFooter className="mt-auto grid grid-cols-[2.75rem_1fr_2.75rem] p-0">
                                      <Button
                                        size="icon-lg"
                                        variant="ghost"
                                        className="size-11 rounded-none"
                                        aria-label={`Fjern én ${product.name}`}
                                        disabled={!quantity}
                                        onClick={() =>
                                          changeProduct(product, -1)
                                        }
                                      >
                                        <MinusIcon />
                                      </Button>
                                      <span className="grid min-h-11 place-items-center border-x text-base font-semibold tabular-nums">
                                        {quantity}
                                      </span>
                                      <Button
                                        size="icon-lg"
                                        variant="ghost"
                                        className="size-11 rounded-none"
                                        aria-label={`Tilføj én ${product.name}`}
                                        disabled={!canAdd}
                                        onClick={() =>
                                          changeProduct(product, 1)
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
                  <Empty className="min-h-64 border">
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
              <div
                className="fixed inset-x-0 bottom-0 z-10 border-t bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:right-0"
                style={{
                  left: sidebar.isMobile
                    ? 0
                    : sidebar.state === "collapsed"
                      ? "var(--sidebar-width-icon)"
                      : "var(--sidebar-width)",
                }}
              >
                <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-2 sm:flex-row sm:items-center">
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
                    onClick={() => setConfirming(true)}
                  >
                    Registrér Staff food
                  </Button>
                </div>
              </div>
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
                    <CardContent className="flex flex-col gap-2">
                      {basketProducts.map(({ product, quantity }) => (
                        <div
                          key={product.id}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="min-w-0 truncate font-medium">
                            {product.name}
                          </span>
                          <Badge variant="secondary" className="shrink-0">
                            {quantity} stk.
                          </Badge>
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
            <CardTitle className="text-xl">Hvem er du?</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
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
                  <CardTitle className="flex items-center gap-3">
                    <EmployeeAvatar
                      name={manualEmployee.displayName}
                      imageUrl={manualEmployee.imageUrl}
                      large
                    />
                    {manualEmployee.displayName}
                  </CardTitle>
                  <CardDescription>
                    Angiv den samlede vagtlængde. Samme erstatningsvagt bruges
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
                <CardFooter className="justify-end gap-2">
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
                <Empty className="min-h-48 border">
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
              <Empty className="min-h-52 border">
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
            <AlertDialogTitle>Fortryd Staff food-registrering?</AlertDialogTitle>
            <AlertDialogDescription>
              Lageret bliver ført tilbage. Skriv en begrundelse for ændringen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="staff-food-void-reason">Begrundelse</FieldLabel>
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
    </section>
  );
}
