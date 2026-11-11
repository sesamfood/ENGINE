"use client";

import { toDateTimeLocal, fromDateTimeLocal } from "@/lib/date";

import { DateTimePicker } from "@/components/date-picker";
import { ProductUnitLine } from "@/components/product-unit-line";

import { ProductLineGroup } from "@/components/product-line-group";

import { useCompleteCatalog } from "@/hooks/use-complete-catalog";

import { useAccess, useKiosk, useLocationAccess } from "@/components/app-shell";
import { DraftRestoredNotice } from "@/components/draft-restored-notice";
import { AppBottomBar } from "@/components/app-bottom-bar";
import {
  CreatableCombobox,
  type ComboboxOption,
} from "@/components/catalog/creatable-combobox";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { useActiveOrganization } from "@/lib/active-organization";
import {
  clearTransferDraft,
  readTransferDraft,
  setTransferLocation,
  useTransferLocation,
  writeTransferDraft,
} from "@/lib/transfer-prefs";
import { getUserErrorMessage } from "@/lib/user-errors";
import { useConvex, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { ChevronDownIcon, PlusIcon, SaveIcon, TriangleAlertIcon } from "lucide-react";
import posthog from "posthog-js";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

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
  // Set when the line comes from an internal order.
  orderedUnitName?: string;
};

export type EditableTransfer = {
  id: Id<"transfers">;
  orderId?: Id<"orders"> | null;
  receiptStatus: "pending" | "registered" | null;
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
    receivedQuantity: number | null;
    receivedUnitName: string | null;
  }>;
};

// An open internal order to fulfil with this Transfer.
export type TransferOrder = {
  id: Id<"orders">;
  version: number;
  locationId: Id<"locations">;
  fulfillingLocationId: Id<"locations">;
  items: Array<{
    productId: Id<"products">;
    productName: string;
    unitId: Id<"units">;
    unitName: string;
    quantity: number;
    maxTemperatureCelsius: number | null;
    units: Array<{ id: Id<"units">; name: string }>;
  }>;
};

function hasMissingUnit(line: TransferLine) {
  return (
    line.orderedUnitName !== undefined &&
    !line.units.some((unit) => unit.id === line.unitId)
  );
}

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

function initialTemperatureStates(
  items: Array<{
    productId: Id<"products">;
    temperatureCelsius?: number | null;
    maxTemperatureCelsius: number | null;
  }>,
) {
  const states: Record<string, ProductTemperatureState> = {};
  for (const item of items) {
    const key = temperatureStateKey(item.productId);
    if (states[key]) continue;
    states[key] = {
      value: inputValueForTemperature(item.temperatureCelsius ?? null),
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
  order,
  onSaved,
  onCancel,
  navigation,
}: {
  transfer?: EditableTransfer;
  order?: TransferOrder;
  onSaved?: () => void;
  onCancel?: () => void;
  navigation?: ReactNode;
}) {
  const convex = useConvex();
  const { data: session } = authClient.useSession();
  const locations = useQuery(api.locations.listAllLocationOptions) as
    LocationOption[] | undefined;
  const kiosk = useKiosk();
  const access = useAccess();
  const organization = useActiveOrganization();
  const organizationId = organization.data?.id;
  const storedFromLocationId = useTransferLocation(organizationId);
  const { locations: accessibleLocations, isLocked, lockedId } = useLocationAccess();
  const prefilledFromLocation = useRef(false);
  const draftRestored = useRef(false);
  const transferredAtEdited = useRef(false);
  const [draftNoticeVisible, setDraftNoticeVisible] = useState(false);
  const responsibleUsers = useQuery(api.transfers.listResponsibleUsers, {});
  const productSearchOptions = useCompleteCatalog(
    api.catalog.listActiveProductSearchOptionsPage,
    {},
  );
  const createTransfer = useMutation(api.transfers.createTransfer);
  const updateTransfer = useMutation(api.transfers.updateTransfer);
  const [originalTemperatureSnapshots] = useState(() =>
    originalTemperatureSnapshotMap(transfer),
  );
  const [fromLocationId, setFromLocationId] = useState<string | null>(
    transfer?.fromLocationId ?? order?.fulfillingLocationId ?? null,
  );
  const [toLocationId, setToLocationId] = useState<string | null>(
    transfer?.toLocationId ?? order?.locationId ?? null,
  );
  // A Transfer for an internal order keeps the order's locations.
  const locationsLocked = Boolean(order || transfer?.orderId);
  const [responsibleUserId, setResponsibleUserId] = useState<string | null>(
    transfer?.responsibleUserId ?? null,
  );
  const [responsibleCleared, setResponsibleCleared] = useState(false);
  const [comment, setComment] = useState(transfer?.comment ?? "");
  const [optionalOpen, setOptionalOpen] = useState(Boolean(transfer));
  const [transferredAtLocal, setTransferredAtLocal] = useState(() =>
    toDateTimeLocal(transfer?.transferredAt ?? Date.now()),
  );
  const [lines, setLines] = useState<TransferLine[]>(() =>
    (
      transfer?.items ??
      order?.items.map((item) => ({ ...item, id: newLineKey() })) ??
      []
    ).map((item) => ({
      key: item.id,
      productId: item.productId,
      productName: item.productName,
      imageUrl: null,
      unitId: item.unitId,
      units:
        "units" in item
          ? item.units
          : [{ id: item.unitId, name: item.unitName }],
      unitsLoaded: false,
      quantity: item.quantity,
      ...("units" in item ? { orderedUnitName: item.unitName } : {}),
    })),
  );
  const [productToAdd, setProductToAdd] = useState<string | null>(null);
  const [loadingProductId, setLoadingProductId] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [temperatureStates, setTemperatureStates] = useState<
    Record<string, ProductTemperatureState>
  >(() => initialTemperatureStates(transfer?.items ?? order?.items ?? []));
  const [temperatureConfirmation, setTemperatureConfirmation] = useState<{
    validated: ValidatedTemperatures;
    deviations: TemperatureDeviationConfirmation[];
  } | null>(null);
  const [isTemperatureDialogOpen, setIsTemperatureDialogOpen] = useState(false);
  const sessionUserId = session?.user.id;
  // Kiosk accounts are shared, so a draft would reach the next person.
  const draftUserId =
    access && !access.kiosk?.isKioskAccount && !access.kiosk?.kioskModeEnabled
      ? sessionUserId
      : undefined;
  const inputIdPrefix = transfer ? `transfer-edit-${transfer.id}` : "transfer";

  // Restore an unfinished draft after section navigation remounted the form.
  useEffect(() => {
    if (transfer || order || draftRestored.current) return;
    if (!organizationId || !draftUserId || !locations) return;
    draftRestored.current = true;
    const draft = readTransferDraft(organizationId, draftUserId);
    if (!draft) return;
    const locationIds = new Set(locations.map((location) => location.id));
    const from = draft.fromLocationId && locationIds.has(draft.fromLocationId as Id<"locations">) ? draft.fromLocationId : null;
    const to = draft.toLocationId && locationIds.has(draft.toLocationId as Id<"locations">) ? draft.toLocationId : null;
    window.setTimeout(() => {
      setDraftNoticeVisible(true);
      if (from) {
        prefilledFromLocation.current = true;
        setFromLocationId(from);
      }
      if (to) setToLocationId(to);
      if (draft.responsibleUserId) setResponsibleUserId(draft.responsibleUserId);
      if (draft.comment) {
        setComment(draft.comment);
        setOptionalOpen(true);
      }
      if (draft.transferredAtLocal) {
        transferredAtEdited.current = true;
        setTransferredAtLocal(draft.transferredAtLocal);
        setOptionalOpen(true);
      }
      if (draft.temperatures && Object.keys(draft.temperatures).length) {
        setTemperatureStates((current) => ({ ...current, ...draft.temperatures }));
      }
      if (draft.lines.length) {
        setLines(
          draft.lines.map((line) => ({
            key: line.key,
            productId: line.productId as Id<"products">,
            productName: line.productName,
            imageUrl: null,
            unitId: line.unitId as Id<"units">,
            units: line.units as Array<{ id: Id<"units">; name: string }>,
            unitsLoaded: false,
            quantity: line.quantity,
          })),
        );
      }
    });
  }, [draftUserId, locations, order, organizationId, transfer]);

  useEffect(() => {
    if (transfer || order || !organizationId || !draftUserId) return;
    if (!draftRestored.current) return;
    if (!lines.length && !toLocationId && !comment) {
      clearTransferDraft(organizationId, draftUserId);
      return;
    }
    writeTransferDraft(organizationId, draftUserId, {
      fromLocationId,
      toLocationId,
      responsibleUserId,
      comment,
      // The default is "now", which goes stale in a draft.
      transferredAtLocal: transferredAtEdited.current ? transferredAtLocal : undefined,
      temperatures: temperatureStates,
      lines: lines.map((line) => ({
        key: line.key,
        productId: line.productId,
        productName: line.productName,
        unitId: line.unitId,
        units: line.units,
        quantity: line.quantity,
      })),
    });
  }, [comment, draftUserId, fromLocationId, lines, order, organizationId, responsibleUserId, temperatureStates, toLocationId, transfer, transferredAtLocal]);

  useEffect(() => {
    if (transfer || order || prefilledFromLocation.current) return;
    if (!access || fromLocationId) return;
    const candidate = isLocked
      ? lockedId
      : accessibleLocations.find((location) => location.id === storedFromLocationId)?.id;
    if (candidate && candidate !== toLocationId) {
      prefilledFromLocation.current = true;
      const timeout = window.setTimeout(() => setFromLocationId(candidate));
      return () => window.clearTimeout(timeout);
    }
  }, [access, accessibleLocations, fromLocationId, isLocked, lockedId, order, storedFromLocationId, toLocationId, transfer]);

  useEffect(() => {
    if (!transfer && !order && organizationId && fromLocationId) {
      setTransferLocation(organizationId, fromLocationId);
    }
  }, [fromLocationId, order, organizationId, transfer]);

  useEffect(() => {
    if (!transfer && !order && kiosk?.isKioskAccount && kiosk.locationId) {
      const timeout = window.setTimeout(() =>
        setFromLocationId(kiosk.locationId),
      );
      return () => window.clearTimeout(timeout);
    }
  }, [kiosk?.isKioskAccount, kiosk?.locationId, order, transfer]);

  const members = (responsibleUsers ?? []) as MemberOption[];
  const membersLoading = responsibleUsers === undefined;
  const membersError = undefined;
  const effectiveResponsibleUserId = responsibleCleared
    ? null
    : (responsibleUserId ??
      (sessionUserId && members.some((member) => member.id === sessionUserId)
        ? sessionUserId
        : null));

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
  const productOptions: ComboboxOption[] = (productSearchOptions ?? [])
    .filter((product) => !addedProductIds.has(product.id))
    .map((product) => ({
      value: product.id,
      label: product.name,
      searchText: product.categoryPath,
    }));

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

  function resetForm() {
    if (organizationId && draftUserId) {
      clearTransferDraft(organizationId, draftUserId);
    }
    transferredAtEdited.current = false;
    setDraftNoticeVisible(false);
    setFromLocationId((current) => kiosk?.isKioskAccount ? kiosk.locationId : current);
    setToLocationId(null);
    setResponsibleUserId(sessionUserId ?? null);
    setResponsibleCleared(false);
    setComment("");
    setTransferredAtLocal(() => toDateTimeLocal(Date.now()));
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
      toast.error(
        getUserErrorMessage(caught, "Transferen kunne ikke gemmes. Prøv igen."),
      );
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
        product: await convex.query(api.transfers.getTransferProductOption, {
          productId,
        }),
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
          maxTemperatureCelsius: result.value.product.maxTemperatureCelsius,
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
      toast.error(
        getUserErrorMessage(caught, "Transferen kunne ikke gemmes. Prøv igen."),
      );
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
    if (fromLocationId && toLocationId && fromLocationId === toLocationId) {
      nextErrors.toLocation = "Fra- og til-lokation skal være forskellige";
    }
    if (!effectiveResponsibleUserId)
      nextErrors.responsible = "Vælg en ansvarlig";
    const transferredAt = fromDateTimeLocal(transferredAtLocal);
    if (!Number.isFinite(transferredAt)) {
      nextErrors.transferredAt = "Angiv et gyldigt tidspunkt";
    }
    if (lines.length === 0) nextErrors.items = "Tilføj mindst ét produkt";
    if (lines.some((line) => line.quantity <= 0)) {
      nextErrors.items = "Mængden skal være større end nul";
    }
    if (lines.some(hasMissingUnit)) {
      nextErrors.items = "Vælg en enhed for de markerede produkter";
    }

    const temperatures: ProductTemperatureInput[] = [];
    const deviations: TemperatureDeviationConfirmation[] = [];
    for (const group of lineGroups) {
      const product = group[0];
      if (!product) continue;

      const state = temperatureStates[
        temperatureStateKey(product.productId)
      ] ?? {
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
    if (Object.keys(nextErrors).length > 0) {
      window.setTimeout(() => {
        if (nextErrors.comment) {
          document.getElementById(`${inputIdPrefix}-comment`)?.focus();
        } else if (nextErrors.transferredAt) {
          document.getElementById(`${inputIdPrefix}-at`)?.focus();
        } else {
          document
            .querySelector<HTMLElement>('[data-invalid="true"] [aria-invalid="true"], [data-invalid="true"] button')
            ?.focus();
        }
      });
    }
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
        transferredAt: fromDateTimeLocal(transferredAtLocal),
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
        posthog.capture("transfer_updated", {
          item_count: lines.length,
          total_quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
          has_temperature_deviations: Boolean(
            confirmedTemperatureDeviations?.length,
          ),
        });
        toast.success("Transferen er opdateret");
        onSaved?.();
      } else {
        await createTransfer(
          order
            ? { ...payload, orderId: order.id, orderVersion: order.version }
            : payload,
        );
        if (
          confirmedTemperatureDeviations &&
          confirmedTemperatureDeviations.length > 0
        ) {
          posthog.capture("transfer_created_with_temperature_deviation", {
            item_count: lines.length,
            total_quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
            deviation_count: confirmedTemperatureDeviations.length,
          });
        } else {
          posthog.capture("transfer_created", {
            item_count: lines.length,
            total_quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
          });
        }
        toast.success("Transferen er gemt");
        if (order) onSaved?.();
        else resetForm();
      }
    } catch (caught) {
      toast.error(
        getUserErrorMessage(caught, "Transferen kunne ikke gemmes. Prøv igen."),
      );
      setTemperatureConfirmation(null);
      setIsTemperatureDialogOpen(false);
      await refreshNewProductMaximums();
    } finally {
      setIsSaving(false);
    }
  }

  async function save() {
    const validated = validate();
    if (
      !validated ||
      !fromLocationId ||
      !toLocationId ||
      !effectiveResponsibleUserId
    ) {
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

  const missingParts = transfer
    ? []
    : [
        !fromLocationId && !toLocationId
          ? "vælg fra- og til-lokation"
          : !fromLocationId
            ? "vælg fra-lokation"
            : !toLocationId
              ? "vælg til-lokation"
              : null,
        lines.length === 0 ? "tilføj et produkt" : null,
      ].filter(Boolean);
  const missingText = missingParts.join(" og ");
  const missingForSave = missingText
    ? `${missingText.charAt(0).toUpperCase()}${missingText.slice(1)} for at gemme`
    : null;
  const actions = (
    <div className="flex flex-col-reverse gap-2 xl:ml-auto xl:flex-row xl:items-center">
      {missingForSave ? (
        <p className="text-xs text-muted-foreground max-xl:order-first max-xl:text-center xl:whitespace-nowrap">
          {missingForSave}
        </p>
      ) : null}
      {onCancel ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          appearance="wide"
          className="min-h-11"
          disabled={isSaving}
          onClick={onCancel}
        >
          Annullér
        </Button>
      ) : null}
      <Button
        type="button"
        size="lg"
        appearance="wide"
        className="min-h-11"
        disabled={
          isSaving ||
          locations === undefined ||
          !fromLocationId ||
          !toLocationId ||
          lines.length === 0
        }
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
  );

  return (
    <div className="flex flex-col gap-6">
      {draftNoticeVisible ? (
        <DraftRestoredNotice
          description="Din ufærdige transfer er hentet frem igen."
          onDiscard={resetForm}
        />
      ) : null}
      <div className="grid gap-6 xl:grid-cols-(--grid-cols-product-details)">
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>Detaljer</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={Boolean(errors.fromLocation)}>
                <FieldLabel>Fra lokation <span aria-hidden="true">*</span></FieldLabel>
                <CreatableCombobox
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
                  ariaLabel="Fra lokation (påkrævet)" ariaRequired={true}
                  ariaInvalid={Boolean(errors.fromLocation)}
                  ariaDescribedBy={errors.fromLocation ? `${inputIdPrefix}-from-error` : undefined}
                  disabled={locations === undefined || locationsLocked}
                />
                <FieldError id={`${inputIdPrefix}-from-error`}>{errors.fromLocation}</FieldError>
              </Field>

              <Field data-invalid={Boolean(errors.toLocation)}>
                <FieldLabel>Til lokation <span aria-hidden="true">*</span></FieldLabel>
                <CreatableCombobox
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
                  ariaLabel="Til lokation (påkrævet)" ariaRequired={true}
                  ariaInvalid={Boolean(errors.toLocation)}
                  ariaDescribedBy={errors.toLocation ? `${inputIdPrefix}-to-error` : undefined}
                  disabled={locations === undefined || locationsLocked}
                />
                <FieldError id={`${inputIdPrefix}-to-error`}>{errors.toLocation}</FieldError>
              </Field>

              <Field data-invalid={Boolean(errors.responsible)}>
                <FieldLabel>Ansvarlig <span aria-hidden="true">*</span></FieldLabel>
                <CreatableCombobox
                  options={memberOptions}
                  value={effectiveResponsibleUserId}
                  onValueChange={(value) => {
                    setResponsibleUserId(value);
                    setResponsibleCleared(value === null);
                    setErrors((current) => {
                      const next = { ...current };
                      delete next.responsible;
                      return next;
                    });
                  }}
                  placeholder="Søg efter ansvarlig"
                  ariaLabel="Ansvarlig (påkrævet)" ariaRequired={true}
                  ariaInvalid={Boolean(errors.responsible)}
                  ariaDescribedBy={errors.responsible || membersError ? `${inputIdPrefix}-responsible-error` : undefined}
                  disabled={membersLoading}
                />
                <FieldError id={`${inputIdPrefix}-responsible-error`}>{errors.responsible ?? membersError}</FieldError>
              </Field>

            </FieldGroup>
            <Collapsible
              open={optionalOpen || Boolean(errors.comment || errors.transferredAt)}
              onOpenChange={setOptionalOpen}
            >
              <CollapsibleTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    appearance="compact"
                    className="mt-5 min-h-11 w-full justify-between"
                  />
                }
              >
                Kommentar og tidspunkt
                <ChevronDownIcon data-icon="inline-end" className="transition-transform [[aria-expanded=true]_&]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="pt-5">
                  <FieldGroup>
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
                  aria-describedby={errors.comment ? `${inputIdPrefix}-comment-error` : undefined}
                />
                <FieldError id={`${inputIdPrefix}-comment-error`}>{errors.comment}</FieldError>
              </Field>

              <Field data-invalid={Boolean(errors.transferredAt)}>
                <FieldLabel htmlFor={`${inputIdPrefix}-at`}>
                  Tidspunkt
                </FieldLabel>
                <DateTimePicker
                  id={`${inputIdPrefix}-at`}
                  value={transferredAtLocal}
                  onValueChange={(value) => {
                    transferredAtEdited.current = true;
                    setTransferredAtLocal(value);
                  }}
                  aria-invalid={Boolean(errors.transferredAt)}
                  aria-describedby={errors.transferredAt ? `${inputIdPrefix}-at-error` : undefined}
                />
                <FieldError id={`${inputIdPrefix}-at-error`}>{errors.transferredAt}</FieldError>
              </Field>
                  </FieldGroup>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>Produkter</CardTitle>
            <CardAction>
              <p className="text-sm text-muted-foreground">
                {lineCount} {lineCount === 1 ? "produktlinje" : "produktlinjer"}
              </p>
            </CardAction>
          </CardHeader>
          <CardContent appearance="stacked" className="flex flex-col">
            <Field data-invalid={Boolean(errors.items)}>
              <FieldLabel>Tilføj produkt</FieldLabel>
              <CreatableCombobox
                productSearch
                options={productOptions}
                value={productToAdd}
                onValueChange={(value) => void addProduct(value)}
                placeholder="Søg efter produkter"
                ariaLabel="Tilføj produkt"
                disabled={loadingProductId !== undefined}
              />
              <FieldError>{errors.items}</FieldError>
            </Field>

            {lines.length === 0 ? (
              <Empty appearance="notice" className="block w-auto min-w-auto flex-initial text-start">
                Ingen produkter tilføjet endnu.
              </Empty>
            ) : (
              <ul className="flex flex-col gap-3">
                {lineGroups.map((group) => {
                  const product = group[0];
                  if (!product) return null;
                  const usedUnitIds = new Set(group.map((line) => line.unitId));
                  const canAddUnit =
                    product.units.some((unit) => !usedUnitIds.has(unit.id)) ||
                    !product.unitsLoaded;
                  const productTemperature = temperatureStates[
                    temperatureStateKey(product.productId)
                  ] ?? {
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
                    <ProductLineGroup
                      key={product.productId}
                      productName={product.productName}
                      imageUrl={product.imageUrl}
                      status={
                        hasTemperatureDeviation ? (
                          <span className="inline-flex shrink-0 text-warning">
                            <TriangleAlertIcon
                              aria-hidden="true"
                              className="size-4"
                            />
                            <span className="sr-only">
                              Temperaturafvigelse for {product.productName}
                            </span>
                          </span>
                        ) : null
                      }
                      action={
                        canAddUnit ? (
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
                        ) : null
                      }
                    >
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
                              delete next[
                                temperatureErrorKey(product.productId)
                              ];
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
                          <li key={line.key} className="py-2">
                            <ProductUnitLine
                              lineKey={line.key}
                              productName={line.productName}
                              units={line.units}
                              unitId={line.unitId}
                              unavailableUnitIds={usedUnitIds}
                              quantity={line.quantity}
                              integer
                              onUnitChange={(unitId) => {
                                setLines((current) =>
                                  current.map((item) =>
                                    item.key === line.key
                                      ? { ...item, unitId }
                                      : item,
                                  ),
                                );
                                setErrors((current) => {
                                  const next = { ...current };
                                  delete next.items;
                                  return next;
                                });
                              }}
                              onQuantityChange={(value) => {
                                const next = Number(value.replace(",", "."));
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
                              onRemove={() => removeLine(line)}
                              error={
                                hasMissingUnit(line)
                                  ? `Bestilt i ${line.orderedUnitName}, som produktet ikke længere har. Vælg en enhed, og tjek mængden.`
                                  : undefined
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
                const measured =
                  temperatureConfirmation.validated.temperatures.find(
                    (temperature) =>
                      temperature.productId === deviation.productId,
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
                      Målt:{" "}
                      {measured === undefined
                        ? "—"
                        : formatTemperature(measured)}{" "}
                      °C · maksimum:{" "}
                      {formatTemperature(deviation.maxTemperatureCelsius)} °C
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

      {transfer ? (
        <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t bg-background/95 px-4 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-end">
          {actions}
        </div>
      ) : (
        <AppBottomBar>
          <div className="mx-auto flex w-full max-w-(--container-page) flex-col-reverse items-stretch gap-2 xl:flex-row xl:items-center">
            {navigation ? (
              <div className="min-w-0" inert={isSaving}>
                {navigation}
              </div>
            ) : null}
            {actions}
          </div>
        </AppBottomBar>
      )}
    </div>
  );
}
