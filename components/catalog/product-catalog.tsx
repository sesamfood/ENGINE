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
  SearchIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ProductStatus = "active" | "archived";
type CatalogProduct = {
  id: Id<"products">;
  name: string;
  status: ProductStatus;
  category: { id: Id<"categories">; name: string } | null;
  imageUrl: string | null;
};

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

function ProductImage({ product }: { product: CatalogProduct }) {
  if (product.imageUrl) {
    return (
      <div
        role="img"
        aria-label={`${product.name} product picture`}
        className="aspect-[4/3] w-full bg-muted bg-cover bg-center"
        style={{ backgroundImage: `url("${product.imageUrl}")` }}
      />
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
  onArchive,
  onRestore,
}: {
  product: CatalogProduct;
  onArchive: (product: CatalogProduct) => void;
  onRestore: (product: CatalogProduct) => void;
}) {
  return (
    <Card className="relative gap-0 py-0 transition-shadow hover:shadow-sm">
      <Link
        href={`/organization/products/${product.id}`}
        aria-label={`Edit ${product.name}`}
        className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      />
      <ProductImage product={product} />
      <CardHeader className="py-4">
        <CardTitle>{product.name}</CardTitle>
        <CardDescription>
          {product.category?.name ?? "Uncategorized"}
        </CardDescription>
        <CardAction className="relative z-10">
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="size-11"
            aria-label={`${product.status === "active" ? "Archive" : "Restore"} ${product.name}`}
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
        </CardAction>
      </CardHeader>
    </Card>
  );
}

function CatalogSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
  const [status, setStatus] = useState<ProductStatus>("active");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [pendingProduct, setPendingProduct] = useState<CatalogProduct | null>(
    null,
  );
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [querySearch, setQuerySearch] = useState("");
  const [visibleResults, setVisibleResults] = useState<CatalogProduct[]>([]);
  const categories = useQuery(api.catalog.listCategories);
  const archiveProduct = useMutation(api.catalog.archiveProduct);
  const restoreProduct = useMutation(api.catalog.restoreProduct);
  const {
    results,
    status: paginationStatus,
    loadMore,
  } = usePaginatedQuery(
    api.catalog.listProducts,
    {
      status,
      categoryId:
        categoryId === "all" ? undefined : (categoryId as Id<"categories">),
      search: querySearch,
    },
    { initialNumItems: 24 },
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => setQuerySearch(search), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  async function confirmStatusChange() {
    if (!pendingProduct) return;
    setIsChangingStatus(true);
    try {
      if (pendingProduct.status === "active") {
        await archiveProduct({ productId: pendingProduct.id });
        toast.success(`${pendingProduct.name} archived`);
      } else {
        await restoreProduct({ productId: pendingProduct.id });
        toast.success(`${pendingProduct.name} restored`);
      }
      setPendingProduct(null);
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setIsChangingStatus(false);
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

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button
          variant="outline"
          className="min-h-11 px-3"
          onClick={() => {
            setStatus((current) =>
              current === "active" ? "archived" : "active",
            );
            setCategoryId("all");
          }}
        >
          {status === "active" ? (
            <ArchiveIcon data-icon="inline-start" />
          ) : (
            <ArchiveRestoreIcon data-icon="inline-start" />
          )}
          {status === "active" ? "Archived products" : "Active products"}
        </Button>
        <Button
          size="lg"
          className="min-h-11 px-4"
          onClick={() => router.push("/organization/products/new")}
        >
          <PlusIcon data-icon="inline-start" />
          New product
        </Button>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex justify-end">
          <div className="relative w-full lg:max-w-sm">
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products"
              aria-label="Search products"
              className="h-11 pl-10"
            />
          </div>
        </div>

        <Tabs value={categoryId} onValueChange={setCategoryId}>
          <TabsList
            aria-label="Product categories"
            className="h-14 w-full justify-start overflow-x-auto"
          >
            <TabsTrigger value="all" className="min-w-36 px-6">
              All products
            </TabsTrigger>
            {categories?.map((category) => (
              <TabsTrigger
                key={category.id}
                value={category.id}
                className="min-w-36 px-6"
              >
                {category.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
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
                ? "No products found"
                : "No archived products"}
            </EmptyTitle>
            <EmptyDescription>
              {search || categoryId !== "all"
                ? "Try another search or category."
                : "Create the first product to start building your organization catalog."}
            </EmptyDescription>
          </EmptyHeader>
          {status === "active" && !search && categoryId === "all" ? (
            <EmptyContent>
              <Button
                className="min-h-11 px-4"
                onClick={() => router.push("/organization/products/new")}
              >
                <PlusIcon data-icon="inline-start" />
                New product
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : null}

      {!showSkeleton && displayedResults.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {displayedResults.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onArchive={setPendingProduct}
              onRestore={setPendingProduct}
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
            Load more
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
                ? "Archive product?"
                : "Restore product?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingProduct?.status === "active"
                ? `${pendingProduct.name} will disappear from active product and ingredient pickers. Existing recipes will keep their reference.`
                : `${pendingProduct?.name} will return to the active catalog and ingredient pickers.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isChangingStatus}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant={
                pendingProduct?.status === "active" ? "destructive" : "default"
              }
              disabled={isChangingStatus}
              onClick={confirmStatusChange}
            >
              {isChangingStatus ? <Spinner data-icon="inline-start" /> : null}
              {pendingProduct?.status === "active" ? "Archive" : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
