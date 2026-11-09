"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ImageIcon,
  PackageOpenIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ProductImageCropDialog } from "@/components/catalog/product-image-crop-dialog";
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
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatMeasure, measureUnits, parseDecimal } from "@/lib/containers";
import { compressImage, productImageOptions } from "@/lib/compress-image";
import { uploadToStorage } from "@/lib/upload-to-storage";
import { getUserErrorMessage } from "@/lib/user-errors";

type Container = FunctionReturnType<typeof api.containers.list>[number];
type MeasureUnit = { name: string; size: number };

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

// Splits a stored amount into the input text and unit it is shown in.
function measureDraft(amount: number | null, units: MeasureUnit[]) {
  if (amount === null) return { value: "", unit: units[0].name };
  const unit =
    [...units].reverse().find((item) => amount >= item.size) ?? units[0];
  return {
    value: Number((amount / unit.size).toPrecision(10))
      .toString()
      .replace(".", ","),
    unit: unit.name,
  };
}

export function ContainerManager() {
  const containers = useQuery(api.containers.list);
  const settings = useQuery(api.catalog.getSettings);
  const setStatus = useMutation(api.containers.setStatus);
  const [status, setStatusFilter] = useState<"active" | "archived">("active");
  const [editing, setEditing] = useState<Container | "new" | null>(null);
  const [pending, setPending] = useState<Container | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const weightUnits = useMemo(
    () => measureUnits("dry", settings?.unitSystem),
    [settings?.unitSystem],
  );
  const capacityUnits = useMemo(
    () => measureUnits("wet", settings?.unitSystem),
    [settings?.unitSystem],
  );
  const shown = containers?.filter((container) => container.status === status);

  async function confirmStatusChange() {
    if (!pending) return;
    const next = pending.status === "active" ? "archived" : "active";
    setChangingStatus(true);
    try {
      await setStatus({ containerId: pending.id, status: next });
      toast.success(
        next === "archived"
          ? `${pending.name} er arkiveret`
          : `${pending.name} er gendannet`,
      );
      setPending(null);
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Beholderen kunne ikke ændres. Prøv igen."),
      );
    } finally {
      setChangingStatus(false);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          aria-label="Beholderstatus"
          variant="outline"
          size="lg"
          value={[status]}
          onValueChange={(values) => {
            const value = values[0];
            if (value === "active" || value === "archived") {
              setStatusFilter(value);
            }
          }}
        >
          <ToggleGroupItem value="active" className="min-h-11">
            Aktive
          </ToggleGroupItem>
          <ToggleGroupItem value="archived" className="min-h-11">
            Arkiverede
          </ToggleGroupItem>
        </ToggleGroup>
        <Button
          size="lg"
          appearance="standard"
          className="ml-auto min-h-11"
          onClick={() => setEditing("new")}
        >
          <PlusIcon data-icon="inline-start" />
          Ny beholder
        </Button>
      </div>

      {shown === undefined ? (
        <div className="grid gap-5 min-[640px]:grid-cols-3 min-[1024px]:grid-cols-4 min-[1200px]:grid-cols-5">
          {Array.from({ length: 4 }, (_, index) => (
            <Card key={index} appearance="gallery">
              <Skeleton appearance="square" className="aspect-4/3 w-full" />
              <CardHeader appearance="inset">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <Empty appearance="outlined" className="min-h-80">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageOpenIcon />
            </EmptyMedia>
            <EmptyTitle>
              {status === "active"
                ? "Ingen beholdere endnu"
                : "Ingen arkiverede beholdere"}
            </EmptyTitle>
            <EmptyDescription>
              {status === "active"
                ? "Opret de baljer, spande og kasser, der vejes med ved Count, så deres vægt kan trækkes fra."
                : "Arkiverede beholdere vises her, indtil de gendannes."}
            </EmptyDescription>
          </EmptyHeader>
          {status === "active" ? (
            <EmptyContent>
              <Button
                appearance="standard"
                className="min-h-11"
                onClick={() => setEditing("new")}
              >
                <PlusIcon data-icon="inline-start" />
                Ny beholder
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <div className="grid gap-5 min-[640px]:grid-cols-3 min-[1024px]:grid-cols-4 min-[1200px]:grid-cols-5 min-[1600px]:grid-cols-6">
          {shown.map((container) => (
            <Card key={container.id} appearance="catalog" className="relative">
              <button
                type="button"
                aria-label={`Redigér ${container.name}`}
                className="absolute inset-0 z-10 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                onClick={() => setEditing(container)}
              />
              <div className="relative flex aspect-4/3 w-full items-center justify-center overflow-hidden bg-muted text-muted-foreground">
                {container.imageUrl ? (
                  <Image
                    src={container.imageUrl}
                    alt={`Billede af ${container.name}`}
                    fill
                    sizes="(max-width: 639px) 100vw, (max-width: 1023px) 33vw, (max-width: 1199px) 25vw, 20vw"
                    className="object-cover"
                  />
                ) : (
                  <PackageOpenIcon className="size-12" aria-hidden="true" />
                )}
              </div>
              <CardHeader appearance="padded">
                <CardTitle>{container.name}</CardTitle>
                <CardDescription>
                  {formatMeasure(container.weightGrams, weightUnits)}
                  {container.capacityMilliliters === null
                    ? null
                    : ` · ${formatMeasure(container.capacityMilliliters, capacityUnits)}`}
                </CardDescription>
                <CardAction appearance="compact" className="relative z-20 flex">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    className="size-11"
                    aria-label={`${container.status === "active" ? "Arkivér" : "Gendan"} ${container.name}`}
                    onClick={() => setPending(container)}
                  >
                    {container.status === "active" ? (
                      <ArchiveIcon />
                    ) : (
                      <ArchiveRestoreIcon />
                    )}
                  </Button>
                </CardAction>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {editing !== null && settings ? (
        <ContainerDialog
          container={editing === "new" ? null : editing}
          weightUnits={weightUnits}
          capacityUnits={capacityUnits}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && !changingStatus) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.status === "active"
                ? "Arkivér beholder?"
                : "Gendan beholder?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.status === "active"
                ? `${pending.name} kan ikke længere vælges på produkter eller ved Count. Produkter, der allerede bruger den, beholder den, indtil du fjerner den.`
                : `${pending?.name} kan igen vælges på produkter og ved Count.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={changingStatus}>
              Annullér
            </AlertDialogCancel>
            <AlertDialogAction
              variant={pending?.status === "active" ? "destructive" : "default"}
              disabled={changingStatus}
              onClick={confirmStatusChange}
            >
              {changingStatus ? <Spinner data-icon="inline-start" /> : null}
              {pending?.status === "active" ? "Arkivér" : "Gendan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ContainerDialog({
  container,
  weightUnits,
  capacityUnits,
  onClose,
}: {
  container: Container | null;
  weightUnits: MeasureUnit[];
  capacityUnits: MeasureUnit[];
  onClose: () => void;
}) {
  const create = useMutation(api.containers.create);
  const update = useMutation(api.containers.update);
  const generateUploadUrl = useMutation(
    api.catalog.generateProductImageUploadUrl,
  );
  const setImage = useMutation(api.containers.setImage);
  const removeImage = useMutation(api.containers.removeImage);
  const [name, setName] = useState(container?.name ?? "");
  const [weight, setWeight] = useState(() =>
    measureDraft(container?.weightGrams ?? null, weightUnits),
  );
  const [capacity, setCapacity] = useState(() =>
    measureDraft(container?.capacityMilliliters ?? null, capacityUnits),
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [removeExistingImage, setRemoveExistingImage] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const imagePreview = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : null),
    [imageFile],
  );
  useEffect(
    () => () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    },
    [imagePreview],
  );
  const shownImage =
    imagePreview ?? (removeExistingImage ? null : (container?.imageUrl ?? null));

  function toBase(draft: { value: string; unit: string }, units: MeasureUnit[]) {
    const size = units.find((unit) => unit.name === draft.unit)?.size ?? 1;
    return parseDecimal(draft.value) * size;
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const weightGrams = toBase(weight, weightUnits);
    const capacityMilliliters = capacity.value.trim()
      ? toBase(capacity, capacityUnits)
      : null;
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = "Indtast et navn";
    if (!Number.isFinite(weightGrams) || weightGrams <= 0) {
      nextErrors.weight = "Angiv en vægt større end nul";
    }
    if (
      capacityMilliliters !== null &&
      (!Number.isFinite(capacityMilliliters) || capacityMilliliters <= 0)
    ) {
      nextErrors.capacity = "Angiv et rumfang større end nul";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const input = { name, weightGrams, capacityMilliliters };
      const containerId: Id<"containers"> = container
        ? (await update({ containerId: container.id, ...input }), container.id)
        : await create(input);
      try {
        if (imageFile) {
          const image = await compressImage(imageFile, productImageOptions);
          const storageId = await uploadToStorage({
            uploadUrl: await generateUploadUrl({}),
            file: image,
          });
          await setImage({ containerId, storageId });
        } else if (container && removeExistingImage) {
          await removeImage({ containerId });
        }
      } catch (error) {
        toast.error(
          getUserErrorMessage(
            error,
            "Beholderen er gemt, men billedet kunne ikke gemmes.",
          ),
        );
        onClose();
        return;
      }
      toast.success(container ? "Beholderen er gemt" : "Beholderen er oprettet");
      onClose();
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Beholderen kunne ikke gemmes. Prøv igen."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form className="flex flex-col gap-6" onSubmit={save} noValidate>
          <DialogHeader>
            <DialogTitle>
              {container ? `Redigér ${container.name}` : "Ny beholder"}
            </DialogTitle>
            <DialogDescription>
              Vægten trækkes fra, når et produkt vejes i beholderen ved Count.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor="container-name">Navn</FieldLabel>
              <Input
                id="container-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="For eksempel Balje GN 1/1"
                className="h-11"
                aria-invalid={Boolean(errors.name)}
                autoFocus
              />
              <FieldError>{errors.name}</FieldError>
            </Field>
            <MeasureField
              id="container-weight"
              label="Vægt"
              help="Beholderens vægt, når den er tom."
              draft={weight}
              units={weightUnits}
              error={errors.weight}
              onChange={setWeight}
            />
            <MeasureField
              id="container-capacity"
              label="Rumfang"
              description="Valgfrit"
              draft={capacity}
              units={capacityUnits}
              error={errors.capacity}
              onChange={setCapacity}
            />
            <Field>
              <FieldLabel htmlFor="container-picture">Billede</FieldLabel>
              <div className="flex flex-col overflow-hidden rounded-xl border">
                <label
                  htmlFor="container-picture"
                  className="block min-h-40 cursor-pointer"
                >
                  {shownImage ? (
                    <span
                      role="img"
                      aria-label="Forhåndsvisning af beholderbillede"
                      className="block min-h-40 w-full bg-muted bg-contain bg-center bg-no-repeat bg-(image:--preview-image)"
                      style={
                        {
                          "--preview-image": `url("${shownImage}")`,
                        } as React.CSSProperties
                      }
                    />
                  ) : (
                    <span className="flex min-h-40 w-full flex-col items-center justify-center gap-3 bg-muted text-muted-foreground">
                      <ImageIcon className="size-10" aria-hidden="true" />
                      <span className="text-sm">Intet billede valgt</span>
                    </span>
                  )}
                </label>
                <div className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center">
                  <Input
                    id="container-picture"
                    type="file"
                    accept={IMAGE_TYPES.join(",")}
                    className="h-11 flex-1"
                    onChange={(event) => {
                      const input = event.currentTarget;
                      const file = input.files?.[0] ?? null;
                      input.value = "";
                      if (!file) return;
                      if (
                        !IMAGE_TYPES.includes(file.type) ||
                        file.size > MAX_IMAGE_SIZE
                      ) {
                        toast.error(
                          "Brug et billede i JPEG-, PNG-, WebP- eller AVIF-format på højst 10 MB",
                        );
                        return;
                      }
                      setPendingImageFile(file);
                    }}
                  />
                  {shownImage ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => {
                        setImageFile(null);
                        setRemoveExistingImage(true);
                      }}
                    >
                      <Trash2Icon data-icon="inline-start" />
                      Fjern
                    </Button>
                  ) : null}
                </div>
              </div>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={saving}
              onClick={onClose}
            >
              Annullér
            </Button>
            <Button type="submit" className="min-h-11" disabled={saving}>
              {saving ? <Spinner data-icon="inline-start" /> : null}
              {container ? "Gem" : "Opret beholder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      {pendingImageFile ? (
        <ProductImageCropDialog
          open
          file={pendingImageFile}
          onOpenChange={(open) => {
            if (!open) setPendingImageFile(null);
          }}
          onConfirm={(croppedFile) => {
            setImageFile(croppedFile);
            setRemoveExistingImage(false);
            setPendingImageFile(null);
          }}
        />
      ) : null}
    </Dialog>
  );
}

function MeasureField({
  id,
  label,
  help,
  description,
  draft,
  units,
  error,
  onChange,
}: {
  id: string;
  label: string;
  help?: string;
  description?: string;
  draft: { value: string; unit: string };
  units: MeasureUnit[];
  error?: string;
  onChange: (draft: { value: string; unit: string }) => void;
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <div className="flex items-center gap-1">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {help ? <HelpTooltip label={label.toLowerCase()} content={help} /> : null}
      </div>
      <div className="flex gap-2">
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          value={draft.value}
          onChange={(event) => onChange({ ...draft, value: event.target.value })}
          className="h-11 flex-1"
          aria-invalid={Boolean(error)}
        />
        <Select
          value={draft.unit}
          onValueChange={(unit) => {
            if (typeof unit === "string") onChange({ ...draft, unit });
          }}
        >
          <SelectTrigger aria-label={`Enhed for ${label.toLowerCase()}`} className="h-11! w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {units.map((unit) => (
                <SelectItem key={unit.name} value={unit.name}>
                  {unit.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError>{error}</FieldError>
    </Field>
  );
}
