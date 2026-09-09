"use client";

import { getUserErrorMessage } from "@/lib/user-errors";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Building2Icon,
  Clock3Icon,
  MergeIcon,
  PencilIcon,
  PlusIcon,
  Settings2Icon,
  ShapesIcon,
  Trash2Icon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { useDelayedLoading } from "@/components/catalog/use-delayed-loading";
import { LocationOpeningHours } from "@/components/organization/location-opening-hours";
import { LocationDetails } from "@/components/organization/location-details";
import { LocationCountSetup } from "@/components/organization/location-count-setup";
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
type VocabularyItem = { id: string; name: string; inUse: boolean };
type Unit = FunctionReturnType<typeof api.catalog.listUnits>[number];
type Location = FunctionReturnType<typeof api.locations.listLocations>[number];

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
  },
  location: {
    singular: "lokation",
    plural: "Lokationer",
    definite: "Lokationen",
    deleteNoun: " lokationer",
    description:
      "Vedligehold de lokationer, der kan bruges i Transfer og Count.",
    emptyDescription:
      "Tilføj den første lokation for at kunne oprette transfers.",
  },
};

export function VocabularyManager({ kind }: { kind: VocabularyKind }) {
  return kind === "unit" ? <UnitManager /> : <LocationManager />;
}

function UnitManager() {
  const items = useQuery(api.catalog.listUnits);
  const create = useMutation(api.catalog.createUnit);
  const rename = useMutation(api.catalog.renameUnit);
  const remove = useMutation(api.catalog.deleteUnit);
  const mergeUnits = useMutation(api.catalog.mergeUnits);
  const [pendingMerge, setPendingMerge] = useState<Unit | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<Id<"units"> | null>(null);
  const [mergeError, setMergeError] = useState("");
  const [isMerging, setIsMerging] = useState(false);
  const mergeOptions = (items ?? [])
    .filter((item) => item.id !== pendingMerge?.id)
    .map((item) => ({ value: item.id, label: item.name }));
  function openMerge(item: Unit) {
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
        sourceUnitId: pendingMerge.id,
        targetUnitId: mergeTargetId,
      });
      toast.success(
        `Enheden er sammenlagt med ${target?.name ?? "den valgte enhed"}`,
      );
      setPendingMerge(null);
    } catch (caught) {
      setMergeError(getUserErrorMessage(caught, "Indstillingen kunne ikke gemmes. Prøv igen."));
    } finally {
      setIsMerging(false);
    }
  }

  return (
    <>
      <VocabularyList
        kind="unit"
        items={items}
        onCreate={(name) => create({ name })}
        onRename={(item, name) => rename({ unitId: item.id, name })}
        onRemove={(item) => remove({ unitId: item.id })}
        renderActions={(item) => (
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    aria-label={`Sammenlæg ${item.name} med en anden enhed`}
                    disabled={(items?.length ?? 0) < 2}
                    onClick={() => openMerge(item)}
                  />
                }
              >
                <MergeIcon />
              </TooltipTrigger>
              <TooltipContent>Sammenlæg</TooltipContent>
            </Tooltip>
          </>
        )}
      />
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
                  setMergeTargetId(
                    items?.find((item) => item.id === value)?.id ?? null,
                  );
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
              Annullér
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
    </>
  );
}

function LocationManager() {
  const items = useQuery(api.locations.listLocations);
  const create = useMutation(api.locations.createLocation);
  const rename = useMutation(api.locations.renameLocation);
  const remove = useMutation(api.locations.deleteLocation);
  const [openingHoursLocation, setOpeningHoursLocation] =
    useState<Location | null>(null);
  const [detailsLocation, setDetailsLocation] = useState<Location | null>(null);
  const [countSetupLocation, setCountSetupLocation] = useState<Location | null>(
    null,
  );
  return (
    <>
      <VocabularyList
        kind="location"
        items={items}
        onCreate={(name) => create({ name })}
        onRename={(item, name) => rename({ locationId: item.id, name })}
        onRemove={(item) => remove({ locationId: item.id })}
        renderActions={(item) => (
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    aria-label={`Redigér stamdata for ${item.name}`}
                    onClick={() => setDetailsLocation(item)}
                  />
                }
              >
                <Building2Icon />
              </TooltipTrigger>
              <TooltipContent>Stamdata</TooltipContent>
            </Tooltip>
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
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    className="size-11"
                    aria-label={`Produkter og Områder for ${item.name}`}
                    onClick={() => setCountSetupLocation(item)}
                  />
                }
              >
                <Settings2Icon />
              </TooltipTrigger>
              <TooltipContent>Produkter og Områder</TooltipContent>
            </Tooltip>
          </>
        )}
      />
      {openingHoursLocation ? (
        <LocationOpeningHours
          locationId={openingHoursLocation.id}
          locationName={openingHoursLocation.name}
          open
          onOpenChange={(open) => {
            if (!open) setOpeningHoursLocation(null);
          }}
        />
      ) : null}

      {detailsLocation ? (
        <LocationDetails
          locationId={detailsLocation.id}
          locationName={detailsLocation.name}
          open
          onOpenChange={(open) => {
            if (!open) setDetailsLocation(null);
          }}
        />
      ) : null}

      {countSetupLocation ? (
        <LocationCountSetup
          locationId={countSetupLocation.id}
          locationName={countSetupLocation.name}
          open
          onOpenChange={(open) => {
            if (!open) setCountSetupLocation(null);
          }}
        />
      ) : null}
    </>
  );
}

function VocabularyList<Item extends VocabularyItem>({
  kind,
  items,
  onCreate,
  onRename,
  onRemove,
  renderActions,
}: {
  kind: VocabularyKind;
  items: Item[] | undefined;
  onCreate: (name: string) => Promise<unknown>;
  onRename: (item: Item, name: string) => Promise<unknown>;
  onRemove: (item: Item) => Promise<unknown>;
  renderActions: (item: Item) => ReactNode;
}) {
  const config = vocabularyKinds[kind];
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Item | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const showSkeleton = useDelayedLoading(items === undefined);

  function openEditor(item: Item | "new") {
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
        await onCreate(name);
      } else if (editing) {
        await onRename(editing, name);
      }
      toast.success(`${config.definite} er gemt`);
      setEditing(null);
    } catch (caught) {
      setError(getUserErrorMessage(caught, "Indstillingen kunne ikke gemmes. Prøv igen."));
    } finally {
      setIsSaving(false);
    }
  }

  async function remove() {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await onRemove(pendingDelete);
      toast.success(`${config.definite} er fjernet`);
      setPendingDelete(null);
    } catch (caught) {
      toast.error(getUserErrorMessage(caught, "Indstillingen kunne ikke gemmes. Prøv igen."));
    } finally {
      setIsDeleting(false);
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
                      {renderActions(item)}
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
                            Lokationen er i brug og kan derfor ikke fjernes.
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
              Annullér
            </Button>
            <Button disabled={isSaving} onClick={save}>
              {isSaving ? <Spinner data-icon="inline-start" /> : null}
              Gem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              Annullér
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
