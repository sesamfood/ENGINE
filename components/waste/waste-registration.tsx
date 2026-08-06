"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ImageIcon,
  PinIcon,
  SearchIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { canManageWasteSettings } from "@/lib/auth-permissions";
import { cn } from "@/lib/utils";
import { useWasteContext } from "./waste-header";

type Catalog = NonNullable<
  ReturnType<typeof useQuery<typeof api.waste.listCatalog>>
>;
type Product = Catalog[number];
type Shortcut = { unitId: Id<"units">; quantity: number };
type UndoRegistration = {
  id: Id<"wasteRegistrations">;
  productName: string;
  quantity: number;
  unitName: string;
  registeredAt: number;
  expiresAt: number;
};

const UNDO_WINDOW_MS = 30_000;

const collator = new Intl.Collator("da", { sensitivity: "base" });

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("da-DK")
    .trim();
}

function fuzzyScore(name: string, search: string) {
  if (!search) return 0;
  if (name.startsWith(search)) return 0;
  if (name.includes(search)) return 1;
  let cursor = 0;
  for (const character of name) {
    if (character === search[cursor]) cursor += 1;
  }
  return cursor === search.length ? 2 : 3;
}

function formatQuantity(quantity: number) {
  return new Intl.NumberFormat("da-DK", { maximumFractionDigits: 6 }).format(
    quantity,
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Waste kunne ikke registreres";
}

function shortcutsFor(
  product: Product,
  learned: Shortcut[] | undefined,
  override: Shortcut[] | null | undefined,
) {
  const valid = new Set(product.units.map((unit) => unit.id));
  const result = (override ?? learned ?? []).filter(
    (shortcut) => valid.has(shortcut.unitId) && shortcut.quantity > 0,
  );
  for (const quantity of [1, 0.5]) {
    if (result.length === 2) break;
    if (
      !result.some(
        (item) =>
          item.unitId === product.defaultUnitId && item.quantity === quantity,
      )
    ) {
      result.push({ unitId: product.defaultUnitId, quantity });
    }
  }
  return result.slice(0, 2);
}

export function WasteRegistration() {
  const { locationId, locations } = useWasteContext();
  const catalog = useQuery(api.waste.listCatalog);
  const state = useQuery(
    api.waste.getViewState,
    locationId ? { locationId } : "skip",
  );
  const registerWaste = useMutation(api.waste.registerWaste);
  const voidWaste = useMutation(api.waste.voidWasteRegistration);
  const setPinned = useMutation(api.waste.setPinned);
  const setOverride = useMutation(api.waste.setShortcutOverride);
  const clearOverride = useMutation(api.waste.clearShortcutOverride);
  const membership = authClient.useActiveMemberRole();
  const isAdmin = canManageWasteSettings(membership.data?.role);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedId, setSelectedId] = useState<Id<"products"> | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [unitId, setUnitId] = useState<Id<"units"> | null>(null);
  const [editingShortcuts, setEditingShortcuts] = useState(false);
  const [shortcutDrafts, setShortcutDrafts] = useState<
    [Shortcut, Shortcut] | null
  >(null);
  const [recent, setRecent] = useState<string | null>(null);
  const [undoRegistrations, setUndoRegistrations] = useState<
    UndoRegistration[]
  >([]);
  const [undoingIds, setUndoingIds] = useState<Id<"wasteRegistrations">[]>([]);
  const [undoDialogOpen, setUndoDialogOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const hasUndoRegistrations = undoRegistrations.length > 0;
  useEffect(() => {
    if (!hasUndoRegistrations) return;
    const updateUndoWindow = () => {
      const current = Date.now();
      setNow(current);
      setUndoRegistrations((registrations) =>
        registrations.filter(
          (registration) => registration.expiresAt > current,
        ),
      );
    };
    const interval = window.setInterval(updateUndoWindow, 250);
    return () => window.clearInterval(interval);
  }, [hasUndoRegistrations]);

  const rankMap = useMemo(
    () => new Map(state?.rankings.map((rank) => [rank.productId, rank])),
    [state],
  );
  const configMap = useMemo(
    () => new Map(state?.configs.map((config) => [config.productId, config])),
    [state],
  );
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of catalog ?? []) {
      map.set(product.category.id, product.category.name);
    }
    return [...map].sort((a, b) => collator.compare(a[1], b[1]));
  }, [catalog]);
  const normalizedSearch = normalize(search);
  const products = useMemo(() => {
    return [...(catalog ?? [])]
      .filter((product) =>
        normalizedSearch
          ? fuzzyScore(normalize(product.name), normalizedSearch) < 3
          : category === "all" || product.category.id === category,
      )
      .sort((a, b) => {
        if (normalizedSearch) {
          const searchDiff =
            fuzzyScore(normalize(a.name), normalizedSearch) -
            fuzzyScore(normalize(b.name), normalizedSearch);
          if (searchDiff) return searchDiff;
          const popularityDiff =
            (rankMap.get(b.id)?.count ?? 0) - (rankMap.get(a.id)?.count ?? 0);
          return popularityDiff || collator.compare(a.name, b.name);
        }
        const aConfig = configMap.get(a.id);
        const bConfig = configMap.get(b.id);
        if (Boolean(aConfig?.pinnedAt) !== Boolean(bConfig?.pinnedAt)) {
          return aConfig?.pinnedAt ? -1 : 1;
        }
        if (aConfig?.pinnedAt && bConfig?.pinnedAt)
          return aConfig.pinnedAt - bConfig.pinnedAt;
        const aRank = rankMap.get(a.id);
        const bRank = rankMap.get(b.id);
        if ((aRank?.count ?? 0) !== (bRank?.count ?? 0))
          return (bRank?.count ?? 0) - (aRank?.count ?? 0);
        if ((aRank?.lastRegisteredAt ?? 0) !== (bRank?.lastRegisteredAt ?? 0)) {
          return (
            (bRank?.lastRegisteredAt ?? 0) - (aRank?.lastRegisteredAt ?? 0)
          );
        }
        return collator.compare(a.name, b.name);
      });
  }, [catalog, category, configMap, normalizedSearch, rankMap]);
  const selected =
    catalog?.find((product) => product.id === selectedId) ?? null;
  function openProduct(product: Product) {
    const shortcuts = shortcutsFor(
      product,
      rankMap.get(product.id)?.learnedShortcuts,
      configMap.get(product.id)?.shortcutOverrides,
    );
    setSelectedId(product.id);
    setQuantity(String(shortcuts[0]?.quantity ?? 1));
    setUnitId(shortcuts[0]?.unitId ?? product.defaultUnitId);
    setShortcutDrafts([shortcuts[0], shortcuts[1]] as [Shortcut, Shortcut]);
    setEditingShortcuts(false);
  }

  async function register(
    product: Product,
    shortcut: Shortcut,
    source: "shortcut" | "custom",
  ) {
    if (!locationId) return;
    const key = `${product.id}:${shortcut.unitId}:${shortcut.quantity}`;
    try {
      const result = await registerWaste({
        locationId,
        productId: product.id,
        unitId: shortcut.unitId,
        quantity: shortcut.quantity,
        source,
      });
      const unit = product.units.find((item) => item.id === shortcut.unitId);
      toast.success(
        `Waste registreret: ${formatQuantity(shortcut.quantity)} ${unit?.name ?? ""} ${product.name}`,
        { duration: 10_000 },
      );
      setNow(result.registeredAt);
      setUndoRegistrations((registrations) => [
        ...registrations.filter(
          (registration) => registration.expiresAt > result.registeredAt,
        ),
        {
          id: result.registrationId,
          productName: result.productName,
          quantity: result.quantity,
          unitName: result.unitName,
          registeredAt: result.registeredAt,
          expiresAt: result.registeredAt + UNDO_WINDOW_MS,
        },
      ]);
      setRecent(key);
      window.setTimeout(
        () => setRecent((current) => (current === key ? null : current)),
        700,
      );
      if (source === "custom") setSelectedId(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function undo(items: UndoRegistration[], closeDialog = false) {
    if (!items.length) return;
    const ids = items.map((item) => item.id);
    setUndoingIds((current) => [...new Set([...current, ...ids])]);
    const results = await Promise.allSettled(
      items.map((item) => voidWaste({ registrationId: item.id })),
    );
    const succeeded = ids.filter(
      (_, index) => results[index].status === "fulfilled",
    );
    const failed = results.filter((result) => result.status === "rejected");
    if (succeeded.length) {
      setUndoRegistrations((current) =>
        current.filter((registration) => !succeeded.includes(registration.id)),
      );
      toast.success(
        succeeded.length === 1
          ? "Waste-registreringen er annulleret"
          : `${succeeded.length} Waste-registreringer er annulleret`,
      );
    }
    if (failed.length) {
      const firstError = results.find((result) => result.status === "rejected");
      toast.error(
        failed.length === 1 && firstError?.status === "rejected"
          ? errorMessage(firstError.reason)
          : `${failed.length} Waste-registreringer kunne ikke annulleres`,
      );
    }
    setUndoingIds((current) => current.filter((id) => !ids.includes(id)));
    if (closeDialog) setUndoDialogOpen(false);
  }

  async function togglePin(product: Product) {
    if (!locationId) return;
    try {
      await setPinned({
        locationId,
        productId: product.id,
        pinned: !configMap.get(product.id)?.pinnedAt,
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function saveShortcuts() {
    if (!locationId || !selected || !shortcutDrafts) return;
    if (
      shortcutDrafts.some(
        (item) => !Number.isFinite(item.quantity) || item.quantity <= 0,
      )
    ) {
      toast.error("Begge mængder skal være større end 0");
      return;
    }
    try {
      await setOverride({
        locationId,
        productId: selected.id,
        shortcuts: shortcutDrafts,
      });
      toast.success("Shortcuts er gemt");
      setEditingShortcuts(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  if (!locations || catalog === undefined) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, index) => (
          <Skeleton key={index} className="h-72" />
        ))}
      </div>
    );
  }
  if (!locations.length) {
    return (
      <Empty className="min-h-72">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Trash2Icon />
          </EmptyMedia>
          <EmptyTitle>Ingen locations</EmptyTitle>
          <EmptyDescription>
            Opret en location, før Waste kan registreres.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  if (!catalog.length) {
    return (
      <Empty className="min-h-72">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Trash2Icon />
          </EmptyMedia>
          <EmptyTitle>Ingen produkter</EmptyTitle>
          <EmptyDescription>
            Der er ingen aktive produkter at registrere Waste for.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Tabs value={category} onValueChange={setCategory}>
        <TabsList
          className="h-12 w-full justify-start overflow-x-auto"
          aria-label="Produktkategorier"
        >
          <TabsTrigger value="all" className="min-w-20 shrink-0 px-4">
            Alle
          </TabsTrigger>
          {categories.map(([id, name]) => (
            <TabsTrigger key={id} value={id} className="min-w-28 shrink-0 px-4">
              {name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <InputGroup className="h-12 w-full">
        <InputGroupAddon>
          <SearchIcon />
          <span className="sr-only">Søg</span>
        </InputGroupAddon>
        <InputGroupInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Søg efter et produkt"
          aria-label="Søg efter et produkt"
        />
      </InputGroup>

      {products.length ? (
        <div className="grid gap-3 min-[380px]:grid-cols-2 min-[640px]:grid-cols-3 min-[1024px]:grid-cols-4 lg:gap-5 min-[1200px]:grid-cols-5 min-[1600px]:grid-cols-6 min-[1920px]:grid-cols-7 min-[2240px]:grid-cols-8">
          {products.map((product) => {
            const config = configMap.get(product.id);
            const shortcuts = shortcutsFor(
              product,
              rankMap.get(product.id)?.learnedShortcuts,
              config?.shortcutOverrides,
            );
            return (
              <Card
                key={product.id}
                className={cn(
                  "relative isolate h-full gap-0 py-0 [--card-spacing:--spacing(3)] transition-shadow has-[button[data-card-trigger]:hover]:shadow-sm lg:[--card-spacing:--spacing(4)]",
                  recent?.startsWith(`${product.id}:`) && "ring-2 ring-primary",
                )}
              >
                <div className="relative">
                  {product.imageUrl ? (
                    <div className="relative aspect-video w-full overflow-hidden bg-muted lg:aspect-[4/3]">
                      <Image
                        src={product.imageUrl}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="grid aspect-video w-full place-items-center bg-muted text-muted-foreground lg:aspect-[4/3]">
                      <ImageIcon className="size-10 lg:size-12" />
                    </div>
                  )}
                  <CardHeader className="py-3 lg:py-4">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <CardTitle className="min-w-0 flex-1 truncate">
                        {product.name}
                      </CardTitle>
                      <CardDescription className="max-w-[45%] shrink-0 truncate">
                        {product.category.name}
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <button
                    type="button"
                    data-card-trigger
                    className="absolute inset-0 cursor-pointer rounded-t-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    aria-label={`Registrér en anden mængde Waste for ${product.name}`}
                    onClick={() => openProduct(product)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    className="absolute right-1 top-1 z-10 size-11 rounded-full bg-background/85"
                    aria-label={
                      config?.pinnedAt
                        ? `Fjern ${product.name} fra fastgjorte produkter`
                        : `Fastgør ${product.name}`
                    }
                    aria-pressed={Boolean(config?.pinnedAt)}
                    onClick={() => togglePin(product)}
                  >
                    <PinIcon
                      className={cn(
                        config?.pinnedAt && "fill-current text-primary",
                      )}
                    />
                  </Button>
                </div>
                <CardContent className="grid grid-cols-2 gap-2 pb-3 lg:pb-4">
                  {shortcuts.map((shortcut, index) => {
                    const unit = product.units.find(
                      (item) => item.id === shortcut.unitId,
                    );
                    const key = `${product.id}:${shortcut.unitId}:${shortcut.quantity}`;
                    return (
                      <Button
                        key={`${shortcut.unitId}:${shortcut.quantity}`}
                        variant={index === 0 ? "default" : "outline"}
                        className={cn(
                          "h-12 min-w-0 px-2",
                          recent === key && "ring-3 ring-ring/40",
                        )}
                        onClick={() => register(product, shortcut, "shortcut")}
                      >
                        {formatQuantity(shortcut.quantity)} {unit?.name}
                      </Button>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Empty className="min-h-56">
          <EmptyHeader>
            <EmptyTitle>Ingen produkter fundet</EmptyTitle>
            <EmptyDescription>Prøv et andet søgeord.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelectedId(null)}
      >
        <DialogContent className="sm:max-w-lg">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
                <DialogDescription>
                  {editingShortcuts
                    ? "Vælg de to mængder, der skal vises som shortcuts på produktkortet."
                    : "Angiv den mængde, der er blevet kasseret."}
                </DialogDescription>
              </DialogHeader>
              <div className="relative h-64 overflow-hidden rounded-lg bg-muted">
                {selected.imageUrl ? (
                  <Image
                    src={selected.imageUrl}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 90vw, 32rem"
                    unoptimized
                    className="object-contain"
                  />
                ) : (
                  <div className="grid size-full place-items-center text-muted-foreground">
                    <ImageIcon className="size-7" />
                  </div>
                )}
              </div>
              {editingShortcuts && shortcutDrafts ? (
                <div className="grid gap-4">
                  {shortcutDrafts.map((shortcut, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-[1fr_10rem] gap-3"
                    >
                      <Field>
                        <FieldLabel htmlFor={`waste-shortcut-${index}`}>
                          Mængde {index + 1}
                        </FieldLabel>
                        <Input
                          id={`waste-shortcut-${index}`}
                          type="number"
                          min="0.000001"
                          step="any"
                          value={shortcut.quantity}
                          onChange={(event) => {
                            const next = [...shortcutDrafts] as [
                              Shortcut,
                              Shortcut,
                            ];
                            next[index] = {
                              ...shortcut,
                              quantity: Number(event.target.value),
                            };
                            setShortcutDrafts(next);
                          }}
                        />
                      </Field>
                      <Field>
                        <FieldLabel>Enhed</FieldLabel>
                        <Select
                          items={selected.units.map((unit) => ({
                            value: unit.id,
                            label: unit.name,
                          }))}
                          value={shortcut.unitId}
                          onValueChange={(value) => {
                            const next = [...shortcutDrafts] as [
                              Shortcut,
                              Shortcut,
                            ];
                            next[index] = {
                              ...shortcut,
                              unitId: value as Id<"units">,
                            };
                            setShortcutDrafts(next);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {selected.units.map((unit) => (
                                <SelectItem key={unit.id} value={unit.id}>
                                  {unit.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>
                  ))}
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      className="flex-1"
                      onClick={async () => {
                        if (!locationId) return;
                        try {
                          await clearOverride({
                            locationId,
                            productId: selected.id,
                          });
                          setEditingShortcuts(false);
                          toast.success("Anbefalede mængder bruges igen");
                        } catch (error) {
                          toast.error(errorMessage(error));
                        }
                      }}
                    >
                      Brug anbefalede mængder
                    </Button>
                    <HelpTooltip
                      label="anbefalede mængder"
                      content="Fjerner de manuelt valgte shortcuts og bruger igen de to mængder, der anbefales ud fra Waste-registreringerne for denne location."
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-[1fr_10rem] gap-3">
                  <Field>
                    <FieldLabel htmlFor="waste-quantity">Mængde</FieldLabel>
                    <Input
                      id="waste-quantity"
                      type="number"
                      min="0.000001"
                      max="1000000"
                      step="any"
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      autoFocus
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Enhed</FieldLabel>
                    <Select
                      items={selected.units.map((unit) => ({
                        value: unit.id,
                        label: unit.name,
                      }))}
                      value={unitId}
                      onValueChange={(value) => setUnitId(value as Id<"units">)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {selected.units.map((unit) => (
                            <SelectItem key={unit.id} value={unit.id}>
                              {unit.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              )}
              <DialogFooter>
                {editingShortcuts ? (
                  <Button onClick={saveShortcuts}>Gem shortcuts</Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => setSelectedId(null)}
                    >
                      Annullér
                    </Button>
                    {isAdmin ? (
                      <Button
                        variant="outline"
                        onClick={() => setEditingShortcuts(true)}
                      >
                        Redigér shortcuts
                      </Button>
                    ) : null}
                    <Button
                      onClick={() => {
                        const parsed = Number(quantity);
                        if (
                          !unitId ||
                          !Number.isFinite(parsed) ||
                          parsed <= 0
                        ) {
                          toast.error("Angiv en mængde større end 0");
                          return;
                        }
                        register(
                          selected,
                          { unitId, quantity: parsed },
                          "custom",
                        );
                      }}
                    >
                      Registrér Waste
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {undoRegistrations.length ? (
        <Button
          type="button"
          variant="destructive"
          size="lg"
          className="fixed right-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 h-12 px-3 shadow-sm sm:right-4 sm:px-4"
          disabled={undoingIds.length > 0}
          onClick={() => {
            if (undoRegistrations.length === 1) void undo(undoRegistrations);
            else setUndoDialogOpen(true);
          }}
        >
          <Undo2Icon data-icon="inline-start" />
          <span className="sm:hidden">
            {undoRegistrations.length === 1
              ? "Fortryd"
              : `Fortryd (${undoRegistrations.length})`}
          </span>
          <span className="hidden sm:inline">
            {undoRegistrations.length === 1
              ? `Fortryd · ${Math.max(0, Math.ceil((undoRegistrations[0].expiresAt - now) / 1000))} s`
              : `Fortryd (${undoRegistrations.length}) · ${Math.max(0, Math.ceil((Math.max(...undoRegistrations.map((registration) => registration.expiresAt)) - now) / 1000))} s`}
          </span>
        </Button>
      ) : null}

      <Dialog
        open={undoDialogOpen && undoRegistrations.length > 0}
        onOpenChange={setUndoDialogOpen}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Fortryd Waste-registreringer</DialogTitle>
            <DialogDescription>
              Fortryd en enkelt registrering eller annullér dem alle.
              Registreringerne forsvinder automatisk efter 30 sekunder.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="max-h-[60vh] overflow-y-auto pr-1">
            {[...undoRegistrations].reverse().map((registration) => (
              <Field
                key={registration.id}
                orientation="horizontal"
                className="min-h-16 rounded-lg border p-3"
              >
                <FieldContent>
                  <FieldLabel>{registration.productName}</FieldLabel>
                  <FieldDescription>
                    {formatQuantity(registration.quantity)}{" "}
                    {registration.unitName} ·{" "}
                    {Math.max(
                      0,
                      Math.ceil((registration.expiresAt - now) / 1000),
                    )}{" "}
                    sek. tilbage
                  </FieldDescription>
                </FieldContent>
                <Button
                  type="button"
                  variant="destructive"
                  className="h-11 shrink-0 px-4"
                  disabled={undoingIds.includes(registration.id)}
                  onClick={() => void undo([registration])}
                >
                  <Undo2Icon data-icon="inline-start" />
                  Fortryd
                </Button>
              </Field>
            ))}
          </FieldGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUndoDialogOpen(false)}>
              OK
            </Button>
            <Button
              variant="destructive"
              disabled={undoingIds.length > 0}
              onClick={() => void undo(undoRegistrations, true)}
            >
              <Undo2Icon data-icon="inline-start" />
              Fortryd alle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
