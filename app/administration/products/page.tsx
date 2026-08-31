import { Suspense } from "react";
import { ProductCatalog } from "@/components/catalog/product-catalog";

export default function AdministrationProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductCatalog />
    </Suspense>
  );
}
