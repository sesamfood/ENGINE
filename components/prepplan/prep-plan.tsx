"use client";

import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowRightLeftIcon,
  CheckIcon,
  ChefHatIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  ListChecksIcon,
  MessageSquareIcon,
  TriangleAlertIcon,
  TruckIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { useKiosk, usePermission } from "@/components/app-shell";
import { RowsSkeleton } from "@/components/page-skeletons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SortableListRow,
  sortableListInstructions,
} from "@/components/organization/sortable-list-row";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import type { Id } from "@/convex/_generated/dataModel";
import { addDays, dateTimeFormatter, parseDateKey } from "@/lib/date";
import { useLastDefined } from "@/lib/use-last-defined";
import { getUserErrorMessage } from "@/lib/user-errors";
import { formatStockQuantity, unitNameFor } from "@/lib/unit-system";

type Plan = NonNullable<
  NonNullable<FunctionReturnType<typeof api.prepPlans.get>>["plan"]
>;
type Item = Plan["items"][number];
type Store = Item["stores"][number];
type Supplier = NonNullable<
  FunctionReturnType<typeof api.prepPlans.get>
>["suppliers"][number];

// Small scaled amounts such as 0,004 kg must not round to 0.
const quantityFormatter = new Intl.NumberFormat("da-DK", {
  maximumFractionDigits: 2,
  maximumSignificantDigits: 3,
  roundingPriority: "morePrecision",
});
const dayFormatter = dateTimeFormatter("da-DK", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const timeFormatter = dateTimeFormatter("da-DK", { timeStyle: "short" });

function formatDay(date: string) {
  const label = dayFormatter.format(parseDateKey(date));
  return label.charAt(0).toLocaleUpperCase("da") + label.slice(1);
}

function quantity(value: number, unitName: string) {
  return `${quantityFormatter.format(value)} ${unitName}`.trim();
}

// The nearest prep day before or after `date`. A prep day follows an order window.
function stepPlanDate(date: string, orderWindows: number[], step: 1 | -1) {
  for (let offset = 1; offset <= 7; offset += 1) {
    const next = addDays(date, offset * step);
    if (orderWindows.includes(parseDateKey(addDays(next, -1)).getUTCDay())) {
      return next;
    }
  }
  return date;
}

function roundedNow() {
  return Math.floor(Date.now() / 300_000) * 300_000;
}

// A default-unit amount in the product's chosen unit, else the largest unit it fills.
function itemQuantity(item: Item, value: number) {
  const unit = item.units.find((row) => row.unitId === item.displayUnitId);
  if (!unit) return formatStockQuantity(value, item.unitName, item.units);
  const converted = value / unit.factorToDefault;
  return `${quantityFormatter.format(converted)} ${unitNameFor(unit, converted)}`;
}

function itemKey(item: Item) {
  return `${item.productId}:${item.unitId}`;
}

type Mode = "overview" | "steps" | "delivery";
type LastVisit = {
  locationId?: Id<"locations">;
  date?: string;
  mode?: Mode;
  step?: number;
};
// Per device, so a tablet reopens where the prep or packing left off.
const LAST_VISIT_KEY = "prepplan:last-visit";

function readLastVisit(): LastVisit {
  try {
    if (typeof window === "undefined") return {};
    const value: unknown = JSON.parse(
      window.localStorage.getItem(LAST_VISIT_KEY) ?? "{}",
    );
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function PrepPlan() {
  const [lastVisit] = useState(readLastVisit);
  const [locationId, setLocationId] = useState<Id<"locations"> | null>(
    lastVisit.locationId ?? null,
  );
  const [date, setDate] = useState<string | null>(lastVisit.date ?? null);
  const [mode, setMode] = useState<Mode>(
    lastVisit.mode === "steps" || lastVisit.mode === "delivery"
      ? lastVisit.mode
      : "overview",
  );
  const [step, setStep] = useState(
    Number.isInteger(lastVisit.step) ? lastVisit.step! : 0,
  );
  const [restoring, setRestoring] = useState(date !== null);
  // Refreshed so a kiosk left open moves to the next prep day after midnight.
  const [now, setNow] = useState(() => roundedNow());
  useEffect(() => {
    const timer = setInterval(() => setNow(roundedNow()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const live = useQuery(api.prepPlans.get, {
    ...(locationId ? { locationId } : {}),
    ...(date ? { date } : {}),
    now,
  });
  // Keep the plan on screen while a clock refresh loads.
  const data = useLastDefined(live, `${locationId}:${date}`);
  const setChecked = useMutation(api.prepPlans.setChecked);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const kiosk = useKiosk();
  const canManageTransfers = usePermission("transfers.manage");
  // Same rule as the transfer page's order tab.
  const canTransfer = kiosk?.kioskModeEnabled
    ? Boolean(kiosk.settings?.enabledPages.includes("transfers.new"))
    : canManageTransfers;
  const visited = data?.plan;
  // A restored past day with every Transfer created is done; open the default day.
  if (restoring && visited) {
    setRestoring(false);
    if (
      visited.date < visited.today &&
      visited.orders.every((order) => order.transferred)
    ) {
      setDate(null);
      setMode("overview");
      setStep(0);
    }
  }
  useEffect(() => {
    if (!visited) return;
    try {
      window.localStorage.setItem(
        LAST_VISIT_KEY,
        JSON.stringify({
          locationId: visited.locationId,
          date: visited.date,
          mode,
          step,
        } satisfies LastVisit),
      );
    } catch {
      // Storage can be unavailable, e.g. in a private window.
    }
  }, [visited, mode, step]);

  if (data === undefined) return <RowsSkeleton />;
  const bottomBar = (children?: ReactNode) =>
    children ? (
      <AppBottomBar>
        <div className="mx-auto flex w-full max-w-(--container-page) flex-col gap-3">
          {children}
        </div>
      </AppBottomBar>
    ) : null;

  if (!data?.plan) {
    return (
      <>
        <Empty appearance="outlined" className="min-h-80">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChefHatIcon />
            </EmptyMedia>
            <EmptyTitle>Ingen Prepplan</EmptyTitle>
            <EmptyDescription>
              Vælg bestillingsvinduer for en intern leverandør under
              Administration → Bestilling.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
        {bottomBar()}
      </>
    );
  }

  const { plan, suppliers } = data;
  const supplier = suppliers.find((row) => row.locationId === plan.locationId)!;
  const items = plan.items;
  const doneCount = items.filter((item) => item.checked).length;
  const allDone = items.length > 0 && doneCount === items.length;
  const allPacked =
    items.length > 0 &&
    items.every((item) => item.stores.every((store) => store.packed));
  const hasOpenOrders = plan.orders.some((order) => !order.transferred);
  const showDelivery = allDone && mode !== "delivery";
  const showCreate =
    mode === "delivery" && allPacked && hasOpenOrders && canTransfer;
  const storeCount = new Set(plan.orders.map((order) => order.locationName))
    .size;
  const currentStep = Math.min(step, Math.max(items.length - 1, 0));
  const comments = plan.orders.filter((order) => order.comment);

  function go(next: string) {
    setDate(next);
    setStep(0);
  }

  async function toggle(item: Item, checked: boolean) {
    const key = itemKey(item);
    setPending((current) => new Set(current).add(key));
    try {
      await setChecked({
        locationId: plan.locationId,
        date: plan.date,
        productId: item.productId,
        unitId: item.unitId,
        total: item.total,
        checked,
      });
      return true;
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Produktet kunne ikke opdateres"));
      return false;
    } finally {
      setPending((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {suppliers.length > 1 ? (
            <Select
              items={suppliers.map((row) => ({
                value: row.locationId,
                label: row.locationName,
              }))}
              value={plan.locationId}
              onValueChange={(value) => {
                if (!value) return;
                setLocationId(value);
                setDate(null);
                setStep(0);
              }}
            >
              <SelectTrigger
                aria-label="Leverende lokation"
                className="h-11! w-full sm:w-56"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {suppliers.map((row) => (
                    <SelectItem key={row.locationId} value={row.locationId}>
                      {row.locationName}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : null}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-lg"
              aria-label="Forrige prepdag"
              onClick={() =>
                go(stepPlanDate(plan.date, supplier.orderWindowWeekdays, -1))
              }
            >
              <ChevronLeftIcon />
            </Button>
            <div className="flex min-w-0 flex-1 flex-col text-center sm:min-w-56">
              <span className="text-lg font-semibold">
                {formatDay(plan.date)}
              </span>
              <span className="text-sm text-muted-foreground">
                {plan.date === plan.today
                  ? "I dag"
                  : plan.date === addDays(plan.today, 1)
                    ? "I morgen"
                    : "Prepdag"}
              </span>
            </div>
            <Button
              variant="outline"
              size="icon-lg"
              aria-label="Næste prepdag"
              onClick={() =>
                go(stepPlanDate(plan.date, supplier.orderWindowWeekdays, 1))
              }
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>
        {items.length ? (
          <ToggleGroup
            aria-label="Visning"
            value={[mode]}
            onValueChange={(values) => {
              const next = values[0];
              if (
                next === "overview" ||
                next === "steps" ||
                next === "delivery"
              ) {
                setMode(next);
              }
            }}
            variant="outline"
            size="lg"
            spacing={0}
          >
            <ToggleGroupItem value="overview" className="min-h-11 flex-1">
              Oversigt
            </ToggleGroupItem>
            <ToggleGroupItem value="steps" className="min-h-11 flex-1">
              Trin for trin
            </ToggleGroupItem>
            <ToggleGroupItem value="delivery" className="min-h-11 flex-1">
              Levering
            </ToggleGroupItem>
          </ToggleGroup>
        ) : null}
      </div>

      {items.length ? (
        <Progress
          value={(doneCount / items.length) * 100}
          aria-label="Færdige Produkter"
          size="lg"
          tone={doneCount === items.length ? "success" : "default"}
        >
          <span className="text-sm text-muted-foreground">
            {doneCount} af {items.length} færdige · {plan.orders.length}{" "}
            {plan.orders.length === 1 ? "bestilling" : "bestillinger"} fra{" "}
            {storeCount} {storeCount === 1 ? "lokation" : "lokationer"}
          </span>
        </Progress>
      ) : null}

      {comments.length ? (
        <Alert>
          <MessageSquareIcon />
          <AlertTitle>Kommentarer fra bestillinger</AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {comments.map((order) => (
                <li
                  key={order.id}
                  className="wrap-anywhere whitespace-pre-line"
                >
                  <span className="font-medium">{order.locationName}:</span>{" "}
                  {order.comment}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {plan.unavailableLineCount ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>Ikke med i planen</AlertTitle>
          <AlertDescription>
            {plan.unavailableLineCount}{" "}
            {plan.unavailableLineCount === 1 ? "linje" : "linjer"} i
            bestillingerne har et produkt, der ikke længere findes.
          </AlertDescription>
        </Alert>
      ) : null}

      {!items.length ? (
        <Empty appearance="outlined" className="min-h-80">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListChecksIcon />
            </EmptyMedia>
            <EmptyTitle>Ingen bestillinger</EmptyTitle>
            <EmptyDescription>
              Der er ingen interne bestillinger til {supplier.locationName} for
              denne prepdag.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : mode === "delivery" ? (
        <>
          {plan.orders.length && !hasOpenOrders ? (
            <Alert>
              <CheckIcon />
              <AlertTitle>Transfers er oprettet</AlertTitle>
              <AlertDescription>
                Alle bestillinger for prepdagen er sendt som transfers.
              </AlertDescription>
            </Alert>
          ) : null}
          <DeliveryList plan={plan} supplier={supplier} />
          {creating ? (
            <CreateTransfersDialog
              plan={plan}
              onClose={() => setCreating(false)}
            />
          ) : null}
        </>
      ) : mode === "overview" ? (
        <ol className="flex flex-col gap-3">
          {items.map((item, index) => (
            <li key={itemKey(item)}>
              <OverviewItem
                item={item}
                index={index}
                pending={pending.has(itemKey(item))}
                onToggle={(checked) => void toggle(item, checked)}
                onOpen={() => {
                  setStep(index);
                  setMode("steps");
                }}
              />
            </li>
          ))}
        </ol>
      ) : (
        <StepItem
          item={items[currentStep]}
          index={currentStep}
          count={items.length}
          pending={pending.has(itemKey(items[currentStep]))}
          onToggle={async (checked) => {
            const saved = await toggle(items[currentStep], checked);
            if (saved && checked && currentStep < items.length - 1) {
              setStep(currentStep + 1);
            }
          }}
        />
      )}

      {bottomBar(
        items.length && (mode === "steps" || showDelivery || showCreate) ? (
          <>
            {showDelivery ? (
              <Button
                size="lg"
                className="min-h-14"
                onClick={() => setMode("delivery")}
              >
                <TruckIcon data-icon="inline-start" />
                Gå til levering
              </Button>
            ) : null}
            {showCreate ? (
              <Button
                size="lg"
                className="min-h-14"
                onClick={() => setCreating(true)}
              >
                <ArrowRightLeftIcon data-icon="inline-start" />
                Opret transfers
              </Button>
            ) : null}
            {mode === "steps" ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  className="min-h-11 flex-1"
                  disabled={currentStep === 0}
                  onClick={() => setStep(currentStep - 1)}
                >
                  <ChevronLeftIcon data-icon="inline-start" />
                  Forrige
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="min-h-11 flex-1"
                  disabled={currentStep >= items.length - 1}
                  onClick={() => setStep(currentStep + 1)}
                >
                  Næste
                  <ChevronRightIcon data-icon="inline-end" />
                </Button>
              </div>
            ) : null}
          </>
        ) : undefined,
      )}
    </div>
  );
}

function Stores({ item }: { item: Item }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {item.stores.map((store) => (
        <li key={store.locationId}>
          <Badge variant="secondary">
            {store.locationName} · {itemQuantity(item, store.quantity)}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function TotalQuantity({ item, large }: { item: Item; large?: boolean }) {
  const setDisplayUnit = useMutation(api.prepPlans.setDisplayUnit);
  const label = itemQuantity(item, item.total);
  const text = (
    <span
      className={`${large ? "text-2xl" : "text-xl"} font-semibold tabular-nums`}
    >
      {label}
    </span>
  );
  if (!item.units.length) return text;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className="-mr-2.5 h-auto min-h-11"
            aria-label={`${label}. Vælg enhed for ${item.productName}`}
          />
        }
      >
        {text}
        <ChevronDownIcon data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuRadioGroup
          value={item.displayUnitId ?? "auto"}
          onValueChange={(value) => {
            const unit = item.units.find((row) => row.unitId === value);
            setDisplayUnit({
              productId: item.productId,
              unitId: unit?.unitId ?? null,
            }).catch((error) =>
              toast.error(
                getUserErrorMessage(error, "Enheden kunne ikke gemmes"),
              ),
            );
          }}
        >
          <DropdownMenuLabel>Vis mængde i</DropdownMenuLabel>
          <DropdownMenuRadioItem value="auto">Automatisk</DropdownMenuRadioItem>
          {item.units.map((unit) => (
            <DropdownMenuRadioItem key={unit.unitId} value={unit.unitId}>
              {unit.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LeadTime({ hours }: { hours: number | null }) {
  if (!hours) return null;
  return (
    <Badge variant="outline">
      <ClockIcon data-icon="inline-start" />
      {quantityFormatter.format(hours)} t
    </Badge>
  );
}

function CheckedBy({ item }: { item: Item }) {
  if (!item.checked) return null;
  return (
    <span className="text-sm text-muted-foreground">
      Færdig {timeFormatter.format(item.checked.checkedAt)} ·{" "}
      {item.checked.checkedByName}
    </span>
  );
}

function OverviewItem({
  item,
  index,
  pending,
  onToggle,
  onOpen,
}: {
  item: Item;
  index: number;
  pending: boolean;
  onToggle: (checked: boolean) => void;
  onOpen: () => void;
}) {
  const id = `prep-${itemKey(item)}`;
  return (
    <Card status={item.checked ? "complete" : undefined} spacing="responsive">
      <CardContent>
        <div className="flex items-start gap-4">
          <Checkbox
            id={id}
            checked={Boolean(item.checked)}
            disabled={pending}
            onCheckedChange={(checked) => onToggle(checked)}
            aria-label={`${item.productName} er færdig`}
            className="mt-1 size-7 [&_svg]:size-5!"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <button
                type="button"
                onClick={onOpen}
                className="min-h-9 rounded-sm text-left text-lg font-semibold underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring"
              >
                <span className="text-muted-foreground tabular-nums">
                  {index + 1}.
                </span>{" "}
                <span className={item.checked ? "line-through" : undefined}>
                  {item.productName}
                </span>
              </button>
              <TotalQuantity item={item} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LeadTime hours={item.leadTimeHours} />
              <Stores item={item} />
            </div>
            <CheckedBy item={item} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StepItem({
  item,
  index,
  count,
  pending,
  onToggle,
}: {
  item: Item;
  index: number;
  count: number;
  pending: boolean;
  onToggle: (checked: boolean) => Promise<void>;
}) {
  return (
    <Card status={item.checked ? "complete" : undefined}>
      <CardHeader>
        <CardDescription>
          Trin {index + 1} af {count}
        </CardDescription>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-2xl font-semibold">
          <h2>{item.productName}</h2>
          <TotalQuantity item={item} large />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <LeadTime hours={item.leadTimeHours} />
            <Stores item={item} />
          </div>
          <section
            aria-labelledby="prep-ingredients"
            className="flex flex-col gap-2"
          >
            <h3 id="prep-ingredients" className="font-semibold">
              Ingredienser
            </h3>
            {item.ingredients === null ? (
              <p className="text-sm text-muted-foreground">
                Opskriften kan ikke omregnes til {item.unitName}.
              </p>
            ) : item.ingredients.length ? (
              <ul className="divide-y rounded-lg border">
                {item.ingredients.map((ingredient, row) => (
                  <li
                    key={row}
                    className="flex min-h-11 items-center justify-between gap-4 px-3 py-2"
                  >
                    <span>{ingredient.productName}</span>
                    <span className="font-medium tabular-nums">
                      {quantity(ingredient.quantity, ingredient.unitName)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                Produktet har ingen ingredienser.
              </p>
            )}
          </section>
          <section
            aria-labelledby="prep-method"
            className="flex flex-col gap-2"
          >
            <h3 id="prep-method" className="font-semibold">
              Fremgangsmåde
            </h3>
            {item.method ? (
              <p className="wrap-anywhere whitespace-pre-line">{item.method}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Der er ingen fremgangsmåde for produktet.
              </p>
            )}
          </section>
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              variant={item.checked ? "outline" : "default"}
              className="min-h-14"
              disabled={pending}
              onClick={() => void onToggle(!item.checked)}
            >
              {item.checked ? (
                "Markér som ikke færdig"
              ) : (
                <>
                  <CheckIcon data-icon="inline-start" />
                  Markér som færdig
                </>
              )}
            </Button>
            <CheckedBy item={item} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Ordering locations in the remembered packing order; new ones go last by name.
function DeliveryList({ plan, supplier }: { plan: Plan; supplier: Supplier }) {
  const setDeliveryOrder = useMutation(api.prepPlans.setDeliveryOrder);
  // Shown until the saved order arrives from the server.
  const [localOrder, setLocalOrder] = useState<Id<"locations">[] | null>(null);
  const [open, setOpen] = useState<ReadonlySet<Id<"locations">>>(new Set());
  const setOpenFor = (id: Id<"locations">, next: boolean) =>
    setOpen((current) => {
      const copy = new Set(current);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    // Press and hold on touch so swiping still scrolls the page.
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const saved = localOrder ?? supplier.deliveryLocationOrder;
  const rank = new Map(saved.map((id, index) => [id, index]));
  const locations = [
    ...new Map(
      plan.orders.map((order) => [order.locationId, order.locationName]),
    ),
  ]
    .map(([locationId, locationName]) => ({ locationId, locationName }))
    .sort(
      (a, b) =>
        (rank.get(a.locationId) ?? Infinity) -
          (rank.get(b.locationId) ?? Infinity) ||
        a.locationName.localeCompare(b.locationName, "da"),
    );
  const ids = locations.map((row) => row.locationId);
  const name = (id: unknown) =>
    locations.find((row) => row.locationId === id)?.locationName ??
    "Lokationen";

  async function move(from: number, to: number) {
    const next = arrayMove(ids, from, to);
    // Keep the slots of locations without orders on this prep day.
    const visible = new Set(ids);
    const full = [...saved, ...ids.filter((id) => !rank.has(id))];
    let index = 0;
    const order = full.map((id) => (visible.has(id) ? next[index++] : id));
    setLocalOrder(order);
    try {
      await setDeliveryOrder({
        locationId: plan.locationId,
        locationIds: order,
      });
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Rækkefølgen kunne ikke gemmes"));
    } finally {
      setLocalOrder(null);
    }
  }

  return (
    <DndContext
      accessibility={{
        screenReaderInstructions: sortableListInstructions,
        announcements: {
          onDragStart: ({ active }) => `${name(active.id)} er valgt.`,
          onDragOver: ({ over }) =>
            over
              ? `Flyttes til plads ${ids.indexOf(over.id as Id<"locations">) + 1}.`
              : undefined,
          onDragEnd: ({ active }) => `${name(active.id)} er placeret.`,
          onDragCancel: ({ active }) =>
            `Flytning af ${name(active.id)} blev annulleret.`,
        },
      }}
      collisionDetection={closestCorners}
      sensors={sensors}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return;
        const from = ids.indexOf(active.id as Id<"locations">);
        const to = ids.indexOf(over.id as Id<"locations">);
        if (from >= 0 && to >= 0) void move(from, to);
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-2" aria-label="Leveringsrækkefølge">
          {locations.map((location, index) => {
            const lines = plan.items.flatMap((item) => {
              const store = item.stores.find(
                (row) => row.locationId === location.locationId,
              );
              return store ? [{ item, store }] : [];
            });
            const done = lines.every(({ store }) => store.packed);
            const comments = plan.orders.filter(
              (order) =>
                order.locationId === location.locationId && order.comment,
            );
            return (
              <SortableListRow
                key={location.locationId}
                id={location.locationId}
                label={location.locationName}
                position={index + 1}
                roleDescription="lokation, der kan flyttes"
                className="min-h-18 flex-wrap"
              >
                <Collapsible
                  className="contents"
                  open={open.has(location.locationId)}
                  onOpenChange={(next) => setOpenFor(location.locationId, next)}
                >
                  <CollapsibleTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        size="lg"
                        className="group min-h-16 min-w-0 flex-1 justify-start text-left"
                      />
                    }
                  >
                    <TruckIcon
                      data-icon="inline-start"
                      className="text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {location.locationName}
                    </span>
                    {done ? (
                      <Badge variant="success">
                        <CheckIcon data-icon="inline-start" />
                        Færdig
                      </Badge>
                    ) : (
                      <span className="shrink-0 text-sm text-muted-foreground">
                        {lines.filter(({ store }) => store.packed).length} af{" "}
                        {lines.length} pakket
                      </span>
                    )}
                    <ChevronDownIcon
                      data-icon="inline-end"
                      className="text-muted-foreground transition-transform group-data-panel-open:rotate-180"
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="basis-full">
                    <div className="flex flex-col gap-2 px-2 pb-2">
                      {comments.map((order) => (
                        <p
                          key={order.id}
                          className="flex gap-2 text-sm wrap-anywhere whitespace-pre-line text-muted-foreground"
                        >
                          <MessageSquareIcon
                            aria-hidden="true"
                            className="mt-0.5 size-4 shrink-0"
                          />
                          {order.comment}
                        </p>
                      ))}
                      <ul className="divide-y rounded-lg border">
                        {lines.map(({ item, store }) => (
                          <PackLine
                            key={`${itemKey(item)}:${store.packed?.temperatureCelsius}`}
                            plan={plan}
                            item={item}
                            store={store}
                            onPacked={(packed) => {
                              // Close the location once its last product is packed.
                              if (
                                packed &&
                                lines.every(
                                  (line) =>
                                    line.store.packed || line.item === item,
                                )
                              ) {
                                setOpenFor(location.locationId, false);
                              }
                            }}
                          />
                        ))}
                      </ul>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </SortableListRow>
            );
          })}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

const temperatureFormatter = new Intl.NumberFormat("da-DK", {
  maximumFractionDigits: 1,
});

// "4,5" or "-18"; null when empty, undefined when invalid.
function parseTemperature(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  if (!/^-?\d+(?:\.\d)?$/u.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return parsed >= -100 && parsed <= 100 ? parsed : undefined;
}

// A product for one location. Entering a temperature also marks it packed.
function PackLine({
  plan,
  item,
  store,
  onPacked,
}: {
  plan: Plan;
  item: Item;
  store: Store;
  onPacked: (packed: boolean) => void;
}) {
  const setPacked = useMutation(api.prepPlans.setPacked);
  const saved = store.packed?.temperatureCelsius ?? null;
  const [draft, setDraft] = useState(
    saved === null ? "" : temperatureFormatter.format(saved),
  );
  const [pending, setPending] = useState(false);
  const parsed = parseTemperature(draft);
  const id = `pack-${store.locationId}-${itemKey(item)}`;
  const maximum = item.maxTemperatureCelsius;
  const deviation =
    maximum !== null && typeof parsed === "number" && parsed > maximum;

  async function save(packed: boolean, temperatureCelsius: number | null) {
    setPending(true);
    try {
      await setPacked({
        locationId: plan.locationId,
        date: plan.date,
        deliveryLocationId: store.locationId,
        productId: item.productId,
        unitId: item.unitId,
        quantity: store.quantity,
        packed,
        ...(temperatureCelsius !== null ? { temperatureCelsius } : {}),
      });
      onPacked(packed);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Produktet kunne ikke gemmes"));
    } finally {
      setPending(false);
    }
  }

  function commit() {
    if (parsed === undefined || parsed === saved) return;
    if (parsed === null) {
      // A temperature tracked Produkt can't stay packed without one.
      if (maximum !== null && store.packed) {
        setDraft(temperatureFormatter.format(saved!));
        return;
      }
      // Clearing the temperature keeps a packed product packed.
      if (!store.packed) return;
    }
    void save(true, parsed);
  }

  return (
    <li className="flex min-h-14 items-center gap-3 px-3 py-2">
      <Checkbox
        id={id}
        checked={Boolean(store.packed)}
        disabled={
          pending ||
          (!store.packed && maximum !== null && typeof parsed !== "number")
        }
        onCheckedChange={(checked) =>
          void save(
            checked,
            checked && typeof parsed === "number" ? parsed : null,
          )
        }
        aria-label={`${item.productName} er pakket`}
        className="size-7 [&_svg]:size-5!"
      />
      <label htmlFor={id} className="flex min-w-0 flex-1 flex-col">
        <span className={store.packed ? "line-through" : undefined}>
          {item.productName}
        </span>
        <span className="text-sm font-medium text-muted-foreground tabular-nums">
          {itemQuantity(item, store.quantity)}
        </span>
        {maximum !== null ? (
          <span
            className={
              deviation
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {deviation
              ? `Over maks. ${temperatureFormatter.format(maximum)} °C`
              : `Temperatur påkrævet · maks. ${temperatureFormatter.format(maximum)} °C`}
          </span>
        ) : null}
      </label>
      <InputGroup className="h-11 w-24 shrink-0">
        <InputGroupInput
          type="text"
          inputMode="decimal"
          value={draft}
          disabled={pending}
          aria-label={`Temperatur for ${item.productName}`}
          aria-invalid={parsed === undefined || deviation}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
          }}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>°C</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </li>
  );
}

// Asks for what the Transfers need: who is responsible, and why a temperature is too high.
function CreateTransfersDialog({
  plan,
  onClose,
}: {
  plan: Plan;
  onClose: () => void;
}) {
  const createTransfers = useMutation(api.prepPlans.createTransfers);
  const users = useQuery(api.transfers.listResponsibleUsers, {});
  const { data: session } = authClient.useSession();
  const kiosk = useKiosk();
  // A shared kiosk account is not a person, so the prepper picks themselves.
  const sessionUserId =
    !kiosk?.isKioskAccount && !kiosk?.kioskModeEnabled
      ? session?.user.id
      : undefined;
  const [responsible, setResponsible] = useState<string | null>(null);
  const responsibleId =
    responsible ??
    (users?.some((user) => user.id === sessionUserId) ? sessionUserId! : null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const openLocations = [
    ...new Map(
      plan.orders
        .filter((order) => !order.transferred)
        .map((order) => [order.locationId, order.locationName]),
    ),
  ];
  const deviations = openLocations.flatMap(([locationId, locationName]) => {
    const lines = plan.items.flatMap((item) => {
      const temperature = item.stores.find(
        (store) => store.locationId === locationId,
      )?.packed?.temperatureCelsius;
      return item.maxTemperatureCelsius !== null &&
        temperature != null &&
        temperature > item.maxTemperatureCelsius
        ? [
            `${item.productName} ${temperatureFormatter.format(temperature)} °C (maks. ${temperatureFormatter.format(item.maxTemperatureCelsius)} °C)`,
          ]
        : [];
    });
    return lines.length ? [{ locationId, locationName, lines }] : [];
  });

  async function submit() {
    setSubmitted(true);
    if (
      !responsibleId ||
      deviations.some((row) => !comments[row.locationId]?.trim())
    ) {
      return;
    }
    setSaving(true);
    try {
      const count = await createTransfers({
        locationId: plan.locationId,
        date: plan.date,
        responsibleUserId: responsibleId,
        deviationComments: deviations.map((row) => ({
          deliveryLocationId: row.locationId,
          comment: comments[row.locationId].trim(),
        })),
      });
      toast.success(
        count === 1
          ? "1 transfer er oprettet"
          : `${count} transfers er oprettet`,
      );
      onClose();
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Transfers kunne ikke oprettes"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="max-h-(--spacing-viewport-inset) overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {openLocations.length === 1 ? "Opret transfer" : "Opret transfers"}
          </DialogTitle>
          <DialogDescription>
            Der oprettes{" "}
            {openLocations.length === 1
              ? "en transfer"
              : `${openLocations.length} transfers`}{" "}
            til {openLocations.map(([, name]) => name).join(", ")} med de
            bestilte mængder og de målte temperaturer.
          </DialogDescription>
        </DialogHeader>
        <form
          id="create-transfers"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <FieldGroup>
            <Field data-invalid={submitted && !responsibleId}>
              <FieldLabel htmlFor="create-transfers-responsible">
                Ansvarlig
              </FieldLabel>
              <Select
                items={(users ?? []).map((user) => ({
                  value: user.id,
                  label: user.name,
                }))}
                value={responsibleId}
                onValueChange={(value) => setResponsible(value)}
              >
                <SelectTrigger
                  id="create-transfers-responsible"
                  className="h-11! w-full"
                  aria-invalid={submitted && !responsibleId}
                >
                  <SelectValue placeholder="Vælg ansvarlig" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(users ?? []).map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {submitted && !responsibleId ? (
                <FieldError>Vælg, hvem der er ansvarlig.</FieldError>
              ) : null}
            </Field>
            {deviations.map((row) => {
              const id = `create-transfers-comment-${row.locationId}`;
              const invalid = submitted && !comments[row.locationId]?.trim();
              return (
                <Field key={row.locationId} data-invalid={invalid}>
                  <FieldLabel htmlFor={id}>
                    Temperaturafvigelse til {row.locationName}
                  </FieldLabel>
                  <p className="text-sm text-muted-foreground">
                    {row.lines.join(", ")}
                  </p>
                  <Textarea
                    id={id}
                    value={comments[row.locationId] ?? ""}
                    maxLength={500}
                    placeholder="Forklar afvigelsen"
                    aria-invalid={invalid}
                    onChange={(event) =>
                      setComments((current) => ({
                        ...current,
                        [row.locationId]: event.target.value,
                      }))
                    }
                  />
                  {invalid ? (
                    <FieldError>Skriv en kommentar til afvigelsen.</FieldError>
                  ) : null}
                </Field>
              );
            })}
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={saving}
            onClick={onClose}
          >
            Annullér
          </Button>
          <Button
            type="submit"
            form="create-transfers"
            size="lg"
            disabled={saving || users === undefined}
          >
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {openLocations.length === 1 ? "Opret transfer" : "Opret transfers"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
