"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { PencilIcon, PlusIcon, ShapesIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useDelayedLoading } from "@/components/catalog/use-delayed-loading";
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

type VocabularyKind = "category" | "unit";
type VocabularyItem = {
  id: Id<"categories"> | Id<"units">;
  name: string;
  inUse: boolean;
};

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

export function VocabularyManager({ kind }: { kind: VocabularyKind }) {
  const isCategory = kind === "category";
  const items = useQuery(
    isCategory ? api.catalog.listCategories : api.catalog.listUnits,
  ) as VocabularyItem[] | undefined;
  const createCategory = useMutation(api.catalog.createCategory);
  const renameCategory = useMutation(api.catalog.renameCategory);
  const deleteCategory = useMutation(api.catalog.deleteCategory);
  const createUnit = useMutation(api.catalog.createUnit);
  const renameUnit = useMutation(api.catalog.renameUnit);
  const deleteUnit = useMutation(api.catalog.deleteUnit);
  const [editing, setEditing] = useState<VocabularyItem | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VocabularyItem | null>(
    null,
  );
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const singular = isCategory ? "kategori" : "enhed";
  const plural = isCategory ? "Kategorier" : "Enheder";
  const showSkeleton = useDelayedLoading(items === undefined);

  function openEditor(item: VocabularyItem | "new") {
    setEditing(item);
    setName(item === "new" ? "" : item.name);
    setError("");
  }

  async function save() {
    if (!name.trim()) {
      setError(`Indtast et navn til ${singular}`);
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      if (editing === "new") {
        if (isCategory) await createCategory({ name });
        else await createUnit({ name });
      } else if (editing) {
        if (isCategory) {
          await renameCategory({
            categoryId: editing.id as Id<"categories">,
            name,
          });
        } else {
          await renameUnit({ unitId: editing.id as Id<"units">, name });
        }
      }
      toast.success(
        `${isCategory ? "Kategorien" : "Enheden"} er gemt`,
      );
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
      if (isCategory) {
        await deleteCategory({
          categoryId: pendingDelete.id as Id<"categories">,
        });
      } else {
        await deleteUnit({ unitId: pendingDelete.id as Id<"units"> });
      }
      toast.success(
        `${isCategory ? "Kategorien" : "Enheden"} er fjernet`,
      );
      setPendingDelete(null);
    } catch (caught) {
      toast.error(messageFrom(caught));
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-2xl flex-col gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">{plural}</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {isCategory
              ? "Organiser produkter i et ensartet sæt genanvendelige kategorier."
              : "Vedligehold de enheder, der kan bruges i alle produktformularer."}
          </p>
        </div>
        <Button
          size="lg"
          className="min-h-11 px-4"
          onClick={() => openEditor("new")}
        >
          <PlusIcon data-icon="inline-start" />
          Ny {singular}
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
              Ingen {plural.toLocaleLowerCase("da")} endnu
            </EmptyTitle>
            <EmptyDescription>
              Tilføj en her, eller opret den direkte i en produktformular.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button className="min-h-11 px-4" onClick={() => openEditor("new")}>
              <PlusIcon data-icon="inline-start" />
              Ny {singular}
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
                <TableHead className="w-28 text-right">Handlinger</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        aria-label={`Omdøb ${item.name}`}
                        onClick={() => openEditor(item)}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        aria-label={`Fjern ${item.name}`}
                        disabled={item.inUse}
                        onClick={() => setPendingDelete(item)}
                      >
                        <Trash2Icon />
                      </Button>
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
              {editing === "new" ? `Ny ${singular}` : `Omdøb ${singular}`}
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

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fjern {singular}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.name} fjernes permanent. Kun
              {isCategory ? " kategorier" : " enheder"}, der ikke er i brug,
              kan fjernes.
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
