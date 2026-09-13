"use client";

import { useRef, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { PlusIcon, SaveIcon } from "lucide-react";
import { toast } from "sonner";
import { useKiosk } from "@/components/app-shell";
import { CreatableCombobox } from "@/components/catalog/creatable-combobox";
import { PhotoField } from "@/components/photo-field";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { productSearchScore } from "@/lib/product-search";
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
  menuName?: string;
};

const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const MAX_LINES = 100;

export function InvoiceForm() {
  const convex = useConvex();
  const kiosk = useKiosk();
  const locations = useQuery(api.invoices.listLocations, { page: "new" });
  const menus = useQuery(api.invoices.listMenus, {});
  const products = useCompleteCatalog(
    api.catalog.listActiveProductSearchOptionsPage,
    {},
  );
  const createInvoice = useMutation(api.invoices.create);
  const generateUploadUrl = useMutation(api.invoices.generateUploadUrl);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [soldAtLocal, setSoldAtLocal] = useState(() =>
    toDateTimeLocal(Date.now()),
  );
  const [comment, setComment] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [pickerKey, setPickerKey] = useState(0);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [loadingProduct, setLoadingProduct] = useState(false);
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
  const locationId =
    kiosk?.isKioskAccount && kiosk.locationId
      ? kiosk.locationId
      : (selectedLocationId ?? locations?.[0]?.id ?? null);
  const location = locations?.find((option) => option.id === locationId);
  const productAccess = useQuery(
    api.invoices.getProductAccess,
    location ? { locationId: location.id } : "skip",
  );
  const allowedProductIds =
    productAccess === null ? null : new Set(productAccess ?? []);
  const selectedMenu = menus?.find((menu) => menu.id === menuId);
  const menuProducts = selectedMenu
    ? new Set(selectedMenu.products.map((product) => product.id))
    : null;
  const addedProductIds = new Set(
    lines
      .filter((line) => line.menuId === selectedMenu?.id)
      .map((line) => line.productId),
  );
  const productOptions = (products ?? [])
    .filter(
      (product) =>
        !addedProductIds.has(product.id) &&
        (!allowedProductIds || allowedProductIds.has(product.id)) &&
        (!menuProducts || menuProducts.has(product.id)) &&
        productSearchScore(
          product.name,
          product.categoryPath,
          productSearch,
        ) !== null,
    )
    .map((product) => ({ value: product.id, label: product.name }));
  const lineGroups = Array.from(
    lines
      .reduce((groups, line) => {
        const key = `${line.productId}:${line.menuId ?? ""}`;
        const group = groups.get(key);
        if (group) group.push(line);
        else groups.set(key, [line]);
        return groups;
      }, new Map<string, InvoiceLine[]>())
      .values(),
  );

  async function addProduct(value: string | null) {
    const option = products?.find((product) => product.id === value);
    if (
      !option ||
      adding.current ||
      saving.current ||
      productAccess === undefined ||
      (allowedProductIds !== null && !allowedProductIds.has(option.id)) ||
      lines.length >= MAX_LINES
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
        product.units[0];
      if (!unit) throw new Error("Produktet har ingen enheder");
      setLines((current) => [
        ...current,
        {
          key: crypto.randomUUID(),
          productId: product.id,
          productName: product.name,
          imageUrl: product.imageUrl,
          unitId: unit.id,
          units: product.units,
          quantity: "1",
          ...(selectedMenu
            ? { menuId: selectedMenu.id, menuName: selectedMenu.name }
            : {}),
        },
      ]);
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

  function validate() {
    const nextErrors: Record<string, string> = {};
    const soldAt = fromDateTimeLocal(soldAtLocal);
    if (!location) nextErrors.location = "Vælg en lokation";
    if (!title.trim()) nextErrors.title = "Skriv en titel";
    else if (title.trim().length > 200)
      nextErrors.title = "Titlen må højst være 200 tegn";
    if (!soldAtLocal || !Number.isFinite(soldAt) || soldAt <= 0)
      nextErrors.soldAt = "Vælg en gyldig dato";
    else if (soldAt > Date.now() + 60_000)
      nextErrors.soldAt = "Datoen må ikke ligge i fremtiden";
    if (comment.trim().length > 2000)
      nextErrors.comment = "Kommentaren må højst være 2.000 tegn";
    if (!lines.length) nextErrors.items = "Tilføj mindst ét produkt";
    if (location && productAccess === undefined)
      nextErrors.items = "Vent, mens lokationens produkter hentes";
    if (lines.length > MAX_LINES)
      nextErrors.items = "Du kan højst tilføje 100 produktlinjer";
    const items = lines.map((line) => {
      const quantity = Number(line.quantity.trim().replace(",", "."));
      if (
        productAccess !== undefined &&
        allowedProductIds &&
        !allowedProductIds.has(line.productId)
      )
        nextErrors[line.key] =
          "Produktet er ikke tilgængeligt på den valgte lokation. Fjern produktlinjen eller vælg en anden lokation.";
      if (!Number.isFinite(quantity) || quantity <= 0)
        nextErrors[line.key] = "Mængden skal være større end 0";
      return {
        productId: line.productId,
        unitId: line.unitId,
        quantity,
        ...(line.menuId ? { menuId: line.menuId } : {}),
      };
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0 && location
      ? { locationId: location.id, soldAt, items }
      : null;
  }

  async function save() {
    if (saving.current) return;
    const validated = validate();
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
      setSoldAtLocal(toDateTimeLocal(Date.now()));
      setComment("");
      setPhoto(null);
      setLines([]);
      setMenuId(null);
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
                  onValueChange={setSelectedLocationId}
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
                  Kommentar, valgfri
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
              <Field>
                <div className="flex items-center gap-1">
                  <FieldLabel>Menu, valgfri</FieldLabel>
                  <HelpTooltip
                    label="menu"
                    content="Vælg en menu for at finde dens produkter. Tilføj de produkter og mængder, der fremgår af kvitteringen."
                  />
                </div>
                <CreatableCombobox
                  options={[
                    { value: "all", label: "Alle produkter" },
                    ...(menus ?? []).map((menu) => ({
                      value: menu.id,
                      label: menu.name,
                    })),
                  ]}
                  value={menuId ?? "all"}
                  onValueChange={(value) => {
                    setMenuId(value === "all" ? null : value);
                    setProductSearch("");
                    setPickerKey((key) => key + 1);
                  }}
                  placeholder="Søg efter menu"
                  ariaLabel="Menu"
                  disabled={menus === undefined || loadingProduct}
                />
              </Field>
              <Field data-invalid={Boolean(errors.items)}>
                <FieldLabel>Tilføj produkt</FieldLabel>
                <CreatableCombobox
                  key={pickerKey}
                  options={productOptions}
                  value={null}
                  onValueChange={(value) => void addProduct(value)}
                  onInputValueChange={setProductSearch}
                  placeholder={
                    selectedMenu
                      ? "Søg efter produkter i menuen"
                      : "Søg efter produkter"
                  }
                  ariaLabel="Tilføj produkt"
                  ariaInvalid={Boolean(errors.items)}
                  disabled={
                    products === undefined ||
                    productAccess === undefined ||
                    loadingProduct ||
                    lines.length >= MAX_LINES
                  }
                />
                <FieldError>{errors.items}</FieldError>
              </Field>
            </FieldGroup>
            {lines.length === 0 ? (
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
                {lineGroups.map((group) => {
                  const product = group[0];
                  if (!product) return null;
                  const usedUnitIds = new Set(group.map((line) => line.unitId));
                  const nextUnit = product.units.find(
                    (unit) => !usedUnitIds.has(unit.id),
                  );
                  return (
                    <ProductLineGroup
                      key={`${product.productId}:${product.menuId ?? ""}`}
                      productName={product.productName}
                      imageUrl={product.imageUrl}
                      action={
                        nextUnit ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            disabled={
                              lines.length >= MAX_LINES || loadingProduct
                            }
                            onClick={() =>
                              setLines((current) => [
                                ...current,
                                {
                                  ...product,
                                  key: crypto.randomUUID(),
                                  unitId: nextUnit.id,
                                  quantity: "1",
                                },
                              ])
                            }
                          >
                            <PlusIcon data-icon="inline-start" />
                            Tilføj enhed
                          </Button>
                        ) : null
                      }
                    >
                      {product.menuName ? (
                        <Badge variant="secondary">{product.menuName}</Badge>
                      ) : null}
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
                                    item.key === line.key
                                      ? { ...item, unitId }
                                      : item,
                                  ),
                                )
                              }
                              onQuantityChange={(quantity) =>
                                setLines((current) =>
                                  current.map((item) =>
                                    item.key === line.key
                                      ? { ...item, quantity }
                                      : item,
                                  ),
                                )
                              }
                              onRemove={() =>
                                setLines((current) =>
                                  current.filter(
                                    (item) => item.key !== line.key,
                                  ),
                                )
                              }
                            />
                          </li>
                        ))}
                      </ul>
                    </ProductLineGroup>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          className="min-h-12 w-full sm:w-auto"
          disabled={
            isSaving ||
            loadingProduct ||
            locations === undefined ||
            products === undefined ||
            productAccess === undefined
          }
          onClick={() => {
            if (validate()) setConfirming(true);
          }}
        >
          <SaveIcon data-icon="inline-start" />
          Registrér kvittering
        </Button>
      </div>
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
            <AlertDialogAction disabled={isSaving} onClick={() => void save()}>
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
