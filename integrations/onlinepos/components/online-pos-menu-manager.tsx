"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { OnlinePosMasterSelect } from "./online-pos-master-select";

import { useAccess, usePermission } from "@/components/app-shell";
import { CreatableCombobox } from "@/components/catalog/creatable-combobox";
import { ProductCategoryCombobox } from "@/components/catalog/product-category-combobox";
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
  DialogTrigger,
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
import { HelpTooltip } from "@/components/ui/help-tooltip";
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
type MenuGroupDraft = Omit<
  OnlinePosMenu["groups"][number],
  "quantity" | "productIds"
> & {
  quantity: string;
  productIds: string[];
};

const MAX_MENU_NAME_LENGTH = 100;
const MAX_MENU_GROUPS = 20;

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
    <DialogTrigger
      nativeButton={false}
      render={<Card size="sm" appearance="menu" className="cursor-pointer" />}
      aria-label={
        hasUnmappedProducts
          ? `Redigér ${menu.name}. ${productCountLabel}. Nogle produkter mangler OnlinePOS-kobling.`
          : `Redigér ${menu.name}. ${productCountLabel}.`
      }
      onClick={() => onEdit(menu)}
    >
      <CardHeader className="items-center">
        <CardTitle appearance="truncate" className="min-w-0">{menu.name}</CardTitle>
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
    </DialogTrigger>
  );
}

function MasterMenuManager({
  integrationId,
}: {
  integrationId: Id<"onlinePosIntegrations">;
}) {
  const access = useAccess();
  const canManage = usePermission("integrations.manage");
  const [editor, setEditor] = useState<MenuEditor>(null);
  const menuData = useQuery(
    api.onlinePosMenus.list,
    canManage ? { integrationId } : "skip",
  );
  const mappingOptions = useQuery(
    api.onlinePos.listMappingOptions,
    canManage && editor !== null ? { integrationId } : "skip",
  );
  const catalogCategories = useQuery(
    api.catalog.listCategoryOptions,
    canManage && editor !== null ? {} : "skip",
  );
  const listOnlinePosProducts = useAction(
    api.onlinePosMenus.listOnlinePosProducts,
  );
  const saveMenu = useAction(api.onlinePosMenus.save);
  const removeMenu = useMutation(api.onlinePosMenus.remove);
  const [menuName, setMenuName] = useState("");
  const [selectedMenuProductId, setSelectedMenuProductId] = useState<
    string | null
  >(null);
  const [groups, setGroups] = useState<MenuGroupDraft[]>([]);
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
      setOnlinePosProductOptions(
        await listOnlinePosProducts({ integrationId }),
      );
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
    setGroups([
      { id: crypto.randomUUID(), title: "", quantity: "1", productIds: [] },
    ]);
    setFormError("");
    void loadOnlinePosProducts();
  }

  function openEdit(menu: OnlinePosMenu) {
    if (!menuData) return;
    setEditor({ kind: "edit", menu });
    setMenuName(menu.name);
    setSelectedMenuProductId(String(menu.onlinePosProductId));
    setGroups(
      menu.groups.map((group) => ({
        ...group,
        quantity: String(group.quantity),
      })),
    );
    setFormError("");
    if (menuData.enabled) void loadOnlinePosProducts();
  }

  function closeEditor() {
    if (isSaving) return;
    setEditor(null);
    setFormError("");
  }

  function updateGroup(id: string, changes: Partial<MenuGroupDraft>) {
    setGroups((current) =>
      current.map((group) =>
        group.id === id ? { ...group, ...changes } : group,
      ),
    );
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
    if (!groups.length || groups.length > MAX_MENU_GROUPS) {
      setFormError(`Tilføj mellem 1 og ${MAX_MENU_GROUPS} grupper.`);
      return;
    }
    const resolvedGroups = [];
    for (const group of groups) {
      const title = group.title.trim();
      const quantity = Number(group.quantity);
      const productIds = resolveCatalogProductIds(
        group.productIds,
        knownCatalogProducts,
      );
      if (!title || title.length > MAX_MENU_NAME_LENGTH) {
        setFormError(
          `Giv hver gruppe en titel på højst ${MAX_MENU_NAME_LENGTH} tegn.`,
        );
        return;
      }
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
        setFormError(
          "Antallet i hver gruppe skal være et helt tal mellem 1 og 100.",
        );
        return;
      }
      if (!productIds || productIds.length === 0) {
        setFormError(
          "Vælg mindst ét produkt fra produktkataloget i hver gruppe.",
        );
        return;
      }
      resolvedGroups.push({ id: group.id, title, quantity, productIds });
    }
    const productIds = resolvedGroups.flatMap((group) => group.productIds);
    if (
      resolvedGroups.reduce((total, group) => total + group.quantity, 0) > 100
    ) {
      setFormError("Menuen må højst have 100 valg på tværs af grupperne.");
      return;
    }
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
        integrationId,
        menuId: editor?.kind === "edit" ? editor.menu.id : null,
        name,
        onlinePosProductId: menuProductId,
        groups: resolvedGroups,
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

  if (!menuData) {
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
    searchName: product.name,
    searchText: product.groupName,
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
      searchName: editor.menu.onlinePosProductName,
      searchText: editor.menu.groupName,
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
  const selectedMenuIsAvailable = menuProductOptions.some(
    (option) => option.value === selectedMenuProductId && !option.disabled,
  );
  const selectedProductIds = groups.flatMap((group) => group.productIds);
  const totalSelections = groups.reduce(
    (total, group) => total + Number(group.quantity),
    0,
  );
  const groupLimitError =
    totalSelections > 100
      ? "Menuen må højst have 100 valg på tværs af grupperne."
      : selectedProductIds.length > 100
        ? "Vælg højst 100 produkter til menuen."
        : "";
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
  const editorOptionsLoading =
    editor !== null &&
    (mappingOptions === undefined || catalogCategories === undefined);
  const menuFieldDisabled =
    editorOptionsLoading ||
    loadingOnlinePosProducts ||
    onlinePosProductsError !== null ||
    !menuData.enabled ||
    isSaving;
  const productFieldDisabled =
    editorOptionsLoading || !menuData.enabled || isSaving;
  const canSave =
    menuData.enabled &&
    !editorOptionsLoading &&
    !isSaving &&
    !loadingOnlinePosProducts &&
    onlinePosProductsError === null &&
    menuName.trim().length > 0 &&
    menuName.trim().length <= MAX_MENU_NAME_LENGTH &&
    selectedMenuIsAvailable &&
    selectedProductsAreAvailable &&
    selectedProductsAreUnique &&
    selectedProductIds.length <= 100 &&
    groups.length > 0 &&
    groups.length <= MAX_MENU_GROUPS &&
    totalSelections <= 100 &&
    groups.every(
      (group) =>
        group.title.trim().length > 0 &&
        group.title.trim().length <= MAX_MENU_NAME_LENGTH &&
        Number.isInteger(Number(group.quantity)) &&
        Number(group.quantity) >= 1 &&
        Number(group.quantity) <= 100 &&
        group.productIds.length > 0,
    );

  return (
    <div className="flex flex-col gap-7 pb-10">
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex max-w-3xl flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">Menuer</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Navngiv menuen, vælg det tilsvarende produkt i OnlinePOS, og vælg
              dens produktgrupper fra produktkataloget. De efterfølgende
              produktlinjer til 0 kr. samles under menuen via produkternes
              OnlinePOS-koblinger.
            </p>
          </div>
          <DialogTrigger
            render={
              <Button
                type="button"
                size="lg"
                appearance="standard"
                className="min-h-11 active:translate-y-px"
              />
            }
            disabled={!menuData.enabled}
            onClick={openCreate}
          >
            <PlusIcon data-icon="inline-start" />
            Ny menu
          </DialogTrigger>
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
          <Empty appearance="outlined" className="min-h-72">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UtensilsIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Ingen menuer endnu</EmptyTitle>
              <EmptyDescription>
                Opret en menu med produktgrupper fra produktkataloget.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <DialogTrigger
                render={
                  <Button
                    type="button"
                    appearance="standard"
                    className="min-h-11 active:translate-y-px"
                  />
                }
                disabled={!menuData.enabled}
                onClick={openCreate}
              >
                <PlusIcon data-icon="inline-start" />
                Ny menu
              </DialogTrigger>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
            {menuData.menus.map((menu) => (
              <MenuCard key={menu.id} menu={menu} onEdit={openEdit} />
            ))}
          </div>
        )}

        <DialogContent className="max-h-(--spacing-dynamic-viewport-inset) overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="mt-3">
              {editor?.kind === "edit" ? "Redigér menu" : "Ny menu"}
            </DialogTitle>
            <DialogDescription>
              Giv menuen et navn, vælg den i OnlinePOS, og tilføj grupper med
              titel, antal og produkter fra produktkataloget.
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
          {editorOptionsLoading ? (
            <div
              className="flex items-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <Spinner />
              Henter produktkatalog…
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
          {mappingOptions !== undefined &&
          catalogCategories !== undefined &&
          catalogProducts.every(
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
                productSearch
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
            {groups.map((group, index) => {
              const quantity = Number(group.quantity);
              const quantityValid =
                Number.isInteger(quantity) && quantity >= 1 && quantity <= 100;
              const groupProducts = catalogProducts.map((product) => {
                const otherGroup = groups.find(
                  (candidate) =>
                    candidate.id !== group.id &&
                    candidate.productIds.includes(product.value),
                );
                const unavailableReason =
                  product.unavailableReason ??
                  (otherGroup
                    ? `Valgt i ${otherGroup.title.trim() || "en anden gruppe"}`
                    : null);
                return {
                  value: product.value,
                  label: unavailableReason
                    ? `${product.name} · ${unavailableReason}`
                    : product.name,
                  categoryIds: product.categoryIds,
                  disabled: unavailableReason !== null,
                };
              });
              return (
                <FieldSet key={group.id} appearance="padded"
                >
                  <FieldLegend>Gruppe {index + 1}</FieldLegend>
                  <FieldGroup appearance="standard" className="grid items-start sm:grid-cols-(--grid-cols-order-item)">
                    <Field data-disabled={productFieldDisabled}>
                      <FieldLabel
                        className="min-h-8"
                        htmlFor={`menu-group-title-${group.id}`}
                      >
                        Titel
                      </FieldLabel>
                      <Input
                        id={`menu-group-title-${group.id}`}
                        value={group.title}
                        maxLength={MAX_MENU_NAME_LENGTH}
                        placeholder="Fx Hovedret"
                        className="h-11"
                        required
                        disabled={productFieldDisabled}
                        onChange={(event) =>
                          updateGroup(group.id, { title: event.target.value })
                        }
                      />
                    </Field>
                    <Field
                      data-disabled={productFieldDisabled}
                      data-invalid={!quantityValid}
                    >
                      <div className="flex min-h-8 items-center gap-1">
                        <FieldLabel htmlFor={`menu-group-quantity-${group.id}`}>
                          Antal valg
                        </FieldLabel>
                        <HelpTooltip
                          label="Antal valg"
                          content="Antallet af produkter, der skal vælges fra gruppen pr. menu."
                        />
                      </div>
                      <Input
                        id={`menu-group-quantity-${group.id}`}
                        type="number"
                        min={1}
                        max={100}
                        step={1}
                        value={group.quantity}
                        className="h-11"
                        required
                        aria-invalid={!quantityValid}
                        disabled={productFieldDisabled}
                        onChange={(event) =>
                          updateGroup(group.id, {
                            quantity: event.target.value,
                          })
                        }
                      />
                      {!quantityValid ? (
                        <FieldError>Vælg et helt tal fra 1 til 100.</FieldError>
                      ) : null}
                    </Field>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 sm:mt-10"
                      aria-label={`Fjern gruppe ${group.title.trim() || index + 1}`}
                      disabled={productFieldDisabled || groups.length === 1}
                      onClick={() => {
                        setGroups((current) =>
                          current.filter(
                            (candidate) => candidate.id !== group.id,
                          ),
                        );
                        setFormError("");
                      }}
                    >
                      <Trash2Icon data-icon="inline-start" />
                      Fjern gruppe
                    </Button>
                  </FieldGroup>
                  <Field data-disabled={productFieldDisabled}>
                    <FieldLabel>Produkter</FieldLabel>
                    <ProductCategoryCombobox
                      categories={catalogCategories ?? []}
                      products={groupProducts}
                      values={group.productIds}
                      onValuesChange={(productIds) =>
                        updateGroup(group.id, { productIds })
                      }
                      disabled={productFieldDisabled}
                      ariaLabel={`Produkter i ${group.title.trim() || `gruppe ${index + 1}`}`}
                    />
                    <FieldDescription>
                      Vælg en kategorilinje for at vælge eller fravælge alle
                      produkter i kategorien.
                    </FieldDescription>
                  </Field>
                </FieldSet>
              );
            })}
            <Button
              type="button"
              variant="outline"
              className="min-h-11 self-start"
              disabled={
                productFieldDisabled || groups.length >= MAX_MENU_GROUPS
              }
              onClick={() => {
                const group = {
                  id: crypto.randomUUID(),
                  title: "",
                  quantity: "1",
                  productIds: [],
                };
                setGroups((current) => [...current, group]);
                setFormError("");
              }}
            >
              <PlusIcon data-icon="inline-start" />
              Tilføj gruppe
            </Button>
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
            <FieldError>{formError || groupLimitError}</FieldError>
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

export function OnlinePosMenuManager() {
  const canManage = usePermission("integrations.manage");
  const settings = useQuery(api.onlinePos.getSettings, canManage ? {} : "skip");
  const [selectedId, setSelectedId] =
    useState<Id<"onlinePosIntegrations"> | null>(null);
  const master =
    settings?.masters.find((master) => master.id === selectedId) ??
    settings?.masters[0];
  if (!canManage)
    return (
      <Alert variant="destructive">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at administrere integrationer.
        </AlertDescription>
      </Alert>
    );
  if (!settings) return <Skeleton className="h-96 w-full" />;
  return (
    <div className="flex flex-col gap-5">
      <OnlinePosMasterSelect
        masters={settings.masters}
        value={master?.id ?? null}
        onValueChange={setSelectedId}
      />
      {master ? (
        <MasterMenuManager key={master.id} integrationId={master.id} />
      ) : (
        <Alert>
          <AlertTitle>OnlinePOS er ikke forbundet</AlertTitle>
          <AlertDescription>
            Opret en masterforbindelse under integrationer.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
