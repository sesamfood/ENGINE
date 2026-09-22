"use client";

import { useMemo, useState, type ComponentProps } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { categoryIdsInSubtree } from "@/convex/lib/categoryHierarchy";
import { useCompleteCatalog } from "@/hooks/use-complete-catalog";
import { getUserErrorMessage } from "@/lib/user-errors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ProductCategoryCombobox } from "@/components/catalog/product-category-combobox";
import { SettingsSwitchField } from "@/components/organization/settings-switch-field";

type Settings = FunctionReturnType<typeof api.dateLabels.getSettings>;
type Products = FunctionReturnType<typeof api.dateLabels.listProducts>["page"];

export function ProductVisibilitySettings({
  locationId,
}: {
  locationId: Id<"locations">;
}) {
  const [reset, setReset] = useState(0);
  const settings = useQuery(api.dateLabels.getSettings, { locationId });
  const products = useCompleteCatalog(api.dateLabels.listProducts, {
    locationId,
    includeHidden: true,
  });
  if (!settings || !products)
    return (
      <CardContent>
        <Skeleton className="h-64" />
      </CardContent>
    );
  return (
    <VisibilityForm
      key={reset}
      settings={settings}
      products={products}
      locationId={locationId}
      onReset={() => setReset((value) => value + 1)}
    />
  );
}

function VisibilityForm({
  settings,
  products,
  locationId,
  onReset,
}: {
  settings: Settings;
  products: Products;
  locationId: Id<"locations">;
  onReset: () => void;
}) {
  const saveSettings = useMutation(api.dateLabels.saveSettings);
  const [revision] = useState(settings.updatedAt);
  const [mode, setMode] = useState(settings.mode);
  const [includeTime, setIncludeTime] = useState(settings.includeTime);
  const [categoryIds, setCategoryIds] = useState(
    () => new Set(settings.categoryIds),
  );
  const [productIds, setProductIds] = useState(
    () => new Set(settings.productIds),
  );
  const [excludedIds, setExcludedIds] = useState(
    () => new Set(settings.excludedProductIds),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const includedCategories = useMemo(
    () =>
      new Set(
        [...categoryIds].flatMap((id) => [
          ...categoryIdsInSubtree(settings.categories, id),
        ]),
      ),
    [categoryIds, settings.categories],
  );
  const fromCategory = (product: Products[number]) =>
    product.categories.some((category) => includedCategories.has(category.id));
  const isVisible = (product: Products[number]) =>
    mode === "all" ||
    (!excludedIds.has(product.id) &&
      (productIds.has(product.id) || fromCategory(product)));
  const visibleProducts = products.filter(isVisible);
  const categories = useMemo(() => {
    const byId = new Map(
      settings.categories.map((category) => [category.id, category]),
    );
    return settings.categories.map((category) => {
      let depth = 0;
      let parentId = category.parentCategoryId;
      while (parentId) {
        depth++;
        parentId = byId.get(parentId)?.parentCategoryId ?? null;
      }
      return { ...category, depth };
    });
  }, [settings.categories]);
  const productOptions = useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: product.name,
        categoryIds: product.categories.map((category) => category.id),
      })),
    [products],
  );

  const updateSelection: ComponentProps<
    typeof ProductCategoryCombobox
  >["onValuesChange"] = (values, categoryChange) => {
    const nextVisibleIds = new Set(values);
    const nextCategoryIds = new Set(categoryIds);
    const changedCategory = settings.categories.find(
      (category) => category.id === categoryChange?.value,
    );
    if (changedCategory && categoryChange) {
      const subtree = categoryIdsInSubtree(
        settings.categories,
        changedCategory.id,
      );
      if (categoryChange.selected) nextCategoryIds.add(changedCategory.id);
      else {
        for (const id of subtree) nextCategoryIds.delete(id);
      }
      for (const product of products) {
        if (!product.categories.some((category) => subtree.has(category.id)))
          continue;
        if (categoryChange.selected) nextVisibleIds.add(product.id);
        else nextVisibleIds.delete(product.id);
      }
    }
    const nextIncludedCategories = new Set(
      [...nextCategoryIds].flatMap((id) => [
        ...categoryIdsInSubtree(settings.categories, id),
      ]),
    );
    const nextProductIds = new Set<Id<"products">>();
    const nextExcludedIds = new Set<Id<"products">>();
    for (const product of products) {
      const includedByCategory = product.categories.some((category) =>
        nextIncludedCategories.has(category.id),
      );
      if (nextVisibleIds.has(product.id)) {
        if (!includedByCategory || productIds.has(product.id))
          nextProductIds.add(product.id);
      } else if (includedByCategory) nextExcludedIds.add(product.id);
    }
    setCategoryIds(nextCategoryIds);
    setProductIds(nextProductIds);
    setExcludedIds(nextExcludedIds);
  };

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const availableCategories = new Set(
      settings.categories.map((category) => category.id),
    );
    const availableProducts = new Set(products.map((product) => product.id));
    try {
      await saveSettings({
        locationId,
        mode,
        includeTime,
        categoryIds: [...categoryIds].filter((id) =>
          availableCategories.has(id),
        ),
        productIds: [...productIds].filter((id) => availableProducts.has(id)),
        excludedProductIds: [...excludedIds].filter((id) =>
          availableProducts.has(id),
        ),
        expectedUpdatedAt: revision,
      });
      toast.success("Indstillingerne er gemt for lokationen");
      onReset();
    } catch (error) {
      setError(getUserErrorMessage(error, "Indstillingerne kunne ikke gemmes"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <CardContent>
        <FieldGroup appearance="dense">
          <SettingsSwitchField
            id="date-label-include-time"
            label="Medtag klokkeslæt"
            checked={includeTime}
            onCheckedChange={setIncludeTime}
            disabled={saving}
            help={{
              label: "klokkeslæt på etiketter",
              content:
                "Vis produktionsklokkeslæt på siden og klokkeslæt for produktion og sidste anvendelse på etiketten. Slå fra for kun at vise datoer.",
            }}
          />
          <Field orientation="horizontal">
            <Checkbox
              id="date-label-show-all"
              checked={mode === "all"}
              disabled={saving}
              onCheckedChange={(checked) =>
                setMode(checked ? "all" : "selected")
              }
            />
            <FieldLabel htmlFor="date-label-show-all" className="min-h-11">
              Vis alle produkter
            </FieldLabel>
            <HelpTooltip
              label="produktvisning"
              content="Slå fra for at vælge kategorier og enkelte produkter. Valgte kategorier omfatter underkategorier og nye produkter. Du kan fravælge enkelte produkter fra en kategori."
            />
          </Field>
          {mode === "selected" ? (
            <Field data-disabled={saving}>
              <FieldLabel>Produkter og kategorier</FieldLabel>
              <ProductCategoryCombobox
                categories={categories}
                products={productOptions}
                values={visibleProducts.map((product) => product.id)}
                onValuesChange={updateSelection}
                disabled={saving}
                ariaLabel="Produkter til datomærkning"
              />
            </Field>
          ) : null}
          <p className="text-sm text-muted-foreground" role="status">
            {visibleProducts.length} af {products.length} produkter vises på
            lokationen.
          </p>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>
      </CardContent>
      <CardFooter appearance="compact" className="justify-end">
        <Button
          variant="outline"
          className="min-h-11"
          disabled={saving}
          onClick={onReset}
        >
          Annullér
        </Button>
        <Button
          className="min-h-11"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? <Spinner data-icon="inline-start" /> : null}Gem
          indstillinger
        </Button>
      </CardFooter>
    </>
  );
}
