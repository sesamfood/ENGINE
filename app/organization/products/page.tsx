import { Suspense } from "react";
import { ProductCatalog } from "@/components/catalog/product-catalog";

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductCatalog />
    </Suspense>
  );
}
