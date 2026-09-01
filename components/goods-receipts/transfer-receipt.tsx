"use client";

import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeftIcon,
  CameraIcon,
  CheckIcon,
  MinusIcon,
  PackageCheckIcon,
  PackageIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAccess, usePermission } from "@/components/app-shell";
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
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { compressImage } from "@/lib/compress-image";
import { cn } from "@/lib/utils";

const MAX_PHOTO_SIZE = 10 * 1024 * 1024;
const MAX_COMMENT_LENGTH = 500;
const ACCEPTED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const dateTimeFormatter = new Intl.DateTimeFormat("da-DK", {
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

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Varemodtagelsen kunne ikke registreres";
}

function parseQuantity(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized || !/^\d+(?:\.\d+)?$/u.test(normalized)) return null;
  const quantity = Number(normalized);
  return Number.isFinite(quantity) ? quantity : null;
}

function initialQuantities(items: ReceiptItem[]) {
  return Object.fromEntries(items.map((item) => [item.id, "0"]));
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

function TransferReceiptForm({ receipt }: { receipt: PendingReceipt }) {
  const router = useRouter();
  const registerReceipt = useMutation(
    api.goodsReceipts.registerTransferReceipt,
  );
  const generatePhotoUploadUrl = useMutation(
    api.goodsReceipts.generatePhotoUploadUrl,
  );
  const { transfer, settings } = receipt;
  const [quantities, setQuantities] = useState(() =>
    initialQuantities(transfer.items),
  );
  const [comment, setComment] = useState("");
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

  const received = transfer.items.map((item) => ({
    item,
    quantity: parseQuantity(quantities[item.id] ?? ""),
  }));
  const allReceived = received.every(
    ({ item, quantity }) => quantity === item.quantity,
  );
  const receivedLineCount = received.filter(
    ({ quantity }) => quantity !== null && quantity > 0,
  ).length;
  const missingLineCount = received.filter(
    ({ quantity }) => quantity === 0,
  ).length;
  const deviationCount = received.filter(
    ({ item, quantity }) => quantity !== item.quantity,
  ).length;

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

  function setAllReceived(checked: boolean) {
    setQuantities(
      Object.fromEntries(
        transfer.items.map((item) => [
          item.id,
          checked ? String(item.quantity) : "0",
        ]),
      ),
    );
    setErrors({});
  }

  function validate() {
    const next: Record<string, string> = {};
    for (const item of transfer.items) {
      const quantity = parseQuantity(quantities[item.id] ?? "");
      if (quantity === null || quantity < 0 || quantity > item.quantity) {
        next[item.id] = `Angiv en mængde mellem 0 og ${quantityFormatter.format(item.quantity)}`;
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
    if (!validate()) {
      setConfirming(false);
      return;
    }
    setSubmitting(true);
    try {
      const deliveryNoteStorageId = photo
        ? await uploadPhoto(photo)
        : null;
      const items = transfer.items.map((item) => {
        const quantity = parseQuantity(quantities[item.id] ?? "");
        if (quantity === null) {
          throw new Error(
            `Angiv en modtaget mængde for ${item.productName}`,
          );
        }
        return { transferItemId: item.id, quantity };
      });
      await registerReceipt({
        transferId: transfer.id,
        items,
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        ...(deliveryNoteStorageId ? { deliveryNoteStorageId } : {}),
      });
      toast.success("Varemodtagelsen er registreret");
      setConfirming(false);
      router.replace("/goods-receipts");
    } catch (error) {
      toast.error(message(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
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
                <Field data-invalid={Boolean(errors.photo)}>
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
                      <span className="text-sm">
                        Kameraet åbner på enheder, der understøtter det.
                      </span>
                    </div>
                  )}
                  <FieldLabel htmlFor="goods-receipt-photo">
                    Billede af følgeseddel
                  </FieldLabel>
                  <Input
                    id="goods-receipt-photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    capture="environment"
                    aria-invalid={Boolean(errors.photo)}
                    onChange={(event) => {
                      const nextPhoto = event.target.files?.[0] ?? null;
                      setPhoto(nextPhoto);
                      setPreviewUrl(
                        nextPhoto ? URL.createObjectURL(nextPhoto) : null,
                      );
                      setErrors((current) => {
                        if (!current.photo) return current;
                        const next = { ...current };
                        delete next.photo;
                        return next;
                      });
                    }}
                  />
                  <FieldError>{errors.photo}</FieldError>
                  {photo ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setPhoto(null);
                        setPreviewUrl(null);
                      }}
                    >
                      <XIcon data-icon="inline-start" />
                      Fjern billede
                    </Button>
                  ) : null}
                </Field>
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
                    <dt className="text-muted-foreground">
                      Transferkommentar
                    </dt>
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
                    {transfer.items.length}
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

          <Card>
            <CardHeader>
              <CardTitle>Produkter</CardTitle>
              <CardDescription>
                Registrér den mængde, der faktisk er modtaget.
              </CardDescription>
              <CardAction>
                <Badge variant="outline">
                  {transfer.items.length} produktlinjer
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <ul>
                {transfer.items.map((item, index) => {
                  const quantity = parseQuantity(quantities[item.id] ?? "");
                  return (
                    <Fragment key={item.id}>
                      <li className="grid gap-4 py-4 lg:grid-cols-[minmax(12rem,1fr)_minmax(6rem,0.35fr)_minmax(6rem,0.3fr)_auto] lg:items-center">
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
                              <PackageIcon className="size-5" aria-hidden="true" />
                            </div>
                          )}
                          <span className="truncate font-medium">
                            {item.productName}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 lg:contents">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Enhed
                            </span>
                            <span>{item.unitName}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Sendt
                            </span>
                            <span className="tabular-nums">
                              {quantityFormatter.format(item.quantity)}
                            </span>
                          </div>
                        </div>

                        <Field data-invalid={Boolean(errors[item.id])}>
                          <FieldLabel
                            htmlFor={`goods-receipt-quantity-${item.id}`}
                            className="sr-only"
                          >
                            Modtaget mængde for {item.productName}
                          </FieldLabel>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-lg"
                              className="size-11"
                              aria-label={`Reducér modtaget mængde for ${item.productName}`}
                              disabled={quantity !== null && quantity <= 0}
                              onClick={() =>
                                setQuantity(
                                  item.id,
                                  Math.max(0, (quantity ?? 0) - 1),
                                )
                              }
                            >
                              <MinusIcon />
                            </Button>
                            <Input
                              id={`goods-receipt-quantity-${item.id}`}
                              type="number"
                              inputMode="decimal"
                              min={0}
                              max={item.quantity}
                              step="any"
                              value={quantities[item.id] ?? ""}
                              aria-invalid={Boolean(errors[item.id])}
                              className="h-11 w-24 text-center tabular-nums"
                              onChange={(event) => {
                                setQuantities((current) => ({
                                  ...current,
                                  [item.id]: event.target.value,
                                }));
                                setErrors((current) => {
                                  if (!current[item.id]) return current;
                                  const next = { ...current };
                                  delete next[item.id];
                                  return next;
                                });
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon-lg"
                              className="size-11"
                              aria-label={`Øg modtaget mængde for ${item.productName}`}
                              disabled={
                                quantity !== null && quantity >= item.quantity
                              }
                              onClick={() =>
                                setQuantity(
                                  item.id,
                                  Math.min(item.quantity, (quantity ?? 0) + 1),
                                )
                              }
                            >
                              <PlusIcon />
                            </Button>
                          </div>
                          <FieldError>{errors[item.id]}</FieldError>
                        </Field>
                      </li>
                      {index < transfer.items.length - 1 ? <Separator /> : null}
                    </Fragment>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Afslut modtagelse</CardTitle>
              <CardDescription>
                Kontrollér mængderne. Registreringen flytter kun det angivne
                antal til modtagerlokationen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="goods-receipt-all-received">
                      Alt er modtaget
                    </FieldLabel>
                    <FieldDescription>
                      Sætter alle modtagne mængder til det sendte antal.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="goods-receipt-all-received"
                    checked={allReceived}
                    onCheckedChange={setAllReceived}
                  />
                </Field>
                <Field data-invalid={Boolean(errors.comment)}>
                  <FieldLabel htmlFor="goods-receipt-comment">
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
              </FieldGroup>
            </CardContent>
            <CardFooter className="justify-end">
              <Button
                size="lg"
                className="min-h-11 px-5"
                disabled={submitting}
                onClick={review}
              >
                <CheckIcon data-icon="inline-start" />
                Registrér varemodtagelse
              </Button>
            </CardFooter>
          </Card>
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
                ? `${deviationCount} produktlinje${deviationCount === 1 ? "" : "r"} afviger fra det sendte antal. Kun de angivne mængder flyttes, og registreringen kan ikke redigeres bagefter.`
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
    canRegister ? { transferId } : "skip",
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

  if (receipt === undefined) {
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

  return <TransferReceiptForm key={receipt.transfer.id} receipt={receipt} />;
}
