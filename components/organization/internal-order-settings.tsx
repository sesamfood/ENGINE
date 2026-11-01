"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { PlusIcon, StoreIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAccess, usePermission } from "@/components/app-shell";
import { ProductCategoryCombobox } from "@/components/catalog/product-category-combobox";
import { SettingsSwitchField } from "@/components/organization/settings-switch-field";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useCompleteCatalog } from "@/hooks/use-complete-catalog";
import { authClient } from "@/lib/auth-client";
import { getUserErrorMessage } from "@/lib/user-errors";

type Settings = FunctionReturnType<typeof api.internalOrders.getSettings>;
type Categories = FunctionReturnType<typeof api.catalog.listCategoryOptions>;
type ProductOption = {
  value: string;
  label: string;
  categoryIds: readonly string[];
};

export function InternalOrderSettings() {
  const { data: session } = authClient.useSession();
  return (
    <SettingsContent
      key={`${session?.session.activeOrganizationId}:${session?.user.id}`}
    />
  );
}

function SettingsContent() {
  const access = useAccess();
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
    api.catalog.listActiveProductSearchOptionsPage,
    canManage ? {} : "skip",
  );
  const setEnabled = useMutation(api.internalOrders.setEnabled);
  const [savingEnabled, setSavingEnabled] = useState(false);
  // Locations added here but not saved yet.
  const [added, setAdded] = useState<Id<"locations">[]>([]);
  const [toAdd, setToAdd] = useState<string | null>(null);
  const productOptions = useMemo(
    () =>
      products?.map((product) => ({
        value: product.id,
        label: product.name,
        categoryIds: product.categoryIds,
      })),
    [products],
  );

  if (!access) return <Skeleton className="h-56 max-w-3xl" />;
  if (!canManage) {
    return (
      <Alert variant="destructive" className="max-w-3xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at ændre indstillinger for interne bestillinger.
        </AlertDescription>
      </Alert>
    );
  }
  if (!settings || !categories || !productOptions) {
    return <Skeleton className="h-56 max-w-3xl" />;
  }

  const orderingDisabled = access.disabledFeatures.includes("ordering");
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

  async function changeEnabled(enabled: boolean) {
    setSavingEnabled(true);
    try {
      await setEnabled({ enabled });
      toast.success(
        `Interne bestillinger er slået ${enabled ? "til" : "fra"}`,
      );
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Indstillingen kunne ikke gemmes. Prøv igen."),
      );
    } finally {
      setSavingEnabled(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Aktivering</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <SettingsSwitchField
              id="internal-orders-enabled"
              label="Interne bestillinger"
              help={{
                label: "interne bestillinger",
                content:
                  "Lokationer kan bestille hos hinanden under Bestilling. Den leverende lokation opretter en transfer ud fra bestillingen under Transfer → Bestillinger, og modtageren registrerer den under Varemodtagelse.",
              }}
              checked={settings.enabled}
              onCheckedChange={(checked) => void changeEnabled(checked)}
              disabled={savingEnabled}
            />
          </FieldGroup>
          {orderingDisabled && settings.enabled ? (
            <Alert className="mt-4">
              <AlertDescription>
                Bestilling er slået fra, så interne bestillinger vises ikke.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <section
        aria-labelledby="internal-suppliers-title"
        className="flex max-w-3xl flex-col gap-4"
      >
        <h2 id="internal-suppliers-title" className="text-xl font-semibold">
          Leverende lokationer
        </h2>
        {supplierIds.length === 0 ? (
          <Empty appearance="outlined">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <StoreIcon />
              </EmptyMedia>
              <EmptyTitle>Ingen leverende lokationer</EmptyTitle>
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
              products={productOptions}
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
                Tilføj leverende lokation
              </FieldLabel>
              <Select
                items={addable.map((location) => ({
                  value: location.id,
                  label: location.name,
                }))}
                value={toAdd}
                onValueChange={(value) => setToAdd(value)}
              >
                <SelectTrigger id="internal-supplier-add" className="h-11 w-full">
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
    </div>
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
  products: ProductOption[];
  onRemoved: () => void;
}) {
  const saved = settings.suppliers.find((item) => item.locationId === locationId);
  const saveSupplier = useMutation(api.internalOrders.saveSupplier);
  const removeSupplier = useMutation(api.internalOrders.removeSupplier);
  const [orderingDraft, setOrderingDraft] = useState<Set<string> | null>(null);
  const [productDraft, setProductDraft] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const orderingIds = orderingDraft ?? new Set<string>(saved?.orderingLocationIds);
  const productIds = productDraft ?? new Set<string>(saved?.productIds);
  const changed = !saved || orderingDraft !== null || productDraft !== null;
  const others = settings.locations.filter((location) => location.id !== locationId);
  const availableProducts = new Set(products.map((product) => product.value));

  async function save() {
    setBusy(true);
    try {
      await saveSupplier({
        locationId,
        orderingLocationIds: [...orderingIds] as Id<"locations">[],
        // Archived Products drop out on save.
        productIds: [...productIds].filter((id) =>
          availableProducts.has(id),
        ) as Id<"products">[],
      });
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
      </CardHeader>
      <CardContent>
        <FieldGroup>
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
          <Field data-disabled={busy}>
            <FieldLabel>Produkter</FieldLabel>
            <ProductCategoryCombobox
              categories={categories}
              products={products}
              values={[...productIds]}
              onValuesChange={(values) => setProductDraft(new Set(values))}
              disabled={busy}
              ariaLabel={`Produkter, der kan bestilles hos ${name}`}
            />
            <FieldDescription>
              {productIds.size} Produkter valgt. Vælg en kategorilinje for at
              vælge eller fravælge alle Produkter i kategorien.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter appearance="compact" className="justify-end">
        <AlertDialog>
          <AlertDialogTrigger
            render={<Button type="button" variant="outline" size="lg" disabled={busy} />}
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
        <Button size="lg" disabled={!changed || busy} onClick={() => void save()}>
          {busy ? <Spinner data-icon="inline-start" /> : null}
          Gem
        </Button>
      </CardFooter>
    </Card>
  );
}
