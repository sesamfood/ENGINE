"use client";

import { useMemo, useState } from "react";
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
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

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
  const [categoryIds, setCategoryIds] = useState(
    () => new Set(settings.categoryIds),
  );
  const [productIds, setProductIds] = useState(
    () => new Set(settings.productIds),
  );
  const [excludedIds, setExcludedIds] = useState(
    () => new Set(settings.excludedProductIds),
  );
  const [search, setSearch] = useState("");
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
  const matches = (text: string) =>
    text
      .toLocaleLowerCase("da")
      .includes(search.trim().toLocaleLowerCase("da"));
  const filteredCategories = settings.categories.filter((category) =>
    matches(category.path),
  );
  const filteredProducts = products.filter((product) =>
    matches(
      `${product.name} ${product.categories.map((category) => category.name).join(" ")}`,
    ),
  );
  const visibleCount = products.filter(isVisible).length;

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
        categoryIds: [...categoryIds].filter((id) =>
          availableCategories.has(id),
        ),
        productIds: [...productIds].filter((id) => availableProducts.has(id)),
        excludedProductIds: [...excludedIds].filter((id) =>
          availableProducts.has(id),
        ),
        expectedUpdatedAt: revision,
      });
      toast.success("Produktvisningen er gemt for lokationen");
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
        <FieldGroup>
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
            <>
              <Field>
                <FieldLabel htmlFor="date-label-settings-search">
                  Søg efter produkt eller kategori
                </FieldLabel>
                <Input
                  id="date-label-settings-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="h-11"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldSet className="min-w-0 gap-2">
                  <FieldLegend variant="label">Kategorier</FieldLegend>
                  <div className="max-h-64 overflow-y-auto rounded-md border p-2">
                    {filteredCategories.map((category) => {
                      const selected = categoryIds.has(category.id);
                      const inherited =
                        !selected && includedCategories.has(category.id);
                      return (
                        <Field
                          key={category.id}
                          orientation="horizontal"
                          className="gap-2"
                        >
                          <Checkbox
                            id={`label-category-${category.id}`}
                            checked={selected || inherited}
                            disabled={saving || inherited}
                            onCheckedChange={(checked) => {
                              const next = new Set(categoryIds);
                              if (checked) next.add(category.id);
                              else next.delete(category.id);
                              setCategoryIds(next);
                            }}
                          />
                          <FieldLabel
                            htmlFor={`label-category-${category.id}`}
                            className="min-h-11 min-w-0 break-words"
                          >
                            {category.path}
                            {inherited ? " (via overkategori)" : ""}
                          </FieldLabel>
                        </Field>
                      );
                    })}
                    {!filteredCategories.length ? (
                      <p className="p-2 text-muted-foreground">
                        Ingen kategorier fundet
                      </p>
                    ) : null}
                  </div>
                </FieldSet>
                <FieldSet className="min-w-0 gap-2">
                  <FieldLegend variant="label">Produkter</FieldLegend>
                  <div className="max-h-64 overflow-y-auto rounded-md border p-2">
                    {filteredProducts.map((product) => (
                      <Field
                        key={product.id}
                        orientation="horizontal"
                        className="gap-2"
                      >
                        <Checkbox
                          id={`label-product-${product.id}`}
                          checked={isVisible(product)}
                          disabled={saving}
                          onCheckedChange={(checked) => {
                            const included = new Set(productIds);
                            const excluded = new Set(excludedIds);
                            if (checked) {
                              excluded.delete(product.id);
                              if (!fromCategory(product))
                                included.add(product.id);
                            } else {
                              included.delete(product.id);
                              if (fromCategory(product))
                                excluded.add(product.id);
                              else excluded.delete(product.id);
                            }
                            setProductIds(included);
                            setExcludedIds(excluded);
                          }}
                        />
                        <FieldLabel
                          htmlFor={`label-product-${product.id}`}
                          className="min-h-11 min-w-0 break-words"
                        >
                          {product.name}
                        </FieldLabel>
                      </Field>
                    ))}
                    {!filteredProducts.length ? (
                      <p className="p-2 text-muted-foreground">
                        Ingen produkter fundet
                      </p>
                    ) : null}
                  </div>
                </FieldSet>
              </div>
            </>
          ) : null}
          <p className="text-sm text-muted-foreground" role="status">
            {visibleCount} af {products.length} produkter vises på lokationen.
          </p>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end gap-2">
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
