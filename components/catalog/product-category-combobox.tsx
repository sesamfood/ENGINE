"use client";

import { useMemo } from "react";
import {
  CreatableMultiCombobox,
  type ComboboxOptionGroup,
} from "@/components/catalog/creatable-combobox";

type ProductCategory = {
  id: string;
  name: string;
  parentCategoryId: string | null;
  path: string;
  depth: number;
};

type ProductOption = {
  value: string;
  label: string;
  categoryIds: readonly string[];
  disabled?: boolean;
};

const UNCATEGORIZED_GROUP_VALUE = "__uncategorized__";

export function ProductCategoryCombobox({
  categories,
  products,
  values,
  onValuesChange,
  topProductValues = [],
  disabled = false,
  ariaLabel,
}: {
  categories: readonly ProductCategory[];
  products: readonly ProductOption[];
  values: string[];
  onValuesChange: (values: string[]) => void;
  topProductValues?: readonly string[];
  disabled?: boolean;
  ariaLabel: string;
}) {
  const { options, groups } = useMemo(() => {
    const categoriesById = new Map(
      categories.map((category) => [category.id, category]),
    );
    const categoryOrder = new Map(
      categories.map((category, index) => [category.id, index]),
    );
    const options = [...products]
      .sort((left, right) => {
        const leftCategoryId = left.categoryIds[0];
        const rightCategoryId = right.categoryIds[0];
        const leftCategoryOrder = leftCategoryId
          ? (categoryOrder.get(leftCategoryId) ?? categories.length)
          : categories.length;
        const rightCategoryOrder = rightCategoryId
          ? (categoryOrder.get(rightCategoryId) ?? categories.length)
          : categories.length;
        return (
          leftCategoryOrder - rightCategoryOrder ||
          left.label.localeCompare(right.label, "da")
        );
      })
      .map((product) => {
        const primaryCategoryId = product.categoryIds[0];
        const primaryCategory = primaryCategoryId
          ? categoriesById.get(primaryCategoryId)
          : undefined;
        return {
          value: product.value,
          label: product.label,
          disabled: product.disabled,
          group: primaryCategory?.id ?? UNCATEGORIZED_GROUP_VALUE,
          groupDepth: primaryCategory?.depth ?? 0,
          groupLabel: primaryCategory?.name ?? "Uden kategori",
          searchText: product.categoryIds
            .flatMap((categoryId) => {
              const category = categoriesById.get(categoryId);
              return category ? [category.path] : [];
            })
            .join(" "),
        };
      });
    const groups: ComboboxOptionGroup[] = categories.flatMap((category) => {
      const optionValues = products.flatMap((product) => {
        let categoryId: string | null = product.categoryIds[0] ?? null;
        while (categoryId) {
          if (categoryId === category.id) return [product.value];
          categoryId = categoriesById.get(categoryId)?.parentCategoryId ?? null;
        }
        return [];
      });
      return optionValues.length
        ? [
            {
              value: category.id,
              label: category.name,
              title: category.path,
              depth: category.depth,
              optionValues,
            },
          ]
        : [];
    });
    const uncategorizedProductValues = products.flatMap((product) => {
      const primaryCategoryId = product.categoryIds[0];
      return !primaryCategoryId || !categoriesById.has(primaryCategoryId)
        ? [product.value]
        : [];
    });
    if (uncategorizedProductValues.length > 0) {
      groups.push({
        value: UNCATEGORIZED_GROUP_VALUE,
        label: "Uden kategori",
        depth: 0,
        optionValues: uncategorizedProductValues,
      });
    }
    return { options, groups };
  }, [categories, products]);

  return (
    <CreatableMultiCombobox
      options={options}
      values={values}
      onValuesChange={onValuesChange}
      placeholder="Søg efter produkt eller kategori"
      allowCreate={false}
      preserveSearchOnSelect
      selectableGroups
      groups={groups}
      suggestionLabel="Aktuelle topprodukter"
      suggestionValues={topProductValues}
      disabled={disabled}
      ariaLabel={ariaLabel}
    />
  );
}
