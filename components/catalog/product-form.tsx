"use client";

import { useIntegrations } from "@/integrations/use-integrations";

import { OnlinePosMasterSelect } from "@/integrations/onlinepos/client";
import { GsSupplyProductLinkField } from "@/integrations/gssupply/client";

import { uploadToStorage } from "@/lib/upload-to-storage";
import { ExpiryField } from "@/components/catalog/expiry-field";
import { expiryError, type Expiry } from "@/lib/expiry";

import { useCompleteCatalog } from "@/hooks/use-complete-catalog";

import { getUserErrorMessage } from "@/lib/user-errors";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { formatMeasure, measureUnits } from "@/lib/containers";
import {
  checkUnitName,
  knownMeasure,
  normalizeUnitName,
  PRODUCT_TYPES,
  standardUnitFor,
  unitNameIssueMessage,
  type ProductType,
} from "@/lib/unit-system";
import {
  ArrowLeftIcon,
  ImageIcon,
  PackageOpenIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { compressImage, productImageOptions } from "@/lib/compress-image";
import { cn } from "@/lib/utils";
import { usePermission } from "@/components/app-shell";
import {
  OnlinePosProductSelect,
  useOnlinePosProductOptions,
} from "@/integrations/onlinepos/client";
import {
  CreatableCombobox,
  CreatableMultiCombobox,
  type ComboboxOption,
} from "@/components/catalog/creatable-combobox";
import {
  IngredientEditorRow,
  SortableIngredientList,
  validateIngredientRows,
  type IngredientDraft,
} from "@/components/catalog/ingredient-editor-row";
import { ProductImageCropDialog } from "@/components/catalog/product-image-crop-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  FieldTitle,
} from "@/components/ui/field";
import { Empty } from "@/components/ui/empty";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
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

import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type StandardUnit = FunctionReturnType<
  typeof api.catalog.listFormOptions
>["standardUnits"][number];

type UnitRow = {
  key: string;
  unitValue: string | null;
  factor: string;
  // Container preselected when this unit is counted.
  containerId: Id<"containers"> | null;
  isDefault: boolean;
  // Set for the locked standard units of the product type.
  standard: StandardUnit | null;
};

type IngredientRow = IngredientDraft & { removable: boolean };

type AddableIngredientRow = IngredientDraft;

type ProductOption = {
  id: Id<"products">;
  name: string;
  categoryPath?: string;
  archived?: boolean;
  defaultUnitName?: string;
  units: Array<{ id: Id<"units">; name: string }>;
};

type OnlinePosProduct = {
  id: number;
  name: string;
  groupName: string;
};

type ProductMapping = {
  onlinePosProductId: number | null;
};


const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MIN_MAX_TEMPERATURE_CELSIUS = -100;
const MAX_MAX_TEMPERATURE_CELSIUS = 100;
const MAX_TEMPERATURE_INPUT = /^-?(?:\d+(?:[.,]\d{0,1})?|[.,]\d)$/;
const SALES_PRICE_INPUT = /^(?:\d+(?:[.,]\d{0,2})?|[.,]\d{1,2})$/;
const FACTOR_INPUT = /^(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i;

function newKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function parseReference(value: string) {
  if (value.startsWith("new:")) {
    return { kind: "new" as const, name: value.slice(4) };
  }
  return { kind: "existing" as const, id: value.split(":")[1] };
}

function factorInputValue(value: number) {
  return value.toString().replace(".", ",");
}

function formatFactor(value: number) {
  return factorInputValue(Number(value.toPrecision(10)));
}

function parseFactor(value: string) {
  const normalized = value.trim();
  if (!FACTOR_INPUT.test(normalized)) return Number.NaN;
  return Number(normalized.replace(",", "."));
}

function rebaseFactor(value: string, divisor: number) {
  const factor = parseFactor(value);
  return Number.isFinite(factor) &&
    factor > 0 &&
    Number.isFinite(divisor) &&
    divisor > 0
    ? formatFactor(factor / divisor)
    : value;
}

function unitValueName(
  value: string | null,
  units: Array<{ id: Id<"units">; name: string }>,
) {
  if (value?.startsWith("new:")) return value.slice(4);
  return units.find((unit) => `existing:${unit.id}` === value)?.name ?? null;
}

// Swaps in the standard unit rows for a type and keeps custom rows.
function withStandardRows(
  rows: UnitRow[],
  type: ProductType,
  options: FunctionReturnType<typeof api.catalog.listFormOptions>,
  // New standard units per old default unit. With it, every old unit stays
  // with a converted factor, so stock, recipes and sales keep a bridge.
  conversion?: number,
): UnitRow[] {
  const matched = new Map<string, StandardUnit>();
  const standardRows = options.standardUnits
    .filter((unit) => unit.productType === type)
    .map((unit): UnitRow => {
      const match = rows.find(
        (row) =>
          !matched.has(row.key) &&
          ((unit.unitId !== null && row.unitValue === `existing:${unit.unitId}`) ||
            normalizeUnitName(unitValueName(row.unitValue, options.units) ?? "") ===
              normalizeUnitName(unit.name)),
      );
      if (match) matched.set(match.key, unit);
      return {
        key: match?.key ?? newKey("unit"),
        unitValue:
          match?.unitValue ??
          (unit.unitId !== null ? `existing:${unit.unitId}` : `new:${unit.name}`),
        factor: factorInputValue(unit.factorToStandard),
        containerId: match?.containerId ?? null,
        isDefault: unit.isStandard,
        standard: unit,
      };
    });
  // Custom factors follow the old default when it becomes a standard unit.
  const oldDefault = rows.find((row) => row.isDefault);
  const scale =
    conversion ??
    (oldDefault ? matched.get(oldDefault.key)?.factorToStandard : undefined);
  const customRows = rows
    .filter(
      (row) =>
        !matched.has(row.key) &&
        (row.standard === null || conversion !== undefined),
    )
    .map((row) => {
      const factor = row.isDefault ? 1 : parseFactor(row.factor);
      return {
        ...row,
        isDefault: false,
        standard: null,
        factor:
          scale !== undefined && Number.isFinite(factor) && factor > 0
            ? formatFactor(factor * scale)
            : row.isDefault
              ? ""
              : row.factor,
      };
    });
  return [...standardRows, ...customRows];
}

function maxTemperatureError(value: string) {
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (!MAX_TEMPERATURE_INPUT.test(normalized)) {
    return "Angiv en temperatur med højst én decimal";
  }
  const temperature = Number(normalized.replace(",", "."));
  if (
    !Number.isFinite(temperature) ||
    temperature < MIN_MAX_TEMPERATURE_CELSIUS ||
    temperature > MAX_MAX_TEMPERATURE_CELSIUS
  ) {
    return "Temperaturen skal være mellem -100,0 og 100,0 °C";
  }
  if (!Number.isInteger(temperature * 10)) {
    return "Angiv en temperatur med højst én decimal";
  }
  return undefined;
}

function productImageError(file: File) {
  if (!IMAGE_TYPES.includes(file.type)) {
    return "Brug et billede i JPEG-, PNG-, WebP- eller AVIF-format";
  }
  if (file.size > MAX_IMAGE_SIZE) return "Billedet må højst være 10 MB";
  return undefined;
}

function parseSalesPrice(value: string) {
  const normalized = value.trim();
  return normalized
    ? Math.round(Number(normalized.replace(",", ".")) * 100)
    : null;
}

function parseMaxTemperature(value: string) {
  const normalized = value.trim();
  return normalized ? Number(normalized.replace(",", ".")) : null;
}

function OnlinePosProductMappingField({
  productId,
  integrationId,
  productName,
  mapping,
  onlinePosProducts,
  onRetry,
}: {
  productId: Id<"products">;
  integrationId: Id<"onlinePosIntegrations"> | undefined;
  productName: string;
  mapping: ProductMapping | null | undefined;
  onlinePosProducts: OnlinePosProduct[] | null | undefined;
  onRetry: () => void;
}) {
  const setProductMapping = useAction(api.onlinePos.setProductMapping);
  const [saving, setSaving] = useState(false);

  const currentMapping = mapping?.onlinePosProductId;
  const options = useOnlinePosProductOptions(onlinePosProducts);

  async function changeMapping(value: number | null) {
    setSaving(true);
    try {
      await setProductMapping({
        productId,
        integrationId,
        onlinePosProductId: value,
      });
      toast.success(
        value === null
          ? "OnlinePOS-koblingen er fjernet"
          : "OnlinePOS-koblingen er gemt",
      );
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "OnlinePOS-koblingen kunne ikke gemmes. Prøv igen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  if (!mapping) return null;

  return (
    <Field>
      <div className="flex items-center gap-2">
        <FieldLabel>OnlinePOS-produkt</FieldLabel>
        <HelpTooltip
          label="OnlinePOS-produkt"
          content="Koblingen gemmes med det samme."
        />
      </div>
      <OnlinePosProductSelect
        options={options}
        productName={productName}
        value={currentMapping ?? null}
        onValueChange={(value) => void changeMapping(value)}
        ariaLabel={`OnlinePOS-produkt for ${productName}`}
        onRetry={onRetry}
        disabled={saving}
      />
    </Field>
  );
}

function FormLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-6 xl:grid-cols-(--grid-cols-product-details)">
        <Skeleton className="h-136 w-full" />
        <Skeleton className="h-136 w-full" />
      </div>
    </div>
  );
}

export function ProductForm({ productId }: { productId?: Id<"products"> }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const integrations = useIntegrations();
  const canManageIntegrations = usePermission("integrations.manage") && integrations?.onlinepos === true;
  const masterSettings = useQuery(
    api.onlinePos.getSettings,
    canManageIntegrations ? {} : "skip",
  );
  const [selectedMasterId, setSelectedMasterId] =
    useState<Id<"onlinePosIntegrations"> | null>(null);
  const selectedMaster =
    masterSettings?.masters.find((master) => master.id === selectedMasterId) ??
    masterSettings?.masters[0];
  const integrationId = selectedMaster?.id;
  const returnHref = useMemo(() => {
    const params = new URLSearchParams();
    const search = searchParams.get("search");
    const status = searchParams.get("status");
    if (search) params.set("search", search);
    params.set("status", status === "archived" ? "archived" : "active");
    return `/administration/products?${params.toString()}`;
  }, [searchParams]);
  const returnQuery = returnHref.slice("/administration/products".length);
  const product = useQuery(
    api.catalog.getProduct,
    productId ? { productId } : "skip",
  );
  const productMapping = useQuery(
    api.onlinePos.getProductMapping,
    canManageIntegrations && productId && product
      ? { productId, integrationId }
      : "skip",
  );
  const ingredientRemovalSettings = useQuery(
    api.onlinePos.getIngredientRemovalSettings,
    canManageIntegrations
      ? productId === undefined
        ? { integrationId }
        : product === undefined || product === null
          ? "skip"
          : { productId, integrationId }
      : "skip",
  );
  const ingredientAdditionSettings = useQuery(
    api.onlinePos.getIngredientAdditionSettings,
    canManageIntegrations
      ? productId === undefined
        ? { integrationId }
        : product === undefined || product === null
          ? "skip"
          : { productId, integrationId }
      : "skip",
  );
  const onlinePosSettingsReady =
    integrations !== undefined && (!canManageIntegrations ||
    (ingredientRemovalSettings !== undefined &&
      ingredientAdditionSettings !== undefined &&
      ingredientRemovalSettings.integrationId ===
        ingredientAdditionSettings.integrationId));
  const onlinePosIntegrationId =
    canManageIntegrations && onlinePosSettingsReady
      ? ingredientRemovalSettings?.integrationId
      : undefined;
  const options = useQuery(api.catalog.listFormOptions);
  const containers = useQuery(api.containers.list);
  const catalogSettings = useQuery(api.catalog.getSettings);
  const createProduct = useMutation(api.catalog.createProduct);
  const updateProduct = useMutation(api.catalog.updateProduct);
  const setIngredientRemovalMappings = useAction(
    api.onlinePos.setIngredientRemovalMappings,
  );
  const setIngredientAdditionMappings = useAction(
    api.onlinePos.setIngredientAdditionMappings,
  );
  const generateUploadUrl = useMutation(
    api.catalog.generateProductImageUploadUrl,
  );
  const setProductImage = useMutation(api.catalog.setProductImage);
  const removeProductImage = useMutation(api.catalog.removeProductImage);
  const initializedProduct = useRef<string | null>(null);
  const initializedOnlinePosIntegrationId = useRef<
    Id<"onlinePosIntegrations"> | null | undefined
  >(undefined);
  const [name, setName] = useState("");
  const [maxTemperatureCelsius, setMaxTemperatureCelsius] = useState("");
  const [salesPrice, setSalesPrice] = useState("");
  const [expiryValue, setExpiryValue] = useState("");
  const [expiryUnit, setExpiryUnit] = useState<Expiry["unit"]>("days");
  const [categoryValues, setCategoryValues] = useState<string[]>([]);
  const [productType, setProductType] = useState<ProductType | null>(null);
  const [savedProductType, setSavedProductType] = useState<ProductType | null>(
    null,
  );
  // Units as they were before leaving the saved type, restored on the way back.
  const [savedTypeUnits, setSavedTypeUnits] = useState<{
    rows: UnitRow[];
    yieldUnitKey: string | null;
    yieldQuantity: string;
  } | null>(null);
  const [pendingType, setPendingType] = useState<ProductType | null>(null);
  const [pendingConversion, setPendingConversion] = useState("");
  const [unitRows, setUnitRows] = useState<UnitRow[]>([]);
  // Text typed into each unit combobox, for the unit name warning.
  const [typedUnitNames, setTypedUnitNames] = useState<
    Record<string, string>
  >({});
  const [ingredientRows, setIngredientRows] = useState<IngredientRow[]>([]);
  const [packagingRows, setPackagingRows] = useState<IngredientDraft[]>([]);
  const hasRecipe = ingredientRows.length > 0 || packagingRows.length > 0;
  const [yieldQuantity, setYieldQuantity] = useState("1");
  // Unit row key; falls back to the default unit when missing.
  const [yieldUnitKey, setYieldUnitKey] = useState<string | null>(null);
  const [addableIngredientRows, setAddableIngredientRows] = useState<
    AddableIngredientRow[]
  >([]);
  const catalog = useCompleteCatalog(
    api.catalog.listActiveProductsPage,
    hasRecipe || addableIngredientRows.length > 0
      ? {}
      : "skip",
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  // Set when removing the old default unit leaves stock or recipes unconverted.
  const [unconverted, setUnconverted] = useState<"stock" | "recipes" | null>(
    null,
  );
  const listProducts = useAction(api.onlinePos.listProducts);
  const [onlinePosProducts, setOnlinePosProducts] = useState<
    OnlinePosProduct[] | null
  >();
  const onlinePosOptions = useOnlinePosProductOptions(onlinePosProducts);

  useEffect(() => {
    if (
      !productId ||
      !product ||
      !options ||
      initializedProduct.current === productId ||
      !onlinePosSettingsReady
    ) {
      return;
    }
    initializedProduct.current = productId;
    setName(product.name);
    setExpiryValue(product.expiry?.value.toString() ?? "");
    setExpiryUnit(product.expiry?.unit ?? "days");
    setMaxTemperatureCelsius(
      product.maxTemperatureCelsius?.toString() ?? "",
    );
    setSalesPrice(
      product.salesPrice === null
        ? ""
        : (product.salesPrice / 100).toFixed(2).replace(".", ","),
    );
    setCategoryValues(
      product.categories.map((category) => `existing:${category.id}`),
    );
    const loadedUnitRows = product.units.map((unit) => ({
      key: `unit-${unit.id}`,
      unitValue: `existing:${unit.id}`,
      factor: factorInputValue(unit.factorToDefault),
      containerId: unit.containerId,
      isDefault: unit.isDefault,
      standard: null,
    }));
    setProductType(product.productType);
    setSavedProductType(product.productType);
    setSavedTypeUnits(null);
    setUnitRows(
      product.productType
        ? withStandardRows(loadedUnitRows, product.productType, options)
        : loadedUnitRows,
    );
    setYieldQuantity(product.recipeYield?.quantity.toString() ?? "1");
    setYieldUnitKey(
      product.recipeYield ? `unit-${product.recipeYield.unitId}` : null,
    );
    setPackagingRows(
      product.ingredients
        .filter((ingredient) => ingredient.packaging)
        .map((ingredient) => ({
          key: `packaging-${ingredient.productId}`,
          productId: ingredient.productId,
          quantity: ingredient.quantity.toString(),
          unitId: ingredient.unitId,
          onlinePosProductId: null,
        })),
    );
    setIngredientRows(
      product.ingredients
        .filter((ingredient) => !ingredient.packaging)
        .map((ingredient) => ({
        key: `ingredient-${ingredient.productId}`,
        productId: ingredient.productId,
        quantity: ingredient.quantity.toString(),
        unitId: ingredient.unitId,
        removable: ingredient.removable,
        onlinePosProductId:
          ingredientRemovalSettings?.mappings.find(
            (mapping) => mapping.ingredientProductId === ingredient.productId,
          )?.onlinePosProductId ?? null,
      })),
    );
    setAddableIngredientRows(
      product.addableIngredients.map((ingredient) => ({
        key: `addable-ingredient-${ingredient.productId}`,
        productId: ingredient.productId,
        quantity: ingredient.quantity?.toString() ?? "",
        unitId: ingredient.unitId,
        onlinePosProductId:
          ingredientAdditionSettings?.mappings.find(
            (mapping) => mapping.ingredientProductId === ingredient.productId,
          )?.onlinePosProductId ?? null,
      })),
    );
    initializedOnlinePosIntegrationId.current = onlinePosIntegrationId;
  }, [
    canManageIntegrations,
    ingredientAdditionSettings,
    ingredientRemovalSettings,
    onlinePosIntegrationId,
    onlinePosSettingsReady,
    options,
    product,
    productId,
  ]);

  useEffect(() => {
    if (
      !canManageIntegrations ||
      !onlinePosSettingsReady ||
      onlinePosIntegrationId === undefined
    ) {
      return;
    }
    if (initializedOnlinePosIntegrationId.current === undefined) {
      initializedOnlinePosIntegrationId.current = onlinePosIntegrationId;
      return;
    }
    if (
      initializedOnlinePosIntegrationId.current === onlinePosIntegrationId
    ) {
      return;
    }

    initializedOnlinePosIntegrationId.current = onlinePosIntegrationId;
    setOnlinePosProducts(undefined);
    setIngredientRows((current) =>
      current.map((row) => ({
        ...row,
        onlinePosProductId:
          ingredientRemovalSettings?.mappings.find(
            (mapping) => mapping.ingredientProductId === row.productId,
          )?.onlinePosProductId ?? null,
      })),
    );
    setAddableIngredientRows((current) =>
      current.map((row) => ({
        ...row,
        onlinePosProductId:
          ingredientAdditionSettings?.mappings.find(
            (mapping) => mapping.ingredientProductId === row.productId,
          )?.onlinePosProductId ?? null,
      })),
    );
  }, [
    canManageIntegrations,
    ingredientAdditionSettings,
    ingredientRemovalSettings,
    onlinePosIntegrationId,
    onlinePosSettingsReady,
  ]);

  const shouldLoadOnlinePosProducts =
    canManageIntegrations &&
    onlinePosSettingsReady &&
    ((productMapping !== undefined && productMapping !== null) ||
      (ingredientRemovalSettings?.enabled === true &&
        ingredientRows.some((row) => row.removable)) ||
      (ingredientAdditionSettings?.enabled === true &&
        addableIngredientRows.some((row) => row.productId !== null)));

  useEffect(() => {
    if (!shouldLoadOnlinePosProducts || onlinePosProducts !== undefined) return;
    let active = true;
    void listProducts({ integrationId })
      .then((products) => {
        if (active) setOnlinePosProducts(products);
      })
      .catch(() => {
        if (active) setOnlinePosProducts(null);
      });
    return () => {
      active = false;
    };
  }, [
    integrationId,
    listProducts,
    onlinePosProducts,
    shouldLoadOnlinePosProducts,
  ]);

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
  // The type's standard units are always on the product, so leave them out.
  const standardUnitValues = new Set(
    options?.standardUnits.flatMap((unit) =>
      unit.productType === productType && unit.unitId
        ? [`existing:${unit.unitId}`]
        : [],
    ),
  );
  const customUnitOptions = unitOptions.filter(
    (option) => !standardUnitValues.has(option.value),
  );
  const activeContainers =
    containers?.filter((container) => container.status === "active") ?? [];
  const weightUnits = measureUnits("dry", options?.unitSystem);

  // Containers offered as units, filtered by the text typed in the row.
  function containerUnitOptions(typed: string | undefined): ComboboxOption[] {
    const query = typed?.trim().toLocaleLowerCase("da") ?? "";
    return activeContainers
      .filter((container) =>
        container.name.toLocaleLowerCase("da").includes(query),
      )
      .map((container) => ({
        value: `container:${container.id}`,
        label: container.name,
      }));
  }

  // A container picked as a unit becomes a unit with its name.
  function unitSelection(value: string | null) {
    const container = value?.startsWith("container:")
      ? activeContainers.find((item) => `container:${item.id}` === value)
      : undefined;
    if (!container) return { unitValue: value, containerId: null };
    const unit = options?.units.find(
      (item) => normalizeUnitName(item.name) === normalizeUnitName(container.name),
    );
    return {
      unitValue: unit ? `existing:${unit.id}` : `new:${container.name}`,
      containerId: container.id,
    };
  }

  const activeProductOptions = useMemo<ProductOption[]>(
    () =>
      catalog
        ?.filter((option) => option.id !== productId)
        .map((option) => ({
          id: option.id,
          name: option.name,
          categoryPath: option.categories
            .map((category) => category.path)
            .join(" · "),
          defaultUnitName: option.units.find(
            (unit) => unit.id === option.defaultUnitId,
          )?.name,
          units: option.units.map((unit) => ({ id: unit.id, name: unit.name })),
        })) ?? [],
    [catalog, productId],
  );

  const recipeProductOptions = useMemo<ProductOption[]>(() => {
    const available = [...activeProductOptions];
    if (!product) return available;

    for (const ingredient of product.ingredients) {
      if (available.some((option) => option.id === ingredient.productId)) {
        continue;
      }
      available.push({
        id: ingredient.productId,
        name: ingredient.productName,
        archived: ingredient.productStatus === "archived",
        units: [{ id: ingredient.unitId, name: ingredient.unitName }],
      });
    }
    return available;
  }, [activeProductOptions, product]);

  const addableProductOptions = useMemo<ProductOption[]>(() => {
    const available = [...activeProductOptions];
    if (!product) return available;

    for (const ingredient of product.addableIngredients) {
      if (available.some((option) => option.id === ingredient.productId)) {
        continue;
      }
      available.push({
        id: ingredient.productId,
        name: ingredient.productName,
        archived: ingredient.productStatus === "archived",
        units:
          ingredient.unitId !== null && ingredient.unitName !== null
            ? [{ id: ingredient.unitId, name: ingredient.unitName }]
            : [],
      });
    }
    return available;
  }, [activeProductOptions, product]);

  const recipeProductComboboxOptions: ComboboxOption[] =
    recipeProductOptions.map((option) => ({
      value: option.id,
      searchName: option.name,
      searchText: option.categoryPath,
      label: [
        option.name,
        option.categoryPath,
        option.archived ? "arkiveret" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    }));
  const addableProductComboboxOptions: ComboboxOption[] =
    addableProductOptions.map((option) => ({
      value: option.id,
      searchName: option.name,
      searchText: option.categoryPath,
      label: [
        option.name,
        option.categoryPath,
        option.archived ? "arkiveret" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    }));

  const defaultRow = unitRows.find((row) => row.isDefault);
  const defaultUnitName = defaultRow
    ? (unitOptions.find((option) => option.value === defaultRow.unitValue)
        ?.label ??
      (defaultRow.unitValue?.startsWith("new:")
        ? defaultRow.unitValue.slice(4)
        : "standardenhed"))
    : "standardenhed";

  const yieldUnitRow =
    unitRows.find((row) => row.key === yieldUnitKey) ?? defaultRow;

  function unitName(row: UnitRow) {
    return (
      unitOptions.find((option) => option.value === row.unitValue)?.label ??
      (row.unitValue?.startsWith("new:")
        ? row.unitValue.slice(4)
        : "valgt enhed")
    );
  }

  // Not-full containers can only be counted in products with a weight unit.
  const hasWeightUnit = unitRows.some(
    (row) => knownMeasure(unitName(row))?.type === "dry",
  );

  function containerDescription(containerId: Id<"containers">) {
    const container = containers?.find((item) => item.id === containerId);
    if (!container) return "Beholder";
    const text = `Beholder · vejer ${formatMeasure(container.weightGrams, weightUnits)}${container.status === "archived" ? " · arkiveret" : ""}`;
    return hasWeightUnit
      ? text
      : `${text}. Tilføj en vægtenhed, så ikke fulde beholdere kan vejes ved Count.`;
  }

  function changeProductType(type: ProductType) {
    if (!options || type === productType) return;
    if (savedTypeUnits && type === savedProductType) {
      setProductType(type);
      setUnitRows(savedTypeUnits.rows);
      setYieldUnitKey(savedTypeUnits.yieldUnitKey);
      setYieldQuantity(savedTypeUnits.yieldQuantity);
      setSavedTypeUnits(null);
      return;
    }
    const oldDefault = unitRows.find((row) => row.isDefault);
    const oldDefaultName = oldDefault
      ? unitValueName(oldDefault.unitValue, options.units)
      : null;
    const defaultIsStandard =
      oldDefaultName !== null &&
      options.standardUnits.some(
        (unit) =>
          unit.productType === type &&
          normalizeUnitName(unit.name) === normalizeUnitName(oldDefaultName),
      );
    const needsConversion = productType
      ? productId !== undefined ||
        unitRows.some((row) => row.standard === null && row.unitValue)
      : productId !== undefined && oldDefaultName !== null && !defaultIsStandard;
    if (needsConversion) {
      setPendingConversion("");
      setPendingType(type);
      return;
    }
    applyProductType(type);
  }

  // conversion: new standard units per current default unit.
  function applyProductType(type: ProductType, conversion?: number) {
    if (!options) return;
    if (productId && productType === savedProductType && !savedTypeUnits) {
      setSavedTypeUnits({ rows: unitRows, yieldUnitKey, yieldQuantity });
    }
    setProductType(type);
    setUnitRows(withStandardRows(unitRows, type, options, conversion));
    // The implicit yield of one default unit stays one old default unit.
    if (conversion !== undefined && yieldUnitKey === null) {
      setYieldUnitKey(unitRows.find((row) => row.isDefault)?.key ?? null);
    }
  }

  // value: what the user entered in the conversion dialog, or null to skip.
  function confirmProductType(value: number | null) {
    if (!pendingType) return;
    const type = pendingType;
    setPendingType(null);
    // Typed products enter "1 new standard = X old standard", untyped ones
    // "1 old default = X new standard".
    applyProductType(
      type,
      value === null ? undefined : productType ? 1 / value : value,
    );
  }

  function newUnitNameIssue(row: UnitRow, name: string | undefined) {
    if (!name || !productType || row.standard || !options) return null;
    return checkUnitName(name, productType, options.unitSystem);
  }

  function newUnitName(row: UnitRow) {
    return row.unitValue?.startsWith("new:") ? row.unitValue.slice(4) : undefined;
  }

  function addUnit() {
    setUnitRows((current) => [
      ...current,
      {
        key: newKey("unit"),
        unitValue: null,
        factor: "",
        containerId: null,
        isDefault: false,
        standard: null,
      },
    ]);
  }

  function removeUnit(key: string) {
    setUnitRows((current) => {
      const removed = current.find((row) => row.key === key);
      const remaining = current.filter((row) => row.key !== key);
      if (removed?.isDefault && remaining[0]) {
        const divisor = parseFactor(remaining[0].factor);
        return remaining.map((row, index) => ({
          ...row,
          isDefault: index === 0,
          factor: index === 0 ? "1" : rebaseFactor(row.factor, divisor),
        }));
      }
      return remaining;
    });
  }

  function recipeRowLabel(row: IngredientDraft, fallback: string) {
    return (
      recipeProductOptions.find((option) => option.id === row.productId)
        ?.name ?? fallback
    );
  }

  function addIngredient() {
    setIngredientRows((current) => [
      ...current,
      {
        key: newKey("ingredient"),
        productId: null,
        quantity: "",
        unitId: null,
        removable: false,
        onlinePosProductId: null,
      },
    ]);
  }

  function addPackaging() {
    setPackagingRows((current) => [
      ...current,
      {
        key: newKey("packaging"),
        productId: null,
        quantity: "",
        unitId: null,
        onlinePosProductId: null,
      },
    ]);
  }

  function addAddableIngredient() {
    setAddableIngredientRows((current) => [
      ...current,
      {
        key: newKey("addable-ingredient"),
        productId: null,
        quantity: "",
        unitId: null,
        onlinePosProductId: null,
      },
    ]);
  }

  function validate() {
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = "Indtast et produktnavn";
    if (expiryValue.trim()) {
      const error = expiryError({ value: Number(expiryValue), unit: expiryUnit });
      if (error) nextErrors.expiry = error;
    }
    const temperatureError = maxTemperatureError(maxTemperatureCelsius);
    if (temperatureError) {
      nextErrors.maxTemperatureCelsius = temperatureError;
    }
    if (salesPrice.trim() && !SALES_PRICE_INPUT.test(salesPrice.trim())) {
      nextErrors.salesPrice = "Angiv et beløb med højst to decimaler";
    }
    if (categoryValues.length === 0) {
      nextErrors.category = "Vælg eller opret mindst én kategori";
    }
    if (unitRows.length === 0) nextErrors.units = "Tilføj mindst én enhed";
    if (unitRows.some((row) => !row.unitValue)) {
      nextErrors.units = "Vælg en enhed for hver række";
    }
    if (
      unitRows.some(
        (row) => {
          const factor = parseFactor(row.factor);
          return !Number.isFinite(factor) || factor <= 0;
        },
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
    for (const row of unitRows) {
      const issue = newUnitNameIssue(row, newUnitName(row));
      if (issue) nextErrors.units = unitNameIssueMessage(issue);
    }
    if (!productType) {
      nextErrors.units = "Vælg produkttypen, før du tilføjer enheder";
    }
    validateIngredientRows([...ingredientRows, ...packagingRows], nextErrors);
    const yieldValue = Number(yieldQuantity);
    if (
      hasRecipe &&
      (!Number.isFinite(yieldValue) || yieldValue <= 0)
    ) {
      nextErrors.recipeYield = "Indtast et udbytte større end nul";
    }
    validateIngredientRows(addableIngredientRows, nextErrors);
    if (imageFile) {
      const imageError = productImageError(imageFile);
      if (imageError) nextErrors.image = imageError;
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function uploadImage(savedProductId: Id<"products">) {
    if (!imageFile) return;
    const image = await compressImage(imageFile, productImageOptions);
    const storageId = await uploadToStorage({
      uploadUrl: await generateUploadUrl({}),
      file: image,
    });
    await setProductImage({
      productId: savedProductId,
      storageId,
    });
  }

  async function save(unconvertedStock?: "keep" | "reset") {
    if (!validate()) {
      toast.error("Produktet kunne ikke gemmes. Ret de markerede felter.");
      // Errors may sit far below the visible part of the form.
      requestAnimationFrame(() =>
        document
          .querySelector('[data-invalid="true"]')
          ?.scrollIntoView({ block: "center", behavior: "smooth" }),
      );
      return;
    }
    setIsSaving(true);

    const categories = categoryValues.map((value) => {
      const category = parseReference(value);
      return category.kind === "existing"
        ? { kind: "existing" as const, id: category.id as Id<"categories"> }
        : category;
    });
    const units = unitRows.map((row) => ({
      unit: parseReference(row.unitValue!),
      factorToDefault: parseFactor(row.factor),
      containerId: row.containerId,
      isDefault: row.isDefault,
    }));
    const ingredients = [
      ...ingredientRows.map((row) => ({ ...row, packaging: false })),
      ...packagingRows.map((row) => ({
        ...row,
        removable: false,
        packaging: true,
      })),
    ].flatMap((row) =>
      row.productId !== null && row.unitId !== null
        ? [
            {
              productId: row.productId,
              quantity: Number(row.quantity),
              unitId: row.unitId,
              removable: row.removable,
              packaging: row.packaging,
            },
          ]
        : [],
    );
    const yieldUnit =
      ingredients.length > 0 && yieldUnitRow?.unitValue
        ? parseReference(yieldUnitRow.unitValue)
        : null;
    const recipeYield =
      yieldUnit &&
      (Number(yieldQuantity) !== 1 || !yieldUnitRow?.isDefault)
        ? {
            quantity: Number(yieldQuantity),
            unit:
              yieldUnit.kind === "existing"
                ? { kind: "existing" as const, id: yieldUnit.id as Id<"units"> }
                : yieldUnit,
          }
        : null;
    const addableIngredients = addableIngredientRows.flatMap((row) =>
      row.productId !== null && row.unitId !== null
        ? [
            {
              productId: row.productId,
              quantity: Number(row.quantity),
              unitId: row.unitId,
            },
          ]
        : [],
    );

    try {
      const savedProductId = productId
        ? await updateProduct({
            productId,
            name,
            categories,
            units: units.map((row) => ({
              ...row,
              unit:
                row.unit.kind === "existing"
                  ? { kind: "existing", id: row.unit.id as Id<"units"> }
                  : row.unit,
            })),
            ingredients,
            recipeYield,
            addableIngredients,
            maxTemperatureCelsius: parseMaxTemperature(maxTemperatureCelsius),
            salesPrice: parseSalesPrice(salesPrice),
            expiry: expiryValue.trim()
              ? { value: Number(expiryValue), unit: expiryUnit }
              : null,
            productType: productType ?? undefined,
            unconvertedStock,
          })
        : await createProduct({
            name,
            categories,
            units: units.map((row) => ({
              ...row,
              unit:
                row.unit.kind === "existing"
                  ? { kind: "existing", id: row.unit.id as Id<"units"> }
                  : row.unit,
            })),
            ingredients,
            recipeYield,
            addableIngredients,
            maxTemperatureCelsius: parseMaxTemperature(maxTemperatureCelsius),
            salesPrice: parseSalesPrice(salesPrice),
            expiry: expiryValue.trim()
              ? { value: Number(expiryValue), unit: expiryUnit }
              : null,
            productType: productType ?? undefined,
          });

      let imageError: unknown;
      try {
        if (imageFile) await uploadImage(savedProductId);
        else if (productId && removeExistingImage) {
          await removeProductImage({ productId });
        }
      } catch (caughtImageError) {
        imageError = caughtImageError;
      }

      let ingredientRemovalError: unknown;
      if (
        canManageIntegrations &&
        ingredientRemovalSettings?.enabled === true &&
        onlinePosIntegrationId
      ) {
        const mappings = ingredientRows.flatMap((row) =>
          row.removable &&
          row.productId !== null &&
          row.onlinePosProductId !== null
            ? [
                {
                  ingredientProductId: row.productId,
                  onlinePosProductId: row.onlinePosProductId,
                },
              ]
            : [],
        );
        try {
          await setIngredientRemovalMappings({
            productId: savedProductId,
            expectedIntegrationId: onlinePosIntegrationId,
            mappings,
          });
        } catch (caughtIngredientRemovalError) {
          ingredientRemovalError = caughtIngredientRemovalError;
        }
      }

      let ingredientAdditionError: unknown;
      if (
        canManageIntegrations &&
        ingredientAdditionSettings?.enabled === true &&
        onlinePosIntegrationId
      ) {
        const mappings = addableIngredientRows.flatMap((row) =>
          row.productId !== null && row.onlinePosProductId !== null
            ? [
                {
                  ingredientProductId: row.productId,
                  onlinePosProductId: row.onlinePosProductId,
                },
              ]
            : [],
        );
        try {
          await setIngredientAdditionMappings({
            productId: savedProductId,
            expectedIntegrationId: onlinePosIntegrationId,
            mappings,
          });
        } catch (caughtIngredientAdditionError) {
          ingredientAdditionError = caughtIngredientAdditionError;
        }
      }

      if (imageError || ingredientRemovalError || ingredientAdditionError) {
        const ingredientMappingError =
          ingredientRemovalError ?? ingredientAdditionError;
        const messages = [
          imageError
            ? getUserErrorMessage(
                imageError,
                "Billedet kunne ikke opdateres. Prøv igen.",
              )
            : null,
          ingredientMappingError
            ? getUserErrorMessage(
                ingredientMappingError,
                "OnlinePOS-koblingerne kunne ikke gemmes. Prøv igen.",
              )
            : null,
        ].filter((message): message is string => message !== null);
        toast.error(`Produktet blev gemt. ${messages.join(" ")}`);
        router.push(`/administration/products/${savedProductId}${returnQuery}`);
        return;
      }

      toast.success(
        productId ? "Produktet er opdateret" : "Produktet er oprettet",
      );
      router.push(returnHref);
    } catch (caught) {
      if (caught instanceof ConvexError) {
        if (
          caught.data ===
          "Den tidligere standardenhed skal beholdes for at omregne lageret"
        ) {
          setUnconverted("stock");
          return;
        }
        if (
          caught.data ===
          "Behold mindst én af de tidligere enheder for at omregne opskrifter, der bruger produktet"
        ) {
          setUnconverted("recipes");
          return;
        }
      }
      toast.error(getUserErrorMessage(caught, "Produktet kunne ikke gemmes. Prøv igen."));
    } finally {
      setIsSaving(false);
    }
  }

  if (
    productId &&
    (product === undefined ||
      (product !== null && (!onlinePosSettingsReady || options === undefined)))
  ) {
    return <FormLoading />;
  }
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
              {productId ? "Redigér produkt" : "Nyt produkt"}
            </h2>
            {product?.status === "archived" ? (
              <Badge variant="outline">Arkiveret</Badge>
            ) : null}
          </div>
        </div>
      </div>

      {canManageIntegrations &&
      masterSettings &&
      masterSettings.masters.length > 0 ? (
        <OnlinePosMasterSelect
          masters={masterSettings.masters}
          value={integrationId ?? null}
          onValueChange={setSelectedMasterId}
          disabled={isSaving || !onlinePosSettingsReady}
        />
      ) : null}
      <div className="grid gap-6 xl:items-start xl:grid-cols-(--grid-cols-product-details)">
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
                <FieldLabel>Kategorier</FieldLabel>
                <CreatableMultiCombobox
                  options={categoryOptions}
                  values={categoryValues}
                  onValuesChange={setCategoryValues}
                  placeholder="Vælg eller opret kategorier"
                  allowCreate
                  ariaLabel="Produktkategorier"
                />
                <FieldError>{errors.category}</FieldError>
              </Field>

              <Field
                className="max-w-xl"
                data-invalid={Boolean(errors.maxTemperatureCelsius)}
              >
                <FieldLabel htmlFor="product-max-temperature">
                  Maksimal temperatur
                </FieldLabel>
                <InputGroup className="h-11 max-w-xs">
                  <InputGroupInput
                    id="product-max-temperature"
                    type="number"
                    inputMode="decimal"
                    min={MIN_MAX_TEMPERATURE_CELSIUS}
                    max={MAX_MAX_TEMPERATURE_CELSIUS}
                    step="0.1"
                    value={maxTemperatureCelsius}
                    onChange={(event) =>
                      setMaxTemperatureCelsius(event.target.value)
                    }
                    aria-invalid={Boolean(errors.maxTemperatureCelsius)}
                  />
                  <InputGroupAddon align="inline-end">°C</InputGroupAddon>
                </InputGroup>
                <FieldError>{errors.maxTemperatureCelsius}</FieldError>
              </Field>

              <Field
                className="max-w-xl"
                data-invalid={Boolean(errors.salesPrice)}
              >
                <FieldLabel htmlFor="product-sales-price">Salgspris</FieldLabel>
                <InputGroup className="h-11 max-w-xs">
                  <InputGroupInput
                    id="product-sales-price"
                    type="text"
                    inputMode="decimal"
                    value={salesPrice}
                    onChange={(event) => setSalesPrice(event.target.value)}
                    aria-invalid={Boolean(errors.salesPrice)}
                  />
                  <InputGroupAddon align="inline-end">kr.</InputGroupAddon>
                </InputGroup>
                <FieldDescription>Inklusive moms</FieldDescription>
                <FieldError>{errors.salesPrice}</FieldError>
              </Field>

              <ExpiryField
                id="product-expiry"
                value={expiryValue}
                unit={expiryUnit}
                onValueChange={setExpiryValue}
                onUnitChange={setExpiryUnit}
                error={errors.expiry}
                disabled={isSaving}
              />

              {productId ? (
                <OnlinePosProductMappingField
                  integrationId={integrationId}
                  productId={productId}
                  productName={name}
                  mapping={productMapping}
                  onlinePosProducts={onlinePosProducts}
                  onRetry={() => setOnlinePosProducts(undefined)}
                />
              ) : null}

              {productId ? (
                <GsSupplyProductLinkField productId={productId} productName={name} />
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
                        className="block min-h-56 w-full bg-muted bg-contain bg-center bg-no-repeat bg-(image:--preview-image)"
                        style={
                          {
                            "--preview-image": `url("${shownImage}")`,
                          } as React.CSSProperties
                        }
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
                        const input = event.currentTarget;
                        const file = input.files?.[0] ?? null;
                        input.value = "";
                        if (!file) return;

                        const imageError = productImageError(file);
                        if (imageError) {
                          setErrors((current) => ({
                            ...current,
                            image: imageError,
                          }));
                          return;
                        }

                        setErrors((current) => {
                          if (!current.image) return current;
                          const next = { ...current };
                          delete next.image;
                          return next;
                        });
                        setPendingImageFile(file);
                        setCropDialogOpen(true);
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
                <Field>
                  <FieldTitle>Produkttype</FieldTitle>
                  <ToggleGroup
                    value={productType ? [productType] : []}
                    variant="outline"
                    spacing={0}
                    className="w-full"
                    aria-label="Produkttype"
                    disabled={options === undefined}
                    onValueChange={(value) => {
                      const next = PRODUCT_TYPES.find(
                        (type) => type.value === value[0],
                      )?.value;
                      if (next) changeProductType(next);
                    }}
                  >
                    {PRODUCT_TYPES.filter(
                      (type) =>
                        type.value === productType ||
                        !options?.disabledProductTypes.includes(type.value),
                    ).map((type) => (
                      <ToggleGroupItem
                        key={type.value}
                        value={type.value}
                        className="min-h-11 min-w-0 flex-1 flex-wrap whitespace-normal"
                      >
                        {type.label}
                        {options ? (
                          <span>
                            ({standardUnitFor(type.value, options.unitSystem).name})
                          </span>
                        ) : null}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  {productType ? null : (
                    <FieldDescription>
                      Vælg produkttypen, før du tilføjer enheder
                    </FieldDescription>
                  )}
                </Field>
                <div className="flex flex-col gap-3">
                  {/* Standard units stay in state so they are saved, but are not shown. */}
                  {unitRows.filter((row) => row.standard === null).map((row) => {
                    const locked = !productType;
                    const typedName = typedUnitNames[row.key];
                    const container = containers?.find(
                      (item) => item.id === row.containerId,
                    );
                    const nameIssue = newUnitNameIssue(
                      row,
                      typedName || newUnitName(row),
                    );
                    return (
                      <div
                        key={row.key}
                        className="grid gap-3 rounded-xl border p-3 md:grid-cols-(--grid-cols-product-unit) md:items-start"
                      >
                        <Field>
                          {/* Invisible on wide screens to align with the factor field. */}
                          <FieldLabel className="max-md:sr-only md:invisible">
                            Enhed
                          </FieldLabel>
                          <div className="flex items-center gap-3">
                            {container ? (
                              <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground">
                                {container.imageUrl ? (
                                  <Image
                                    src={container.imageUrl}
                                    alt={`Billede af ${container.name}`}
                                    fill
                                    sizes="64px"
                                    className="object-cover"
                                  />
                                ) : (
                                  <PackageOpenIcon aria-hidden="true" />
                                )}
                              </div>
                            ) : null}
                            <div className="flex min-w-0 flex-1 flex-col gap-2">
                              <CreatableCombobox
                                options={customUnitOptions}
                                suggestionOptions={containerUnitOptions(typedName)}
                                suggestionLabel="Beholdere"
                                value={row.unitValue}
                                onValueChange={(value) => {
                                  setTypedUnitNames((current) => {
                                    const next = { ...current };
                                    delete next[row.key];
                                    return next;
                                  });
                                  const selection = unitSelection(value);
                                  setUnitRows((current) =>
                                    current.map((item) =>
                                      item.key === row.key
                                        ? { ...item, ...selection }
                                        : item,
                                    ),
                                  );
                                }}
                                onInputValueChange={(value) =>
                                  setTypedUnitNames((current) => ({
                                    ...current,
                                    [row.key]: value,
                                  }))
                                }
                                placeholder="Vælg eller opret en enhed"
                                allowCreate
                                disabled={locked}
                                ariaLabel="Produktenhed"
                                ariaInvalid={Boolean(nameIssue)}
                              />
                              {row.containerId ? (
                                <FieldDescription>
                                  {containerDescription(row.containerId)}
                                </FieldDescription>
                              ) : null}
                            </div>
                          </div>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`${row.key}-factor`}>
                            {row.isDefault
                              ? "Omregning"
                              : `1 ${unitName(row)} svarer til`}
                          </FieldLabel>
                          <Input
                            id={`${row.key}-factor`}
                            type="text"
                            inputMode="decimal"
                            value={row.isDefault ? "1" : row.factor}
                            disabled={row.isDefault || locked}
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
                        <div className="flex md:mt-6">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-lg"
                            className="size-11"
                            aria-label={`Fjern ${unitName(row)}`}
                            disabled={locked || unitRows.length === 1}
                            onClick={() => removeUnit(row.key)}
                          >
                            <Trash2Icon />
                          </Button>
                        </div>
                        {nameIssue ? (
                          <Alert className="md:col-span-full">
                            <TriangleAlertIcon />
                            <AlertDescription>
                              {unitNameIssueMessage(nameIssue)}
                            </AlertDescription>
                          </Alert>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <FieldError>{errors.units}</FieldError>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={!productType}
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
                    <Empty appearance="notice" className="block w-auto min-w-auto flex-initial text-start">
                      Produktet har endnu ingen ingredienser.
                    </Empty>
                  ) : null}
                  {hasRecipe ? (
                    <Field data-invalid={Boolean(errors.recipeYield)}>
                      <div className="flex items-center gap-1">
                        <FieldLabel htmlFor="recipe-yield">
                          Ingredienserne giver
                        </FieldLabel>
                        <HelpTooltip
                          label="Ingredienserne giver"
                          content="Mængderne herunder bruges til at lave så meget af produktet."
                        />
                      </div>
                      <div className="flex gap-2">
                        <Input
                          id="recipe-yield"
                          type="text"
                          inputMode="decimal"
                          value={yieldQuantity}
                          onChange={(event) =>
                            setYieldQuantity(event.target.value)
                          }
                          aria-invalid={Boolean(errors.recipeYield)}
                          className="h-11 min-w-0 flex-1"
                        />
                        <Select
                          items={unitRows
                            .filter((row) => row.unitValue)
                            .map((row) => ({
                              value: row.key,
                              label: unitName(row),
                            }))}
                          value={yieldUnitRow?.key ?? null}
                          onValueChange={(next) => {
                            if (next) setYieldUnitKey(next);
                          }}
                        >
                          <SelectTrigger
                            aria-label="Enhed for udbytte"
                            className="h-11! w-40"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {unitRows
                                .filter((row) => row.unitValue)
                                .map((row) => (
                                  <SelectItem key={row.key} value={row.key}>
                                    {unitName(row)}
                                  </SelectItem>
                                ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                      <FieldError>{errors.recipeYield}</FieldError>
                    </Field>
                  ) : null}
                  <SortableIngredientList
                    rows={ingredientRows}
                    onReorder={setIngredientRows}
                    rowLabel={(row) => recipeRowLabel(row, "Ingrediensen")}
                    listLabel="Rækkefølge af ingredienser"
                    disabled={catalog === undefined}
                  >
                    {(row) => {
                      const selectedProduct = recipeProductOptions.find(
                        (option) => option.id === row.productId,
                      );
                      const showRemovalMapping =
                        row.removable &&
                        canManageIntegrations &&
                        ingredientRemovalSettings?.enabled === true;
                      const showIntegrationGuidance =
                        row.removable &&
                        canManageIntegrations &&
                        ingredientRemovalSettings !== undefined &&
                        !ingredientRemovalSettings.enabled;
                      return (
                        <IngredientEditorRow
                          key={row.key}
                          row={row}
                          products={recipeProductOptions}
                          options={recipeProductComboboxOptions}
                          unitOptions={unitOptions}
                          disabled={catalog === undefined}
                          errors={errors}
                          onChange={(patch) =>
                            setIngredientRows((current) =>
                              current.map((item) =>
                                item.key === row.key
                                  ? { ...item, ...patch }
                                  : item,
                              ),
                            )
                          }
                          onRemove={() =>
                            setIngredientRows((current) =>
                              current.filter((item) => item.key !== row.key),
                            )
                          }
                          productLabel="Ingrediensprodukt"
                          removeLabel="Fjern ingrediens"
                        >
                          <div className="grid gap-3 md:col-span-full md:row-start-2 md:grid-cols-(--grid-cols-product-settings) md:items-start">
                            <Field
                              orientation="horizontal"
                              appearance="outline"
                              className={cn(
                                "min-h-11 items-center justify-between",
                                showRemovalMapping &&
                                  "md:mt-(--spacing-field-label)",
                              )}
                            >
                              <FieldLabel htmlFor={`${row.key}-removable`}>
                                Kan fjernes
                              </FieldLabel>
                              <Switch
                                id={`${row.key}-removable`}
                                checked={row.removable}
                                onCheckedChange={(checked) =>
                                  setIngredientRows((current) =>
                                    current.map((item) =>
                                      item.key === row.key
                                        ? {
                                            ...item,
                                            removable: checked,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                              />
                            </Field>
                            {showRemovalMapping ? (
                              <Field>
                                <FieldLabel>
                                  OnlinePOS-produkt for fravalg
                                </FieldLabel>
                                <OnlinePosProductSelect
                                  options={onlinePosOptions}
                                  productName={selectedProduct?.name ?? ""}
                                  value={row.onlinePosProductId}
                                  onValueChange={(onlinePosProductId) =>
                                    setIngredientRows((current) =>
                                      current.map((item) =>
                                        item.key === row.key
                                          ? { ...item, onlinePosProductId }
                                          : item,
                                      ),
                                    )
                                  }
                                  ariaLabel="OnlinePOS-produkt for fravalg"
                                  onRetry={() => setOnlinePosProducts(undefined)}
                                />
                              </Field>
                            ) : null}
                            {showIntegrationGuidance ? (
                              <FieldDescription className="md:col-span-full">
                                {ingredientRemovalSettings.connected
                                  ? "Aktivér OnlinePOS-integrationen for at tilføje en kobling."
                                  : "Forbind OnlinePOS-integrationen for at tilføje en kobling."}
                              </FieldDescription>
                            ) : null}
                          </div>
                        </IngredientEditorRow>
                      );
                    }}
                  </SortableIngredientList>
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

          {catalogSettings?.packagingEnabled ||
            product?.ingredients.some((ingredient) => ingredient.packaging) ? (
            <Card>
              <CardHeader>
                <CardTitle>Emballage</CardTitle>
                <CardDescription>
                  Emballage trækkes fra lageret ligesom ingredienser, men vises
                  for sig.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FieldSet>
                  <FieldLegend className="sr-only">Emballage</FieldLegend>
                  <FieldGroup>
                    {packagingRows.length === 0 ? (
                      <Empty appearance="notice" className="block w-auto min-w-auto flex-initial text-start">
                        Produktet har endnu ingen emballage.
                      </Empty>
                    ) : null}
                    <SortableIngredientList
                      rows={packagingRows}
                      onReorder={setPackagingRows}
                      rowLabel={(row) => recipeRowLabel(row, "Emballagen")}
                      listLabel="Rækkefølge af emballage"
                      disabled={catalog === undefined}
                    >
                      {(row) => (
                        <IngredientEditorRow
                          key={row.key}
                          row={row}
                          products={recipeProductOptions}
                          options={recipeProductComboboxOptions}
                          unitOptions={unitOptions}
                          disabled={catalog === undefined}
                          errors={errors}
                          onChange={(patch) =>
                            setPackagingRows((current) =>
                              current.map((item) =>
                                item.key === row.key ? { ...item, ...patch } : item,
                              ),
                            )
                          }
                          onRemove={() =>
                            setPackagingRows((current) =>
                              current.filter((item) => item.key !== row.key),
                            )
                          }
                          productLabel="Emballageprodukt"
                          removeLabel="Fjern emballage"
                        />
                      )}
                    </SortableIngredientList>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      onClick={addPackaging}
                    >
                      <PlusIcon data-icon="inline-start" />
                      Tilføj emballage
                    </Button>
                  </FieldGroup>
                </FieldSet>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Ingredienser, der kan tilføjes</CardTitle>
              <CardDescription>
                Disse ingredienser kan vælges som ekstra. De indgår ikke i
                produktet som standard.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldSet>
                <FieldLegend className="sr-only">
                  Ingredienser, der kan tilføjes
                </FieldLegend>
                <FieldGroup>
                  {addableIngredientRows.length === 0 ? (
                    <Empty appearance="notice" className="block w-auto min-w-auto flex-initial text-start">
                      Der er endnu ingen ingredienser, der kan tilføjes.
                    </Empty>
                  ) : null}
                  {addableIngredientRows.map((row) => {
                    const selectedProduct = addableProductOptions.find(
                      (option) => option.id === row.productId,
                    );
                    const showAdditionMapping =
                      row.productId !== null &&
                      canManageIntegrations &&
                      ingredientAdditionSettings?.enabled === true;
                    const showIntegrationGuidance =
                      row.productId !== null &&
                      canManageIntegrations &&
                      ingredientAdditionSettings !== undefined &&
                      !ingredientAdditionSettings.enabled;
                    return (
                      <IngredientEditorRow
                        key={row.key}
                        row={row}
                        products={addableProductOptions}
                        options={addableProductComboboxOptions}
                        unitOptions={unitOptions}
                        disabled={catalog === undefined}
                        errors={errors}
                        onChange={(patch) =>
                          setAddableIngredientRows((current) =>
                            current.map((item) =>
                              item.key === row.key
                                ? { ...item, ...patch }
                                : item,
                            ),
                          )
                        }
                        onRemove={() =>
                          setAddableIngredientRows((current) =>
                            current.filter((item) => item.key !== row.key),
                          )
                        }
                        productLabel="Ingrediens, der kan tilføjes"
                        removeLabel="Fjern ingrediens, der kan tilføjes"
                        productChildren={
                          <>
                            {showAdditionMapping ? (
                              <Field>
                                <FieldLabel>
                                  OnlinePOS-produkt for tilføjelse
                                </FieldLabel>
                                <OnlinePosProductSelect
                                  options={onlinePosOptions}
                                  productName={selectedProduct?.name ?? ""}
                                  value={row.onlinePosProductId}
                                  onValueChange={(onlinePosProductId) =>
                                    setAddableIngredientRows((current) =>
                                      current.map((item) =>
                                        item.key === row.key
                                          ? { ...item, onlinePosProductId }
                                          : item,
                                      ),
                                    )
                                  }
                                  ariaLabel="OnlinePOS-produkt for tilføjelse"
                                  onRetry={() =>
                                    setOnlinePosProducts(undefined)
                                  }
                                />
                              </Field>
                            ) : null}
                            {showIntegrationGuidance ? (
                              <FieldDescription>
                                {ingredientAdditionSettings.connected
                                  ? "Aktivér OnlinePOS-integrationen for at tilføje en kobling."
                                  : "Forbind OnlinePOS-integrationen for at tilføje en kobling."}
                              </FieldDescription>
                            ) : null}
                          </>
                        }
                      />
                    );
                  })}
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={addAddableIngredient}
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

      <div className="sticky bottom-0 -mx-4 flex justify-end border-t bg-background/95 px-4 py-4 backdrop-blur">
        <div className="flex w-full gap-2 sm:w-auto">
          {isSaving ? (
            <Button
              variant="outline"
              size="lg"
              appearance="standard"
              className="min-h-11 flex-1 sm:flex-none"
              disabled
            >
              Annullér
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
              Annullér
            </Link>
          )}
          <Button
            size="lg"
            appearance="wide"
            className="min-h-11 flex-1 sm:flex-none"
            disabled={
              isSaving || options === undefined || !onlinePosSettingsReady
            }
            onClick={() => save()}
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

      {cropDialogOpen ? (
        <ProductImageCropDialog
          open
          file={pendingImageFile}
          onOpenChange={(open) => {
            setCropDialogOpen(open);
            if (!open) setPendingImageFile(null);
          }}
          onConfirm={(croppedFile) => {
            setImageFile(croppedFile);
            setRemoveExistingImage(false);
            setPendingImageFile(null);
            setCropDialogOpen(false);
          }}
        />
      ) : null}

      <AlertDialog
        open={pendingType !== null}
        onOpenChange={(open) => {
          if (!open) setPendingType(null);
        }}
      >
        {pendingType && options ? (
          <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>
                Skift til{" "}
                {PRODUCT_TYPES.find((type) => type.value === pendingType)?.label}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Angiv omregningen, så lager, opskrifter og egne enheder bliver
                omregnet. De tidligere enheder bliver på produktet med den nye
                omregning. Uden omregning beholder tallene deres værdi.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Field>
              <FieldLabel htmlFor="product-type-conversion">
                1{" "}
                {productType
                  ? standardUnitFor(pendingType, options.unitSystem).name
                  : defaultUnitName}{" "}
                svarer til
              </FieldLabel>
              <Input
                id="product-type-conversion"
                type="text"
                inputMode="decimal"
                autoFocus
                value={pendingConversion}
                onChange={(event) => setPendingConversion(event.target.value)}
                onKeyDown={(event) => {
                  const value = parseFactor(pendingConversion);
                  if (event.key === "Enter" && value > 0) {
                    event.preventDefault();
                    confirmProductType(value);
                  }
                }}
                className="h-11"
              />
              <FieldDescription>
                {
                  standardUnitFor(productType ?? pendingType, options.unitSystem)
                    .name
                }
              </FieldDescription>
            </Field>
            <AlertDialogFooter>
              <AlertDialogCancel>Annullér</AlertDialogCancel>
              <AlertDialogAction
                variant="secondary"
                onClick={() => confirmProductType(null)}
              >
                Skift uden omregning
              </AlertDialogAction>
              <AlertDialogAction
                disabled={!(parseFactor(pendingConversion) > 0)}
                onClick={() =>
                  confirmProductType(parseFactor(pendingConversion))
                }
              >
                Skift og omregn
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>

      <AlertDialog
        open={unconverted !== null}
        onOpenChange={(open) => {
          if (!open) setUnconverted(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {unconverted === "stock"
                ? "Lageret kan ikke omregnes"
                : "Opskrifterne kan ikke omregnes"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {unconverted === "stock"
                ? "Den tidligere standardenhed er fjernet. Vælg, om lagerbeholdningen skal nulstilles, eller om tallene skal beholdes i den nye standardenhed. Opskrifter, der bruger produktet, beholder deres tal."
                : "De tidligere enheder er fjernet. Opskrifter, der bruger produktet, beholder deres tal i den nye standardenhed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annullér</AlertDialogCancel>
            <AlertDialogAction
              variant={unconverted === "stock" ? "secondary" : "default"}
              onClick={() => {
                setUnconverted(null);
                void save("keep");
              }}
            >
              Behold tallene
            </AlertDialogAction>
            {unconverted === "stock" ? (
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  setUnconverted(null);
                  void save("reset");
                }}
              >
                Nulstil lageret
              </AlertDialogAction>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
