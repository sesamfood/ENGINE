"use client";

import { useMutation, useQuery } from "convex/react";
import {
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
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { canManageStaffFood } from "@/lib/auth-permissions";
import { setCountLocation } from "@/lib/count-prefs";
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
    : "Personalemaden kunne ikke registreres";
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
    <Avatar size={large ? "lg" : "default"} className={large ? "size-12" : undefined}>
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
      <EmployeeAvatar name={shift.displayName} imageUrl={shift.imageUrl} large />
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
}: {
  locationId: Id<"locations"> | null;
  locations: Array<{ id: Id<"locations">; name: string }> | undefined;
  organizationId?: string;
  employeeName?: string;
  onLocationChange: () => void;
}) {
  const items =
    locations?.map((location) => ({
      value: location.id,
      label: location.name,
    })) ?? [];
  return (
    <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)] sm:items-end">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Personale
        </p>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Personalemad
          </h1>
          {employeeName ? (
            <p className="text-lg text-muted-foreground">{employeeName}</p>
          ) : null}
        </div>
      </div>
      <Field>
        <FieldLabel>Location</FieldLabel>
        <Select
          items={items}
          value={locationId}
          onValueChange={(value) => {
            if (!organizationId) return;
            onLocationChange();
            setWasteLocation(organizationId, value as string);
            setCountLocation(organizationId, value as string);
          }}
          disabled={!locations?.length}
        >
          <SelectTrigger className="h-11 w-full">
            <MapPinIcon aria-hidden="true" />
            <SelectValue placeholder="Vælg location" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

export function StaffFoodRegistration() {
  const router = useRouter();
  const organization = authClient.useActiveOrganization();
  const membership = authClient.useActiveMemberRole();
  const organizationId = organization.data?.id;
  const storedLocationId = useWasteLocation(organizationId);
  const locations = useQuery(api.locations.listLocationOptions);
  const [now, setNow] = useState(() => Date.now());
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);
  const [sessionId, setSessionId] =
    useState<Id<"staffFoodSessions"> | null>(null);
  const [search, setSearch] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [manualEmployee, setManualEmployee] = useState<SearchEmployee | null>(null);
  const [manualDuration, setManualDuration] = useState("240");
  const [starting, setStarting] = useState(false);
  const [basket, setBasket] = useState<Record<string, number>>({});
  const [categoryId, setCategoryId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const startSession = useMutation(api.staffFood.startSession);
  const register = useMutation(api.staffFood.register);
  const voidCheckout = useMutation(api.staffFood.voidCheckout);

  const locationId = locations?.some(
    (location) => location.id === storedLocationId,
  )
    ? (storedLocationId as Id<"locations">)
    : (locations?.[0]?.id ?? null);
  const queryNow = Math.floor(now / 30_000) * 30_000;
  const picker = useQuery(
    api.staffFood.getPicker,
    locationId ? { locationId, now: queryNow } : "skip",
  );
  const searchResults = useQuery(
    api.staffFood.searchEmployees,
    locationId && searchValue
      ? { locationId, search: searchValue, now: queryNow }
      : "skip",
  );
  const state = useQuery(
    api.staffFood.getSessionState,
    sessionId ? { sessionId, now: queryNow } : "skip",
  );

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
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
    if (!organizationId || !locations) return;
    if (!locations.some((location) => location.id === storedLocationId)) {
      const fallback = locations[0]?.id ?? null;
      setWasteLocation(organizationId, fallback);
      setCountLocation(organizationId, fallback);
    }
  }, [locations, organizationId, storedLocationId]);

  const effectiveCategoryId =
    state?.allowances.some((item) => item.categoryId === categoryId)
      ? categoryId
      : (state?.allowances[0]?.categoryId ?? "");

  const header = (
    <StaffFoodHeader
      locationId={locationId}
      locations={locations}
      organizationId={organizationId}
      employeeName={state?.session.employeeName}
      onLocationChange={() => {
        setSessionId(null);
        setBasket({});
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
      (item) => item.categoryId === product.categoryId,
    );
    if (!allowance) return;
    const reserved = Object.entries(basket).reduce((total, [id, quantity]) => {
      const item = state?.products.find((candidate) => candidate.id === id);
      return item?.categoryId === product.categoryId ? total + quantity : total;
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
      setSuccess(true);
      setBasket({});
      toast.success("Personalemaden er registreret", {
        duration: 30_000,
        action: {
          label: "Fortryd",
          onClick: () => {
            void voidCheckout({ checkoutId: result.checkoutId })
              .then(() => toast.success("Registreringen er fortrudt"))
              .catch((error) => toast.error(message(error)));
          },
        },
      });
      window.setTimeout(() => router.replace("/waste"), 2_000);
    } catch (error) {
      toast.error(message(error));
    } finally {
      setSubmitting(false);
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
  const activeProducts =
    state?.products.filter(
      (product) => product.categoryId === effectiveCategoryId,
    ) ?? [];
  const selectedAllowance = state?.allowances.find(
    (allowance) => allowance.categoryId === effectiveCategoryId,
  );
  const canManage = canManageStaffFood(membership.data?.role);

  if (!locations) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 pb-72 lg:pb-0">
      <header className="md:hidden">{header}</header>
      {headerTarget ? createPortal(header, headerTarget) : null}

      {!locations.length ? (
        <Empty className="min-h-80 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MapPinIcon />
            </EmptyMedia>
            <EmptyTitle>Ingen locations endnu</EmptyTitle>
            <EmptyDescription>
              Opret en location, før personalemad kan registreres.
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
            <EmptyTitle>Personalemad er ikke sat op endnu</EmptyTitle>
            <EmptyDescription>
              En administrator skal oprette mindst én regel for vagtlængde,
              kategorier og produkter.
            </EmptyDescription>
          </EmptyHeader>
          {canManage ? (
            <EmptyContent>
              <Button render={<Link href="/organization/staff-food" />} nativeButton={false}>
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
            <h2 className="text-2xl font-semibold">Personalemaden er registreret</h2>
            <p className="text-muted-foreground">Du sendes tilbage til Waste.</p>
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
                  er kortere end den første personalemad-regel.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => setSessionId(null)}>
                  Skift medarbejder
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="flex min-w-0 flex-col gap-5">
                <Card size="sm">
                  <CardContent className="flex flex-wrap items-center gap-3">
                    <EmployeeAvatar
                      name={state.session.employeeName}
                      imageUrl={state.session.employeeImageUrl}
                      large
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {state.session.employeeName}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {state.session.source === "scheduled"
                          ? "Planlagt vagt"
                          : "Erstatningsvagt"}{" "}
                        · {formatDuration(state.session.durationMinutes)}
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => setSessionId(null)}>
                      Skift medarbejder
                    </Button>
                  </CardContent>
                </Card>

                <Tabs value={effectiveCategoryId} onValueChange={setCategoryId}>
                  <TabsList className="h-14 w-full justify-start overflow-x-auto overflow-y-hidden">
                    {state.allowances.map((allowance) => {
                      const reserved = basketProducts
                        .filter(
                          ({ product }) =>
                            product.categoryId === allowance.categoryId,
                        )
                        .reduce((total, item) => total + item.quantity, 0);
                      return (
                        <TabsTrigger
                          key={allowance.categoryId}
                          value={allowance.categoryId}
                          className="min-w-40 px-5"
                        >
                          {allowance.categoryName}
                          <Badge variant="secondary">
                            {Math.max(0, allowance.remaining - reserved)} tilbage
                          </Badge>
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </Tabs>

                {activeProducts.length ? (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {activeProducts.map((product) => {
                      const quantity = basket[product.id] ?? 0;
                      const reserved = basketProducts
                        .filter(
                          ({ product: item }) =>
                            item.categoryId === product.categoryId,
                        )
                        .reduce((total, item) => total + item.quantity, 0);
                      const canAdd =
                        state.session.active &&
                        Boolean(selectedAllowance) &&
                        reserved < (selectedAllowance?.remaining ?? 0);
                      return (
                        <Card key={product.id} className="min-h-72">
                          <div
                            className="mx-4 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-muted bg-contain bg-center bg-no-repeat"
                            style={
                              product.imageUrl
                                ? { backgroundImage: `url("${product.imageUrl}")` }
                                : undefined
                            }
                          >
                            {!product.imageUrl ? (
                              <ImageIcon className="size-8 text-muted-foreground" />
                            ) : null}
                          </div>
                          <CardHeader>
                            <CardTitle>{product.name}</CardTitle>
                            <CardDescription>
                              Standard: {product.defaultUnitName}
                            </CardDescription>
                          </CardHeader>
                          <CardFooter className="mt-auto justify-between">
                            <Button
                              size="icon-lg"
                              variant="outline"
                              aria-label={`Fjern én ${product.name}`}
                              disabled={!quantity}
                              onClick={() => changeProduct(product, -1)}
                            >
                              <MinusIcon />
                            </Button>
                            <span className="text-lg font-semibold tabular-nums">
                              {quantity}
                            </span>
                            <Button
                              size="icon-lg"
                              aria-label={`Tilføj én ${product.name}`}
                              disabled={!canAdd}
                              onClick={() => changeProduct(product, 1)}
                            >
                              <PlusIcon />
                            </Button>
                          </CardFooter>
                        </Card>
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

              <aside className="fixed inset-x-3 bottom-3 z-20 lg:sticky lg:inset-auto lg:top-28 lg:z-auto lg:self-start">
                <Card className="max-h-[17rem] shadow-lg lg:max-h-[calc(100vh-9rem)] lg:shadow-none">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ShoppingBasketIcon />
                      Dit valg
                    </CardTitle>
                    <CardDescription>
                      {basketProducts.reduce(
                        (total, item) => total + item.quantity,
                        0,
                      )}{" "}
                      valgt
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="min-h-0 overflow-y-auto">
                    <div className="flex flex-col gap-4">
                      {basketProducts.length ? (
                        <div className="flex flex-col gap-2">
                          {basketProducts.map(({ product, quantity }) => (
                            <div
                              key={product.id}
                              className="flex items-center justify-between gap-3 text-sm"
                            >
                              <span className="truncate">{product.name}</span>
                              <span className="font-medium tabular-nums">
                                {quantity}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Vælg et produkt for at begynde.
                        </p>
                      )}
                      {state.registrations.length ? (
                        <>
                          <Separator />
                          <div className="flex flex-col gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Allerede registreret
                            </p>
                            {state.registrations.map((registration) => (
                              <div
                                key={registration.id}
                                className="flex items-center justify-between gap-3 text-sm"
                              >
                                <span className="truncate">
                                  {registration.productName}
                                </span>
                                <span className="tabular-nums">
                                  {registration.quantity}
                                </span>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : null}
                      <Separator />
                      <div className="flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Forbrug
                        </p>
                        {state.allowances.map((allowance) => {
                          const reserved = basketProducts
                            .filter(
                              ({ product }) =>
                                product.categoryId === allowance.categoryId,
                            )
                            .reduce(
                              (total, item) => total + item.quantity,
                              0,
                            );
                          return (
                            <div
                              key={allowance.categoryId}
                              className="flex items-center justify-between gap-3 text-sm"
                            >
                              <span className="truncate">
                                {allowance.categoryName}
                              </span>
                              <span className="shrink-0 text-muted-foreground tabular-nums">
                                {allowance.used} brugt ·{" "}
                                {Math.max(
                                  0,
                                  allowance.remaining - reserved,
                                )}{" "}
                                tilbage
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      size="lg"
                      className="w-full"
                      disabled={
                        !basketProducts.length ||
                        submitting ||
                        !state.session.active
                      }
                      onClick={() => void submit()}
                    >
                      {submitting ? <Spinner data-icon="inline-start" /> : null}
                      Registrér personalemad
                    </Button>
                  </CardFooter>
                </Card>
              </aside>
            </div>
          )}
        </>
      ) : null}

      <Dialog open={Boolean(picker?.hasRules && !sessionId && locations.length)} onOpenChange={() => {}}>
        <DialogContent showCloseButton={false} className="max-h-[calc(100vh-2rem)] max-w-3xl overflow-hidden p-0">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle className="text-xl">Hvem er du?</DialogTitle>
            <DialogDescription>
              Vælg din aktive vagt, eller søg blandt alle medarbejdere, hvis du
              erstatter en kollega.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 pb-5">
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
                    resten af dagen på denne location.
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
                        setManualDuration(String(Number(event.target.value) * 60))
                      }
                      className="h-11 max-w-48"
                    />
                    <FieldDescription>
                      Mellem 0,5 og 24 timer i halve timer.
                    </FieldDescription>
                  </Field>
                </CardContent>
                <CardFooter className="justify-end gap-2">
                  <Button variant="outline" onClick={() => setManualEmployee(null)}>
                    Tilbage
                  </Button>
                  <Button disabled={starting} onClick={() => void chooseManual()}>
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
          </div>
          <DialogFooter className="px-5">
            <p className="mr-auto text-xs text-muted-foreground">
              Personalemad registreres på den valgte medarbejder og location.
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
