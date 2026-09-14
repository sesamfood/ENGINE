import { FeatureToggle } from "@/components/organization/feature-toggle";
import { GoodsReceiptSettings } from "@/components/organization/goods-receipt-settings";

export default function AdministrationGoodsReceiptsPage() {
  return (
    <div className="flex flex-col gap-6">
      <FeatureToggle feature="goodsReceipts" />
      <GoodsReceiptSettings />
    </div>
  );
}
