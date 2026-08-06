import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";

export const MAX_CATEGORIES_PER_ORGANIZATION = 200;
export const CATEGORY_PATH_SEPARATOR = " / ";

type Category = Pick<
  Doc<"categories">,
  "_id" | "organizationId" | "name" | "parentCategoryId"
>;

export type CategoryHierarchyItem = {
  id: Id<"categories">;
  name: string;
  parentCategoryId: Id<"categories"> | null;
  path: string;
  depth: number;
  hasChildren: boolean;
};

function categoryError(message: string): never {
  throw new ConvexError(message);
}

function categoryMap(categories: Category[], organizationId: string) {
  if (categories.length > MAX_CATEGORIES_PER_ORGANIZATION) {
    categoryError("Organisationen har for mange kategorier");
  }

  const byId = new Map<Id<"categories">, Category>();
  for (const category of categories) {
    if (category.organizationId !== organizationId) {
      categoryError("Kategorihierarkiet krydser organisationer");
    }
    byId.set(category._id, category);
  }
  return byId;
}

export function buildCategoryHierarchy(
  categories: Category[],
  organizationId: string,
): CategoryHierarchyItem[] {
  const byId = categoryMap(categories, organizationId);
  const resolved = new Map<Id<"categories">, { path: string; depth: number }>();
  const resolving = new Set<Id<"categories">>();

  function resolve(category: Category): { path: string; depth: number } {
    const existing = resolved.get(category._id);
    if (existing) return existing;
    if (resolving.has(category._id)) {
      categoryError("Kategorihierarkiet indeholder en cirkel");
    }

    resolving.add(category._id);
    const parentId = category.parentCategoryId;
    let result: { path: string; depth: number };
    if (!parentId) {
      result = { path: category.name, depth: 0 };
    } else {
      const parent = byId.get(parentId);
      if (!parent) {
        categoryError("En overkategori blev ikke fundet i organisationen");
      }
      const parentResult = resolve(parent);
      result = {
        path: `${parentResult.path}${CATEGORY_PATH_SEPARATOR}${category.name}`,
        depth: parentResult.depth + 1,
      };
    }
    resolving.delete(category._id);
    resolved.set(category._id, result);
    return result;
  }

  for (const category of categories) resolve(category);

  const children = new Map<Id<"categories"> | null, Category[]>();
  for (const category of categories) {
    const parentId = category.parentCategoryId ?? null;
    const siblings = children.get(parentId) ?? [];
    siblings.push(category);
    children.set(parentId, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort(
      (left, right) =>
        left.name.localeCompare(right.name, "da", { sensitivity: "base" }) ||
        left._id.localeCompare(right._id),
    );
  }

  const result: CategoryHierarchyItem[] = [];
  function append(parentId: Id<"categories"> | null) {
    for (const category of children.get(parentId) ?? []) {
      const hierarchy = resolved.get(category._id)!;
      result.push({
        id: category._id,
        name: category.name,
        parentCategoryId: category.parentCategoryId ?? null,
        path: hierarchy.path,
        depth: hierarchy.depth,
        hasChildren: (children.get(category._id)?.length ?? 0) > 0,
      });
      append(category._id);
    }
  }
  append(null);

  if (result.length !== categories.length) {
    categoryError("Kategorihierarkiet kunne ikke opbygges");
  }
  return result;
}

export function validateCategoryParentAssignment(
  categories: Category[],
  organizationId: string,
  categoryId: Id<"categories">,
  parentCategoryId: Id<"categories"> | null,
) {
  if (!parentCategoryId) return;
  const byId = categoryMap(categories, organizationId);
  if (!byId.has(categoryId)) categoryError("Kategorien blev ikke fundet");

  const visited = new Set<Id<"categories">>();
  let currentId: Id<"categories"> | undefined = parentCategoryId;
  for (let depth = 0; currentId; depth++) {
    if (depth >= MAX_CATEGORIES_PER_ORGANIZATION) {
      categoryError("Kategorihierarkiet er for dybt");
    }
    if (currentId === categoryId) {
      categoryError(
        "En kategori kan ikke placeres under sig selv eller en underkategori",
      );
    }
    if (visited.has(currentId)) {
      categoryError("Kategorihierarkiet indeholder en cirkel");
    }
    visited.add(currentId);
    const current = byId.get(currentId);
    if (!current) categoryError("Overkategorien blev ikke fundet");
    currentId = current.parentCategoryId;
  }
}
