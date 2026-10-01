"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCompleteCatalog } from "@/hooks/use-complete-catalog";
import { getUserErrorMessage } from "@/lib/user-errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { searchProducts } from "@/lib/product-search";

type ProductOption = FunctionReturnType<
  typeof api.catalog.listActiveProductSearchOptionsPage
>["page"][number];

// Checked products are excluded from Count. Locked products are excluded for
// the whole organization and cannot be changed here.
export function CountExclusionList({
  id,
  products,
  excludedProductIds,
  lockedProductIds,
  disabled,
  onToggle,
}: {
  id: string;
  products: ProductOption[] | undefined;
  excludedProductIds: ReadonlySet<Id<"products">>;
  lockedProductIds?: ReadonlySet<Id<"products">>;
  disabled: boolean;
  onToggle: (productId: Id<"products">, excluded: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const filteredProducts = useMemo(
    () => searchProducts(products ?? [], search, (product) => product),
    [products, search],
  );

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${id}-search`}>Søg efter Produkt</FieldLabel>
        <InputGroup className="min-h-11">
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            id={`${id}-search`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Søg efter navn eller kategori"
          />
        </InputGroup>
      </Field>

      {products === undefined ? (
        <div className="flex flex-col gap-2 rounded-lg border p-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-11 w-full" />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <Empty appearance="outlined" className="min-h-40">
          <EmptyHeader>
            <EmptyTitle>Ingen Produkter fundet</EmptyTitle>
            <EmptyDescription>
              {products.length === 0
                ? "Opret eller aktivér et Produkt i Produktkataloget først."
                : "Prøv et andet søgeord."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="max-h-80 overflow-y-auto rounded-lg border p-2">
          <FieldGroup appearance="tight">
            {filteredProducts.map((product) => {
              const locked = lockedProductIds?.has(product.id) ?? false;
              const inputId = `${id}-${product.id}`;
              return (
                <Field
                  key={product.id}
                  orientation="horizontal"
                  data-disabled={locked}
                  appearance="option"
                  className="min-h-11"
                >
                  <Checkbox
                    id={inputId}
                    className="self-center mt-0!"
                    checked={locked || excludedProductIds.has(product.id)}
                    disabled={locked || disabled}
                    aria-label={`Udelad ${product.name} fra Count`}
                    onCheckedChange={(next) =>
                      onToggle(product.id, next === true)
                    }
                  />
                  <FieldContent className="min-w-0">
                    <FieldLabel
                      htmlFor={inputId}
                      appearance="regular"
                      className="min-w-0"
                    >
                      <span className="truncate">{product.name}</span>
                      {locked ? (
                        <Badge variant="outline">Hele organisationen</Badge>
                      ) : null}
                    </FieldLabel>
                    <FieldDescription appearance="truncate">
                      {product.categoryPath}
                    </FieldDescription>
                  </FieldContent>
                </Field>
              );
            })}
          </FieldGroup>
        </div>
      )}
    </FieldGroup>
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
          id="organization-count-exclusions"
          products={products}
          excludedProductIds={excludedProductIds}
          disabled={savedProductIds === undefined || saving}
          onToggle={(productId, excluded) => {
            const next = new Set(excludedProductIds);
            if (excluded) next.add(productId);
            else next.delete(productId);
            setDraft(next);
          }}
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
