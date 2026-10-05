"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCompleteCatalog } from "@/hooks/use-complete-catalog";
import { getUserErrorMessage } from "@/lib/user-errors";
import { ProductCategoryCombobox } from "@/components/catalog/product-category-combobox";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

type ProductOption = FunctionReturnType<
  typeof api.catalog.listActiveProductSearchOptionsPage
>["page"][number];

// Selected products are excluded from Count. Locked products are excluded for
// the whole organization and cannot be changed here.
export function CountExclusionList({
  products,
  excludedProductIds,
  lockedProductIds,
  disabled,
  onChange,
}: {
  products: ProductOption[] | undefined;
  excludedProductIds: ReadonlySet<Id<"products">>;
  lockedProductIds?: ReadonlySet<Id<"products">>;
  disabled: boolean;
  onChange: (productIds: Set<Id<"products">>) => void;
}) {
  const categories = useQuery(api.catalog.listCategoryOptions, {});
  const productOptions = useMemo(
    () =>
      products?.map((product) => {
        const locked = lockedProductIds?.has(product.id) ?? false;
        return {
          value: product.id,
          label: locked
            ? `${product.name} · Udeladt for hele organisationen`
            : product.name,
          categoryIds: product.categoryIds,
          disabled: locked,
        };
      }),
    [lockedProductIds, products],
  );

  if (productOptions === undefined || categories === undefined) {
    return <Skeleton className="h-11 w-full" />;
  }
  return (
    <Field data-disabled={disabled}>
      <FieldLabel>Udeladte Produkter</FieldLabel>
      <ProductCategoryCombobox
        categories={categories}
        products={productOptions}
        values={[...excludedProductIds]}
        onValuesChange={(values) =>
          onChange(new Set(values as Id<"products">[]))
        }
        disabled={disabled}
        ariaLabel="Produkter udeladt fra Count"
      />
      <FieldDescription>
        Vælg en kategorilinje for at vælge eller fravælge alle Produkter i
        kategorien.
      </FieldDescription>
    </Field>
  );
}

export function OrganizationCountExclusions() {
  const savedProductIds = useQuery(api.countExclusions.getOrganization, {});
  const products = useCompleteCatalog(
    api.catalog.listActiveProductSearchOptionsPage,
    {},
  );
  const saveExclusions = useMutation(api.countExclusions.setOrganization);
  const [draft, setDraft] = useState<Set<Id<"products">> | null>(null);
  const [saving, setSaving] = useState(false);
  const excludedProductIds = draft ?? new Set(savedProductIds ?? []);

  async function save() {
    setSaving(true);
    try {
      await saveExclusions({ productIds: [...excludedProductIds] });
      setDraft(null);
      toast.success("Produkter udeladt fra Count er gemt");
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Count-indstillingerne kunne ikke gemmes. Prøv igen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="flex items-center gap-1">
          <CardTitle>Udelad fra Count</CardTitle>
          <HelpTooltip
            label="Udelad fra Count"
            content="Valgte Produkter vises ikke i Count på nogen lokation. De kan stadig bruges i Transfer, Waste og andre funktioner. Lokationer kan udelade flere Produkter under Lokationer."
          />
        </div>
        <CardDescription>
          {excludedProductIds.size === 0
            ? "Alle Produkter tælles."
            : `${excludedProductIds.size} Produkter tælles ikke på nogen lokation.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CountExclusionList
          products={products}
          excludedProductIds={excludedProductIds}
          disabled={savedProductIds === undefined || saving}
          onChange={setDraft}
        />
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          className="min-h-11"
          disabled={draft === null || saving}
          onClick={() => void save()}
        >
          {saving ? <Spinner data-icon="inline-start" /> : null}
          Gem udeladte Produkter
        </Button>
      </CardFooter>
    </Card>
  );
}
