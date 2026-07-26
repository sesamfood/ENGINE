"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  MinusIcon,
  PackageOpenIcon,
  PlusIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CreatableCombobox,
  type ComboboxOption,
} from "@/components/catalog/creatable-combobox";
import { Button } from "@/components/ui/button";
import {
  Card,
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
import { authClient } from "@/lib/auth-client";

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
};

type MemberOption = {
  id: string;
  userId: string;
  user: { id: string; name: string; email: string };
};

type TransferLine = {
  key: string;
  productId: Id<"products">;
  productName: string;
  imageUrl: string | null;
  unitId: Id<"units">;
  units: Array<{ id: Id<"units">; name: string }>;
  quantity: number;
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

function newLineKey() {
  return `line-${crypto.randomUUID()}`;
}

export function TransferForm() {
  const { data: session } = authClient.useSession();
  const { data: organization } = authClient.useActiveOrganization();
  const locations = useQuery(api.locations.listLocations) as
    | LocationOption[]
    | undefined;
  const formOptions = useQuery(api.catalog.listFormOptions, {});
  const createTransfer = useMutation(api.transfers.createTransfer);
  const [fromLocationId, setFromLocationId] = useState<string | null>(null);
  const [toLocationId, setToLocationId] = useState<string | null>(null);
  const [responsibleUserId, setResponsibleUserId] = useState<string | null>(
    null,
  );
  const [comment, setComment] = useState("");
  const [transferredAtLocal, setTransferredAtLocal] = useState(() =>
    toDatetimeLocalValue(Date.now()),
  );
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [productToAdd, setProductToAdd] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [membersError, setMembersError] = useState<string>();
  const [membersLoading, setMembersLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const organizationId = organization?.id;
  const sessionUserId = session?.user.id;

  useEffect(() => {
    if (!organizationId) return;
    let active = true;

    void (async () => {
      try {
        const memberResult = await authClient.organization.listMembers({
          query: { organizationId, limit: 100 },
        });
        if (!active) return;

        if (memberResult.error) {
          setMembersError("Medlemmer kunne ikke indlæses.");
          return;
        }

        const loaded = memberResult.data?.members ?? [];
        setMembersError(undefined);
        setMembers(loaded);
        if (
          sessionUserId &&
          loaded.some((member) => member.userId === sessionUserId)
        ) {
          setResponsibleUserId((current) => current ?? sessionUserId);
        }
      } catch {
        if (active) setMembersError("Medlemmer kunne ikke indlæses.");
      } finally {
        if (active) setMembersLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [organizationId, sessionUserId]);
  const products = (formOptions?.products ?? []) as ProductOption[];
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
    value: member.userId,
    label: member.user.name || member.user.email,
  }));

  const lineCount = lines.length;
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);

  function resetForm() {
    setFromLocationId(null);
    setToLocationId(null);
    setResponsibleUserId(sessionUserId ?? null);
    setComment("");
    setTransferredAtLocal(toDatetimeLocalValue(Date.now()));
    setLines([]);
    setProductToAdd(null);
    setErrors({});
  }

  function addProduct(productId: string | null) {
    if (!productId) return;
    const product = products.find((option) => option.id === productId);
    if (!product) return;
    if (addedProductIds.has(product.id)) {
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
    setLines((current) => [
      ...current,
      {
        key: newLineKey(),
        productId: product.id,
        productName: product.name,
        imageUrl: product.imageUrl,
        unitId,
        units: product.units,
        quantity: 1,
      },
    ]);
    setProductToAdd(null);
    setErrors((current) => {
      const next = { ...current };
      delete next.items;
      return next;
    });
  }

  function validate() {
    const nextErrors: Record<string, string> = {};
    if (!fromLocationId) nextErrors.fromLocation = "Vælg afsenderbutik";
    if (!toLocationId) nextErrors.toLocation = "Vælg modtagerbutik";
    if (
      fromLocationId &&
      toLocationId &&
      fromLocationId === toLocationId
    ) {
      nextErrors.toLocation = "Fra- og til-butik skal være forskellige";
    }
    if (!responsibleUserId) nextErrors.responsible = "Vælg en ansvarlig";
    const transferredAt = fromDatetimeLocalValue(transferredAtLocal);
    if (!Number.isFinite(transferredAt)) {
      nextErrors.transferredAt = "Angiv et gyldigt tidspunkt";
    }
    if (lines.length === 0) nextErrors.items = "Tilføj mindst én vare";
    if (lines.some((line) => line.quantity <= 0)) {
      nextErrors.items = "Mængden skal være større end nul";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function save() {
    if (!validate() || !fromLocationId || !toLocationId || !responsibleUserId) {
      return;
    }
    setIsSaving(true);
    try {
      await createTransfer({
        fromLocationId: fromLocationId as Id<"locations">,
        toLocationId: toLocationId as Id<"locations">,
        responsibleUserId,
        comment: comment.trim() || undefined,
        transferredAt: fromDatetimeLocalValue(transferredAtLocal),
        items: lines.map((line) => ({
          productId: line.productId,
          unitId: line.unitId,
          quantity: line.quantity,
        })),
      });
      toast.success("Transferen er gemt");
      resetForm();
    } catch (caught) {
      toast.error(messageFrom(caught));
    } finally {
      setIsSaving(false);
    }
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
                <FieldLabel>Fra butik</FieldLabel>
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
                  placeholder="Søg efter butik"
                  ariaLabel="Fra butik"
                  disabled={locations === undefined}
                />
                <FieldError>{errors.fromLocation}</FieldError>
              </Field>

              <Field data-invalid={Boolean(errors.toLocation)}>
                <FieldLabel>Til butik</FieldLabel>
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
                  placeholder="Søg efter butik"
                  ariaLabel="Til butik"
                  disabled={locations === undefined}
                />
                <FieldError>{errors.toLocation}</FieldError>
              </Field>

              <Field data-invalid={Boolean(errors.responsible)}>
                <FieldLabel>Ansvarlig</FieldLabel>
                <CreatableCombobox
                  options={memberOptions}
                  value={responsibleUserId}
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

              <Field>
                <FieldLabel htmlFor="transfer-comment">
                  Kommentar (valgfri)
                </FieldLabel>
                <Textarea
                  id="transfer-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Kommentar"
                  rows={3}
                />
              </Field>

              <Field data-invalid={Boolean(errors.transferredAt)}>
                <FieldLabel htmlFor="transfer-at">Tidspunkt</FieldLabel>
                <Input
                  id="transfer-at"
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
            <CardTitle>Varer</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field data-invalid={Boolean(errors.items)}>
              <FieldLabel>Tilføj vare</FieldLabel>
              <CreatableCombobox
                options={productOptions}
                value={productToAdd}
                onValueChange={addProduct}
                placeholder="Søg efter produkter"
                ariaLabel="Tilføj vare"
                disabled={formOptions === undefined}
              />
              <FieldError>{errors.items}</FieldError>
            </Field>

            {lines.length === 0 ? (
              <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
                Ingen varer tilføjet endnu.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {lines.map((line) => (
                  <li
                    key={line.key}
                    className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(8rem,0.45fr)_auto_auto] sm:items-center"
                  >
                    {line.imageUrl ? (
                      <div
                        role="img"
                        aria-label={`Produktbillede af ${line.productName}`}
                        className="size-14 shrink-0 rounded-lg bg-muted bg-cover bg-center"
                        style={{
                          backgroundImage: `url("${line.imageUrl}")`,
                        }}
                      />
                    ) : (
                      <div
                        className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                        aria-hidden="true"
                      >
                        <PackageOpenIcon className="size-6" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="truncate font-medium">{line.productName}</p>
                    </div>

                    <Field>
                      <FieldLabel className="sr-only">
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
                        <SelectTrigger className="h-11 w-full">
                          <SelectValue placeholder="Vælg enhed" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {line.units.map((unit) => (
                              <SelectItem key={unit.id} value={unit.id}>
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
                        aria-label={`Reducer mængde for ${line.productName}`}
                        disabled={line.quantity <= 1}
                        onClick={() =>
                          setLines((current) =>
                            current.map((item) =>
                              item.key === line.key
                                ? {
                                    ...item,
                                    quantity: Math.max(1, item.quantity - 1),
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
                                    quantity: Math.max(1, Math.floor(next)),
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
                                ? { ...item, quantity: item.quantity + 1 }
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
                      aria-label={`Fjern ${line.productName}`}
                      onClick={() =>
                        setLines((current) =>
                          current.filter((item) => item.key !== line.key),
                        )
                      }
                    >
                      <Trash2Icon />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="sticky bottom-0 -mx-5 flex flex-col gap-3 border-t bg-background/95 px-5 py-4 backdrop-blur sm:-mx-8 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:-mx-12 lg:px-12">
        <p className="text-sm text-muted-foreground">
          {lineCount} {lineCount === 1 ? "varelinje" : "varelinjer"} ·{" "}
          {totalQuantity} enheder i alt
        </p>
        <Button
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
          Gem transfer
        </Button>
      </div>
    </div>
  );
}
