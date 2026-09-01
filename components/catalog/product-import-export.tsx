"use client";

import { getUserErrorMessage } from "@/lib/user-errors";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useConvex, useMutation } from "convex/react";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  UploadIcon,
} from "lucide-react";
import { useRef, useState } from "react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldTitle } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type {
  ParsedProductArchive,
  ProductExportRow,
} from "@/lib/product-archive";

type ProductStatus = "active" | "archived";

export function ProductImportExport({
  status,
  onToggleStatus,
}: {
  status: ProductStatus;
  onToggleStatus: () => void;
}) {
  const convex = useConvex();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archive, setArchive] = useState<ParsedProductArchive | null>(null);
  const [archiveName, setArchiveName] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [conflictMode, setConflictMode] = useState<"skip" | "overwrite">(
    "skip",
  );
  const importProduct = useMutation(api.catalog.importProduct);
  const importIngredients = useMutation(api.catalog.importProductIngredients);
  const generateUploadUrl = useMutation(
    api.catalog.generateProductImageUploadUrl,
  );
  const setProductImage = useMutation(api.catalog.setProductImage);
  const removeProductImage = useMutation(api.catalog.removeProductImage);
  const archiveProduct = useMutation(api.catalog.archiveProduct);
  const restoreProduct = useMutation(api.catalog.restoreProduct);

  async function exportProducts() {
    setIsExporting(true);
    try {
      const {
        createProductArchive,
        downloadProductArchive,
        MAX_PRODUCTS,
      } = await import("@/lib/product-archive");
      const products: ProductExportRow[] = [];
      let cursor: string | null = null;
      let done = false;
      while (!done) {
        const result: {
          page: ProductExportRow[];
          continueCursor: string;
          isDone: boolean;
        } = await convex.query(api.catalog.exportProducts, {
          paginationOpts: { cursor, numItems: 25 },
        });
        products.push(...result.page);
        if (products.length > MAX_PRODUCTS) {
          throw new Error(`Eksporten kan højst indeholde ${MAX_PRODUCTS.toLocaleString("da-DK")} produkter`);
        }
        cursor = result.continueCursor;
        done = result.isDone;
      }
      downloadProductArchive(await createProductArchive(products));
      toast.success(`${products.length} produkter er eksporteret`);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Produktfilen kunne ikke behandles. Prøv igen."));
    } finally {
      setIsExporting(false);
    }
  }

  async function selectArchive(file: File) {
    setIsReading(true);
    try {
      const { readProductArchive } = await import("@/lib/product-archive");
      setArchive(await readProductArchive(file));
      setArchiveName(file.name);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Produktfilen kunne ikke behandles. Prøv igen."));
    } finally {
      setIsReading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function openImport() {
    inputRef.current?.click();
  }

  async function uploadImage(
    productId: Id<"products">,
    path: string,
    parsedArchive: ParsedProductArchive,
  ) {
    const { archiveImageBlob } = await import("@/lib/product-archive");
    const image = archiveImageBlob(path, parsedArchive.files);
    const uploadUrl = await generateUploadUrl({});
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": image.type },
      body: image,
    });
    if (!response.ok) throw new Error("Et produktbillede kunne ikke uploades");
    const result = (await response.json()) as { storageId?: unknown };
    if (typeof result.storageId !== "string") {
      throw new Error("Billeduploaden returnerede et ugyldigt svar");
    }
    await setProductImage({
      productId,
      storageId: result.storageId as Id<"_storage">,
    });
  }

  async function confirmImport() {
    if (!archive) return;
    setIsImporting(true);
    const productIds = new Map<
      string,
      {
        productId: Id<"products">;
        status: "created" | "skipped" | "overwritten";
      }
    >();
    let createdCount = 0;
    let overwrittenCount = 0;
    let processedCount = 0;
    let imageFailures = 0;
    let recipeFailures = 0;
    let statusFailures = 0;

    try {
      for (const [index, product] of archive.manifest.products.entries()) {
        setProgress(
          `Behandler produkter ${index + 1} af ${archive.manifest.products.length}`,
        );
        const maxTemperature =
          archive.manifest.version === 2 &&
          "maxTemperatureCelsius" in product
            ? { maxTemperatureCelsius: product.maxTemperatureCelsius }
            : {};
        const result = await importProduct({
          name: product.name,
          category: product.category,
          units: product.units,
          overwrite: conflictMode === "overwrite",
          ...maxTemperature,
        });
        productIds.set(product.sourceId, result);
        processedCount += 1;
        if (result.status === "skipped") continue;
        if (result.status === "created") createdCount += 1;
        if (result.status === "overwritten") overwrittenCount += 1;
        if (product.image) {
          try {
            await uploadImage(result.productId, product.image, archive);
          } catch {
            imageFailures += 1;
          }
        } else if (result.status === "overwritten") {
          try {
            await removeProductImage({ productId: result.productId });
          } catch {
            imageFailures += 1;
          }
        }
      }

      const importedProducts = archive.manifest.products.filter(
        (product) => productIds.get(product.sourceId)?.status !== "skipped",
      );
      for (const [index, product] of importedProducts.entries()) {
        setProgress(
          `Importerer opskrifter ${index + 1} af ${importedProducts.length}`,
        );
        const destination = productIds.get(product.sourceId)!;
        try {
          await importIngredients({
            productId: destination.productId,
            ingredients: product.ingredients.map((ingredient) => ({
              productId: productIds.get(ingredient.sourceProductId)!.productId,
              quantity: ingredient.quantity,
              unitName: ingredient.unit,
            })),
          });
        } catch {
          recipeFailures += 1;
        }
      }

      for (const product of importedProducts) {
        try {
          const productId = productIds.get(product.sourceId)!.productId;
          if (product.status === "archived") {
            await archiveProduct({ productId });
          } else {
            await restoreProduct({ productId });
          }
        } catch {
          statusFailures += 1;
        }
      }

      const skippedCount =
        archive.manifest.products.length - createdCount - overwrittenCount;
      toast.success(
        `${createdCount} oprettet${overwrittenCount ? ` · ${overwrittenCount} overskrevet` : ""}${skippedCount ? ` · ${skippedCount} sprunget over` : ""}`,
      );
      const failures = imageFailures + recipeFailures + statusFailures;
      if (failures) {
        toast.warning(
          `${failures} dele kunne ikke importeres (${imageFailures} billeder, ${recipeFailures} opskrifter, ${statusFailures} arkivstatusser)`,
        );
      }
      setArchive(null);
    } catch (error) {
      toast.error(
        processedCount
          ? `${processedCount} produkter blev behandlet, før importen stoppede: ${getUserErrorMessage(error, "Produktfilen kunne ikke behandles. Prøv igen.")}`
          : getUserErrorMessage(error, "Produktfilen kunne ikke behandles. Prøv igen."),
      );
    } finally {
      setProgress("");
      setIsImporting(false);
    }
  }

  const imageCount =
    archive?.manifest.products.filter((product) => product.image).length ?? 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              className="size-11"
              aria-label="Flere handlinger"
            />
          }
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuItem
              disabled={isExporting || isImporting}
              onClick={() => void exportProducts()}
            >
              {isExporting ? <Spinner /> : <DownloadIcon />}
              Eksportér
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isReading || isImporting}
              onClick={openImport}
            >
              {isReading ? <Spinner /> : <UploadIcon />}
              Importér
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={onToggleStatus}>
              {status === "active" ? (
                <ArchiveIcon />
              ) : (
                <ArchiveRestoreIcon />
              )}
              {status === "active"
                ? "Arkiverede produkter"
                : "Aktive produkter"}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        aria-label="Vælg ZIP-fil med produkter"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void selectArchive(file);
        }}
      />

      <AlertDialog
        open={Boolean(archive)}
        onOpenChange={(open) => {
          if (!open && !isImporting) setArchive(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Importér produkter?</AlertDialogTitle>
            <AlertDialogDescription>
              {archiveName} indeholder {archive?.manifest.products.length ?? 0}{" "}
              {(archive?.manifest.products.length ?? 0) === 1
                ? "produkt"
                : "produkter"}{" "}
              og {imageCount} {imageCount === 1 ? "billede" : "billeder"}.
              Manglende kategorier og enheder oprettes automatisk.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldTitle>Produkter med samme navn</FieldTitle>
            <ToggleGroup
              value={[conflictMode]}
              variant="outline"
              spacing={0}
              className="w-full"
              aria-label="Vælg håndtering af produkter med samme navn"
              onValueChange={(value) => {
                const next = value[0];
                if (next === "skip" || next === "overwrite") {
                  setConflictMode(next);
                }
              }}
            >
              <ToggleGroupItem value="skip" className="min-h-11 flex-1">
                Spring over
              </ToggleGroupItem>
              <ToggleGroupItem value="overwrite" className="min-h-11 flex-1">
                Overskriv
              </ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>
              {conflictMode === "overwrite"
                ? "Importen erstatter produktdata og billeder. Lager og opskrifter omregnes til de importerede enheder."
                : "Eksisterende produkter beholdes uden ændringer."}
            </FieldDescription>
          </Field>
          {progress ? (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {progress}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isImporting}>
              Annullér
            </AlertDialogCancel>
            <AlertDialogAction disabled={isImporting} onClick={confirmImport}>
              {isImporting ? <Spinner data-icon="inline-start" /> : null}
              Importér
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
