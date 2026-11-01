"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  CheckIcon,
  PackageOpenIcon,
  PlusIcon,
  SearchIcon,
  StoreIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { usePermission } from "@/components/app-shell";
import { ProductCardMedia } from "@/components/catalog/product-card-media";
import { SettingsSwitchField } from "@/components/organization/settings-switch-field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCompleteCatalog } from "@/hooks/use-complete-catalog";
import { authClient } from "@/lib/auth-client";
import { getUserErrorMessage } from "@/lib/user-errors";

type Settings = FunctionReturnType<typeof api.internalOrders.getSettings>;
type Categories = FunctionReturnType<typeof api.catalog.listCategoryOptions>;
type Products = NonNullable<
  ReturnType<
    typeof useCompleteCatalog<typeof api.catalog.listActiveProductsPage>
  >
>;

export function InternalOrderSettings() {
  const { data: session } = authClient.useSession();
  return (
    <SettingsContent
      key={`${session?.session.activeOrganizationId}:${session?.user.id}`}
    />
  );
}

function SettingsContent() {
  const canManage = usePermission("organization.settings");
  const settings = useQuery(
    api.internalOrders.getSettings,
    canManage ? {} : "skip",
  );
  const categories = useQuery(
    api.catalog.listCategoryOptions,
    canManage ? {} : "skip",
  );
  const products = useCompleteCatalog(
    api.catalog.listActiveProductsPage,
    canManage ? {} : "skip",
  );
  // Locations added here but not saved yet.
  const [added, setAdded] = useState<Id<"locations">[]>([]);
  const [toAdd, setToAdd] = useState<string | null>(null);

  if (!canManage) return null;
  if (!settings || !categories || !products) {
    return <Skeleton className="h-56 max-w-3xl" />;
  }

  const savedIds = new Set(settings.suppliers.map((item) => item.locationId));
  const supplierIds = [
    ...settings.suppliers.map((item) => item.locationId),
    ...added.filter((id) => !savedIds.has(id)),
  ];
  const locationName = (id: Id<"locations">) =>
    settings.locations.find((location) => location.id === id)?.name ??
    "Ukendt lokation";
  const addable = settings.locations.filter(
    (location) => !supplierIds.includes(location.id),
  );

  return (
    <section
      aria-labelledby="internal-suppliers-title"
      className="flex max-w-3xl flex-col gap-4"
    >
      <div className="flex items-center gap-1">
        <h2 id="internal-suppliers-title" className="text-xl font-semibold">
          Interne leverandører
        </h2>
        <HelpTooltip
          label="interne leverandører"
          content="Lokationer kan bestille hos en intern leverandør under Bestilling. Den leverende lokation opretter en transfer ud fra bestillingen under Transfer → Bestillinger, og modtageren registrerer den under Varemodtagelse."
        />
      </div>
      {supplierIds.length === 0 ? (
        <Empty appearance="outlined">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <StoreIcon />
            </EmptyMedia>
            <EmptyTitle>Ingen interne leverandører</EmptyTitle>
            <EmptyDescription>
              Tilføj en lokation, som andre lokationer kan bestille hos.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        supplierIds.map((locationId) => (
          <SupplierCard
            key={locationId}
            locationId={locationId}
            name={locationName(locationId)}
            settings={settings}
            categories={categories}
            products={products}
            onRemoved={() =>
              setAdded((current) => current.filter((id) => id !== locationId))
            }
          />
        ))
      )}
      {addable.length ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field className="sm:max-w-72">
            <FieldLabel htmlFor="internal-supplier-add">
              Tilføj intern leverandør
            </FieldLabel>
            <Select
              items={addable.map((location) => ({
                value: location.id,
                label: location.name,
              }))}
              value={toAdd}
              onValueChange={(value) => setToAdd(value)}
            >
              <SelectTrigger
                id="internal-supplier-add"
                className="h-11! w-full"
              >
                <SelectValue placeholder="Vælg lokation" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {addable.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Button
            size="lg"
            variant="outline"
            className="min-h-11"
            disabled={!toAdd}
            onClick={() => {
              const location = addable.find((item) => item.id === toAdd);
              if (!location) return;
              setAdded((current) => [...current, location.id]);
              setToAdd(null);
            }}
          >
            <PlusIcon data-icon="inline-start" />
            Tilføj
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function SupplierCard({
  locationId,
  name,
  settings,
  categories,
  products,
  onRemoved,
}: {
  locationId: Id<"locations">;
  name: string;
  settings: Settings;
  categories: Categories;
  products: Products;
  onRemoved: () => void;
}) {
  const saved = settings.suppliers.find(
    (item) => item.locationId === locationId,
  );
  const saveSupplier = useMutation(api.internalOrders.saveSupplier);
  const removeSupplier = useMutation(api.internalOrders.removeSupplier);
  const [activeDraft, setActiveDraft] = useState<boolean | null>(null);
  const [allDraft, setAllDraft] = useState<boolean | null>(null);
  const [orderingDraft, setOrderingDraft] = useState<Set<string> | null>(null);
  const [productDraft, setProductDraft] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const active = activeDraft ?? saved?.active ?? true;
  const allLocations = allDraft ?? saved?.allLocations ?? true;
  const orderingIds =
    orderingDraft ?? new Set<string>(saved?.orderingLocationIds);
  const productIds = productDraft ?? new Set<string>(saved?.productIds);
  const changed =
    !saved ||
    activeDraft !== null ||
    allDraft !== null ||
    orderingDraft !== null ||
    productDraft !== null;
  const others = settings.locations.filter(
    (location) => location.id !== locationId,
  );
  const availableProducts = new Set<string>(
    products.map((product) => product.id),
  );

  async function save() {
    setBusy(true);
    try {
      await saveSupplier({
        locationId,
        active,
        allLocations,
        orderingLocationIds: [...orderingIds] as Id<"locations">[],
        // Archived Products drop out on save.
        productIds: [...productIds].filter((id) =>
          availableProducts.has(id),
        ) as Id<"products">[],
      });
      setActiveDraft(null);
      setAllDraft(null);
      setOrderingDraft(null);
      setProductDraft(null);
      toast.success(`${name} er gemt`);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Lokationen kunne ikke gemmes"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      if (saved) await removeSupplier({ locationId });
      onRemoved();
      if (saved) toast.success(`${name} er fjernet som leverende lokation`);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Lokationen kunne ikke fjernes"));
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <CardAction>
          <Field orientation="horizontal">
            <FieldLabel htmlFor={`internal-${locationId}-active`}>
              Aktiv
            </FieldLabel>
            <Switch
              id={`internal-${locationId}-active`}
              checked={active}
              onCheckedChange={setActiveDraft}
              disabled={busy}
            />
          </Field>
        </CardAction>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <SettingsSwitchField
            id={`internal-${locationId}-all`}
            label="Alle lokationer kan bestille"
            checked={allLocations}
            onCheckedChange={setAllDraft}
            disabled={busy}
          />
          {allLocations ? null : (
            <FieldSet data-disabled={busy}>
              <FieldLegend variant="label">Kan bestilles af</FieldLegend>
              {others.length ? (
                <div className="grid gap-x-4 sm:grid-cols-2">
                  {others.map((location) => {
                    const id = `internal-${locationId}-${location.id}`;
                    return (
                      <Field key={location.id} orientation="horizontal">
                        <Checkbox
                          id={id}
                          checked={orderingIds.has(location.id)}
                          disabled={busy}
                          onCheckedChange={(checked) => {
                            const next = new Set(orderingIds);
                            if (checked) next.add(location.id);
                            else next.delete(location.id);
                            setOrderingDraft(next);
                          }}
                        />
                        <FieldLabel htmlFor={id} className="min-h-11">
                          {location.name}
                        </FieldLabel>
                      </Field>
                    );
                  })}
                </div>
              ) : (
                <FieldDescription>
                  Opret flere lokationer for at bestille internt.
                </FieldDescription>
              )}
            </FieldSet>
          )}
          <Field data-disabled={busy}>
            <FieldLabel>Produkter</FieldLabel>
            <ProductPicker
              name={name}
              categories={categories}
              products={products}
              selected={productIds}
              onSelectedChange={setProductDraft}
              disabled={busy}
            />
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter appearance="compact" className="justify-end">
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={busy}
              />
            }
          >
            Fjern
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Fjern {name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Lokationen kan ikke længere vælges under Bestilling. Åbne
                bestillinger vises stadig under Transfer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annullér</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => void remove()}
              >
                Fjern
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button
          size="lg"
          disabled={!changed || busy}
          onClick={() => void save()}
        >
          {busy ? <Spinner data-icon="inline-start" /> : null}
          Gem
        </Button>
      </CardFooter>
    </Card>
  );
}

function ProductPicker({
  name,
  categories,
  products,
  selected,
  onSelectedChange,
  disabled,
}: {
  name: string;
  categories: Categories;
  products: Products;
  selected: Set<string>;
  onSelectedChange: (selected: Set<string>) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const selectedCount = products.filter((product) =>
    selected.has(product.id),
  ).length;
  const categoryIds = useMemo(() => {
    if (!categoryId) return null;
    // The chosen category and all of its subcategories.
    const ids = new Set([categoryId]);
    for (const category of categories) {
      if (category.parentCategoryId && ids.has(category.parentCategoryId)) {
        ids.add(category.id);
      }
    }
    return ids;
  }, [categories, categoryId]);
  const query = search.trim().toLocaleLowerCase("da");
  const visible = products.filter(
    (product) =>
      (!query || product.name.toLocaleLowerCase("da").includes(query)) &&
      (!categoryIds ||
        product.categories.some((category) => categoryIds.has(category.id))),
  );
  const allVisibleSelected =
    visible.length > 0 && visible.every((product) => selected.has(product.id));

  function toggle(ids: string[], select: boolean) {
    const next = new Set(selected);
    for (const id of ids) {
      if (select) next.add(id);
      else next.delete(id);
    }
    onSelectedChange(next);
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-11 w-fit"
            disabled={disabled}
          />
        }
      >
        <PackageOpenIcon data-icon="inline-start" />
        Vælg Produkter
        <Badge variant="secondary">{selectedCount} valgt</Badge>
      </DialogTrigger>
      <DialogContent className="grid max-h-(--spacing-viewport-inset) min-h-0 grid-rows-(--grid-rows-panel) overflow-hidden sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Produkter hos {name}</DialogTitle>
          <DialogDescription>
            Tryk på et Produkt for at vælge eller fravælge det.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <InputGroup className="h-11 sm:flex-1">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Søg efter Produkt"
                aria-label="Søg efter Produkt"
              />
            </InputGroup>
            <Select
              items={[
                { value: null, label: "Alle kategorier" },
                ...categories.map((category) => ({
                  value: category.id,
                  label: category.path,
                })),
              ]}
              value={categoryId}
              onValueChange={setCategoryId}
            >
              <SelectTrigger
                className="h-11! w-full sm:w-64"
                aria-label="Kategori"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={null}>Alle kategorier</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.path}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-h-11"
              disabled={!visible.length}
              onClick={() =>
                toggle(
                  visible.map((product) => product.id),
                  !allVisibleSelected,
                )
              }
            >
              {allVisibleSelected ? "Fravælg viste" : "Vælg viste"}
            </Button>
          </div>
          <div className="min-h-0 overflow-y-auto p-1">
            {visible.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {visible.map((product) => {
                  const checked = selected.has(product.id);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      aria-pressed={checked}
                      className="group rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      onClick={() => toggle([product.id], !checked)}
                    >
                      <Card
                        appearance="product"
                        highlight={checked ? "selection" : undefined}
                        className="relative h-full"
                      >
                        <ProductCardMedia
                          imageUrl={product.imageUrl}
                          alt=""
                          sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 20vw"
                        />
                        {checked ? (
                          <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <CheckIcon className="size-4" aria-hidden="true" />
                          </span>
                        ) : null}
                        <CardHeader appearance="product">
                          <CardTitle appearance="truncate">
                            {product.name}
                          </CardTitle>
                          <CardDescription appearance="truncate">
                            {product.categories
                              .map((category) => category.name)
                              .join(" · ")}
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    </button>
                  );
                })}
              </div>
            ) : (
              <Empty appearance="outlined">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <PackageOpenIcon />
                  </EmptyMedia>
                  <EmptyTitle>Ingen Produkter fundet</EmptyTitle>
                  <EmptyDescription>
                    Prøv en anden søgning eller kategori.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <span className="text-sm text-muted-foreground" role="status">
            {selectedCount} Produkter valgt
          </span>
          <DialogClose render={<Button type="button" size="lg" />}>
            Færdig
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
