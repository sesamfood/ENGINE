"use client";

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
} from "lucide-react";
import Link from "next/link";
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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { addDays, dateTimeFormatter, parseDateKey } from "@/lib/date";
import { useLastDefined } from "@/lib/use-last-defined";
import { getUserErrorMessage } from "@/lib/user-errors";
import { formatStockQuantity, unitNameFor } from "@/lib/unit-system";

type Plan = NonNullable<
  NonNullable<FunctionReturnType<typeof api.prepPlans.get>>["plan"]
>;
type Item = Plan["items"][number];

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

export function PrepPlan() {
  const [locationId, setLocationId] = useState<Id<"locations"> | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [mode, setMode] = useState<"overview" | "steps">("overview");
  const [step, setStep] = useState(0);
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
  const kiosk = useKiosk();
  const canManageTransfers = usePermission("transfers.manage");
  // Same rule as the transfer page's order tab.
  const canTransfer = kiosk?.kioskModeEnabled
    ? Boolean(kiosk.settings?.enabledPages.includes("transfers.new"))
    : canManageTransfers;

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
              if (next === "overview" || next === "steps") setMode(next);
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
        items.length && (mode === "steps" || (allDone && canTransfer)) ? (
          <>
            {allDone && canTransfer ? (
              <Button
                size="lg"
                className="min-h-14"
                render={<Link href="/transfers/orders" />}
                nativeButton={false}
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
        <DropdownMenuLabel>Vis mængde i</DropdownMenuLabel>
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
