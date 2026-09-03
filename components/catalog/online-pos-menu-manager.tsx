"use client";

import { useAccess, usePermission } from "@/components/app-shell";
import {
  CreatableCombobox,
  CreatableMultiCombobox,
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
  CardContent,
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  CircleAlertIcon,
  PencilIcon,
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
  typeof api.onlinePosMenus.listProductOptions
>[number];
type MenuEditor =
  { kind: "create" } | { kind: "edit"; menu: OnlinePosMenu } | null;

function productLabel(product: OnlinePosProductOption) {
  return product.groupName
    ? `${product.name} · ${product.groupName}`
    : product.name;
}

function parseProductId(value: string) {
  const productId = Number(value);
  return Number.isSafeInteger(productId) && productId > 0 ? productId : null;
}

function MenuCard({
  menu,
  onEdit,
  onRemove,
}: {
  menu: OnlinePosMenu;
  onEdit: (menu: OnlinePosMenu) => void;
  onRemove: (menu: OnlinePosMenu) => void;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="truncate">{menu.name}</CardTitle>
        <CardDescription className="truncate">
          OnlinePOS-produkt-id: {menu.onlinePosProductId} ·{" "}
          {menu.groupName || "Uden gruppe"}
        </CardDescription>
        <CardAction className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => onEdit(menu)}
          >
            <PencilIcon data-icon="inline-start" />
            Redigér
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() => onRemove(menu)}
          >
            <Trash2Icon data-icon="inline-start" />
            Fjern
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm font-medium">
          {menu.components.length.toLocaleString("da-DK")}{" "}
          {menu.components.length === 1 ? "muligt produkt" : "mulige produkter"}
        </p>
        <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
          {menu.components.map((component) => (
            <li
              key={component.onlinePosProductId}
              className="flex min-w-0 items-baseline justify-between gap-3"
            >
              <span className="min-w-0 truncate">{component.name}</span>
              <span className="shrink-0 text-xs">
                ID {component.onlinePosProductId}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function OnlinePosMenuManager() {
  const access = useAccess();
  const canManage = usePermission("integrations.manage");
  const menuData = useQuery(api.onlinePosMenus.list, canManage ? {} : "skip");
  const listProductOptions = useAction(api.onlinePosMenus.listProductOptions);
  const saveMenu = useAction(api.onlinePosMenus.save);
  const removeMenu = useMutation(api.onlinePosMenus.remove);
  const [editor, setEditor] = useState<MenuEditor>(null);
  const [selectedMenuProductId, setSelectedMenuProductId] = useState<
    string | null
  >(null);
  const [selectedComponentProductIds, setSelectedComponentProductIds] =
    useState<string[]>([]);
  const [productOptions, setProductOptions] = useState<
    OnlinePosProductOption[] | null
  >(null);
  const [loadingProductOptions, setLoadingProductOptions] = useState(false);
  const [productOptionsError, setProductOptionsError] = useState<string | null>(
    null,
  );
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<OnlinePosMenu | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  async function loadProductOptions(force = false) {
    if (loadingProductOptions || (!force && productOptions !== null)) return;
    setLoadingProductOptions(true);
    setProductOptionsError(null);
    try {
      setProductOptions(await listProductOptions({}));
    } catch (error) {
      setProductOptionsError(
        getUserErrorMessage(
          error,
          "OnlinePOS-produkterne kunne ikke hentes. Prøv igen.",
        ),
      );
    } finally {
      setLoadingProductOptions(false);
    }
  }

  function openCreate() {
    if (!menuData?.connected) return;
    setEditor({ kind: "create" });
    setSelectedMenuProductId(null);
    setSelectedComponentProductIds([]);
    setFormError("");
    void loadProductOptions();
  }

  function openEdit(menu: OnlinePosMenu) {
    setEditor({ kind: "edit", menu });
    setSelectedMenuProductId(String(menu.onlinePosProductId));
    setSelectedComponentProductIds(
      menu.components.map((component) => String(component.onlinePosProductId)),
    );
    setFormError("");
    void loadProductOptions();
  }

  function closeEditor() {
    if (isSaving) return;
    setEditor(null);
    setFormError("");
  }

  async function save() {
    const menuProductId = selectedMenuProductId
      ? parseProductId(selectedMenuProductId)
      : null;
    const componentProductIds = selectedComponentProductIds
      .map(parseProductId)
      .filter((productId): productId is number => productId !== null);

    if (menuProductId === null) {
      setFormError("Vælg menuens OnlinePOS-produkt.");
      return;
    }
    if (componentProductIds.length !== selectedComponentProductIds.length) {
      setFormError("Vælg kun gyldige OnlinePOS-produkter.");
      return;
    }
    if (componentProductIds.length === 0) {
      setFormError("Vælg mindst ét muligt produkt.");
      return;
    }
    if (componentProductIds.includes(menuProductId)) {
      setFormError("Menuens produkt kan ikke også være et produkt i menuen.");
      return;
    }

    setIsSaving(true);
    setFormError("");
    try {
      await saveMenu({
        menuId: editor?.kind === "edit" ? editor.menu.id : null,
        onlinePosProductId: menuProductId,
        componentProductIds,
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
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  const currentMenuId = editor?.kind === "edit" ? editor.menu.id : null;
  const assignedMenuProductIds = new Set(
    menuData.menus
      .filter((menu) => menu.id !== currentMenuId)
      .map((menu) => menu.onlinePosProductId),
  );
  const menuProductOptions = (productOptions ?? []).map((product) => ({
    value: String(product.id),
    label: productLabel(product),
    disabled: assignedMenuProductIds.has(product.id),
  }));
  const componentProductOptions = (productOptions ?? [])
    .filter((product) => String(product.id) !== selectedMenuProductId)
    .map((product) => ({
      value: String(product.id),
      label: productLabel(product),
      disabled: assignedMenuProductIds.has(product.id),
    }));
  const canSave =
    !isSaving &&
    !loadingProductOptions &&
    productOptionsError === null &&
    selectedMenuProductId !== null &&
    selectedComponentProductIds.length > 0;

  return (
    <div className="flex flex-col gap-7 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-3xl flex-col gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">Menuer</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            En menu er den prissatte OnlinePOS-linje. Valgte produktlinjer til 0
            kr., som står lige efter menulinjen, vises som menuens produkter i
            ordreoplysningerne.
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          className="min-h-11 px-4"
          disabled={!menuData.connected}
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
      ) : null}

      {menuData.menus.length === 0 ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UtensilsIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Ingen menuer endnu</EmptyTitle>
            <EmptyDescription>
              Opret en menu for at samle mulige OnlinePOS-produkter i
              ordreoplysningerne.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              className="min-h-11 px-4"
              disabled={!menuData.connected}
              onClick={openCreate}
            >
              <PlusIcon data-icon="inline-start" />
              Ny menu
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {menuData.menus.map((menu) => (
            <MenuCard
              key={menu.id}
              menu={menu}
              onEdit={openEdit}
              onRemove={setPendingDelete}
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
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editor?.kind === "edit" ? "Redigér menu" : "Ny menu"}
            </DialogTitle>
            <DialogDescription>
              Vælg den prissatte menu-linje og de produktlinjer, der kan vises
              under den.
            </DialogDescription>
          </DialogHeader>

          {loadingProductOptions ? (
            <div
              className="flex items-center gap-2 text-sm text-muted-foreground"
              role="status"
            >
              <Spinner />
              Henter OnlinePOS-produkter…
            </div>
          ) : null}
          {productOptionsError ? (
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Produkterne kunne ikke hentes</AlertTitle>
              <AlertDescription>
                <p>{productOptionsError}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 min-h-11"
                  onClick={() => {
                    setProductOptions(null);
                    void loadProductOptions(true);
                  }}
                >
                  Prøv igen
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {productOptions?.length === 0 ? (
            <Alert>
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Ingen OnlinePOS-produkter</AlertTitle>
              <AlertDescription>
                OnlinePOS skal have produkter, før en menu kan oprettes.
              </AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup>
            <Field data-invalid={Boolean(formError)}>
              <FieldLabel>Menuens OnlinePOS-produkt</FieldLabel>
              <CreatableCombobox
                options={menuProductOptions}
                value={selectedMenuProductId}
                onValueChange={(value) => {
                  setSelectedMenuProductId(value);
                  setSelectedComponentProductIds((current) =>
                    current.filter((productId) => productId !== value),
                  );
                  setFormError("");
                }}
                placeholder="Vælg menuens produkt"
                allowCreate={false}
                disabled={loadingProductOptions || productOptionsError !== null}
                ariaLabel="Menuens OnlinePOS-produkt"
              />
            </Field>
            <Field data-invalid={Boolean(formError)}>
              <FieldLabel>Mulige produkter i menuen</FieldLabel>
              <CreatableMultiCombobox
                options={componentProductOptions}
                values={selectedComponentProductIds}
                onValuesChange={(values) => {
                  setSelectedComponentProductIds(values);
                  setFormError("");
                }}
                placeholder="Vælg et eller flere produkter"
                allowCreate={false}
                disabled={loadingProductOptions || productOptionsError !== null}
                ariaLabel="Mulige produkter i menuen"
              />
            </Field>
            <FieldError>{formError}</FieldError>
          </FieldGroup>

          <DialogFooter>
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
