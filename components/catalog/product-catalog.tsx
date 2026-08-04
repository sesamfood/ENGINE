"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, usePaginatedQuery } from "convex/react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BoxesIcon,
  PackageOpenIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
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

type ProductStatus = "active" | "archived";
type CatalogProduct = {
  id: Id<"products">;
  name: string;
  status: ProductStatus;
  category: { id: Id<"categories">; name: string } | null;
  imageUrl: string | null;
  deletesAt: number | null;
};

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

function ProductImage({ product }: { product: CatalogProduct }) {
  if (product.imageUrl) {
    return (
      <div
        role="img"
        aria-label={`Produktbillede af ${product.name}`}
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
  onDelete,
}: {
  product: CatalogProduct;
  onArchive: (product: CatalogProduct) => void;
  onRestore: (product: CatalogProduct) => void;
  onDelete: (product: CatalogProduct) => void;
}) {
  return (
    <Card className="relative gap-0 py-0 transition-shadow hover:shadow-sm">
      <Link
        href={`/organization/products/${product.id}`}
        aria-label={`Rediger ${product.name}`}
        className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
      />
      <ProductImage product={product} />
      <CardHeader className="py-4">
        <CardTitle>{product.name}</CardTitle>
        <CardDescription>
          {product.category?.name ?? "Uden kategori"}
          {product.deletesAt
            ? ` · Slettes automatisk ${new Intl.DateTimeFormat("da-DK", { dateStyle: "long" }).format(product.deletesAt)}`
            : null}
        </CardDescription>
        <CardAction className="relative z-10 flex gap-1">
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
  const [status, setStatus] = useState<ProductStatus>("active");
  const [search, setSearch] = useState("");
  const [pendingProduct, setPendingProduct] = useState<CatalogProduct | null>(
    null,
  );
  const [pendingDeleteProduct, setPendingDeleteProduct] =
    useState<CatalogProduct | null>(null);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [querySearch, setQuerySearch] = useState("");
  const [visibleResults, setVisibleResults] = useState<CatalogProduct[]>([]);
  const archiveProduct = useMutation(api.catalog.archiveProduct);
  const restoreProduct = useMutation(api.catalog.restoreProduct);
  const deleteProduct = useMutation(api.catalog.deleteProduct);
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
    const timeout = window.setTimeout(() => setQuerySearch(search), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

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

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Søg efter produkter"
            aria-label="Søg efter produkter eller kategorier"
            className="h-11 pl-10"
          />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row md:flex-none">
          <Button
            variant="outline"
            className="min-h-11 px-3"
            onClick={() =>
              setStatus((current) =>
                current === "active" ? "archived" : "active",
              )
            }
          >
            {status === "active" ? (
              <ArchiveIcon data-icon="inline-start" />
            ) : (
              <ArchiveRestoreIcon data-icon="inline-start" />
            )}
            {status === "active"
              ? "Arkiverede produkter"
              : "Aktive produkter"}
          </Button>
          <Button
            size="lg"
            className="min-h-11 px-4"
            onClick={() => router.push("/organization/products/new")}
          >
            <PlusIcon data-icon="inline-start" />
            Nyt produkt
          </Button>
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
                onClick={() => router.push("/organization/products/new")}
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
              Annuller
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
              Annuller
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
