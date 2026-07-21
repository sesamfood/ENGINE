"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { PencilIcon, PlusIcon, ShapesIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
  return error instanceof Error ? error.message : "Something went wrong";
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
  const singular = isCategory ? "category" : "unit";
  const plural = isCategory ? "Categories" : "Units";

  function openEditor(item: VocabularyItem | "new") {
    setEditing(item);
    setName(item === "new" ? "" : item.name);
    setError("");
  }

  async function save() {
    if (!name.trim()) {
      setError(`Enter a ${singular} name`);
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
      toast.success(`${isCategory ? "Category" : "Unit"} saved`);
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
      toast.success(`${isCategory ? "Category" : "Unit"} removed`);
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
              ? "Organize products into a consistent set of reusable categories."
              : "Maintain the reusable unit labels available in every product form."}
          </p>
        </div>
        <Button
          size="lg"
          className="min-h-11 px-4"
          onClick={() => openEditor("new")}
        >
          <PlusIcon data-icon="inline-start" />
          New {singular}
        </Button>
      </div>

      {items === undefined ? (
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
            <EmptyTitle>No {plural.toLocaleLowerCase()} yet</EmptyTitle>
            <EmptyDescription>
              Add one here or create it directly from a product form.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button className="min-h-11 px-4" onClick={() => openEditor("new")}>
              <PlusIcon data-icon="inline-start" />
              New {singular}
            </Button>
          </EmptyContent>
        </Empty>
      ) : null}

      {items && items.length > 0 ? (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <Badge variant={item.inUse ? "secondary" : "outline"}>
                      {item.inUse ? "In use" : "Unused"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        aria-label={`Rename ${item.name}`}
                        onClick={() => openEditor(item)}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        aria-label={`Remove ${item.name}`}
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
              {editing === "new" ? `New ${singular}` : `Rename ${singular}`}
            </DialogTitle>
            <DialogDescription>
              The name is shared across the active organization.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor={`${kind}-name`}>Name</FieldLabel>
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
              Cancel
            </Button>
            <Button disabled={isSaving} onClick={save}>
              {isSaving ? <Spinner data-icon="inline-start" /> : null}
              Save
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
            <AlertDialogTitle>Remove {singular}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.name} will be permanently removed. Only unused
              {isCategory ? " categories" : " units"} can be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={remove}
            >
              {isDeleting ? <Spinner data-icon="inline-start" /> : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
