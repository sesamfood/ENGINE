"use client";

import { ProductUnitLine } from "@/components/product-unit-line";

import { ProductLineGroup } from "@/components/product-line-group";

import { PhotoField } from "@/components/photo-field";

import { uploadToStorage } from "@/lib/upload-to-storage";

import { useCompleteCatalog } from "@/hooks/use-complete-catalog";

import {
  CreatableCombobox,
  type ComboboxOption,
} from "@/components/catalog/creatable-combobox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
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
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { compressImage, evidencePhotoOptions } from "@/lib/compress-image";
import { productSearchScore } from "@/lib/product-search";
import { getUserErrorMessage } from "@/lib/user-errors";
import { useConvex, useMutation, useQuery } from "convex/react";
import { PackageOpenIcon, PlusIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useWasteContext } from "./waste-header";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_QUANTITY = 1_000_000;
type ProductOption = {
  id: Id<"products">;
  name: string;
  imageUrl: string | null;
  defaultUnitId: Id<"units">;
  units: Array<{
    id: Id<"units">;
    name: string;
    factorToDefault: number;
  }>;
};

type Line = {
  key: string;
  productId: Id<"products">;
  productName: string;
  imageUrl: string | null;
  unitId: Id<"units">;
  units: ProductOption["units"];
  quantity: number;
};

export function BadDeliveryRegistration() {
  const convex = useConvex();
  const { locationId, locations, setDraftState } = useWasteContext();
  const config = useQuery(
    api.badDeliveries.getRegistrationConfig,
    locationId ? { locationId } : "skip",
  );
  const [search, setSearch] = useState("");
  const productSearchOptions = useCompleteCatalog(
    api.catalog.listActiveProductSearchOptionsPage,
    locationId ? {} : "skip",
  );
  const uploadUrl = useMutation(api.badDeliveries.generatePhotoUploadUrl);
  const register = useMutation(api.badDeliveries.registerBadDelivery);
  const [lines, setLines] = useState<Line[]>([]);
  const [productToAdd, setProductToAdd] = useState<string | null>(null);
  const [loadingProductId, setLoadingProductId] = useState<string>();
  const [badProductsPhoto, setBadProductsPhoto] = useState<File | null>(null);
  const [deliveryNotePhoto, setDeliveryNotePhoto] = useState<File | null>(null);
  const [comment, setComment] = useState("");
  const [deductDraft, setDeductDraft] = useState<{
    locationId: Id<"locations">;
    value: boolean;
  } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dirty =
    lines.length > 0 ||
    Boolean(
      badProductsPhoto || deliveryNotePhoto || comment.trim() || deductDraft,
    );
  useEffect(() => {
    setDraftState({ dirty, busy: submitting });
  }, [dirty, submitting, setDraftState]);
  useEffect(
    () => () => setDraftState({ dirty: false, busy: false }),
    [setDraftState],
  );
  const [actionTarget, setActionTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setActionTarget(document.getElementById("bad-delivery-primary-action")),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  if (locations === undefined || (locationId && config === undefined)) {
    return <Skeleton className="h-[34rem]" />;
  }
  if (!locations.length || !locationId) {
    return (
      <Empty className="min-h-72">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageOpenIcon />
          </EmptyMedia>
          <EmptyTitle>Ingen lokationer</EmptyTitle>
          <EmptyDescription>
            Opret en lokation, før en dårlig levering kan registreres.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const deductFromStock =
    deductDraft?.locationId === locationId
      ? deductDraft.value
      : config!.deductFromStock;
  const selectedLocation = locations.find((item) => item.id === locationId)!;
  const addedProductIds = new Set(lines.map((line) => line.productId));
  const productOptions: ComboboxOption[] = (productSearchOptions ?? [])
    .filter(
      (product) =>
        productSearchScore(product.name, product.categoryPath, search) !== null,
    )
    .filter((product) => !addedProductIds.has(product.id))
    .map((product) => ({ value: product.id, label: product.name }));
  const groups = Array.from(
    lines
      .reduce((map, line) => {
        const group = map.get(line.productId);
        if (group) group.push(line);
        else map.set(line.productId, [line]);
        return map;
      }, new Map<Id<"products">, Line[]>())
      .values(),
  );

  function clearError(name: string) {
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function addLine(product: ProductOption, unitId: Id<"units">) {
    setLines((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        productId: product.id,
        productName: product.name,
        imageUrl: product.imageUrl,
        unitId,
        units: product.units,
        quantity: 1,
      },
    ]);
    clearError("items");
  }

  async function addProduct(productId: string | null) {
    if (!productId) return;
    setLoadingProductId(productId);
    try {
      const product = await convex.query(api.badDeliveries.getProductOption, {
        productId: productId as Id<"products">,
      });
      const unitId =
        product?.units.find((unit) => unit.id === product.defaultUnitId)?.id ??
        product?.units[0]?.id;
      if (!product || !unitId) throw new Error("Produktet har ingen enheder");
      addLine(product, unitId);
      setProductToAdd(null);
    } catch (caught) {
      toast.error(
        getUserErrorMessage(
          caught,
          "Den dårlige levering kunne ikke opdateres. Prøv igen.",
        ),
      );
    } finally {
      setLoadingProductId(undefined);
    }
  }

  function addUnit(productId: Id<"products">) {
    const group = lines.filter((line) => line.productId === productId);
    const used = new Set(group.map((line) => line.unitId));
    const unit = group[0]?.units.find((item) => !used.has(item.id));
    if (!unit || !group[0]) {
      toast.error("Produktet har ingen flere enheder");
      return;
    }
    addLine(
      {
        id: group[0].productId,
        name: group[0].productName,
        imageUrl: group[0].imageUrl,
        defaultUnitId: group[0].unitId,
        units: group[0].units,
      },
      unit.id,
    );
  }

  function validate() {
    const next: Record<string, string> = {};
    if (!badProductsPhoto)
      next.badProductsPhoto = "Tilføj et billede af produkterne";
    if (!deliveryNotePhoto)
      next.deliveryNotePhoto = "Tilføj et billede af følgesedlen";
    if (!lines.length) next.items = "Tilføj mindst ét produkt";
    if (lines.length > 200)
      next.items = "Der kan højst tilføjes 200 produktlinjer";
    if (
      lines.some(
        (line) =>
          !Number.isFinite(line.quantity) ||
          line.quantity <= 0 ||
          line.quantity > MAX_QUANTITY,
      )
    ) {
      next.items = `Mængden skal være større end nul og højst ${MAX_QUANTITY}`;
    }
    if (comment.trim().length > 500) {
      next.comment = "Kommentaren må højst være 500 tegn";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function review() {
    if (validate()) setConfirming(true);
  }

  async function uploadPhoto(file: File) {
    const compressed = await compressImage(file, evidencePhotoOptions);
    if (compressed.size > MAX_FILE_SIZE) {
      throw new Error("Det komprimerede billede er stadig større end 10 MB");
    }
    return uploadToStorage({
      uploadUrl: await uploadUrl({}),
      file: compressed,
    });
  }

  async function submit() {
    if (!validate() || !badProductsPhoto || !deliveryNotePhoto || !locationId) {
      setConfirming(false);
      return;
    }
    setSubmitting(true);
    try {
      const [badProductsPhotoStorageId, deliveryNotePhotoStorageId] =
        await Promise.all([
          uploadPhoto(badProductsPhoto),
          uploadPhoto(deliveryNotePhoto),
        ]);
      const result = await register({
        locationId,
        comment: comment.trim() || undefined,
        deductFromStock,
        badProductsPhotoStorageId,
        deliveryNotePhotoStorageId,
        items: lines.map((line) => ({
          productId: line.productId,
          unitId: line.unitId,
          quantity: line.quantity,
        })),
      });
      setLines([]);
      setBadProductsPhoto(null);
      setDeliveryNotePhoto(null);
      setComment("");
      setDeductDraft(null);
      setErrors({});
      setProductToAdd(null);
      setSearch("");
      setConfirming(false);
      if (result.initialNoticeStatus === "pending") {
        toast.success("Dårlig levering er registreret. Meddelelsen sendes nu.");
      } else {
        toast.warning(
          "Dårlig levering er registreret, men ingen e-mail blev sendt, fordi Til er tom.",
        );
      }
    } catch (caught) {
      toast.error(
        getUserErrorMessage(
          caught,
          "Den dårlige levering kunne ikke opdateres. Prøv igen.",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-12 sm:pb-0">
      {!config!.hasPrimaryRecipients ? (
        <Alert>
          <AlertTitle>Ingen e-mailmodtagere</AlertTitle>
          <AlertDescription>
            Registreringen gemmes stadig, men der sendes ingen automatisk
            meddelelse.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Dokumentation</CardTitle>
          <CardDescription>
            Begge billeder er påkrævede og uploades først, når du bekræfter
            registreringen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-6 lg:grid-cols-2">
            <PhotoField
              maxFileSize={MAX_FILE_SIZE}
              label="Dårlige produkter"
              description="Tag eller upload et billede af de beskadigede eller dårlige produkter."
              file={badProductsPhoto}
              error={errors.badProductsPhoto}
              onChange={(file) => {
                setBadProductsPhoto(file);
                clearError("badProductsPhoto");
              }}
            />
            <PhotoField
              maxFileSize={MAX_FILE_SIZE}
              label="Følgeseddel"
              description="Tag eller upload et læsbart billede af følgesedlen."
              file={deliveryNotePhoto}
              error={errors.deliveryNotePhoto}
              onChange={(file) => {
                setDeliveryNotePhoto(file);
                clearError("deliveryNotePhoto");
              }}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Produkter</CardTitle>
          <CardAction>
            <p className="text-sm text-muted-foreground">
              {lines.length}{" "}
              {lines.length === 1 ? "produktlinje" : "produktlinjer"}
            </p>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field data-invalid={Boolean(errors.items)}>
            <FieldLabel>Tilføj produkt</FieldLabel>
            <CreatableCombobox
              options={productOptions}
              value={productToAdd}
              onValueChange={(value) => void addProduct(value)}
              onInputValueChange={setSearch}
              placeholder="Søg efter produkter"
              ariaLabel="Tilføj produkt"
              disabled={loadingProductId !== undefined || lines.length >= 200}
            />
            <FieldError>{errors.items}</FieldError>
          </Field>
          {!lines.length ? (
            <Empty className="min-h-40">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PackageOpenIcon />
                </EmptyMedia>
                <EmptyTitle>Ingen produkter tilføjet</EmptyTitle>
                <EmptyDescription>
                  Søg efter det første produkt ovenfor.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {groups.map((group) => {
                const product = group[0];
                const used = new Set(group.map((line) => line.unitId));
                const canAddUnit = product.units.some(
                  (unit) => !used.has(unit.id),
                );
                return (
                  <ProductLineGroup
                    key={product.productId}
                    productName={product.productName}
                    imageUrl={product.imageUrl}
                    action={
                      canAddUnit && lines.length < 200 ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          onClick={() => addUnit(product.productId)}
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
                            unavailableUnitIds={used}
                            quantity={line.quantity}
                            min={0.000001}
                            max={MAX_QUANTITY}
                            onUnitChange={(unitId) =>
                              setLines((current) =>
                                current.map((item) =>
                                  item.key === line.key
                                    ? { ...item, unitId }
                                    : item,
                                ),
                              )
                            }
                            onQuantityChange={(value) => {
                              const quantity = Number(value.replace(",", "."));
                              setLines((current) =>
                                current.map((item) =>
                                  item.key === line.key
                                    ? { ...item, quantity }
                                    : item,
                                ),
                              );
                              clearError("items");
                            }}
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
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detaljer</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={Boolean(errors.comment)}>
              <FieldLabel htmlFor="bad-delivery-comment">
                Kommentar (valgfri)
              </FieldLabel>
              <Textarea
                id="bad-delivery-comment"
                value={comment}
                maxLength={500}
                rows={4}
                onChange={(event) => {
                  setComment(event.target.value);
                  clearError("comment");
                }}
              />
              <FieldDescription>{comment.length}/500 tegn</FieldDescription>
              <FieldError>{errors.comment}</FieldError>
            </Field>
            {config!.showStockChoice ? (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="bad-delivery-stock">
                    Træk produkterne fra lageret
                  </FieldLabel>
                  <FieldDescription>
                    Trækker varernes omregnede standardmængder fra den valgte
                    lokationen.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="bad-delivery-stock"
                  checked={deductFromStock}
                  onCheckedChange={(value) =>
                    setDeductDraft({ locationId, value })
                  }
                />
              </Field>
            ) : null}
          </FieldGroup>
        </CardContent>
      </Card>

      <Dialog
        open={confirming}
        onOpenChange={(open) => !submitting && setConfirming(open)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-1">
              <DialogTitle>Bekræft dårlig levering</DialogTitle>
              <HelpTooltip
                label="bekræft dårlig levering"
                content="Lagerændringen og e-mailen kan ikke trækkes tilbage uden en efterfølgende annullering."
              />
            </div>
          </DialogHeader>
          <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 text-sm">
            <dt className="text-muted-foreground">Lokation</dt>
            <dd>{selectedLocation.name}</dd>
            <dt className="text-muted-foreground">Kommentar</dt>
            <dd>{comment.trim() || "Ingen kommentar"}</dd>
            <dt className="text-muted-foreground">Dårlige produkter</dt>
            <dd>{badProductsPhoto ? "Billede vedhæftet" : "Mangler"}</dd>
            <dt className="text-muted-foreground">Følgeseddel</dt>
            <dd>{deliveryNotePhoto ? "Billede vedhæftet" : "Mangler"}</dd>
            <dt className="text-muted-foreground">Lager</dt>
            <dd>
              {deductFromStock
                ? "Produkterne trækkes fra lageret"
                : "Lageret ændres ikke"}
              {!config!.showStockChoice ? " (organisationens standard)" : ""}
            </dd>
          </dl>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produkt</TableHead>
                <TableHead>Mængde</TableHead>
                <TableHead>Enhed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.key}>
                  <TableCell>{line.productName}</TableCell>
                  <TableCell>{line.quantity}</TableCell>
                  <TableCell>
                    {line.units.find((unit) => unit.id === line.unitId)?.name}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!config!.hasPrimaryRecipients ? (
            <Alert>
              <AlertTitle>Ingen e-mail sendes</AlertTitle>
              <AlertDescription>
                Registreringen og en eventuel lagerændring gennemføres stadig.
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={submitting}
              onClick={() => setConfirming(false)}
            >
              Tilbage
            </Button>
            <Button disabled={submitting} onClick={() => void submit()}>
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              Bekræft registrering
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {actionTarget
        ? createPortal(
            <Button
              size="lg"
              className="min-h-11 w-full sm:w-auto"
              disabled={submitting}
              onClick={review}
            >
              Gennemse og registrér
            </Button>,
            actionTarget,
          )
        : null}
    </div>
  );
}
