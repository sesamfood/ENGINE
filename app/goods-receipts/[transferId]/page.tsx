import { TransferReceipt } from "@/components/goods-receipts/transfer-receipt";

export default async function GoodsReceiptTransferPage({
  params,
}: {
  params: Promise<{ transferId: string }>;
}) {
  const { transferId } = await params;
  return <TransferReceipt transferId={transferId} />;
}
