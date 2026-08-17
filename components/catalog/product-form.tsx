"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ArrowLeftIcon,
  ImageIcon,
  Link2Icon,
  PlusIcon,
  RefreshCwIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { compressImage } from "@/lib/compress-image";
import { usePermission } from "@/components/app-shell";
import {
  CreatableCombobox,
  type ComboboxOption,
} from "@/components/catalog/creatable-combobox";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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

type UnitRow = {
  key: string;
  unitValue: string | null;
  factor: string;
  isDefault: boolean;
};

type IngredientRow = {
  key: string;
  productId: string | null;
  quantity: string;
  unitId: string | null;
};

type ProductOption = {
  id: Id<"products">;
  name: string;
  archived?: boolean;
  units: Array<{ id: Id<"units">; name: string }>;
};

type OnlinePosProduct = {
  id: number;
  name: string;
  groupName: string;
};

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

function newKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

function parseReference(value: string) {
  if (value.startsWith("new:")) {
    return { kind: "new" as const, name: value.slice(4) };
  }
  return { kind: "existing" as const, id: value.split(":")[1] };
}

function formatFactor(value: number) {
  return Number(value.toPrecision(10)).toString();
}

function normalizedProductName(value: string) {
  return value.trim().toLocaleLowerCase("da");
}

function OnlinePosProductMappingField({
  productId,
  productName,
}: {
  productId: Id<"products">;
  productName: string;
}) {
  const canManageIntegrations = usePermission("integrations.manage");
  const mapping = useQuery(
    api.onlinePos.getProductMapping,
    canManageIntegrations ? { productId } : "skip",
  );
  const listProducts = useAction(api.onlinePos.listProducts);
  const setProductMapping = useAction(api.onlinePos.setProductMapping);
  const [onlinePosProducts, setOnlinePosProducts] = useState<
    OnlinePosProduct[] | null
  >();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!mapping || onlinePosProducts !== undefined) return;
    let active = true;
    void listProducts({})
      .then((products) => {
        if (active) setOnlinePosProducts(products);
      })
      .catch(() => {
        if (active) setOnlinePosProducts(null);
      });
    return () => {
      active = false;
    };
  }, [listProducts, mapping, onlinePosProducts]);

  const currentMapping = mapping?.onlinePosProductId;
  const comboboxOptions = useMemo(
    () =>
      (onlinePosProducts ?? []).map((product) => ({
        value: String(product.id),
        label: product.groupName
          ? `${product.name} — ${product.groupName}`
          : product.name,
      })),
    [onlinePosProducts],
  );
  const suggestion =
    currentMapping == null
      ? (onlinePosProducts ?? []).find(
          (product) =>
            normalizedProductName(product.name) ===
            normalizedProductName(productName),
        )
      : undefined;

  async function changeMapping(value: string | null) {
    setSaving(true);
    try {
      await setProductMapping({
        productId,
        onlinePosProductId: value === null ? null : Number(value),
      });
      toast.success(
        value === null
          ? "OnlinePOS-koblingen er fjernet"
          : "OnlinePOS-koblingen er gemt",
      );
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSaving(false);
    }
  }

  if (!canManageIntegrations || !mapping) return null;

  return (
    <Field>
      <FieldLabel>OnlinePOS-produkt</FieldLabel>
      {onlinePosProducts === undefined ? (
        <Skeleton className="h-11 w-full" />
      ) : onlinePosProducts === null ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => setOnlinePosProducts(undefined)}
        >
          <RefreshCwIcon data-icon="inline-start" />
          Prøv at hente OnlinePOS-produkter igen
        </Button>
      ) : (
        <CreatableCombobox
          options={comboboxOptions}
          value={
            currentMapping === null || currentMapping === undefined
              ? null
              : String(currentMapping)
          }
          onValueChange={(value) => void changeMapping(value)}
          placeholder="Søg efter OnlinePOS-produkt"
          ariaLabel={`OnlinePOS-produkt for ${productName}`}
          disabled={saving}
        />
      )}
      {suggestion ? (
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <FieldDescription>
            Forslag med samme navn: {suggestion.name}
          </FieldDescription>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() => void changeMapping(String(suggestion.id))}
          >
            <Link2Icon data-icon="inline-start" />
            Brug forslag
          </Button>
        </div>
      ) : onlinePosProducts ? (
        <FieldDescription>Koblingen gemmes med det samme.</FieldDescription>
      ) : null}
    </Field>
  );
}

function FormLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Skeleton className="h-[34rem] w-full" />
        <Skeleton className="h-[34rem] w-full" />
      </div>
    </div>
  );
}

export function ProductForm({ productId }: { productId?: Id<"products"> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnHref = useMemo(() => {
    const params = new URLSearchParams();
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    if (search) params.set("search", search);
    params.set("status", status === "archived" ? "archived" : "active");
    return `/organization/products?${params.toString()}`;
  }, [searchParams]);
  const returnQuery = returnHref.slice("/organization/products".length);
  const product = useQuery(
    api.catalog.getProduct,
    productId ? { productId } : "skip",
  );
  const options = useQuery(api.catalog.listFormOptions, {
    excludeProductId: productId,
  });
  const createProduct = useMutation(api.catalog.createProduct);
  const updateProduct = useMutation(api.catalog.updateProduct);
  const generateUploadUrl = useMutation(
    api.catalog.generateProductImageUploadUrl,
  );
  const setProductImage = useMutation(api.catalog.setProductImage);
  const removeProductImage = useMutation(api.catalog.removeProductImage);
  const initializedProduct = useRef<string | null>(null);
  const [name, setName] = useState("");
  const [categoryValue, setCategoryValue] = useState<string | null>(null);
  const [unitRows, setUnitRows] = useState<UnitRow[]>([
    { key: "unit-initial", unitValue: null, factor: "1", isDefault: true },
  ]);
  const [ingredientRows, setIngredientRows] = useState<IngredientRow[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!productId || !product || initializedProduct.current === productId)
      return;
    initializedProduct.current = productId;
    setName(product.name);
    setCategoryValue(
      product.category ? `existing:${product.category.id}` : null,
    );
    setUnitRows(
      product.units.map((unit) => ({
        key: `unit-${unit.id}`,
        unitValue: `existing:${unit.id}`,
        factor: unit.factorToDefault.toString(),
        isDefault: unit.isDefault,
      })),
    );
    setIngredientRows(
      product.ingredients.map((ingredient) => ({
        key: `ingredient-${ingredient.productId}`,
        productId: ingredient.productId,
        quantity: ingredient.quantity.toString(),
        unitId: ingredient.unitId,
      })),
    );
  }, [product, productId]);

  const imagePreview = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : null),
    [imageFile],
  );

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const categoryOptions: ComboboxOption[] =
    options?.categories.map((category) => ({
      value: `existing:${category.id}`,
      label: category.name,
    })) ?? [];
  const unitOptions: ComboboxOption[] =
    options?.units.map((unit) => ({
      value: `existing:${unit.id}`,
      label: unit.name,
    })) ?? [];

  const productOptions = useMemo<ProductOption[]>(() => {
    const active: ProductOption[] =
      options?.products.map((option) => ({
        id: option.id,
        name: option.name,
        units: option.units,
      })) ?? [];
    if (!product) return active;

    for (const ingredient of product.ingredients) {
      if (active.some((option) => option.id === ingredient.productId)) continue;
      active.push({
        id: ingredient.productId,
        name: ingredient.productName,
        archived: ingredient.productStatus === "archived",
        units: [{ id: ingredient.unitId, name: ingredient.unitName }],
      });
    }
    return active;
  }, [options, product]);

  const productComboboxOptions: ComboboxOption[] = productOptions.map(
    (option) => ({
      value: option.id,
      label: option.archived ? `${option.name} — arkiveret` : option.name,
    }),
  );

  const defaultRow = unitRows.find((row) => row.isDefault);
  const defaultUnitName = defaultRow
    ? (unitOptions.find((option) => option.value === defaultRow.unitValue)
        ?.label ??
      (defaultRow.unitValue?.startsWith("new:")
        ? defaultRow.unitValue.slice(4)
        : "standardenhed"))
    : "standardenhed";

  function unitName(row: UnitRow) {
    return (
      unitOptions.find((option) => option.value === row.unitValue)?.label ??
      (row.unitValue?.startsWith("new:")
        ? row.unitValue.slice(4)
        : "valgt enhed")
    );
  }

  function setDefaultUnit(key: string) {
    const selected = unitRows.find((row) => row.key === key);
    const divisor = Number(selected?.factor);
    setUnitRows((current) =>
      current.map((row) => ({
        ...row,
        isDefault: row.key === key,
        factor:
          row.key === key
            ? "1"
            : Number.isFinite(divisor) && divisor > 0
              ? formatFactor(Number(row.factor) / divisor)
              : row.factor,
      })),
    );
  }

  function addUnit() {
    setUnitRows((current) => [
      ...current,
      { key: newKey("unit"), unitValue: null, factor: "", isDefault: false },
    ]);
  }

  function removeUnit(key: string) {
    setUnitRows((current) => {
      const removed = current.find((row) => row.key === key);
      const remaining = current.filter((row) => row.key !== key);
      if (removed?.isDefault && remaining[0]) {
        const divisor = Number(remaining[0].factor);
        return remaining.map((row, index) => ({
          ...row,
          isDefault: index === 0,
          factor:
            index === 0
              ? "1"
              : Number.isFinite(divisor) && divisor > 0
                ? formatFactor(Number(row.factor) / divisor)
                : row.factor,
        }));
      }
      return remaining;
    });
  }

  function addIngredient() {
    setIngredientRows((current) => [
      ...current,
      {
        key: newKey("ingredient"),
        productId: null,
        quantity: "",
        unitId: null,
      },
    ]);
  }

  function validate() {
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = "Indtast et produktnavn";
    if (!categoryValue) nextErrors.category = "Vælg eller opret en kategori";
    if (unitRows.length === 0) nextErrors.units = "Tilføj mindst én enhed";
    if (unitRows.some((row) => !row.unitValue)) {
      nextErrors.units = "Vælg en enhed for hver række";
    }
    if (
      unitRows.some(
        (row) =>
          !Number.isFinite(Number(row.factor)) || Number(row.factor) <= 0,
      )
    ) {
      nextErrors.units = "Alle omregninger skal være større end nul";
    }
    const unitKeys = unitRows.map((row) =>
      row.unitValue?.toLocaleLowerCase("da"),
    );
    if (new Set(unitKeys).size !== unitKeys.length) {
      nextErrors.units = "Hver enhed kan kun tilføjes én gang";
    }
    if (
      ingredientRows.some(
        (row) =>
          !row.productId ||
          !row.unitId ||
          !Number.isFinite(Number(row.quantity)) ||
          Number(row.quantity) <= 0,
      )
    ) {
      nextErrors.ingredients =
        "Vælg produkt, mængde og enhed for hver ingrediens";
    }
    const ingredientIds = ingredientRows.map((row) => row.productId);
    if (new Set(ingredientIds).size !== ingredientIds.length) {
      nextErrors.ingredients = "Hver ingrediens kan kun tilføjes én gang";
    }
    if (imageFile) {
      if (!IMAGE_TYPES.includes(imageFile.type)) {
        nextErrors.image =
          "Brug et billede i JPEG-, PNG-, WebP- eller AVIF-format";
      } else if (imageFile.size > MAX_IMAGE_SIZE) {
        nextErrors.image = "Billedet må højst være 10 MB";
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function uploadImage(savedProductId: Id<"products">) {
    if (!imageFile) return;
    const image = await compressImage(imageFile, {
      maxWidth: 1200,
      maxHeight: 1200,
      quality: 0.75,
    });
    const uploadUrl = await generateUploadUrl({});
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": image.type },
      body: image,
    });
    if (!response.ok) throw new Error("Billedet kunne ikke uploades");
    const { storageId } = (await response.json()) as { storageId: string };
    await setProductImage({
      productId: savedProductId,
      storageId: storageId as Id<"_storage">,
    });
  }

  async function save() {
    if (!validate() || !categoryValue) return;
    setIsSaving(true);

    const category = parseReference(categoryValue);
    const units = unitRows.map((row) => ({
      unit: parseReference(row.unitValue!),
      factorToDefault: Number(row.factor),
      isDefault: row.isDefault,
    }));
    const ingredients = ingredientRows.map((row) => ({
      productId: row.productId as Id<"products">,
      quantity: Number(row.quantity),
      unitId: row.unitId as Id<"units">,
    }));

    try {
      const savedProductId = productId
        ? await updateProduct({
            productId,
            name,
            category:
              category.kind === "existing"
                ? { kind: "existing", id: category.id as Id<"categories"> }
                : category,
            units: units.map((row) => ({
              ...row,
              unit:
                row.unit.kind === "existing"
                  ? { kind: "existing", id: row.unit.id as Id<"units"> }
                  : row.unit,
            })),
            ingredients,
          })
        : await createProduct({
            name,
            category:
              category.kind === "existing"
                ? { kind: "existing", id: category.id as Id<"categories"> }
                : category,
            units: units.map((row) => ({
              ...row,
              unit:
                row.unit.kind === "existing"
                  ? { kind: "existing", id: row.unit.id as Id<"units"> }
                  : row.unit,
            })),
            ingredients,
          });

      try {
        if (imageFile) await uploadImage(savedProductId);
        else if (productId && removeExistingImage) {
          await removeProductImage({ productId });
        }
      } catch (imageError) {
        toast.error(`Produktet blev gemt, men ${messageFrom(imageError)}`);
        router.push(`/organization/products/${savedProductId}${returnQuery}`);
        return;
      }

      toast.success(
        productId ? "Produktet er opdateret" : "Produktet er oprettet",
      );
      router.push(returnHref);
    } catch (caught) {
      toast.error(messageFrom(caught));
    } finally {
      setIsSaving(false);
    }
  }

  if (productId && product === undefined) return <FormLoading />;
  if (productId && product === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Produktet blev ikke fundet</CardTitle>
          <CardDescription>
            Produktet findes ikke i den aktive organisation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={returnHref} className={buttonVariants()}>
            Tilbage til produkter
          </Link>
        </CardContent>
      </Card>
    );
  }

  const shownImage =
    imagePreview ?? (!removeExistingImage ? product?.imageUrl : null);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-start gap-3">
        <Link
          href={returnHref}
          aria-label="Tilbage til produkter"
          className={buttonVariants({ variant: "outline", size: "icon-lg" })}
        >
          <ArrowLeftIcon />
        </Link>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              {productId ? "Rediger produkt" : "Nyt produkt"}
            </h2>
            {product?.status === "archived" ? (
              <Badge variant="outline">Arkiveret</Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:items-start xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Produktdetaljer</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col">
            <FieldGroup>
              <Field data-invalid={Boolean(errors.name)}>
                <FieldLabel htmlFor="product-name">Navn</FieldLabel>
                <Input
                  id="product-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="f.eks. avocado"
                  className="h-11"
                  aria-invalid={Boolean(errors.name)}
                />
                <FieldError>{errors.name}</FieldError>
              </Field>

              <Field data-invalid={Boolean(errors.category)}>
                <FieldLabel>Kategori</FieldLabel>
                <CreatableCombobox
                  options={categoryOptions}
                  value={categoryValue}
                  onValueChange={setCategoryValue}
                  placeholder="Vælg eller opret en kategori"
                  allowCreate
                  ariaLabel="Produktkategori"
                />
                <FieldError>{errors.category}</FieldError>
              </Field>

              {productId ? (
                <OnlinePosProductMappingField
                  productId={productId}
                  productName={name}
                />
              ) : null}

              <Field
                className="max-w-xl"
                data-invalid={Boolean(errors.image)}
              >
                <FieldLabel htmlFor="product-picture">Billede</FieldLabel>
                <div className="flex flex-col overflow-hidden rounded-xl border">
                  <label
                    htmlFor="product-picture"
                    className="block min-h-56 cursor-pointer"
                  >
                    {shownImage ? (
                      <span
                        role="img"
                        aria-label="Forhåndsvisning af produktbillede"
                        className="block min-h-56 w-full bg-muted bg-contain bg-center bg-no-repeat"
                        style={{ backgroundImage: `url("${shownImage}")` }}
                      />
                    ) : (
                      <span className="flex min-h-56 w-full flex-col items-center justify-center gap-3 bg-muted text-muted-foreground">
                        <ImageIcon className="size-10" aria-hidden="true" />
                        <span className="text-sm">Intet billede valgt</span>
                      </span>
                    )}
                  </label>
                  <div className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center">
                    <Input
                      id="product-picture"
                      type="file"
                      accept={IMAGE_TYPES.join(",")}
                      className="h-11 flex-1"
                      onChange={(event) => {
                        setImageFile(event.target.files?.[0] ?? null);
                        setRemoveExistingImage(false);
                      }}
                      aria-invalid={Boolean(errors.image)}
                    />
                    {shownImage ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        onClick={() => {
                          setImageFile(null);
                          setRemoveExistingImage(true);
                        }}
                      >
                        <Trash2Icon data-icon="inline-start" />
                        Fjern
                      </Button>
                    ) : null}
                  </div>
                </div>
                <FieldError>{errors.image}</FieldError>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Enheder og omregninger</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldSet>
                <FieldLegend className="sr-only">Produktenheder</FieldLegend>
                <RadioGroup
                  value={defaultRow?.key}
                  onValueChange={setDefaultUnit}
                  className="gap-3"
                >
                  {unitRows.map((row) => (
                    <div
                      key={row.key}
                      className="grid gap-3 rounded-xl border p-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(9rem,0.6fr)_auto] md:items-start"
                    >
                      <Field
                        orientation="horizontal"
                        className="min-h-11 md:w-auto md:self-center"
                      >
                        <RadioGroupItem
                          value={row.key}
                          id={`${row.key}-default`}
                          aria-label={`Gør ${unitName(row)} til standardenhed`}
                        />
                        <FieldLabel htmlFor={`${row.key}-default`}>
                          Standard
                        </FieldLabel>
                      </Field>
                      <Field className="md:self-center">
                        <FieldLabel className="sr-only">Enhed</FieldLabel>
                        <CreatableCombobox
                          options={unitOptions}
                          value={row.unitValue}
                          onValueChange={(value) =>
                            setUnitRows((current) =>
                              current.map((item) =>
                                item.key === row.key
                                  ? { ...item, unitValue: value }
                                  : item,
                              ),
                            )
                          }
                          placeholder="Vælg eller opret en enhed"
                          allowCreate
                          ariaLabel="Produktenhed"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`${row.key}-factor`}>
                          {row.isDefault
                            ? "Omregning"
                            : `1 ${unitName(row)} svarer til`}
                        </FieldLabel>
                        <Input
                          id={`${row.key}-factor`}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="any"
                          value={row.isDefault ? "1" : row.factor}
                          disabled={row.isDefault}
                          onChange={(event) =>
                            setUnitRows((current) =>
                              current.map((item) =>
                                item.key === row.key
                                  ? { ...item, factor: event.target.value }
                                  : item,
                              ),
                            )
                          }
                          className="h-11"
                        />
                        <FieldDescription>
                          {row.isDefault ? "Basisværdi" : defaultUnitName}
                        </FieldDescription>
                      </Field>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        className="size-11 md:mt-6"
                        aria-label={`Fjern ${unitName(row)}`}
                        disabled={unitRows.length === 1}
                        onClick={() => removeUnit(row.key)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  ))}
                </RadioGroup>
                <FieldError>{errors.units}</FieldError>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={addUnit}
                >
                  <PlusIcon data-icon="inline-start" />
                  Tilføj enhed
                </Button>
              </FieldSet>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ingredienser</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldSet>
                <FieldLegend className="sr-only">Ingredienser</FieldLegend>
                <FieldGroup>
                  {ingredientRows.length === 0 ? (
                    <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                      Produktet har endnu ingen ingredienser.
                    </p>
                  ) : null}
                  {ingredientRows.map((row) => {
                    const selectedProduct = productOptions.find(
                      (option) => option.id === row.productId,
                    );
                    return (
                      <div
                        key={row.key}
                        className="grid gap-3 rounded-xl border p-3 md:grid-cols-[minmax(0,1fr)_8rem_minmax(8rem,0.55fr)_auto] md:items-start"
                      >
                        <Field>
                          <FieldLabel>Produkt</FieldLabel>
                          <CreatableCombobox
                            options={productComboboxOptions}
                            value={row.productId}
                            onValueChange={(value) => {
                              const selected = productOptions.find(
                                (option) => option.id === value,
                              );
                              setIngredientRows((current) =>
                                current.map((item) =>
                                  item.key === row.key
                                    ? {
                                        ...item,
                                        productId: value,
                                        unitId: selected?.units[0]?.id ?? null,
                                      }
                                    : item,
                                ),
                              );
                            }}
                            placeholder="Søg efter produkter"
                            ariaLabel="Ingrediensprodukt"
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`${row.key}-quantity`}>
                            Mængde
                          </FieldLabel>
                          <Input
                            id={`${row.key}-quantity`}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            value={row.quantity}
                            onChange={(event) =>
                              setIngredientRows((current) =>
                                current.map((item) =>
                                  item.key === row.key
                                    ? { ...item, quantity: event.target.value }
                                    : item,
                                ),
                              )
                            }
                            className="h-11"
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`${row.key}-unit`}>Enhed</FieldLabel>
                          <Select
                            items={(selectedProduct?.units ?? []).map(
                              (unit) => ({ value: unit.id, label: unit.name }),
                            )}
                            value={row.unitId}
                            onValueChange={(value) =>
                              setIngredientRows((current) =>
                                current.map((item) =>
                                  item.key === row.key
                                    ? { ...item, unitId: value }
                                    : item,
                                ),
                              )
                            }
                            disabled={!selectedProduct}
                          >
                            <SelectTrigger id={`${row.key}-unit`} className="h-11! w-full">
                              <SelectValue placeholder="Vælg enhed" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {selectedProduct?.units.map((unit) => (
                                  <SelectItem key={unit.id} value={unit.id}>
                                    {unit.name}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-lg"
                          className="md:mt-6"
                          aria-label="Fjern ingrediens"
                          onClick={() =>
                            setIngredientRows((current) =>
                              current.filter((item) => item.key !== row.key),
                            )
                          }
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    );
                  })}
                  <FieldError>{errors.ingredients}</FieldError>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={addIngredient}
                  >
                    <PlusIcon data-icon="inline-start" />
                    Tilføj ingrediens
                  </Button>
                </FieldGroup>
              </FieldSet>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="sticky bottom-0 -mx-5 flex justify-end border-t bg-background/95 px-5 py-4 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
        <div className="flex w-full gap-2 sm:w-auto">
          {isSaving ? (
            <Button
              variant="outline"
              size="lg"
              className="min-h-11 flex-1 px-4 sm:flex-none"
              disabled
            >
              Annuller
            </Button>
          ) : (
            <Link
              href={returnHref}
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "min-h-11 flex-1 px-4 sm:flex-none",
              })}
            >
              Annuller
            </Link>
          )}
          <Button
            size="lg"
            className="min-h-11 flex-1 px-5 sm:flex-none"
            disabled={isSaving || options === undefined}
            onClick={save}
          >
            {isSaving ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SaveIcon data-icon="inline-start" />
            )}
            {productId ? "Gem ændringer" : "Opret produkt"}
          </Button>
        </div>
      </div>
    </div>
  );
}
