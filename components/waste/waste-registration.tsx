"use client";

import { useMutation, useQuery } from "convex/react";
import { ImageIcon, PinIcon, SearchIcon, Trash2Icon } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
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
import { Field, FieldLabel } from "@/components/ui/field";
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

type Catalog = NonNullable<ReturnType<typeof useQuery<typeof api.waste.listCatalog>>>;
type Product = Catalog[number];
type Shortcut = { unitId: Id<"units">; quantity: number };

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
  return new Intl.NumberFormat("da-DK", { maximumFractionDigits: 6 }).format(quantity);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Waste kunne ikke registreres";
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
    if (!result.some((item) => item.unitId === product.defaultUnitId && item.quantity === quantity)) {
      result.push({ unitId: product.defaultUnitId, quantity });
    }
  }
  return result.slice(0, 2);
}

export function WasteRegistration() {
  const { locationId, locations } = useWasteContext();
  const catalog = useQuery(api.waste.listCatalog);
  const state = useQuery(api.waste.getViewState, locationId ? { locationId } : "skip");
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
  const [shortcutDrafts, setShortcutDrafts] = useState<[Shortcut, Shortcut] | null>(null);
  const [recent, setRecent] = useState<string | null>(null);

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
    for (const product of catalog ?? []) map.set(product.category.id, product.category.name);
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
        if (aConfig?.pinnedAt && bConfig?.pinnedAt) return aConfig.pinnedAt - bConfig.pinnedAt;
        const aRank = rankMap.get(a.id);
        const bRank = rankMap.get(b.id);
        if ((aRank?.count ?? 0) !== (bRank?.count ?? 0)) return (bRank?.count ?? 0) - (aRank?.count ?? 0);
        if ((aRank?.lastRegisteredAt ?? 0) !== (bRank?.lastRegisteredAt ?? 0)) {
          return (bRank?.lastRegisteredAt ?? 0) - (aRank?.lastRegisteredAt ?? 0);
        }
        return collator.compare(a.name, b.name);
      });
  }, [catalog, category, configMap, normalizedSearch, rankMap]);
  const selected = catalog?.find((product) => product.id === selectedId) ?? null;
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

  async function register(product: Product, shortcut: Shortcut, source: "shortcut" | "custom") {
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
        {
          duration: 10_000,
          action: {
            label: "Fortryd",
            onClick: () => {
              voidWaste({ registrationId: result.registrationId }).catch((error) => toast.error(errorMessage(error)));
            },
          },
        },
      );
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
    if (shortcutDrafts.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
      toast.error("Begge mængder skal være større end 0");
      return;
    }
    try {
      await setOverride({ locationId, productId: selected.id, shortcuts: shortcutDrafts });
      toast.success("Hurtigvalg er gemt");
      setEditingShortcuts(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  if (!locations || catalog === undefined) {
    return <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 10 }, (_, index) => <Skeleton key={index} className="h-72" />)}</div>;
  }
  if (!locations.length) {
    return <Empty className="min-h-72"><EmptyHeader><EmptyMedia variant="icon"><Trash2Icon /></EmptyMedia><EmptyTitle>Ingen locations</EmptyTitle><EmptyDescription>Opret en location, før Waste kan registreres.</EmptyDescription></EmptyHeader></Empty>;
  }
  if (!catalog.length) {
    return <Empty className="min-h-72"><EmptyHeader><EmptyMedia variant="icon"><Trash2Icon /></EmptyMedia><EmptyTitle>Ingen produkter</EmptyTitle><EmptyDescription>Der er ingen aktive produkter at registrere Waste for.</EmptyDescription></EmptyHeader></Empty>;
  }

  return (
    <div className="flex flex-col gap-5">
      <InputGroup className="h-12 max-w-xl">
        <InputGroupAddon><SearchIcon /><span className="sr-only">Søg</span></InputGroupAddon>
        <InputGroupInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Søg efter et produkt" aria-label="Søg efter et produkt" />
      </InputGroup>

      <Tabs value={category} onValueChange={setCategory}>
        <TabsList className="h-12 max-w-full justify-start overflow-x-auto" aria-label="Produktkategorier">
          <TabsTrigger value="all" className="min-w-20 px-4">Alle</TabsTrigger>
          {categories.map(([id, name]) => <TabsTrigger key={id} value={id} className="min-w-28 px-4">{name}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      {products.length ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {products.map((product) => {
            const config = configMap.get(product.id);
            const shortcuts = shortcutsFor(product, rankMap.get(product.id)?.learnedShortcuts, config?.shortcutOverrides);
            return (
              <Card key={product.id} className={cn("relative min-h-64 transition-all hover:bg-muted/30", recent?.startsWith(`${product.id}:`) && "ring-2 ring-primary")}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  className="absolute right-1 top-1 z-10 size-11 rounded-full bg-background/85"
                  aria-label={config?.pinnedAt ? `Fjern ${product.name} fra fastgjorte produkter` : `Fastgør ${product.name}`}
                  aria-pressed={Boolean(config?.pinnedAt)}
                  onClick={() => togglePin(product)}
                >
                  <PinIcon className={cn(config?.pinnedAt && "fill-current text-primary")} />
                </Button>
                <button type="button" className="flex min-h-0 flex-1 flex-col text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50" onClick={() => openProduct(product)}>
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                    {product.imageUrl ? <Image src={product.imageUrl} alt="" fill unoptimized className="object-cover" /> : <div className="grid size-full place-items-center text-muted-foreground"><ImageIcon className="size-8" /></div>}
                  </div>
                  <CardHeader className="w-full">
                    <h2 className="line-clamp-2 text-base font-semibold">{product.name}</h2>
                    <p className="text-sm text-muted-foreground">{product.category.name}</p>
                  </CardHeader>
                </button>
                <CardFooter className="grid grid-cols-2 gap-2">
                  {shortcuts.map((shortcut, index) => {
                    const unit = product.units.find((item) => item.id === shortcut.unitId);
                    const key = `${product.id}:${shortcut.unitId}:${shortcut.quantity}`;
                    return <Button key={`${shortcut.unitId}:${shortcut.quantity}`} variant={index === 0 ? "default" : "outline"} className={cn("h-12 min-w-0 px-2", recent === key && "ring-3 ring-ring/40")} onClick={() => register(product, shortcut, "shortcut")}>{formatQuantity(shortcut.quantity)} {unit?.name}</Button>;
                  })}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : (
        <Empty className="min-h-56"><EmptyHeader><EmptyTitle>Ingen produkter fundet</EmptyTitle><EmptyDescription>Prøv et andet søgeord.</EmptyDescription></EmptyHeader></Empty>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="sm:max-w-lg">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>{selected.name}</DialogTitle>
                <DialogDescription>{editingShortcuts ? "Vælg de to mængder, der skal vises på produktkortet." : "Angiv den mængde, der er blevet kasseret."}</DialogDescription>
              </DialogHeader>
              <div className="relative h-28 overflow-hidden rounded-lg bg-muted">
                {selected.imageUrl ? (
                  <Image src={selected.imageUrl} alt="" fill unoptimized className="object-cover" />
                ) : (
                  <div className="grid size-full place-items-center text-muted-foreground"><ImageIcon className="size-7" /></div>
                )}
              </div>
              {editingShortcuts && shortcutDrafts ? (
                <div className="grid gap-4">
                  {shortcutDrafts.map((shortcut, index) => (
                    <div key={index} className="grid grid-cols-[1fr_10rem] gap-3">
                      <Field><FieldLabel htmlFor={`waste-shortcut-${index}`}>Mængde {index + 1}</FieldLabel><Input id={`waste-shortcut-${index}`} type="number" min="0.000001" step="any" value={shortcut.quantity} onChange={(event) => { const next = [...shortcutDrafts] as [Shortcut, Shortcut]; next[index] = { ...shortcut, quantity: Number(event.target.value) }; setShortcutDrafts(next); }} /></Field>
                      <Field><FieldLabel>Enhed</FieldLabel><Select value={shortcut.unitId} onValueChange={(value) => { const next = [...shortcutDrafts] as [Shortcut, Shortcut]; next[index] = { ...shortcut, unitId: value as Id<"units"> }; setShortcutDrafts(next); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{selected.units.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
                    </div>
                  ))}
                  <Button type="button" variant="ghost" onClick={async () => { if (!locationId) return; try { await clearOverride({ locationId, productId: selected.id }); setEditingShortcuts(false); toast.success("Lærte mængder bruges igen"); } catch (error) { toast.error(errorMessage(error)); } }}>Brug lærte mængder</Button>
                </div>
              ) : (
                <div className="grid grid-cols-[1fr_10rem] gap-3">
                  <Field><FieldLabel htmlFor="waste-quantity">Mængde</FieldLabel><Input id="waste-quantity" type="number" min="0.000001" max="1000000" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} autoFocus /></Field>
                  <Field><FieldLabel>Enhed</FieldLabel><Select value={unitId} onValueChange={(value) => setUnitId(value as Id<"units">)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{selected.units.map((unit) => <SelectItem key={unit.id} value={unit.id}>{unit.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
                </div>
              )}
              <DialogFooter>
                {editingShortcuts ? <Button onClick={saveShortcuts}>Gem hurtigvalg</Button> : <><Button variant="outline" onClick={() => setSelectedId(null)}>Annullér</Button>{isAdmin ? <Button variant="outline" onClick={() => setEditingShortcuts(true)}>Redigér hurtigvalg</Button> : null}<Button onClick={() => { const parsed = Number(quantity); if (!unitId || !Number.isFinite(parsed) || parsed <= 0) { toast.error("Angiv en mængde større end 0"); return; } register(selected, { unitId, quantity: parsed }, "custom"); }}>Registrér Waste</Button></>}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
