"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import {
  standardUnitFor,
  type ProductType,
  type UnitSystemSettings,
} from "@/lib/unit-system";
import { getUserErrorMessage } from "@/lib/user-errors";

type MigrationProduct = FunctionReturnType<
  typeof api.catalog.listUnitMigration
>["products"][number];

const productTypes: Array<{ value: ProductType; label: string }> = [
  { value: "dry", label: "Tørvare" },
  { value: "wet", label: "Væske" },
  { value: "piece", label: "Styk" },
];

function formatFactor(value: number) {
  return Number(value.toPrecision(10)).toString().replace(".", ",");
}

function parseFactor(value: string) {
  const normalized = value.trim().replace(",", ".");
  return normalized ? Number(normalized) : Number.NaN;
}

export function UnitMigration() {
  const data = useQuery(api.catalog.listUnitMigration);
  const migrate = useMutation(api.catalog.migrateProductUnit);
  const [migratingAll, setMigratingAll] = useState(false);

  if (!data || data.products.length === 0) return null;

  const suggested = data.products.filter(
    (product) =>
      product.suggestedProductType !== null &&
      product.suggestedFactorToStandard !== null,
  );

  async function migrateAll() {
    setMigratingAll(true);
    let failed = 0;
    for (const product of suggested) {
      try {
        await migrate({
          productId: product.productId,
          productType: product.suggestedProductType!,
          factorToStandard: product.suggestedFactorToStandard!,
        });
      } catch {
        failed += 1;
      }
    }
    setMigratingAll(false);
    const migrated = suggested.length - failed;
    if (failed === 0) {
      toast.success(`${migrated} produkter er flyttet til standardenheder`);
    } else {
      toast.error(
        `${migrated} produkter er flyttet. ${failed} kunne ikke flyttes. Prøv dem enkeltvis.`,
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Flyt produkter til standardenheder</CardTitle>
        <CardDescription>
          Produkterne herunder bruger endnu ikke standardenheder. Når et produkt
          flyttes, omregnes lagerbeholdningen til standardenheden. Historikken
          ændres ikke.
        </CardDescription>
        {suggested.length > 0 ? (
          <CardAction>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    variant="outline"
                    size="lg"
                    className="min-h-11"
                    disabled={migratingAll}
                  />
                }
              >
                {migratingAll ? <Spinner data-icon="inline-start" /> : null}
                Migrér alle med forslag
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Migrér {suggested.length} produkter?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Produkterne flyttes til standardenheder med de foreslåede
                    produkttyper og omregninger. Lagerbeholdningen omregnes til
                    standardenheden. Historikken ændres ikke.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annullér</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void migrateAll()}>
                    Migrér
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent appearance="compact" className="flex flex-col">
        {data.products.map((product) => (
          <MigrationRow
            key={product.productId}
            product={product}
            unitSystem={data.unitSystem}
            disabled={migratingAll}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function MigrationRow({
  product,
  unitSystem,
  disabled,
}: {
  product: MigrationProduct;
  unitSystem: UnitSystemSettings;
  disabled: boolean;
}) {
  const migrate = useMutation(api.catalog.migrateProductUnit);
  const [productType, setProductType] = useState<ProductType | null>(
    product.suggestedProductType,
  );
  const [factor, setFactor] = useState(
    product.suggestedFactorToStandard === null
      ? ""
      : formatFactor(product.suggestedFactorToStandard),
  );
  const [saving, setSaving] = useState(false);
  const factorValue = parseFactor(factor);
  const valid =
    productType !== null && Number.isFinite(factorValue) && factorValue > 0;
  const defaultUnitName = product.defaultUnitName ?? "enhed";
  const factorId = `${product.productId}-factor`;

  async function submit() {
    if (!productType || !valid) return;
    setSaving(true);
    try {
      await migrate({
        productId: product.productId,
        productType,
        factorToStandard: factorValue,
      });
      toast.success(`${product.name} er flyttet til standardenheder`);
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Produktet kunne ikke flyttes. Prøv igen."),
      );
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{product.name}</span>
          {product.status === "archived" ? (
            <Badge variant="secondary">Arkiveret</Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {product.units
            .map((unit) =>
              unit.isDefault
                ? `${unit.name} (standard)`
                : `${unit.name} = ${formatFactor(unit.factorToDefault)} ${defaultUnitName}`,
            )
            .join(" · ")}
        </p>
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <Field className="md:w-auto">
          <FieldTitle>Produkttype</FieldTitle>
          <ToggleGroup
            value={productType ? [productType] : []}
            variant="outline"
            spacing={0}
            className="w-full"
            aria-label={`Produkttype for ${product.name}`}
            disabled={disabled || saving}
            onValueChange={(value) => {
              const next = productTypes.find(
                (type) => type.value === value[0],
              )?.value;
              if (!next) return;
              setProductType(next);
              if (
                next === product.suggestedProductType &&
                product.suggestedFactorToStandard !== null
              ) {
                setFactor(formatFactor(product.suggestedFactorToStandard));
              }
            }}
          >
            {productTypes.map((type) => (
              <ToggleGroupItem
                key={type.value}
                value={type.value}
                className="min-h-11 flex-1"
              >
                {type.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
        <Field className="md:flex-1">
          <FieldLabel htmlFor={factorId}>
            1 {defaultUnitName} = …{" "}
            {productType
              ? standardUnitFor(productType, unitSystem).name
              : "standardenhed"}
          </FieldLabel>
          <Input
            id={factorId}
            type="text"
            inputMode="decimal"
            value={factor}
            disabled={disabled || saving}
            onChange={(event) => setFactor(event.target.value)}
            className="h-11"
          />
        </Field>
        <Button
          size="lg"
          className="min-h-11"
          disabled={!valid || disabled || saving}
          onClick={() => void submit()}
        >
          {saving ? <Spinner data-icon="inline-start" /> : null}
          Migrér
        </Button>
      </div>
    </div>
  );
}
