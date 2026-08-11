import { Suspense } from "react";
import { ProductForm } from "@/components/catalog/product-form";

export default function NewProductPage() {
  return (
    <Suspense fallback={null}>
      <ProductForm />
    </Suspense>
  );
}
