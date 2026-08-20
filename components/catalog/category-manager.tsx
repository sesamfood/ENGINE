"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  PencilIcon,
  PlusIcon,
  ShapesIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Category = {
  id: Id<"categories">;
  name: string;
  parentCategoryId: Id<"categories"> | null;
  path: string;
  depth: number;
  inUse: boolean;
  hasChildren: boolean;
};

type PlacementKind = "root" | "child" | "parent";
type Editor =
  | {
      kind: "create";
      placement: PlacementKind;
      targetId: Id<"categories"> | null;
    }
  | { kind: "edit"; category: Category }
  | null;

const ROOT_VALUE = "root";
const PLACEMENT_ITEMS = [
  { value: "root", label: "Øverste niveau" },
  { value: "child", label: "Under en kategori" },
  { value: "parent", label: "Over en kategori" },
];

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

export function CategoryManager() {
  const categories = useQuery(api.catalog.listCategories) as
    Category[] | undefined;
  const createCategory = useMutation(api.catalog.createCategory);
  const updateCategory = useMutation(api.catalog.updateCategory);
  const deleteCategory = useMutation(api.catalog.deleteCategory);
  const [expandedIds, setExpandedIds] = useState<Set<Id<"categories">>>(
    new Set(),
  );
  const knownIds = useRef(new Set<Id<"categories">>());
  const [expansionInitialized, setExpansionInitialized] = useState(false);
  const [editor, setEditor] = useState<Editor>(null);
  const [name, setName] = useState("");
  const [placement, setPlacement] = useState<PlacementKind>("root");
  const [targetId, setTargetId] = useState<Id<"categories"> | null>(null);
  const [parentId, setParentId] = useState<Id<"categories"> | null>(null);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const showSkeleton = useDelayedLoading(categories === undefined);

  useEffect(() => {
    if (!categories) return;
    const newlyExpandable = categories
      .filter(
        (category) =>
          category.hasChildren && !knownIds.current.has(category.id),
      )
      .map((category) => category.id);
    if (newlyExpandable.length > 0) {
      setExpandedIds((current) => new Set([...current, ...newlyExpandable]));
    }
    knownIds.current = new Set(categories.map((category) => category.id));
    setExpansionInitialized(true);
  }, [categories]);

  const childrenByParent = useMemo(() => {
    const children = new Map<Id<"categories"> | null, Category[]>();
    for (const category of categories ?? []) {
      const siblings = children.get(category.parentCategoryId) ?? [];
      siblings.push(category);
      children.set(category.parentCategoryId, siblings);
    }
    for (const siblings of children.values()) {
      siblings.sort((left, right) => left.name.localeCompare(right.name, "da"));
    }
    return children;
  }, [categories]);

  const invalidParentIds = useMemo(() => {
    if (editor?.kind !== "edit") return new Set<Id<"categories">>();
    const invalid = new Set<Id<"categories">>([editor.category.id]);
    const queue = [editor.category.id];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const child of childrenByParent.get(current) ?? []) {
        if (!invalid.has(child.id)) {
          invalid.add(child.id);
          queue.push(child.id);
        }
      }
    }
    return invalid;
  }, [childrenByParent, editor]);

  const validParentOptions = (categories ?? []).filter(
    (category) => !invalidParentIds.has(category.id),
  );
  const targetItems = (categories ?? []).map((category) => ({
    value: category.id,
    label: category.path,
  }));
  const parentItems = [
    { value: ROOT_VALUE, label: "Øverste niveau" },
    ...validParentOptions.map((category) => ({
      value: category.id,
      label: category.path,
    })),
  ];

  function openCreate(
    initialPlacement: PlacementKind = "root",
    initialTargetId: Id<"categories"> | null = null,
  ) {
    setEditor({
      kind: "create",
      placement: initialPlacement,
      targetId: initialTargetId,
    });
    setName("");
    setPlacement(initialPlacement);
    setTargetId(initialTargetId);
    setError("");
  }

  function openEdit(category: Category) {
    setEditor({ kind: "edit", category });
    setName(category.name);
    setParentId(category.parentCategoryId);
    setError("");
  }

  async function save() {
    if (!name.trim()) {
      setError("Indtast et navn til kategorien");
      return;
    }
    if (editor?.kind === "create" && placement !== "root" && !targetId) {
      setError("Vælg en kategori til placeringen");
      return;
    }

    setIsSaving(true);
    setError("");
    try {
      if (editor?.kind === "create") {
        await createCategory({
          name,
          placement:
            placement === "root"
              ? { kind: "root" }
              : placement === "child"
                ? { kind: "child", parentCategoryId: targetId! }
                : { kind: "parent", childCategoryId: targetId! },
        });
        if (targetId) {
          setExpandedIds((current) => new Set(current).add(targetId));
        }
        toast.success("Kategorien er oprettet");
      } else if (editor?.kind === "edit") {
        await updateCategory({
          categoryId: editor.category.id,
          name,
          parentCategoryId: parentId,
        });
        if (parentId) {
          setExpandedIds((current) => new Set(current).add(parentId));
        }
        toast.success("Kategorien er gemt");
      }
      setEditor(null);
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
      await deleteCategory({ categoryId: pendingDelete.id });
      toast.success("Kategorien er fjernet");
      setPendingDelete(null);
    } catch (caught) {
      toast.error(messageFrom(caught));
    } finally {
      setIsDeleting(false);
    }
  }

  function renderCategory(category: Category) {
    const children = childrenByParent.get(category.id) ?? [];
    const expanded =
      expandedIds.has(category.id) ||
      (!expansionInitialized && category.hasChildren);
    const deleteDisabled = category.hasChildren || category.inUse;
    const deleteReason = category.hasChildren
      ? "Kategorien har underkategorier og kan derfor ikke fjernes."
      : "Kategorien bruges af produkter eller personalemadsregler og kan derfor ikke fjernes.";
    const row = (
      <div
        className="flex min-h-14 min-w-max items-center gap-2 border-b px-2"
        style={{ paddingInlineStart: `${category.depth * 1.5 + 0.5}rem` }}
      >
        {category.hasChildren ? (
          <CollapsibleTrigger
            render={
              <Button
                variant="ghost"
                size="icon-lg"
                className="size-11"
                aria-label={
                  expanded ? `Skjul ${category.name}` : `Vis ${category.name}`
                }
              />
            }
          >
            <ChevronRightIcon className={cn(expanded && "rotate-90")} />
          </CollapsibleTrigger>
        ) : (
          <span className="inline-flex size-11 shrink-0" aria-hidden="true" />
        )}
        {expanded && category.hasChildren ? (
          <FolderOpenIcon className="size-5 shrink-0 text-muted-foreground" />
        ) : (
          <FolderIcon className="size-5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-40 flex-1 font-medium">{category.name}</span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="size-11"
                  aria-label={`Ny underkategori under ${category.name}`}
                  onClick={() => openCreate("child", category.id)}
                />
              }
            >
              <FolderPlusIcon />
            </TooltipTrigger>
            <TooltipContent>Ny underkategori</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="size-11"
                  aria-label={`Redigér ${category.name}`}
                  onClick={() => openEdit(category)}
                />
              }
            >
              <PencilIcon />
            </TooltipTrigger>
            <TooltipContent>Redigér</TooltipContent>
          </Tooltip>
          {deleteDisabled ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    className="inline-flex"
                    tabIndex={0}
                    aria-label={`Hvorfor ${category.name} ikke kan fjernes`}
                  />
                }
              >
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="size-11"
                  aria-label={`Fjern ${category.name}`}
                  disabled
                >
                  <Trash2Icon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{deleteReason}</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    className="size-11"
                    aria-label={`Fjern ${category.name}`}
                    onClick={() => setPendingDelete(category)}
                  />
                }
              >
                <Trash2Icon />
              </TooltipTrigger>
              <TooltipContent>Fjern</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    );

    if (!category.hasChildren) {
      return (
        <div
          key={category.id}
          role="treeitem"
          aria-level={category.depth + 1}
          aria-selected={false}
        >
          {row}
        </div>
      );
    }
    return (
      <Collapsible
        key={category.id}
        open={expanded}
        onOpenChange={(open) =>
          setExpandedIds((current) => {
            const next = new Set(current);
            if (open) next.add(category.id);
            else next.delete(category.id);
            return next;
          })
        }
        role="treeitem"
        aria-level={category.depth + 1}
        aria-expanded={expanded}
        aria-selected={false}
      >
        {row}
        <CollapsibleContent role="group">
          {children.map(renderCategory)}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-2xl flex-col gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">Kategorier</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Organiser produkter i kategorier og underkategorier. En kategori kan
            både indeholde produkter og andre kategorier.
          </p>
        </div>
        <Button
          size="lg"
          className="min-h-11 px-4"
          onClick={() => openCreate()}
        >
          <PlusIcon data-icon="inline-start" />
          Ny kategori
        </Button>
      </div>

      {showSkeleton ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </div>
      ) : null}

      {categories?.length === 0 ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShapesIcon />
            </EmptyMedia>
            <EmptyTitle>Ingen kategorier endnu</EmptyTitle>
            <EmptyDescription>
              Opret den første kategori for at organisere produkterne.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button className="min-h-11 px-4" onClick={() => openCreate()}>
              <PlusIcon data-icon="inline-start" />
              Ny kategori
            </Button>
          </EmptyContent>
        </Empty>
      ) : null}

      {categories && categories.length > 0 ? (
        <div
          className="overflow-x-auto rounded-xl border"
          role="tree"
          aria-label="Kategorier"
        >
          {childrenByParent.get(null)?.map(renderCategory)}
        </div>
      ) : null}

      <Dialog
        open={Boolean(editor)}
        onOpenChange={(open) => {
          if (!open && !isSaving) setEditor(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editor?.kind === "edit" ? "Redigér kategori" : "Ny kategori"}
            </DialogTitle>
            <DialogDescription>
              Kategorinavnet skal være unikt i organisationen.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="category-name">Navn</FieldLabel>
              <Input
                id="category-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={Boolean(error)}
              />
            </Field>
            {editor?.kind === "create" ? (
              <>
                <Field>
                  <FieldLabel htmlFor="category-placement">
                    Placering
                  </FieldLabel>
                  <Select
                    items={PLACEMENT_ITEMS}
                    value={placement}
                    onValueChange={(value) => {
                      setPlacement(value as PlacementKind);
                      setTargetId(null);
                    }}
                  >
                    <SelectTrigger
                      id="category-placement"
                      className="h-11 w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="root">Øverste niveau</SelectItem>
                        <SelectItem value="child">Under en kategori</SelectItem>
                        <SelectItem value="parent">Over en kategori</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                {placement !== "root" ? (
                  <Field>
                    <FieldLabel htmlFor="category-target">Kategori</FieldLabel>
                    <Select
                      items={targetItems}
                      value={targetId}
                      onValueChange={(value) =>
                        setTargetId(value as Id<"categories">)
                      }
                    >
                      <SelectTrigger
                        id="category-target"
                        className="h-11 w-full"
                      >
                        <SelectValue placeholder="Vælg kategori" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {(categories ?? []).map((category) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.path}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}
              </>
            ) : null}
            {editor?.kind === "edit" ? (
              <Field>
                <FieldLabel htmlFor="category-parent">Overkategori</FieldLabel>
                <Select
                  items={parentItems}
                  value={parentId ?? ROOT_VALUE}
                  onValueChange={(value) =>
                    setParentId(
                      value === ROOT_VALUE ? null : (value as Id<"categories">),
                    )
                  }
                >
                  <SelectTrigger id="category-parent" className="h-11! w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={ROOT_VALUE}>Øverste niveau</SelectItem>
                      {validParentOptions.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.path}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <FieldError>{error}</FieldError>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isSaving}
              onClick={() => setEditor(null)}
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
            <AlertDialogTitle>Fjern kategori?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `Kategorien “${pendingDelete.path}” fjernes permanent.`
                : "Kategorien fjernes permanent."}
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
