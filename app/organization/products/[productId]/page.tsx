import type { Id } from "@/convex/_generated/dataModel";
import { ProductForm } from "@/components/catalog/product-form";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return <ProductForm productId={productId as Id<"products">} />;
}
