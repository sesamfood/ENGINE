"use client";

import type { FunctionReturnType } from "convex/server";

import { getUserErrorMessage } from "@/lib/user-errors";
import { searchProducts } from "@/lib/product-search";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowUpDownIcon,
  BoxesIcon,
  LayoutGridIcon,
  ListIcon,
  PackageOpenIcon,
  PencilIcon,
  PlusIcon,
  MoreHorizontalIcon,
  SearchIcon,
  TagsIcon,
  Trash2Icon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ProductImportExport } from "@/components/catalog/product-import-export";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RowsSkeleton } from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ProductStatus = "active" | "archived";
const sortItems = [
  { value: "name", label: "Navn (A-Å)" },
  { value: "nameDesc", label: "Navn (Å-A)" },
  { value: "created", label: "Senest tilføjet" },
  { value: "updated", label: "Senest opdateret" },
] as const;
type ProductSort = (typeof sortItems)[number]["value"];
function isProductSort(value: unknown): value is ProductSort {
  return sortItems.some((item) => item.value === value);
}
const MAX_BULK_PRODUCT_SELECTION = 200;
type CatalogProduct = FunctionReturnType<
  typeof api.catalog.listProducts
>["page"][number];

type CategoryMenuOption = {
  id: Id<"categories">;
  name: string;
  parentCategoryId: Id<"categories"> | null;
  path: string;
  depth: number;
};

function CategoryMenuItems({
  categories,
  parentCategoryId,
  onSelect,
}: {
  categories: CategoryMenuOption[];
  parentCategoryId: Id<"categories"> | null;
  onSelect: (categoryId: Id<"categories">) => void;
}) {
  return categories
    .filter((category) => category.parentCategoryId === parentCategoryId)
    .map((category) => {
      const hasChildren = categories.some(
        (child) => child.parentCategoryId === category.id,
      );

      if (!hasChildren) {
        return (
          <DropdownMenuItem
            key={category.id}
            onClick={() => onSelect(category.id)}
          >
            {category.name}
          </DropdownMenuItem>
        );
      }

      return (
        <DropdownMenuSub key={category.id}>
          <DropdownMenuSubTrigger onClick={() => onSelect(category.id)}>
            {category.name}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => onSelect(category.id)}>
                Vælg {category.name}
              </DropdownMenuItem>
              <CategoryMenuItems
                categories={categories}
                parentCategoryId={category.id}
                onSelect={onSelect}
              />
            </DropdownMenuGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      );
    });
}

function catalogQuery(
  search: string,
  status: ProductStatus,
) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  params.set("status", status);
  return `?${params.toString()}`;
}

function productEditHref(
  productId: Id<"products">,
  search: string,
  status: ProductStatus,
) {
  return `/administration/products/${productId}${catalogQuery(search, status)}`;
}

function newProductHref(search: string, status: ProductStatus) {
  return `/administration/products/new${catalogQuery(search, status)}`;
}

function ProductImage({ product }: { product: CatalogProduct }) {
  if (product.imageUrl) {
    return (
      <div className="relative aspect-4/3 w-full overflow-hidden bg-muted">
        <Image
          src={product.imageUrl}
          alt={`Produktbillede af ${product.name}`}
          fill
          sizes="(max-width: 639px) 100vw, (max-width: 1023px) 33vw, (max-width: 1199px) 25vw, (max-width: 1599px) 20vw, (max-width: 1919px) 16vw, (max-width: 2239px) 14vw, 12vw"
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div className="flex aspect-4/3 w-full items-center justify-center bg-muted text-muted-foreground">
      <PackageOpenIcon className="size-12" aria-hidden="true" />
    </div>
  );
}

function ProductCard({
  product,
  editHref,
  isSelectionMode,
  isSelected,
  onSelect,
  onArchive,
  onRestore,
  onDelete,
}: {
  product: CatalogProduct;
  editHref: string;
  isSelectionMode: boolean;
  isSelected: boolean;
  onSelect: (productId: Id<"products">, selected: boolean) => void;
  onArchive: (product: CatalogProduct) => void;
  onRestore: (product: CatalogProduct) => void;
  onDelete: (product: CatalogProduct) => void;
}) {
  return (
    <Card appearance="catalog" className="relative">
      {isSelectionMode ? (
        <button
          type="button"
          aria-pressed={isSelected}
          aria-label={`Vælg ${product.name}`}
          className="absolute inset-0 z-10 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"
          onClick={() => onSelect(product.id, !isSelected)}
        />
      ) : (
        <Link
          href={editHref}
          aria-label={`Redigér ${product.name}`}
          className="absolute inset-0 z-10 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"
        />
      )}
      {isSelectionMode ? (
        <div className="absolute left-3 top-3 z-20 rounded-md bg-background/90 p-1 shadow-sm">
          <Checkbox
            checked={isSelected}
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none"
          />
        </div>
      ) : null}
      <ProductImage product={product} />
      <CardHeader appearance="padded">
        <CardTitle appearance="productName">{product.name}</CardTitle>
        <CardDescription>
          {product.categories.map((category) => category.name).join(" · ") ||
            "Uden kategori"}
        </CardDescription>
      </CardHeader>
        {!isSelectionMode ? (
        <CardFooter appearance="product" className="relative z-20 mt-auto flex items-center justify-end">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="size-11"
                  nativeButton={false}
                  render={<Link href={editHref} tabIndex={-1} aria-label={`Redigér ${product.name}`} />}
                />
              }
            >
              <PencilIcon />
            </TooltipTrigger>
            <TooltipContent>Redigér</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  className="size-11"
                  aria-label={`${product.status === "active" ? "Arkivér" : "Gendan"} ${product.name}`}
                  onClick={() =>
                    product.status === "active"
                      ? onArchive(product)
                      : onRestore(product)
                  }
                />
              }
            >
              {product.status === "active" ? (
                <ArchiveIcon />
              ) : (
                <ArchiveRestoreIcon />
              )}
            </TooltipTrigger>
            <TooltipContent>
              {product.status === "active" ? "Arkivér" : "Gendan"}
            </TooltipContent>
          </Tooltip>
          {product.status === "archived" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="size-11"
              aria-label={`Slet ${product.name} permanent`}
              onClick={() => onDelete(product)}
            >
              <Trash2Icon />
            </Button>
          ) : null}
        </CardFooter>
        ) : null}
    </Card>
  );
}

function ProductListRow({
  product,
  editHref,
  isSelectionMode,
  isSelected,
  onSelect,
  onArchive,
  onRestore,
  onDelete,
}: {
  product: CatalogProduct;
  editHref: string;
  isSelectionMode: boolean;
  isSelected: boolean;
  onSelect: (productId: Id<"products">, selected: boolean) => void;
  onArchive: (product: CatalogProduct) => void;
  onRestore: (product: CatalogProduct) => void;
  onDelete: (product: CatalogProduct) => void;
}) {
  const meta = [
    product.categories.map((category) => category.name).join(" · ") ||
      "Uden kategori",
    product.defaultUnit?.name,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="relative flex items-center gap-3 rounded-xl border bg-card p-3">
      {isSelectionMode ? (
        <button
          type="button"
          aria-pressed={isSelected}
          aria-label={`Vælg ${product.name}`}
          className="absolute inset-0 z-10 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"
          onClick={() => onSelect(product.id, !isSelected)}
        />
      ) : (
        <Link
          href={editHref}
          aria-label={`Redigér ${product.name}`}
          className="absolute inset-0 z-10 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"
        />
      )}
      {isSelectionMode ? (
        <Checkbox
          checked={isSelected}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none relative z-20 shrink-0"
        />
      ) : null}
      <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt=""
            fill
            sizes="56px"
            className="object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <PackageOpenIcon aria-hidden="true" />
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{product.name}</span>
        <span className="truncate text-sm text-muted-foreground">{meta}</span>
      </span>
      {!isSelectionMode ? (
        <span className="relative z-20 flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            nativeButton={false}
            className="max-sm:hidden"
            render={<Link href={editHref} tabIndex={-1} aria-label={`Redigér ${product.name}`} />}
          >
            <PencilIcon data-icon="inline-start" />
            Redigér
          </Button>
          <Button
            type="button"
            variant="ghost"
            aria-label={`${product.status === "active" ? "Arkivér" : "Gendan"} ${product.name}`}
            onClick={() =>
              product.status === "active"
                ? onArchive(product)
                : onRestore(product)
            }
          >
            {product.status === "active" ? (
              <ArchiveIcon data-icon="inline-start" />
            ) : (
              <ArchiveRestoreIcon data-icon="inline-start" />
            )}
            {product.status === "active" ? "Arkivér" : "Gendan"}
          </Button>
          {product.status === "archived" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="size-11"
              aria-label={`Slet ${product.name} permanent`}
              onClick={() => onDelete(product)}
            >
              <Trash2Icon />
            </Button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

function CatalogSkeleton() {
  return (
    <div className="grid gap-5 min-[380px]:grid-cols-2 min-[640px]:grid-cols-3 min-[1024px]:grid-cols-4 min-[1200px]:grid-cols-5 min-[1600px]:grid-cols-6 min-[1920px]:grid-cols-7 min-[2240px]:grid-cols-8">
      {Array.from({ length: 8 }, (_, index) => (
        <Card key={index} appearance="gallery">
          <Skeleton appearance="square" className="aspect-4/3 w-full" />
          <CardHeader appearance="inset">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

export function ProductCatalog() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const status: ProductStatus =
    searchParams.get("status") === "archived" ? "archived" : "active";
  const search = searchParams.get("search") ?? "";
  const [pendingProduct, setPendingProduct] = useState<CatalogProduct | null>(
    null,
  );
  const [pendingDeleteProduct, setPendingDeleteProduct] =
    useState<CatalogProduct | null>(null);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [catalogView, setCatalogView] = useState<"grid" | "list">("grid");
  useEffect(() => {
    const stored = window.localStorage.getItem("catalog-view");
    const initial =
      stored === "list" || stored === "grid"
        ? stored
        : window.matchMedia("(min-width: 768px)").matches
          ? "list"
          : null;
    if (initial) {
      const timer = window.setTimeout(() => setCatalogView(initial), 0);
      return () => window.clearTimeout(timer);
    }
  }, []);
  function changeCatalogView(next: "grid" | "list") {
    setCatalogView(next);
    window.localStorage.setItem("catalog-view", next);
  }
  const [sort, setSort] = useState<ProductSort>("name");
  useEffect(() => {
    const stored = window.localStorage.getItem("catalog-sort");
    if (isProductSort(stored)) {
      const timer = window.setTimeout(() => setSort(stored), 0);
      return () => window.clearTimeout(timer);
    }
  }, []);
  function changeSort(next: ProductSort) {
    setSort(next);
    window.localStorage.setItem("catalog-sort", next);
  }
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Id<"products">[]>([]);
  const [bulkCategoryId, setBulkCategoryId] = useState<Id<"categories"> | null>(
    null,
  );
  const [isBulkCategoryDialogOpen, setIsBulkCategoryDialogOpen] =
    useState(false);
  const [isChangingCategory, setIsChangingCategory] = useState(false);
  const [searchValue, setSearchValue] = useState(search);
  const [querySearch, setQuerySearch] = useState(search);
  const pendingSearch = useRef<string | null>(null);
  const [visibleResults, setVisibleResults] = useState<CatalogProduct[]>([]);
  const archiveProduct = useMutation(api.catalog.archiveProduct);
  const restoreProduct = useMutation(api.catalog.restoreProduct);
  const deleteProduct = useMutation(api.catalog.deleteProduct);
  const bulkUpdateProductCategory = useMutation(
    api.catalog.bulkUpdateProductCategory,
  );
  const categoryOptions = useQuery(api.catalog.listCategoryOptions);
  const {
    results,
    status: paginationStatus,
    loadMore,
  } = usePaginatedQuery(
    api.catalog.listProducts,
    {
      status,
      search: querySearch,
      sort,
    },
    { initialNumItems: 24 },
  );

  const [requestedPage, setRequestedPage] = useState({
    search: querySearch,
    status,
    count: 24,
  });
  const requestedResults = requestedPage.search === querySearch && requestedPage.status === status
    ? requestedPage.count
    : 24;
  const hasSearch = querySearch.trim().length > 0;
  useEffect(() => {
    if (
      paginationStatus === "CanLoadMore" &&
      (hasSearch || results.length < requestedResults)
    ) {
      loadMore(24);
    }
  }, [hasSearch, loadMore, paginationStatus, requestedResults, results.length]);

  useEffect(() => {
    if (pendingSearch.current === search) {
      pendingSearch.current = null;
      return;
    }
    if (pendingSearch.current === null) setSearchValue(search);
  }, [search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setQuerySearch(searchValue);
      if (searchValue !== search) {
        pendingSearch.current = searchValue;
        router.replace(
          `/administration/products${catalogQuery(searchValue, status)}`,
          { scroll: false },
        );
      }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [router, search, searchValue, status]);

  async function confirmStatusChange() {
    if (!pendingProduct) return;
    setIsChangingStatus(true);
    try {
      if (pendingProduct.status === "active") {
        await archiveProduct({ productId: pendingProduct.id });
        toast.success(`${pendingProduct.name} er arkiveret`);
      } else {
        await restoreProduct({ productId: pendingProduct.id });
        toast.success(`${pendingProduct.name} er gendannet`);
      }
      setSelectedIds((current) =>
        current.filter((productId) => productId !== pendingProduct.id),
      );
      setPendingProduct(null);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Produktet kunne ikke opdateres. Prøv igen."));
    } finally {
      setIsChangingStatus(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDeleteProduct) return;
    setIsDeleting(true);
    try {
      await deleteProduct({ productId: pendingDeleteProduct.id });
      toast.success(`${pendingDeleteProduct.name} er slettet permanent`);
      setSelectedIds((current) =>
        current.filter((productId) => productId !== pendingDeleteProduct.id),
      );
      setPendingDeleteProduct(null);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Produktet kunne ikke opdateres. Prøv igen."));
    } finally {
      setIsDeleting(false);
    }
  }

  const loading =
    paginationStatus === "LoadingFirstPage" ||
    (hasSearch && categoryOptions === undefined) ||
    (hasSearch && paginationStatus !== "Exhausted") ||
    (results.length === 0 && paginationStatus !== "Exhausted");
  const currentResults = useMemo(() => {
    if (!hasSearch) return results;
    const paths = new Map(
      categoryOptions?.map((category) => [category.id, category.path]),
    );
    return searchProducts(results, querySearch, (product) => ({
      name: product.name,
      categoryPath: product.categories
        .map((category) => paths.get(category.id) ?? category.name)
        .join(" · "),
      productType: product.productType,
    })).slice(0, requestedResults);
  }, [categoryOptions, hasSearch, querySearch, requestedResults, results]);

  useEffect(() => {
    if (!loading) {
      const frame = window.requestAnimationFrame(() => {
        setVisibleResults(currentResults);
      });

      return () => window.cancelAnimationFrame(frame);
    }
  }, [currentResults, loading]);

  const displayedResults = loading ? visibleResults : currentResults;
  const showSkeleton = useDelayedLoading(
    loading && displayedResults.length === 0,
  );
  const selectedProductIds = new Set(selectedIds);

  function selectProduct(productId: Id<"products">, selected: boolean) {
    setSelectedIds((current) => {
      if (selected) {
        if (current.includes(productId)) return current;
        if (current.length >= MAX_BULK_PRODUCT_SELECTION) {
          toast.error(
            `Du kan højst vælge ${MAX_BULK_PRODUCT_SELECTION} produkter ad gangen`,
          );
          return current;
        }
        return [...current, productId];
      }
      return current.filter((id) => id !== productId);
    });
  }

  function changeSearch(value: string) {
    pendingSearch.current = value;
    setSearchValue(value);
    setSelectedIds([]);
    setBulkCategoryId(null);
  }

  function changeStatus(nextStatus: ProductStatus) {
    if (nextStatus === status) return;
    setSelectedIds([]);
    setBulkCategoryId(null);
    router.replace(
      `/administration/products${catalogQuery(searchValue, nextStatus)}`,
      { scroll: false },
    );
  }

  function toggleSelectionMode() {
    setIsSelectionMode((current) => !current);
    setSelectedIds([]);
    setBulkCategoryId(null);
  }

  async function confirmBulkCategory() {
    if (!bulkCategoryId || selectedIds.length === 0) return;
    setIsChangingCategory(true);
    try {
      await bulkUpdateProductCategory({
        productIds: selectedIds,
        categoryId: bulkCategoryId,
      });
      toast.success(`Kategori ændret for ${selectedIds.length} produkter`);
      setSelectedIds([]);
      setBulkCategoryId(null);
      setIsSelectionMode(false);
      setIsBulkCategoryDialogOpen(false);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Produktet kunne ikke opdateres. Prøv igen."));
    } finally {
      setIsChangingCategory(false);
    }
  }

  function selectBulkCategory(categoryId: Id<"categories">) {
    setBulkCategoryId(categoryId);
    setIsBulkCategoryDialogOpen(true);
  }

  const selectedBulkCategory = categoryOptions?.find(
    (category) => category.id === bulkCategoryId,
  );

  return (
    <div className="flex flex-col gap-7">
      <div className="z-30 -mx-4 bg-background px-4 py-3 max-sm:static sm:sticky sm:top-16 md:top-18 md:py-4">
        <div className="flex flex-wrap items-center gap-3">
          <InputGroup className="h-11 w-full sm:min-w-48 sm:flex-1">
            <InputGroupAddon>
              <SearchIcon />
              <span className="sr-only">Søg</span>
            </InputGroupAddon>
            <InputGroupInput
              value={searchValue}
              onChange={(event) => changeSearch(event.target.value)}
              placeholder="Søg efter produkter"
              aria-label="Søg efter produkter eller kategorier"
            />
          </InputGroup>
          <ToggleGroup
            aria-label="Produktstatus"
            variant="outline"
            spacing={0}
            size="lg"
            value={[status]}
            onValueChange={(values) => {
              const value = values[0];
              if (value === "active" || value === "archived") changeStatus(value);
            }}
            className="shrink-0"
          >
            <ToggleGroupItem value="active" className="min-h-11">Aktive</ToggleGroupItem>
            <ToggleGroupItem value="archived" className="min-h-11">Arkiverede</ToggleGroupItem>
          </ToggleGroup>
          <Select
            items={sortItems}
            value={sort}
            onValueChange={(value) => {
              if (isProductSort(value)) changeSort(value);
            }}
          >
            <SelectTrigger
              aria-label="Sortering"
              className="h-11! w-full shrink-0 sm:w-auto"
            >
              <ArrowUpDownIcon />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {sortItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <ToggleGroup
            aria-label="Visning"
            variant="outline"
            spacing={0}
            size="lg"
            value={[catalogView]}
            onValueChange={(values) => {
              const value = values[0];
              if (value === "grid" || value === "list") changeCatalogView(value);
            }}
            className="shrink-0"
          >
            <ToggleGroupItem value="grid" className="min-h-11">
              <LayoutGridIcon data-icon="inline-start" />
              Kort
            </ToggleGroupItem>
            <ToggleGroupItem value="list" className="min-h-11">
              <ListIcon data-icon="inline-start" />
              Liste
            </ToggleGroupItem>
          </ToggleGroup>
          <div className="flex flex-row flex-wrap items-center gap-3 md:flex-none">
            <Button
              size="lg"
              appearance="standard"
              className="min-h-11"
              onClick={() => router.push(newProductHref(search, status))}
            >
              <PlusIcon data-icon="inline-start" />
              Nyt produkt
            </Button>
            <Button
              type="button"
              variant={isSelectionMode ? "secondary" : "outline"}
              appearance="compact"
              className="min-h-11"
              aria-pressed={isSelectionMode}
              onClick={toggleSelectionMode}
            >
              {isSelectionMode ? "Annullér valg" : "Vælg produkter"}
            </Button>
            {isSelectionMode ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      appearance="compact"
                      className="min-h-11"
                      aria-label="Handlinger for valgte produkter"
                      disabled={selectedIds.length === 0}
                    />
                  }
                >
                  <span>{selectedIds.length} valgte</span>
                  <MoreHorizontalIcon data-icon="inline-end" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>
                      {selectedIds.length} valgt
                    </DropdownMenuLabel>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <TagsIcon />
                        Skift kategori
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuGroup>
                          {categoryOptions === undefined ? (
                            <DropdownMenuItem disabled>
                              Indlæser kategorier
                            </DropdownMenuItem>
                          ) : categoryOptions.length === 0 ? (
                            <DropdownMenuItem disabled>
                              Ingen kategorier
                            </DropdownMenuItem>
                          ) : (
                            <CategoryMenuItems
                              categories={categoryOptions}
                              parentCategoryId={null}
                              onSelect={selectBulkCategory}
                            />
                          )}
                        </DropdownMenuGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            <ProductImportExport />
          </div>
        </div>
      </div>

      {showSkeleton ? (
        catalogView === "list" ? (
          <RowsSkeleton rows={8} rowClassName="h-20" />
        ) : (
          <CatalogSkeleton />
        )
      ) : null}

      {!loading && results.length === 0 ? (
        <Empty appearance="outlined" className="min-h-80">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BoxesIcon />
            </EmptyMedia>
            <EmptyTitle>
              {status === "active"
                ? "Ingen produkter fundet"
                : "Ingen arkiverede produkter"}
            </EmptyTitle>
            <EmptyDescription>
              {search
                ? "Prøv en anden søgning."
                : status === "active"
                  ? "Opret det første produkt for at komme i gang med organisationens katalog."
                  : "Arkiverede produkter vises her, indtil de gendannes eller slettes permanent."}
            </EmptyDescription>
          </EmptyHeader>
          {status === "active" && !search ? (
            <EmptyContent>
              <Button
                appearance="standard"
                className="min-h-11"
                onClick={() => router.push(newProductHref(search, status))}
              >
                <PlusIcon data-icon="inline-start" />
                Nyt produkt
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : null}

      {loading && !showSkeleton && displayedResults.length > 0 ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Opdaterer produkter…
        </p>
      ) : null}

      {!showSkeleton && displayedResults.length > 0 ? (
        catalogView === "list" ? (
          <div aria-busy={loading} className="flex flex-col gap-2">
            {displayedResults.map((product) => (
              <ProductListRow
                key={product.id}
                product={product}
                editHref={productEditHref(product.id, search, status)}
                isSelectionMode={isSelectionMode}
                isSelected={selectedProductIds.has(product.id)}
                onSelect={selectProduct}
                onArchive={setPendingProduct}
                onRestore={setPendingProduct}
                onDelete={setPendingDeleteProduct}
              />
            ))}
          </div>
        ) : (
          <div aria-busy={loading} className="grid gap-5 min-[380px]:grid-cols-2 min-[640px]:grid-cols-3 min-[1024px]:grid-cols-4 min-[1200px]:grid-cols-5 min-[1600px]:grid-cols-6 min-[1920px]:grid-cols-7 min-[2240px]:grid-cols-8">
            {displayedResults.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                editHref={productEditHref(product.id, search, status)}
                isSelectionMode={isSelectionMode}
                isSelected={selectedProductIds.has(product.id)}
                onSelect={selectProduct}
                onArchive={setPendingProduct}
                onRestore={setPendingProduct}
                onDelete={setPendingDeleteProduct}
              />
            ))}
          </div>
        )
      ) : null}

      {(!loading && results.length > currentResults.length) ||
      (!hasSearch &&
        (paginationStatus === "CanLoadMore" ||
          paginationStatus === "LoadingMore")) ? (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="lg"
            appearance="wide"
            className="min-h-11"
            disabled={paginationStatus === "LoadingMore"}
            onClick={() =>
              setRequestedPage({
                search: querySearch,
                status,
                count: (hasSearch ? requestedResults : results.length) + 24,
              })
            }
          >
            {paginationStatus === "LoadingMore" ? (
              <Spinner data-icon="inline-start" />
            ) : null}
            Indlæs flere
          </Button>
        </div>
      ) : null}

      <AlertDialog
        open={Boolean(pendingProduct)}
        onOpenChange={(open) => {
          if (!open && !isChangingStatus) setPendingProduct(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingProduct?.status === "active"
                ? "Arkivér produkt?"
                : "Gendan produkt?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingProduct?.status === "active"
                ? `Arkiverer du ${pendingProduct.name}, forsvinder produktet fra produkt- og ingrediensvælgerne. Du kan gendanne det fra arkivet.`
                : `${pendingProduct?.name} vender tilbage til det aktive katalog og ingrediensvælgerne.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isChangingStatus}>
              Annullér
            </AlertDialogCancel>
            <AlertDialogAction
              variant={
                pendingProduct?.status === "active" ? "destructive" : "default"
              }
              disabled={isChangingStatus}
              onClick={confirmStatusChange}
            >
              {isChangingStatus ? <Spinner data-icon="inline-start" /> : null}
              {pendingProduct?.status === "active" ? "Arkivér" : "Gendan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isBulkCategoryDialogOpen}
        onOpenChange={(open) => {
          if (!isChangingCategory) setIsBulkCategoryDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skift kategori for produkter?</AlertDialogTitle>
            <AlertDialogDescription>
              Kategorien ændres for {selectedIds.length} valgte produkter til
              {" "}
              {selectedBulkCategory?.path ?? "den valgte kategori"}. Handlingen
              kan ikke fortrydes automatisk.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isChangingCategory}>
              Annullér
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isChangingCategory}
              onClick={confirmBulkCategory}
            >
              {isChangingCategory ? <Spinner data-icon="inline-start" /> : null}
              Skift kategori
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingDeleteProduct)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setPendingDeleteProduct(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet produkt permanent?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteProduct?.name}, billedet, enhederne og opskriften
              slettes permanent. Produktet fjernes også fra andre opskrifter,
              hvor det bruges som ingrediens. Handlingen kan ikke fortrydes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Annullér
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={confirmDelete}
            >
              {isDeleting ? <Spinner data-icon="inline-start" /> : null}
              Slet permanent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
