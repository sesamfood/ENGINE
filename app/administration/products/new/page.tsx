import { Suspense } from "react";
import { ProductForm } from "@/components/catalog/product-form";

export default function NewAdministrationProductPage() {
  return (
    <Suspense fallback={null}>
      <ProductForm />
    </Suspense>
  );
}
