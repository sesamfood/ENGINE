"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Clock3Icon,
  MergeIcon,
  PencilIcon,
  PlusIcon,
  ShapesIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useDelayedLoading } from "@/components/catalog/use-delayed-loading";
import { LocationOpeningHours } from "@/components/organization/location-opening-hours";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type VocabularyKind = "unit" | "location";
type VocabularyItem = {
  id: Id<"units"> | Id<"locations">;
  name: string;
  inUse: boolean;
};

type RenameOrDeleteArgs =
  | { unitId: Id<"units"> }
  | { locationId: Id<"locations"> };

const vocabularyKinds = {
  unit: {
    singular: "enhed",
    plural: "Enheder",
    definite: "Enheden",
    deleteNoun: " enheder",
    description:
      "Vedligehold de enheder, der kan bruges i alle produktformularer.",
    emptyDescription:
      "Tilføj en her, eller opret den direkte i en produktformular.",
    list: api.catalog.listUnits,
    create: api.catalog.createUnit,
    rename: api.catalog.renameUnit,
    delete: api.catalog.deleteUnit,
    argsFor: (id: VocabularyItem["id"]): RenameOrDeleteArgs => ({
      unitId: id as Id<"units">,
    }),
  },
  location: {
    singular: "location",
    plural: "Locations",
    definite: "Locationen",
    deleteNoun: " locations",
    description:
      "Vedligehold de locations, der kan bruges i transfers og count.",
    emptyDescription:
      "Tilføj den første location for at kunne oprette transfers.",
    list: api.locations.listLocations,
    create: api.locations.createLocation,
    rename: api.locations.renameLocation,
    delete: api.locations.deleteLocation,
    argsFor: (id: VocabularyItem["id"]): RenameOrDeleteArgs => ({
      locationId: id as Id<"locations">,
    }),
  },
} as const;

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

export function VocabularyManager({ kind }: { kind: VocabularyKind }) {
  const config = vocabularyKinds[kind];
  const items = useQuery(config.list) as VocabularyItem[] | undefined;
  const create = useMutation(config.create) as (args: {
    name: string;
  }) => Promise<unknown>;
  const rename = useMutation(config.rename) as (
    args: RenameOrDeleteArgs & { name: string },
  ) => Promise<unknown>;
  const removeItem = useMutation(config.delete) as (
    args: RenameOrDeleteArgs,
  ) => Promise<unknown>;
  const mergeUnits = useMutation(api.catalog.mergeUnits);
  const [editing, setEditing] = useState<VocabularyItem | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VocabularyItem | null>(
    null,
  );
  const [openingHoursLocation, setOpeningHoursLocation] =
    useState<VocabularyItem | null>(null);
  const [pendingMerge, setPendingMerge] = useState<VocabularyItem | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<Id<"units"> | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [mergeError, setMergeError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const showSkeleton = useDelayedLoading(items === undefined);
  const mergeOptions = (items ?? [])
    .filter((item) => item.id !== pendingMerge?.id)
    .map((item) => ({
      value: item.id as Id<"units">,
      label: item.name,
    }));

  function openEditor(item: VocabularyItem | "new") {
    setEditing(item);
    setName(item === "new" ? "" : item.name);
    setError("");
  }

  async function save() {
    if (!name.trim()) {
      setError(`Indtast et navn til ${config.singular}`);
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      if (editing === "new") {
        await create({ name });
      } else if (editing) {
        await rename({ ...config.argsFor(editing.id), name });
      }
      toast.success(`${config.definite} er gemt`);
      setEditing(null);
    } catch (caught) {
      setError(messageFrom(caught));
    } finally {
      setIsSaving(false);
    }
  }

  async function remove() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await removeItem(config.argsFor(pendingDelete.id));
      toast.success(`${config.definite} er fjernet`);
      setPendingDelete(null);
    } catch (caught) {
      toast.error(messageFrom(caught));
    } finally {
      setIsDeleting(false);
    }
  }

  function openMerge(item: VocabularyItem) {
    setPendingMerge(item);
    setMergeTargetId(null);
    setMergeError("");
  }

  async function merge() {
    if (!pendingMerge || !mergeTargetId) return;
    const target = items?.find((item) => item.id === mergeTargetId);
    setIsMerging(true);
    setMergeError("");
    try {
      await mergeUnits({
        sourceUnitId: pendingMerge.id as Id<"units">,
        targetUnitId: mergeTargetId,
      });
      toast.success(
        `Enheden er sammenlagt med ${target?.name ?? "den valgte enhed"}`,
      );
      setPendingMerge(null);
    } catch (caught) {
      setMergeError(messageFrom(caught));
    } finally {
      setIsMerging(false);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-2xl flex-col gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">
            {config.plural}
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {config.description}
          </p>
        </div>
        <Button
          size="lg"
          className="min-h-11 px-4"
          onClick={() => openEditor("new")}
        >
          <PlusIcon data-icon="inline-start" />
          Ny {config.singular}
        </Button>
      </div>

      {showSkeleton ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : null}

      {items?.length === 0 ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShapesIcon />
            </EmptyMedia>
            <EmptyTitle>
              Ingen {config.plural.toLocaleLowerCase("da")} endnu
            </EmptyTitle>
            <EmptyDescription>{config.emptyDescription}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button className="min-h-11 px-4" onClick={() => openEditor("new")}>
              <PlusIcon data-icon="inline-start" />
              Ny {config.singular}
            </Button>
          </EmptyContent>
        </Empty>
      ) : null}

      {items && items.length > 0 ? (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Navn</TableHead>
                <TableHead className="w-48 text-right">Handlinger</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {kind === "location" ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-lg"
                                aria-label={`Redigér åbningstider for ${item.name}`}
                                onClick={() => setOpeningHoursLocation(item)}
                              />
                            }
                          >
                            <Clock3Icon />
                          </TooltipTrigger>
                          <TooltipContent>Åbningstider</TooltipContent>
                        </Tooltip>
                      ) : null}
                      {kind === "unit" ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-lg"
                                aria-label={`Sammenlæg ${item.name} med en anden enhed`}
                                disabled={items.length < 2}
                                onClick={() => openMerge(item)}
                              />
                            }
                          >
                            <MergeIcon />
                          </TooltipTrigger>
                          <TooltipContent>Sammenlæg</TooltipContent>
                        </Tooltip>
                      ) : null}
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-lg"
                              aria-label={`Omdøb ${item.name}`}
                              onClick={() => openEditor(item)}
                            />
                          }
                        >
                          <PencilIcon />
                        </TooltipTrigger>
                        <TooltipContent>Omdøb</TooltipContent>
                      </Tooltip>
                      {kind === "location" && item.inUse ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span
                                className="inline-flex"
                                tabIndex={0}
                                aria-label={`Hvorfor ${item.name} ikke kan fjernes`}
                              />
                            }
                          >
                            <Button
                              variant="ghost"
                              size="icon-lg"
                              aria-label={`Fjern ${item.name}`}
                              disabled
                            >
                              <Trash2Icon />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            Denne location bruges i en transfer og kan derfor
                            ikke fjernes.
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-lg"
                                aria-label={`Fjern ${item.name}`}
                                disabled={item.inUse}
                                onClick={() => setPendingDelete(item)}
                              />
                            }
                          >
                            <Trash2Icon />
                          </TooltipTrigger>
                          <TooltipContent>Fjern</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open && !isSaving) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing === "new"
                ? `Ny ${config.singular}`
                : `Omdøb ${config.singular}`}
            </DialogTitle>
            <DialogDescription>
              Navnet deles på tværs af den aktive organisation.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor={`${kind}-name`}>Navn</FieldLabel>
              <Input
                id={`${kind}-name`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void save();
                  }
                }}
                aria-invalid={Boolean(error)}
                autoFocus
              />
              <FieldError>{error}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isSaving}
              onClick={() => setEditing(null)}
            >
              Annuller
            </Button>
            <Button disabled={isSaving} onClick={save}>
              {isSaving ? <Spinner data-icon="inline-start" /> : null}
              Gem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingMerge)}
        onOpenChange={(open) => {
          if (!open && !isMerging) setPendingMerge(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sammenlæg enheder</DialogTitle>
            <DialogDescription>
              Vælg den enhed, som {pendingMerge?.name} skal samles med.
              Produkter og aktive opsætninger flyttes, og {pendingMerge?.name}{" "}
              fjernes. Historiske registreringer ændres ikke.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={Boolean(mergeError)}>
              <FieldLabel htmlFor="unit-merge-target">
                Behold denne enhed
              </FieldLabel>
              <Select
                items={mergeOptions}
                value={mergeTargetId}
                onValueChange={(value) => {
                  setMergeTargetId(value as Id<"units"> | null);
                  setMergeError("");
                }}
              >
                <SelectTrigger
                  id="unit-merge-target"
                  className="w-full"
                  aria-invalid={Boolean(mergeError)}
                >
                  <SelectValue placeholder="Vælg enhed" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {mergeOptions.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError>{mergeError}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isMerging}
              onClick={() => setPendingMerge(null)}
            >
              Annuller
            </Button>
            <Button
              variant="destructive"
              disabled={!mergeTargetId || isMerging}
              onClick={merge}
            >
              {isMerging ? <Spinner data-icon="inline-start" /> : null}
              Sammenlæg enheder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {kind === "location" && openingHoursLocation ? (
        <LocationOpeningHours
          locationId={openingHoursLocation.id as Id<"locations">}
          locationName={openingHoursLocation.name}
          open
          onOpenChange={(open) => {
            if (!open) setOpeningHoursLocation(null);
          }}
        />
      ) : null}

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fjern {config.singular}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.name} fjernes permanent. Kun
              {config.deleteNoun}, der ikke er i brug, kan fjernes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Annuller
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={remove}
            >
              {isDeleting ? <Spinner data-icon="inline-start" /> : null}
              Fjern
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
