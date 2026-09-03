"use client";

import { useAccess, usePermission } from "@/components/app-shell";
import {
  CreatableCombobox,
  CreatableMultiCombobox,
  type ComboboxOptionGroup,
} from "@/components/catalog/creatable-combobox";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  CircleAlertIcon,
  PlusIcon,
  Trash2Icon,
  UtensilsIcon,
} from "lucide-react";
import { useState } from "react";
import { getUserErrorMessage } from "@/lib/user-errors";
import { toast } from "sonner";

type OnlinePosMenusResult = NonNullable<
  FunctionReturnType<typeof api.onlinePosMenus.list>
>;
type OnlinePosMenu = OnlinePosMenusResult["menus"][number];
type OnlinePosProductOption = FunctionReturnType<
  typeof api.onlinePosMenus.listOnlinePosProducts
>[number];
type ProductMappingOptions = NonNullable<
  FunctionReturnType<typeof api.onlinePos.listMappingOptions>
>;
type CatalogProductOption = ProductMappingOptions["products"][number];
type CatalogCategoryOption = FunctionReturnType<
  typeof api.catalog.listCategoryOptions
>[number];
type MenuCatalogProduct = Pick<
  CatalogProductOption,
  "id" | "name" | "categoryIds"
> & {
  value: string;
  mapped: boolean;
  unavailableReason: string | null;
};
type MenuEditor =
  { kind: "create" } | { kind: "edit"; menu: OnlinePosMenu } | null;

const MAX_MENU_NAME_LENGTH = 100;
const UNCATEGORIZED_GROUP_VALUE = "__uncategorized__";

function onlinePosProductLabel(product: OnlinePosProductOption) {
  return product.groupName
    ? `${product.name} · ${product.groupName}`
    : product.name;
}

function parseProductId(value: string) {
  const productId = Number(value);
  return Number.isSafeInteger(productId) && productId > 0 ? productId : null;
}

function resolveCatalogProductIds(
  values: string[],
  products: ReadonlyArray<{ id: CatalogProductOption["id"] }>,
) {
  const idByValue = new Map(
    products.map((product) => [String(product.id), product.id]),
  );
  const productIds = [];
  for (const value of values) {
    const productId = idByValue.get(value);
    if (!productId) return null;
    productIds.push(productId);
  }
  return productIds;
}

function MenuProductPicker({
  title,
  description,
  productAriaLabel,
  categories,
  products,
  selectedProductIds,
  onProductIdsChange,
  disabled,
}: {
  title: string;
  description: string;
  productAriaLabel: string;
  categories: CatalogCategoryOption[];
  products: MenuCatalogProduct[];
  selectedProductIds: string[];
  onProductIdsChange: (productIds: string[]) => void;
  disabled: boolean;
}) {
  const categoriesById = new Map(
    categories.map((category) => [category.id, category]),
  );
  const categoryOrder = new Map(
    categories.map((category, index) => [category.id, index]),
  );
  const productOptions = [...products]
    .sort((left, right) => {
      const leftCategoryId = left.categoryIds[0];
      const rightCategoryId = right.categoryIds[0];
      const leftCategoryOrder = leftCategoryId
        ? (categoryOrder.get(leftCategoryId) ?? categories.length)
        : categories.length;
      const rightCategoryOrder = rightCategoryId
        ? (categoryOrder.get(rightCategoryId) ?? categories.length)
        : categories.length;
      return (
        leftCategoryOrder - rightCategoryOrder ||
        left.name.localeCompare(right.name, "da")
      );
    })
    .map((product) => {
      const primaryCategoryId = product.categoryIds[0];
      const primaryCategory = primaryCategoryId
        ? categoriesById.get(primaryCategoryId)
        : undefined;
      return {
        value: product.value,
        label: product.unavailableReason
          ? `${product.name} · ${product.unavailableReason}`
          : product.name,
        disabled: product.unavailableReason !== null,
        group: primaryCategory
          ? String(primaryCategory.id)
          : UNCATEGORIZED_GROUP_VALUE,
        groupDepth: primaryCategory?.depth ?? 0,
        groupLabel: primaryCategory?.name ?? "Uden kategori",
        searchText: product.categoryIds
          .flatMap((categoryId) => {
            const category = categoriesById.get(categoryId);
            return category ? [category.path] : [];
          })
          .join(" "),
      };
    });
  const productGroups: ComboboxOptionGroup[] = categories.flatMap((category) => {
    const optionValues = products.flatMap((product) => {
      let categoryId: CatalogCategoryOption["id"] | null =
        product.categoryIds[0] ?? null;
      while (categoryId) {
        if (categoryId === category.id) return [product.value];
        categoryId = categoriesById.get(categoryId)?.parentCategoryId ?? null;
      }
      return [];
    });
    return optionValues.length
      ? [
          {
            value: String(category.id),
            label: category.name,
            title: category.path,
            depth: category.depth,
            optionValues,
          },
        ]
      : [];
  });
  const uncategorizedProductValues = products.flatMap((product) =>
    product.categoryIds.length === 0 ? [product.value] : [],
  );
  if (uncategorizedProductValues.length > 0) {
    productGroups.push({
      value: UNCATEGORIZED_GROUP_VALUE,
      label: "Uden kategori",
      depth: 0,
      optionValues: uncategorizedProductValues,
    });
  }

  return (
    <FieldSet className="gap-4 rounded-xl border p-4">
      <FieldLegend>{title}</FieldLegend>
      <FieldDescription>{description}</FieldDescription>
      <Field data-disabled={disabled}>
        <FieldLabel>Produkter</FieldLabel>
        <CreatableMultiCombobox
          options={productOptions}
          values={selectedProductIds}
          onValuesChange={onProductIdsChange}
          placeholder="Søg efter produkt eller kategori"
          allowCreate={false}
          preserveSearchOnSelect
          selectableGroups
          groups={productGroups}
          disabled={disabled}
          ariaLabel={productAriaLabel}
        />
        <FieldDescription>
          Vælg en kategorilinje for at vælge eller fravælge alle produkter i
          kategorien.
        </FieldDescription>
      </Field>
    </FieldSet>
  );
}

function MenuCard({
  menu,
  onEdit,
}: {
  menu: OnlinePosMenu;
  onEdit: (menu: OnlinePosMenu) => void;
}) {
  const hasUnmappedProducts = menu.products.some((product) => !product.mapped);
  const productCountLabel = `${menu.products.length.toLocaleString("da-DK")} ${
    menu.products.length === 1 ? "produkt" : "produkter"
  }`;

  return (
    <Card
      size="sm"
      role="button"
      tabIndex={0}
      aria-label={
        hasUnmappedProducts
          ? `Redigér ${menu.name}. ${productCountLabel}. Nogle produkter mangler OnlinePOS-kobling.`
          : `Redigér ${menu.name}. ${productCountLabel}.`
      }
      className="cursor-pointer transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      onClick={() => onEdit(menu)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onEdit(menu);
        }
      }}
    >
      <CardHeader className="items-center">
        <CardTitle className="min-w-0 truncate">{menu.name}</CardTitle>
        <CardDescription>{productCountLabel}</CardDescription>
        {hasUnmappedProducts ? (
          <CardAction className="self-center">
            <Tooltip>
              <TooltipTrigger
                render={<span className="inline-flex text-warning" />}
              >
                <CircleAlertIcon aria-hidden="true" />
                <span className="sr-only">Produkter mangler kobling</span>
              </TooltipTrigger>
              <TooltipContent>
                Et eller flere produkter mangler en OnlinePOS-kobling.
              </TooltipContent>
            </Tooltip>
          </CardAction>
        ) : null}
      </CardHeader>
    </Card>
  );
}

export function OnlinePosMenuManager() {
  const access = useAccess();
  const canManage = usePermission("integrations.manage");
  const menuData = useQuery(api.onlinePosMenus.list, canManage ? {} : "skip");
  const mappingOptions = useQuery(
    api.onlinePos.listMappingOptions,
    canManage ? {} : "skip",
  );
  const catalogCategories = useQuery(
    api.catalog.listCategoryOptions,
    canManage ? {} : "skip",
  );
  const listOnlinePosProducts = useAction(
    api.onlinePosMenus.listOnlinePosProducts,
  );
  const saveMenu = useAction(api.onlinePosMenus.save);
  const removeMenu = useMutation(api.onlinePosMenus.remove);
  const [editor, setEditor] = useState<MenuEditor>(null);
  const [menuName, setMenuName] = useState("");
  const [selectedMenuProductId, setSelectedMenuProductId] = useState<
    string | null
  >(null);
  const [selectedPrimaryProductIds, setSelectedPrimaryProductIds] = useState<
    string[]
  >([]);
  const [selectedAdditionalProductIds, setSelectedAdditionalProductIds] =
    useState<string[]>([]);
  const [onlinePosProductOptions, setOnlinePosProductOptions] = useState<
    OnlinePosProductOption[] | null
  >(null);
  const [loadingOnlinePosProducts, setLoadingOnlinePosProducts] =
    useState(false);
  const [onlinePosProductsError, setOnlinePosProductsError] = useState<
    string | null
  >(null);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<OnlinePosMenu | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  async function loadOnlinePosProducts(force = false) {
    if (
      loadingOnlinePosProducts ||
      (!force && onlinePosProductOptions !== null)
    ) {
      return;
    }
    setLoadingOnlinePosProducts(true);
    setOnlinePosProductsError(null);
    try {
      setOnlinePosProductOptions(await listOnlinePosProducts({}));
    } catch (error) {
      setOnlinePosProductsError(
        getUserErrorMessage(
          error,
          "OnlinePOS-produkterne kunne ikke hentes. Prøv igen.",
        ),
      );
    } finally {
      setLoadingOnlinePosProducts(false);
    }
  }

  function openCreate() {
    if (!menuData?.enabled) return;
    setEditor({ kind: "create" });
    setMenuName("");
    setSelectedMenuProductId(null);
    setSelectedPrimaryProductIds([]);
    setSelectedAdditionalProductIds([]);
    setFormError("");
    void loadOnlinePosProducts();
  }

  function openEdit(menu: OnlinePosMenu) {
    if (!menuData) return;
    setEditor({ kind: "edit", menu });
    setMenuName(menu.name);
    setSelectedMenuProductId(String(menu.onlinePosProductId));
    setSelectedPrimaryProductIds(
      menu.products
        .filter((product) => product.kind === "primary")
        .map((product) => product.id),
    );
    setSelectedAdditionalProductIds(
      menu.products
        .filter((product) => product.kind === "additional")
        .map((product) => product.id),
    );
    setFormError("");
    if (menuData.enabled) void loadOnlinePosProducts();
  }

  function closeEditor() {
    if (isSaving) return;
    setEditor(null);
    setFormError("");
  }

  async function save() {
    const name = menuName.trim();
    const menuProductId = selectedMenuProductId
      ? parseProductId(selectedMenuProductId)
      : null;
    const knownCatalogProducts = [
      ...(mappingOptions?.products ?? []),
      ...(editor?.kind === "edit" ? editor.menu.products : []),
    ];
    const primaryProductIds = resolveCatalogProductIds(
      selectedPrimaryProductIds,
      knownCatalogProducts,
    );
    const additionalProductIds = resolveCatalogProductIds(
      selectedAdditionalProductIds,
      knownCatalogProducts,
    );

    if (!name) {
      setFormError("Giv menuen et navn.");
      return;
    }
    if (name.length > MAX_MENU_NAME_LENGTH) {
      setFormError(`Navnet må højst være ${MAX_MENU_NAME_LENGTH} tegn.`);
      return;
    }
    if (menuProductId === null) {
      setFormError("Vælg menuen fra OnlinePOS.");
      return;
    }
    if (!primaryProductIds || !additionalProductIds) {
      setFormError("Vælg kun produkter fra produktkataloget.");
      return;
    }
    if (primaryProductIds.length === 0) {
      setFormError("Vælg mindst ét primært produkt.");
      return;
    }
    const productIds = [...primaryProductIds, ...additionalProductIds];
    if (productIds.length > 100) {
      setFormError("Vælg højst 100 produkter til menuen.");
      return;
    }
    if (new Set(productIds).size !== productIds.length) {
      setFormError("Et produkt kan kun vælges én gang i menuen.");
      return;
    }

    setIsSaving(true);
    setFormError("");
    try {
      await saveMenu({
        menuId: editor?.kind === "edit" ? editor.menu.id : null,
        name,
        onlinePosProductId: menuProductId,
        primaryProductIds,
        additionalProductIds,
      });
      toast.success(
        editor?.kind === "edit" ? "Menuen er opdateret" : "Menuen er oprettet",
      );
      setEditor(null);
    } catch (error) {
      setFormError(
        getUserErrorMessage(error, "Menuen kunne ikke gemmes. Prøv igen."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function remove() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await removeMenu({ menuId: pendingDelete.id });
      toast.success("Menuen er fjernet");
      setPendingDelete(null);
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Menuen kunne ikke fjernes. Prøv igen."),
      );
    } finally {
      setIsDeleting(false);
    }
  }

  if (!access) {
    return <Skeleton className="h-96 w-full max-w-6xl" />;
  }

  if (!canManage) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <CircleAlertIcon aria-hidden="true" />
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at administrere OnlinePOS-menuer.
        </AlertDescription>
      </Alert>
    );
  }

  if (
    !menuData ||
    mappingOptions === undefined ||
    catalogCategories === undefined
  ) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 w-full max-w-3xl" />
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  const currentMenuId = editor?.kind === "edit" ? editor.menu.id : null;
  const configuredMenuProductIds = new Set(
    menuData.menus
      .filter((menu) => menu.id !== currentMenuId)
      .map((menu) => menu.onlinePosProductId),
  );
  const selectedOnlinePosProductId = selectedMenuProductId
    ? parseProductId(selectedMenuProductId)
    : null;
  const assignedMenuProductIds = new Set(
    menuData.menus
      .filter((menu) => menu.id !== currentMenuId)
      .map((menu) => menu.onlinePosProductId),
  );
  const menuProductOptions = (onlinePosProductOptions ?? []).map((product) => ({
    value: String(product.id),
    label: onlinePosProductLabel(product),
    disabled: assignedMenuProductIds.has(product.id),
  }));
  if (
    editor?.kind === "edit" &&
    !menuProductOptions.some(
      (option) => option.value === String(editor.menu.onlinePosProductId),
    )
  ) {
    menuProductOptions.unshift({
      value: String(editor.menu.onlinePosProductId),
      label: onlinePosProductLabel({
        id: editor.menu.onlinePosProductId,
        name: editor.menu.onlinePosProductName,
        groupName: editor.menu.groupName,
      }),
      disabled: true,
    });
  }
  const catalogProducts: MenuCatalogProduct[] = (
    mappingOptions?.products ?? []
  ).map((product) => {
    const isMenuProduct =
      product.onlinePosProductId !== null &&
      (configuredMenuProductIds.has(product.onlinePosProductId) ||
        product.onlinePosProductId === selectedOnlinePosProductId);
    return {
      id: product.id,
      name: product.name,
      categoryIds: product.categoryIds,
      value: String(product.id),
      mapped: product.onlinePosProductId !== null,
      unavailableReason: isMenuProduct ? "Bruges som menu i OnlinePOS" : null,
    };
  });
  if (editor?.kind === "edit") {
    for (const product of editor.menu.products) {
      if (
        !catalogProducts.some(
          (catalogProduct) => catalogProduct.value === String(product.id),
        )
      ) {
        catalogProducts.push({
          id: product.id,
          name: product.name,
          categoryIds: [],
          value: String(product.id),
          mapped: product.mapped,
          unavailableReason: null,
        });
      }
    }
  }
  const selectedPrimaryProductIdSet = new Set(selectedPrimaryProductIds);
  const selectedAdditionalProductIdSet = new Set(selectedAdditionalProductIds);
  const primaryProducts = catalogProducts.map((product) => ({
    ...product,
    unavailableReason:
      product.unavailableReason ??
      (selectedAdditionalProductIdSet.has(product.value)
        ? "Valgt som ekstra produkt"
        : null),
  }));
  const additionalProducts = catalogProducts.map((product) => ({
    ...product,
    unavailableReason:
      product.unavailableReason ??
      (selectedPrimaryProductIdSet.has(product.value)
        ? "Valgt som primært produkt"
        : null),
  }));
  const selectedMenuIsAvailable = menuProductOptions.some(
    (option) => option.value === selectedMenuProductId && !option.disabled,
  );
  const selectedProductIds = [
    ...selectedPrimaryProductIds,
    ...selectedAdditionalProductIds,
  ];
  const selectedProductsAreAvailable = selectedProductIds.every((productId) =>
    catalogProducts.some(
      (product) =>
        product.value === productId && product.unavailableReason === null,
    ),
  );
  const unmappedSelectedProducts = selectedProductIds.flatMap((productId) => {
    const product = catalogProducts.find(
      (catalogProduct) => catalogProduct.value === productId,
    );
    return product && !product.mapped ? [product] : [];
  });
  const selectedProductsAreUnique =
    new Set(selectedProductIds).size === selectedProductIds.length;
  const menuFieldDisabled =
    loadingOnlinePosProducts ||
    onlinePosProductsError !== null ||
    !menuData.enabled ||
    isSaving;
  const productFieldDisabled = !menuData.enabled || isSaving;
  const canSave =
    menuData.enabled &&
    !isSaving &&
    !loadingOnlinePosProducts &&
    onlinePosProductsError === null &&
    menuName.trim().length > 0 &&
    menuName.trim().length <= MAX_MENU_NAME_LENGTH &&
    selectedMenuIsAvailable &&
    selectedProductsAreAvailable &&
    selectedProductsAreUnique &&
    selectedPrimaryProductIds.length > 0;

  return (
    <div className="flex flex-col gap-7 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-3xl flex-col gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">Menuer</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Navngiv menuen, vælg det tilsvarende produkt i OnlinePOS, og vælg
            dens primære og ekstra produkter fra produktkataloget. De
            efterfølgende produktlinjer til 0 kr. samles under menuen via
            produkternes OnlinePOS-koblinger.
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          className="min-h-11 px-4"
          disabled={!menuData.enabled}
          onClick={openCreate}
        >
          <PlusIcon data-icon="inline-start" />
          Ny menu
        </Button>
      </div>

      {!menuData.connected ? (
        <Alert>
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>OnlinePOS er ikke forbundet</AlertTitle>
          <AlertDescription>
            Forbind OnlinePOS under Administration → Integrationer for at
            tilføje menuer.
          </AlertDescription>
        </Alert>
      ) : !menuData.enabled ? (
        <Alert>
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>OnlinePOS-integrationen er slået fra</AlertTitle>
          <AlertDescription>
            Aktivér OnlinePOS under Administration → Integrationer for at
            oprette eller redigere menuer.
          </AlertDescription>
        </Alert>
      ) : null}

      {menuData.menus.length === 0 ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UtensilsIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Ingen menuer endnu</EmptyTitle>
            <EmptyDescription>
              Opret en menu og vælg dens primære og ekstra produkter fra
              produktkataloget.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              className="min-h-11 px-4"
              disabled={!menuData.enabled}
              onClick={openCreate}
            >
              <PlusIcon data-icon="inline-start" />
              Ny menu
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          {menuData.menus.map((menu) => (
            <MenuCard
              key={menu.id}
              menu={menu}
              onEdit={openEdit}
            />
          ))}
        </div>
      )}

      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="mt-3">
              {editor?.kind === "edit" ? "Redigér menu" : "Ny menu"}
            </DialogTitle>
            <DialogDescription>
              Giv menuen et navn, vælg den i OnlinePOS, og tilføj dens primære
              og ekstra produkter fra produktkataloget.
            </DialogDescription>
          </DialogHeader>

          {loadingOnlinePosProducts ? (
            <div
              className="flex items-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <Spinner />
              Henter OnlinePOS-produkter…
            </div>
          ) : null}
          {onlinePosProductsError ? (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Produkterne kunne ikke hentes</AlertTitle>
              <AlertDescription>
                <p>{onlinePosProductsError}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 min-h-11"
                  onClick={() => {
                    setOnlinePosProductOptions(null);
                    void loadOnlinePosProducts(true);
                  }}
                >
                  Prøv igen
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {onlinePosProductOptions?.length === 0 ? (
            <Alert>
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Ingen OnlinePOS-produkter</AlertTitle>
              <AlertDescription>
                OnlinePOS skal have et produkt, der kan bruges som menu.
              </AlertDescription>
            </Alert>
          ) : null}
          {mappingOptions?.limitReached ? (
            <Alert>
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Kun de første 500 produkter vises</AlertTitle>
              <AlertDescription>
                Arkivér ubrugte produkter for at få hele listen med.
              </AlertDescription>
            </Alert>
          ) : null}
          {catalogProducts.every(
            (product) => product.unavailableReason !== null,
          ) ? (
            <Alert>
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Ingen produkter kan vælges</AlertTitle>
              <AlertDescription>
                Alle produkter bruges allerede som menu i OnlinePOS.
              </AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup>
            <Field data-disabled={productFieldDisabled}>
              <FieldLabel htmlFor="online-pos-menu-name">Navn</FieldLabel>
              <Input
                id="online-pos-menu-name"
                value={menuName}
                maxLength={MAX_MENU_NAME_LENGTH}
                placeholder="Fx Frokostmenu"
                className="h-11"
                required
                disabled={productFieldDisabled}
                onChange={(event) => {
                  setMenuName(event.target.value);
                  setFormError("");
                }}
              />
            </Field>
            <Field
              data-invalid={Boolean(formError)}
              data-disabled={menuFieldDisabled}
            >
              <FieldLabel>Menu i OnlinePOS</FieldLabel>
              <CreatableCombobox
                options={menuProductOptions}
                value={selectedMenuProductId}
                onValueChange={(value) => {
                  setSelectedMenuProductId(value);
                  setFormError("");
                }}
                placeholder="Vælg menu"
                allowCreate={false}
                disabled={menuFieldDisabled}
                ariaLabel="Menu i OnlinePOS"
              />
            </Field>
            <MenuProductPicker
              title="Primære produkter"
              description="Produkter, der kan være menuens hovedprodukt."
              productAriaLabel="Primære produkter i menuen"
              categories={catalogCategories}
              products={primaryProducts}
              selectedProductIds={selectedPrimaryProductIds}
              onProductIdsChange={(productIds) => {
                setSelectedPrimaryProductIds(productIds);
                setFormError("");
              }}
              disabled={productFieldDisabled}
            />
            <MenuProductPicker
              title="Ekstra produkter"
              description="Produkter, der kan følge med menuens hovedprodukt."
              productAriaLabel="Ekstra produkter i menuen"
              categories={catalogCategories}
              products={additionalProducts}
              selectedProductIds={selectedAdditionalProductIds}
              onProductIdsChange={(productIds) => {
                setSelectedAdditionalProductIds(productIds);
                setFormError("");
              }}
              disabled={productFieldDisabled}
            />
            {selectedOnlinePosProductId !== null &&
            unmappedSelectedProducts.length > 0 ? (
              <Alert>
                <CircleAlertIcon aria-hidden="true" />
                <AlertTitle>
                  Valgte produkter mangler OnlinePOS-kobling
                </AlertTitle>
                <AlertDescription>
                  {unmappedSelectedProducts.length === 1
                    ? "Ét valgt produkt er ikke koblet til OnlinePOS."
                    : `${unmappedSelectedProducts.length.toLocaleString("da-DK")} valgte produkter er ikke koblet til OnlinePOS.`}{" "}
                  Produkterne gemmes i menuen, men deres salgslinjer kan først
                  genkendes, når koblingerne er oprettet.
                </AlertDescription>
              </Alert>
            ) : null}
            <FieldError>{formError}</FieldError>
          </FieldGroup>

          <DialogFooter>
            {editor?.kind === "edit" ? (
              <Button
                type="button"
                variant="destructive"
                className="sm:mr-auto"
                disabled={isSaving}
                onClick={() => {
                  setPendingDelete(editor.menu);
                  setEditor(null);
                }}
              >
                <Trash2Icon data-icon="inline-start" />
                Fjern menu
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={closeEditor}
            >
              Annullér
            </Button>
            <Button
              type="button"
              disabled={!canSave}
              onClick={() => void save()}
            >
              {isSaving ? <Spinner data-icon="inline-start" /> : null}
              {editor?.kind === "edit" ? "Opdatér menu" : "Opret menu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fjern menu?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `Kun grupperingskonfigurationen for "${pendingDelete.name}" fjernes. Gemte salgs- og ordrelinjer forbliver uændrede.`
                : "Kun menuens grupperingskonfiguration fjernes. Gemte salgs- og ordrelinjer forbliver uændrede."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Behold menu
            </AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={() => void remove()}
            >
              {isDeleting ? <Spinner data-icon="inline-start" /> : null}
              Fjern menu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
