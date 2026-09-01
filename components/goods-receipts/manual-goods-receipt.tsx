"use client";

import { getUserErrorMessage } from "@/lib/user-errors";
import posthog from "posthog-js";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeftIcon,
  CameraIcon,
  CheckIcon,
  MinusIcon,
  PackageCheckIcon,
  PackageIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
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
  CardFooter,
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
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
import { Separator } from "@/components/ui/separator";
import { useSidebar } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { compressImage } from "@/lib/compress-image";
import { cn } from "@/lib/utils";

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
type ManualReceiptProduct = ManualReceiptOptions["products"][number];

type ReceiptLine = {
  key: string;
  productId: Id<"products">;
  productName: string;
  imageUrl: string | null;
  unitId: Id<"units">;
  units: ManualReceiptProduct["units"];
  quantity: string;
};

type ReceiptItemInput = {
  productId: Id<"products">;
  unitId: Id<"units">;
  quantity: number;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDatetimeLocalValue(ms: number) {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function parseQuantity(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized || !/^\d+(?:\.\d+)?$/u.test(normalized)) return null;
  const quantity = Number(normalized);
  return Number.isFinite(quantity) ? quantity : null;
}

function newLineKey() {
  return `manual-receipt-line-${crypto.randomUUID()}`;
}

function hasStorageId(value: unknown): value is { storageId: string } {
  return Boolean(
    value &&
    typeof value === "object" &&
    "storageId" in value &&
    typeof value.storageId === "string" &&
    value.storageId.length > 0,
  );
}

function ManualGoodsReceiptForm({
  locationId,
  options,
}: {
  locationId: Id<"locations">;
  options: ManualReceiptOptions;
}) {
  const router = useRouter();
  const sidebar = useSidebar();
  const createReceipt = useMutation(api.goodsReceipts.createManualReceipt);
  const generatePhotoUploadUrl = useMutation(
    api.goodsReceipts.generateManualPhotoUploadUrl,
  );
  const [receivedAtLocal, setReceivedAtLocal] = useState(() =>
    toDatetimeLocalValue(Date.now()),
  );
  const [comment, setComment] = useState("");
  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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

  function adjustLineQuantity(line: ReceiptLine, change: 1 | -1) {
    const current = parseQuantity(line.quantity) ?? 0;
    setLineQuantity(line.key, String(Math.max(1, current + change)));
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
    setPreviewUrl(nextPhoto ? URL.createObjectURL(nextPhoto) : null);
    setErrors((current) => {
      if (!current.photo) return current;
      const next = { ...current };
      delete next.photo;
      return next;
    });
  }

  function validate() {
    const nextErrors: Record<string, string> = {};
    const receivedAt = fromDatetimeLocalValue(receivedAtLocal);
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
    const compressed = await compressImage(file, {
      maxWidth: 2600,
      maxHeight: 2600,
      quality: 0.9,
    });
    if (compressed.size > MAX_PHOTO_SIZE) {
      throw new Error("Det komprimerede billede er stadig større end 10 MB");
    }
    const uploadUrl = await generatePhotoUploadUrl({});
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": compressed.type },
      body: compressed,
    });
    if (!response.ok) throw new Error("Billedet kunne ikke uploades");
    const result: unknown = await response.json();
    if (!hasStorageId(result)) {
      throw new Error("Billedet kunne ikke uploades");
    }
    return result.storageId as Id<"_storage">;
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
              <Field data-invalid={Boolean(errors.photo)}>
                <FieldLabel
                  htmlFor="manual-goods-receipt-photo"
                  className="block w-full cursor-pointer"
                >
                  {previewUrl ? (
                    <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
                      <Image
                        src={previewUrl}
                        alt="Valgt billede af følgeseddel"
                        fill
                        unoptimized
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-lg bg-muted px-6 text-center text-muted-foreground">
                      <CameraIcon className="size-8" aria-hidden="true" />
                      <span className="font-medium text-foreground">
                        Tag eller upload et billede
                      </span>
                      <span className="text-sm">
                        Kameraet åbner på enheder, der understøtter det.
                      </span>
                    </div>
                  )}
                </FieldLabel>
                <Input
                  id="manual-goods-receipt-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  capture="environment"
                  aria-invalid={Boolean(errors.photo)}
                  onChange={(event) =>
                    selectPhoto(event.target.files?.[0] ?? null)
                  }
                />
                <FieldError>{errors.photo}</FieldError>
                {photo ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => selectPhoto(null)}
                  >
                    <XIcon data-icon="inline-start" />
                    Fjern billede
                  </Button>
                ) : null}
              </Field>
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
                <Empty className="min-h-56 border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <PackageIcon />
                    </EmptyMedia>
                    <EmptyTitle>Ingen produkter tilføjet</EmptyTitle>
                    <EmptyDescription>
                      {options.products.length === 0
                        ? "Der er ingen aktive produkter at tilføje."
                        : "Søg efter et produkt for at starte varemodtagelsen."}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <ul>
                  {lines.map((line, index) => {
                    const quantity = parseQuantity(line.quantity);
                    const unavailableUnitIds = new Set(
                      lines
                        .filter(
                          (item) =>
                            item.key !== line.key &&
                            item.productId === line.productId,
                        )
                        .map((item) => item.unitId),
                    );
                    const unitItems = line.units.map((unit) => ({
                      value: unit.id,
                      label: unit.name,
                    }));

                    return (
                      <Fragment key={line.key}>
                        <li className="grid gap-4 py-4 xl:grid-cols-[minmax(12rem,1fr)_minmax(9rem,0.45fr)_auto_auto] xl:items-start">
                          <div className="flex min-w-0 items-center gap-3">
                            {line.imageUrl ? (
                              <Image
                                src={line.imageUrl}
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
                            <div className="flex min-w-0 flex-col gap-1">
                              <span className="truncate font-medium">
                                {line.productName}
                              </span>
                              <Badge variant="secondary" className="w-fit">
                                Tilføjet
                              </Badge>
                            </div>
                          </div>

                          <Field>
                            <FieldLabel
                              htmlFor={`${line.key}-unit`}
                              className="sr-only"
                            >
                              Enhed for {line.productName}
                            </FieldLabel>
                            <Select
                              items={unitItems}
                              value={line.unitId}
                              onValueChange={(value) =>
                                setLineUnit(line.key, value)
                              }
                            >
                              <SelectTrigger
                                id={`${line.key}-unit`}
                                className="h-11! w-full"
                              >
                                <SelectValue placeholder="Vælg enhed" />
                              </SelectTrigger>
                              <SelectContent alignItemWithTrigger={false}>
                                <SelectGroup>
                                  {line.units.map((unit) => (
                                    <SelectItem
                                      key={unit.id}
                                      value={unit.id}
                                      disabled={
                                        unit.id !== line.unitId &&
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

                          <Field data-invalid={Boolean(errors[line.key])}>
                            <FieldLabel
                              htmlFor={`${line.key}-quantity`}
                              className="sr-only"
                            >
                              Mængde for {line.productName}
                            </FieldLabel>
                            <InputGroup className="h-11 w-full sm:w-40">
                              <InputGroupInput
                                id={`${line.key}-quantity`}
                                type="text"
                                inputMode="decimal"
                                value={line.quantity}
                                aria-invalid={Boolean(errors[line.key])}
                                className="text-center tabular-nums"
                                onChange={(event) =>
                                  setLineQuantity(line.key, event.target.value)
                                }
                              />
                              <InputGroupAddon align="inline-start">
                                <InputGroupButton
                                  size="icon-sm"
                                  className="size-10"
                                  aria-label={`Reducér mængde for ${line.productName}`}
                                  disabled={quantity !== null && quantity <= 1}
                                  onClick={() => adjustLineQuantity(line, -1)}
                                >
                                  <MinusIcon data-icon="inline-start" />
                                </InputGroupButton>
                              </InputGroupAddon>
                              <InputGroupAddon align="inline-end">
                                <InputGroupButton
                                  size="icon-sm"
                                  className="size-10"
                                  aria-label={`Øg mængde for ${line.productName}`}
                                  onClick={() => adjustLineQuantity(line, 1)}
                                >
                                  <PlusIcon data-icon="inline-start" />
                                </InputGroupButton>
                              </InputGroupAddon>
                            </InputGroup>
                            <FieldError>{errors[line.key]}</FieldError>
                          </Field>

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-lg"
                            className="size-11"
                            aria-label={`Fjern ${line.productName} i den valgte enhed`}
                            onClick={() => removeLine(line.key)}
                          >
                            <Trash2Icon data-icon="inline-start" />
                          </Button>
                        </li>
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

          <CardFooter
            className="fixed inset-x-0 bottom-0 z-10 rounded-none bg-background p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:right-0"
            style={{
              left: sidebar.isMobile
                ? 0
                : sidebar.state === "collapsed"
                  ? "var(--sidebar-width-icon)"
                  : "var(--sidebar-width)",
            }}
          >
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
          </CardFooter>
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

  if (options === undefined) {
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

  return <ManualGoodsReceiptForm locationId={locationId} options={options} />;
}
