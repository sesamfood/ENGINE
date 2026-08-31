import { Suspense } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { ProductForm } from "@/components/catalog/product-form";

export default async function EditAdministrationProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return (
    <Suspense fallback={null}>
      <ProductForm productId={productId as Id<"products">} />
    </Suspense>
  );
}
