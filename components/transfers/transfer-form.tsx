"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useConvex, useMutation, useQuery } from "convex/react";
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
import {
  MinusIcon,
  PackageOpenIcon,
  PlusIcon,
  SaveIcon,
  TriangleAlertIcon,
  Trash2Icon,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CreatableCombobox,
  type ComboboxOption,
} from "@/components/catalog/creatable-combobox";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useKiosk } from "@/components/app-shell";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { productSearchScore } from "@/lib/product-search";

type LocationOption = {
  id: Id<"locations">;
  name: string;
};

type ProductOption = {
  id: Id<"products">;
  name: string;
  imageUrl: string | null;
  defaultUnitId: Id<"units">;
  units: Array<{ id: Id<"units">; name: string }>;
  maxTemperatureCelsius: number | null;
};

type MemberOption = {
  id: string;
  name: string;
};

type TransferLine = {
  key: string;
  productId: Id<"products">;
  productName: string;
  imageUrl: string | null;
  unitId: Id<"units">;
  units: Array<{ id: Id<"units">; name: string }>;
  unitsLoaded: boolean;
  quantity: number;
};

export type EditableTransfer = {
  id: Id<"transfers">;
  fromLocationId: Id<"locations">;
  toLocationId: Id<"locations">;
  responsibleUserId: string;
  comment: string | null;
  transferredAt: number;
  items: Array<{
    id: Id<"transferItems">;
    productId: Id<"products">;
    productName: string;
    unitId: Id<"units">;
    unitName: string;
    quantity: number;
    temperatureCelsius: number | null;
    maxTemperatureCelsius: number | null;
  }>;
};

type ProductTemperatureState = {
  value: string;
  maxTemperatureCelsius: number | null;
};

type OriginalTemperatureSnapshot = {
  temperatureCelsius: number | null;
  maxTemperatureCelsius: number | null;
};

type ProductTemperatureInput = {
  productId: Id<"products">;
  temperatureCelsius: number;
};

type TemperatureDeviationConfirmation = {
  productId: Id<"products">;
  maxTemperatureCelsius: number;
};

type ValidatedTemperatures = {
  temperatures: ProductTemperatureInput[];
  deviations: TemperatureDeviationConfirmation[];
};

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

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

function formatTemperature(value: number) {
  return new Intl.NumberFormat("da-DK", {
    maximumFractionDigits: 1,
  }).format(value);
}

function parseTemperatureInput(value: string): number | null | undefined {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  if (!/^-?\d+(?:\.\d)?$/u.test(normalized)) return undefined;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= -100 && parsed <= 100
    ? parsed
    : undefined;
}

function temperatureStateKey(productId: Id<"products">) {
  return String(productId);
}

function temperatureErrorKey(productId: Id<"products">) {
  return `temperature-${temperatureStateKey(productId)}`;
}

function inputValueForTemperature(value: number | null) {
  return value === null ? "" : String(value).replace(".", ",");
}

function initialTemperatureStates(transfer?: EditableTransfer) {
  const states: Record<string, ProductTemperatureState> = {};
  for (const item of transfer?.items ?? []) {
    const key = temperatureStateKey(item.productId);
    if (states[key]) continue;
    states[key] = {
      value: inputValueForTemperature(item.temperatureCelsius),
      maxTemperatureCelsius: item.maxTemperatureCelsius,
    };
  }
  return states;
}

function originalTemperatureSnapshotMap(transfer?: EditableTransfer) {
  const snapshots = new Map<Id<"products">, OriginalTemperatureSnapshot>();
  for (const item of transfer?.items ?? []) {
    if (snapshots.has(item.productId)) continue;
    snapshots.set(item.productId, {
      temperatureCelsius: item.temperatureCelsius,
      maxTemperatureCelsius: item.maxTemperatureCelsius,
    });
  }
  return snapshots;
}

function newLineKey() {
  return `line-${crypto.randomUUID()}`;
}

export function TransferForm({
  transfer,
  onSaved,
  onCancel,
}: {
  transfer?: EditableTransfer;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const convex = useConvex();
  const { data: session } = authClient.useSession();
  const locations = useQuery(api.locations.listAllLocationOptions) as
    | LocationOption[]
    | undefined;
  const kiosk = useKiosk();
  const responsibleUsers = useQuery(api.transfers.listResponsibleUsers, {});
  const [productSearch, setProductSearch] = useState("");
  const catalog = useQuery(api.catalog.listActiveProducts);
  const createTransfer = useMutation(api.transfers.createTransfer);
  const updateTransfer = useMutation(api.transfers.updateTransfer);
  const [originalTemperatureSnapshots] = useState(() =>
    originalTemperatureSnapshotMap(transfer),
  );
  const [fromLocationId, setFromLocationId] = useState<string | null>(
    transfer?.fromLocationId ?? null,
  );
  const [toLocationId, setToLocationId] = useState<string | null>(
    transfer?.toLocationId ?? null,
  );
  const [responsibleUserId, setResponsibleUserId] = useState<string | null>(
    transfer?.responsibleUserId ?? null,
  );
  const [comment, setComment] = useState(transfer?.comment ?? "");
  const [transferredAtLocal, setTransferredAtLocal] = useState(() =>
    toDatetimeLocalValue(transfer?.transferredAt ?? Date.now()),
  );
  const [lines, setLines] = useState<TransferLine[]>(() =>
    (transfer?.items ?? []).map((item) => ({
      key: item.id,
      productId: item.productId,
      productName: item.productName,
      imageUrl: null,
      unitId: item.unitId,
      units: [{ id: item.unitId, name: item.unitName }],
      unitsLoaded: false,
      quantity: item.quantity,
    })),
  );
  const [productToAdd, setProductToAdd] = useState<string | null>(null);
  const [loadingProductId, setLoadingProductId] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [temperatureStates, setTemperatureStates] = useState<
    Record<string, ProductTemperatureState>
  >(() => initialTemperatureStates(transfer));
  const [temperatureConfirmation, setTemperatureConfirmation] = useState<{
    validated: ValidatedTemperatures;
    deviations: TemperatureDeviationConfirmation[];
  } | null>(null);
  const [isTemperatureDialogOpen, setIsTemperatureDialogOpen] =
    useState(false);
  const sessionUserId = session?.user.id;
  const inputIdPrefix = transfer ? `transfer-edit-${transfer.id}` : "transfer";

  useEffect(() => {
    if (!transfer && kiosk?.isKioskAccount && kiosk.locationId) {
      const timeout = window.setTimeout(() => setFromLocationId(kiosk.locationId));
      return () => window.clearTimeout(timeout);
    }
  }, [kiosk?.isKioskAccount, kiosk?.locationId, transfer]);

  const members = (responsibleUsers ?? []) as MemberOption[];
  const membersLoading = responsibleUsers === undefined;
  const membersError = undefined;
  const effectiveResponsibleUserId =
    responsibleUserId ??
    (sessionUserId && members.some((member) => member.id === sessionUserId)
      ? sessionUserId
      : null);

  const products = useMemo(
    () =>
      (catalog ?? []).filter(
        (product) =>
          productSearchScore(
            product.name,
            product.category.path,
            productSearch,
          ) !== null,
      ),
    [catalog, productSearch],
  );
  const displayLines = lines;
  const lineGroups = Array.from(
    displayLines
      .reduce((groups, line) => {
        const group = groups.get(line.productId);
        if (group) group.push(line);
        else groups.set(line.productId, [line]);
        return groups;
      }, new Map<Id<"products">, TransferLine[]>())
      .values(),
  );
  const addedProductIds = new Set(lines.map((line) => line.productId));
  const productOptions: ComboboxOption[] = products
    .filter((product) => !addedProductIds.has(product.id))
    .map((product) => ({ value: product.id, label: product.name }));

  const fromLocationOptions: ComboboxOption[] = (locations ?? []).map(
    (location) => ({
      value: location.id,
      label: location.name,
      disabled: location.id === toLocationId,
    }),
  );
  const toLocationOptions: ComboboxOption[] = (locations ?? []).map(
    (location) => ({
      value: location.id,
      label: location.name,
      disabled: location.id === fromLocationId,
    }),
  );
  const memberOptions: ComboboxOption[] = members.map((member) => ({
    value: member.id,
    label: member.name,
  }));

  const lineCount = lines.length;
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);

  function resetForm() {
    setFromLocationId(kiosk?.isKioskAccount ? kiosk.locationId : null);
    setToLocationId(null);
    setResponsibleUserId(sessionUserId ?? null);
    setComment("");
    setTransferredAtLocal(() => toDatetimeLocalValue(Date.now()));
    setLines([]);
    setProductToAdd(null);
    setErrors({});
    setTemperatureStates({});
    setTemperatureConfirmation(null);
    setIsTemperatureDialogOpen(false);
  }

  function addLine(product: ProductOption, unitId: Id<"units">) {
    setLines((current) => [
      ...current,
      {
        key: newLineKey(),
        productId: product.id,
        productName: product.name,
        imageUrl: product.imageUrl,
        unitId,
        units: product.units,
        unitsLoaded: true,
        quantity: 1,
      },
    ]);
    setTemperatureStates((current) => {
      const key = temperatureStateKey(product.id);
      const originalSnapshot = originalTemperatureSnapshots.get(product.id);
      return current[key]
        ? current
        : {
            ...current,
            [key]: {
              value: "",
              maxTemperatureCelsius:
                originalSnapshot === undefined
                  ? product.maxTemperatureCelsius
                  : originalSnapshot.maxTemperatureCelsius,
            },
          };
    });
    setErrors((current) => {
      const next = { ...current };
      delete next.items;
      return next;
    });
  }

  async function addProduct(productId: string | null) {
    if (!productId) return;
    if (addedProductIds.has(productId as Id<"products">)) {
      setProductToAdd(null);
      return;
    }

    setLoadingProductId(productId);
    try {
      const product = await convex.query(
        api.transfers.getTransferProductOption,
        { productId: productId as Id<"products"> },
      );
      if (!product) {
        toast.error("Produktet blev ikke fundet");
        setProductToAdd(null);
        return;
      }
      const unitId =
        product.units.find((unit) => unit.id === product.defaultUnitId)?.id ??
        product.units[0]?.id;
      if (!unitId) {
        toast.error("Produktet har ingen enheder");
        setProductToAdd(null);
        return;
      }
      addLine(product, unitId);
      setProductToAdd(null);
    } catch (caught) {
      toast.error(messageFrom(caught));
    } finally {
      setLoadingProductId(undefined);
    }
  }

  async function refreshNewProductMaximums() {
    const productIds = Array.from(
      new Set(lines.map((line) => line.productId)),
    ).filter((productId) => !originalTemperatureSnapshots.has(productId));
    if (productIds.length === 0) return;

    const results = await Promise.allSettled(
      productIds.map(async (productId) => ({
        productId,
        product: await convex.query(
          api.transfers.getTransferProductOption,
          { productId },
        ),
      })),
    );
    setTemperatureStates((current) => {
      let next = current;
      for (const result of results) {
        if (result.status !== "fulfilled" || !result.value.product) continue;
        const key = temperatureStateKey(result.value.productId);
        const temperature = next[key];
        if (!temperature) continue;
        if (next === current) next = { ...current };
        next[key] = {
          ...temperature,
          maxTemperatureCelsius:
            result.value.product.maxTemperatureCelsius,
        };
      }
      return next;
    });
  }

  async function addUnit(productId: Id<"products">) {
    const existingLine = lines.find((line) => line.productId === productId);
    if (!existingLine) return;

    setLoadingProductId(productId);
    try {
      const product = existingLine.unitsLoaded
        ? {
            id: existingLine.productId,
            name: existingLine.productName,
            imageUrl: existingLine.imageUrl,
            units: existingLine.units,
          }
        : await convex.query(api.transfers.getTransferProductOption, {
            productId,
          });
      if (!product) {
        toast.error("Produktet blev ikke fundet");
        return;
      }

      const usedUnitIds = new Set(
        lines
          .filter((line) => line.productId === productId)
          .map((line) => line.unitId),
      );
      const unit = product.units.find(({ id }) => !usedUnitIds.has(id));
      setLines((current) => {
        const enriched = current.map((line) =>
          line.productId === productId
            ? {
                ...line,
                productName: product.name,
                imageUrl: product.imageUrl,
                units: product.units,
                unitsLoaded: true,
              }
            : line,
        );
        if (!unit) return enriched;
        return [
          ...enriched,
          {
            key: newLineKey(),
            productId: product.id,
            productName: product.name,
            imageUrl: product.imageUrl,
            unitId: unit.id,
            units: product.units,
            unitsLoaded: true,
            quantity: 1,
          },
        ];
      });
      if (!unit) toast.error("Produktet har ingen flere enheder");
    } catch (caught) {
      toast.error(messageFrom(caught));
    } finally {
      setLoadingProductId(undefined);
    }
  }

  function removeLine(line: TransferLine) {
    const isLastLineForProduct = !lines.some(
      (item) => item.key !== line.key && item.productId === line.productId,
    );
    setLines((current) => current.filter((item) => item.key !== line.key));
    if (isLastLineForProduct) {
      setTemperatureStates((current) => {
        const next = { ...current };
        delete next[temperatureStateKey(line.productId)];
        return next;
      });
    }
  }

  function validate(): ValidatedTemperatures | null {
    const nextErrors: Record<string, string> = {};
    if (!fromLocationId) nextErrors.fromLocation = "Vælg afsenderlokation";
    if (!toLocationId) nextErrors.toLocation = "Vælg modtagerlokation";
    if (
      fromLocationId &&
      toLocationId &&
      fromLocationId === toLocationId
    ) {
      nextErrors.toLocation = "Fra- og til-lokation skal være forskellige";
    }
    if (!effectiveResponsibleUserId) nextErrors.responsible = "Vælg en ansvarlig";
    const transferredAt = fromDatetimeLocalValue(transferredAtLocal);
    if (!Number.isFinite(transferredAt)) {
      nextErrors.transferredAt = "Angiv et gyldigt tidspunkt";
    }
    if (lines.length === 0) nextErrors.items = "Tilføj mindst ét produkt";
    if (lines.some((line) => line.quantity <= 0)) {
      nextErrors.items = "Mængden skal være større end nul";
    }

    const temperatures: ProductTemperatureInput[] = [];
    const deviations: TemperatureDeviationConfirmation[] = [];
    for (const group of lineGroups) {
      const product = group[0];
      if (!product) continue;

      const state =
        temperatureStates[temperatureStateKey(product.productId)] ?? {
          value: "",
          maxTemperatureCelsius: null,
        };
      const parsedTemperature = parseTemperatureInput(state.value);
      const errorKey = temperatureErrorKey(product.productId);

      if (parsedTemperature === undefined) {
        nextErrors[errorKey] =
          "Angiv en temperatur mellem -100 og 100 °C med højst én decimal";
        continue;
      }
      if (state.maxTemperatureCelsius !== null && parsedTemperature === null) {
        nextErrors[errorKey] = "Angiv en temperatur for dette produkt";
        continue;
      }
      if (parsedTemperature === null) continue;

      temperatures.push({
        productId: product.productId,
        temperatureCelsius: parsedTemperature,
      });
      if (
        state.maxTemperatureCelsius !== null &&
        parsedTemperature > state.maxTemperatureCelsius
      ) {
        deviations.push({
          productId: product.productId,
          maxTemperatureCelsius: state.maxTemperatureCelsius,
        });
      }
    }

    if (deviations.length > 0 && !comment.trim()) {
      nextErrors.comment =
        "Tilføj en kommentar, når temperaturen overstiger maksimum";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0
      ? { temperatures, deviations }
      : null;
  }

  async function submit(
    validated: ValidatedTemperatures,
    confirmedTemperatureDeviations?: TemperatureDeviationConfirmation[],
  ) {
    if (!fromLocationId || !toLocationId || !effectiveResponsibleUserId) {
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        fromLocationId: fromLocationId as Id<"locations">,
        toLocationId: toLocationId as Id<"locations">,
        responsibleUserId: effectiveResponsibleUserId,
        comment: comment.trim() || undefined,
        transferredAt: fromDatetimeLocalValue(transferredAtLocal),
        items: lines.map((line) => ({
          productId: line.productId,
          unitId: line.unitId,
          quantity: line.quantity,
        })),
        ...(validated.temperatures.length > 0
          ? { productTemperatures: validated.temperatures }
          : {}),
        ...(confirmedTemperatureDeviations &&
        confirmedTemperatureDeviations.length > 0
          ? { confirmedTemperatureDeviations }
          : {}),
      };
      if (transfer) {
        await updateTransfer({ transferId: transfer.id, ...payload });
        toast.success("Transferen er opdateret");
        onSaved?.();
      } else {
        await createTransfer(payload);
        toast.success("Transferen er gemt");
        resetForm();
      }
    } catch (caught) {
      toast.error(messageFrom(caught));
      setTemperatureConfirmation(null);
      setIsTemperatureDialogOpen(false);
      await refreshNewProductMaximums();
    } finally {
      setIsSaving(false);
    }
  }

  async function save() {
    const validated = validate();
    if (!validated || !fromLocationId || !toLocationId || !effectiveResponsibleUserId) {
      return;
    }
    if (validated.deviations.length > 0) {
      setTemperatureConfirmation({
        validated,
        deviations: validated.deviations,
      });
      setIsTemperatureDialogOpen(true);
      return;
    }
    await submit(validated);
  }

  async function confirmTemperatureDeviation() {
    if (!temperatureConfirmation || isSaving) return;
    const confirmation = temperatureConfirmation;
    setTemperatureConfirmation(null);
    setIsTemperatureDialogOpen(false);
    await submit(confirmation.validated, confirmation.deviations);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Detaljer</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={Boolean(errors.fromLocation)}>
                <FieldLabel>Fra lokation</FieldLabel>
                {kiosk?.isKioskAccount && fromLocationId === kiosk.locationId ? (
                  <div className="flex h-11 items-center rounded-md border px-3 text-sm font-medium">{kiosk.locationName}</div>
                ) : <CreatableCombobox
                  options={fromLocationOptions}
                  value={fromLocationId}
                  onValueChange={(value) => {
                    setFromLocationId(value);
                    setErrors((current) => {
                      const next = { ...current };
                      delete next.fromLocation;
                      delete next.toLocation;
                      return next;
                    });
                  }}
                  placeholder="Søg efter lokation"
                  ariaLabel="Fra lokation"
                  disabled={locations === undefined}
                />}
                <FieldError>{errors.fromLocation}</FieldError>
              </Field>

              <Field data-invalid={Boolean(errors.toLocation)}>
                <FieldLabel>Til lokation</FieldLabel>
                {kiosk?.isKioskAccount && toLocationId === kiosk.locationId ? (
                  <div className="flex h-11 items-center rounded-md border px-3 text-sm font-medium">{kiosk.locationName}</div>
                ) : <CreatableCombobox
                  options={toLocationOptions}
                  value={toLocationId}
                  onValueChange={(value) => {
                    setToLocationId(value);
                    setErrors((current) => {
                      const next = { ...current };
                      delete next.fromLocation;
                      delete next.toLocation;
                      return next;
                    });
                  }}
                  placeholder="Søg efter lokation"
                  ariaLabel="Til lokation"
                  disabled={locations === undefined}
                />}
                <FieldError>{errors.toLocation}</FieldError>
              </Field>

              <Field data-invalid={Boolean(errors.responsible)}>
                <FieldLabel>Ansvarlig</FieldLabel>
                <CreatableCombobox
                  options={memberOptions}
                  value={effectiveResponsibleUserId}
                  onValueChange={(value) => {
                    setResponsibleUserId(value);
                    setErrors((current) => {
                      const next = { ...current };
                      delete next.responsible;
                      return next;
                    });
                  }}
                  placeholder="Søg efter ansvarlig"
                  ariaLabel="Ansvarlig"
                  disabled={membersLoading}
                />
                <FieldError>
                  {errors.responsible ?? membersError}
                </FieldError>
              </Field>

              <Field data-invalid={Boolean(errors.comment)}>
                <FieldLabel htmlFor={`${inputIdPrefix}-comment`}>
                  Kommentar (valgfri)
                </FieldLabel>
                <Textarea
                  id={`${inputIdPrefix}-comment`}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Kommentar"
                  rows={3}
                  aria-invalid={Boolean(errors.comment)}
                />
                <FieldError>{errors.comment}</FieldError>
              </Field>

              <Field data-invalid={Boolean(errors.transferredAt)}>
                <FieldLabel htmlFor={`${inputIdPrefix}-at`}>
                  Tidspunkt
                </FieldLabel>
                <Input
                  id={`${inputIdPrefix}-at`}
                  type="datetime-local"
                  value={transferredAtLocal}
                  onChange={(event) => setTransferredAtLocal(event.target.value)}
                  className="h-11"
                  aria-invalid={Boolean(errors.transferredAt)}
                />
                <FieldError>{errors.transferredAt}</FieldError>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Produkter</CardTitle>
            <CardAction>
              <p className="text-sm text-muted-foreground">
                {lineCount} {lineCount === 1 ? "produktlinje" : "produktlinjer"} ·{" "}
                {totalQuantity} enheder i alt
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
                onInputValueChange={setProductSearch}
                placeholder="Søg efter produkter"
                ariaLabel="Tilføj produkt"
                disabled={loadingProductId !== undefined}
              />
              <FieldError>{errors.items}</FieldError>
            </Field>

            {lines.length === 0 ? (
              <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                Ingen produkter tilføjet endnu.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {lineGroups.map((group) => {
                  const product = group[0];
                  if (!product) return null;
                  const usedUnitIds = new Set(group.map((line) => line.unitId));
                  const canAddUnit = product.units.some(
                    (unit) => !usedUnitIds.has(unit.id),
                  ) || !product.unitsLoaded;
                  const productTemperature =
                    temperatureStates[temperatureStateKey(product.productId)] ?? {
                      value: "",
                      maxTemperatureCelsius: null,
                    };
                  const parsedTemperature = parseTemperatureInput(
                    productTemperature.value,
                  );
                  const deviationTemperature =
                    parsedTemperature !== undefined &&
                    parsedTemperature !== null &&
                    productTemperature.maxTemperatureCelsius !== null &&
                    parsedTemperature > productTemperature.maxTemperatureCelsius
                      ? parsedTemperature
                      : null;
                  const deviationMaximum =
                    deviationTemperature !== null
                      ? productTemperature.maxTemperatureCelsius
                      : null;
                  const hasTemperatureDeviation =
                    deviationTemperature !== null && deviationMaximum !== null;
                  const temperatureId = `${inputIdPrefix}-${temperatureStateKey(product.productId)}-temperature`;
                  const temperatureError =
                    errors[temperatureErrorKey(product.productId)];

                  return (
                    <li
                      key={product.productId}
                      className="flex flex-col gap-3 rounded-xl border p-3"
                    >
                      <div className="flex items-center gap-3">
                        {product.imageUrl ? (
                          <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                            <Image
                              src={product.imageUrl}
                              alt={`Produktbillede af ${product.productName}`}
                              fill
                              sizes="3.5rem"
                              className="object-cover"
                            />
                          </div>
                        ) : (
                          <div
                            className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                            aria-hidden="true"
                          >
                            <PackageOpenIcon className="size-6" />
                          </div>
                        )}

                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <p className="min-w-0 flex-1 truncate font-medium">
                            {product.productName}
                          </p>
                          {hasTemperatureDeviation ? (
                            <span className="inline-flex shrink-0 text-warning">
                              <TriangleAlertIcon
                                aria-hidden="true"
                                className="size-4"
                              />
                              <span className="sr-only">
                                Temperaturafvigelse for {product.productName}
                              </span>
                            </span>
                          ) : null}
                        </div>

                        {canAddUnit ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            disabled={loadingProductId === product.productId}
                            onClick={() => void addUnit(product.productId)}
                          >
                            {loadingProductId === product.productId ? (
                              <Spinner data-icon="inline-start" />
                            ) : (
                              <PlusIcon data-icon="inline-start" />
                            )}
                            Tilføj enhed
                          </Button>
                        ) : null}
                      </div>

                      <Field data-invalid={Boolean(temperatureError)}>
                        <FieldLabel htmlFor={temperatureId}>
                          <span className="flex items-center gap-1">
                            Temperatur
                            {productTemperature.maxTemperatureCelsius !== null
                              ? `(maks. ${formatTemperature(productTemperature.maxTemperatureCelsius)} °C)`
                              : "(valgfri)"}
                            {hasTemperatureDeviation ? (
                              <TriangleAlertIcon
                                aria-hidden="true"
                                className="size-4 text-warning"
                              />
                            ) : null}
                          </span>
                        </FieldLabel>
                        <Input
                          id={temperatureId}
                          type="text"
                          inputMode="decimal"
                          value={productTemperature.value}
                          onChange={(event) => {
                            const value = event.target.value;
                            setTemperatureStates((current) => ({
                              ...current,
                              [temperatureStateKey(product.productId)]: {
                                ...productTemperature,
                                value,
                              },
                            }));
                            setErrors((current) => {
                              const next = { ...current };
                              delete next[temperatureErrorKey(product.productId)];
                              delete next.comment;
                              return next;
                            });
                          }}
                          placeholder="Temperatur i °C"
                          aria-invalid={Boolean(temperatureError)}
                        />
                        {hasTemperatureDeviation &&
                        deviationTemperature !== null &&
                        deviationMaximum !== null ? (
                          <p className="text-sm text-warning">
                            Målt: {formatTemperature(deviationTemperature)} °C ·
                            maksimum: {formatTemperature(deviationMaximum)} °C.
                            <span className="sr-only">
                              Temperaturen overstiger maksimum.
                            </span>
                          </p>
                        ) : null}
                        <FieldError>{temperatureError}</FieldError>
                      </Field>

                      <ul className="flex flex-col gap-2">
                        {group.map((line) => (
                          <li
                            key={line.key}
                            className="grid gap-3 py-2 sm:grid-cols-[minmax(8rem,1fr)_auto_auto] sm:items-center"
                          >
                            <Field>
                              <FieldLabel htmlFor={`${line.key}-unit`} className="sr-only">
                                Enhed for {line.productName}
                              </FieldLabel>
                              <Select
                                items={line.units.map((unit) => ({
                                  value: unit.id,
                                  label: unit.name,
                                }))}
                                value={line.unitId}
                                onValueChange={(value) =>
                                  setLines((current) =>
                                    current.map((item) =>
                                      item.key === line.key
                                        ? {
                                            ...item,
                                            unitId: value as Id<"units">,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                              >
                                <SelectTrigger id={`${line.key}-unit`} className="h-11! w-full">
                                  <SelectValue placeholder="Vælg enhed" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {line.units.map((unit) => (
                                      <SelectItem
                                        key={unit.id}
                                        value={unit.id}
                                        disabled={
                                          unit.id !== line.unitId &&
                                          usedUnitIds.has(unit.id)
                                        }
                                      >
                                        {unit.name}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            </Field>

                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon-lg"
                                className="size-11"
                                aria-label={`Reducér mængde for ${line.productName}`}
                                disabled={line.quantity <= 1}
                                onClick={() =>
                                  setLines((current) =>
                                    current.map((item) =>
                                      item.key === line.key
                                        ? {
                                            ...item,
                                            quantity: Math.max(
                                              1,
                                              item.quantity - 1,
                                            ),
                                          }
                                        : item,
                                    ),
                                  )
                                }
                              >
                                <MinusIcon />
                              </Button>
                              <Input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                step={1}
                                value={line.quantity}
                                aria-label={`Mængde for ${line.productName}`}
                                className="h-11 w-16 text-center"
                                onChange={(event) => {
                                  const next = Number(event.target.value);
                                  if (!Number.isFinite(next)) return;
                                  setLines((current) =>
                                    current.map((item) =>
                                      item.key === line.key
                                        ? {
                                            ...item,
                                            quantity: Math.max(
                                              1,
                                              Math.floor(next),
                                            ),
                                          }
                                        : item,
                                    ),
                                  );
                                }}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="icon-lg"
                                className="size-11"
                                aria-label={`Øg mængde for ${line.productName}`}
                                onClick={() =>
                                  setLines((current) =>
                                    current.map((item) =>
                                      item.key === line.key
                                        ? {
                                            ...item,
                                            quantity: item.quantity + 1,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                              >
                                <PlusIcon />
                              </Button>
                            </div>

                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-lg"
                              className="size-11"
                              aria-label={`Fjern ${line.productName} i den valgte enhed`}
                              onClick={() => removeLine(line)}
                            >
                              <Trash2Icon />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={isTemperatureDialogOpen}
        onOpenChange={(open) => {
          if (!isSaving) {
            setIsTemperatureDialogOpen(open);
            if (!open) setTemperatureConfirmation(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bekræft temperaturafvigelse</AlertDialogTitle>
            <AlertDialogDescription>
              Et eller flere produkter overstiger maksimumtemperaturen. Vil du
              gemme transferen med afvigelserne?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {temperatureConfirmation ? (
            <ul className="flex flex-col gap-2 text-sm">
              {temperatureConfirmation.deviations.map((deviation) => {
                const product = lineGroups
                  .map((group) => group[0])
                  .find((line) => line?.productId === deviation.productId);
                const measured = temperatureConfirmation.validated.temperatures.find(
                  (temperature) => temperature.productId === deviation.productId,
                )?.temperatureCelsius;
                return (
                  <li
                    key={deviation.productId}
                    className="rounded-md border px-3 py-2"
                  >
                    <span className="font-medium">
                      {product?.productName ?? "Produkt"}
                    </span>
                    <span className="block text-muted-foreground">
                      Målt: {measured === undefined ? "—" : formatTemperature(measured)} °C ·
                      maksimum: {formatTemperature(deviation.maxTemperatureCelsius)} °C
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Annullér</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSaving}
              onClick={(event) => {
                event.preventDefault();
                void confirmTemperatureDeviation();
              }}
            >
              {isSaving ? <Spinner data-icon="inline-start" /> : null}
              Gem med afvigelse
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div
        className={cn(
          "sticky bottom-0 flex flex-col gap-3 border-t bg-background/95 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-end",
          transfer
            ? "-mx-4 px-4"
            : "-mx-4 px-4 sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12",
        )}
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          {onCancel ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="min-h-11 px-5"
              disabled={isSaving}
              onClick={onCancel}
            >
              Annullér
            </Button>
          ) : null}
          <Button
            type="button"
            size="lg"
            className="min-h-11 px-5"
            disabled={isSaving || locations === undefined}
            onClick={save}
          >
            {isSaving ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SaveIcon data-icon="inline-start" />
            )}
            {transfer ? "Gem ændringer" : "Gem transfer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
