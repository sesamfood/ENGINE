"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BoxesIcon,
  PackageOpenIcon,
  PlusIcon,
  MoreHorizontalIcon,
  SearchIcon,
  TagsIcon,
  Trash2Icon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  CardAction,
  CardDescription,
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
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
const MAX_BULK_PRODUCT_SELECTION = 200;
type CatalogProduct = {
  id: Id<"products">;
  name: string;
  status: ProductStatus;
  category: { id: Id<"categories">; name: string } | null;
  imageUrl: string | null;
  deletesAt: number | null;
};

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

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
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
  return `/organization/products/${productId}${catalogQuery(search, status)}`;
}

function newProductHref(search: string, status: ProductStatus) {
  return `/organization/products/new${catalogQuery(search, status)}`;
}

function ProductImage({ product }: { product: CatalogProduct }) {
  if (product.imageUrl) {
    return (
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
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
    <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted text-muted-foreground">
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
    <Card className="relative gap-0 py-0 transition-shadow hover:shadow-sm">
      <Link
        href={editHref}
        aria-label={
          isSelectionMode ? `Vælg ${product.name}` : `Redigér ${product.name}`
        }
        className="absolute inset-0 z-10 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
        onClick={(event) => {
          if (!isSelectionMode) return;
          event.preventDefault();
          onSelect(product.id, !isSelected);
        }}
      />
      {isSelectionMode ? (
        <div className="absolute left-3 top-3 z-20 rounded-md bg-background/90 p-1 shadow-sm">
          <Checkbox
            checked={isSelected}
            aria-label={`Vælg ${product.name}`}
            onCheckedChange={(checked) =>
              onSelect(product.id, checked === true)
            }
          />
        </div>
      ) : null}
      <ProductImage product={product} />
      <CardHeader className="py-4">
        <CardTitle>{product.name}</CardTitle>
        <CardDescription>
          {product.category?.name ?? "Uden kategori"}
          {product.deletesAt
            ? ` · Slettes automatisk ${new Intl.DateTimeFormat("da-DK", { dateStyle: "long" }).format(product.deletesAt)}`
            : null}
        </CardDescription>
        <CardAction className="relative z-20 flex gap-1">
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
          >
            {product.status === "active" ? (
              <ArchiveIcon />
            ) : (
              <ArchiveRestoreIcon />
            )}
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
        </CardAction>
      </CardHeader>
    </Card>
  );
}

function CatalogSkeleton() {
  return (
    <div className="grid gap-5 min-[640px]:grid-cols-3 min-[1024px]:grid-cols-4 min-[1200px]:grid-cols-5 min-[1600px]:grid-cols-6 min-[1920px]:grid-cols-7 min-[2240px]:grid-cols-8">
      {Array.from({ length: 8 }, (_, index) => (
        <Card key={index} className="gap-4 py-0">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <CardHeader className="pb-4">
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
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Id<"products">[]>([]);
  const [bulkCategoryId, setBulkCategoryId] =
    useState<Id<"categories"> | null>(null);
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
    },
    { initialNumItems: 24 },
  );

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
          `/organization/products${catalogQuery(searchValue, status)}`,
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
      toast.error(messageFrom(error));
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
      toast.error(messageFrom(error));
    } finally {
      setIsDeleting(false);
    }
  }

  const loading = paginationStatus === "LoadingFirstPage";
  const currentResults = results as CatalogProduct[];

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

  function toggleStatus() {
    const nextStatus = status === "active" ? "archived" : "active";
    setSelectedIds([]);
    setBulkCategoryId(null);
    router.replace(
      `/organization/products${catalogQuery(searchValue, nextStatus)}`,
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
      toast.error(messageFrom(error));
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
      <div className="sticky top-16 z-30 -mx-4 bg-background px-4 py-3 md:top-24 md:py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative min-w-0 flex-1">
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={searchValue}
              onChange={(event) => changeSearch(event.target.value)}
              placeholder="Søg efter produkter"
              aria-label="Søg efter produkter eller kategorier"
              className="h-11 pl-10"
            />
          </div>
          <div className="flex flex-row flex-wrap items-center gap-3 md:flex-none">
            <Button
              type="button"
              variant={isSelectionMode ? "secondary" : "outline"}
              className="min-h-11 px-3"
              aria-pressed={isSelectionMode}
              onClick={toggleSelectionMode}
            >
              {isSelectionMode ? "Annullér valg" : "Vælg"}
            </Button>
            {isSelectionMode ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 px-3"
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
            <ProductImportExport
              status={status}
              onToggleStatus={toggleStatus}
            />
            <Button
              size="lg"
              className="min-h-11 px-4"
              onClick={() => router.push(newProductHref(search, status))}
            >
              <PlusIcon data-icon="inline-start" />
              Nyt produkt
            </Button>
          </div>
        </div>
      </div>

      {showSkeleton ? <CatalogSkeleton /> : null}

      {!loading && results.length === 0 ? (
        <Empty className="min-h-80 border">
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
                className="min-h-11 px-4"
                onClick={() => router.push(newProductHref(search, status))}
              >
                <PlusIcon data-icon="inline-start" />
                Nyt produkt
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : null}

      {!showSkeleton && displayedResults.length > 0 ? (
        <div className="grid gap-5 min-[640px]:grid-cols-3 min-[1024px]:grid-cols-4 min-[1200px]:grid-cols-5 min-[1600px]:grid-cols-6 min-[1920px]:grid-cols-7 min-[2240px]:grid-cols-8">
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
      ) : null}

      {paginationStatus === "CanLoadMore" ||
      paginationStatus === "LoadingMore" ? (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="lg"
            className="min-h-11 px-5"
            disabled={paginationStatus === "LoadingMore"}
            onClick={() => loadMore(24)}
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
                ? `${pendingProduct.name} forsvinder fra vælgerne for aktive produkter og ingredienser. Produktet slettes automatisk permanent efter 30 dage, medmindre det gendannes.`
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
              {pendingDeleteProduct?.name} og dets billede, enheder og opskrift
              slettes permanent. Produktet fjernes også som ingrediens fra andre
              opskrifter. Handlingen kan ikke fortrydes.
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
