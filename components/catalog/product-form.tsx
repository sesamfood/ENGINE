"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeftIcon,
  ImageIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

function newKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
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
      label: option.archived ? `${option.name} — archived` : option.name,
    }),
  );

  const defaultRow = unitRows.find((row) => row.isDefault);
  const defaultUnitName = defaultRow
    ? (unitOptions.find((option) => option.value === defaultRow.unitValue)
        ?.label ??
      (defaultRow.unitValue?.startsWith("new:")
        ? defaultRow.unitValue.slice(4)
        : "default unit"))
    : "default unit";

  function unitName(row: UnitRow) {
    return (
      unitOptions.find((option) => option.value === row.unitValue)?.label ??
      (row.unitValue?.startsWith("new:")
        ? row.unitValue.slice(4)
        : "selected unit")
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
    if (!name.trim()) nextErrors.name = "Enter a product name";
    if (!categoryValue) nextErrors.category = "Choose or create a category";
    if (unitRows.length === 0) nextErrors.units = "Add at least one unit";
    if (unitRows.some((row) => !row.unitValue)) {
      nextErrors.units = "Choose a unit for every row";
    }
    if (
      unitRows.some(
        (row) =>
          !Number.isFinite(Number(row.factor)) || Number(row.factor) <= 0,
      )
    ) {
      nextErrors.units = "Every conversion must be greater than zero";
    }
    const unitKeys = unitRows.map((row) =>
      row.unitValue?.toLocaleLowerCase("en"),
    );
    if (new Set(unitKeys).size !== unitKeys.length) {
      nextErrors.units = "Each unit can only be added once";
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
        "Choose a product, quantity, and unit for every ingredient";
    }
    const ingredientIds = ingredientRows.map((row) => row.productId);
    if (new Set(ingredientIds).size !== ingredientIds.length) {
      nextErrors.ingredients = "Each ingredient can only be added once";
    }
    if (imageFile) {
      if (!IMAGE_TYPES.includes(imageFile.type)) {
        nextErrors.image = "Use a JPEG, PNG, WebP, or AVIF image";
      } else if (imageFile.size > MAX_IMAGE_SIZE) {
        nextErrors.image = "Image must be 10 MB or smaller";
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function uploadImage(savedProductId: Id<"products">) {
    if (!imageFile) return;
    const uploadUrl = await generateUploadUrl({});
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": imageFile.type },
      body: imageFile,
    });
    if (!response.ok) throw new Error("Picture upload failed");
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
        toast.error(`Product saved, but ${messageFrom(imageError)}`);
        router.push(`/organization/products/${savedProductId}`);
        return;
      }

      toast.success(productId ? "Product updated" : "Product created");
      router.push("/organization/products");
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
          <CardTitle>Product not found</CardTitle>
          <CardDescription>
            This product does not exist in the active organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/organization/products" className={buttonVariants()}>
            Back to products
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
          href="/organization/products"
          aria-label="Back to products"
          className={buttonVariants({ variant: "outline", size: "icon-lg" })}
        >
          <ArrowLeftIcon />
        </Link>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              {productId ? "Edit product" : "New product"}
            </h2>
            {product?.status === "archived" ? (
              <Badge variant="outline">Archived</Badge>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:items-start">
        <Card>
          <CardHeader>
            <CardTitle>Product details</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={Boolean(errors.name)}>
                <FieldLabel htmlFor="product-name">Name</FieldLabel>
                <Input
                  id="product-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Avocado"
                  className="h-11"
                  aria-invalid={Boolean(errors.name)}
                />
                <FieldError>{errors.name}</FieldError>
              </Field>

              <Field data-invalid={Boolean(errors.category)}>
                <FieldLabel>Category</FieldLabel>
                <CreatableCombobox
                  options={categoryOptions}
                  value={categoryValue}
                  onValueChange={setCategoryValue}
                  placeholder="Choose or create a category"
                  allowCreate
                  ariaLabel="Product category"
                />
                <FieldError>{errors.category}</FieldError>
              </Field>

              <Field data-invalid={Boolean(errors.image)}>
                <FieldLabel htmlFor="product-picture">Picture</FieldLabel>
                <div className="overflow-hidden rounded-xl border">
                  {shownImage ? (
                    <div
                      role="img"
                      aria-label="Product picture preview"
                      className="aspect-[4/3] w-full bg-muted bg-cover bg-center"
                      style={{ backgroundImage: `url("${shownImage}")` }}
                    />
                  ) : (
                    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 bg-muted text-muted-foreground">
                      <ImageIcon className="size-10" aria-hidden="true" />
                      <span className="text-sm">No picture selected</span>
                    </div>
                  )}
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
                        Remove
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
              <CardTitle>Units and conversions</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldSet>
                <FieldLegend className="sr-only">Product units</FieldLegend>
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
                          aria-label={`Make ${unitName(row)} the default unit`}
                        />
                        <FieldLabel htmlFor={`${row.key}-default`}>
                          Default
                        </FieldLabel>
                      </Field>
                      <Field className="md:self-center">
                        <FieldLabel className="sr-only">Unit</FieldLabel>
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
                          placeholder="Choose or create a unit"
                          allowCreate
                          ariaLabel="Product unit"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`${row.key}-factor`}>
                          {row.isDefault
                            ? "Conversion"
                            : `1 ${unitName(row)} equals`}
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
                          {row.isDefault ? "Base value" : defaultUnitName}
                        </FieldDescription>
                      </Field>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        className="md:mt-6"
                        aria-label={`Remove ${unitName(row)}`}
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
                  Add unit
                </Button>
              </FieldSet>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ingredients</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldSet>
                <FieldLegend className="sr-only">Ingredients</FieldLegend>
                <FieldGroup>
                  {ingredientRows.length === 0 ? (
                    <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                      This product has no ingredients yet.
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
                          <FieldLabel>Product</FieldLabel>
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
                            placeholder="Search products"
                            ariaLabel="Ingredient product"
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`${row.key}-quantity`}>
                            Quantity
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
                          <FieldLabel>Unit</FieldLabel>
                          <Select
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
                            <SelectTrigger className="h-11 w-full">
                              <SelectValue placeholder="Choose unit" />
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
                          aria-label="Remove ingredient"
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
                    Add ingredient
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
              Cancel
            </Button>
          ) : (
            <Link
              href="/organization/products"
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "min-h-11 flex-1 px-4 sm:flex-none",
              })}
            >
              Cancel
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
            {productId ? "Save changes" : "Create product"}
          </Button>
        </div>
      </div>
    </div>
  );
}
