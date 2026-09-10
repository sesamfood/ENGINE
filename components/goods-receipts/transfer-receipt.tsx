"use client";

import { dateTimeFormatter as sharedDateTimeFormatter } from "@/lib/date";

import { QuantityInput } from "@/components/quantity-input";

import { AppBottomBar } from "@/components/app-bottom-bar";

import { ReceiptProductLine, type ReceiptLine } from "./receipt-product-line";

import { PhotoField } from "@/components/photo-field";

import { parseQuantity } from "@/lib/quantity-input";

import { uploadToStorage } from "@/lib/upload-to-storage";

import { useCompleteCatalog } from "@/hooks/use-complete-catalog";

import { useAccess, usePermission } from "@/components/app-shell";
import {
  CreatableCombobox,
  type ComboboxOption,
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
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  FieldTitle,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { compressImage, evidencePhotoOptions } from "@/lib/compress-image";
import { getUserErrorMessage } from "@/lib/user-errors";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeftIcon,
  CheckIcon,
  PackageCheckIcon,
  PackageIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { Fragment, useState } from "react";
import { toast } from "sonner";

const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const MAX_COMMENT_LENGTH = 500;
const MAX_TRANSFER_ITEMS = 200;
const ACCEPTED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const dateTimeFormatter = sharedDateTimeFormatter("da-DK", {
  dateStyle: "medium",
  timeStyle: "short",
});

const quantityFormatter = new Intl.NumberFormat("da-DK", {
  maximumFractionDigits: 6,
});

type ReceiptDetail = NonNullable<
  ReturnType<typeof useQuery<typeof api.goodsReceipts.getTransferReceipt>>
>;
type PendingReceipt = Extract<ReceiptDetail, { kind: "pending" }>;
type ReceiptItem = PendingReceipt["transfer"]["items"][number];

function normalizeQuantity(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

function initialQuantities(items: ReceiptItem[]) {
  return Object.fromEntries(items.map((item) => [item.id, "0"]));
}

function initialUnitIds(items: ReceiptItem[]) {
  return Object.fromEntries(items.map((item) => [item.id, item.unitId]));
}

function newAdditionalLineKey() {
  return `transfer-receipt-line-${crypto.randomUUID()}`;
}

function TransferReceiptForm({ receipt }: { receipt: PendingReceipt }) {
  const router = useRouter();
  const registerReceipt = useMutation(
    api.goodsReceipts.registerTransferReceipt,
  );
  const generatePhotoUploadUrl = useMutation(
    api.goodsReceipts.generatePhotoUploadUrl,
  );
  const { transfer, products, settings } = receipt;
  const [quantities, setQuantities] = useState(() =>
    initialQuantities(transfer.items),
  );
  const [unitIds, setUnitIds] = useState(() => initialUnitIds(transfer.items));
  const [additionalLines, setAdditionalLines] = useState<ReceiptLine[]>([]);
  const [comment, setComment] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const received = transfer.items.map((item) => ({
    item,
    quantity: parseQuantity(quantities[item.id] ?? ""),
  }));
  const usedPairKeys = new Set([
    ...transfer.items.flatMap((item) => [
      `${item.productId}:${item.unitId}`,
      `${item.productId}:${unitIds[item.id] ?? item.unitId}`,
    ]),
    ...additionalLines.map((line) => `${line.productId}:${line.unitId}`),
  ]);
  const totalLineCount = transfer.items.length + additionalLines.length;
  const productOptions: ComboboxOption[] = products
    .filter(
      (product) =>
        totalLineCount < MAX_TRANSFER_ITEMS &&
        product.units.some(
          (unit) => !usedPairKeys.has(`${product.id}:${unit.id}`),
        ),
    )
    .map((product) => ({ value: product.id, label: product.name }));
  const additionalReceivedLineCount = additionalLines.filter((line) => {
    const quantity = parseQuantity(line.quantity);
    return quantity !== null && quantity > 0;
  }).length;
  const receivedLineCount =
    received.filter(({ quantity }) => quantity !== null && quantity > 0)
      .length + additionalReceivedLineCount;
  const missingLineCount = received.filter(
    ({ quantity }) => quantity === 0,
  ).length;
  const deviationCount =
    received.filter(({ item, quantity }) => {
      if (quantity === null) return true;
      const unit = selectedReceiptUnit(item);
      return (
        normalizeQuantity(quantity * unit.factorToDefault) !==
        sentDefaultQuantity(item)
      );
    }).length + additionalLines.length;

  function receiptUnits(item: ReceiptItem) {
    const catalogUnits =
      products.find((product) => product.id === item.productId)?.units ?? [];
    const originalUnit = {
      id: item.unitId,
      name: item.unitName,
      factorToDefault: item.factorToDefault,
    };
    return catalogUnits.some((unit) => unit.id === item.unitId)
      ? catalogUnits.map((unit) =>
          unit.id === item.unitId ? originalUnit : unit,
        )
      : [originalUnit, ...catalogUnits];
  }

  function selectedReceiptUnit(item: ReceiptItem) {
    const selectedUnitId = unitIds[item.id] ?? item.unitId;
    return (
      receiptUnits(item).find((unit) => unit.id === selectedUnitId) ?? {
        id: item.unitId,
        name: item.unitName,
        factorToDefault: item.factorToDefault,
      }
    );
  }

  function sentDefaultQuantity(item: ReceiptItem) {
    return normalizeQuantity(item.quantity * item.factorToDefault);
  }

  function maximumReceivedQuantity(item: ReceiptItem) {
    return normalizeQuantity(
      sentDefaultQuantity(item) / selectedReceiptUnit(item).factorToDefault,
    );
  }

  function setReceiptItemUnit(item: ReceiptItem, unitId: string | null) {
    if (!unitId) return;
    const nextUnit = receiptUnits(item).find((unit) => unit.id === unitId);
    if (!nextUnit || nextUnit.id === unitIds[item.id]) return;

    const pairIsUsed =
      transfer.items.some(
        (other) =>
          other.id !== item.id &&
          other.productId === item.productId &&
          (other.unitId === nextUnit.id ||
            (unitIds[other.id] ?? other.unitId) === nextUnit.id),
      ) ||
      additionalLines.some(
        (line) =>
          line.productId === item.productId && line.unitId === nextUnit.id,
      );
    if (pairIsUsed) return;

    const currentUnit = selectedReceiptUnit(item);
    const quantity = parseQuantity(quantities[item.id] ?? "");
    setUnitIds((current) => ({ ...current, [item.id]: nextUnit.id }));
    if (quantity !== null) {
      setQuantity(
        item.id,
        normalizeQuantity(
          (quantity * currentUnit.factorToDefault) / nextUnit.factorToDefault,
        ),
      );
    }
  }

  function addProduct(productId: string | null) {
    if (!productId) return;
    const product = products.find((item) => item.id === productId);
    if (!product) {
      toast.error("Produktet blev ikke fundet");
      return;
    }
    const unit =
      product.units.find(
        (item) =>
          item.id === product.defaultUnitId &&
          !usedPairKeys.has(`${product.id}:${item.id}`),
      ) ??
      product.units.find(
        (item) => !usedPairKeys.has(`${product.id}:${item.id}`),
      );
    if (!unit) {
      toast.error("Produktet har ingen flere enheder");
      return;
    }

    setAdditionalLines((current) => [
      ...current,
      {
        key: newAdditionalLineKey(),
        productId: product.id,
        productName: product.name,
        imageUrl: product.imageUrl,
        unitId: unit.id,
        units: product.units,
        quantity: "1",
      },
    ]);
  }

  function setAdditionalLineUnit(lineKey: string, unitId: string | null) {
    if (!unitId) return;
    setAdditionalLines((current) => {
      const line = current.find((item) => item.key === lineKey);
      const unit = line?.units.find((item) => item.id === unitId);
      if (!line || !unit) return current;
      const pairIsUsed =
        transfer.items.some(
          (item) =>
            item.productId === line.productId &&
            (item.unitId === unit.id ||
              (unitIds[item.id] ?? item.unitId) === unit.id),
        ) ||
        current.some(
          (item) =>
            item.key !== line.key &&
            item.productId === line.productId &&
            item.unitId === unit.id,
        );
      if (pairIsUsed) return current;
      return current.map((item) =>
        item.key === line.key ? { ...item, unitId: unit.id } : item,
      );
    });
  }

  function setAdditionalLineQuantity(lineKey: string, quantity: string) {
    setAdditionalLines((current) =>
      current.map((line) =>
        line.key === lineKey ? { ...line, quantity } : line,
      ),
    );
    setErrors((current) => {
      if (!current[lineKey]) return current;
      const next = { ...current };
      delete next[lineKey];
      return next;
    });
  }

  function removeAdditionalLine(lineKey: string) {
    setAdditionalLines((current) =>
      current.filter((line) => line.key !== lineKey),
    );
    setErrors((current) => {
      if (!current[lineKey]) return current;
      const next = { ...current };
      delete next[lineKey];
      return next;
    });
  }

  function setQuantity(itemId: Id<"transferItems">, quantity: number) {
    setQuantities((current) => ({
      ...current,
      [itemId]: String(quantity),
    }));
    setErrors((current) => {
      if (!current[itemId]) return current;
      const next = { ...current };
      delete next[itemId];
      return next;
    });
  }

  function validate() {
    const next: Record<string, string> = {};
    for (const item of transfer.items) {
      const quantity = parseQuantity(quantities[item.id] ?? "");
      const maximum = maximumReceivedQuantity(item);
      if (quantity === null || quantity < 0 || quantity > maximum) {
        next[item.id] =
          `Angiv en mængde mellem 0 og ${quantityFormatter.format(maximum)}`;
      }
    }
    for (const line of additionalLines) {
      const quantity = parseQuantity(line.quantity);
      if (quantity === null || quantity <= 0) {
        next[line.key] = "Angiv en mængde større end nul";
      }
    }
    if (comment.trim().length > MAX_COMMENT_LENGTH) {
      next.comment = "Kommentaren må højst være 500 tegn";
    }
    if (photo && !ACCEPTED_PHOTO_TYPES.has(photo.type)) {
      next.photo = "Vælg et JPEG-, PNG-, WebP- eller AVIF-billede";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function review() {
    if (validate()) setConfirming(true);
  }

  async function uploadPhoto(file: File) {
    const compressed = await compressImage(file, evidencePhotoOptions);
    if (compressed.size > MAX_PHOTO_SIZE) {
      throw new Error("Det komprimerede billede er stadig større end 10 MB");
    }
    return uploadToStorage({
      uploadUrl: await generatePhotoUploadUrl({}),
      file: compressed,
    });
  }

  async function submit() {
    if (!validate()) {
      setConfirming(false);
      return;
    }
    setSubmitting(true);
    try {
      const deliveryNoteStorageId = photo ? await uploadPhoto(photo) : null;
      const items = transfer.items.map((item) => {
        const quantity = parseQuantity(quantities[item.id] ?? "");
        if (quantity === null) {
          throw new Error(`Angiv en modtaget mængde for ${item.productName}`);
        }
        return {
          transferItemId: item.id,
          unitId: selectedReceiptUnit(item).id,
          quantity,
        };
      });
      const additionalItems = additionalLines.map((line) => {
        const quantity = parseQuantity(line.quantity);
        if (quantity === null || quantity <= 0) {
          throw new Error(`Angiv en modtaget mængde for ${line.productName}`);
        }
        return {
          productId: line.productId,
          unitId: line.unitId,
          quantity,
        };
      });
      await registerReceipt({
        transferId: transfer.id,
        items,
        additionalItems,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        ...(deliveryNoteStorageId ? { deliveryNoteStorageId } : {}),
      });
      if (deviationCount > 0) {
        posthog.capture("goods_receipt_registered_with_deviations", {
          item_count: totalLineCount,
          additional_item_count: additionalItems.length,
          deviation_count: deviationCount,
          missing_line_count: missingLineCount,
          has_delivery_note_photo: Boolean(photo),
        });
      } else {
        posthog.capture("goods_receipt_registered", {
          item_count: totalLineCount,
          additional_item_count: additionalItems.length,
          has_delivery_note_photo: Boolean(photo),
        });
      }
      toast.success("Varemodtagelsen er registreret");
      setConfirming(false);
      router.replace("/goods-receipts");
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Varemodtagelsen kunne ikke registreres. Prøv igen.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-24">
      <div>
        <Link
          href="/goods-receipts"
          className={buttonVariants({ variant: "ghost", size: "lg" })}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Tilbage til varemodtagelse
        </Link>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
        <aside className="flex flex-col gap-5">
          {settings.transferDeliveryNotePhotoEnabled ? (
            <Card>
              <CardHeader>
                <CardTitle>Følgeseddel</CardTitle>
                <CardDescription>
                  Tag eller upload et billede, hvis følgesedlen skal gemmes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PhotoField
                  label="Billede af følgeseddel"
                  file={photo}
                  error={errors.photo}
                  disabled={submitting}
                  onChange={(file) => {
                    setPhoto(file);
                    setErrors((current) => {
                      const next = { ...current };
                      delete next.photo;
                      return next;
                    });
                  }}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Transferinfo</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 text-sm">
                <div className="flex flex-col gap-1">
                  <dt className="text-muted-foreground">Fra lokation</dt>
                  <dd className="font-medium">{transfer.fromLocationName}</dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-muted-foreground">Til lokation</dt>
                  <dd className="font-medium">{transfer.toLocationName}</dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-muted-foreground">Transferdato</dt>
                  <dd className="font-medium">
                    {dateTimeFormatter.format(transfer.transferredAt)}
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-muted-foreground">Ansvarlig</dt>
                  <dd className="font-medium">{transfer.responsibleName}</dd>
                </div>
                {transfer.comment ? (
                  <div className="flex flex-col gap-1">
                    <dt className="text-muted-foreground">Transferkommentar</dt>
                    <dd className="font-medium">{transfer.comment}</dd>
                  </div>
                ) : null}
              </dl>
            </CardContent>
          </Card>
        </aside>

        <main className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Overblik</CardTitle>
              <CardAction>
                <Badge variant="secondary">Transfer</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                <div className="flex flex-col gap-1">
                  <dt className="text-sm text-muted-foreground">I alt</dt>
                  <dd className="text-2xl font-semibold tabular-nums">
                    {totalLineCount}
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-sm text-muted-foreground">Modtaget</dt>
                  <dd className="text-2xl font-semibold tabular-nums">
                    {receivedLineCount}
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-sm text-muted-foreground">Mangler</dt>
                  <dd
                    className={cn(
                      "text-2xl font-semibold tabular-nums",
                      missingLineCount > 0 && "text-destructive",
                    )}
                  >
                    {missingLineCount}
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-sm text-muted-foreground">Afvigelser</dt>
                  <dd
                    className={cn(
                      "text-2xl font-semibold tabular-nums",
                      deviationCount > 0 && "text-destructive",
                    )}
                  >
                    {deviationCount}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              review();
            }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Produkter</CardTitle>
                <CardDescription>
                  Registrér den mængde, der faktisk er modtaget.
                </CardDescription>
                <CardAction>
                  <Badge variant="outline">
                    {totalLineCount} produktlinje
                    {totalLineCount === 1 ? "" : "r"}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <ul>
                  {transfer.items.map((item, index) => {
                    const quantity = parseQuantity(quantities[item.id] ?? "");
                    const units = receiptUnits(item);
                    const selectedUnit = selectedReceiptUnit(item);
                    const maximum = maximumReceivedQuantity(item);
                    const fullyReceived =
                      quantity !== null &&
                      normalizeQuantity(
                        quantity * selectedUnit.factorToDefault,
                      ) === sentDefaultQuantity(item);
                    const unavailableUnitIds = new Set([
                      ...transfer.items
                        .filter(
                          (other) =>
                            other.id !== item.id &&
                            other.productId === item.productId,
                        )
                        .flatMap((other) => [
                          other.unitId,
                          unitIds[other.id] ?? other.unitId,
                        ]),
                      ...additionalLines
                        .filter((line) => line.productId === item.productId)
                        .map((line) => line.unitId),
                    ]);
                    const unitItems = units.map((unit) => ({
                      value: unit.id,
                      label: unit.name,
                    }));
                    return (
                      <Fragment key={item.id}>
                        <li className="grid gap-4 py-4 xl:grid-cols-[minmax(12rem,1fr)_minmax(6rem,0.35fr)_minmax(6rem,0.3fr)_auto] xl:items-center">
                          <div className="flex min-w-0 items-center gap-3">
                            {item.imageUrl ? (
                              <Image
                                src={item.imageUrl}
                                alt=""
                                width={48}
                                height={48}
                                className="size-12 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                <PackageIcon
                                  className="size-5"
                                  aria-hidden="true"
                                />
                              </div>
                            )}
                            <span className="truncate font-medium">
                              {item.productName}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-4 xl:contents">
                            <Field>
                              <FieldLabel
                                htmlFor={`goods-receipt-unit-${item.id}`}
                                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                              >
                                Enhed
                              </FieldLabel>
                              <Select
                                items={unitItems}
                                value={selectedUnit.id}
                                onValueChange={(value) =>
                                  setReceiptItemUnit(item, value)
                                }
                              >
                                <SelectTrigger
                                  id={`goods-receipt-unit-${item.id}`}
                                  className="h-11! w-full"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent alignItemWithTrigger={false}>
                                  <SelectGroup>
                                    {units.map((unit) => (
                                      <SelectItem
                                        key={unit.id}
                                        value={unit.id}
                                        disabled={
                                          unit.id !== selectedUnit.id &&
                                          unavailableUnitIds.has(unit.id)
                                        }
                                      >
                                        {unit.name}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            </Field>
                            <Field>
                              <FieldTitle className="text-xs uppercase tracking-wide text-muted-foreground">
                                Sendt
                              </FieldTitle>
                              <span className="flex h-11 items-center tabular-nums">
                                {quantityFormatter.format(maximum)}{" "}
                                {selectedUnit.name}
                              </span>
                            </Field>
                          </div>

                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start xl:justify-end">
                            <Field
                              className="sm:w-auto"
                              data-invalid={Boolean(errors[item.id])}
                            >
                              <FieldLabel
                                htmlFor={`goods-receipt-quantity-${item.id}`}
                                className="sr-only"
                              >
                                Modtaget mængde for {item.productName}
                              </FieldLabel>
                              <QuantityInput
                                id={`goods-receipt-quantity-${item.id}`}
                                label={`Modtaget mængde for ${item.productName}`}
                                value={quantities[item.id] ?? ""}
                                min={0}
                                max={maximum}
                                invalid={Boolean(errors[item.id])}
                                className="w-full sm:w-48"
                                onValueChange={(value) => {
                                  setQuantities((current) => ({
                                    ...current,
                                    [item.id]: value,
                                  }));
                                  setErrors((current) => {
                                    const next = { ...current };
                                    delete next[item.id];
                                    return next;
                                  });
                                }}
                              />
                              <FieldError>{errors[item.id]}</FieldError>
                            </Field>
                            <Button
                              type="button"
                              variant={fullyReceived ? "secondary" : "outline"}
                              size="lg"
                              className="min-h-11"
                              aria-label={`Alt modtaget for ${item.productName}`}
                              disabled={fullyReceived}
                              onClick={() => setQuantity(item.id, maximum)}
                            >
                              <CheckIcon data-icon="inline-start" />
                              Alt modtaget
                            </Button>
                          </div>
                        </li>
                        {index < transfer.items.length - 1 ||
                        additionalLines.length > 0 ? (
                          <Separator />
                        ) : null}
                      </Fragment>
                    );
                  })}

                  {additionalLines.map((line, index) => {
                    const unavailableUnitIds = new Set([
                      ...transfer.items
                        .filter((item) => item.productId === line.productId)
                        .flatMap((item) => [
                          item.unitId,
                          unitIds[item.id] ?? item.unitId,
                        ]),
                      ...additionalLines
                        .filter(
                          (item) =>
                            item.key !== line.key &&
                            item.productId === line.productId,
                        )
                        .map((item) => item.unitId),
                    ]);
                    return (
                      <Fragment key={line.key}>
                        <ReceiptProductLine
                          line={line}
                          unavailableUnitIds={unavailableUnitIds}
                          onUnitChange={(unitId) =>
                            setAdditionalLineUnit(line.key, unitId)
                          }
                          onQuantityChange={(quantity) =>
                            setAdditionalLineQuantity(line.key, quantity)
                          }
                          onRemove={() => removeAdditionalLine(line.key)}
                          error={errors[line.key]}
                        />
                        {index < additionalLines.length - 1 ? (
                          <Separator />
                        ) : null}
                      </Fragment>
                    );
                  })}
                </ul>

                <FieldGroup>
                  <Field>
                    <FieldLabel>Tilføj produkt</FieldLabel>
                    <CreatableCombobox
                      options={productOptions}
                      value={null}
                      onValueChange={addProduct}
                      placeholder="Søg efter produkter"
                      ariaLabel="Tilføj produkt"
                      disabled={productOptions.length === 0}
                    />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Kommentar</CardTitle>
                <CardDescription>
                  Tilføj eventuelt en kommentar til modtagelsen.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Field data-invalid={Boolean(errors.comment)}>
                  <FieldLabel
                    htmlFor="goods-receipt-comment"
                    className="sr-only"
                  >
                    Kommentar
                  </FieldLabel>
                  <Textarea
                    id="goods-receipt-comment"
                    value={comment}
                    maxLength={MAX_COMMENT_LENGTH}
                    aria-invalid={Boolean(errors.comment)}
                    placeholder="Skriv en kommentar til modtagelsen"
                    onChange={(event) => {
                      setComment(event.target.value);
                      setErrors((current) => {
                        if (!current.comment) return current;
                        const next = { ...current };
                        delete next.comment;
                        return next;
                      });
                    }}
                  />
                  <FieldError>{errors.comment}</FieldError>
                </Field>
              </CardContent>
            </Card>

            <AppBottomBar>
              <div className="mx-auto flex w-full max-w-[96rem] justify-end">
                <Button
                  type="submit"
                  size="lg"
                  className="min-h-11 w-full px-5 sm:w-auto"
                  disabled={submitting}
                >
                  <CheckIcon data-icon="inline-start" />
                  Registrér varemodtagelse
                </Button>
              </div>
            </AppBottomBar>
          </form>
        </main>
      </div>

      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!submitting) setConfirming(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrér varemodtagelsen?</AlertDialogTitle>
            <AlertDialogDescription>
              {deviationCount > 0
                ? `${deviationCount} produktlinje${deviationCount === 1 ? "" : "r"} afviger fra transferen. Kun de angivne mængder flyttes, og registreringen kan ikke redigeres bagefter.`
                : "Alle produktlinjer matcher det sendte antal. Mængderne flyttes nu til modtagerlokationen, og registreringen kan ikke redigeres bagefter."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>
              Fortsæt kontrollen
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              Registrér varemodtagelse
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function TransferReceipt({ transferId }: { transferId: string }) {
  const access = useAccess();
  const canRegister = usePermission("goodsReceipts.register");
  const receipt = useQuery(
    api.goodsReceipts.getTransferReceipt,
    canRegister ? { transferId, omitCatalog: true } : "skip",
  );
  const products = useCompleteCatalog(
    api.goodsReceipts.listCatalogPage,
    receipt?.kind === "pending"
      ? { locationId: receipt.transfer.toLocationId }
      : "skip",
  );

  if (!access) {
    return (
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
        <Skeleton className="h-80 w-full" />
        <div className="flex flex-col gap-5">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!canRegister) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at registrere varemodtagelser.
        </AlertDescription>
      </Alert>
    );
  }

  if (
    receipt === undefined ||
    (receipt?.kind === "pending" && products === undefined)
  ) {
    return (
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
        <Skeleton className="h-80 w-full" />
        <div className="flex flex-col gap-5">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (receipt === null) {
    return (
      <Empty className="min-h-80 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageIcon />
          </EmptyMedia>
          <EmptyTitle>Transferen blev ikke fundet</EmptyTitle>
          <EmptyDescription>
            Den kan være slettet, eller du har ikke adgang til
            modtagerlokationen.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link
            href="/goods-receipts"
            className={buttonVariants({ variant: "outline" })}
          >
            Tilbage til varemodtagelse
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  if (receipt.kind === "registered") {
    return (
      <Empty className="min-h-80 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageCheckIcon />
          </EmptyMedia>
          <EmptyTitle>Transferen er allerede modtaget</EmptyTitle>
          <EmptyDescription>
            Den er fjernet fra listen over åbne varemodtagelser.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link
            href="/goods-receipts"
            className={buttonVariants({ variant: "outline" })}
          >
            Se åbne varemodtagelser
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <TransferReceiptForm
      key={receipt.transfer.id}
      receipt={{ ...receipt, products: products ?? [] }}
    />
  );
}
