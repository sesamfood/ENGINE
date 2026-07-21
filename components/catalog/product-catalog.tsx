"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BoxesIcon,
  EllipsisIcon,
  PackageOpenIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useDeferredValue, useState } from "react";
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
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  defaultUnit: { id: Id<"units">; name: string } | null;
  unitCount: number;
  ingredientCount: number;
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
  const router = useRouter();

  return (
    <Card className="gap-0 py-0 transition-shadow hover:shadow-sm">
      <ProductImage product={product} />
      <CardHeader className="pt-4">
        <CardTitle>{product.name}</CardTitle>
        <CardDescription>
          {product.category?.name ?? "Uncategorized"}
        </CardDescription>
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label={`Actions for ${product.name}`}
                />
              }
            >
              <EllipsisIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() =>
                    router.push(`/organization/products/${product.id}`)
                  }
                >
                  <PencilIcon />
                  Edit
                </DropdownMenuItem>
                {product.status === "active" ? (
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => onArchive(product)}
                  >
                    <ArchiveIcon />
                    Archive
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => onRestore(product)}>
                    <ArchiveRestoreIcon />
                    Restore
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">
            {product.defaultUnit?.name ?? "No default unit"}
          </Badge>
          {product.status === "archived" ? (
            <Badge variant="outline">Archived</Badge>
          ) : null}
        </div>
      </CardContent>
      <CardFooter className="justify-between text-xs text-muted-foreground">
        <span>
          {Math.max(0, product.unitCount - 1)} additional{" "}
          {product.unitCount - 1 === 1 ? "unit" : "units"}
        </span>
        <span>
          {product.ingredientCount}{" "}
          {product.ingredientCount === 1 ? "ingredient" : "ingredients"}
        </span>
      </CardFooter>
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
  const deferredSearch = useDeferredValue(search);
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
      search: deferredSearch,
    },
    { initialNumItems: 24 },
  );

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

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex max-w-2xl flex-col gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">Products</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Manage the ingredients and stock units used throughout the
            organization.
          </p>
        </div>
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs
            value={status}
            onValueChange={(value) => {
              setStatus(value as ProductStatus);
              setCategoryId("all");
            }}
          >
            <TabsList className="h-11 w-full p-1 sm:w-fit">
              <TabsTrigger value="active" className="min-w-28 px-5">
                Active
              </TabsTrigger>
              <TabsTrigger value="archived" className="min-w-28 px-5">
                Archived
              </TabsTrigger>
            </TabsList>
          </Tabs>
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
          <TabsList className="h-12 w-full justify-start overflow-x-auto rounded-xl p-1">
            <TabsTrigger value="all" className="min-w-28 px-5">
              All products
            </TabsTrigger>
            {categories?.map((category) => (
              <TabsTrigger
                key={category.id}
                value={category.id}
                className="min-w-28 px-5"
              >
                {category.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {loading ? <CatalogSkeleton /> : null}

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

      {!loading && results.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {(results as CatalogProduct[]).map((product) => (
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
