"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { useKiosk } from "@/components/app-shell";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { CreatableCombobox } from "@/components/catalog/creatable-combobox";
import { PhotoField } from "@/components/photo-field";
import { QuantityInput } from "@/components/quantity-input";
import { ProductLineGroup } from "@/components/product-line-group";
import { ProductUnitLine } from "@/components/product-unit-line";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCompleteCatalog } from "@/hooks/use-complete-catalog";
import { fromDateTimeLocal, toDateTimeLocal } from "@/lib/date";
import { authClient } from "@/lib/auth-client";
import { selectedLocationId } from "@/lib/location-preference";
import { setRegistrationLocation, useWasteLocation } from "@/lib/waste-prefs";
import { uploadToStorage } from "@/lib/upload-to-storage";
import { getUserErrorMessage } from "@/lib/user-errors";

type InvoiceLine = {
  key: string;
  productId: Id<"products">;
  productName: string;
  imageUrl: string | null;
  unitId: Id<"units">;
  units: Array<{ id: Id<"units">; name: string }>;
  quantity: string;
  menuId?: Id<"onlinePosMenus">;
  menuInstanceId?: string;
  menuGroupId?: string;
  menuName?: string;
};

const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const MAX_LINES = 100;

function rebalanceMenuGroup(
  lines: InvoiceLine[],
  selected: InvoiceLine,
  quantity: number,
  required: number,
) {
  const others = lines.filter(
    (line) =>
      line.menuInstanceId === selected.menuInstanceId &&
      line.menuGroupId === selected.menuGroupId &&
      line.key !== selected.key,
  );
  if (others.length >= required) return lines;
  const selectedQuantity = others.length
    ? Math.min(required - others.length, Math.max(1, Math.floor(quantity)))
    : required;
  const quantities = new Map([[selected.key, selectedQuantity]]);
  let remaining = required - selectedQuantity;
  for (let index = 0; index < others.length; index += 1) {
    const line = others[index];
    const next = Math.min(
      Math.max(1, Math.floor(Number(line.quantity))),
      remaining - (others.length - index - 1),
    );
    quantities.set(line.key, next);
    remaining -= next;
  }
  const first = others[0];
  if (first && remaining > 0)
    quantities.set(first.key, (quantities.get(first.key) ?? 1) + remaining);
  return lines.map((line) => {
    const next = quantities.get(line.key);
    return next === undefined || String(next) === line.quantity
      ? line
      : { ...line, quantity: String(next) };
  });
}

export function InvoiceForm({ navigation }: { navigation?: ReactNode }) {
  const convex = useConvex();
  const kiosk = useKiosk();
  const organization = authClient.useActiveOrganization();
  const organizationId = organization.data?.id;
  const storedLocationId = useWasteLocation(organizationId);
  const locations = useQuery(api.invoices.listLocations, { page: "new" });
  const menus = useQuery(api.invoices.listMenus, {});
  const products = useCompleteCatalog(
    api.catalog.listActiveProductSearchOptionsPage,
    {},
  );
  const createInvoice = useMutation(api.invoices.create);
  const generateUploadUrl = useMutation(api.invoices.generateUploadUrl);
  const [title, setTitle] = useState("");
  const [soldAtLocal, setSoldAtLocal] = useState(() =>
    toDateTimeLocal(Date.now()),
  );
  const [comment, setComment] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [menuRows, setMenuRows] = useState<
    Array<{
      id: Id<"onlinePosMenus">;
      name: string;
      key: string;
      quantity: string;
    }>
  >([]);
  const [productSearch, setProductSearch] = useState("");
  const [pickerKey, setPickerKey] = useState(0);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [failedAutoChoices, setFailedAutoChoices] = useState<{
    scope: string;
    keys: string[];
  }>({ scope: "", keys: [] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saving = useRef(false);
  const adding = useRef(false);
  const clientRequestId = useRef<string | null>(null);
  const uploadedPhoto = useRef<{
    file: File;
    storageId: Id<"_storage">;
  } | null>(null);
  const locationId = selectedLocationId({
    locations: locations ?? [],
    storedId: storedLocationId,
    lockedId: kiosk?.locationId ?? null,
    isLocked: Boolean(kiosk?.isKioskAccount),
  });
  const location = locations?.find((option) => option.id === locationId);
  const productAccess = useQuery(
    api.invoices.getProductAccess,
    location ? { locationId: location.id } : "skip",
  );
  const allowedProductIds =
    productAccess === null ? null : new Set(productAccess ?? []);
  const availableProducts = useMemo(() => {
    const allowedIds =
      productAccess === null ? null : new Set(productAccess ?? []);
    return (products ?? []).filter(
      (product) => !allowedIds || allowedIds.has(product.id),
    );
  }, [products, productAccess]);
  const autoChoices = useMemo(
    () =>
      menuRows.flatMap((menu) =>
        (menus?.find((option) => option.id === menu.id)?.groups ?? []).flatMap(
          (group) => {
            const options = availableProducts.filter((product) =>
              group.productIds.includes(product.id),
            );
            const product = options.length === 1 ? options[0] : undefined;
            return product
              ? [
                  {
                    key: JSON.stringify([
                      menu.key,
                      group.id,
                      group.quantity,
                      product.id,
                    ]),
                    menu,
                    group,
                    productId: product.id,
                  },
                ]
              : [];
          },
        ),
      ),
    [menuRows, menus, availableProducts],
  );
  const autoScope = JSON.stringify([
    locationId,
    autoChoices.map((choice) => choice.key),
  ]);
  if (failedAutoChoices.scope !== autoScope) {
    setFailedAutoChoices({ scope: autoScope, keys: [] });
  }
  const pendingAutoChoices = useMemo(() => {
    let remaining = MAX_LINES - lines.length;
    const pending: typeof autoChoices = [];
    for (const choice of autoChoices) {
      if (failedAutoChoices.keys.includes(choice.key)) continue;
      const selected = lines.filter(
        (line) =>
          line.menuInstanceId === choice.menu.key &&
          line.menuGroupId === choice.group.id,
      );
      if (selected.some((line) => line.productId !== choice.productId))
        continue;
      if (
        selected.length === 1 &&
        Number(selected[0].quantity) === choice.group.quantity
      )
        continue;
      if (!selected.length && remaining <= 0) continue;
      remaining += selected.length - 1;
      pending.push(choice);
    }
    return pending;
  }, [autoChoices, failedAutoChoices.keys, lines]);
  const autoAdding = pendingAutoChoices.length > 0;

  useEffect(() => {
    if (
      !pendingAutoChoices.length ||
      loadingProduct ||
      isSaving ||
      adding.current ||
      saving.current
    )
      return;
    let cancelled = false;
    async function fillChoices() {
      const results = await Promise.allSettled(
        pendingAutoChoices.map(async (choice) => {
          const product = await convex.query(api.invoices.getProductOption, {
            productId: choice.productId,
          });
          if (!product) throw new Error("Produktet blev ikke fundet");
          const unit = product.units.find(
            (unit) => unit.id === product.defaultUnitId,
          );
          if (!unit)
            throw new Error("Produktets standardenhed er ikke tilgængelig");
          return { choice, product, unit };
        }),
      );
      if (cancelled) return;
      setLines((current) => {
        let next = current;
        for (const result of results) {
          if (result.status !== "fulfilled") continue;
          const { choice, product, unit } = result.value;
          const selected = next.filter(
            (line) =>
              line.menuInstanceId === choice.menu.key &&
              line.menuGroupId === choice.group.id,
          );
          if (selected.some((line) => line.productId !== choice.productId))
            continue;
          if (!selected.length && next.length >= MAX_LINES) continue;
          const first = selected[0];
          const line: InvoiceLine = {
            key: first?.key ?? crypto.randomUUID(),
            productId: product.id,
            productName: product.name,
            imageUrl: product.imageUrl,
            unitId: unit.id,
            units: product.units,
            quantity: String(choice.group.quantity),
            menuId: choice.menu.id,
            menuInstanceId: choice.menu.key,
            menuName: choice.menu.name,
            menuGroupId: choice.group.id,
          };
          next = first
            ? next.flatMap((item) =>
                item.menuInstanceId === choice.menu.key &&
                item.menuGroupId === choice.group.id
                  ? item.key === first.key
                    ? [line]
                    : []
                  : [item],
              )
            : [...next, line];
        }
        return next;
      });
      const failedKeys = pendingAutoChoices.flatMap((choice, index) =>
        results[index]?.status === "rejected" ? [choice.key] : [],
      );
      if (failedKeys.length) {
        setFailedAutoChoices((current) =>
          current.scope === autoScope
            ? {
                scope: autoScope,
                keys: [...new Set([...current.keys, ...failedKeys])],
              }
            : current,
        );
      }
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") {
        toast.error(
          getUserErrorMessage(
            failed.reason,
            "Menuens produkt kunne ikke tilføjes automatisk. Vælg produktet igen.",
          ),
        );
      }
    }
    void fillChoices();
    return () => {
      cancelled = true;
    };
  }, [autoScope, convex, pendingAutoChoices, loadingProduct, isSaving]);
  const addedProductIds = new Set(
    lines
      .filter((line) => line.menuInstanceId === undefined)
      .map((line) => line.productId),
  );
  const productOptions = availableProducts
    .filter((product) => !addedProductIds.has(product.id))
    .map((product) => ({
      value: product.id,
      label: product.name,
      searchText: product.categoryPath,
    }));
  const menuOptions = (menus ?? [])
    .filter(
      (menu) =>
        menuRows.length < MAX_LINES &&
        menu.name
          .toLocaleLowerCase("da")
          .includes(productSearch.trim().toLocaleLowerCase("da")) &&
        menu.products.some((product) =>
          availableProducts.some((option) => option.id === product.id),
        ),
    )
    .map((menu) => ({ value: `menu:${menu.id}`, label: menu.name }));
  const lineGroups = Array.from(
    lines
      .reduce((groups, line) => {
        const key = `${line.productId}:${line.menuInstanceId ?? ""}`;
        const group = groups.get(key);
        if (group) group.push(line);
        else groups.set(key, [line]);
        return groups;
      }, new Map<string, InvoiceLine[]>())
      .values(),
  );

  async function addProduct(
    value: string | null,
    menuInstanceId?: string,
    menuGroupId?: string,
  ) {
    const option = products?.find((product) => product.id === value);
    const menu = menuRows.find((row) => row.key === menuInstanceId);
    const menuGroup = menus
      ?.find((option) => option.id === menu?.id)
      ?.groups.find((group) => group.id === menuGroupId);
    const groupLines = lines.filter(
      (line) =>
        line.menuInstanceId === menuInstanceId &&
        line.menuGroupId === menuGroupId,
    );
    const replacesGroup = menuGroup?.quantity === 1 && groupLines.length > 0;
    if (
      !option ||
      adding.current ||
      saving.current ||
      autoAdding ||
      (menuInstanceId !== undefined &&
        (!menu ||
          !menuGroup ||
          !menuGroup.productIds.includes(option.id) ||
          (!replacesGroup && groupLines.length >= menuGroup.quantity) ||
          (groupLines.length === 1 &&
            groupLines[0].productId === option.id &&
            Number(groupLines[0].quantity) === menuGroup.quantity) ||
          (menuGroup.quantity > 1 &&
            groupLines.some((line) => line.productId === option.id)))) ||
      (menuInstanceId === undefined &&
        lines.some(
          (line) =>
            line.productId === value && line.menuInstanceId === undefined,
        )) ||
      productAccess === undefined ||
      (allowedProductIds !== null && !allowedProductIds.has(option.id)) ||
      (lines.length >= MAX_LINES && !replacesGroup)
    )
      return;
    adding.current = true;
    setLoadingProduct(true);
    try {
      const product = await convex.query(api.invoices.getProductOption, {
        productId: option.id,
      });
      if (!product) throw new Error("Produktet blev ikke fundet");
      const unit =
        product.units.find((item) => item.id === product.defaultUnitId) ??
        (menu ? undefined : product.units[0]);
      if (!unit)
        throw new Error(
          menu
            ? "Produktets standardenhed er ikke tilgængelig"
            : "Produktet har ingen enheder",
        );
      const newLine: InvoiceLine = {
        key: crypto.randomUUID(),
        productId: product.id,
        productName: product.name,
        imageUrl: product.imageUrl,
        unitId: unit.id,
        units: product.units,
        quantity: "1",
        ...(menu && menuGroup
          ? {
              menuId: menu.id,
              menuInstanceId: menu.key,
              menuName: menu.name,
              menuGroupId: menuGroup.id,
            }
          : {}),
      };
      setLines((current) => {
        if (!menu || !menuGroup) {
          if (
            current.length >= MAX_LINES ||
            current.some(
              (line) => line.productId === product.id && !line.menuInstanceId,
            )
          )
            return current;
          return [...current, newLine];
        }
        const selected = current.filter(
          (line) =>
            line.menuInstanceId === menu.key &&
            line.menuGroupId === menuGroup.id,
        );
        if (menuGroup.quantity === 1) {
          if (!selected.length && current.length >= MAX_LINES) return current;
          return [
            ...current.filter(
              (line) =>
                line.menuInstanceId !== menu.key ||
                line.menuGroupId !== menuGroup.id,
            ),
            newLine,
          ];
        }
        if (
          current.length >= MAX_LINES ||
          selected.length >= menuGroup.quantity ||
          selected.some((line) => line.productId === product.id)
        )
          return current;
        return rebalanceMenuGroup(
          [...current, newLine],
          newLine,
          selected.length ? 1 : menuGroup.quantity,
          menuGroup.quantity,
        );
      });
      setProductSearch("");
      setPickerKey((key) => key + 1);
      setErrors({});
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Produktet kunne ikke tilføjes. Prøv igen."),
      );
    } finally {
      adding.current = false;
      setLoadingProduct(false);
    }
  }

  function validate(now: number) {
    const nextErrors: Record<string, string> = {};
    const soldAt = fromDateTimeLocal(soldAtLocal);
    if (!location) nextErrors.location = "Vælg en lokation";
    if (!title.trim()) nextErrors.title = "Skriv en titel";
    else if (title.trim().length > 200)
      nextErrors.title = "Titlen må højst være 200 tegn";
    if (!soldAtLocal || !Number.isFinite(soldAt) || soldAt <= 0)
      nextErrors.soldAt = "Vælg en gyldig dato";
    else if (soldAt > now + 60_000)
      nextErrors.soldAt = "Datoen må ikke ligge i fremtiden";
    if (comment.trim().length > 2000)
      nextErrors.comment = "Kommentaren må højst være 2.000 tegn";
    if (!lines.length) nextErrors.items = "Tilføj mindst ét produkt";
    for (const menu of menuRows) {
      const quantity = Number(menu.quantity.trim().replace(",", "."));
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) {
        nextErrors[`menuQuantity:${menu.key}`] =
          "Angiv et helt antal menuer mellem 1 og 10.000";
      }
      const currentMenu = menus?.find((option) => option.id === menu.id);
      if (!currentMenu?.groups.length) {
        nextErrors[`menu:${menu.key}`] =
          "Menuen har ingen tilgængelige grupper. Fjern menuen og vælg den igen.";
        continue;
      }
      for (const group of currentMenu.groups) {
        const selectedCount = lines
          .filter(
            (line) =>
              line.menuInstanceId === menu.key &&
              line.menuGroupId === group.id,
          )
          .reduce((sum, line) => sum + Number(line.quantity), 0);
        if (selectedCount !== group.quantity) {
          nextErrors[`menu:${menu.key}:${group.id}`] =
            `Vælg præcis ${group.quantity} ${group.quantity === 1 ? "produkt" : "produkter"} i ${group.title}`;
        }
      }
    }
    if (location && productAccess === undefined)
      nextErrors.items = "Vent, mens lokationens produkter hentes";
    if (lines.length > MAX_LINES)
      nextErrors.items = "Du kan højst tilføje 100 produktlinjer";
    const items = lines.map((line) => {
      const quantity = Number(line.quantity.trim().replace(",", "."));
      if (line.menuId) {
        const menuRow = menuRows.find(
          (menu) => menu.key === line.menuInstanceId,
        );
        const group = menus
          ?.find((menu) => menu.id === line.menuId)
          ?.groups.find((group) => group.id === line.menuGroupId);
        if (
          menuRow?.id !== line.menuId ||
          !group?.productIds.includes(line.productId)
        ) {
          nextErrors[line.key] =
            "Produktvalget findes ikke længere i menuens gruppe. Fjern valget og vælg et produkt igen.";
        }
      }
      if (
        productAccess !== undefined &&
        allowedProductIds &&
        !allowedProductIds.has(line.productId)
      )
        nextErrors[line.key] =
          "Produktet er ikke tilgængeligt på den valgte lokation. Fjern produktlinjen eller vælg en anden lokation.";
      if (!Number.isFinite(quantity) || quantity <= 0)
        nextErrors[line.key] = "Mængden skal være større end 0";
      else if (line.menuId && !Number.isInteger(quantity))
        nextErrors[line.key] = "Mængden i en menu skal være et helt tal";
      return {
        productId: line.productId,
        unitId: line.unitId,
        quantity,
        ...(line.menuId
          ? {
              menuId: line.menuId,
              menuInstanceId: line.menuInstanceId,
              menuQuantity: Number(
                menuRows
                  .find((menu) => menu.key === line.menuInstanceId)
                  ?.quantity.trim()
                  .replace(",", "."),
              ),
            }
          : {}),
        ...(line.menuGroupId ? { menuGroupId: line.menuGroupId } : {}),
      };
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0 && location
      ? { locationId: location.id, soldAt, items }
      : null;
  }

  async function save(now: number) {
    if (saving.current) return;
    const validated = validate(now);
    if (!validated) {
      setConfirming(false);
      return;
    }
    saving.current = true;
    setIsSaving(true);
    clientRequestId.current ??= crypto.randomUUID();
    try {
      let receiptStorageId: Id<"_storage"> | undefined;
      if (photo) {
        if (uploadedPhoto.current?.file !== photo) {
          const storageId = await uploadToStorage({
            uploadUrl: await generateUploadUrl({}),
            file: photo,
          });
          uploadedPhoto.current = { file: photo, storageId };
        }
        receiptStorageId = uploadedPhoto.current.storageId;
      }
      await createInvoice({
        ...validated,
        title: title.trim(),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        ...(receiptStorageId ? { receiptStorageId } : {}),
        clientRequestId: clientRequestId.current,
      });
      setTitle("");
      setSoldAtLocal(toDateTimeLocal(now));
      setComment("");
      setPhoto(null);
      setLines([]);
      setMenuRows([]);
      setProductSearch("");
      setPickerKey((key) => key + 1);
      setErrors({});
      setConfirming(false);
      clientRequestId.current = null;
      uploadedPhoto.current = null;
      toast.success("Kvitteringen er registreret, og lageret er opdateret");
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Kvitteringen kunne ikke registreres. Prøv igen.",
        ),
      );
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  }

  function removeMenuProduct(line: InvoiceLine) {
    if (saving.current || adding.current || autoAdding) return;
    const required = menus
      ?.find((menu) => menu.id === line.menuId)
      ?.groups.find((group) => group.id === line.menuGroupId)?.quantity;
    setLines((current) => {
      const removed = current.find((item) => item.key === line.key);
      const next = current.filter((item) => item.key !== line.key);
      const first = next.find(
        (item) =>
          item.menuInstanceId === line.menuInstanceId &&
          item.menuGroupId === line.menuGroupId,
      );
      return removed && first && required
        ? rebalanceMenuGroup(
            next,
            first,
            Number(first.quantity) + Number(removed.quantity),
            required,
          )
        : next;
    });
  }

  function renderMenuProduct(line: InvoiceLine, menuLabel: string) {
    const selected = lines.filter(
      (item) =>
        item.menuInstanceId === line.menuInstanceId &&
        item.menuGroupId === line.menuGroupId,
    );
    const required = menus
      ?.find((menu) => menu.id === line.menuId)
      ?.groups.find((group) => group.id === line.menuGroupId)?.quantity;
    return (
      <ProductLineGroup
        key={line.key}
        productName={line.productName}
        imageUrl={line.imageUrl}
        action={
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="size-11"
            aria-label={`Fjern ${line.productName} fra ${menuLabel}`}
            disabled={loadingProduct || autoAdding || isSaving}
            onClick={() => removeMenuProduct(line)}
          >
            <Trash2Icon data-icon="inline-start" />
          </Button>
        }
      >
        <Field data-invalid={Boolean(errors[line.key])}>
          <QuantityInput
            id={`${line.key}-quantity`}
            label={`Mængde for ${line.productName} pr. menu i ${menuLabel}`}
            value={Number(line.quantity)}
            min={1}
            max={Math.max(1, (required ?? 1) - selected.length + 1)}
            integer
            disabled={
              !required ||
              selected.length === 1 ||
              selected.length > required ||
              loadingProduct ||
              autoAdding ||
              isSaving
            }
            invalid={Boolean(errors[line.key])}
            onValueChange={(value) => {
              const quantity = Number(value.trim().replace(",", "."));
              if (
                !required ||
                !Number.isFinite(quantity) ||
                saving.current ||
                adding.current ||
                autoAdding
              )
                return;
              setLines((current) =>
                rebalanceMenuGroup(current, line, quantity, required),
              );
            }}
            className="w-full sm:w-48"
          />
          <FieldError>{errors[line.key]}</FieldError>
        </Field>
      </ProductLineGroup>
    );
  }

  function renderProductGroup(group: InvoiceLine[]) {
    const product = group[0];
    if (!product) return null;
    const usedUnitIds = new Set(group.map((line) => line.unitId));
    const nextUnit = product.units.find((unit) => !usedUnitIds.has(unit.id));
    return (
      <ProductLineGroup
        key={product.menuInstanceId ? product.key : product.productId}
        productName={product.productName}
        imageUrl={product.imageUrl}
        action={
          nextUnit && !product.menuInstanceId ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={
                lines.length >= MAX_LINES ||
                loadingProduct ||
                autoAdding ||
                productAccess === undefined
              }
              onClick={() => {
                if (saving.current || adding.current || autoAdding) return;
                setLines((current) => {
                  if (current.length >= MAX_LINES) return current;
                  const unit = product.units.find(
                    (unit) =>
                      !current.some(
                        (line) =>
                          line.productId === product.productId &&
                          line.menuInstanceId === product.menuInstanceId &&
                          line.unitId === unit.id,
                      ),
                  );
                  return unit
                    ? [
                        ...current,
                        {
                          ...product,
                          key: crypto.randomUUID(),
                          unitId: unit.id,
                          quantity: "1",
                        },
                      ]
                    : current;
                });
              }}
            >
              <PlusIcon data-icon="inline-start" />
              Tilføj enhed
            </Button>
          ) : null
        }
      >
        <ul className="flex flex-col gap-2">
          {group.map((line) => (
            <li key={line.key} className="py-2">
              <ProductUnitLine
                lineKey={line.key}
                productName={line.productName}
                units={line.units}
                unitId={line.unitId}
                unavailableUnitIds={usedUnitIds}
                quantity={line.quantity}
                min={0}
                error={errors[line.key]}
                onUnitChange={(unitId) =>
                  setLines((current) =>
                    current.map((item) =>
                      item.key === line.key ? { ...item, unitId } : item,
                    ),
                  )
                }
                onQuantityChange={(quantity) =>
                  setLines((current) =>
                    current.map((item) =>
                      item.key === line.key ? { ...item, quantity } : item,
                    ),
                  )
                }
                onRemove={() =>
                  setLines((current) =>
                    current.filter((item) => item.key !== line.key),
                  )
                }
              />
            </li>
          ))}
        </ul>
      </ProductLineGroup>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        inert={isSaving}
        className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
      >
        <Card>
          <CardHeader>
            <CardTitle>Detaljer</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={Boolean(errors.location)}>
                <FieldLabel>Lokation</FieldLabel>
                <CreatableCombobox
                  options={(locations ?? []).map((option) => ({
                    value: option.id,
                    label: option.name,
                  }))}
                  value={locationId}
                  onValueChange={(value) => {
                    const nextLocation = locations?.find(
                      (option) => option.id === value,
                    );
                    if (organizationId && nextLocation) {
                      setRegistrationLocation(organizationId, nextLocation.id);
                    }
                  }}
                  placeholder="Søg efter lokation"
                  ariaLabel="Lokation"
                  ariaInvalid={Boolean(errors.location)}
                  disabled={
                    locations === undefined || Boolean(kiosk?.isKioskAccount)
                  }
                />
                <FieldError>{errors.location}</FieldError>
              </Field>
              <Field data-invalid={Boolean(errors.title)}>
                <FieldLabel htmlFor="invoice-title">Titel</FieldLabel>
                <Input
                  id="invoice-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={200}
                  placeholder="Titel på salget"
                  className="h-11"
                  aria-invalid={Boolean(errors.title)}
                />
                <FieldError>{errors.title}</FieldError>
              </Field>
              <Field data-invalid={Boolean(errors.soldAt)}>
                <div className="flex items-center gap-1">
                  <FieldLabel htmlFor="invoice-date">
                    Dato og tidspunkt
                  </FieldLabel>
                  <HelpTooltip
                    label="salgsdato"
                    content="Angiv tidspunktet på kvitteringen. Salg før produktets seneste Count er allerede medregnet og trækkes ikke fra lageret igen."
                  />
                </div>
                <Input
                  id="invoice-date"
                  type="datetime-local"
                  value={soldAtLocal}
                  onChange={(event) => setSoldAtLocal(event.target.value)}
                  className="h-11"
                  aria-invalid={Boolean(errors.soldAt)}
                />
                <FieldError>{errors.soldAt}</FieldError>
              </Field>
              <Field data-invalid={Boolean(errors.comment)}>
                <FieldLabel htmlFor="invoice-comment">
                  Kommentar (valgfri)
                </FieldLabel>
                <Textarea
                  id="invoice-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  maxLength={2000}
                  rows={3}
                  aria-invalid={Boolean(errors.comment)}
                />
                <FieldError>{errors.comment}</FieldError>
              </Field>
              <PhotoField
                label="Billede af kvittering, valgfrit"
                file={photo}
                onChange={setPhoto}
                maxFileSize={MAX_PHOTO_SIZE}
                disabled={isSaving}
              />
            </FieldGroup>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Produkter</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FieldGroup>
              <Field data-invalid={Boolean(errors.items)}>
                <FieldLabel>Tilføj produkt eller menu</FieldLabel>
                <CreatableCombobox
                  key={pickerKey}
                  options={[...menuOptions, ...productOptions]}
                  suggestionLabel="Menuer"
                  suggestionOptions={menuOptions}
                  value={null}
                  onValueChange={(value) => {
                    const menu = menus?.find(
                      (option) => `menu:${option.id}` === value,
                    );
                    if (menu) {
                      if (
                        saving.current ||
                        adding.current ||
                        autoAdding ||
                        lines.length >= MAX_LINES ||
                        menuRows.length >= MAX_LINES
                      )
                        return;
                      setMenuRows((current) =>
                        current.length >= MAX_LINES
                          ? current
                          : [
                              ...current,
                              {
                                id: menu.id,
                                name: menu.name,
                                key: crypto.randomUUID(),
                                quantity: "1",
                              },
                            ],
                      );
                      setProductSearch("");
                      setPickerKey((key) => key + 1);
                    } else {
                      void addProduct(value);
                    }
                  }}
                  onInputValueChange={setProductSearch}
                  placeholder="Søg efter produkt, menu eller kategori"
                  ariaLabel="Tilføj produkt eller menu"
                  ariaInvalid={Boolean(errors.items)}
                  disabled={
                    products === undefined ||
                    menus === undefined ||
                    productAccess === undefined ||
                    loadingProduct ||
                    autoAdding ||
                    lines.length >= MAX_LINES
                  }
                />
                <FieldError>{errors.items}</FieldError>
              </Field>
            </FieldGroup>
            {lines.length === 0 && menuRows.length === 0 ? (
              <Empty className="border p-5">
                <EmptyHeader>
                  <EmptyTitle>Ingen produkter tilføjet</EmptyTitle>
                  <EmptyDescription>
                    Tilføj produkterne fra kvitteringen.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ul className="flex flex-col gap-3">
                {lineGroups
                  .filter((group) => group[0]?.menuInstanceId === undefined)
                  .map(renderProductGroup)}
                {menuRows.map((menu, index) => {
                  const menuLabel = `${menu.name}, menu ${index + 1}`;
                  const currentMenu = menus?.find(
                    (option) => option.id === menu.id,
                  );
                  const menuLines = lines.filter(
                    (line) => line.menuInstanceId === menu.key,
                  );
                  const ungroupedLines = menuLines.filter(
                    (line) =>
                      !currentMenu?.groups.some(
                        (group) => group.id === line.menuGroupId,
                      ),
                  );
                  const menuError = errors[`menu:${menu.key}`];
                  return (
                    <li key={menu.key}>
                      <Card className="border">
                        <CardHeader>
                          <CardTitle className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">Menu</Badge>
                            {menu.name}
                          </CardTitle>
                          <CardAction>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-lg"
                              className="size-11"
                              aria-label={`Fjern ${menuLabel}`}
                              disabled={loadingProduct || isSaving}
                              onClick={() => {
                                if (saving.current || adding.current) return;
                                setMenuRows((current) =>
                                  current.filter((row) => row.key !== menu.key),
                                );
                                setLines((current) =>
                                  current.filter(
                                    (line) => line.menuInstanceId !== menu.key,
                                  ),
                                );
                              }}
                            >
                              <Trash2Icon data-icon="inline-start" />
                            </Button>
                          </CardAction>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-5">
                          <FieldGroup>
                            <Field
                              data-invalid={Boolean(
                                errors[`menuQuantity:${menu.key}`],
                              )}
                            >
                              <FieldLabel htmlFor={`menu-quantity-${menu.key}`}>
                                Antal menuer
                              </FieldLabel>
                              <QuantityInput
                                id={`menu-quantity-${menu.key}`}
                                label={`Mængde for ${menuLabel}`}
                                value={menu.quantity}
                                onValueChange={(quantity) =>
                                  setMenuRows((current) =>
                                    current.map((row) =>
                                      row.key === menu.key
                                        ? { ...row, quantity }
                                        : row,
                                    ),
                                  )
                                }
                                min={1}
                                max={10_000}
                                integer
                                invalid={Boolean(
                                  errors[`menuQuantity:${menu.key}`],
                                )}
                                disabled={isSaving}
                                className="w-full sm:w-48"
                              />
                              <FieldError>
                                {errors[`menuQuantity:${menu.key}`]}
                              </FieldError>
                            </Field>
                          </FieldGroup>
                          <p className="text-sm text-muted-foreground">
                            Antallet af valg gælder pr. menu.
                          </p>
                          <FieldError>{menuError}</FieldError>
                          {(currentMenu?.groups ?? []).map((group) => {
                            const selectedLines = menuLines.filter(
                              (line) => line.menuGroupId === group.id,
                            );
                            const options = availableProducts
                              .filter((product) =>
                                group.productIds.includes(product.id),
                              )
                              .map((product) => ({
                                value: product.id,
                                label: product.name,
                                searchText: product.categoryPath,
                              }));
                            const selectedQuantity = selectedLines.reduce(
                              (sum, line) => sum + Number(line.quantity),
                              0,
                            );
                            const soleSelected =
                              selectedLines.length === 1 &&
                              options.length === 1 &&
                              selectedLines[0].productId === options[0].value &&
                              selectedQuantity === group.quantity;
                            const pickerOnly =
                              group.quantity === 1 || soleSelected;
                            const pickerOptions = pickerOnly
                              ? options
                              : options.filter(
                                  (option) =>
                                    !selectedLines.some(
                                      (line) => line.productId === option.value,
                                    ),
                                );
                            const error =
                              errors[`menu:${menu.key}:${group.id}`] ??
                              selectedLines
                                .map((line) => errors[line.key])
                                .find(Boolean);
                            return (
                              <div
                                key={group.id}
                                className="flex flex-col gap-3"
                              >
                                <FieldGroup>
                                  <Field data-invalid={Boolean(error)}>
                                    <FieldLabel className="flex flex-wrap items-center gap-2">
                                      {group.title}
                                      <Badge variant="secondary">
                                        {selectedQuantity} af {group.quantity}{" "}
                                        valgt
                                      </Badge>
                                    </FieldLabel>
                                    <CreatableCombobox
                                      key={`${menu.key}:${group.id}:${pickerKey}`}
                                      options={pickerOptions}
                                      value={
                                        pickerOnly
                                          ? (selectedLines[0]?.productId ??
                                            null)
                                          : null
                                      }
                                      onValueChange={(value) => {
                                        if (value) {
                                          void addProduct(
                                            value,
                                            menu.key,
                                            group.id,
                                          );
                                        } else if (
                                          pickerOnly &&
                                          !soleSelected &&
                                          !saving.current &&
                                          !adding.current &&
                                          !autoAdding
                                        ) {
                                          setLines((current) =>
                                            current.filter(
                                              (line) =>
                                                line.menuInstanceId !==
                                                  menu.key ||
                                                line.menuGroupId !== group.id,
                                            ),
                                          );
                                        }
                                      }}
                                      placeholder="Søg efter produkt eller kategori"
                                      ariaLabel={`Vælg produkt til ${group.title} i ${menuLabel}`}
                                      ariaInvalid={Boolean(error)}
                                      disabled={
                                        products === undefined ||
                                        menus === undefined ||
                                        productAccess === undefined ||
                                        loadingProduct ||
                                        autoAdding ||
                                        soleSelected ||
                                        (lines.length >= MAX_LINES &&
                                          !(
                                            group.quantity === 1 &&
                                            selectedLines.length > 0
                                          )) ||
                                        (!pickerOnly &&
                                          selectedLines.length >=
                                            group.quantity)
                                      }
                                    />
                                    <FieldError>{error}</FieldError>
                                  </Field>
                                </FieldGroup>
                                {!pickerOnly && selectedLines.length > 0 ? (
                                  <ul className="flex flex-col gap-3">
                                    {selectedLines.map((line) =>
                                      renderMenuProduct(line, menuLabel),
                                    )}
                                  </ul>
                                ) : null}
                              </div>
                            );
                          })}
                          {ungroupedLines.length > 0 ? (
                            <ul className="flex flex-col gap-3">
                              {ungroupedLines.map((line) =>
                                renderMenuProduct(line, menuLabel),
                              )}
                            </ul>
                          ) : null}
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <AppBottomBar>
        <div className="mx-auto flex w-full max-w-[96rem] flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center">
          {navigation ? (
            <div className="min-w-0" inert={isSaving}>
              {navigation}
            </div>
          ) : null}
          <Button
            type="button"
            className="h-12 w-full sm:ml-auto sm:w-auto sm:min-w-52"
            disabled={
              isSaving ||
              loadingProduct ||
              autoAdding ||
              locations === undefined ||
              products === undefined ||
              menus === undefined ||
              productAccess === undefined
            }
            onClick={() => {
              if (validate(Date.now())) setConfirming(true);
            }}
          >
            <SaveIcon data-icon="inline-start" />
            Registrér kvittering
          </Button>
        </div>
      </AppBottomBar>
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!saving.current) setConfirming(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrér kvitteringen?</AlertDialogTitle>
            <AlertDialogDescription>
              Salget &quot;{title.trim()}&quot; registreres på {location?.name}.
              De valgte mængder trækkes fra lageret. Salg før produktets seneste
              Count trækkes ikke fra igen. Registreringen kan ikke redigeres
              eller slettes her.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Annullér</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSaving}
              onClick={() => void save(Date.now())}
            >
              {isSaving ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <SaveIcon data-icon="inline-start" />
              )}
              {isSaving ? "Registrerer…" : "Registrér og træk fra lager"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
