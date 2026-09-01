"use client";

import { getUserErrorMessage } from "@/lib/user-errors";
import { useConvex, useMutation, useQuery } from "convex/react";
import {
  DownloadIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UtensilsIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
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
  EmptyContent,
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
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LocationField } from "@/components/location-field";
import { useLocationAccess, usePermission } from "@/components/app-shell";
import { downloadCsv } from "@/lib/download-csv";
import { productSearchScore } from "@/lib/product-search";

type Settings = NonNullable<
  ReturnType<typeof useQuery<typeof api.staffFood.getSettings>>
>;
type Tier = Settings["tiers"][number];
type SettingsCategory = Settings["categories"][number];
type AllowanceDraft = {
  categoryId: string;
  amount: string;
  productIds: string[];
};
type StaffFoodExportRow = {
  id: Id<"staffFoodRegistrations">;
  checkoutId: string;
  registeredAt: number;
  locationId: Id<"locations">;
  locationName: string;
  employeeId: Id<"employees">;
  employeeName: string;
  sessionSource: "scheduled" | "manual";
  workDate: string;
  shiftDurationMinutes: number;
  tierMinimumShiftMinutes: number;
  categoryAllowance: number;
  categoryId: Id<"categories">;
  categoryName: string;
  productId: Id<"products">;
  productName: string;
  quantity: number;
  defaultUnitName: string;
  status: "active" | "voided";
  registeredByName: string;
  voidedAt: number | null;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

const DEFAULT_TIME_ZONE = "Europe/Copenhagen";

function dateKeyInTimeZone(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function monthStartInTimeZone(timestamp: number, timeZone: string) {
  return `${dateKeyInTimeZone(timestamp, timeZone).slice(0, 8)}01`;
}

function parseDateValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function zonedStart(value: string, timeZone: string) {
  const parts = parseDateValue(value);
  if (!parts) return Number.NaN;
  const { year, month, day } = parts;
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

function zonedEnd(value: string, timeZone: string) {
  const parts = parseDateValue(value);
  if (!parts) return Number.NaN;
  const { year, month, day } = parts;
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return (
    zonedStart(
      `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`,
      timeZone,
    ) - 1
  );
}

function formatDuration(minutes: number) {
  return new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1 }).format(
    minutes / 60,
  );
}

function categoryTreeIds(
  categories: SettingsCategory[],
  categoryId: SettingsCategory["id"],
) {
  const ids = new Set<SettingsCategory["id"]>([categoryId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (category.parentCategoryId && ids.has(category.parentCategoryId)) {
        if (!ids.has(category.id)) {
          ids.add(category.id);
          changed = true;
        }
      }
    }
  }
  return ids;
}

export function StaffFoodSettings() {
  const convex = useConvex();
  const canManage = usePermission("staffFood.manage");
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const settings = useQuery(api.staffFood.getSettings, canManage ? {} : "skip");
  const saveTier = useMutation(api.staffFood.saveTier);
  const deleteTier = useMutation(api.staffFood.deleteTier);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"staffFoodRuleTiers"> | null>(
    null,
  );
  const [minimumHours, setMinimumHours] = useState("4");
  const [allowances, setAllowances] = useState<AllowanceDraft[]>([]);
  const [productSearches, setProductSearches] = useState<
    Record<number, string>
  >({});
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Tier | null>(null);
  const [todayTimestamp] = useState(() => Date.now());
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [location, setLocation] = useState("all");
  const [exporting, setExporting] = useState(false);
  const effectiveLocation =
    isLocked && lockedId
      ? String(lockedId)
      : location === "all" || locations?.some((item) => item.id === location)
        ? location
        : "all";

  const categoryPaths = useMemo(() => {
    const paths = new Map<string, string>();
    for (const category of settings?.categories ?? []) {
      const names = [category.name];
      const visited = new Set<string>([category.id]);
      let parentId = category.parentCategoryId;
      while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = settings?.categories.find((item) => item.id === parentId);
        if (!parent) break;
        names.unshift(parent.name);
        parentId = parent.parentCategoryId;
      }
      paths.set(category.id, names.join(" / "));
    }
    return paths;
  }, [settings?.categories]);

  const settingsProducts = settings?.products;
  const productCatalog = useMemo(() => {
    if (!settingsProducts) return [];
    return [
      ...settingsProducts.filter((product) => product.status === "active"),
      ...settingsProducts.filter((product) => product.status === "archived"),
    ];
  }, [settingsProducts]);

  const categoryItems =
    settings?.categories.map((category) => ({
      value: category.id,
      label: category.name,
    })) ?? [];
  const minimumMinutes = Number(minimumHours) * 60;
  const minimumValid =
    Number.isFinite(minimumMinutes) &&
    minimumMinutes >= 30 &&
    minimumMinutes <= 1440 &&
    minimumMinutes % 30 === 0;

  function openEditor(tier?: Tier) {
    setEditingId(tier?.id ?? null);
    setMinimumHours(String((tier?.minimumShiftMinutes ?? 240) / 60));
    setAllowances(
      tier?.allowances.map((allowance) => ({
        categoryId: allowance.categoryId,
        amount: String(allowance.amount),
        productIds: allowance.products.map((product) => product.id),
      })) ?? [],
    );
    setProductSearches({});
    setEditorOpen(true);
  }

  function updateAllowance(index: number, next: Partial<AllowanceDraft>) {
    setAllowances((current) =>
      current.map((allowance, allowanceIndex) =>
        allowanceIndex === index ? { ...allowance, ...next } : allowance,
      ),
    );
  }

  function addAllowance() {
    const used = new Set(allowances.map((allowance) => allowance.categoryId));
    const category = settings?.categories.find((item) => !used.has(item.id));
    if (!category) {
      toast.info("Alle kategorier er allerede tilføjet");
      return;
    }
    setAllowances((current) => [
      ...current,
      { categoryId: category.id, amount: "1", productIds: [] },
    ]);
  }

  async function save() {
    const minimumShiftMinutes = minimumMinutes;
    if (!minimumValid) {
      toast.error("Vagtlængden skal være mellem 0,5 og 24 timer");
      return;
    }
    if (
      !allowances.length ||
      allowances.some((item) => !item.productIds.length)
    ) {
      toast.error("Tilføj mindst én kategori med mindst ét produkt");
      return;
    }
    if (
      allowances.some((item) => {
        const amount = Number(item.amount);
        return !Number.isInteger(amount) || amount < 1 || amount > 20;
      })
    ) {
      toast.error("Antallet skal være et helt tal mellem 1 og 20");
      return;
    }
    setSaving(true);
    try {
      await saveTier({
        ...(editingId ? { tierId: editingId } : {}),
        minimumShiftMinutes,
        allowances: allowances.map((allowance) => ({
          categoryId: allowance.categoryId as Id<"categories">,
          amount: Number(allowance.amount),
          productIds: allowance.productIds as Id<"products">[],
        })),
      });
      toast.success(editingId ? "Reglen er gemt" : "Reglen er oprettet");
      setEditorOpen(false);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Staff food-indstillingerne kunne ikke gemmes. Prøv igen."));
    } finally {
      setSaving(false);
    }
  }

  async function removeTier() {
    if (!pendingDelete) return;
    try {
      await deleteTier({ tierId: pendingDelete.id });
      toast.success("Reglen er slettet");
      setPendingDelete(null);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Staff food-indstillingerne kunne ikke gemmes. Prøv igen."));
    }
  }

  const timeZone = settings?.timeZone ?? DEFAULT_TIME_ZONE;
  const resolvedFrom = from ?? monthStartInTimeZone(todayTimestamp, timeZone);
  const resolvedTo = to ?? dateKeyInTimeZone(todayTimestamp, timeZone);
  const startAt = zonedStart(resolvedFrom, timeZone);
  const endAt = zonedEnd(resolvedTo, timeZone);
  const rangeValid =
    Number.isFinite(startAt) &&
    Number.isFinite(endAt) &&
    startAt <= endAt &&
    endAt - startAt <= 366 * 24 * 60 * 60 * 1000;

  async function exportCsv() {
    if (!rangeValid) {
      toast.error("Vælg en gyldig periode på højst ét år");
      return;
    }
    setExporting(true);
    try {
      const rows: StaffFoodExportRow[] = [];
      let cursor: string | null = null;
      let done = false;
      while (!done) {
        const result: {
          page: StaffFoodExportRow[];
          continueCursor: string;
          isDone: boolean;
        } = await convex.query(api.staffFood.exportRegistrations, {
          paginationOpts: { numItems: 100, cursor },
          startAt,
          endAt,
          ...(effectiveLocation === "all"
            ? {}
            : { locationId: effectiveLocation as Id<"locations"> }),
        });
        rows.push(...result.page);
        cursor = result.continueCursor;
        done = result.isDone;
      }
      const formatter = new Intl.DateTimeFormat("da-DK", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone,
      });
      downloadCsv(
        `staff-food-${resolvedFrom}-${resolvedTo}.csv`,
        [
          "Registreret",
          "Lokation",
          "Medarbejder",
          "Vagttype",
          "Arbejdsdato",
          "Vagtlængde (timer)",
          "Regel fra (timer)",
          "Kategori",
          "Produkt",
          "Antal",
          "Standardenhed",
          "Status",
          "Registreret af",
          "Annulleret",
        ],
        rows.map((row) => [
          formatter.format(row.registeredAt),
          row.locationName,
          row.employeeName,
          row.sessionSource === "scheduled" ? "Planlagt" : "Manuel",
          row.workDate,
          formatDuration(row.shiftDurationMinutes),
          formatDuration(row.tierMinimumShiftMinutes),
          row.categoryName,
          row.productName,
          String(row.quantity),
          row.defaultUnitName,
          row.status === "active" ? "Aktiv" : "Annulleret",
          row.registeredByName,
          row.voidedAt ? formatter.format(row.voidedAt) : "",
        ]),
      );
      toast.success("CSV-filen er klar");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Staff food-indstillingerne kunne ikke gemmes. Prøv igen."));
    } finally {
      setExporting(false);
    }
  }

  if (!canManage) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Kun brugere med rollen Administrator kan ændre Staff food og eksportere rapporter.
        </AlertDescription>
      </Alert>
    );
  }
  if (!settings || !locations) return <Skeleton className="h-96 max-w-5xl" />;

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Regler for Staff food
            <HelpTooltip
              label="Regler for Staff food"
              content="Hvis flere regler passer til vagten, gælder reglen med den højeste vagtlængde. Reglerne lægges ikke sammen."
            />
          </CardTitle>
          <CardDescription>
            Angiv vagtlængden, den tilladte mængde i hver kategori og de produkter,
            medarbejderen må vælge.
          </CardDescription>
          <CardAction>
            <Button
              onClick={() => openEditor()}
              disabled={settings.tiers.length >= 10}
            >
              <PlusIcon data-icon="inline-start" />
              Ny regel
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {settings.tiers.length ? (
            <div className="flex flex-col gap-3">
              {settings.tiers.map((tier) => (
                <Card key={tier.id} size="sm">
                  <CardHeader>
                    <CardTitle>
                      Fra {formatDuration(tier.minimumShiftMinutes)} timer
                    </CardTitle>
                    <CardDescription>
                      {tier.allowances.length} kategori
                      {tier.allowances.length === 1 ? "" : "er"}
                    </CardDescription>
                    <CardAction className="flex gap-2">
                      <Button
                        size="icon-lg"
                        className="size-11"
                        variant="outline"
                        aria-label="Redigér regel"
                        onClick={() => openEditor(tier)}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        size="icon-lg"
                        className="size-11"
                        variant="outline"
                        aria-label="Slet regel"
                        onClick={() => setPendingDelete(tier)}
                      >
                        <Trash2Icon />
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {tier.allowances.map((allowance) => (
                      <Badge key={allowance.categoryId} variant="secondary">
                        {allowance.amount} fra {allowance.categoryName} ·{" "}
                        {allowance.products.length} produkter
                      </Badge>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Empty className="min-h-64 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UtensilsIcon />
                </EmptyMedia>
                <EmptyTitle>Ingen regler endnu</EmptyTitle>
                <EmptyDescription>
                  Opret den første regel for at aktivere Staff food.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => openEditor()}>
                  <PlusIcon data-icon="inline-start" />
                  Opret regel
                </Button>
              </EmptyContent>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eksportér registreringer</CardTitle>
          <CardDescription>
            Hent aktive og annullerede registreringer som en CSV-fil.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid sm:grid-cols-3">
            <Field data-invalid={!rangeValid}>
              <FieldLabel htmlFor="staff-food-from">Fra</FieldLabel>
              <Input
                id="staff-food-from"
                type="date"
                value={resolvedFrom}
                aria-invalid={!rangeValid}
                onChange={(event) => setFrom(event.target.value)}
              />
            </Field>
            <Field data-invalid={!rangeValid}>
              <FieldLabel htmlFor="staff-food-to">Til</FieldLabel>
              <Input
                id="staff-food-to"
                type="date"
                value={resolvedTo}
                aria-invalid={!rangeValid}
                onChange={(event) => setTo(event.target.value)}
              />
              {!rangeValid ? (
                <FieldError>Vælg en periode på højst ét år.</FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="staff-food-settings-location">Lokation</FieldLabel>
              {isLocked ? (
                <LocationField
                  id="staff-food-settings-location"
                  locations={locations}
                  value={lockedId}
                  locked
                  lockedName={lockedName}
                />
              ) : (
                <Select
                  items={[
                    { value: "all", label: "Alle lokationer" },
                    ...locations.map((item) => ({
                      value: item.id,
                      label: item.name,
                    })),
                  ]}
                  value={effectiveLocation}
                  onValueChange={(value) => setLocation(value ?? "all")}
                >
                  <SelectTrigger id="staff-food-settings-location">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">Alle lokationer</SelectItem>
                      {locations.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            variant="outline"
            disabled={!rangeValid || exporting}
            onClick={() => void exportCsv()}
          >
            {exporting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <DownloadIcon data-icon="inline-start" />
            )}
            Eksportér CSV
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="grid max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0 sm:w-[calc(100%-4rem)] sm:max-w-5xl">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle>
              {editingId ? "Redigér regel" : "Ny regel"}
            </DialogTitle>
            <DialogDescription>
              Den højeste matchende regel erstatter kortere regler.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-col gap-5 overflow-x-hidden overflow-y-auto overscroll-contain px-5 pb-5 [&>*]:shrink-0">
            <Field data-invalid={!minimumValid}>
              <FieldLabel htmlFor="staff-food-minimum-hours">
                Minimum vagtlængde i timer
              </FieldLabel>
              <Input
                id="staff-food-minimum-hours"
                type="number"
                min={0.5}
                max={24}
                step={0.5}
                value={minimumHours}
                aria-invalid={!minimumValid}
                onChange={(event) => setMinimumHours(event.target.value)}
                className="h-11 max-w-48"
              />
              <FieldDescription>
                Mellem 0,5 og 24 timer i halve timer.
              </FieldDescription>
              {!minimumValid ? (
                <FieldError>
                  Vælg hele eller halve timer mellem 0,5 og 24.
                </FieldError>
              ) : null}
            </Field>

            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-medium">Kategori-regler</h3>
                <p className="text-sm text-muted-foreground">
                  Mængden deles mellem alle valgte produkter i kategorien.
                </p>
              </div>
              <Button variant="outline" onClick={addAllowance}>
                <PlusIcon data-icon="inline-start" />
                Tilføj kategori
              </Button>
            </div>

            {allowances.map((allowance, index) => {
              const selectedCategory = settings.categories.find(
                (category) => category.id === allowance.categoryId,
              );
              const categoryIds = selectedCategory
                ? categoryTreeIds(settings.categories, selectedCategory.id)
                : new Set<SettingsCategory["id"]>();
              const amount = Number(allowance.amount);
              const amountValid =
                Number.isInteger(amount) && amount >= 1 && amount <= 20;
              const products = productCatalog.filter(
                (product) =>
                  categoryIds.has(product.categoryId) &&
                  productSearchScore(
                    product.name,
                    categoryPaths.get(product.categoryId) ?? "",
                    productSearches[index] ?? "",
                  ) !== null &&
                  (product.status === "active" ||
                    allowance.productIds.includes(product.id)),
              );
              const selectableProducts = products.filter(
                (product) => product.status === "active",
              );
              const selectableIds = new Set<string>(
                selectableProducts.map((product) => product.id),
              );
              const selectedVisibleCount = selectableProducts.filter(
                (product) => allowance.productIds.includes(product.id),
              ).length;
              const allVisibleSelected =
                selectableProducts.length > 0 &&
                selectedVisibleCount === selectableProducts.length;
              return (
                <Card key={`${allowance.categoryId}:${index}`}>
                  <CardHeader>
                    <CardTitle>Kategori {index + 1}</CardTitle>
                    <CardAction>
                      <Button
                        size="icon-lg"
                        className="size-11"
                        variant="outline"
                        aria-label="Fjern kategori"
                        onClick={() =>
                          setAllowances((current) =>
                            current.filter(
                              (_, allowanceIndex) => allowanceIndex !== index,
                            ),
                          )
                        }
                      >
                        <Trash2Icon />
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-5">
                    <FieldGroup className="grid sm:grid-cols-[minmax(0,1fr)_10rem]">
                      <Field data-invalid={!amountValid}>
                        <FieldLabel htmlFor={`staff-food-category-${index}`}>Kategori</FieldLabel>
                        <Select
                          items={categoryItems}
                          value={allowance.categoryId}
                          onValueChange={(value) =>
                            updateAllowance(index, {
                              categoryId: value as string,
                              productIds: [],
                            })
                          }
                        >
                          <SelectTrigger id={`staff-food-category-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {settings.categories.map((category) => (
                                <SelectItem
                                  key={category.id}
                                  value={category.id}
                                  disabled={allowances.some(
                                    (item, allowanceIndex) =>
                                      allowanceIndex !== index &&
                                      item.categoryId === category.id,
                                  )}
                                >
                                  {category.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`staff-food-amount-${index}`}>
                          Antal
                        </FieldLabel>
                        <Input
                          id={`staff-food-amount-${index}`}
                          type="number"
                          min={1}
                          max={20}
                          step={1}
                          value={allowance.amount}
                          aria-invalid={!amountValid}
                          onChange={(event) =>
                            updateAllowance(index, {
                              amount: event.target.value,
                            })
                          }
                        />
                        {!amountValid ? (
                          <FieldError>
                            Vælg et helt tal mellem 1 og 20.
                          </FieldError>
                        ) : null}
                      </Field>
                    </FieldGroup>

                    <FieldSet>
                      <FieldLegend>
                        Tilladte produkter ({allowance.productIds.length})
                      </FieldLegend>
                      <InputGroup className="h-10">
                        <InputGroupInput
                          value={productSearches[index] ?? ""}
                          onChange={(event) =>
                            setProductSearches((current) => ({
                              ...current,
                              [index]: event.target.value,
                            }))
                          }
                          placeholder="Søg i kategorien"
                          aria-label="Søg efter produkter"
                        />
                        <InputGroupAddon align="inline-start">
                          <SearchIcon />
                        </InputGroupAddon>
                      </InputGroup>
                      {products.length ? (
                        <div className="grid max-h-64 gap-2 overflow-y-auto rounded-lg border p-3 sm:grid-cols-2">
                          <label className="col-span-full flex min-h-10 cursor-pointer items-center gap-3 border-b px-2 pb-2 font-medium">
                            <Checkbox
                              checked={allVisibleSelected}
                              indeterminate={
                                selectedVisibleCount > 0 && !allVisibleSelected
                              }
                              disabled={!selectableProducts.length}
                              onCheckedChange={(next) =>
                                updateAllowance(index, {
                                  productIds: next
                                    ? Array.from(
                                        new Set([
                                          ...allowance.productIds,
                                          ...selectableIds,
                                        ]),
                                      )
                                    : allowance.productIds.filter(
                                        (id) => !selectableIds.has(id),
                                      ),
                                })
                              }
                            />
                            <span className="flex-1">Vælg alle</span>
                            <span className="text-sm font-normal text-muted-foreground">
                              {selectableProducts.length}
                            </span>
                          </label>
                          {products.map((product) => {
                            const checked = allowance.productIds.includes(
                              product.id,
                            );
                            return (
                              <label
                                key={product.id}
                                className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 hover:bg-muted/50"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(next) =>
                                    updateAllowance(index, {
                                      productIds: next
                                        ? [...allowance.productIds, product.id]
                                        : allowance.productIds.filter(
                                            (id) => id !== product.id,
                                          ),
                                    })
                                  }
                                />
                                <span className="min-w-0 flex-1 truncate text-sm">
                                  {product.name}
                                </span>
                                {product.status === "archived" ? (
                                  <Badge variant="outline">Arkiveret</Badge>
                                ) : null}
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Ingen produkter fundet i kategorien.
                        </p>
                      )}
                      {!allowance.productIds.length ? (
                        <FieldError>Vælg mindst ét tilladt produkt.</FieldError>
                      ) : null}
                    </FieldSet>
                  </CardContent>
                </Card>
              );
            })}

            {!allowances.length ? (
              <Empty className="min-h-44 border">
                <EmptyHeader>
                  <EmptyTitle>Tilføj en kategori</EmptyTitle>
                  <EmptyDescription>
                    En regel skal have mindst én kategori og ét tilladt produkt.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : null}
          </div>
          <DialogFooter className="m-0 px-5 pt-4 pb-5">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Annullér
            </Button>
            <Button disabled={saving} onClick={() => void save()}>
              {saving ? <Spinner data-icon="inline-start" /> : null}
              Gem regel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet reglen?</AlertDialogTitle>
            <AlertDialogDescription>
              Vagter, der kun opfylder denne regel, kan miste deres tilladelse med
              det samme. Tidligere registreringer ændres ikke.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Behold</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void removeTier()}
            >
              Slet regel
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
