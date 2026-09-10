"use client";

import { toDateTimeLocal, fromDateTimeLocal } from "@/lib/date";

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
import { useGoodsReceiptContext } from "@/components/goods-receipts/goods-receipt-header";
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
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import Link from "next/link";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { Fragment, useState } from "react";
import { toast } from "sonner";

const MAX_COMMENT_LENGTH = 500;
const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;
const MAX_MANUAL_RECEIPT_ITEMS = 200;
const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const ACCEPTED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

type ManualReceiptOptions = NonNullable<
  ReturnType<typeof useQuery<typeof api.goodsReceipts.getManualReceiptOptions>>
>;

type ReceiptItemInput = {
  productId: Id<"products">;
  unitId: Id<"units">;
  quantity: number;
};

function newLineKey() {
  return `manual-receipt-line-${crypto.randomUUID()}`;
}

function ManualGoodsReceiptForm({
  locationId,
  options,
}: {
  locationId: Id<"locations">;
  options: ManualReceiptOptions;
}) {
  const router = useRouter();
  const createReceipt = useMutation(api.goodsReceipts.createManualReceipt);
  const generatePhotoUploadUrl = useMutation(
    api.goodsReceipts.generateManualPhotoUploadUrl,
  );
  const [receivedAtLocal, setReceivedAtLocal] = useState(() =>
    toDateTimeLocal(Date.now()),
  );
  const [comment, setComment] = useState("");
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const productOptions: ComboboxOption[] = options.products
    .filter((product) => {
      if (lines.length >= MAX_MANUAL_RECEIPT_ITEMS) return false;
      const usedUnitIds = new Set(
        lines
          .filter((line) => line.productId === product.id)
          .map((line) => line.unitId),
      );
      return product.units.some((unit) => !usedUnitIds.has(unit.id));
    })
    .map((product) => ({ value: product.id, label: product.name }));
  const receivedLineCount = lines.filter((line) => {
    const quantity = parseQuantity(line.quantity);
    return quantity !== null && quantity > 0;
  }).length;
  const missingLineCount = lines.length - receivedLineCount;

  function addProduct(productId: string | null) {
    if (!productId) return;
    if (lines.length >= MAX_MANUAL_RECEIPT_ITEMS) {
      toast.error("Der kan højst tilføjes 200 produktlinjer");
      return;
    }
    const product = options.products.find((item) => item.id === productId);
    if (!product) {
      toast.error("Produktet blev ikke fundet");
      return;
    }
    const usedUnitIds = new Set(
      lines
        .filter((line) => line.productId === product.id)
        .map((line) => line.unitId),
    );
    const unit =
      product.units.find(
        (item) =>
          item.id === product.defaultUnitId && !usedUnitIds.has(item.id),
      ) ?? product.units.find((item) => !usedUnitIds.has(item.id));
    if (!unit) {
      toast.error("Produktet har ingen flere enheder");
      return;
    }

    setLines((current) => [
      ...current,
      {
        key: newLineKey(),
        productId: product.id,
        productName: product.name,
        imageUrl: product.imageUrl,
        unitId: unit.id,
        units: product.units,
        quantity: "1",
      },
    ]);
    setErrors((current) => {
      if (!current.items) return current;
      const next = { ...current };
      delete next.items;
      return next;
    });
  }

  function setLineUnit(lineKey: string, unitId: string | null) {
    if (!unitId) return;
    setLines((current) => {
      const line = current.find((item) => item.key === lineKey);
      const unit = line?.units.find((item) => item.id === unitId);
      if (!line || !unit) return current;
      if (
        current.some(
          (item) =>
            item.key !== line.key &&
            item.productId === line.productId &&
            item.unitId === unit.id,
        )
      ) {
        return current;
      }
      return current.map((item) =>
        item.key === line.key ? { ...item, unitId: unit.id } : item,
      );
    });
  }

  function setLineQuantity(lineKey: string, quantity: string) {
    setLines((current) =>
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

  function removeLine(lineKey: string) {
    setLines((current) => current.filter((line) => line.key !== lineKey));
    setErrors((current) => {
      if (!current[lineKey]) return current;
      const next = { ...current };
      delete next[lineKey];
      return next;
    });
  }

  function selectPhoto(nextPhoto: File | null) {
    setPhoto(nextPhoto);
    setErrors((current) => {
      if (!current.photo) return current;
      const next = { ...current };
      delete next.photo;
      return next;
    });
  }

  function validate() {
    const nextErrors: Record<string, string> = {};
    const receivedAt = fromDateTimeLocal(receivedAtLocal);
    if (
      !Number.isFinite(receivedAt) ||
      receivedAt <= 0 ||
      receivedAt > Date.now() + MAX_FUTURE_SKEW_MS
    ) {
      nextErrors.receivedAt = "Angiv et gyldigt modtagelsestidspunkt";
    }
    if (comment.trim().length > MAX_COMMENT_LENGTH) {
      nextErrors.comment = "Kommentaren må højst være 500 tegn";
    }
    if (photo && !ACCEPTED_PHOTO_TYPES.has(photo.type)) {
      nextErrors.photo = "Vælg et JPEG-, PNG-, WebP- eller AVIF-billede";
    }
    if (lines.length === 0) {
      nextErrors.items = "Tilføj mindst ét produkt";
    } else if (lines.length > MAX_MANUAL_RECEIPT_ITEMS) {
      nextErrors.items = "Der kan højst tilføjes 200 produktlinjer";
    }

    const items: ReceiptItemInput[] = [];
    for (const line of lines) {
      const quantity = parseQuantity(line.quantity);
      if (quantity === null || quantity <= 0) {
        nextErrors[line.key] = "Angiv en mængde større end nul";
        continue;
      }
      items.push({
        productId: line.productId,
        unitId: line.unitId,
        quantity,
      });
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0 ? { items, receivedAt } : null;
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
    const validated = validate();
    if (!validated) {
      setConfirming(false);
      return;
    }

    setSubmitting(true);
    try {
      const deliveryNoteStorageId = photo ? await uploadPhoto(photo) : null;
      await createReceipt({
        locationId,
        receivedAt: validated.receivedAt,
        items: validated.items,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        ...(deliveryNoteStorageId ? { deliveryNoteStorageId } : {}),
      });
      posthog.capture("manual_goods_receipt_created", {
        item_count: validated.items.length,
        has_delivery_note_photo: Boolean(photo),
      });
      toast.success("Den manuelle varemodtagelse er registreret");
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
                onChange={selectPhoto}
                disabled={submitting}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Modtagelsesinfo</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-disabled>
                  <FieldLabel htmlFor="manual-goods-receipt-location">
                    Lokation
                  </FieldLabel>
                  <Input
                    id="manual-goods-receipt-location"
                    value={options.locationName}
                    disabled
                  />
                </Field>
                <Field data-invalid={Boolean(errors.receivedAt)}>
                  <FieldLabel htmlFor="manual-goods-receipt-received-at">
                    Modtaget
                  </FieldLabel>
                  <Input
                    id="manual-goods-receipt-received-at"
                    type="datetime-local"
                    value={receivedAtLocal}
                    aria-invalid={Boolean(errors.receivedAt)}
                    onChange={(event) => {
                      setReceivedAtLocal(event.target.value);
                      setErrors((current) => {
                        if (!current.receivedAt) return current;
                        const next = { ...current };
                        delete next.receivedAt;
                        return next;
                      });
                    }}
                  />
                  <FieldError>{errors.receivedAt}</FieldError>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </aside>

        <main className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Overblik</CardTitle>
              <CardAction>
                <Badge variant="secondary">Manuel</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <dt className="text-sm text-muted-foreground">I alt</dt>
                  <dd className="text-2xl font-semibold tabular-nums">
                    {lines.length}
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
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Produkter</CardTitle>
              <CardDescription>
                Registrér den mængde, der faktisk er modtaget.
              </CardDescription>
              <CardAction>
                <Badge variant="outline">
                  {lines.length} produktlinje
                  {lines.length === 1 ? "" : "r"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {lines.length === 0 ? (
                <Empty className="min-h-32 border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <PackageIcon />
                    </EmptyMedia>
                    <EmptyTitle>Ingen produkter tilføjet</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul>
                  {lines.map((line, index) => {
                    const unavailableUnitIds = new Set(
                      lines
                        .filter(
                          (item) =>
                            item.key !== line.key &&
                            item.productId === line.productId,
                        )
                        .map((item) => item.unitId),
                    );

                    return (
                      <Fragment key={line.key}>
                        <ReceiptProductLine
                          line={line}
                          unavailableUnitIds={unavailableUnitIds}
                          onUnitChange={(unitId) =>
                            setLineUnit(line.key, unitId)
                          }
                          onQuantityChange={(quantity) =>
                            setLineQuantity(line.key, quantity)
                          }
                          onRemove={() => removeLine(line.key)}
                          error={errors[line.key]}
                        />
                        {index < lines.length - 1 ? <Separator /> : null}
                      </Fragment>
                    );
                  })}
                </ul>
              )}

              <FieldGroup>
                <Field data-invalid={Boolean(errors.items)}>
                  <FieldLabel>Tilføj produkt</FieldLabel>
                  <CreatableCombobox
                    options={productOptions}
                    value={null}
                    onValueChange={addProduct}
                    placeholder="Søg efter produkter"
                    ariaLabel="Tilføj produkt"
                    disabled={productOptions.length === 0}
                  />
                  <FieldError>{errors.items}</FieldError>
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
                  htmlFor="manual-goods-receipt-comment"
                  className="sr-only"
                >
                  Kommentar
                </FieldLabel>
                <Textarea
                  id="manual-goods-receipt-comment"
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
                type="button"
                size="lg"
                className="min-h-11 w-full px-5 sm:w-auto"
                disabled={submitting || lines.length === 0}
                onClick={review}
              >
                <CheckIcon data-icon="inline-start" />
                Registrér varemodtagelse
              </Button>
            </div>
          </AppBottomBar>
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
              {lines.length} produktlinje{lines.length === 1 ? "" : "r"}
              {" lægges til lageret på "}
              {options.locationName}. Registreringen kan ikke redigeres
              bagefter.
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

export function ManualGoodsReceipt() {
  const access = useAccess();
  const canRegister = usePermission("goodsReceipts.register");
  const { locationId } = useGoodsReceiptContext();
  const options = useQuery(
    api.goodsReceipts.getManualReceiptOptions,
    canRegister && locationId ? { locationId, omitCatalog: true } : "skip",
  );
  const products = useCompleteCatalog(
    api.goodsReceipts.listCatalogPage,
    canRegister && locationId ? { locationId } : "skip",
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

  if (!locationId) {
    return (
      <Empty className="min-h-80 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageCheckIcon />
          </EmptyMedia>
          <EmptyTitle>Ingen lokationer tilgængelige</EmptyTitle>
          <EmptyDescription>
            Du har ikke adgang til en lokation, der kan modtage produkter.
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

  if (options === undefined || products === undefined) {
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

  return (
    <ManualGoodsReceiptForm
      locationId={locationId}
      options={{ ...options, products }}
    />
  );
}
