"use client";

import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { getUserErrorMessage } from "@/lib/user-errors";

const gsSupply = api.integrations.gssupply.api;
const abCatering = api.integrations.abcatering.api;

export type SupplierCatalogId = "gssupply" | "abcatering";

/** Supplier integrations share catalog, link and ordering functions with the same signatures. */
export type SupplierCatalog = {
  id: SupplierCatalogId;
  name: string;
  api: {
    getSettings: typeof gsSupply.getSettings | typeof abCatering.getSettings;
    fetchCatalog: typeof gsSupply.fetchCatalog;
    listLinks: typeof gsSupply.listLinks;
    getProductLink: typeof gsSupply.getProductLink;
    setProductLink: typeof gsSupply.setProductLink;
    setCatalogLink: typeof gsSupply.setCatalogLink;
    createProductFromCatalog: typeof gsSupply.createProductFromCatalog;
    listOrderingLinks: typeof gsSupply.listOrderingLinks;
    // Only catalogs with product pictures.
    fetchCatalogImage: typeof gsSupply.fetchCatalogImage | null;
  };
};

export const supplierCatalogs: Record<SupplierCatalogId, SupplierCatalog> = {
  gssupply: { id: "gssupply", name: "GS Supply", api: gsSupply },
  abcatering: {
    id: "abcatering",
    name: "AB Catering",
    api: { ...abCatering, fetchCatalogImage: null },
  },
};

export type CatalogProduct = FunctionReturnType<
  typeof gsSupply.fetchCatalog
>[number];

/** Fetches the live catalog. `undefined` while loading, `null` after an error. */
export function useSupplierCatalog(catalog: SupplierCatalog | null) {
  const fetchCatalog = useAction(
    (catalog ?? supplierCatalogs.gssupply).api.fetchCatalog,
  );
  const [result, setResult] = useState<{
    id: SupplierCatalogId;
    products: CatalogProduct[] | null;
  }>();
  const [attempt, setAttempt] = useState(0);
  const id = catalog?.id;
  const name = catalog?.name;
  useEffect(() => {
    if (!id) return;
    let active = true;
    fetchCatalog({})
      .then((products) => {
        if (active) setResult({ id, products });
      })
      .catch((error) => {
        if (!active) return;
        setResult({ id, products: null });
        toast.error(
          getUserErrorMessage(
            error,
            `${name}-kataloget kunne ikke hentes. Prøv igen.`,
          ),
        );
      });
    return () => {
      active = false;
    };
  }, [id, name, fetchCatalog, attempt]);
  const reload = useCallback(() => {
    setResult(undefined);
    setAttempt((value) => value + 1);
  }, []);
  // Results from another catalog are ignored after a supplier switch.
  return {
    products: id && result?.id === id ? result.products : undefined,
    reload,
  };
}

export function catalogProductLabel(product: {
  productNumber: string;
  name: string;
}) {
  return `${product.productNumber} · ${product.name}`;
}
