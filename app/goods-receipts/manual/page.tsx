import { ManualGoodsReceipt } from "@/components/goods-receipts/manual-goods-receipt";

export default async function ManualGoodsReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string | string[] }>;
}) {
  const { order } = await searchParams;
  return (
    <ManualGoodsReceipt
      orderId={typeof order === "string" ? order : undefined}
    />
  );
}
